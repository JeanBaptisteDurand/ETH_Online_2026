// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;

import "@types/TokenOptions.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";

/// @title IBDeFiConfig
/// @notice Interface for protocol launch and configuration validation/settings.
interface IBDeFiConfig {
    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/
    /// @notice Emitted when a uint16 config value is updated.
    /// @param name Config key
    /// @param oldValue Previous value
    /// @param newValue New value
    event Uint16VariableChanged(bytes32 indexed name, uint16 oldValue, uint16 newValue);

    /// @notice Emitted when a uint256 config value is updated.
    /// @param name Config key
    /// @param oldValue Previous value
    /// @param newValue New value
    event Uint256VariableChanged(bytes32 indexed name, uint256 oldValue, uint256 newValue);

    /// @notice Emitted when free-launch mode is toggled.
    /// @param oldStatus Previous free-launch status
    /// @param newStatus New free-launch status
    event FreeLaunchEnabledToggle(bool oldStatus, bool newStatus);

    /// @notice Emitted when protocol genesis receiver is updated.
    /// @param oldAddress Previous protocol genesis address
    /// @param newAddress New protocol genesis address
    event PlatformGenesisUpdate(address oldAddress, address newAddress);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error BDeFiConfig__TokenProhibited();
    error BDeFiConfig__InvalidPrimaryLp();
    error BDeFiConfig__InvalidEthAllocationSum();
    error BDeFiConfig__InvalidLpEthAllocation();
    error BDeFiConfig__InvalidLbEthAllocation();
    error BDeFiConfig__InvalidCreatorAllocation();
    error BDeFiConfig__InvalidSupportAllocation();
    error BDeFiConfig__InvalidSupportReceiver();
    error BDeFiConfig__InvalidLpArray();
    error BDeFiConfig__InvalidLpAllocation();
    error BDeFiConfig__InvalidString(string);
    error BDeFiConfig__DuplicatePool(address);
    error BDeFiConfig__DuplicateSupport(address);
    error BDeFiConfig__InvalidBuyBurnSpeed();
    error BDeFiConfig__InvalidBuyBurnAllocation();
    error BDeFiConfig__InvalidExtStakeAllocation();
    error BDeFiConfig__InvalidExtStakePlatform();
    error BDeFiConfig__InvalidExtStakeReceiver();
    error BDeFiConfig__FreeLaunchDisabled();
    error BDeFiConfig__InvalidLaunchDuration();
    error BDeFiConfig__InvalidMintPrice();
    error BDeFiConfig__InvalidTokensForLpMint();
    error BDeFiConfig__InvalidTaxReceivers();
    error BDeFiConfig__InvalidTaxAllocations();
    error BDeFiConfig__InvalidTokenTax();
    error BDeFiConfig__DuplicateTaxReceiver();
    error BDeFiConfig__InvalidCustomLpFee();
    error BDeFiConfig__DuplicateLpFeeReceiver();
    error BDeFiConfig__MaxFreeLaunchesExceeded();

    /*//////////////////////////////////////////////////////////////
                          PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Initializes the config module.
    /// @param _bdefiCore Core registry contract address
    /// @param _version Version identifier for this deployment
    /// @param _platformGenesis Protocol genesis address for fee/payout routing
    function initialize(address _bdefiCore, uint16 _version, address _platformGenesis) external;

    /// @notice Validates token launch options and returns fee + derived modules flags.
    /// @param opts Token launch options to validate
    /// @param account Address initiating token launch
    /// @return totalFee Total launch fee in USD (2 decimals precision)
    /// @return primaryToken Primary LP token derived from LP structure
    /// @return modules Derived module deployment flags
    function validateLaunchOptions(TokenLaunchOptions calldata opts, address account)
        external
        returns (uint256 totalFee, address primaryToken, TokenDeployModules memory modules);

    /*//////////////////////////////////////////////////////////////
                             ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Sets uint16 config value for a key.
    /// @param nameHash Config key hash
    /// @param value New config value
    function setUint16ConfigVariable(bytes32 nameHash, uint16 value) external;

    /// @notice Sets uint256 config value for a key.
    /// @param nameHash Config key hash
    /// @param value New config value
    function setUint256ConfigVariable(bytes32 nameHash, uint256 value) external;

    /// @notice Toggles free-launch mode.
    /// @param _freeLaunchEnabled New free-launch status
    function setFreeLaunchEnabled(bool _freeLaunchEnabled) external;

    /// @notice Sets protocol genesis address.
    /// @param _platformGenesis New protocol genesis address
    function setPlatformGenesis(address _platformGenesis) external;

    /// @notice Sets custom TWAP lookback window for a pool.
    /// @param poolId Uniswap V4 pool identifier
    /// @param lookbackTime Lookback time in seconds (0 resets to default behavior)
    function setPoolLookbackConfig(PoolId poolId, uint256 lookbackTime) external;

    /*//////////////////////////////////////////////////////////////
                              VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/
    /// @notice Protocol genesis address for fee/payout routing.
    function protocolGenesis() external view returns (address);

    /// @notice Free-launch status flag.
    function freeLaunchEnabled() external view returns (bool);

    /// @notice Returns uint16 config value for a key.
    /// @param name Config key hash
    function uint16Values(bytes32 name) external view returns (uint16);

    /// @notice Returns uint256 config value for a key.
    /// @param name Config key hash
    function uint256Values(bytes32 name) external view returns (uint256);

    /// @notice Calculates launch fee in USD (2 decimals precision) for validated options/modules.
    /// @param opts Token launch options
    /// @param modules Derived module deployment flags
    /// @return totalFee Total launch fee in USD (2 decimals precision)
    function calculateLaunchFeeUsd(TokenLaunchOptions calldata opts, TokenDeployModules memory modules)
        external
        view
        returns (uint256 totalFee);

    /// @notice Returns pool-specific TWAP lookback config (or default when unset).
    /// @param poolId Uniswap pool identifier (V4 style, re-used for V3)
    /// @return lookbackTime Lookback time in seconds
    function getPoolLookbackConfig(PoolId poolId) external view returns (uint256 lookbackTime);
}
