// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IHooks} from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {ModifyLiquidityParams, SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {StateLibrary} from "@uniswap/v4-core/src/libraries/StateLibrary.sol";
import {BeforeSwapDelta, toBeforeSwapDelta, BeforeSwapDeltaLibrary} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";
import {CurrencySettler} from "@uniswap/v4-core/test/utils/CurrencySettler.sol";
import {FullMath} from "@uniswap/v4-core/src/libraries/FullMath.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {IBurnable} from "../yunipals/interfaces/IBurnable.sol";
import {TwapOracle} from "../yunipals/libraries/TwapOracle.sol";

interface ICardLedger {
    function recordSwap(address card, uint160 newSqrtPrice, uint256 burned, int256 ypalIntoPool) external;
    function recordSupplyBurn(address card, uint256 amount) external;
}

/// @title CardPoolHook - one shared V4 hook serving EVERY card pool (YPAL/Card)
/// @notice Generalizes Yunipals's RarityHook from a few fixed rarity pools to N
///         permissionless card pools. Enforces:
///         1. **Locked liquidity** — only the factory/core may initialize a pool or add LP, and
///            external LPs are blocked. The hook does NOT enable a remove-liquidity callback, so no
///            EXTERNAL party can pull LP. Note (H-03): the hook does not *reject* removals initiated by
///            `core` either, and `core` is the upgradeable CardFactory — so seed-liquidity permanence
///            is an upgrade-admin trust assumption (secure a multisig/timelock on the ProxyAdmin), not
///            a hook-enforced invariant. To make it unconditional, enable `beforeRemoveLiquidity` here
///            and revert (needs a newly mined hook address).
///         2. **Legacy external-swap fee** — 1% of the card leg is burned on buys and sells;
///            sells additionally accrue a 0.25% YPAL royalty to the creator. The Protopals-specific
///            derived hook enables the new buy-side royalty and overrides the royalty to 1%, keeping
///            future Yunipals deployments on their existing economics.
///         3. **Per-card volume accounting** — accumulates the YPAL notional of every swap
///            per card, which the factory reads to vest founder allocations against real
///            traction (anti-rug). Read-only for everyone else.
/// @dev    The base currency YPAL is fixed at deploy; the other side of each pool is the card.
contract CardPoolHook is BaseHook {
    using CurrencySettler for Currency;
    using SafeERC20 for IERC20;
    using StateLibrary for IPoolManager;
    using PoolIdLibrary for PoolKey;
    using TwapOracle for TwapOracle.Oracle;

    /// @notice The factory/core — only address allowed to create pools or add LP, and the
    ///         only swap sender exempt from the external split fee.
    address public immutable core;

    /// @notice The YPAL base token (the shared quote currency of every card pool).
    address public immutable ypal;

    uint256 public constant BURN_FEE_BPS = 100; // 1% of the card leg is burned
    uint256 private constant BPS_DENOMINATOR = 10_000;
    uint256 private constant Q96 = 2 ** 96;

    /// @notice Per-card-pool TWAP oracle. `CardFactory` reads `minOut` to bound its permissionless
    ///         buy-and-burn against a manipulated spot (else it is sandwichable — drains the locked LP).
    mapping(PoolId => TwapOracle.Oracle) private _oracle;

    /// @notice card token => cumulative YPAL notional traded (both directions). Drives
    ///         founder vesting in the factory.
    mapping(address => uint256) public cumulativeVolume;

    /// @notice card token => YPAL royalty accrued (held by this hook), claimable via the core.
    mapping(address => uint256) public royaltyYpalOf;

    error OnlyCore();
    error ExternalAddLiquidityBlocked();
    error ExactOutputNotAllowed();

    event RoyaltyAccrued(address indexed card, uint256 amount, bool indexed isBuy);
    event RoyaltyCollected(address indexed card, address indexed to, uint256 amount);

    constructor(IPoolManager _manager, address _core, address _proto) BaseHook(_manager) {
        core = _core;
        ypal = _proto;
    }

    /// @notice Creator royalty on the YPAL leg. The legacy shared hook uses 0.25%; the
    ///         Protopals-specific hook overrides this to 1%.
    function ROYALTY_BPS() public pure virtual returns (uint256) {
        return 25;
    }

    /// @dev Legacy Yunipals buys have no creator royalty. Protopals overrides this switch.
    function _chargeBuyRoyalty() internal pure virtual returns (bool) {
        return false;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
            afterRemoveLiquidity: false,
            beforeSwap: true, // buy royalty / sell burn (input side)
            afterSwap: true,
            beforeDonate: false,
            afterDonate: false,
            beforeSwapReturnDelta: true,
            afterSwapReturnDelta: true,
            afterAddLiquidityReturnDelta: false,
            afterRemoveLiquidityReturnDelta: false
        });
    }

    function _beforeInitialize(address sender, PoolKey calldata, uint160) internal view override returns (bytes4) {
        if (sender != core) revert OnlyCore();
        return IHooks.beforeInitialize.selector;
    }

    function _beforeAddLiquidity(address sender, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        internal
        view
        override
        returns (bytes4)
    {
        if (sender != core) revert ExternalAddLiquidityBlocked();
        return IHooks.beforeAddLiquidity.selector;
    }

    /// @notice Collect the input-side half of the external-trade fee. A buy takes a 1% YPAL creator
    ///         royalty; a sell takes and burns 1% of the card input. The output-side half is handled
    ///         in `_afterSwap`. Core buy-and-burn swaps are exempt from both halves.
    function _beforeSwap(address sender, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        internal
        override
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        // The trade-burn / royalty in this hook only reach the swap OUTPUT, which is the
        // "unspecified" side ONLY for exact-input swaps. An exact-output swap would therefore
        // evade the fee entirely, defeating the scarcity engine. Force every external trade to be
        // exact-input. Core (the factory buy-and-burn) is always exact-input, so it's unaffected.
        if (sender != core && params.amountSpecified > 0) revert ExactOutputNotAllowed();

        // CardFactory salt-mines every card above YPAL, so YPAL = currency0 and card = currency1.
        if (sender != core && params.amountSpecified < 0) {
            address card = Currency.unwrap(key.currency1);
            uint256 amountIn = uint256(-params.amountSpecified);
            uint256 fee = params.zeroForOne
                ? (_chargeBuyRoyalty() ? (amountIn * ROYALTY_BPS()) / BPS_DENOMINATOR : 0)
                : (amountIn * BURN_FEE_BPS) / BPS_DENOMINATOR;
            if (fee > 0) {
                if (params.zeroForOne) {
                    // Buy: reserve 1% of the YPAL input for the creator before the remaining 99%
                    // enters the pool. Royalties stay card-scoped so creator-right transfers also
                    // transfer the right to claim both accrued and future fees.
                    key.currency0.take(poolManager, address(this), fee, false);
                    royaltyYpalOf[card] += fee;
                    emit RoyaltyAccrued(card, fee, true);
                } else {
                    // Sell: destroy 1% of the card input before the remaining 99% enters the pool.
                    key.currency1.take(poolManager, address(this), fee, false);
                    IBurnable(card).burn(fee);
                    ICardLedger(core).recordSupplyBurn(card, fee);
                }
                // Positive specified-delta: the hook consumed `fee` of the swapper's input.
                return (IHooks.beforeSwap.selector, toBeforeSwapDelta(int128(int256(fee)), 0), 0);
            }
        }
        return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);
    }

    function _afterSwap(address sender, PoolKey calldata key, SwapParams calldata params, BalanceDelta delta, bytes calldata)
        internal
        override
        returns (bytes4, int128)
    {
        // Fold this swap's price into the per-pool TWAP (all swaps, incl. core).
        _oracle[key.toId()].accumulate(_spotX96(key.toId()), block.timestamp);

        // Track per-card YPAL volume (used for founder vesting) for every swap.
        _trackVolume(key, delta);

        address card = Currency.unwrap(key.currency0) == ypal
            ? Currency.unwrap(key.currency1)
            : Currency.unwrap(key.currency0);

        uint256 burnedCard;
        int128 ret;

        // Core swaps are exempt from the external split fee (the price is still reported below).
        if (sender != core) {
            (Currency unspecified, int128 unspecifiedDelta) = _unspecified(key, params, delta);
            // Only fee the OUTPUT side (positive delta = the user is receiving it).
            if (unspecifiedDelta > 0) {
                uint256 outAmount = uint256(int256(unspecifiedDelta));
                address outToken = Currency.unwrap(unspecified);

                // The 1% scarcity burn always destroys the CARD: on a BUY the card is the output
                // (burned here); on a SELL it was burned from the input in beforeSwap. The 1% creator
                // royalty always uses YPAL: on a BUY it was taken from the input in beforeSwap; on a
                // SELL the YPAL output is skimmed here.
                uint256 burnFee = outToken == card ? (outAmount * BURN_FEE_BPS) / BPS_DENOMINATOR : 0;
                uint256 royaltyFee = outToken == ypal ? (outAmount * ROYALTY_BPS()) / BPS_DENOMINATOR : 0;
                uint256 total = burnFee + royaltyFee;
                if (total > 0) {
                    unspecified.take(poolManager, address(this), total, false);
                    if (burnFee > 0) {
                        IBurnable(card).burn(burnFee);
                        burnedCard = burnFee; // a buy shrinks card supply
                    }
                    if (royaltyFee > 0) {
                        royaltyYpalOf[card] += royaltyFee; // YPAL retained for creator claim
                        emit RoyaltyAccrued(card, royaltyFee, false);
                    }
                    ret = int128(int256(total));
                }
            }
        }

        // Report the post-swap price, any buy-side card burn, and the net YPAL that moved INTO the
        // pool this swap (positive on buys, negative on sells) so the factory maintains value as the
        // pool's YPAL backing. The pool's YPAL reserve change is the opposite of the swapper's YPAL
        // delta; the royalty the hook skims from a sell also leaves the pool, and is included here.
        (uint160 sqrtP,,,) = poolManager.getSlot0(key.toId());
        bool ypalIsCurrency0 = Currency.unwrap(key.currency0) == ypal;
        int128 ypalDelta = ypalIsCurrency0 ? delta.amount0() : delta.amount1();
        ICardLedger(core).recordSwap(card, sqrtP, burnedCard, -int256(ypalDelta));

        return (IHooks.afterSwap.selector, ret);
    }

    // ============ TWAP oracle ============

    /// @notice Permissionless: fold elapsed time into a card pool's TWAP so it doesn't go stale.
    function poke(PoolKey calldata key) external {
        _oracle[key.toId()].accumulate(_spotX96(key.toId()), block.timestamp);
    }

    /// @notice Minimum acceptable output for swapping `amountIn` of the input side at the pool's TWAP,
    ///         less `slippageBps`. `zeroForOne` = selling currency0 (YPAL) for currency1 (card).
    ///         Returns 0 on cold start so the factory keeps buy-and-burn liveness at genesis.
    function minOut(PoolKey calldata key, bool zeroForOne, uint256 amountIn, uint256 window, uint256 slippageBps)
        external
        view
        returns (uint256)
    {
        PoolId id = key.toId();
        return _oracle[id].minOut(block.timestamp, zeroForOne, amountIn, window, slippageBps);
    }

    /// @dev Spot price of currency1 per currency0, Q96 (= sqrtPriceX96² / 2⁹⁶). 0 if uninitialized.
    function _spotX96(PoolId id) internal view returns (uint256) {
        (uint160 sqrtP,,,) = poolManager.getSlot0(id);
        if (sqrtP == 0) return 0;
        return FullMath.mulDiv(uint256(sqrtP), uint256(sqrtP), Q96);
    }

    /// @notice Sweep a card's accrued YPAL royalty to `to`. Only the core (factory) may call;
    ///         it gates on the card's creator.
    function collectRoyalty(address card, address to) external returns (uint256 amount) {
        if (msg.sender != core) revert OnlyCore();
        amount = royaltyYpalOf[card];
        if (amount > 0) {
            royaltyYpalOf[card] = 0;
            IERC20(ypal).safeTransfer(to, amount);
            emit RoyaltyCollected(card, to, amount);
        }
    }

    /// @dev Add the absolute YPAL notional of this swap to the card's cumulative volume.
    function _trackVolume(PoolKey calldata key, BalanceDelta delta) private {
        bool ypalIsCurrency0 = Currency.unwrap(key.currency0) == ypal;
        address card = ypalIsCurrency0 ? Currency.unwrap(key.currency1) : Currency.unwrap(key.currency0);
        int128 ypalDelta = ypalIsCurrency0 ? delta.amount0() : delta.amount1();
        uint256 ypalNotional = ypalDelta >= 0 ? uint256(int256(ypalDelta)) : uint256(int256(-ypalDelta));
        cumulativeVolume[card] += ypalNotional;
    }

    function _unspecified(PoolKey calldata key, SwapParams calldata params, BalanceDelta delta)
        private
        pure
        returns (Currency unspecified, int128 unspecifiedDelta)
    {
        bool exactInput = params.amountSpecified < 0;
        bool unspecifiedIsCurrency1 = (exactInput == params.zeroForOne);
        if (unspecifiedIsCurrency1) {
            unspecified = key.currency1;
            unspecifiedDelta = delta.amount1();
        } else {
            unspecified = key.currency0;
            unspecifiedDelta = delta.amount0();
        }
    }
}
