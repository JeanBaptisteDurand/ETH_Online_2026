// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

library LaunchFees {
    uint256 internal constant BPS = 10_000;

    uint256 internal constant MAX_TAX_BPS = 1_000;

    uint256 internal constant PLATFORM_CAP_BPS = 100;

    function platformCut(uint256 totalTaxBps) internal pure returns (uint256) {
        uint256 half = totalTaxBps / 2;
        return half < PLATFORM_CAP_BPS ? half : PLATFORM_CAP_BPS;
    }

    function allocatable(uint256 totalTaxBps) internal pure returns (uint256) {
        return totalTaxBps - platformCut(totalTaxBps);
    }
}
