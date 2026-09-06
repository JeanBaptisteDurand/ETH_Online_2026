// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Every custom error in one place so the off-chain services can decode a revert without
///         guessing which contract threw it.
library Errors {
    // ── authorisation ───────────────────────────────────────────────────────
    error NotAuthorized();
    error NotPoolManager();
    /// @dev Raised when `unlockCallback` fires without this contract having initiated the unlock.
    ///      Anyone may call `PoolManager.unlock` with crafted data; without this guard a stranger
    ///      could drive our callback into a SWEEP.
    error NotSelfInitiated();
    error BadRecipient();

    // ── swap-path, all fail CLOSED ──────────────────────────────────────────
    error Paused();
    error PoolDisabled();
    error PriceNotSet();
    error StalePrice();
    error SwapTooLarge();
    error WindowCapExceeded();
    error InsufficientInventory();
    error ExactOutputDisabled();
    error ZeroAmount();
    error NoThirdPartyLiquidity();
    error HookNotImplemented();

    // ── price push ──────────────────────────────────────────────────────────
    error InvalidPrice();
    error DeviationTooLarge();
    error OutsidePriceBand();
    error WindowMoveExceeded();
    error SkewOutOfRange();
    error LengthMismatch();

    // ── config ──────────────────────────────────────────────────────────────
    error InvalidConfig();
    error NonMonotonicSizeCurve();
    error SpreadCeilingTooHigh();
    error AboveImmutableCeiling();
    error ZeroCeiling();
    error BandAnchorNotSet();
    error BandAnchorAlreadySet();

    // ── inventory ───────────────────────────────────────────────────────────
    error SettleMismatch();
    error NativeCurrencyUnsupported();
}
