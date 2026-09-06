// SPDX-License-Identifier: MIT
pragma solidity >=0.5.0;

import { PoolId } from "@uniswap/v4-core/src/types/PoolId.sol";
import { PoolKey } from "@uniswap/v4-core/src/types/PoolKey.sol";
import { Currency } from "@uniswap/v4-core/src/types/Currency.sol";
import { BalanceDelta } from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import { IExtsload } from "@uniswap/v4-core/src/interfaces/IExtsload.sol";
import { IExttload } from "@uniswap/v4-core/src/interfaces/IExttload.sol";
import { IERC6909Claims } from "@uniswap/v4-core/src/interfaces/external/IERC6909Claims.sol";
import { IHooks } from "@uniswap/v4-core/src/interfaces/IHooks.sol";
import { IERC721Receiver } from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

import { NftRef, NftKind } from "../types/AegisStructs.sol";

/// @title IAegisEngine
/// @notice Interface for the Aegis V2 liquidity and credit engine built on Uniswap V4
/// @dev Core engine managing pooled full-range LP positions, pool-scoped sL shares (ERC-6909),
///      and equity-neutral borrow/repay in L-units with oracle-free solvency via √K floor
///
/// @dev POOLMANAGER DELTA MANAGEMENT PATTERN:
///      AegisEngine operations create PoolManager (PM) transient deltas that must be settled
///      within the PM.unlock frame. The engine follows a two-tier closure pattern:
///
///      TIER 1 - Session-Protected Operations (internal closure):
///        Functions: modifyIdle, modifyDebt, donateIdle
///        Behavior: Close PM deltas internally via _closeDeltasWithErc6909 (converts to ERC6909 balances)
///        Router:   SHOULD still call CLOSE_AE for defensive settlement
///
///      TIER 2 - Public Market Operations (caller-managed closure):
///        Functions: modifyLiquidity
///        Behavior:  Leaves PM deltas OPEN for caller flexibility (enables batching multiple operations)
///        Router:    MUST settle deltas via SETTLE_AE/TAKE_AE/CLOSE_AE actions or transaction reverts
///
///      When integrating from a custom contract:
///        1. Ensure you're in a PM.unlock() callback
///        2. Track AE's currencyDelta via poolManager.currencyDelta(address(aegisEngine), currency)
///        3. Settle negative deltas (AE owes PM): poolManager.settleFor(address(aegisEngine))
///        4. Take positive deltas (PM owes AE): aegisEngine.flushPositiveDelta(currency, recipient)
interface IAegisEngine is IERC6909Claims, IERC721Receiver, IExtsload, IExttload {
  // - - - - - - Events - - - - - -

  // - - - Market Events - - -

  /// @notice Emitted when a new market is initialized in the engine
  /// @param poolId The Uniswap V4 pool identifier
  /// @param currency0 The first currency in the pair
  /// @param currency1 The second currency in the pair
  /// @param fee The pool fee in hundredths of a basis point (Uniswap V4 units, e.g., 500 = 0.05%)
  /// @param tickSpacing The pool's tick spacing
  /// @param hooks The hook contract address
  event MarketInitialized(
    PoolId indexed poolId,
    Currency indexed currency0,
    Currency indexed currency1,
    uint24 fee,
    int24 tickSpacing,
    IHooks hooks
  );

  /// @notice Emitted when liquidity is deposited or redeemed from a market
  /// @param poolId The pool identifier
  /// @param account The account receiving shares (deposit) or burning shares (redeem)
  /// @param liquidityOrSharesDelta The input parameter (positive = add L-units, negative = burn shares, zero = poke)
  /// @param deltaShares Shares minted or burned
  /// @param liquidityDelta Actual L-units added or removed
  /// @param deltaAmounts Token amount changes (negative = deposit/spent, positive = redeem/received)
  event LiquidityModified(
    PoolId indexed poolId,
    address indexed account,
    int128 liquidityOrSharesDelta,
    uint256 deltaShares,
    int128 liquidityDelta,
    BalanceDelta deltaAmounts
  );

