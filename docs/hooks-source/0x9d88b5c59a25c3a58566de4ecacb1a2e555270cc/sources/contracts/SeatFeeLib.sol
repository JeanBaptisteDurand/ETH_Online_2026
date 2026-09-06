// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {FullMath} from "v4-core/libraries/FullMath.sol";

/// @title SeatFeeLib
/// @notice Permanent floor-fee carve. Every swap pays the same 3% fee from
/// launch — there is no launch-phase tier and no way to change it.
library SeatFeeLib {
    uint256 internal constant BPS = 10_000;
    uint256 internal constant FLOOR_FEE_BPS = 300;

    // Parts per 240 of every fee: 2.0000% reflections, 0.6375% locked LP, and
    // 0.3625% creator (creator's share absorbs the former STONKBROKERS burn
    // carve), all measured against the 3% floor.
    uint256 internal constant REFLECT_PARTS = 160;
    uint256 internal constant CREATOR_PARTS = 29;
    uint256 internal constant TOTAL_PARTS = 240;

    /// @notice Fee deducted from a gross WETH output or gross user budget.
    function feeFromGross(uint256 grossAmount, uint256 bps) internal pure returns (uint256) {
        return FullMath.mulDiv(grossAmount, bps, BPS);
    }

    /// @notice Fee added to a net WETH pool input.
    function feeFromNet(uint256 netAmount, uint256 bps) internal pure returns (uint256) {
        return FullMath.mulDivRoundingUp(netAmount, bps, BPS - bps);
    }

    function carve(uint256 fee) internal pure returns (uint256 toReflections, uint256 toLp, uint256 toCreator) {
        toReflections = FullMath.mulDiv(fee, REFLECT_PARTS, TOTAL_PARTS);
        toCreator = FullMath.mulDiv(fee, CREATOR_PARTS, TOTAL_PARTS);
        toLp = fee - toReflections - toCreator;
    }
}
