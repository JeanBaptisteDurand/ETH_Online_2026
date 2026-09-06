// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title IBDeFiLeaderboard
/// @notice Interface for leaderboard pool accounting, epoch payouts, and CTO enablement.
interface IBDeFiLeaderboard {
    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted when ETH is allocated or deposited into a token pool.
    /// @param token Token whose pool balance increased
    /// @param depositor Address that caused the pool increase
    /// @param ethAmount ETH amount allocated
    event PoolDeposit(address indexed token, address depositor, uint256 ethAmount);

    /// @notice Emitted when trading fees are accounted for a token.
    /// @param token Token whose trading fees increased
    /// @param amount ETH amount added in this call
    /// @param totalFees Updated cumulative trading fees for the token
    event TradingFeesDeposited(address indexed token, uint256 amount, uint256 totalFees);

    /// @notice Emitted when a token becomes CTO-eligible.
    /// @param token Token enabled for CTO purchase
    event TokenCtoEnabled(address indexed token);

    /// @notice Emitted when CTO purchase flow completes for a token.
    /// @param token Token for which CTO purchase was executed
    /// @param buyer Buyer address that executed CTO purchase
    /// @param newOwner New owner address assigned after CTO purchase
    event TokenCto(address indexed token, address buyer, address newOwner);

    /// @notice Emitted when an epoch payout is finalized.
    /// @param leaderboardToken Token whose leaderboard epoch was finalized
    /// @param winner Top winner address from the payout set
    event LeaderboardWin(address indexed leaderboardToken, address indexed winner);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error BDeFiLeaderboard__InvalidToken();
    error BDeFiLeaderboard__TokenNotInitialized();
    error BDeFiLeaderboard__CtoUnavailable();
    error BDeFiLeaderboard__EpochIncomplete();
    error BDeFiLeaderboard__EpochCooldown();
    error BDeFiLeaderboard__InsufficientFunds();
    error BDeFiLeaderboard__InvalidAllocations();

    /*//////////////////////////////////////////////////////////////
                              INITIALIZER
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes the leaderboard contract.
    /// @param _bdefiCore Core registry contract address
    /// @param _version Version identifier for this deployment
    function initialize(address _bdefiCore, uint16 _version) external;

    /*//////////////////////////////////////////////////////////////
                         STORAGE GETTERS (public)
    //////////////////////////////////////////////////////////////*/

    /// @notice Current leaderboard pool balance in ETH per token.
    /// @param token Token whose pool balance is queried
    /// @return balance Current pool balance in wei
    function tokenPoolBalances(address token) external view returns (uint256 balance);

    /// @notice Total accumulated trading fees in ETH per token.
    /// @param token Token whose cumulative fees are queried
    /// @return totalFees Total trading fees in wei
    function totalTradingFees(address token) external view returns (uint256 totalFees);

    /// @notice Whether a token is currently CTO-enabled.
    /// @param token Token whose CTO status is queried
    /// @return enabled True if token is CTO-enabled
    function isCtoEnabled(address token) external view returns (bool);

    /// @notice Last epoch number finalized per token.
    /// @param token Token whose finalized epoch is queried
    /// @return epoch Epoch index last finalized for token
    function finalizedEpochs(address token) external view returns (uint256 epoch);

    /*//////////////////////////////////////////////////////////////
                            PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deposits ETH into a token leaderboard pool.
    /// @param token Token whose pool receives the deposit
    function depositToPool(address token) external payable;

    /// @notice Enables CTO eligibility for an inactive launched token.
    /// @param token Token to enable for CTO purchase
    function enableTokenCto(address token) external;

    /*//////////////////////////////////////////////////////////////
                           OPERATOR FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Finalizes token epoch payout and routes winner rewards to BuyBurn modules.
    /// @param token Token whose epoch payout is being finalized
    /// @param reimbursement ETH reimbursement paid to operator from payout amount
    /// @param winners Winner token list receiving payout allocations
    /// @param winnerBpss Allocation basis points per winner (must match winners length and sum to 100_00)
    function finalizeEpoch(
        address token,
        uint256 reimbursement,
        address[] calldata winners,
        uint16[] calldata winnerBpss
    ) external;

    /*//////////////////////////////////////////////////////////////
                           PROTOCOL FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Accounts trading fees deposited by LP manager.
    /// @param token Token whose trading fees are increased
    function depositTradingFees(address token) external payable;

    /// @notice Accounts trading fee ETH allocated by hook for deferred pull.
    /// @param token Token whose trading fees and pool are increased
    /// @param amount ETH amount allocated
    function allocateTradingFees(address token, uint256 amount) external;

    /// @notice Settles the ETH a specific hook owes this contract.
    /// @dev Permissionless; pulls exactly the recorded debt.
    /// @param hook Hook to settle
    function pullEthFromHook(address hook) external;

    /// @notice V2 initializer: folds the legacy global ETH debt onto the per-hook ledger.
    function initializeV2() external;

    /// @notice Handles post-CTO purchase state update for a token.
    /// @param token Token whose CTO flag is cleared
    /// @param buyer Buyer address that executed CTO purchase
    /// @param newOwner New token owner assigned by CTO purchase flow
    function handleTokenCtoPurchase(address token, address buyer, address newOwner) external;
}
