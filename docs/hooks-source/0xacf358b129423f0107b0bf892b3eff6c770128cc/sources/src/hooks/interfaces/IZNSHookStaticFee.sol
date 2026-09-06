// SPDX-License-Identifier: MIT
// Forked from Clanker v4 (clanker-devco/v4-contracts @ b004c2e, MIT) — src/hooks/interfaces/IClankerHookStaticFee.sol
// ZNS Launchpad. Renamed type only. Field names clankerFee/pairedFee retained verbatim (open-decision #1).
pragma solidity ^0.8.26;

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

interface IZNSHookStaticFee {
    error ClankerFeeTooHigh();
    error PairedFeeTooHigh();

    event PoolInitialized(PoolId poolId, uint24 clankerFee, uint24 pairedFee);

    struct PoolStaticConfigVars {
        uint24 clankerFee;
        uint24 pairedFee;
    }

    function clankerFee(PoolId poolId) external view returns (uint24);
    function pairedFee(PoolId poolId) external view returns (uint24);
}
