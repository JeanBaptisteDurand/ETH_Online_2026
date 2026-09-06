// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";
import {LPFeeLibrary} from "@uniswap/v4-core/src/libraries/LPFeeLibrary.sol";

/// @title RwagmiDynamicFee
/// @notice Small volatility-accumulator dynamic LP fee model for RwagmiHookV2.
library RwagmiDynamicFee {
    using SafeCast for int256;
    using SafeCast for uint256;

    uint256 internal constant BPS_DENOMINATOR = 10_000;
    uint256 internal constant FEE_CONTROL_DENOMINATOR = 1_000_000;

    struct Config {
        uint24 baseFee;
        uint24 maxLpFee;
        uint32 feeControlNumerator;
        uint32 referenceTickFilterPeriod;
        uint32 resetPeriod;
        uint16 decayFilterBps;
    }

    struct State {
        Config config;
        uint64 lastTimestamp;
        int24 referenceTick;
        uint32 volatilityAccumulator;
        bool initialized;
    }

    error InvalidDynamicFeeConfig();

    function initialize(State storage state, Config memory config, int24 startingTick) internal {
        if (
            config.baseFee == 0 || config.baseFee > config.maxLpFee
                || config.maxLpFee > LPFeeLibrary.MAX_LP_FEE
                || config.decayFilterBps > BPS_DENOMINATOR
        ) {
            revert InvalidDynamicFeeConfig();
        }

        state.config = config;
        state.lastTimestamp = uint64(block.timestamp);
        state.referenceTick = startingTick;
        state.volatilityAccumulator = 0;
        state.initialized = true;
    }

    function compute(State storage state, int24 observedTick) internal returns (uint24 fee) {
        Config memory config = state.config;
        uint256 elapsed = block.timestamp - state.lastTimestamp;

        uint256 accumulator = state.volatilityAccumulator;
        if (elapsed >= config.resetPeriod) {
            accumulator = 0;
            state.referenceTick = observedTick;
        } else if (elapsed >= config.referenceTickFilterPeriod) {
            accumulator = (accumulator * config.decayFilterBps) / BPS_DENOMINATOR;
            state.referenceTick = observedTick;
        }

        uint256 distance = _absDiff(observedTick, state.referenceTick);
        accumulator += distance;
        if (accumulator > type(uint32).max) accumulator = type(uint32).max;

        uint256 variableFee = (uint256(config.feeControlNumerator) * accumulator * accumulator)
            / FEE_CONTROL_DENOMINATOR;
        uint256 nextFee = uint256(config.baseFee) + variableFee;
        if (nextFee > config.maxLpFee) nextFee = config.maxLpFee;

        state.volatilityAccumulator = accumulator.toUint32();
        state.lastTimestamp = uint64(block.timestamp);
        fee = nextFee.toUint24();
    }

    function _absDiff(int24 a, int24 b) private pure returns (uint256) {
        int256 diff = a >= b ? int256(a) - int256(b) : int256(b) - int256(a);
        return diff.toUint256();
    }
}
