// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { FixedPointMathLib } from "solmate/src/utils/FixedPointMathLib.sol";

/// @notice Overflow-safe square root operations
/// @dev Provides lower-bound sqrt computation that handles potential uint256 overflow in multiplication
library SqrtMath {
  /// @notice Computes floor(√(A·B)) with overflow protection
  /// @dev If A·B would overflow uint256, returns √A · √B instead (still ≤ √(A·B))
  ///      This provides a conservative lower bound in all cases:
  ///      - If product fits: returns exact floor(√(A·B))
  ///      - If product overflows: returns √A · √B which is ≤ √(A·B)
  /// @param a First factor
  /// @param b Second factor
  /// @return result floor(√(A·B)) if product fits, else √A · √B (lower bound)
  function sqrtProductLowerBound(uint256 a, uint256 b) internal pure returns (uint256 result) {
    if (a == 0 || b == 0) return 0;
    if (fitsMul(a, b)) {
      unchecked {
        return FixedPointMathLib.sqrt(a * b);
      }
    }
    return FixedPointMathLib.sqrt(a) * FixedPointMathLib.sqrt(b);
  }

  /// @notice Checks if multiplication a*b fits in uint256 without overflow
  /// @param a First factor
  /// @param b Second factor
  /// @return True if a*b does not overflow uint256
  function fitsMul(uint256 a, uint256 b) internal pure returns (bool) {
    if (a == 0 || b == 0) return true;
    return b <= type(uint256).max / a;
  }
}
