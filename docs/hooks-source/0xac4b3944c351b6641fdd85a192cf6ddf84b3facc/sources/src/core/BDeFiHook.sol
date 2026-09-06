// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {Common} from "@utils/Common.sol";
import {IBDeFiHook} from "@interfaces/IBDeFiHook.sol";
import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {TruncatedGeoOracle} from "@libs/oracle/TruncatedGeoOracle.sol";

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {
    toBeforeSwapDelta,
    BeforeSwapDelta,
    BeforeSwapDeltaLibrary
} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {Currency, CurrencyLibrary} from "@uniswap/v4-core/src/types/Currency.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";

import {IBDeFiCore} from "@interfaces/IBDeFiCore.sol";
import {IBDeFiConfig} from "@interfaces/IBDeFiConfig.sol";
import {IBDeFiLpManager} from "@interfaces/IBDeFiLpManager.sol";
import {IBDeFiLpManagerTypes} from "@interfaces/IBDeFiLpManagerTypes.sol";
import {IBDeFiLeaderboard} from "@interfaces/IBDeFiLeaderboard.sol";
import {IBDeFiSwapHandler} from "@interfaces/IBDeFiSwapHandler.sol";

import {HookLibrary} from "@libs/HookLibrary.sol";

import "@types/PoolInfo.sol";
import {BDeFiContractNames} from "@const/BDeFiContractNames.sol";
import {BDeFiConfigNames} from "@const/BDeFiConfigNames.sol";

