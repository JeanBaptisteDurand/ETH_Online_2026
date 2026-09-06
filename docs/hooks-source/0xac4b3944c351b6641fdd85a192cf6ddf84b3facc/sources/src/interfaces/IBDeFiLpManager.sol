// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PoolCoreInfo, PoolBalance, PoolPositionInfo} from "@types/PoolInfo.sol";

import {IBDeFiLpManagerTypes} from "@interfaces/IBDeFiLpManagerTypes.sol";

/// @title IBDeFiLpManager
/// @notice Interface for protocol LP pool management across launch, maintenance, and external pools.
interface IBDeFiLpManager is IBDeFiLpManagerTypes {
    /*//////////////////////////////////////////////////////////////
                             PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposits ETH directly into a pool runtime balance.
    /// @param token Token mapped to the target pool.
    /// @param parentToken Parent token paired with token in the pool.
    function depositEthToPool(address token, address parentToken) external payable;

    /// @notice Relays fee-fulfilment entries from the calling hook to the hook that owns `token`'s LP.
    /// @dev Callable only by a registered hook; the caller transfers the ERC20 itself.
    /// @param token Asset the entries are denominated in.
    /// @param items Entries to enqueue on the target hook.
    function forwardToHookQueue(address token, FulfillmentForward[] calldata items) external;

    /// @notice Initializes a launched internal pool by creating initial LP positions.
    /// @param poolId Pool identifier.
    /// @param reimbursement ETH reimbursement paid to operator.
    /// @param swapAmount ETH amount consumed by parent asset acquisition.
    /// @param minAmountOutV4 Minimum acceptable output for V4 swap segments.
    /// @param minAmountOutV3 Minimum acceptable output for V3 swap segments.
    /// @param deadline Deadline used for swap and liquidity actions.
    function initializeLp(
        PoolId poolId,
        uint256 reimbursement,
        uint256 swapAmount,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        uint256 deadline
    ) external;

    /// @notice Adds liquidity to an initialized internal pool according to pool type strategy.
    /// @param poolId Pool identifier.
    /// @param reimbursement ETH reimbursement paid to operator.
    /// @param swapAmount ETH amount consumed by parent asset acquisition.
    /// @param minAmountOutV4 Minimum acceptable output for V4 swap segments.
    /// @param minAmountOutV3 Minimum acceptable output for V3 swap segments.
    /// @param minAmountOutDirect Minimum acceptable output for direct swap.
    /// @param deadline Deadline used for swap and liquidity actions.
    function addToLp(
        PoolId poolId,
        uint256 reimbursement,
        uint256 swapAmount,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        uint256 minAmountOutDirect,
        uint256 deadline
    ) external;

    /// @notice Rebalances internal LP positions and reinjects available balances.
    /// @param poolId Pool identifier.
    /// @param reimbursement ETH reimbursement paid to operator.
    /// @param swapAmount ETH amount consumed by parent asset acquisition.
    /// @param minAmountOutV4 Minimum acceptable output for V4 swap segments.
    /// @param minAmountOutV3 Minimum acceptable output for V3 swap segments.
    /// @param minAmountOutDirect Minimum acceptable output for direct swap.
    /// @param deadline Deadline used for swap and liquidity actions.
    function rebalanceLp(
        PoolId poolId,
        uint256 reimbursement,
        uint256 swapAmount,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        uint256 minAmountOutDirect,
        uint256 deadline
    ) external;

    /// @notice Collects accrued trading fees for a pool and routes distributions.
    /// @param poolId Pool identifier.
    function collectPoolTradingFees(PoolId poolId) external;

    /// @notice Adds liquidity to an external pool configured through whitelist metadata.
    /// @param poolId External pool identifier.
    /// @param reimbursement ETH reimbursement paid to operator.
    /// @param swapAmount ETH amount consumed by parent asset acquisition.
    /// @param minAmountOutV4 Minimum acceptable output for V4 swap segments.
    /// @param minAmountOutV3 Minimum acceptable output for V3 swap segments.
    /// @param minAmountOutDirect Minimum acceptable output for direct swap.
    /// @param minAmountAddToken Minimum token amount required for liquidity add.
    /// @param minAmountAddParent Minimum parent token amount required for liquidity add.
    /// @param deadline Deadline used for swap and liquidity actions.
    function addToExternalPool(
        PoolId poolId,
        uint256 reimbursement,
        uint256 swapAmount,
        uint256 minAmountOutV4,
        uint256 minAmountOutV3,
        uint256 minAmountOutDirect,
        uint256 minAmountAddToken,
        uint256 minAmountAddParent,
        uint256 deadline
    ) external;

    /*//////////////////////////////////////////////////////////////
                           PROTOCOL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Stores token LP allocation and custom fee distribution options.
    /// @param token Internal launched token.
    /// @param tokenPools Packed parent-token allocation entries.
    /// @param customFeeDistribution Packed fee receiver allocation entries.
    function setTokenOptions(address token, uint256[] calldata tokenPools, uint256[] calldata customFeeDistribution)
        external;

