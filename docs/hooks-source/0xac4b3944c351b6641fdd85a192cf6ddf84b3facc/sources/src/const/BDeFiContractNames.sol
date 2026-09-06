// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

/// @title BDeFiContractNames
/// @notice Library for storing the BuilDeFi contract name hashes
library BDeFiContractNames {
    bytes32 public constant BDFI_TOKEN = keccak256(bytes("BDFI_TOKEN"));
    bytes32 public constant BOOST = keccak256(bytes("BOOST"));

    bytes32 public constant INT_STAKING = keccak256(bytes("INT_STAKING"));
    bytes32 public constant EXT_STAKING = keccak256(bytes("EXT_STAKING"));

    bytes32 public constant AAVE_STAKING = keccak256(bytes("AAVE_STAKING"));

    bytes32 public constant BUY_BURN = keccak256(bytes("BUY_BURN"));

    bytes32 public constant CONFIG = keccak256(bytes("CONFIG"));

    bytes32 public constant LEADERBOARD = keccak256(bytes("LEADERBOARD"));

    bytes32 public constant CLONER = keccak256(bytes("CLONER"));

    bytes32 public constant POINTS = keccak256(bytes("POINTS"));

    bytes32 public constant LAUNCH = keccak256(bytes("LAUNCH"));

    bytes32 public constant HOOK = keccak256(bytes("HOOK"));

    bytes32 public constant LEGACY_HOOK = keccak256(bytes("LEGACY_HOOK"));

    bytes32 public constant LP_MANAGER = keccak256(bytes("LP_MANAGER"));

    bytes32 public constant WHITELIST = keccak256(bytes("WHITELIST"));

    bytes32 public constant NFT = keccak256(bytes("NFT"));

    bytes32 public constant TAX_DISTRIBUTOR = keccak256(bytes("TAX_DISTRIBUTOR"));
    bytes32 public constant PAYMENTS = keccak256(bytes("PAYMENTS"));
    bytes32 public constant PAYOUTS = keccak256(bytes("PAYOUTS"));
    bytes32 public constant SWAP_HANDLER = keccak256(bytes("SWAP_HANDLER"));
}