/// @title BDeFiHook
/// @notice Hook contract responsible for Trading Fees Fulfillment and Buy/Sell Tax processing.
contract BDeFiHook is IBDeFiHook, BaseHook, Common, TruncatedGeoOracle {
    using SafeERC20 for IERC20;

    /*//////////////////////////////////////////////////////////////
                              STORAGE
    //////////////////////////////////////////////////////////////*/
    /// @notice BuilDeFi core registry contract.
    IBDeFiCore bdefiCore;

    /// @notice Are all LPs for the token initialized
    /// @dev No trading is allowed before all LPs are initialized to preserve the price ratio
    mapping(address token => bool) public fullyInitialized;

    /// @notice Last trade timestamps per token (used for CTO).
    mapping(address token => uint256) public lastTradedTs;

    /// @notice Stores the total fees available for the platform genesis
    mapping(address token => uint256) public genesisFulfillmentAmounts;

    /// @notice Stores claimable ETH for each receiver
    /// @dev Required due to fulfilment logic running before settlement
    mapping(address receiver => uint256) public claimableEth;

    /// @notice Stores the fees queue for each token
    mapping(address token => FeesQueueItem[]) internal _tokenFulfillmentQueue;

    /*//////////////////////////////////////////////////////////////
                              MODIFIERS
    //////////////////////////////////////////////////////////////*/
    modifier onlyOperator() {
        _onlyOperator();
        _;
    }

    modifier onlyLpManager() {
        _onlyLpManager();
        _;
    }

    /*//////////////////////////////////////////////////////////////
                            CONSTRUCTOR
    //////////////////////////////////////////////////////////////*/
    /// @notice Constructor for the BDeFiHook contract
    /// @param _poolManager Uniswap's Pool Manager contract
    /// @param _bdefiCore The BuilDeFi Core contract
    constructor(IPoolManager _poolManager, IBDeFiCore _bdefiCore)
        BaseHook(_poolManager)
        TruncatedGeoOracle(_poolManager)
    {
        _nonZeroAddress(address(_poolManager));
        _nonZeroAddress(address(_bdefiCore));
        bdefiCore = _bdefiCore;
    }

    /*//////////////////////////////////////////////////////////////
                             PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Accepts ETH transfers from protocol flows.
    receive() external payable {}

    /// @notice Claims accumulated ETH fees for caller.
    function claimFees() external {
        uint256 ethAmount = claimableEth[msg.sender];
        if (ethAmount == 0) revert Common__ZeroValue();
        claimableEth[msg.sender] = 0;
        _safeEthTransfer(msg.sender, ethAmount);
    }

    /// @notice Pushes a receiver's accumulated ETH fees to that receiver.
    /// @dev Permissionless — funds only ever move to the address that owns them. Covers
    /// receivers that cannot call `claimFees` themselves. The leaderboard settles via
    /// `pullEth`, not here.
    /// @param receiver Address whose claimable balance is paid out
    function claimFeesFor(address receiver) external {
        uint256 ethAmount = claimableEth[receiver];
        if (ethAmount == 0) revert Common__ZeroValue();
        claimableEth[receiver] = 0;
        _safeEthTransfer(receiver, ethAmount);
    }

    /*//////////////////////////////////////////////////////////////
                           OPERATOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Processes external token fulfillment by swapping token to ETH and distributing proceeds.
    /// @param token External token address to swap
    /// @param fulfilmentAmount Token amount to fulfill
    /// @param reimbursement ETH reimbursement for operator execution
    /// @param minAmountOutV4 Minimum output for V4 route
    /// @param minAmountOutV3 Minimum output for V3 route
    /// @param deadline Swap deadline timestamp
    function processExternalToken(
        address token,
        uint256 fulfilmentAmount,
        uint256 reimbursement,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        uint256 deadline
    ) external onlyOperator {
        if (fulfilmentAmount == 0) revert Common__ZeroValue();

        address swapHandler = bdefiCore.getContract(BDeFiContractNames.SWAP_HANDLER);
        IERC20(token).forceApprove(swapHandler, fulfilmentAmount);

        uint256 ethAmount = IBDeFiSwapHandler(swapHandler)
            .swapExternalTokenToEth(token, fulfilmentAmount, minAmountOutV4, minAmountOutV3, address(this), deadline);

        _checkReimbursement(ethAmount, reimbursement);
        ethAmount -= reimbursement;

        uint256 totalAmountFulfilled;
        uint256 totalEthDistributed;

        address leaderboard = bdefiCore.getContract(BDeFiContractNames.LEADERBOARD);

        (uint256 tokenFulfilledGenesis, uint256 ethDistributedGenesis) =
            _externalFulfillFromGenesisFees(token, fulfilmentAmount, ethAmount);

        totalAmountFulfilled += tokenFulfilledGenesis;
        totalEthDistributed += ethDistributedGenesis;

        uint256 remaining = fulfilmentAmount - tokenFulfilledGenesis;
        if (remaining > 0) {
            (uint256 tokenFulfilledQueue, uint256 ethDistributedQueue) =
                _externalFulfillFromQueue(token, fulfilmentAmount, remaining, ethAmount, IBDeFiLeaderboard(leaderboard));

            totalAmountFulfilled += tokenFulfilledQueue;
            totalEthDistributed += ethDistributedQueue;
        }

        if (totalAmountFulfilled != fulfilmentAmount) revert BDeFiHook__InvalidFulfillmentAmount();

        _safeEthTransfer(operator(), reimbursement);

        if (totalEthDistributed < ethAmount) {
            IBDeFiLeaderboard(leaderboard).depositToPool{value: ethAmount - totalEthDistributed}(ETH);
        }
    }

    /*//////////////////////////////////////////////////////////////
                            PROTOCOL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Updates last traded timestamp for token (used by CTO logic).
    /// @param token Token address
    function updateLastTradedTimestamp(address token) external {
        if (msg.sender != address(bdefiCore)) revert Common__Unauthorized();
        lastTradedTs[token] = block.timestamp;
    }

    /// @notice Adds fee amount into fulfillment accounting for a token.
    /// @param token Token address whose fees are being queued/accounted
    /// @param receiver Receiver associated with this fee entry
    /// @param amount Fee amount to add
    /// @param isForLeaderboard True if amount belongs to leaderboard accounting
    /// @param isForGenesis True if amount should accrue to genesis instead of queue
    function addToFulfillmentQueue(
        address token,
        address receiver,
        uint256 amount,
        bool isForLeaderboard,
        bool isForGenesis
    ) external onlyLpManager {
        // ETH settles directly and never queues; zero entries only waste queue slots.
        if (token == ETH) revert BDeFiHook__InvalidFulfillmentToken();
        if (amount == 0) revert Common__ZeroValue();

        if (isForGenesis) {
            genesisFulfillmentAmounts[token] += amount;
        } else {
            _tokenFulfillmentQueue[token].push(
                FeesQueueItem({receiver: receiver, isLeaderboard: isForLeaderboard, amount: amount})
            );
        }
    }

    /// @notice Pulls ETH from hook balance to leaderboard contract.
    /// @param amount ETH amount to transfer
    function pullEth(uint256 amount) external {
        if (msg.sender != bdefiCore.getContract(BDeFiContractNames.LEADERBOARD)) revert Common__Unauthorized();
        _safeEthTransfer(msg.sender, amount);
    }

    /*//////////////////////////////////////////////////////////////
                             ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Claims fees allocated to protocol genesis.
    /// @param token Token address to claim
    /// @dev Zero address is reserved for native ETH fees.
    function claimGenesis(address token) external {
        address genesis = _bdefiConfig().protocolGenesis();
        if (msg.sender != genesis) revert Common__Unauthorized();
        uint256 amount = genesisFulfillmentAmounts[token];
        if (amount == 0) revert Common__ZeroValue();
        genesisFulfillmentAmounts[token] = 0;
        if (token == ETH) {
            _safeEthTransfer(genesis, amount);
        } else {
            IERC20(token).safeTransfer(genesis, amount);
        }
    }

    /*//////////////////////////////////////////////////////////////
                              VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @inheritdoc BaseHook
    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: true,
            beforeAddLiquidity: true,
            beforeRemoveLiquidity: true,
            afterAddLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true,
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    /// @notice Returns token fulfillment amount currently processable for a token.
    /// @param token Token address
    /// @return totalAmount Sum of genesis amount and queue amount up to processing limit
    function getTokenFulfillmentAmount(address token) external view returns (uint256 totalAmount) {
        totalAmount += genesisFulfillmentAmounts[token];
        uint256 queueProcessLimit = _getQueueProcessLimit();
        FeesQueueItem[] storage queue = _tokenFulfillmentQueue[token];
        uint256 queueLength = queue.length;

        uint256 processingSize = queueLength > queueProcessLimit ? queueProcessLimit : queueLength;

        for (uint256 i = 0; i < processingSize; i++) {
            totalAmount += queue[queueLength - 1 - i].amount;
        }
    }

    /// @notice Returns fulfillment queue snapshot for a token.
    /// @param token Token address
    /// @return queue Fulfillment queue entries
    function getTokenFulfillmentQueue(address token) external view returns (FeesQueueItem[] memory) {
        return _tokenFulfillmentQueue[token];
    }

    /// @notice Returns configured hook operator address.
    /// @return hookOperator Operator address for hook operations
    function operator() public view returns (address) {
        return bdefiCore.getOperator(BDeFiContractNames.HOOK);
    }

    /*//////////////////////////////////////////////////////////////
                              HOOK FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @inheritdoc BaseHook
    function _beforeInitialize(address sender, PoolKey calldata, uint160) internal virtual override returns (bytes4) {
        if (sender != bdefiCore.getContract(BDeFiContractNames.LP_MANAGER)) {
            revert Common__Unauthorized();
        }

        return this.beforeInitialize.selector;
    }

    /// @inheritdoc BaseHook
    function _afterInitialize(address sender, PoolKey calldata key, uint160, int24 tick)
        internal
        override
        returns (bytes4)
    {
        // TruncatedGeoOracle tracking
        _afterInitialize(key, tick);

        (bool initialized, address token) = IBDeFiLpManager(sender).isTokenFullyInitialized(key.toId());
        if (initialized) {
            fullyInitialized[token] = true;
            lastTradedTs[token] = block.timestamp;
        }

        return this.afterInitialize.selector;
    }

    /// @inheritdoc BaseHook
    function _beforeAddLiquidity(address, PoolKey calldata _key, ModifyLiquidityParams calldata, bytes calldata)
        internal
        override
        returns (bytes4)
    {
        // TruncatedGeoOracle tracking
        _beforeModifyPosition(_key);
        return this.beforeAddLiquidity.selector;
    }

    /// @inheritdoc BaseHook
    function _beforeRemoveLiquidity(
        address,
        PoolKey calldata key,
        ModifyLiquidityParams calldata params,
        bytes calldata
    ) internal override returns (bytes4) {
        if (params.liquidityDelta < 0) {
            // TruncatedGeoOracle tracking
            _beforeModifyPosition(key);
        }
        return this.beforeRemoveLiquidity.selector;
    }

    /// @inheritdoc BaseHook
    function _beforeSwap(address, PoolKey calldata poolKey, SwapParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // TruncatedGeoOracle tracking
        _beforeSwap(poolKey);
        PoolId poolId = poolKey.toId();

        PoolCoreInfo memory poolCoreInfo =
            IBDeFiLpManager(bdefiCore.getContract(BDeFiContractNames.LP_MANAGER)).getPoolCoreInfo(poolId);

        if (!fullyInitialized[poolCoreInfo.token]) revert BDeFiHook__TokenNotFullyInitialized();
        uint256 lookbackTime = _bdefiConfig().getPoolLookbackConfig(poolId);
        lastTradedTs[poolCoreInfo.token] = block.timestamp;

        // Apply buy/sell tax if needed
        int256 specifiedDelta;
        int256 unspecifiedDelta;

        specifiedDelta = _applyBuySellTax(params, poolKey, BalanceDelta.wrap(0), true);

        // if pool observations are missing, skip fulfillment
        if (HookLibrary.isObservationMissing(poolKey, lookbackTime)) {
            return (this.beforeSwap.selector, toBeforeSwapDelta(int128(specifiedDelta), 0), 0);
        }

        // If user is buying the token, try to fulfill from collected fees first
        if (poolCoreInfo.isParentToken0 == params.zeroForOne) {
            if (params.amountSpecified < 0) {
                uint160 twapSqrtPriceX96 = HookLibrary.getTwapSqrtPriceX96(poolKey, uint32(lookbackTime));
                (specifiedDelta, unspecifiedDelta) = _processInternalTokenFulfillment(
                    specifiedDelta, unspecifiedDelta, params.amountSpecified, twapSqrtPriceX96, poolCoreInfo
                );
            }
        }

        return (this.beforeSwap.selector, toBeforeSwapDelta(int128(specifiedDelta), int128(unspecifiedDelta)), 0);
    }

    /// @inheritdoc BaseHook
    function _afterSwap(
        address,
        PoolKey calldata _key,
        SwapParams calldata _params,
        BalanceDelta _delta,
        bytes calldata
    ) internal override returns (bytes4 selector_, int128 hookDeltaUnspecified_) {
        hookDeltaUnspecified_ = int128(_applyBuySellTax(_params, _key, _delta, false));
        return (this.afterSwap.selector, hookDeltaUnspecified_);
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _onlyOperator() internal view {
        if (msg.sender != operator()) revert Common__Unauthorized();
    }

    function _bdefiConfig() internal view returns (IBDeFiConfig) {
        return IBDeFiConfig(bdefiCore.getContract(BDeFiContractNames.CONFIG));
    }

    function _getQueueProcessLimit() internal view returns (uint256) {
        return _bdefiConfig().uint256Values(BDeFiConfigNames.FEE_QUEUE_PROCESS_LIMIT);
    }

    function _onlyLpManager() internal view {
        if (msg.sender != bdefiCore.getContract(BDeFiContractNames.LP_MANAGER)) revert Common__Unauthorized();
    }

    function _checkReimbursement(uint256 amount, uint256 reimburseAmount) internal view {
        uint16 maxReimburseBps = _bdefiConfig().uint16Values(BDeFiConfigNames.BPS_MAX_OPERATOR_REIMBURSE);
        uint256 maxAllowed = _applyBps(amount, maxReimburseBps);
        if (reimburseAmount > maxAllowed) revert BDeFiHook__MaxReimbursementExceeded(maxAllowed);
    }

    /// @notice Applies buy/sell tax on swap
    /// @param params The swap parameters
    /// @param poolKey The pool key
    /// @param balanceDelta The balance delta from the swap
    /// @param isBeforeSwap Whether the tax is being applied before or after the swap
    /// @return delta The delta to be applied to the swap
    function _applyBuySellTax(
        SwapParams calldata params,
        PoolKey calldata poolKey,
        BalanceDelta balanceDelta,
        bool isBeforeSwap
    ) internal returns (int256) {
        (int256 delta, Currency taxCurrency) = HookLibrary.getBuySellTaxDelta(
            bdefiCore, params, poolKey, balanceDelta, isBeforeSwap
        );
        if (delta != 0) {
            poolManager.take(taxCurrency, bdefiCore.getContract(BDeFiContractNames.TAX_DISTRIBUTOR), uint256(delta));
        }
        return delta;
    }

    /// @dev Fulfillment logic is skipped if the swap is exact output (amountSpecified > 0)
    function _processInternalTokenFulfillment(
        int256 oldSpecifiedDelta,
        int256 oldUnspecifiedDelta,
        int256 amountSpecified,
        uint160 twapSqrtPriceX96,
        PoolCoreInfo memory poolCoreInfo
    ) internal returns (int256 specifiedDelta, int256 unspecifiedDelta) {
        specifiedDelta = oldSpecifiedDelta;
        unspecifiedDelta = oldUnspecifiedDelta;

        uint256 fulfilmentAmount = HookLibrary.getQuoteForSqrtRatioX96(
            twapSqrtPriceX96, uint256(-(amountSpecified + specifiedDelta)), poolCoreInfo.parentToken, poolCoreInfo.token
        );

        // When the parent's pools live on a different hook, the converted entries (and the parent
        // tokens backing them) must land there — buffer them and relay in one batch after
        // `poolManager.take` below. ETH parents settle locally and need no lookup.
        ForwardBuffer memory buffer;
        if (poolCoreInfo.parentToken != ETH) {
            address parentHook = bdefiCore.getTokenHook(poolCoreInfo.parentToken);
            if (parentHook != address(this)) {
                buffer.hook = parentHook;
                buffer.items = new IBDeFiLpManagerTypes.FulfillmentForward[](_getQueueProcessLimit() + 1);
            }
        }

        (uint256 parentAmountIn, uint256 tokenFulfilled) = _internalFulfillFromGenesisFees(
            fulfilmentAmount, twapSqrtPriceX96, poolCoreInfo.token, poolCoreInfo.parentToken, buffer
        );

        fulfilmentAmount -= tokenFulfilled;

        if (fulfilmentAmount > 0) {
            (uint256 queueParentAmountIn, uint256 queueTokenFulfilled) = _internalFulfillFromQueue(
                fulfilmentAmount, twapSqrtPriceX96, poolCoreInfo.token, poolCoreInfo.parentToken, buffer
            );
            parentAmountIn += queueParentAmountIn;
            tokenFulfilled += queueTokenFulfilled;
        }

        if (tokenFulfilled > 0) {
            // settle token
            Currency tokenCurrency = Currency.wrap(poolCoreInfo.token);
            poolManager.sync(tokenCurrency);
            tokenCurrency.transfer(address(poolManager), tokenFulfilled);
            poolManager.settle();

            // take parent
            poolManager.take(Currency.wrap(poolCoreInfo.parentToken), address(this), parentAmountIn);

            // Earliest point the contract holds the parent tokens; a relay failure reverts the swap.
            _flushForwardBuffer(poolCoreInfo.parentToken, buffer);

            // update deltas
            specifiedDelta = specifiedDelta + int256(parentAmountIn);
            unspecifiedDelta = -int256(tokenFulfilled);
        }
    }

    /// @dev Hands buffered entries to the hook that owns `parentToken`'s LP: the ERC20 moves
    /// directly, the bookkeeping is relayed through the LP manager (the only caller
    /// `addToFulfillmentQueue` accepts).
    function _flushForwardBuffer(address parentToken, ForwardBuffer memory buffer) internal {
        uint256 count = buffer.count;
        if (count == 0) return;

        // Truncate to the used prefix before ABI-encoding.
        IBDeFiLpManagerTypes.FulfillmentForward[] memory items = buffer.items;
        assembly {
            mstore(items, count)
        }

        IERC20(parentToken).safeTransfer(buffer.hook, buffer.total);
        IBDeFiLpManager(bdefiCore.getContract(BDeFiContractNames.LP_MANAGER)).forwardToHookQueue(parentToken, items);
    }

    function _internalFulfillFromGenesisFees(
        uint256 fulfilmentAmount,
        uint160 twapSqrtPrice,
        address token,
        address parentToken,
        ForwardBuffer memory buffer
    ) internal returns (uint256 parentAmountIn, uint256 tokenFulfilled) {
        uint256 totalAvailable = genesisFulfillmentAmounts[token];
        if (totalAvailable == 0) return (0, 0);

        tokenFulfilled = totalAvailable > fulfilmentAmount ? fulfilmentAmount : totalAvailable;
        parentAmountIn = HookLibrary.getQuoteForSqrtRatioX96(twapSqrtPrice, tokenFulfilled, token, parentToken);

        genesisFulfillmentAmounts[token] -= tokenFulfilled;

        // Genesis cascades down the parent chain like the queue does.
        if (buffer.items.length != 0) {
            _bufferForward(buffer, address(0), parentAmountIn, false, true);
        } else {
            genesisFulfillmentAmounts[parentToken] += parentAmountIn;
        }

        emit GenesisFeesFulfilled(token, tokenFulfilled);
    }

    function _internalFulfillFromQueue(
        uint256 fulfilmentAmount,
        uint160 twapSqrtPrice,
        address token,
        address parentToken,
        ForwardBuffer memory buffer
    ) internal returns (uint256 parentAmountIn, uint256 tokenFulfilled) {
        FeesQueueItem[] storage queue = _tokenFulfillmentQueue[token];
        if (queue.length == 0) return (0, 0);

        IBDeFiLeaderboard leaderboard = IBDeFiLeaderboard(bdefiCore.getContract(BDeFiContractNames.LEADERBOARD));
        uint256 processedItems;
        uint256 queueProcessLimit = _getQueueProcessLimit();

        while (queue.length > 0 && processedItems < queueProcessLimit && fulfilmentAmount > 0) {
            FeesQueueItem storage feeData = queue[queue.length - 1];

            uint256 fillAmount = feeData.amount > fulfilmentAmount ? fulfilmentAmount : feeData.amount;

            uint256 parentAmountOut = HookLibrary.getQuoteForSqrtRatioX96(twapSqrtPrice, fillAmount, token, parentToken);

            _addToFulfillmentQueue(
                parentToken, feeData.receiver, feeData.isLeaderboard, parentAmountOut, leaderboard, buffer
            );

            tokenFulfilled += fillAmount;
            parentAmountIn += parentAmountOut;
            fulfilmentAmount -= fillAmount;

            if (fillAmount == feeData.amount) {
                queue.pop();
            } else {
                feeData.amount -= fillAmount;
            }

            unchecked {
                processedItems++;
            }
        }

        emit FeesFulfilled(token, tokenFulfilled);
    }

    function _externalFulfillFromGenesisFees(address token, uint256 fulfilmentAmount, uint256 ethAmount)
        internal
        returns (uint256 tokenFulfilled, uint256 ethDistributed)
    {
        uint256 totalAvailable = genesisFulfillmentAmounts[token];
        if (totalAvailable == 0) return (0, 0);

        tokenFulfilled = totalAvailable < fulfilmentAmount ? totalAvailable : fulfilmentAmount;
        ethDistributed = (ethAmount * tokenFulfilled) / fulfilmentAmount;

        genesisFulfillmentAmounts[token] -= tokenFulfilled;
        genesisFulfillmentAmounts[ETH] += ethDistributed;

        emit GenesisFeesFulfilled(token, tokenFulfilled);
    }

    /// @notice Loops through the queue and swaps the external token for ETH
    function _externalFulfillFromQueue(
        address token,
        uint256 fulfilmentAmount,
        uint256 remainingToFulfill,
        uint256 ethAmount,
        IBDeFiLeaderboard leaderboard
    ) internal returns (uint256 tokenFulfilled, uint256 ethDistributed) {
        FeesQueueItem[] storage queue = _tokenFulfillmentQueue[token];
        if (queue.length == 0 || remainingToFulfill == 0) return (0, 0);

        uint256 processedItems;
        uint256 queueProcessLimit = _getQueueProcessLimit();

        while (queue.length > 0 && processedItems < queueProcessLimit && remainingToFulfill > 0) {
            FeesQueueItem storage item = queue[queue.length - 1];

            uint256 take = item.amount < remainingToFulfill ? item.amount : remainingToFulfill;
            uint256 itemEthAmount = (ethAmount * take) / fulfilmentAmount;

            if (item.isLeaderboard) leaderboard.allocateTradingFees(item.receiver, itemEthAmount);
            else claimableEth[item.receiver] += itemEthAmount;

            tokenFulfilled += take;
            ethDistributed += itemEthAmount;
            remainingToFulfill -= take;

            if (take == item.amount) {
                queue.pop();
            } else {
                item.amount -= take;
            }

            unchecked {
                processedItems++;
            }
        }

        emit FeesFulfilled(token, tokenFulfilled);
    }

    /// @notice Adds fees to the token queue for buying from it later
    /// @param token The token whose fees are being updated
    /// @param receiver The receiver of the fees
    /// @param isLeaderboard Whether the fees are for a leaderboard
    /// @param amount The amount of fees to add
    /// @param leaderboard The BuilDeFi Leaderboard contract
    /// @param buffer Relay buffer; non-empty when `token`'s LP lives on another hook
    function _addToFulfillmentQueue(
        address token,
        address receiver,
        bool isLeaderboard,
        uint256 amount,
        IBDeFiLeaderboard leaderboard,
        ForwardBuffer memory buffer
    ) internal {
        if (amount == 0) return;

        if (token == ETH) {
            // ETH settles immediately instead of queueing.
            if (isLeaderboard) {
                leaderboard.allocateTradingFees(receiver, amount);
            } else {
                claimableEth[receiver] += amount;
            }
            return;
        }

        if (buffer.items.length != 0) {
            _bufferForward(buffer, receiver, amount, isLeaderboard, false);
            return;
        }

        _tokenFulfillmentQueue[token].push(
            FeesQueueItem({receiver: receiver, isLeaderboard: isLeaderboard, amount: amount})
        );
    }

    /// @dev Appends one entry to the relay buffer. Capacity is `queueProcessLimit + 1` (the queue
    /// loop is bounded, genesis adds at most one). Zero amounts are dropped — the receiving hook
    /// rejects them, and a dust genesis quote can legitimately round to zero.
    function _bufferForward(
        ForwardBuffer memory buffer,
        address receiver,
        uint256 amount,
        bool isLeaderboard,
        bool isGenesis
    ) internal pure {
        if (amount == 0) return;

        buffer.items[buffer.count] =
            IBDeFiLpManagerTypes.FulfillmentForward({receiver: receiver, amount: amount, isLeaderboard: isLeaderboard, isGenesis: isGenesis});
        buffer.total += amount;
        unchecked {
            buffer.count++;
        }
    }
}
