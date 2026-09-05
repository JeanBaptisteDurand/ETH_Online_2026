// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {IHooks} from "v4-core/src/interfaces/IHooks.sol";
import {IPoolManager} from "v4-core/src/interfaces/IPoolManager.sol";
import {PoolKey} from "v4-core/src/types/PoolKey.sol";
import {PoolId} from "v4-core/src/types/PoolId.sol";
import {Currency, CurrencyLibrary} from "v4-core/src/types/Currency.sol";
import {SwapParams, ModifyLiquidityParams} from "v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "v4-core/src/types/BalanceDelta.sol";
import {BeforeSwapDelta, toBeforeSwapDelta} from "v4-core/src/types/BeforeSwapDelta.sol";
import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";

/**
 * @title VvveityFeeHookV2
 * @notice Charges a flat fee on every swap and pays it to whoever the currency
 *         belongs to: the platform keeps what buyers pay, the token's creator
 *         keeps what sellers pay.
 *
 * The fee is taken from the side the swapper specified, but who receives it is
 * decided by the direction of the trade: whoever is giving up a launched token
 * is selling it, and that fee is the creator's. In a pool with balanced flow
 * that works out close to half each. Measured on a live v1 pool: $2278.70
 * bought against $2278.83 sold.
 *
 * Denomination and direction agree on ordinary exact-input swaps and part ways
 * on exact-output ones, where the trader pins the amount they receive. On an
 * exact-output buy the fee is therefore denominated in the launched token yet
 * paid to the platform — a little of the v1 dust, on that one path only. The
 * alternative was letting any trader hand the platform's entire revenue to the
 * creator by changing how they quote, at no cost to themselves.
 *
 * Why this rather than splitting each fee in two: the platform ends up holding
 * only assets it can actually use. Under v1 the fee wallet accumulated dust
 * piles of launched tokens — six hundred thousand of one, worth twelve dollars,
 * and worth less than that the moment anyone tried to sell them.
 *
 * The creator's earnings come from sellers rather than buyers. That is a real
 * asymmetry and worth knowing about; it is the price of the platform holding
 * little it cannot spend. Usually they are paid in their own token, though an
 * exact-output sell pays them in the numeraire instead — the denomination
 * follows what the trader pinned, only the recipient follows direction.
 *
 * Routing is by token, not by pool, so a creator keeps their side of the fee
 * even on pools this launchpad did not open. See `creatorOf`.
 *
 * Nothing accumulates here. Every fee is forwarded inside the swap that
 * produced it, so this contract never holds a balance and has nothing to claim.
 *
 * @dev The address must carry BEFORE_SWAP (1<<7) and BEFORE_SWAP_RETURNS_DELTA
 *      (1<<3): `address & 0xFF == 0x88`.
 */
