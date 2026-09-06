// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {PoolId} from '@uniswap/v4-core/src/types/PoolId.sol';

import {IPairedTokenRegistry} from '@flaunch-interfaces/IPairedTokenRegistry.sol';

interface IFeeEscrow {
    error RecipientZeroAddress();

    /// Thrown when the ETH sent with `allocateFees` does not match the amount for a native-ETH
    /// allocation (or when ETH is sent with an ERC20 allocation / a zero-amount allocation)
    error IncorrectNativeDeposit();

    /// Thrown when the escrow is constructed without a {PairedTokenRegistry}
    error RegistryZeroAddress();

    /// Thrown when the escrow is constructed with, or repointed at, a zero indexer — every
    /// allocation reads `indexer.poolIndex`, so a zero indexer would brick fee distribution
    error IndexerZeroAddress();

    event Deposit(PoolId indexed _poolId, address _payee, address _token, uint _amount);

    /// Emitted once per escrowed token withdrawn. `_token` is the escrow-token KEY (the mirror of
    /// {Deposit._token}; `address(0)` = raw native ETH) — indexers attribute the zeroed balance by
    /// it exactly. `_deliveredAsset` is what was actually transferred: the registry's payout asset
    /// under an unwrap (ETH for flETH, USDC for flUSDC), or `_token` itself on the raw path.
    /// Already-deployed legacy escrows emit the pre-singleton 4-param shape without the key.
    event Withdrawal(address _sender, address _recipient, address _token, address _deliveredAsset, uint _amount);

    function pairedTokenRegistry() external view returns (IPairedTokenRegistry pairedTokenRegistry_);

    function balances(
        address _recipient,
        address _token
    ) external view returns (uint amount_);

    function totalFeesAllocated(
        PoolId _poolId,
        address _token
    ) external view returns (uint amount_);

    function allocateFees(
        PoolId _poolId,
        address _token,
        address _recipient,
        uint _amount
    ) external payable;

    function withdrawFees(
        address _token,
        address _recipient,
        bool _unwrap
    ) external;

    function withdrawFees(
        address[] calldata _tokens,
        address _recipient,
        bool _unwrap
    ) external;

    function setIndexer(
        address _indexer
    ) external;
}