  /// @notice Emitted when interest accrues on a market
  /// @param poolId The pool identifier
  /// @param ratePerSecondWad Effective interest rate per second after capping (WAD precision, max 100% APR)
  /// @param interestAccruedWad The total interest accrued in L-units (WAD precision)
  /// @param borrowIndexWadAfter The borrow index after accrual (WAD precision)
  event InterestAccrued(
    PoolId indexed poolId, uint256 ratePerSecondWad, uint256 interestAccruedWad, uint256 borrowIndexWadAfter
  );

  /// @notice Emitted when trading fees are collected and reinvested as liquidity
  /// @param poolId The pool identifier
  /// @param feesCollected Net residues delta after full-range rebalance (includes fee collection and position adjustment)
  /// @param liquidityMinted Actual liquidity minted to equity (0 if below MIN_LIQUIDITY threshold)
  /// @param equityLWadAfter The total equity after reinvestment (WAD precision)
  event TradingFeesReinvested(
    PoolId indexed poolId, BalanceDelta feesCollected, uint128 liquidityMinted, uint256 equityLWadAfter
  );

  /// @notice Emitted when protocol takes a share of accrued interest
  /// @param poolId The pool identifier
  /// @param recipient The address receiving the protocol fee shares
  /// @param sharesMinted The number of shares minted to the protocol
  /// @param protocolFeeAmount The protocol fee in L-units (WAD precision)
  event ProtocolFeeMinted(
    PoolId indexed poolId, address indexed recipient, uint256 sharesMinted, uint256 protocolFeeAmount
  );

  // - - - Vault Events - - -

  /// @notice Emitted when a new vault is created
  /// @param vaultId The newly minted vault token ID
  /// @param poolId The pool this vault is bound to
  /// @param owner The initial owner of the vault NFT
  event VaultCreated(uint256 indexed vaultId, PoolId indexed poolId, address indexed owner);

  /// @notice Emitted when a vault NFT is burned
  /// @param vaultId The burned vault token ID
  /// @param owner The owner who burned the vault
  event VaultBurned(uint256 indexed vaultId, address indexed owner);

  /// @notice Emitted when a vault is locked, capturing its health state
  /// @param vaultId The vault identifier
  /// @param ltvPips The loan-to-value ratio in pips (e.g., 950000 = 95%)
  event VaultLocked(uint256 indexed vaultId, uint256 ltvPips);

  /// @notice Emitted when vault idle balances change
  /// @param vaultId The vault identifier
  /// @param delta Balance changes (positive = deposit, negative = withdraw)
  event IdleModified(uint256 indexed vaultId, BalanceDelta delta);

  /// @notice Emitted when vault debt changes
  /// @param vaultId The vault identifier
  /// @param principalDeltaRequested The requested principal delta (positive = borrow, negative = repay)
  /// @param principalDeltaActual The actual principal delta applied (may differ on repay due to geometric mean)
  /// @param borrowIndexWad The borrow index at time of operation (WAD precision)
  /// @param deltaIdle Resulting idle balance change
  event DebtModified(
    uint256 indexed vaultId,
    int128 principalDeltaRequested,
    int136 principalDeltaActual,
    uint256 borrowIndexWad,
    BalanceDelta deltaIdle
  );

  /// @notice Emitted when tokens are donated to a vault's idle balance
  /// @param vaultId The vault receiving the donation
  /// @param amounts The donation amounts (always positive)
  event IdleDonated(uint256 indexed vaultId, BalanceDelta amounts);

  /// @notice Emitted when an NFT is attached to a vault
  /// @param vaultId The vault identifier
  /// @param tokenId The NFT token ID
  /// @param kind The NFT kind (CL_V4 or LO)
  /// @param from The address that sent the NFT
  /// @param liquidity Liquidity of the position at time of attachment (static snapshot)
  event NftAttached(uint256 indexed vaultId, uint256 indexed tokenId, NftKind kind, address from, uint128 liquidity);

