// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TokenLaunchOptions, BuyBurnSpeed} from "@types/TokenOptions.sol";

/// @title IBDeFiCore
/// @notice Protocol entrypoint and registry for launch, CTO, and module wiring.
interface IBDeFiCore {
    /*//////////////////////////////////////////////////////////////
                                EVENTS
    //////////////////////////////////////////////////////////////*/

    /// @notice Emitted after a new BuilDeFi token is launched.
    /// @param token Address of the launched token
    /// @param creator Address that initiated the launch
    /// @param options Launch configuration used during deployment
    event TokenLaunch(address indexed token, address indexed creator, TokenLaunchOptions options);

    /// @notice Emitted when a core registry contract address is updated.
    /// @param name Registry key (BDeFiContractNames) that was updated
    /// @param newContract New contract address bound to name
    event CoreContractUpdated(bytes32 indexed name, address newContract);

    /// @notice Emitted when an operator address is updated for a registry key.
    /// @param name Registry key (BDeFiContractNames) whose operator was updated
    /// @param newOperator New operator address bound to name
    event OperatorUpdated(bytes32 indexed name, address newOperator);

    /// @notice Emitted when an address is granted or revoked protocol-contract status.
    /// @param addr Address whose status changed
    /// @param allowed True when authorised, false when revoked
    event ProtocolContractUpdated(address indexed addr, bool allowed);

    /// @notice Emitted when a launched token metadata URI is updated.
    /// @param token Token whose URI was changed
    /// @param tokenUri New metadata URI
    event TokenUriUpdated(address indexed token, string tokenUri);

    /// @notice Emitted when a hook is registered.
    /// @param hook Hook address added to the hook set
    event HookAdded(address indexed hook);

    /// @notice Emitted when a hook is deregistered.
    /// @param hook Hook address removed from the hook set
    event HookRemoved(address indexed hook);

    /// @notice Emitted when a launched token's stored swap routes are recomputed.
    /// @param token Token whose routes were rebuilt
    /// @param caller Address that triggered the rebuild
    event TokenRoutesRebuilt(address indexed token, address indexed caller);

    /*//////////////////////////////////////////////////////////////
                                ERRORS
    //////////////////////////////////////////////////////////////*/
    error BDeFiCore_ProtocolInactive();
    error BDeFiCore_InvalidToken();
    error BDeFiCore_ModuleUpToDate();

    /*//////////////////////////////////////////////////////////////
                             PUBLIC FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Initializes the core contract once.
    /// @param _owner Address granted the initial admin role
    /// @param genesisTimestamp Timestamp used as the protocol genesis reference point
    function initialize(address _owner, uint256 genesisTimestamp) external;

    /// @notice Launches a new BuilDeFi token and its configured modules.
    /// @param opts Launch configuration payload
    /// @param paymentToken Address of token used to pay launch fee (address(0) for native ETH)
    /// @return newToken Address of the newly deployed BuilDeFi token
    function launch(TokenLaunchOptions calldata opts, address paymentToken) external payable returns (address newToken);

    /// @notice Executes community takeover (CTO) purchase flow for a token.
    /// @param token Token address targeted for CTO purchase
    /// @param newOwner Address receiving token ownership after purchase
    /// @param paymentToken Address of token used to pay CTO fee (address(0) for native ETH)
    function purchaseCtoToken(address token, address newOwner, address paymentToken) external payable;

    /// @notice Updates metadata URI for a launched token.
    /// @param token Launched token address
    /// @param tokenUri New metadata URI
    function updateTokenUri(address token, string calldata tokenUri) external;

    /// @notice Recomputes and stores a launched token's canonical swap routes from current
    /// whitelist and core state. Permissionless.
    /// @param token Launched token whose routes are recomputed
    function rebuildTokenRoutes(address token) external;

    /// @notice Deploys a newer external staking module version and migrates assets from the current module.
    /// @param token Launched token whose external staking module should be upgraded
    function upgradeExternalStaking(address token) external;

    /*//////////////////////////////////////////////////////////////
                            PROTOCOL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Deployes and initializes buy-and-burn module.
    /// @param bdefiToken Token address module is attached to
    /// @param speed Buy and burn execution speed setting
    /// @return buyBurn Address of deployed buy-and-burn clone
    function deployBuyBurn(address bdefiToken, BuyBurnSpeed speed) external returns (address buyBurn);

