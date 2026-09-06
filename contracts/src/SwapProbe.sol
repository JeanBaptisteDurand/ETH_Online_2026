// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.24;

/**
 * @title SwapProbe
 * @notice Executes a real Uniswap v4 swap, so the measurement can be checked against
 *         execution instead of against another simulation.
 *
 * Every number TARE publishes comes from `V4Quoter`, which is an `eth_call`: it simulates.
 * A simulation can diverge from execution — a different code path, no token actually moved,
 * a hook callback that reads balances that a static call never changed. The whole claim
 * rests on the quoter being faithful, and until now nothing had checked that.
 *
 * This contract swaps for real. Same fork, same pinned block, same pool. It is used twice —
 * once with the hook's own bytecode, once with the inert stub in its place — and the
 * difference between the two *executed* outputs is compared with the difference between the
 * two *quoted* outputs. If they disagree, the corpus is a set of claims about a simulator
 * rather than about swaps.
 *
 * @dev v4 settles through an unlock callback: the manager calls back, the swap happens
 *      inside, and the deltas are settled before returning. Native ETH is paid by value;
 *      the output token is taken to this contract, which is enough to read the amount.
 */
interface IPoolManager {
    struct PoolKey {
        address currency0;
        address currency1;
        uint24 fee;
        int24 tickSpacing;
        address hooks;
    }

    struct SwapParams {
        bool zeroForOne;
        int256 amountSpecified;
        uint160 sqrtPriceLimitX96;
    }

    function unlock(bytes calldata data) external returns (bytes memory);
    function swap(PoolKey memory key, SwapParams memory params, bytes calldata hookData)
        external
        returns (int256 delta);
    function settle() external payable returns (uint256);
    function take(address currency, address to, uint256 amount) external;
    function sync(address currency) external;
}

contract SwapProbe {
    IPoolManager public immutable manager;

    /// The lowest and highest prices v4 will accept as a limit — we want no limit.
    uint160 internal constant MIN_SQRT = 4295128739 + 1;
    uint160 internal constant MAX_SQRT = 1461446703485210103287273052203988822378723970342 - 1;

    error NotManager();
    error ZeroOut();

    constructor(address poolManager) {
        manager = IPoolManager(poolManager);
    }

    receive() external payable {}

    /**
     * @notice Swap `amountIn` of currency0 into currency1 and return what actually arrived.
     * @dev The return value is read from this contract's own balance change, not from the
     *      manager's delta accounting: what a user receives is what lands in their account.
     */
    function swapExactIn(
        IPoolManager.PoolKey calldata key,
        bool zeroForOne,
        uint128 amountIn
    ) external payable returns (uint256 amountOut) {
        address out = zeroForOne ? key.currency1 : key.currency0;
        uint256 before = out == address(0) ? address(this).balance - msg.value : _erc20(out);
        manager.unlock(abi.encode(key, zeroForOne, amountIn));
        uint256 apres = out == address(0) ? address(this).balance : _erc20(out);
        amountOut = apres - before;
        if (amountOut == 0) revert ZeroOut();
    }

    function unlockCallback(bytes calldata data) external returns (bytes memory) {
        if (msg.sender != address(manager)) revert NotManager();
        (IPoolManager.PoolKey memory key, bool zeroForOne, uint128 amountIn) =
            abi.decode(data, (IPoolManager.PoolKey, bool, uint128));

        address cin = zeroForOne ? key.currency0 : key.currency1;
        address cout = zeroForOne ? key.currency1 : key.currency0;

        // `swap` returns a BalanceDelta: amount0 packed in the high 128 bits, amount1 in the
        // low 128, each signed. Negative is what we owe, positive is what we are owed. An
        // earlier version guessed the transient-storage slot where the manager keeps that
        // accounting and read the wrong one — the swap then reverted with CurrencyNotSettled,
        // which is the manager saying, correctly, that we had not paid. The delta is right
        // here in the return value; there was nothing to guess.
        int256 packed = manager.swap(
            key,
            IPoolManager.SwapParams({
                zeroForOne: zeroForOne,
                // negative = exact input, the amount is what we hand over
                amountSpecified: -int256(uint256(amountIn)),
                sqrtPriceLimitX96: zeroForOne ? MIN_SQRT : MAX_SQRT
            }),
            ""
        );
        int128 d0 = int128(packed >> 128);
        int128 d1 = int128(packed);
        int128 credit = zeroForOne ? d1 : d0;

        // Pay what we owe. Native currency is settled by value; a token is synced then sent.
        if (cin == address(0)) {
            manager.settle{value: amountIn}();
        } else {
            manager.sync(cin);
            _transfer(cin, address(manager), amountIn);
            manager.settle();
        }

        // Take exactly what the swap credited, as the swap itself reported it.
        if (credit > 0) manager.take(cout, address(this), uint256(uint128(credit)));
        return "";
    }

    /* ------------------------------------------------------------ lectures */

    function _erc20(address token) internal view returns (uint256) {
        (bool ok, bytes memory r) =
            token.staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
        return ok && r.length >= 32 ? abi.decode(r, (uint256)) : 0;
    }

    function _transfer(address token, address to, uint256 amount) internal {
        (bool ok, bytes memory r) =
            token.call(abi.encodeWithSelector(0xa9059cbb, to, amount));
        require(ok && (r.length == 0 || abi.decode(r, (bool))), "transfer");
    }

}