contract VvveityFeeHookV2 is IHooks {
    using SafeCast for uint256;
    using CurrencyLibrary for Currency;

    /// @notice Fee taken from each swap, in basis points (100 = 1%).
    uint24 public immutable feeBps;
    /// @notice Where the numeraire side goes. Immutable by design.
    address public immutable platform;
    /// @notice The only PoolManager this hook will answer to.
    IPoolManager public immutable poolManager;

    uint24 public constant MAX_FEE_BPS = 1_000; // 10%
    uint24 private constant BPS_DENOMINATOR = 10_000;

    /**
     * @notice Who launched each token.
     *
     * Keyed by token rather than by pool, deliberately. v4 pools are
     * permissionless: anyone can open a second pool on the same pair with the
     * same hook and a different tickSpacing, and that pool would not be one the
     * launcher ever registered. Keyed by pool, every sell routed through such a
     * pool would pay the platform instead of the creator — the platform being
     * the one party who profits from that, which makes it a trust problem and
     * not just a bug. Keyed by token, the creator is paid for their token no
     * matter which pool the trade went through.
     *
     * Written once per token, by the launcher, during the launch itself.
     */
    mapping(address token => address creator) public creatorOf;

    /**
     * @notice The launcher allowed to register pools.
     *
     * Set once, immediately after deployment, and only by `binder`. It cannot
     * be set twice and there is no other privileged call: a launcher and a hook
     * each need the other's address, and this is the smaller of the two
     * compromises available for breaking that.
     *
     * `binder` is passed in rather than taken from msg.sender because the hook
     * is deployed through the CREATE2 factory — the address mining needs it —
     * so the caller at construction is the factory, not us.
     */
    address public launcher;
    address public immutable binder;

    event FeeCharged(PoolId indexed poolId, Currency indexed currency, address indexed to, uint256 amount);
    event TokenRegistered(address indexed token, address indexed creator);

    error FeeTooHigh();
    error ZeroAddress();
    error NotPoolManager();
    error NotLauncher();
    error LauncherAlreadySet();
    error AlreadyRegistered();
    error HookNotImplemented();

    modifier onlyPoolManager() {
        if (msg.sender != address(poolManager)) revert NotPoolManager();
        _;
    }

    constructor(IPoolManager _poolManager, uint24 _feeBps, address _platform, address _binder) {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (_platform == address(0) || _binder == address(0)) revert ZeroAddress();
        poolManager = _poolManager;
        feeBps = _feeBps;
        platform = _platform;
        binder = _binder;
    }

    function setLauncher(address _launcher) external {
        if (msg.sender != binder) revert NotLauncher();
        if (launcher != address(0)) revert LauncherAlreadySet();
        if (_launcher == address(0)) revert ZeroAddress();
        launcher = _launcher;
    }

    /// @notice Record who a token belongs to. One call per token, launcher only.
    function register(address token, address creator) external {
        if (msg.sender != launcher) revert NotLauncher();
        if (creatorOf[token] != address(0)) revert AlreadyRegistered();
        if (creator == address(0) || token == address(0)) revert ZeroAddress();
        creatorOf[token] = creator;
        emit TokenRegistered(token, creator);
    }

    // ── the only hook we implement ────────────────────────────────────────
    function beforeSwap(address, PoolKey calldata key, SwapParams calldata params, bytes calldata)
        external
        override
        onlyPoolManager
        returns (bytes4, BeforeSwapDelta, uint24)
    {
        uint256 specified =
            params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);
        uint256 fee = (specified * feeBps) / BPS_DENOMINATOR;
        if (fee == 0) return (IHooks.beforeSwap.selector, toBeforeSwapDelta(0, 0), 0);

        // The "specified" currency is the one the caller pinned an amount to:
        // the input on exact-input swaps, the output on exact-output swaps.
        Currency feeCurrency = params.amountSpecified < 0
            ? (params.zeroForOne ? key.currency0 : key.currency1)
            : (params.zeroForOne ? key.currency1 : key.currency0);

        // The fee is taken in the specified currency, but the RECIPIENT is chosen
        // by the direction of the trade — which side the trader is giving up.
        //
        // Keying the recipient off the fee's denomination looked equivalent and
        // is not: the trader picks the denomination. Quoting a buy as
        // exact-output makes its fee land in the launched token, which under
        // denomination-keying paid the creator. A creator could point their own
        // page at a router that always quotes exact-output and collect the
        // platform's side too — costing them nothing, and costing their own
        // round trips nothing either, which makes wash trading free. Direction
        // is not something the trader can flip.
        Currency inputCurrency = params.zeroForOne ? key.currency0 : key.currency1;
        Currency outputCurrency = params.zeroForOne ? key.currency1 : key.currency0;

        // A creator claim is honoured only when the other side of the pool is
        // NOT itself a launched token. Otherwise anyone could launch a throwaway
        // token, pair their real one against it, and have both currencies point
        // back to themselves — the launchpad earning nothing on that pool forever.
        address to = creatorOf[Currency.unwrap(inputCurrency)];
        if (to == address(0) || creatorOf[Currency.unwrap(outputCurrency)] != address(0)) to = platform;

        // Native currency is never paid to a creator, only to the platform.
        //
        // take() of native ETH is a raw call with all remaining gas, and it runs
        // inside beforeSwap — before the swap it is charging for, with the
        // PoolManager still unlocked. A creator contract can use that to move
        // the price between a trader's quote and their fill, or simply revert
        // and make every exact-output sell on an ETH-paired pool impossible
        // forever. Neither is fixable afterwards: the contracts are immutable
        // and creatorOf is write-once.
        //
        // No pair the launchpad offers is native ETH — they are WETH and the
        // tokenized stocks, all ERC20, whose transfer executes no code at the
        // recipient. This only ever bites on a pool somebody else opened, and
        // it costs the creator a fee stream they never had.
        if (feeCurrency.isAddressZero()) to = platform;

        poolManager.take(feeCurrency, to, fee);
        emit FeeCharged(PoolId.wrap(keccak256(abi.encode(key))), feeCurrency, to, fee);

        return (IHooks.beforeSwap.selector, toBeforeSwapDelta(fee.toInt128(), 0), 0);
    }

    // ── everything else is disabled; the address bits say so, and these
    //    revert as a belt-and-braces guard if one is ever called ───────────
    function beforeInitialize(address, PoolKey calldata, uint160) external pure override returns (bytes4) {
        revert HookNotImplemented();
    }

    function afterInitialize(address, PoolKey calldata, uint160, int24) external pure override returns (bytes4) {
        revert HookNotImplemented();
    }

    function beforeAddLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterAddLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function beforeRemoveLiquidity(address, PoolKey calldata, ModifyLiquidityParams calldata, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterRemoveLiquidity(
        address,
        PoolKey calldata,
        ModifyLiquidityParams calldata,
        BalanceDelta,
        BalanceDelta,
        bytes calldata
    ) external pure override returns (bytes4, BalanceDelta) {
        revert HookNotImplemented();
    }

    function afterSwap(address, PoolKey calldata, SwapParams calldata, BalanceDelta, bytes calldata)
        external
        pure
        override
        returns (bytes4, int128)
    {
        revert HookNotImplemented();
    }

    function beforeDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }

    function afterDonate(address, PoolKey calldata, uint256, uint256, bytes calldata)
        external
        pure
        override
        returns (bytes4)
    {
        revert HookNotImplemented();
    }
}