    /*//////////////////////////////////////////////////////////////
                             ADMIN FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Sets a protocol contract address in the core registry.
    /// @param name Registry key (BDeFiContractNames)
    /// @param _address New contract address
    function setContract(bytes32 name, address _address) external;

    /// @notice Sets operator address for a registry key.
    /// @param name Registry key (BDeFiContractNames)
    /// @param _address New operator address
    function setOperator(bytes32 name, address _address) external;

    /*//////////////////////////////////////////////////////////////
                              VIEW FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns whether an account has protocol admin role.
    /// @param account Address to check
    function hasAdminRole(address account) external view returns (bool);

    /// @notice Returns whether token address is external to launched BuilDeFi tokens.
    /// @param token Token address to classify
    /// @return isExternal True if token is not native ETH and not a launched BuilDeFi token
    function isExternalToken(address token) external view returns (bool);

    /// @notice Returns contract address stored for a registry key.
    /// @param name Registry key (BDeFiContractNames)
    /// @return contractAddress Address registered for name
    function getContract(bytes32 name) external view returns (address);

    /// @notice Returns the hook a token's pools were created against.
    /// @param token Launched token address
    /// @return hook Hook address bound to the token
    function getTokenHook(address token) external view returns (address hook);

    /// @notice Grants or revokes protocol-contract status for an address.
    /// @param addr Address to update
    /// @param allowed True to authorise, false to revoke
    function setProtocolContract(address addr, bool allowed) external;

    /// @notice Registers a hook explicitly.
    /// @param hook Hook address to register
    function addHook(address hook) external;

    /// @notice Removes a hook from the set.
    /// @param hook Hook address to deregister
    function removeHook(address hook) external;

    /// @notice Returns whether an address is a registered hook.
    /// @param hook Address to check
    function isHook(address hook) external view returns (bool);

    /// @notice Returns the number of registered hooks.
    function hookCount() external view returns (uint256);

    /// @notice Returns the registered hook at an index.
    /// @param index Position in the hook set
    function hookAt(uint256 index) external view returns (address);

    /// @notice Returns every registered hook.
    function hooks() external view returns (address[] memory);

    /// @notice Returns operator address stored for a registry key.
    /// @param name Registry key (BDeFiContractNames)
    /// @return operator Address registered as operator for name
    function getOperator(bytes32 name) external view returns (address);

    /// @notice Returns deployed module address for a launched token and module key.
    /// @param token Launched token address
    /// @param name Module key (BDeFiContractNames)
    /// @return module Address of the token module for token and name
    function getTokenModule(address token, bytes32 name) external view returns (address);

    /// @notice Returns current owner of a launched token.
    /// @param token Launched token address
    /// @return owner Current owner address resolved through the ownership NFT
    function getTokenOwner(address token) external view returns (address);

    /// @notice Returns additional support allocation entries for a launched token.
    /// @param token Launched token address
    /// @return allocations Packed AddressAlloc entries
    function getTokenAdditionalSupport(address token) external view returns (uint256[] memory);

    /// @notice Global genesis timestamp anchor used by protocol modules.
    function GENESIS_TIMESTAMP() external view returns (uint256);

    /// @notice Is the address part of the BuilDeFi protocol core contracts.
    /// @param addr Address to query
    function isProtocolContract(address addr) external view returns (bool);

    /// @notice Ownership NFT token ID mapped to a launched token.
    /// @param token Launched token address
    /// @return tokenId Ownership NFT token ID
    function tokenIds(address token) external view returns (uint256);

    /// @notice Primary token configured for a launched token.
    /// @param token Launched token address
    /// @return primaryToken Primary token address
    function primaryTokens(address token) external view returns (address);

    /// @notice Buy/sell tax basis points configured for a launched token.
    /// @param token Launched token address
    /// @return bps Tax basis points
    function tokenTaxBps(address token) external view returns (uint16);
}