  /// @notice Emitted when an NFT is detached from a vault
  /// @param vaultId The vault identifier
  /// @param tokenId The NFT token ID
  /// @param kind The NFT kind (CL_V4 or LO)
  /// @param to The address receiving the NFT
  event NftDetached(uint256 indexed vaultId, uint256 indexed tokenId, NftKind kind, address indexed to);

  // - - - Keeper Events - - -

  /// @notice Emitted when an NFT is peeled from a vault
  /// @param vaultId The vault identifier
  /// @param caller The address that triggered the peel
  /// @param nft The NFT reference (kind + tokenId)
  /// @param xRealized The total currency0 amount from NFT redemption
  /// @param yRealized The total currency1 amount from NFT redemption
  /// @param idleDelta The idle balance change applied to vault (bounty = amountsRealized - idleDelta)
  /// @param initialLtvPips The vault's LTV before the peel operation
  event NftPeeled(
    uint256 indexed vaultId,
    address indexed caller,
    NftRef nft,
    uint256 xRealized,
    uint256 yRealized,
    BalanceDelta idleDelta,
    uint256 initialLtvPips
  );

  /// @notice Emitted when a vault is micro-liquidated via swap
  /// @param vaultId The vault identifier
  /// @param caller The address that triggered the micro-liquidation
  /// @param zeroForOne The swap direction
  /// @param swapDelta Swap amounts from PoolManager (not amount taken from idle)
  /// @param debtRepaidRl Actual principal debt repaid (after geometric mean adjustment)
  /// @param idleDelta Net vault idle change after swap, mint, and keeper fee
  /// @param keeperFee The keeper fee charged (0-1% based on LTV)
  /// @param initialLtvPips The vault's LTV before the micro-liquidation operation
  event VaultMicroLiquidated(
    uint256 indexed vaultId,
    address indexed caller,
    bool zeroForOne,
    BalanceDelta swapDelta,
    uint136 debtRepaidRl,
    BalanceDelta idleDelta,
    BalanceDelta keeperFee,
    uint256 initialLtvPips
  );

  // - - - Admin Events - - -

  /// @notice Emitted when the default rate oracle is updated
  /// @param oracle The new default rate oracle address
  /// @param fullUtilRate The full utilization rate (1e18 scale)
  event DefaultRateOracleSet(address indexed oracle, uint64 fullUtilRate);

  /// @notice Emitted when a pool-specific rate oracle is set
  /// @param poolId The pool identifier
  /// @param oracle The rate oracle address
  /// @param fullUtilRate The full utilization rate (1e18 scale)
  event PoolRateOracleSet(PoolId indexed poolId, address indexed oracle, uint64 fullUtilRate);

  /// @notice Emitted when a market's protocol fee is updated
  /// @param poolId The pool identifier
  /// @param protocolFeePips The new protocol fee in pips
  event MarketProtocolFeeSet(PoolId indexed poolId, uint24 protocolFeePips);

  /// @notice Emitted when a market's LTV thresholds are updated
  /// @param poolId The pool identifier
  /// @param maxLtvPips The new MAX LTV threshold in pips
  /// @param hardLtvPips The new HARD LTV threshold in pips
  event MarketLtvThresholdsSet(PoolId indexed poolId, uint24 maxLtvPips, uint24 hardLtvPips);

  // - - - - - - Functions - - - - - -

  // - - - Admin Functions - - -

  /// @notice Authorize a hook to be used with the engine
  /// @dev Only callable by the contract owner
  /// @param hook The hook address to authorize
  function authorizeHook(address hook) external;

  /// @notice Configure the default variable rate oracle used when pools lack overrides
  /// @dev Only callable by the contract owner
  /// @param oracle The rate oracle address
  /// @param fullUtilRate The full utilization rate (1e18 scale)
  function setDefaultRateOracle(address oracle, uint64 fullUtilRate) external;

  /// @notice Configure a per-market rate oracle
  /// @dev Only callable by the contract owner
  /// @param poolId The pool identifier
  /// @param oracle The rate oracle address
  /// @param fullUtilRate The full utilization rate (1e18 scale)
  function setPoolRateOracle(PoolId poolId, address oracle, uint64 fullUtilRate) external;

