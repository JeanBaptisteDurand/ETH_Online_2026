// SPDX-License-Identifier: MIT
// Forked from Clanker v4 (clanker-devco/v4-contracts @ b004c2e, MIT) — src/hooks/ClankerHookStaticFeeV2.sol
// ZNS Launchpad — main hook. 3-arg constructor (drops poolExtensionAllowlist; MUST match the HookMiner
// ctorArgs tuple in Step 14). Directional 1% LP fee via the dynamic-fee path. Field names clankerFee/
// pairedFee kept verbatim (open-decision #1). _setProtocolFee routes to the base's FIXED override.
pragma solidity ^0.8.26;

import {ZnsHook} from "./ZnsHook.sol";
import {IZNSHookStaticFee} from "./interfaces/IZNSHookStaticFee.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";

contract ZnsHookStaticFee is ZnsHook, IZNSHookStaticFee {
    mapping(PoolId => uint24) public clankerFee;
    mapping(PoolId => uint24) public pairedFee;

    constructor(address _poolManager, address _factory, address _weth)
        ZnsHook(_poolManager, _factory, _weth)
    {}

    function _initializeFeeData(PoolKey memory poolKey, bytes memory feeData) internal override {
        PoolStaticConfigVars memory _poolConfigVars = abi.decode(feeData, (PoolStaticConfigVars));

        if (_poolConfigVars.clankerFee > MAX_LP_FEE) {
            revert ClankerFeeTooHigh();
        }

        if (_poolConfigVars.pairedFee > MAX_LP_FEE) {
            revert PairedFeeTooHigh();
        }

        clankerFee[poolKey.toId()] = _poolConfigVars.clankerFee;
        pairedFee[poolKey.toId()] = _poolConfigVars.pairedFee;

        emit PoolInitialized(poolKey.toId(), _poolConfigVars.clankerFee, _poolConfigVars.pairedFee);
    }

    // set the LP fee according to the clanker/paired fee configuration
    function _setFee(PoolKey calldata poolKey, IPoolManager.SwapParams calldata swapParams)
        internal
        override
    {
        uint24 fee = swapParams.zeroForOne != clankerIsToken0[poolKey.toId()]
            ? pairedFee[poolKey.toId()]
            : clankerFee[poolKey.toId()];

        _setProtocolFee(fee);
        IPoolManager(poolManager).updateDynamicLPFee(poolKey, fee);
    }
}
