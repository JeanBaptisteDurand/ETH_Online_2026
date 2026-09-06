// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {PoolKey} from "v4-core/src/types/PoolKey.sol";

/// @notice URC-4 Active Liquidity Framework: the router-facing interface for custom-accounting
///         hooks.
///
/// Transcribed from the governance discussion, not from a released package:
/// https://gov.uniswap.org/t/urc-4-active-liquidity-framework-hook-interface/26156
///
/// **Status: Discussion, not final.** Authored by Mark Toda, Daniel Gretzke, Alice Henshaw and
/// Chris Cashwell of Uniswap Labs, June 2026. A July comment proposes dropping the `view`
/// modifier on the quote functions to allow execute-then-revert simulation, which Gretzke called
/// "a necessary change" -- so these signatures are expected to move. This file is pinned to the
/// spec as read on 2026-08-25 and must be re-checked against the thread before any deployment
/// relies on it.
///
/// ## Why this matters to us specifically
///
/// A custom-curve hook holds no conventional liquidity -- our inventory is ERC-6909 claims and
/// `beforeAddLiquidity` reverts, so the pool reports zero depth forever. Routers select and rank
/// candidate pools by indexed liquidity, so ours is invisible to them no matter how well it
/// prices. ALF is the mechanism by which a router can ask a hook what it would do instead of
/// inferring it from liquidity that does not exist.
interface IALFHook {
    /// @notice A required `hookData` payload was absent.
    error MissingHookData();
    /// @notice A `hookData` payload was present but could not be interpreted.
    error MalformedHookData();

    /// @notice A non-binding quote, for routing only.
    /// @param amountSpecified Negative for exact-input, positive for exact-output, matching v4.
    /// @return quoteAmount Output for exact-input, input for exact-output.
    ///
    /// @dev **Returns 0 rather than reverting** when the hook cannot price the swap under normal
    ///      conditions -- paused, stale, disabled, over a cap, out of inventory. That distinction
    ///      is the whole contract: a router treats 0 as "no route", but a revert inside a batched
    ///      multi-pool quote can poison quotes for pools that were perfectly fine. Reverting is
    ///      reserved for a malformed request, which is a caller bug rather than a market state.
    function getIndicativeQuote(
        PoolKey calldata key,
        bool zeroForOne,
        int256 amountSpecified,
        bytes calldata hookData
    ) external view returns (uint256 quoteAmount);

    /// @notice Coarse health signal. True does not promise that any particular pool is quotable.
    function isLive() external view returns (bool);

    /// @notice Self-declared ceiling on the gas a quote call consumes, so routers can bound them.
    function maxGas() external view returns (uint32);

    /// @notice Simulate a swap bounded by a target price. `(0, 0)` means unsupported.
    function swapToPrice(
        PoolKey calldata key,
        bool zeroForOne,
        int256 amountSpecified,
        uint160 sqrtPriceLimitX96,
        bytes calldata hookData
    ) external view returns (uint256 amountIn, uint256 amountOut);
}

/// @notice URC-2: the canonical event through which a hook reports the deltas it contributed.
///
/// https://gov.uniswap.org/t/urc-2-custom-accounting-hook-swap-event/26154 -- also Discussion.
///
/// Signs follow the core v4 `Swap` event and `BalanceDelta`: **from the swapper's perspective**,
/// positive means the token left the hook and was paid TO the swapper, negative means it came
/// FROM them. It supplements the core `Swap` event rather than replacing it; consumers sum both.
///
/// Our `Fill` event carries far more -- the pushed mid, the effective price, the skew, the age --
/// because the PnL engine attributes adverse selection against those. `HookSwap` is the subset
/// indexers can read without knowing anything about this contract, so both are emitted.
interface IHookSwapEvents {
    event HookSwap(
        bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint24 swapFee
    );
}
