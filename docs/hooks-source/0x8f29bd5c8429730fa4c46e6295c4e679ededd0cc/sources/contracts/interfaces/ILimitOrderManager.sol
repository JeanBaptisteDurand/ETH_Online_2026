// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { SwapParams } from "@uniswap/v4-core/src/types/PoolOperation.sol";

import { IHookAuthorizable } from "./IHookAuthorizable.sol";
import { IV4PositionManager } from "./IV4PositionManager.sol";

/// @dev Order epoch identifier reused from Uniswap example so we can leverage existing bucket logic.
type Epoch is uint232;

/// @notice Metadata tracked per order NFT.
struct Order {
  PoolId poolId;
  Epoch epoch;
  // Lower bound of the 1-tick-wide interval. The order's range is always
  // [tickLower, tickLower + tickSpacing) regardless of `zeroForOne`.
  int24 tickLower;
  bool zeroForOne;
  uint128 liquidity;
}

/// @notice Per-epoch aggregates reused from the hook example.
struct EpochInfo {
  bool filled;
  uint256 token0Total;
  uint256 token1Total;
  uint128 liquidityTotal;
}

/// @notice Per-order cumulative fee-growth snapshot recorded at placement time.
///         Prevents late entrants from diluting fees accrued before they joined an epoch.
struct FeeGrowthCursor {
  uint256 feeGrowth0LastX128;
  uint256 feeGrowth1LastX128;
}

/// @notice Per-epoch payout parameters recorded at fill time.
///         Stores principal per-liquidity and the fee-growth boundary so each order
///         can compute its exact entitlement on withdraw.
struct EpochPayout {
  uint256 principal0PerLiquidityX128;
  uint256 principal1PerLiquidityX128;
  uint256 feeGrowth0EndX128;
  uint256 feeGrowth1EndX128;
}

/// @title Limit Order Manager Interface
/// @notice Exposes the external surface for managing tick-aligned limit order epochs and NFT ownership.
interface ILimitOrderManager is IHookAuthorizable, IV4PositionManager {
  /// @notice Thrown when zero address is provided
  error ZeroAddress();

  /// @notice Thrown when AegisDependencies is not initialized.
  error DepsNotInitialized();

  /// @notice Thrown when an action requires non-zero liquidity.
  error ZeroLiquidity();

  /// @notice Thrown when liquidity operations detect the position is still in range.
  error InRange();

  /// @notice Thrown when attempting to place liquidity on the wrong side of the current price.
  error CrossedRange();

  /// @notice Thrown when attempting to cancel an order that has already been filled.
  error Filled();

  /// @notice Thrown when attempting to withdraw proceeds from an order that has not been filled.
  error NotFilled();

  /// @notice Thrown when the supplied deadline has already expired.
  error DeadlinePassed(uint256 deadline);

  /// @notice Thrown when receiving ERC1155 tokens from an unexpected sender.
  error NotPoolManagerToken();

  /// @notice Thrown when attempting to transfer an NFT while the PoolManager is unlocked.
  error PoolManagerMustBeLocked();

  /// @notice Emitted when a new limit order NFT is minted.
  /// @param tokenId The unique identifier of the minted order NFT.
  /// @param epoch The epoch bucket the order belongs to.
  /// @param key The pool key for the underlying pool.
  /// @param tickLower The lower tick boundary aligned to tick spacing.
  /// @param zeroForOne True if the order sells currency0 for currency1.
  /// @param liquidity The liquidity contributed to the epoch.
  event OrderPlaced(
    uint256 indexed tokenId, Epoch indexed epoch, PoolKey key, int24 tickLower, bool zeroForOne, uint128 liquidity
  );

  /// @notice Emitted when an epoch becomes filled by a tick crossing.
  /// @param epoch The filled epoch.
  /// @param key The associated pool key.
  /// @param tickLower The tick boundary that was crossed.
  /// @param zeroForOne True if liquidity was sold from currency0 into currency1.
  event OrderFilled(Epoch indexed epoch, PoolKey key, int24 tickLower, bool zeroForOne);

  /// @notice Emitted when an order NFT is cancelled before fill.
  /// @param tokenId The identifier of the cancelled order NFT.
  /// @param epoch The epoch the order contributed to.
  /// @param key The pool key for the order's pool.
  /// @param tickLower The tick boundary for the order.
  /// @param zeroForOne True if the order was selling currency0.
  /// @param liquidity The amount of liquidity that was cancelled.
  event OrderCancelled(
    uint256 indexed tokenId, Epoch indexed epoch, PoolKey key, int24 tickLower, bool zeroForOne, uint128 liquidity
  );

  /// @notice Emitted when filled order proceeds are withdrawn and the NFT is burned.
  /// @param tokenId The identifier of the order NFT being settled.
  /// @param epoch The epoch from which proceeds were withdrawn.
  /// @param amount0 The amount of currency0 sent to the receiver.
  /// @param amount1 The amount of currency1 sent to the receiver.
  event OrderWithdrawn(uint256 indexed tokenId, Epoch indexed epoch, uint256 amount0, uint256 amount1);

