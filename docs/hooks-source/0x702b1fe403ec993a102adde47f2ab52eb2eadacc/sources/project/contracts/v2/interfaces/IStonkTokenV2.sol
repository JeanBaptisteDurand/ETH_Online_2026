// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

/// @notice Surface of StonkTokenV2 consumed by StonkHook and off-chain integrators.
interface IStonkTokenV2 {
    /* ------------------------------------------------------------------ */
    /*                          Trading window                            */
    /* ------------------------------------------------------------------ */

    /// @notice True when transfers are currently permitted (NYSE open and past launch).
    function isTradingOpen() external view returns (bool);

    /// @notice Unix timestamp of the next NYSE open, for countdown UIs and quoters.
    function nextMarketOpen() external view returns (uint256);

    /// @notice First moment the token may trade -- the market open following deployment.
    function launchTime() external view returns (uint256);

    /* ------------------------------------------------------------------ */
    /*                            Wallet cap                              */
    /* ------------------------------------------------------------------ */

    /// @notice Absolute per-wallet cap in token units.
    function maxWalletAmount() external view returns (uint256);

    /// @notice True if `account` is exempt from the wallet cap (PoolManager, hook).
    function isWalletCapExempt(address account) external view returns (bool);

    /* ------------------------------------------------------------------ */
    /*                       ERC-1404 restrictions                        */
    /* ------------------------------------------------------------------ */

    /// @notice 0 when the transfer would succeed, otherwise a RESTRICTION_* code.
    /// @dev Lets scanners and aggregators read *why* a transfer reverts rather than
    ///      inferring "honeypot" from a failed simulation.
    function detectTransferRestriction(address from, address to, uint256 value)
        external
        view
        returns (uint8);

    /// @notice Human-readable explanation for a code from detectTransferRestriction.
    function messageForTransferRestriction(uint8 restrictionCode)
        external
        view
        returns (string memory);
}
