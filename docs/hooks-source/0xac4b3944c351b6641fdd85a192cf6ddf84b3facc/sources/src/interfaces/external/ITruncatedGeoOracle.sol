// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {IPoolManager} from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";

import {TruncatedOracle} from "@libs/oracle/TruncatedOracle.sol";

/// @title ITruncatedGeoOracle
/// @notice Interface for the Truncated Oracle contract in Uniswap V4
interface ITruncatedGeoOracle {
    /// @member index The index of the last written observation for the pool
    /// @member cardinality The cardinality of the observations array for the pool
    /// @member cardinalityNext The cardinality target of the observations array for the pool, which will replace cardinality when enough observations are written
    struct ObservationState {
        uint16 index;
        uint16 cardinality;
        uint16 cardinalityNext;
    }

    /// @notice Gets the state of the pool
    /// @param _key The key of the pool
    /// @return state The state of the pool
    function getState(PoolKey calldata _key) external view returns (ObservationState memory state);

    /// @notice Gets the observation of the pool
    /// @param _key The key of the pool
    /// @param _index The index of the observation
    /// @return observation The observation of the pool
    function getObservation(PoolKey calldata _key, uint256 _index)
        external
        view
        returns (TruncatedOracle.Observation memory observation);

    /// @notice Observes the pool
    /// @param _key The key of the pool
    /// @param _secondsAgos The seconds agos
    /// @return tickCumulatives The tick cumulatives
    /// @return secondsPerLiquidityCumulativeX128s The seconds per liquidity cumulative X128s
    function observe(PoolKey calldata _key, uint32[] calldata _secondsAgos)
        external
        view
        returns (int48[] memory tickCumulatives, uint144[] memory secondsPerLiquidityCumulativeX128s);

    /// @notice Increase the cardinality target for the given pool
    /// @param _key The key of the pool
    /// @param _cardinalityNext The cardinality next
    /// @return cardinalityNextOld The old cardinality next
    /// @return cardinalityNextNew The new cardinality next
    function increaseCardinalityNext(PoolKey calldata _key, uint16 _cardinalityNext)
        external
        returns (uint16 cardinalityNextOld, uint16 cardinalityNextNew);
}