  /// @notice Returns the cached tickLower value used to detect crossings for a pool.
  /// @param poolId The identifier of the pool.
  /// @return tickLowerLast The last recorded lower tick.
  function tickLowerLasts(PoolId poolId) external view returns (int24 tickLowerLast);

  /// @notice Returns the next epoch identifier that will be assigned to a new bucket.
  /// @return nextEpoch The next epoch value.
  function epochNext() external view returns (Epoch nextEpoch);

  /// @notice Returns details for an order by token identifier.
  /// @param tokenId The NFT identifier.
  /// @return poolId The pool id the order references.
  /// @return epoch The epoch bucket the order belongs to.
  /// @return tickLower The order's lower tick boundary.
  /// @return zeroForOne True if the order sells currency0(i.e. lies to the right of the price).
  /// @return liquidity The liquidity amount provided.
  function orders(uint256 tokenId)
    external
    view
    returns (PoolId poolId, Epoch epoch, int24 tickLower, bool zeroForOne, uint128 liquidity);

  /// @notice Returns the current epoch bucket for a pool/tick/direction key.
  /// @param slot The hashed slot key derived from pool key, tick, and side.
  /// @return epoch The epoch identifier assigned to the slot.
  function epochs(bytes32 slot) external view returns (Epoch epoch);

  /// @notice Authorizes a hook contract for soft-enforcement callbacks. Idempotent for already-authorized hooks.
  /// @param hook The hook contract to authorize.
  function authorizeHook(address hook) external;

  /// @notice Records the baseline tick after pool initialization.
  /// @param key The pool key being initialized.
  /// @param tick The initialized tick returned by the pool manager.
  function onAfterInitialize(PoolKey calldata key, int24 tick) external;

  /// @notice Fills limit-order epochs whose ticks were crossed by a swap.
  /// @param key The pool key where the swap occurred.
  /// @param params The swap parameters supplied to the pool manager.
  function onAfterSwap(PoolKey calldata key, SwapParams calldata params) external;

  /// @notice Returns the epoch assigned to a pool key, tick, and direction tuple.
  /// @param key The pool key to inspect.
  /// @param tickLower The truncated lower tick.
  /// @param zeroForOne True if querying the sell-currency0 side.
  /// @return epoch The epoch identifier currently assigned.
  function getEpoch(PoolKey memory key, int24 tickLower, bool zeroForOne) external view returns (Epoch epoch);

  /// @notice Returns the cached pool key for a given pool id.
  /// @param poolId The pool id to query.
  /// @return currency0 Pool base currency
  /// @return currency1 Pool quote currency
  /// @return fee The fee tier
  /// @return tickSpacing Pool tick spacing
  /// @return hooks The configured hook address
  function poolKeys(PoolId poolId)
    external
    view
    returns (Currency currency0, Currency currency1, uint24 fee, int24 tickSpacing, IHooks hooks);

  /// @notice Returns aggregate information for an epoch bucket.
  /// @param epoch The epoch identifier to query.
  /// @return filled True if the epoch has been filled.
  /// @return token0Total The total amount of currency0 held by the epoch.
  /// @return token1Total The total amount of currency1 held by the epoch.
  /// @return liquidityTotal The total liquidity remaining in the epoch.
  function epochInfos(Epoch epoch)
    external
    view
    returns (bool filled, uint256 token0Total, uint256 token1Total, uint128 liquidityTotal);

  /// @notice Returns the fee-growth cursor for an order, set at placement time.
  /// @param tokenId The NFT identifier.
  /// @return feeGrowth0LastX128 Cumulative fee-growth for currency0 at placement.
  /// @return feeGrowth1LastX128 Cumulative fee-growth for currency1 at placement.
  function orderFeeGrowthCursors(uint256 tokenId)
    external
    view
    returns (uint256 feeGrowth0LastX128, uint256 feeGrowth1LastX128);

  /// @notice Returns the payout parameters for a filled epoch.
  /// @param epoch The epoch identifier.
  /// @return principal0PerLiquidityX128 Q128 principal of currency0 per unit of liquidity.
  /// @return principal1PerLiquidityX128 Q128 principal of currency1 per unit of liquidity.
  /// @return feeGrowth0EndX128 Cumulative fee-growth for currency0 at fill boundary.
  /// @return feeGrowth1EndX128 Cumulative fee-growth for currency1 at fill boundary.
  function epochPayouts(Epoch epoch)
    external
    view
    returns (
      uint256 principal0PerLiquidityX128,
      uint256 principal1PerLiquidityX128,
      uint256 feeGrowth0EndX128,
      uint256 feeGrowth1EndX128
    );

  /// @notice Per-pool bitmap tracking ticks with an active (non-default) epoch slot.
  /// @param poolId The pool identifier.
  /// @param wordPos The compressed tick word position.
  /// @return word The bitmap word for the given word position.
  function epochTickBitmap(PoolId poolId, int16 wordPos) external view returns (uint256 word);

  /// @notice Returns the next ERC721 token identifier that will be minted.
  /// @return tokenId The value of the incremental counter.
  function nextTokenId() external view returns (uint256 tokenId);
}