    /// @notice Registers a newly approved external whitelist pool in LP manager state.
    /// @param token External token.
    /// @param parentToken Parent token paired with token.
    /// @param poolKey Pool key representing the whitelist-approved pool.
    /// @param isUniswapV4 True when poolKey points to a V4 pool, otherwise V3 semantics are used.
    function handleExternalWhitelistAdd(
        address token,
        address parentToken,
        PoolKey calldata poolKey,
        bool isUniswapV4,
        address poolAddress
    ) external;

    /// @notice Clears external pool metadata after whitelist removal.
    /// @param token External token.
    /// @param parentToken Parent token paired with token.
    function handleExternalWhitelistRemoval(address token, address parentToken) external;

    /// @notice Deposits launch ETH and minted supply into per-pool launch balances.
    /// @param token Launched internal token.
    /// @param tokenAmount Minted token amount allocated for launch LP initialization.
    function depositLaunchFunds(address token, uint256 tokenAmount) external payable;

    /// @notice Deposits runtime balances for an existing pool.
    /// @param token Pool token.
    /// @param parentToken Pool parent token.
    /// @param tokenAmount Token amount to add.
    /// @param parentTokenAmount Parent token amount to add.
    function depositToPool(address token, address parentToken, uint256 tokenAmount, uint256 parentTokenAmount)
        external
        payable;

    /*//////////////////////////////////////////////////////////////
                             ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets the delegatecall module used by LP operation entrypoints.
    /// @param module Address of the operations module.
    function setOpsModule(address module) external;

    /*//////////////////////////////////////////////////////////////
                              VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns token initialization progress for the provided pool.
    /// @param tokenPoolId Pool identifier for any pool belonging to the token.
    /// @return initialized True when all configured pools for token are initialized.
    /// @return token Token associated with tokenPoolId.
    function isTokenFullyInitialized(PoolId tokenPoolId) external view returns (bool initialized, address token);

    /// @notice Returns stored LP allocation entries for a token.
    /// @param token Token address.
    /// @return allocations Packed allocation entries.
    function getLpAllocations(address token) external view returns (uint256[] memory allocations);

    /// @notice Returns stored custom LP fee configuration for a token.
    /// @param token Token address.
    /// @return feeDistribution Packed fee distribution entries.
    function getCustomTokenLpFeeDistribution(address token) external view returns (uint256[] memory feeDistribution);

    /// @notice Returns whether pool price is under parent SSL mint bounds.
    /// @param poolId Pool identifier.
    /// @param positionId Parent SSL position identifier.
    /// @return isUnderMintPrice True when pool is under mint price condition.
    function isPoolUnderMintPrice(PoolId poolId, uint256 positionId) external view returns (bool isUnderMintPrice);

    /// @notice Returns immutable-like core metadata for a pool.
    /// @param poolId Pool identifier.
    /// @return poolCoreInfo Stored core metadata.
    function getPoolCoreInfo(PoolId poolId) external view returns (PoolCoreInfo memory poolCoreInfo);

    /// @notice Returns launch-phase balances tracked for a pool.
    /// @param poolId Pool identifier.
    /// @return launchBalance Stored launch balance snapshot.
    function getLaunchBalance(PoolId poolId) external view returns (PoolBalance memory launchBalance);

    /// @notice Returns runtime balances tracked for a pool.
    /// @param poolId Pool identifier.
    /// @return poolBalance Stored runtime pool balance.
    function getPoolBalance(PoolId poolId) external view returns (PoolBalance memory poolBalance);

    /// @notice Returns current LP position identifiers for a pool.
    /// @param poolId Pool identifier.
    /// @return positions Stored pool position ids.
    function getPoolPositionsInfo(PoolId poolId) external view returns (PoolPositionInfo memory positions);

    /// @notice Builds a sorted V4 pool key for token pair and hook contract.
    /// @param token0 First token candidate.
    /// @param token1 Second token candidate.
    /// @param hooks Hook contract address.
    /// @return poolKey Canonical pool key for the pair.
    function getPoolKey(address token0, address token1, address hooks) external pure returns (PoolKey memory poolKey);
}
