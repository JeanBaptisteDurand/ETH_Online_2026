// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import {CardPoolHook} from "./CardPoolHook.sol";

/// @title ProtopalsCardPoolHook - Protopals-specific 2% split card trading fee
/// @notice Keeps the shared/legacy Yunipals hook economics unchanged while applying the Protopals
///         schedule to new Protopals pools: every external exact-input swap pays a 1% creator
///         royalty on its PROTO leg and burns 1% of its pal-token leg. Core CardFactory buy-and-burn
///         swaps remain exempt because their complete pal output is already burned.
contract ProtopalsCardPoolHook is CardPoolHook {
    constructor(IPoolManager _manager, address _core, address _proto) CardPoolHook(_manager, _core, _proto) {}

    function ROYALTY_BPS() public pure override returns (uint256) {
        return 100;
    }

    function _chargeBuyRoyalty() internal pure override returns (bool) {
        return true;
    }
}