  /// @notice Set the protocol fee for a specific market
  /// @dev Only callable by the contract owner
  /// @param poolId The pool identifier
  /// @param newProtocolFeePips The new protocol fee in pips (0-1000000)
  function setMarketProtocolFee(PoolId poolId, uint24 newProtocolFeePips) external;

  /// @notice Set per-market LTV thresholds for micro-liquidation and lock guard
  /// @dev Only callable by the contract owner. Validates maxLtvPips < hardLtvPips <= MAX_HARD_LTV_PIPS (99.8%)
  ///      and ensures minimum ramp width (0.1%) for liquidation math.
  /// @param poolId The pool identifier
  /// @param newMaxLtvPips The new MAX LTV threshold in pips (micro-liq start, lock guard)
  /// @param newHardLtvPips The new HARD LTV threshold in pips (full repay, max keeper fee)
  function setMarketLtvThresholds(PoolId poolId, uint24 newMaxLtvPips, uint24 newHardLtvPips) external;

  // - - - Market Functions - - -

  /// @notice Initialize a new market in the engine for a given Uniswap V4 pool
  /// @dev The pool must already be initialized in PoolManager and have an authorized hook
  /// @param key The Uniswap V4 PoolKey
  function initialize(PoolKey calldata key) external;

  /// @notice Modify market liquidity using a signed parameter with dual semantics.
  /// @dev Positive values add full-range liquidity in L-units and mint shares; negative values burn market shares
  ///      and withdraw a proportional amount of liquidity. Zero is a poke-only call that only collects/reinvests fees.
  /// @param poolId The pool identifier for the liquidity operation
  /// @param liquidityOrSharesDelta Signed amount encoding the operation:
  ///        > 0: full-range liquidity to add (in L-units)
  ///        < 0: market shares (ERC6909) to burn
  ///        = 0: poke-only (collect/reinvest fees without changing equity or shares)
  /// @param recipientOrOwner For deposits: shares recipient. For redeems: shares owner.
  /// @return deltaShares Number of shares minted (deposit) or burned (redeem)
  /// @return modifyFullRangeDelta Currency amounts change (negative for deposit/spend, positive for redeem/receive)
  function modifyLiquidity(PoolId poolId, int128 liquidityOrSharesDelta, address recipientOrOwner)
    external
    returns (uint256 deltaShares, BalanceDelta modifyFullRangeDelta);

  // - - - Vault Functions - - -

  /// @notice Create a new vault associated with the provided pool
  /// @dev Mints an ERC-721 vault NFT to specified owner via VaultRegistry
  /// @param poolId The pool identifier this vault will be bound to
  /// @param owner The address that will own the vault NFT
  /// @return vaultId The newly minted vault token ID
  function createVault(PoolId poolId, address owner) external returns (uint256 vaultId);

  /// @notice Burn an empty vault NFT
  /// @dev Vault must have no debt, no idle balances, no attached positions, and be locked
  /// @param vaultId The vault ID to burn
  function burnVault(uint256 vaultId) external;

  /// @notice Start an Aegis Engine session with callback execution
  /// @dev Enforces that all unlocked vaults are re-locked and no pending NFT attaches remain
  /// @param data Calldata to pass to the callback
  /// @return result Data returned from the callback
  function aeStart(bytes calldata data) external returns (bytes memory result);

  /// @notice Unlock a vault for the current AE session
  /// @dev Can only be called within an aeStart session. Caller must be authorized for the vault.
  /// @param vaultId The vault to unlock
  function unlockVault(uint256 vaultId) external;

  /// @notice Re-lock a previously unlocked vault, enforcing solvency checks
  /// @dev Reverts if vault LTV exceeds per-market maxLtvPips or pool utilization exceeds cap
  /// @param vaultId The vault to lock
  /// @return ltvPips The loan-to-value ratio in pips after locking
  function lockVault(uint256 vaultId) external returns (uint256 ltvPips);

