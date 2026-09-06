// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Ownable} from '@solady/auth/Ownable.sol';

import {AccessControl} from '@openzeppelin/contracts/access/AccessControl.sol';

import {Currency} from '@uniswap/v4-core/src/types/Currency.sol';
import {PoolId} from '@uniswap/v4-core/src/types/PoolId.sol';

import {PairedTokenLib} from '@flaunch/libraries/PairedTokenLib.sol';
import {ProtocolRoles} from '@flaunch/libraries/ProtocolRoles.sol';
import {PoolSwap} from '@flaunch/zaps/PoolSwap.sol';

import {IPairedTokenRegistry} from '@flaunch-interfaces/IPairedTokenRegistry.sol';
import {IReferralEscrow} from '@flaunch-interfaces/IReferralEscrow.sol';

/**
 * When a user referrers someone that then actions a swap, their address is passed in the `hookData`. This
 * user will then receive a referral fee of the unspecified token amount. This amount will be moved to this
 * escrow contract to be claimed at a later time.
 */
contract ReferralEscrow is IReferralEscrow, AccessControl, Ownable {
    /// PoolSwap contract for performing swaps
    PoolSwap public poolSwap;

    /// The paired-token registry used to resolve each claimed token's unwrap policy.
    ///
    /// @dev A constructor binding with a zero-address check, matching {FeeEscrow}. It was
    /// previously a plain setter-backed variable, unset at construction and unchecked on write:
    /// setting it to zero made {claimTokens}'s config call ABI-decode empty returndata and revert,
    /// bricking claims for every referrer and every token at once, permanently if ownership had
    /// been renounced. An unwired escrow is now unconstructible, so no such state exists.
    IPairedTokenRegistry public immutable pairedTokenRegistry;

    /// Mapping to track token allocations by user and token
    mapping(address _user => mapping(address _token => uint _amount)) public allocations;

    /**
     * Constructor to initialize the protocol owner and bind the paired-token registry.
     *
     * @param _protocolOwner The address of the protocol owner
     * @param _pairedTokenRegistry The {PairedTokenRegistry} resolving unwrap policies
     */
    constructor(
        address _protocolOwner,
        address _pairedTokenRegistry
    ) {
        if (_pairedTokenRegistry == address(0)) {
            revert RegistryZeroAddress();
        }

        pairedTokenRegistry = IPairedTokenRegistry(_pairedTokenRegistry);

        // Set our caller to have the default admin of protocol roles
        _grantRole(DEFAULT_ADMIN_ROLE, _protocolOwner);
        _initializeOwner(_protocolOwner);
    }

    /**
     * Function to update the PoolSwap contract address (only owner can call this).
     *
     * @dev This function is deprecated and will be removed in a future version.
     *
     * @param _poolSwap The new address that will handle pool swaps
     */
    function setPoolSwap(
        address _poolSwap
    ) external onlyOwner {
        poolSwap = PoolSwap(_poolSwap);
    }

    /**
     * Function to assign tokens to a user with a PoolId included in the event.
     *
     * @dev Only an approved {PositionManager} contract can make this call.
     *
     * @param _poolId The PoolId that generated referral fees
     * @param _user The user that received the referral fees
     * @param _token The token that the fees are paid in
     * @param _amount The amount of fees granted to the user
     */
    function assignTokens(
        PoolId _poolId,
        address _user,
        address _token,
        uint _amount
    ) external onlyPositionManager {
        // If no amount is passed, then we have nothing to process
        if (_amount == 0) {
            return;
        }

        allocations[_user][_token] += _amount;
        emit TokensAssigned(_poolId, _user, _token, _amount);
    }

    /**
     * Function for a user to claim tokens across multiple token addresses, unwrapping each to its
     * underlying asset.
     *
     * @param _tokens The tokens to be claimed by the caller
     * @param _recipient The recipient of the claim
     */
    function claimTokens(
        address[] calldata _tokens,
        address payable _recipient
    ) external {
        _claimTokens(_tokens, _recipient, true);
    }

    /**
     * Function for a user to claim tokens across multiple token addresses, choosing whether to
     * unwrap.
     *
     * @dev The `_unwrap = false` path is an escape hatch, mirroring {FeeEscrow.withdrawFees}.
     * Unwrapping is a call into the wrapper, so a paused or otherwise broken wrapper would
     * otherwise leave every allocation of that token permanently unclaimable with no alternative
     * route. Claiming the wrapper itself always remains possible.
     *
     * @param _tokens The tokens to be claimed by the caller
     * @param _recipient The recipient of the claim
     * @param _unwrap Whether to unwrap each balance into its token's underlying asset
     */
    function claimTokens(
        address[] calldata _tokens,
        address payable _recipient,
        bool _unwrap
    ) external {
        _claimTokens(_tokens, _recipient, _unwrap);
    }

    /**
     * Claims the caller's full allocation of each token.
     *
     * @param _tokens The tokens to be claimed by the caller
     * @param _recipient The recipient of the claim
     * @param _unwrap Whether to unwrap each balance into its token's underlying asset
     */
    function _claimTokens(
        address[] calldata _tokens,
        address payable _recipient,
        bool _unwrap
    ) internal {
        address token;
        uint amount;
        for (uint i; i < _tokens.length; ++i) {
            token = _tokens[i];
            amount = allocations[msg.sender][token];

            // If there is nothing to claim, skip next steps
            if (amount == 0) {
                continue;
            }

            // Update allocation before transferring to prevent reentrancy attacks
            allocations[msg.sender][token] = 0;

            if (_unwrap) {
                // Pay out the claimed token, unwrapping registered wrappers to their underlying
                // asset (flETH -> ETH, flUSDC -> USDC) and transferring any other token (e.g. a
                // memecoin) directly. The registry is a constructor binding, so no registry-less
                // fallback exists.
                PairedTokenLib.payout(pairedTokenRegistry, token, _recipient, amount);
            } else {
                // Forward the escrowed token as-is. The library's uniform send handles an ERC20
                // and raw native ETH (`token == address(0)`) alike.
                PairedTokenLib.pay(Currency.wrap(token), _recipient, amount);
            }

            emit TokensClaimed(msg.sender, _recipient, token, amount);
        }
    }

    /**
     * Override to return true to make `_initializeOwner` prevent double-initialization.
     *
     * @return bool Set to `true` to prevent owner being reinitialized.
     */
    function _guardInitializeOwner() internal pure override returns (bool) {
        return true;
    }

    /**
     * Ensures that only an approved {PositionManager} can call the function.
     */
    modifier onlyPositionManager() {
        if (!hasRole(ProtocolRoles.POSITION_MANAGER, msg.sender)) {
            revert NotPositionManager();
        }
        _;
    }

    /**
     * Allows the contract to receive ETH from wrapper withdrawals during unwrapped claims.
     */
    receive() external payable {}
}
