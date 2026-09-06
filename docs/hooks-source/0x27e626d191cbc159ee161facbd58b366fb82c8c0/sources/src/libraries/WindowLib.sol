// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {SafeCast} from "v4-core/src/libraries/SafeCast.sol";

import {Window} from "../types/PoolConfig.sol";

/// @notice Rolling accumulator over a fixed-length window.
///
/// Used twice: for the per-window notional cap (how much flow the pool will absorb before it
/// stops quoting) and for the cumulative price-move budget (how far a hot operator key can walk
/// the price before it must stop). Both are tumbling rather than sliding windows -- cheaper, and
/// the conservative direction is already covered by the per-event cap.
library WindowLib {
    using SafeCast for uint256;

    /// @notice Add `amount` to the window, resetting first if it has expired.
    /// @return used Total consumed in the current window, including `amount`.
    /// @dev Cold start (`startedAt == 0`) resets rather than underflowing, so a pool that has
    ///      never been used behaves like one whose window just expired.
    function accrue(Window storage w, uint256 amount, uint32 length) internal returns (uint256 used) {
        uint32 startedAt = w.startedAt;
        // A tumbling window is a deliberate use of wall-clock time; a validator nudging the
        // timestamp by seconds cannot meaningfully enlarge the budget, and the per-swap cap
        // bounds any single abuse regardless.
        // forge-lint: disable-next-line(block-timestamp)
        if (startedAt == 0 || block.timestamp >= uint256(startedAt) + length) {
            // safe: uint32 seconds overflows in 2106.
            // forge-lint: disable-next-line(unsafe-typecast)
            w.startedAt = uint32(block.timestamp);
            w.used = 0;
            used = amount;
        } else {
            used = uint256(w.used) + amount;
        }
    }

    /// @notice Commit an accrued total. Split from `accrue` so a caller can revert on the cap
    ///         check without having written state.
    function commit(Window storage w, uint256 used) internal {
        w.used = used.toUint128();
    }

    /// @notice Current consumption, treating an expired or cold window as empty.
    function currentUsed(Window storage w, uint32 length) internal view returns (uint256) {
        uint32 startedAt = w.startedAt;
        // forge-lint: disable-next-line(block-timestamp)
        if (startedAt == 0 || block.timestamp >= uint256(startedAt) + length) return 0;
        return w.used;
    }
}
