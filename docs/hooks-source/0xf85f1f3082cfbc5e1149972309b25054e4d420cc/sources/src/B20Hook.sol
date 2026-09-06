// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/*
  klik.finance
*/

import {BaseHook} from "@uniswap/v4-periphery/src/utils/BaseHook.sol";
import {Hooks} from "@uniswap/v4-core/src/libraries/Hooks.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId, PoolIdLibrary} from "@uniswap/v4-core/src/types/PoolId.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "@uniswap/v4-core/src/types/BeforeSwapDelta.sol";

interface IB20Launcher {
    function getMarketCap(address token) external view returns (uint256 marketCapETH);
    function creatorOf(address token) external view returns (address);
    function creditCreatorFee(address token) external payable;
}

contract B20Hook is BaseHook {
    using PoolIdLibrary for PoolKey;

    string public constant VERSION = "b20-native-1";
    uint256 public constant BASIS_POINTS_DIVISOR = 10000;
    uint256 private constant FIXED_FEE_FALLBACK = 100;

    // transient slot flagging "the current tx is the launcher's atomic dev-buy"
    // (keccak256("b20.hook.devbuy.armed") - 1), arbitrary high slot
    uint256 private constant ARM_SLOT = 0xb20deb0000000000000000000000000000000000000000000000000000000001;

    mapping(bytes32 => uint256) public poolDeploymentBlock;

    address public owner;
    address public platformTreasury;
    address public factory;

    // ─── Anti-snipe (global) ──────────────────────────────────────────────────
    bool public antiSnipeEnabled = true;
    uint256 public antiSnipeBlocks = 3;
    uint256 public maxSnipeWei = 0.1 ether;
    mapping(bytes32 => mapping(address => uint256)) public snipeSpent;

    struct FeeTier {
        uint128 mcapThresholdEth;
        uint128 totalBps;
        uint128 platformBps;
    }

    FeeTier[] public feeTiers;

    event FeeTiersUpdated(uint256 count);
    event AntiSnipeUpdated(bool enabled, uint256 blocks, uint256 maxSnipeWei);

    constructor(IPoolManager _poolManager) BaseHook(_poolManager) {
        owner = tx.origin;
        _initDefaultFeeTiers();
    }

    // Tiers: FeeTier(upper mcap bound in ETH, totalBps, platformBps). creator = total - platform.
    // Last tier threshold 0 = floor (catches everything >= previous bound).
    function _initDefaultFeeTiers() internal {
        feeTiers.push(FeeTier(15 ether,   100, 60)); // 0-15 ETH:      1.00% (0.60/0.40)
        feeTiers.push(FeeTier(25 ether,    95, 55)); // 15-25 ETH:     0.95% (0.55/0.40)
        feeTiers.push(FeeTier(50 ether,    90, 45)); // 25-50 ETH:     0.90% (0.45/0.45)
        feeTiers.push(FeeTier(100 ether,   85, 42)); // 50-100 ETH:    0.85% (0.42/0.43)
        feeTiers.push(FeeTier(200 ether,   80, 38)); // 100-200 ETH:   0.80% (0.38/0.42)
        feeTiers.push(FeeTier(350 ether,   75, 35)); // 200-350 ETH:   0.75% (0.35/0.40)
        feeTiers.push(FeeTier(550 ether,   70, 32)); // 350-550 ETH:   0.70% (0.32/0.38)
        feeTiers.push(FeeTier(800 ether,   65, 29)); // 550-800 ETH:   0.65% (0.29/0.36)
        feeTiers.push(FeeTier(1200 ether,  62, 26)); // 800-1200 ETH:  0.62% (0.26/0.36)
        feeTiers.push(FeeTier(1600 ether,  58, 24)); // 1200-1600 ETH: 0.58% (0.24/0.34)
        feeTiers.push(FeeTier(2000 ether,  54, 22)); // 1600-2000 ETH: 0.54% (0.22/0.32)
        feeTiers.push(FeeTier(3000 ether,  50, 20)); // 2000-3000 ETH: 0.50% (0.20/0.30)
        feeTiers.push(FeeTier(4500 ether,  35, 13)); // 3000-4500 ETH: 0.35% (0.13/0.22)
        feeTiers.push(FeeTier(6000 ether,  22,  7)); // 4500-6000 ETH: 0.22% (0.07/0.15)
        feeTiers.push(FeeTier(0,           10,  3)); // >= 6000 ETH:   0.10% (0.03/0.07)
    }

    // ─── Owner functions ──────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    function setPlatformTreasury(address _treasury) external onlyOwner {
        require(_treasury != address(0), "Zero address");
        platformTreasury = _treasury;
    }

    function setFactory(address _factory) external onlyOwner {
        require(_factory != address(0), "Zero address");
        factory = _factory;
    }

    /// @notice Global anti-snipe switch + params. `enabled=false` turns off all launch-window guards.
    function setAntiSnipe(bool enabled, uint256 blocks_, uint256 maxWei) external onlyOwner {
        antiSnipeEnabled = enabled;
        antiSnipeBlocks = blocks_;
        maxSnipeWei = maxWei;
        emit AntiSnipeUpdated(enabled, blocks_, maxWei);
    }

    function rescueETH(address to) external onlyOwner {
        require(to != address(0), "Zero address");
        uint256 balance = address(this).balance;
        require(balance > 0, "Nothing to rescue");
        (bool success, ) = payable(to).call{value: balance}("");
        require(success, "Transfer failed");
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        owner = newOwner;
    }

    uint128 public constant MAX_FEE_BPS = 125;

    function setFeeTiers(FeeTier[] calldata tiers) external onlyOwner {
        require(tiers.length > 0, "Need at least one tier");
        for (uint256 i = 0; i < tiers.length - 1; i++) {
            require(tiers[i].totalBps <= MAX_FEE_BPS, "Fee exceeds 1.25% max");
            require(tiers[i].mcapThresholdEth > 0, "Threshold must be non-zero");
            require(tiers[i].platformBps <= tiers[i].totalBps, "platformBps exceeds totalBps");
            if (i > 0) {
                require(tiers[i].mcapThresholdEth > tiers[i - 1].mcapThresholdEth, "Tiers must be sorted ascending");
            }
        }
        require(tiers[tiers.length - 1].totalBps <= MAX_FEE_BPS, "Fee exceeds 1.25% max");
        require(tiers[tiers.length - 1].platformBps <= tiers[tiers.length - 1].totalBps, "platformBps exceeds totalBps");

        delete feeTiers;
        for (uint256 i = 0; i < tiers.length; i++) {
            feeTiers.push(tiers[i]);
        }
        emit FeeTiersUpdated(tiers.length);
    }

    function getFeeTiers() external view returns (FeeTier[] memory) {
        return feeTiers;
    }

    /// @notice Called by the launcher inside a launch tx to exempt its own atomic dev-buy
    ///         from the launch-block guard. Sets a transient flag consumed by the next buy.
    function armDevBuy() external {
        require(msg.sender == factory, "only factory");
        assembly {
            tstore(ARM_SLOT, 1)
        }
    }

    // ─── Hook config ──────────────────────────────────────────────────────────

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: false,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: false,
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

    function _beforeInitialize(address, PoolKey calldata key, uint160) internal override returns (bytes4) {
        poolDeploymentBlock[PoolId.unwrap(key.toId())] = block.number;
        return BaseHook.beforeInitialize.selector;
    }

    // ─── Fee tiers ────────────────────────────────────────────────────────────

    function getFeeTier(uint256 mcapETH)
        public
        view
        returns (uint256 totalBps, uint256 platformBps, uint256 creatorBps)
    {
        uint256 len = feeTiers.length;
        if (len == 0) return (FIXED_FEE_FALLBACK, 0, FIXED_FEE_FALLBACK);
        for (uint256 i = 0; i < len; i++) {
            if (i == len - 1 || mcapETH < feeTiers[i].mcapThresholdEth) {
                uint256 t = feeTiers[i].totalBps;
                uint256 p = feeTiers[i].platformBps;
                return (t, p, t - p);
            }
        }
        return (FIXED_FEE_FALLBACK, 0, FIXED_FEE_FALLBACK);
    }

    function _getFeeSplit(bytes32 poolId, address tokenAddress)
        internal
        view
        returns (uint256 totalFeeBps, uint256 platformBps, uint256 creatorBps)
    {
        if (block.number == poolDeploymentBlock[poolId]) return (0, 0, 0);
        if (factory == address(0)) return (FIXED_FEE_FALLBACK, 0, FIXED_FEE_FALLBACK);

        uint256 mcapETH = 0;
        try IB20Launcher(factory).getMarketCap(tokenAddress) returns (uint256 mcap) {
            mcapETH = mcap;
        } catch {}
        return getFeeTier(mcapETH);
    }

    // Creator share -> launcher (credited to the token's creator); platform share -> treasury.
    function _distributeFee(address tokenAddress, uint256 feeAmount, uint256 platformBps, uint256 totalBps) internal {
        if (feeAmount == 0) return;

        uint256 platformShare = 0;
        if (platformTreasury != address(0) && totalBps > 0 && platformBps > 0) {
            platformShare = feeAmount * platformBps / totalBps;
        }
        uint256 creatorShare = feeAmount - platformShare;

        if (platformShare > 0) {
            // best-effort: a failed send leaves funds in the hook for rescueETH
            (bool sent, ) = payable(platformTreasury).call{value: platformShare}("");
            sent;
        }
        if (creatorShare > 0) {
            IB20Launcher(factory).creditCreatorFee{value: creatorShare}(tokenAddress);
        }
    }

    function _getTokenFromPool(PoolKey calldata key) internal pure returns (address) {
        address c0 = Currency.unwrap(key.currency0);
        address c1 = Currency.unwrap(key.currency1);
        if (c0 == address(0)) return c1;
        if (c1 == address(0)) return c0;
        return address(0);
    }

    function _isBuyTransaction(PoolKey calldata key, SwapParams calldata params) internal pure returns (bool) {
        bool ethIsCurrency0 = Currency.unwrap(key.currency0) == address(0);
        return ethIsCurrency0 ? params.zeroForOne : !params.zeroForOne;
    }

    // Launch-window guard. Reverts snipers; caps per-origin ETH; exempts the armed dev-buy.
    function _antiSnipe(bytes32 poolId, bool isBuy, bool isExactInput, SwapParams calldata params) internal {
        if (!antiSnipeEnabled || !isBuy) return;
        uint256 dep = poolDeploymentBlock[poolId];
        if (block.number > dep + antiSnipeBlocks) return;

        bool armed;
        assembly {
            armed := tload(ARM_SLOT)
        }
        if (armed) {
            assembly {
                tstore(ARM_SLOT, 0) // consume: this is the launcher's own dev-buy
            }
            return;
        }

        if (block.number == dep) revert("b20: launch block locked");
        if (isExactInput) {
            uint256 ethIn = uint256(-params.amountSpecified);
            uint256 spent = snipeSpent[poolId][tx.origin] + ethIn;
            snipeSpent[poolId][tx.origin] = spent;
            require(spent <= maxSnipeWei, "b20: snipe cap");
        }
    }

    function _beforeSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        address tokenAddress = _getTokenFromPool(key);
        if (tokenAddress == address(0)) {
            return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        bool isBuy = _isBuyTransaction(key, params);
        bool isExactInput = params.amountSpecified < 0;

        require(isBuy || isExactInput, "exactOutput sells not supported");

        bytes32 poolId = PoolId.unwrap(key.toId());
        _antiSnipe(poolId, isBuy, isExactInput, params);

        if (!isBuy || !isExactInput) {
            return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        (uint256 totalFeeBps, uint256 platformBps, ) = _getFeeSplit(poolId, tokenAddress);
        if (totalFeeBps == 0) {
            return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        uint256 ethIn = uint256(-params.amountSpecified);
        uint256 feeAmount = (ethIn * totalFeeBps) / BASIS_POINTS_DIVISOR;
        if (feeAmount == 0) {
            return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);
        }

        bool ethIsCurrency0 = Currency.unwrap(key.currency0) == address(0);
        Currency ethCurrency = ethIsCurrency0 ? key.currency0 : key.currency1;
        poolManager.take(ethCurrency, address(this), feeAmount);
        _distributeFee(tokenAddress, feeAmount, platformBps, totalFeeBps);

        return (BaseHook.beforeSwap.selector, toBeforeSwapDelta(int128(int256(feeAmount)), 0), 0);
    }

    function _afterSwap(
        address,
        PoolKey calldata key,
        SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata
    ) internal override returns (bytes4, int128) {
        address tokenAddress = _getTokenFromPool(key);
        if (tokenAddress == address(0)) {
            return (BaseHook.afterSwap.selector, 0);
        }

        bool isBuy = _isBuyTransaction(key, params);
        bool isExactInput = params.amountSpecified < 0;
        bool ethIsUnspecified = (isBuy && !isExactInput) || (!isBuy && isExactInput);
        if (!ethIsUnspecified) {
            return (BaseHook.afterSwap.selector, 0);
        }

        bytes32 poolId = PoolId.unwrap(key.toId());
        (uint256 totalFeeBps, uint256 platformBps, ) = _getFeeSplit(poolId, tokenAddress);
        if (totalFeeBps == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        bool ethIsCurrency0 = Currency.unwrap(key.currency0) == address(0);
        int128 ethDelta = ethIsCurrency0 ? delta.amount0() : delta.amount1();
        uint256 ethMoved = ethDelta < 0 ? uint256(-int256(ethDelta)) : uint256(int256(ethDelta));
        if (ethMoved == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        uint256 feeAmount = (ethMoved * totalFeeBps) / BASIS_POINTS_DIVISOR;
        if (feeAmount == 0) {
            return (BaseHook.afterSwap.selector, 0);
        }

        Currency ethCurrency = ethIsCurrency0 ? key.currency0 : key.currency1;
        poolManager.take(ethCurrency, address(this), feeAmount);
        _distributeFee(tokenAddress, feeAmount, platformBps, totalFeeBps);

        return (BaseHook.afterSwap.selector, int128(int256(feeAmount)));
    }

    receive() external payable {}
}
