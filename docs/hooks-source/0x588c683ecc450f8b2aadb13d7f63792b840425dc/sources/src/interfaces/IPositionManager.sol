// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {IPoolManager} from '@uniswap/v4-core/src/interfaces/IPoolManager.sol';
import {PoolId} from '@uniswap/v4-core/src/types/PoolId.sol';
import {PoolKey} from '@uniswap/v4-core/src/types/PoolKey.sol';

import {IBidWall} from '@flaunch-interfaces/IBidWall.sol';
import {IFeeCalculator} from '@flaunch-interfaces/IFeeCalculator.sol';
import {IFeeExemptions} from '@flaunch-interfaces/IFeeExemptions.sol';
import {IInitialPrice} from '@flaunch-interfaces/IInitialPrice.sol';
import {IInternalSwapPool} from '@flaunch-interfaces/IInternalSwapPool.sol';
import {IOracle} from '@flaunch-interfaces/IOracle.sol';
import {IPairedTokenRegistry} from '@flaunch-interfaces/IPairedTokenRegistry.sol';
import {ITreasuryActionManager} from '@flaunch-interfaces/ITreasuryActionManager.sol';
import {FeeDistributor} from '@flaunch/hooks/FeeDistributor.sol';

interface IPositionManager {
    /// Thrown when a pool's launch tick sits so close to the tick domain's edge that no valid
    /// pair of single-sided launch positions exists
    error UnsupportedLaunchTick(int24 _initialTick);

    error CallerIsNotBidWall();
    error CannotBeInitializedDirectly();
    error InsufficientFlaunchFee(uint _paid, uint _required);
    error InsufficientPreminePayment(uint _paid, uint _required);
    error MissingPairedTokenEscrow(address _token);
    error PairedTokenIsMemecoin();
    error PairedTokenNotApproved(address _token);
    error PremineExceedsInitialAmount(uint _buyAmount, uint _initialSupply);

    /// Thrown when a pull-funded (ERC20-paired) premine costs more of the paired token than the
    /// caller's declared maximum. Only the pull-funded shapes can hit this; the ETH-funded shapes
    /// are bounded by `msg.value` and revert {InsufficientPreminePayment} instead.
    error PremineCostExceedsMaximum(uint _cost, uint _maximum);
    error TokenNotFlaunched(uint _flaunchesAt);
    error UnknownMemecoin(address _memecoin);
    error UnknownPool(PoolId _poolId);

    event PoolCreated(
        PoolId indexed _poolId,
        address _memecoin,
        address _memecoinTreasury,
        uint _tokenId,
        bool _currencyFlipped,
        uint _flaunchFee,
        FlaunchParams _params
    );
    event PoolScheduled(PoolId indexed _poolId, uint _flaunchesAt);
    event PoolSwap(
        PoolId indexed poolId,
        int flAmount0,
        int flAmount1,
        int flFee0,
        int flFee1,
        int ispAmount0,
        int ispAmount1,
        int ispFee0,
        int ispFee1,
        int uniAmount0,
        int uniAmount1,
        int uniFee0,
        int uniFee1
    );
    event PoolStateUpdated(
        PoolId indexed _poolId, uint160 _sqrtPriceX96, int24 _tick, uint24 _protocolFee, uint24 _swapFee, uint128 _liquidity
    );
    event InitialPriceUpdated(address _initialPrice);
    event PoolPremine(PoolId indexed _poolId, address _recipient, uint _tokensReceived, uint _ethSpent);

    struct ConstructorParams {
        IPoolManager poolManager;
        FeeDistributor.FeeDistribution feeDistribution;
        IInitialPrice initialPrice;
        address protocolOwner;
        address protocolFeeRecipient;
        address flayGovernance;
        IFeeExemptions feeExemptions;
        ITreasuryActionManager actionManager;
        IBidWall bidWall;
        IInternalSwapPool internalSwapPool;
        IOracle oracle;
        IPairedTokenRegistry pairedTokenRegistry;
    }

    /**
     * @member pairedToken The token the memecoin is paired against. Every value — including
     * `address(0)`, which is real native ETH — must be approved in the {PairedTokenRegistry}. There
     * is no implicit default: a launcher wanting flETH must pass flETH's address explicitly.
     */
    struct FlaunchParams {
        string name;
        string symbol;
        string tokenUri;
        uint premineAmount;
        address creator;
        uint24 creatorFeeAllocation;
        uint flaunchAt;
        bytes initialPriceParams;
        bytes feeCalculatorParams;
        address pairedToken;
    }

    function flaunch(
        FlaunchParams calldata _params
    ) external payable returns (address memecoin_);

    /// {flaunch}, bounding what a pull-funded (ERC20-paired) premine may cost the caller.
    /// `0` = uncapped. Note the overloaded name: ethers-v5/TypeChain consumers must address both
    /// entrypoints by full signature once this exists.
    function flaunch(
        FlaunchParams calldata _params,
        uint _maxPremineCost
    ) external payable returns (address memecoin_);

    function poolKey(
        address _token
    ) external view returns (PoolKey memory);

    function pairedToken(
        PoolId _poolId
    ) external view returns (address);

    function pairedTokenFeeEscrow(
        PoolId _poolId
    ) external view returns (address);

    function pairedTokenBidWallThreshold(
        PoolId _poolId
    ) external view returns (uint);

    function pairedTokenRegistry() external view returns (IPairedTokenRegistry);

    function getFlaunchingFee(
        bytes calldata _initialPriceParams
    ) external view returns (uint);

    function getFlaunchingMarketCap(
        bytes calldata _initialPriceParams
    ) external view returns (uint);

    function initialPoolTick(
        PoolId _poolId
    ) external view returns (int24);
}
