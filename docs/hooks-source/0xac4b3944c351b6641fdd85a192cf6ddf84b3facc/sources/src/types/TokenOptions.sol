// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

// Buy Sell Tax Settings
enum TokenTaxReceivers {
    TOKEN_CREATOR,
    BURN_TOKEN,
    PRIMARY_LP,
    ADDITIONAL_SUPPORT,
    EXTERNAL_STAKING,
    INTERNAL_STAKING,
    TOKEN_LEADERBOARD_POOL
}

// Custom LP Fees Settings
enum LpFeeReceivers {
    ADD_TO_LP,
    TOKEN_CREATOR,
    BUY_AND_BURN
}

// External Stake Settings
enum ExternalStakePlatform {
    NONE,
    AAVE
}

enum ExternalStakeYieldReceiver {
    NONE,
    BUY_AND_BURN,
    INTERNAL_STAKING,
    PRIMARY_LP
}

// Buy&Burn Settings - undecided
enum BuyBurnSpeed {
    NONE, // disabled
    VERY_LOW, // about 300 days
    LOW, // about 200 days
    MEDIUM, // about 100 days
    HIGH, // about 50 days
    VERY_HIGH // about 30 days
}

// Allocation helper structs
struct EthMintAllocations {
    uint16 lps;
    uint16 creator;
    uint16 addSupport;
    uint16 buyBurn;
    uint16 externalStake;
    uint16 platformLb;
    uint16 primaryTokenSupport;
}

struct AddressAlloc {
    address addr;
    uint16 bps;
}

struct TaxAlloc {
    TokenTaxReceivers receiver;
    uint16 bps;
}

struct LpFeeAlloc {
    LpFeeReceivers receiver;
    uint16 bps;
}

struct TokenLaunchOptions {
    // Metadata
    string name;
    string symbol;
    string tokenUri;

    // Launch
    uint64 launchDuration; // duration in seconds
    uint128 mintPrice;
    bool isFreeLaunch;

    // Internal Staking
    bool internalStakingRequested;

    // Eth Distribution
    EthMintAllocations ethAllocs;

    // Tax
    uint16 tokenTaxBps; // The tax percentage on each buy & sell in BPS.
    uint256[] taxReceivers; // List of the buy & sell tax receivers and their allocations. [Packed TaxAlloc struct]

    // External Staking
    ExternalStakePlatform externalStakePlatform; // Platform to stake the ETH in.
    ExternalStakeYieldReceiver externalStakeReceiver; // Receiver of the yield staked in another platform.

    // Buy&Burn
    BuyBurnSpeed buyBurnSpeed; // How fast the Buy&Burn contract balance should be utilized.

    // LP Settings
    uint16 additionalLpTokensMint; // The BPS value of additionaly minted tokens for LP creation.
    uint256[] tokenPools; // token 0 is primary token || Packed AddressAlloc array of Parent Tokens with allocations
    uint256[] customLpFeeAllocations; // Packed LpFeeAlloc array of custom receivers of LP fees with allocations

    // Additional Support
    uint256[] supportReceivers; // Packed AddressAlloc array of Addresses of the additional support receivers and allocations
}

struct TokenDeployModules {
    bool buyBurn;
    bool internalStaking;
    bool externalStaking;
    bool additionalSupport;
}
