// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

import { IPoolManager } from "@uniswap/v4-core/src/interfaces/IPoolManager.sol";
import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";

import { IHookAuthorizable } from "./IHookAuthorizable.sol";

/// @title Oracle Manager Interface
/// @notice Defines the soft-enforcement surface that production hooks must call to maintain oracle state.
interface IOracleManager is IHookAuthorizable {
  /// @notice Thrown when zero address is provided
  error ZeroAddress();

  /// @notice Thrown when AegisDependencies is not initialized.
  error DepsNotInitialized();

  /// @notice Thrown when attempting to observe zero seconds in the past.
  error InvalidSecondsAgo();

  /// @notice Thrown by `requireSafeFor` when the oracle cannot durably serve the requested window.
  error OracleNotSafeForWindow();

  /// @notice Observation ring-buffer metadata for a pool.
  struct ObservationState {
    uint16 index;
    uint16 cardinality;
    uint16 cardinalityNext;
  }

  /// @notice Returns the underlying PoolManager the oracle observes.
  /// forge-lint: disable-next-line(mixed-case-function)
  function POOL_MANAGER() external view returns (IPoolManager);

  /// @notice Returns an observation entry for a pool by index.
  /// @param id The pool identifier whose observation is requested.
  /// @param observationIndex The observation index within the ring buffer.
  /// @return blockTimestamp The block timestamp for the observation.
  /// @return prevTick The previous printed tick stored with the observation.
  /// @return tickCumulative The cumulative tick value.
  /// @return initialized Whether the observation slot is initialized.
  function observations(PoolId id, uint256 observationIndex)
    external
    view
    returns (uint32 blockTimestamp, int24 prevTick, int48 tickCumulative, bool initialized);

  /// @notice Returns the observation state metadata for a pool.
  /// @param id The pool identifier whose state is requested.
  /// @return index The index of the most recently written observation.
  /// @return cardinality The number of populated observation slots.
  /// @return cardinalityNext The configured target cardinality.
  function states(PoolId id) external view returns (uint16 index, uint16 cardinality, uint16 cardinalityNext);

  /// @notice Authorizes a hook to call mutation functions. Idempotent if the hook is already authorized.
  /// @param hook The hook contract address to authorize.
  function authorizeHook(address hook) external;

  /// @notice Records the first oracle observation immediately after pool initialization.
  /// @dev Should be invoked from a hook's `afterInitialize` implementation once the pool has been created.
  /// @param key The corresponding pool key.
  /// @param tick The initialized tick returned by the pool manager.
  function recordAfterInitialize(PoolKey calldata key, int24 tick) external;

  /// @notice Updates the oracle after a swap; for gas efficiency only needs to be called if the tick changes
  /// @dev Should be invoked from a hook's `afterSwap` callback.
  /// @param key The pool key on which a swap is about to occur.
  function afterSwap(PoolKey calldata key, int24 preSwapTick) external;

  /// @notice Observes the pool at requested time offsets.
  /// @param id The pool identifier to observe.
  /// @param secondsAgos Offsets into the past for which cumulative values should be returned.
  /// @return tickCumulatives The cumulative ticks at each requested offset.
  function observe(PoolId id, uint32[] calldata secondsAgos) external view returns (int48[] memory tickCumulatives);

  /// @notice Computes the time-weighted average tick over the provided interval.
  /// @param id The pool identifier to consult.
  /// @param secondsAgo The lookback window for the TWAP calculation.
  /// @return arithmeticMeanTick The arithmetic mean tick across the interval.
  function consult(PoolId id, uint32 secondsAgo) external view returns (int24 arithmeticMeanTick);

  /// @notice Increases the cardinality target for a pool's observation buffer.
  /// @param id The pool identifier whose observation buffer should grow.
  /// @param cardinalityNext The desired new cardinality target.
  /// @return cardinalityNextOld The previous target value.
  /// @return cardinalityNextNew The updated target.
  function increaseCardinalityNext(PoolId id, uint16 cardinalityNext)
    external
    returns (uint16 cardinalityNextOld, uint16 cardinalityNextNew);

  /// @notice Reverts with `OracleNotSafeForWindow` if `safeFor(id, secondsAgo)` is false. Cheap
  ///         internal-revert path for callers (e.g. AegisEngine market init) that don't need to
  ///         branch on the result.
  /// @param id The pool identifier to inspect.
  /// @param secondsAgo The lookback window the caller wants to be durably servable.
  function requireSafeFor(PoolId id, uint32 secondsAgo) external view;

  /// @notice Whether the oracle can durably serve a `consult(id, secondsAgo)` lookup right now AND
  ///         continue to do so even under continuous adversarial 1-per-block writes.
  /// @dev Returns true iff (a) `state.cardinality >= secondsAgo + 1` (retention capacity assuming
  ///      1s worst-case blocks) AND (b) the oldest initialized observation has
  ///      `blockTimestamp <= block.timestamp - secondsAgo` (history available at the moment of
  ///      the call). Reverts with `InvalidSecondsAgo` if `secondsAgo == 0`, mirroring `consult`.
  ///      Property: whenever this function returns true, `consult(id, secondsAgo)` does not revert.
  /// @param id The pool identifier to inspect.
  /// @param secondsAgo The lookback window the caller wants to be durably servable.
  /// @return ok True iff the oracle is safe to serve the requested lookback durably.
  function safeFor(PoolId id, uint32 secondsAgo) external view returns (bool ok);
}
