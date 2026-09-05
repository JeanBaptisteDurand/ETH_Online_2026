// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {BaseHook} from "./base/BaseHook.sol";
import {FeeEscrow} from "./FeeEscrow.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {Hooks} from "v4-core/src/libraries/Hooks.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";
import {Currency} from "v4-core/src/types/Currency.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, BeforeSwapDeltaLibrary, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {CurrencySettler} from "v4-core/test/utils/CurrencySettler.sol";

interface IWiredFactory {
    function hook() external view returns (address);
    function poolManager() external view returns (address);
}

/// @title LaunchHook
/// @notice The single shared Uniswap v4 hook for every B20 launch. It:
///         - gates pool creation to the launchpad factory (`beforeInitialize`),
///         - blocks all third-party liquidity adds/removes, and owns the one permanently-locked
///           single-sided position (no code path ever passes a negative liquidityDelta),
///         - on every swap takes a fee on the quote currency as an ERC-6909 claim minted to the
///           FeeEscrow, split creator / platform / referrer, plus a timestamp-anchored anti-snipe surcharge
///           routed to the platform treasury.
/// @dev    One deployment, reused by all launches; per-pool economics are frozen at launch in `poolConfig`.
///         Deployed at a CREATE2-mined address whose low 14 bits equal `getHookPermissions()` (BaseHook
///         validates this in the constructor). Fee custody lives in the FeeEscrow, not here.
contract LaunchHook is BaseHook, Initializable {
    using CurrencySettler for Currency;
    using SafeCast for uint256;

    uint256 internal constant BPS = 10_000;
    /// @notice Hard ceiling on the admin-settable base fee (10%).
    uint16 public constant MAX_BASE_FEE_BPS = 1_000;
    /// @notice Hard ceiling on the total per-swap fee (base + anti-snipe), strictly below 100%.
    uint16 public constant MAX_TOTAL_FEE_BPS = 9_900;

    /// @notice Frozen per-pool economics, set by the factory at launch and never changed afterward.
    struct PoolConfig {
        bool initialized;
        bool tokenIsCurrency0;
        address creator;
        address platformTreasury;
        uint16 baseFeeBps; // split creator/platform/referrer
        uint16 creatorBps; // share of the base fee
        uint16 platformBps; // share of the base fee
        uint16 referrerBps; // share of the base fee
        uint16 antiSnipeStartTotalBps; // total fee at launchTime (e.g. 9900), decays to baseFeeBps
        uint32 antiSnipeWindowSeconds;
        uint48 launchTime;
    }

    /// @notice A resolved single-sided liquidity band, computed by the factory and seeded here.
    struct SeedPosition {
        int24 tickLower;
        int24 tickUpper;
        uint128 liquidity;
    }

    /// @notice The address allowed to wire `factory`/`feeEscrow` exactly once (the deployer/deploy script).
    address public immutable deployer;

    address public factory;
    address public feeEscrow;
    bool public wired;

    mapping(PoolId => PoolConfig) public poolConfig;

    error NotDeployer();
    error NotFactory();
    error NotWired();
    error ZeroAddress();
    error BadWiring();
    error AlreadyRegistered();
    error LiquidityLocked();
    error NotSingleSided();
    error InvalidFeeConfig();
    error ExactOutputDisabledDuringAntiSnipe();
    error PartialFillUnsupported();
    error UnexpectedFeeCurrency();

    event Wired(address indexed factory, address indexed feeEscrow);
    event PoolRegistered(PoolId indexed id, address indexed creator, address platformTreasury, uint16 baseFeeBps);
    event Seeded(PoolId indexed id, uint256 tokenSeeded);
    event Trade(
        PoolId indexed id,
        address indexed executor,
        address indexed referrer,
        address feeCurrency,
        uint256 totalFee,
        bytes32 comment
    );

    constructor(IPoolManager _poolManager, address _deployer) BaseHook(_poolManager) {
        deployer = _deployer;
    }

    function getHookPermissions() public pure override returns (Hooks.Permissions memory) {
        return Hooks.Permissions({
            beforeInitialize: true,
            afterInitialize: false,
            beforeAddLiquidity: true,
            afterAddLiquidity: false,
            beforeRemoveLiquidity: true,
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

    /// @notice One-time wiring of the factory + fee escrow (breaks the deploy cycle: hook is deployed first).
    /// @dev    Guarded by OpenZeppelin's `initializer` modifier (set-once, the standard initialization pattern)
    ///         on top of the deployer-only authorization check, so it can never be re-run. To also close the
    ///         deploy-time window between deployment and wiring, production deploys SHOULD perform the
    ///         deployment and this call atomically (single deployer transaction / contract); see DEPLOY_BASE.md.
    function initialize(address _factory, address _feeEscrow) external initializer {
        if (msg.sender != deployer) revert NotDeployer();
        if (_factory == address(0) || _feeEscrow == address(0)) revert ZeroAddress();
        // The hook is the single shared, un-re-wireable instance, so a mis-wire bricks every launch with no
        // recovery. Bind both sides: the factory and escrow must already point back at this exact hook (and
        // the escrow at the same PoolManager) or wiring fails closed instead of silently.
        if (IWiredFactory(_factory).hook() != address(this)) revert BadWiring();
        if (IWiredFactory(_factory).poolManager() != address(poolManager)) revert BadWiring();
        if (FeeEscrow(_feeEscrow).hook() != address(this)) revert BadWiring();
        if (address(FeeEscrow(_feeEscrow).poolManager()) != address(poolManager)) revert BadWiring();
        factory = _factory;
        feeEscrow = _feeEscrow;
        wired = true;
        emit Wired(_factory, _feeEscrow);
    }

    // ---- factory-only setup ----

    function registerPool(PoolKey calldata key, PoolConfig calldata cfg) external {
        if (msg.sender != factory) revert NotFactory();
        _validateFeeConfig(cfg);
        PoolId id = key.toId();
        if (poolConfig[id].initialized) revert AlreadyRegistered();
        PoolConfig memory c = cfg;
        c.initialized = true;
        poolConfig[id] = c;
        emit PoolRegistered(id, c.creator, c.platformTreasury, c.baseFeeBps);
    }

    /// @notice Seed the launch token as single-sided liquidity owned by this hook (permanent: there is no
    ///         path that ever removes it). Each band's quote-side delta is asserted zero, the on-chain
    ///         guarantee that the seed is token-only.
    function seedLiquidity(PoolKey calldata key, SeedPosition[] calldata positions, bool tokenIsCurrency0) external {
        if (msg.sender != factory) revert NotFactory();
        poolManager.unlock(abi.encode(key, positions, tokenIsCurrency0));
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        // Only ever reached as the callback to this hook's own `seedLiquidity` unlock (the PoolManager calls
        // back the unlock caller), so this guard fully gates it.
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        (PoolKey memory key, SeedPosition[] memory positions, bool tokenIsCurrency0) =
            abi.decode(data, (PoolKey, SeedPosition[], bool));

        Currency tokenCurrency = tokenIsCurrency0 ? key.currency0 : key.currency1;
        uint256 tokenOwed;
        for (uint256 i = 0; i < positions.length; i++) {
            (BalanceDelta delta,) = poolManager.modifyLiquidity(
                key,
                IPoolManager.ModifyLiquidityParams({
                    tickLower: positions[i].tickLower,
                    tickUpper: positions[i].tickUpper,
                    liquidityDelta: int256(uint256(positions[i].liquidity)),
                    salt: bytes32(0)
                }),
                ""
            );
            int128 quoteDelta = tokenIsCurrency0 ? delta.amount1() : delta.amount0();
            if (quoteDelta != 0) revert NotSingleSided();
            int128 tokenDelta = tokenIsCurrency0 ? delta.amount0() : delta.amount1();
            // adding liquidity owes the token (negative delta from the caller's perspective)
            if (tokenDelta > 0) revert NotSingleSided();
            // forge-lint: disable-next-line(unsafe-typecast) tokenDelta is checked < 0, so -tokenDelta fits uint128
            tokenOwed += uint256(uint128(-tokenDelta));
        }
        tokenCurrency.settle(poolManager, address(this), tokenOwed, false);
        emit Seeded(key.toId(), tokenOwed);
        return "";
    }

    // ---- hook callbacks ----

    function _beforeInitialize(address sender, PoolKey calldata, uint160) internal view override returns (bytes4) {
        if (!wired) revert NotWired();
        if (sender != factory) revert NotFactory();
        return IHooks.beforeInitialize.selector;
    }

    function _beforeAddLiquidity(address, PoolKey calldata, IPoolManager.ModifyLiquidityParams calldata, bytes calldata)
        internal
        pure
        override
        returns (bytes4)
    {
        // The hook's own genesis seed is a self-call and skips this callback; everyone else is blocked.
        revert LiquidityLocked();
    }

    function _beforeRemoveLiquidity(
        address,
        PoolKey calldata,
        IPoolManager.ModifyLiquidityParams calldata,
        bytes calldata
    ) internal pure override returns (bytes4) {
        revert LiquidityLocked();
    }

    function _beforeSwap(
        address,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        bytes calldata
    ) internal override returns (bytes4, BeforeSwapDelta, uint24) {
        PoolId id = key.toId();
        PoolConfig memory cfg = poolConfig[id];
        if (!cfg.initialized) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        uint256 totalFeeBps = _totalFeeBps(cfg);
        if (params.amountSpecified > 0 && totalFeeBps > cfg.baseFeeBps) {
            revert ExactOutputDisabledDuringAntiSnipe();
        }

        (Currency quoteCurrency, bool quoteIsSpecified) = _quoteCurrencyAndSpecified(key, params, cfg);
        if (!quoteIsSpecified) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        bool exactOutput = params.amountSpecified > 0;
        uint256 totalFee = _feeAmount(_specifiedMagnitude(params.amountSpecified), totalFeeBps, exactOutput);
        if (totalFee == 0) return (IHooks.beforeSwap.selector, BeforeSwapDeltaLibrary.ZERO_DELTA, 0);

        poolManager.mint(feeEscrow, quoteCurrency.toId(), totalFee);
        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(totalFee.toInt128(), 0), 0);
    }

    function _afterSwap(
        address sender,
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        bytes calldata hookData
    ) internal override returns (bytes4, int128) {
        PoolId id = key.toId();
        PoolConfig memory cfg = poolConfig[id];
        if (!cfg.initialized) return (IHooks.afterSwap.selector, int128(0));

        uint256 totalFeeBps = _totalFeeBps(cfg);
        if (params.amountSpecified > 0 && totalFeeBps > cfg.baseFeeBps) {
            revert ExactOutputDisabledDuringAntiSnipe();
        }

        (Currency quoteCurrency, bool quoteIsSpecified) = _quoteCurrencyAndSpecified(key, params, cfg);
        bool exactOutput = params.amountSpecified > 0;

        if (quoteIsSpecified) {
            uint256 specifiedMagnitude = _specifiedMagnitude(params.amountSpecified);
            // Must match the fee charged in _beforeSwap; both paths use the same params and transaction timestamp.
            uint256 specifiedFee = _feeAmount(specifiedMagnitude, totalFeeBps, exactOutput);
            if (specifiedFee != 0) {
                _requireFullSpecifiedFill(params, delta, specifiedFee);
                _distribute(cfg, quoteCurrency, specifiedMagnitude, specifiedFee, exactOutput, hookData, id, sender);
            }
            return (IHooks.afterSwap.selector, int128(0));
        }

        (Currency feeCurrency, uint256 unspecifiedMagnitude) = _unspecified(key, params, delta);
        if (Currency.unwrap(feeCurrency) != Currency.unwrap(quoteCurrency)) revert UnexpectedFeeCurrency();
        if (unspecifiedMagnitude == 0) return (IHooks.afterSwap.selector, int128(0));

        uint256 totalFee =
            _chargeFee(cfg, quoteCurrency, unspecifiedMagnitude, totalFeeBps, exactOutput, hookData, id, sender);
        if (totalFee == 0) return (IHooks.afterSwap.selector, int128(0));

        return (IHooks.afterSwap.selector, totalFee.toInt128());
    }

    // ---- fee internals ----

    function _chargeFee(
        PoolConfig memory cfg,
        Currency feeCurrency,
        uint256 magnitude,
        uint256 totalFeeBps,
        bool exactOutput,
        bytes calldata hookData,
        PoolId id,
        address sender
    ) internal returns (uint256 totalFee) {
        totalFee = _feeAmount(magnitude, totalFeeBps, exactOutput);
        if (totalFee == 0) return 0;

        poolManager.mint(feeEscrow, feeCurrency.toId(), totalFee);
        _distribute(cfg, feeCurrency, magnitude, totalFee, exactOutput, hookData, id, sender);
    }

    function _distribute(
        PoolConfig memory cfg,
        Currency feeCurrency,
        uint256 magnitude,
        uint256 totalFee,
        bool exactOutput,
        bytes calldata hookData,
        PoolId id,
        address sender
    ) internal {
        address currencyAddr = Currency.unwrap(feeCurrency);
        uint256 baseFee = _feeAmount(magnitude, cfg.baseFeeBps, exactOutput); // <= totalFee
        uint256 creatorShare = baseFee * cfg.creatorBps / BPS;
        (address referrer, bytes32 comment) = _parseHookData(hookData);
        // Reject self-referrals that the hook can prove. Router-user self-referrals are filtered where the
        // connected wallet is known; an invalid referrer drops its slice into the platform remainder below.
        bool validReferrer = referrer != address(0) && referrer != sender && referrer != cfg.creator
            && referrer != cfg.platformTreasury;
        uint256 referrerShare = validReferrer ? baseFee * cfg.referrerBps / BPS : 0;
        // Remainder = platform's base share + the anti-snipe surcharge + any rolled-in referrer share.
        // Computing it as a remainder makes the three credits sum to exactly `totalFee` (no dust).
        uint256 platformShare = totalFee - creatorShare - referrerShare;

        FeeEscrow escrow = FeeEscrow(feeEscrow);
        escrow.credit(cfg.creator, currencyAddr, creatorShare);
        if (referrerShare != 0) escrow.credit(referrer, currencyAddr, referrerShare);
        escrow.credit(cfg.platformTreasury, currencyAddr, platformShare);

        emit Trade(id, sender, validReferrer ? referrer : address(0), currencyAddr, totalFee, comment);
    }

    function _feeAmount(uint256 magnitude, uint256 feeBps, bool exactOutput) internal pure returns (uint256) {
        if (feeBps == 0) return 0;
        if (!exactOutput) return Math.mulDiv(magnitude, feeBps, BPS);
        return Math.mulDiv(magnitude, feeBps, BPS - feeBps, Math.Rounding.Ceil);
    }

    function _quoteCurrencyAndSpecified(
        PoolKey calldata key,
        IPoolManager.SwapParams calldata params,
        PoolConfig memory cfg
    ) internal pure returns (Currency quoteCurrency, bool quoteIsSpecified) {
        quoteCurrency = cfg.tokenIsCurrency0 ? key.currency1 : key.currency0;
        bool exactIn = params.amountSpecified < 0;
        bool specifiedIsCurrency0 = exactIn ? params.zeroForOne : !params.zeroForOne;
        Currency specifiedCurrency = specifiedIsCurrency0 ? key.currency0 : key.currency1;
        quoteIsSpecified = Currency.unwrap(specifiedCurrency) == Currency.unwrap(quoteCurrency);
    }

    function _specifiedMagnitude(int256 amountSpecified) internal pure returns (uint256) {
        if (amountSpecified < 0) return uint256(-(amountSpecified + 1)) + 1;
        // forge-lint: disable-next-line(unsafe-typecast) non-negative int256 always fits in uint256
        return uint256(amountSpecified);
    }

    function _requireFullSpecifiedFill(
        IPoolManager.SwapParams calldata params,
        BalanceDelta delta,
        uint256 specifiedFee
    ) internal pure {
        bool exactIn = params.amountSpecified < 0;
        bool specifiedIsCurrency0 = exactIn ? params.zeroForOne : !params.zeroForOne;
        int128 actualSpecified = specifiedIsCurrency0 ? delta.amount0() : delta.amount1();
        // forge-lint: disable-next-line(unsafe-typecast) beforeSwap already requires this fee to fit int128
        int256 expectedSpecified = params.amountSpecified + int256(specifiedFee);
        if (int256(actualSpecified) != expectedSpecified) revert PartialFillUnsupported();
    }

    /// @notice Total fee in bps for the current time: base + a linearly-decaying anti-snipe surcharge over
    ///         the first `antiSnipeWindowSeconds` after launch, capped at `MAX_TOTAL_FEE_BPS`.
    function _totalFeeBps(PoolConfig memory cfg) internal view returns (uint256) {
        uint256 elapsed = block.timestamp - cfg.launchTime;
        if (elapsed >= cfg.antiSnipeWindowSeconds) return cfg.baseFeeBps;
        uint256 maxSurcharge = uint256(cfg.antiSnipeStartTotalBps) - cfg.baseFeeBps;
        uint256 surcharge = maxSurcharge * (cfg.antiSnipeWindowSeconds - elapsed) / cfg.antiSnipeWindowSeconds;
        uint256 total = uint256(cfg.baseFeeBps) + surcharge;
        return total > MAX_TOTAL_FEE_BPS ? MAX_TOTAL_FEE_BPS : total;
    }

    /// @notice The unspecified currency of the swap and the absolute amount that moved in it.
    function _unspecified(PoolKey calldata key, IPoolManager.SwapParams calldata params, BalanceDelta delta)
        internal
        pure
        returns (Currency currency, uint256 magnitude)
    {
        bool exactIn = params.amountSpecified < 0;
        // exact-in: unspecified = output; exact-out: unspecified = input.
        bool unspecifiedIsCurrency1 = exactIn ? params.zeroForOne : !params.zeroForOne;
        int128 d;
        if (unspecifiedIsCurrency1) {
            currency = key.currency1;
            d = delta.amount1();
        } else {
            currency = key.currency0;
            d = delta.amount0();
        }
        // forge-lint: disable-next-line(unsafe-typecast) canonical v4 abs(int128); correct across the full range
        magnitude = d < 0 ? uint256(uint128(-d)) : uint256(uint128(d));
    }

    /// @notice Referrals + a short comment ride in the swap's hookData (a B20 memo cannot: a v4 swap is a
    ///         settle/take, not a `transferWithMemo`). Decoded defensively from fixed offsets so arbitrary
    ///         attacker-supplied data yields no referrer / empty comment and never reverts the swap.
    function _parseHookData(bytes calldata hookData) internal pure returns (address referrer, bytes32 comment) {
        if (hookData.length >= 32) {
            referrer = address(uint160(uint256(bytes32(hookData[:32]))));
        }
        if (hookData.length >= 64) {
            comment = bytes32(hookData[32:64]);
        }
    }

    function _validateFeeConfig(PoolConfig calldata cfg) internal pure {
        if (cfg.baseFeeBps > MAX_BASE_FEE_BPS) revert InvalidFeeConfig();
        if (uint256(cfg.creatorBps) + cfg.platformBps + cfg.referrerBps != BPS) revert InvalidFeeConfig();
        if (cfg.antiSnipeStartTotalBps < cfg.baseFeeBps || cfg.antiSnipeStartTotalBps > MAX_TOTAL_FEE_BPS) {
            revert InvalidFeeConfig();
        }
        if (cfg.antiSnipeWindowSeconds == 0) revert InvalidFeeConfig();
        if (cfg.creator == address(0) || cfg.platformTreasury == address(0)) revert InvalidFeeConfig();
    }
}