  /// @notice Modify vault idle balances using signed delta (V4 pattern)
  /// @dev Only callable by the vault's session operator (within an aeStart session)
  /// @param vaultId The vault to modify
  /// @param delta Signed balance delta (positive = deposit, negative = withdraw)
  /// @return balancesAfter The vault's idle balances after modification
  function modifyIdle(uint256 vaultId, BalanceDelta delta) external returns (BalanceDelta balancesAfter);

  /// @notice Donate tokens to a vault's idle balance (only when vault is locked)
  /// @dev Permissionless - anyone can donate to any vault. Vault must be locked to prevent
  ///      interference with active user sessions. Requires at least one currency amount to
  ///      meet the MIN_LIQUIDITY threshold. Caller must ensure AegisEngine has negative
  ///      PM deltas to settle (via SETTLE_AE or CLOSE_AE router actions).
  /// @param vaultId The vault to donate to
  /// @param amount0 Amount of currency0 to donate (must be >= MIN_LIQUIDITY if amount1 < MIN_LIQUIDITY)
  /// @param amount1 Amount of currency1 to donate (must be >= MIN_LIQUIDITY if amount0 < MIN_LIQUIDITY)
  /// @return balancesAfter The vault's idle balances after donation
  function donateIdle(uint256 vaultId, uint128 amount0, uint128 amount1) external returns (BalanceDelta balancesAfter);

  /// @notice Modify vault debt using signed principal delta (V4 pattern)
  /// @dev Only callable by the vault's session operator. Positive = borrow, negative = repay.
  ///      Borrow removes liquidity from full-range and adds to idle; repay does the reverse.
  /// @param vaultId The vault to modify
  /// @param principalDelta Signed principal amount in L-units (positive = borrow, negative = repay)
  /// @return liquidityDelta Full range liquidity change (negative for borrow, positive for repay)
  /// @return vaultIdleDelta Resulting idle balance change
  function modifyDebt(uint256 vaultId, int128 principalDelta)
    external
    returns (int136 liquidityDelta, BalanceDelta vaultIdleDelta);

  /// @notice Declare intent to attach an NFT to a vault
  /// @dev The caller must push the NFT to AE in the same frame via ERC721.safeTransferFrom
  ///      with abi.encode(vaultId) as the data payload. Only callable by session operator.
  ///      WARNING: Current v4-periphery PositionManager blocks ERC721 transfers when PoolManager is unlocked.
  /// @param vaultId The vault to attach the NFT to
  /// @param ref The NFT reference (kind and tokenId)
  function attachUserNft(uint256 vaultId, NftRef calldata ref) external;

  /// @notice Detach an NFT currently under AE custody and transfer it to recipient
  /// @dev Only callable by the vault's session operator
  ///      WARNING: Current v4-periphery PositionManager blocks ERC721 transfers when PoolManager is unlocked.
  /// @param vaultId The vault to detach from
  /// @param ref The NFT reference (kind and tokenId)
  /// @param to The recipient address
  function detachUserNft(uint256 vaultId, NftRef calldata ref, address to) external;

  // - - - Keeper Functions - - -

  /// @notice Unified entry point for peel or micro-liquidation of an unhealthy vault
  /// @dev If vault has attached NFTs, peels one NFT. Otherwise performs micro-liquidation.
  ///      Vault must be locked. TWAP alignment is enforced. Keeper receives bounty via positive delta.
  /// @param vaultId The vault to liquidate
  /// @param maybeNft The NFT reference to peel (only used if peel path is taken)
  function peelOrMicroLiquidate(uint256 vaultId, NftRef calldata maybeNft) external;

  // - - - Utility Functions - - -

  /// @notice Flush AE's positive PoolManager delta for a given currency to an external recipient
  /// @dev Useful for keepers to claim bounties after peel/micro-liquidation or for users on removing currency assets
  /// @param currency The currency to flush
  /// @param to The recipient address
  /// @return amountFlushed The amount transferred
  function flushPositiveDelta(Currency currency, address to) external returns (uint256 amountFlushed);
}
