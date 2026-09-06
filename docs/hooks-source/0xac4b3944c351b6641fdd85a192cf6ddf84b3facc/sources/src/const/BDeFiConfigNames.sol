// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title BDeFiConfigNames
/// @notice Library for storing the BuilDeFi configuration variable name hashes
library BDeFiConfigNames {
    /// USD FEES
    bytes32 public constant USD_BASE_LAUNCH_FEE = keccak256("USD_BASE_LAUNCH_FEE");
    bytes32 public constant USD_ADD_LP_FEE = keccak256("USD_ADD_LP_FEE");
    bytes32 public constant USD_ADD_SUPPORT_FEE = keccak256("USD_ADD_SUPPORT_FEE");
    bytes32 public constant USD_BUY_BURN_FEE = keccak256("USD_BUY_BURN_FEE");
    bytes32 public constant USD_EXT_STAKE_FEE = keccak256("USD_EXT_STAKE_FEE");
    bytes32 public constant USD_CUSTOM_LAUNCH_DURATION_FEE = keccak256("USD_CUSTOM_LAUNCH_DURATION_FEE");
    bytes32 public constant USD_CUSTOM_MINT_PRICE_FEE = keccak256("USD_CUSTOM_MINT_PRICE_FEE");
    bytes32 public constant USD_CUSTOM_LP_TOKENS_FEE = keccak256("USD_CUSTOM_LP_TOKENS_FEE");
    bytes32 public constant USD_TOKEN_TAX_FEE = keccak256("USD_TOKEN_TAX_FEE");
    bytes32 public constant USD_INT_STAKE_FEE = keccak256("USD_INT_STAKE_FEE");
    bytes32 public constant USD_CUSTOM_LP_FEES_FEE = keccak256("USD_CUSTOM_LP_FEES_FEE");
    bytes32 public constant USD_WHITELIST_INTERNAL_TOKEN_FEE = keccak256("USD_WHITELIST_INTERNAL_TOKEN_FEE");
    bytes32 public constant USD_WHITELIST_EXTERNAL_TOKEN_FEE = keccak256("USD_WHITELIST_EXTERNAL_TOKEN_FEE");
    bytes32 public constant USD_CTO_FEE = keccak256("USD_CTO_FEE");

    // ALLOCATIONS
    bytes32 public constant BPS_MIN_LP_ALLOC = keccak256("BPS_MIN_LP_ALLOC");
    bytes32 public constant BPS_MAX_CREATOR_ALLOC = keccak256("BPS_MAX_CREATOR_ALLOC");
    bytes32 public constant BPS_MAX_SUPPORT_ALLOC = keccak256("BPS_MAX_SUPPORT_ALLOC");
    bytes32 public constant BPS_MAX_BUY_BURN_ALLOC = keccak256("BPS_MAX_BUY_BURN_ALLOC");
    bytes32 public constant BPS_MAX_EXT_STAKE_ALLOC = keccak256("BPS_MAX_EXT_STAKE_ALLOC");
    bytes32 public constant BPS_PLATFORM_LB_ALLOC = keccak256("BPS_PLATFORM_LB_ALLOC");
    bytes32 public constant BPS_PRIMARY_TOKEN_LP_ALLOC = keccak256("BPS_PRIMARY_TOKEN_LP_ALLOC");

    // LP STRUCTURE
    bytes32 public constant BPS_MIN_PRIMARY_LP_ALLOC = keccak256("BPS_MIN_PRIMARY_LP_ALLOC");
    bytes32 public constant MAX_LPS_PER_TOKEN = keccak256("MAX_LPS_PER_TOKEN");
    bytes32 public constant BPS_MAX_CUSTOM_LP_FEE_TOTAL = keccak256("BPS_MAX_CUSTOM_LP_FEE_TOTAL");
    bytes32 public constant BPS_FULL_SPEC_REQUIREMENT = keccak256("BPS_FULL_SPEC_REQUIREMENT");

    // ADDITIONAL TOKENS MINTED FOR LP
    bytes32 public constant MIN_ADD_TOKEN_LP_MINT_BPS = keccak256("MIN_ADD_TOKEN_LP_MINT_BPS");
    bytes32 public constant MAX_ADD_TOKEN_LP_MINT_BPS = keccak256("MAX_ADD_TOKEN_LP_MINT_BPS");

    // ADDITIONAL SUPPORT
    bytes32 public constant MAX_SUPPORT_RECEIVERS = keccak256("MAX_SUPPORT_RECEIVERS");

    // LAUNCH
    bytes32 public constant MIN_LAUNCH_DURATION = keccak256("MIN_LAUNCH_DURATION");
    bytes32 public constant MAX_LAUNCH_DURATION = keccak256("MAX_LAUNCH_DURATION");
    bytes32 public constant DEFAULT_LAUNCH_DURATION = keccak256("DEFAULT_LAUNCH_DURATION");
    bytes32 public constant DEFAULT_MINT_PRICE = keccak256("DEFAULT_MINT_PRICE");
    bytes32 public constant MAX_MINT_PRICE = keccak256("MAX_MINT_PRICE");
    bytes32 public constant MAX_FREE_LAUNCHES_PER_ADDRESS = keccak256("MAX_FREE_LAUNCHES_PER_ADDRESS");
    bytes32 public constant BPS_VOID_LAUNCH_FEE = keccak256("BPS_VOID_LAUNCH_FEE");
    bytes32 public constant BPS_VOID_FEE_GENESIS = keccak256("BPS_VOID_FEE_GENESIS");

    // TOKEN TAX
    bytes32 public constant MIN_BUY_SELL_TAX_BPS = keccak256("MIN_BUY_SELL_TAX_BPS");
    bytes32 public constant MAX_BUY_SELL_TAX_BPS = keccak256("MAX_BUY_SELL_TAX_BPS");

    // MIN ETH PARTICIPATION
    bytes32 public constant BASE_ETH_FOR_MAIN_LP = keccak256("BASE_ETH_FOR_MAIN_LP");
    bytes32 public constant ETH_PER_ADDITIONAL_LP = keccak256("ETH_PER_ADDITIONAL_LP");
    bytes32 public constant MIN_ETH_FOR_SECONDARY_LP = keccak256("MIN_ETH_FOR_SECONDARY_LP");

    // BDEFI POINTS PRICES
    bytes32 public constant POINTS_VOTE_PRICE = keccak256("POINTS_VOTE_PRICE");
    bytes32 public constant POINTS_PROFILE_UPDATE_PRICE = keccak256("POINTS_PROFILE_UPDATE_PRICE");
    bytes32 public constant POINTS_MULTIPLIER_DIVIDER = keccak256("POINTS_MULTIPLIER_DIVIDER");

    // BDEFI POINTS AWARD RATES (indexer-only; not enforced on-chain)
    bytes32 public constant POINTS_TOKEN_CREATION = keccak256("POINTS_TOKEN_CREATION");
    bytes32 public constant POINTS_CTO_PURCHASE = keccak256("POINTS_CTO_PURCHASE");
    // Multiplied by tx.value (wei) in handler: pointsAmount18 = POINTS_PER_ETH_MINTED * tx.value
    bytes32 public constant POINTS_PER_ETH_MINTED = keccak256("POINTS_PER_ETH_MINTED");
    // Multiplied by USD trade volume (18-dec): pointsAmount18 = POINTS_TRADE_PER_USD * usdVolume18
    bytes32 public constant POINTS_TRADE_PER_USD = keccak256("POINTS_TRADE_PER_USD");

    // ETH PRICE ORACLE
    bytes32 public constant MAX_ETH_PRICE_STALENESS = keccak256("MAX_ETH_PRICE_STALENESS");
    bytes32 public constant MIN_ETH_PRICE_SEQUENCER_UPTIME = keccak256("MIN_ETH_PRICE_SEQUENCER_UPTIME");

    // OPERATOR REIMBURSE BPS
    bytes32 public constant BPS_MAX_OPERATOR_REIMBURSE = keccak256("BPS_MAX_OPERATOR_REIMBURSE");

    // REFERRAL SYSTEM
    bytes32 public constant BPS_REFERRAL_DISCOUNT = keccak256("BPS_REFERRAL_DISCOUNT");
    bytes32 public constant BPS_REFERRAL_FEE = keccak256("BPS_REFERRAL_FEE");

    // LEADERBOARD
    bytes32 public constant ETH_TRADING_FEES_FOR_AUTO_WL = keccak256("ETH_TRADING_FEES_FOR_AUTO_WL");
    bytes32 public constant EPOCH_FINALIZE_COOLDOWN = keccak256("EPOCH_FINALIZE_COOLDOWN");
    bytes32 public constant LEADERBOARD_PAYOUT_THRESHOLD = keccak256("LEADERBOARD_PAYOUT_THRESHOLD");
    bytes32 public constant LEADERBOARD_PAYOUT_BPS = keccak256("LEADERBOARD_PAYOUT_BPS");

    // CTO
    bytes32 public constant CTO_MIN_INACTIVE_TIME = keccak256("CTO_MIN_INACTIVE_TIME");

    // HOOK
    bytes32 public constant DEFAULT_LOOKBACK_SECONDS = keccak256("DEFAULT_LOOKBACK_SECONDS");
    bytes32 public constant FEE_QUEUE_PROCESS_LIMIT = keccak256("FEE_QUEUE_PROCESS_LIMIT");
}
