// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";
import {ERC20} from "solmate/src/tokens/ERC20.sol";
import {SafeTransferLib} from "solmate/src/utils/SafeTransferLib.sol";

import {FlashVenueRegistry} from "../FlashVenueRegistry.sol";
import {FlashVenueFleetOptimizer} from "./FlashVenueFleetOptimizer.sol";
import {IFlashVenueAdapter} from "./IFlashVenueAdapter.sol";

interface IFlashImpactSource {
    function impactInterceptor() external view returns (address);
}

/// @notice Immutable verified-venue executor for sell remainders that a
/// hooked v4 pool cannot consume. Token custody is received directly from the
/// PoolManager and every output is delivered to the authorized executor.
contract FlashSellRemainderRouter {
    using SafeTransferLib for ERC20;

    error NotHook();
    error InvalidConfig();
    error InvalidPlan();

    address public immutable hook;
    FlashVenueRegistry public immutable registry;
    FlashVenueFleetOptimizer public immutable optimizer;

    event ExternalRemainder(bytes32 indexed poolId, bool exactOutput, uint256 input, uint256 output);

    constructor(address hook_, FlashVenueRegistry registry_, FlashVenueFleetOptimizer optimizer_) {
        if (
            hook_ == address(0) || address(registry_).code.length == 0 || address(optimizer_).code.length == 0
                || address(optimizer_.registry()) != address(registry_)
        ) revert InvalidConfig();
        hook = hook_;
        registry = registry_;
        optimizer = optimizer_;
    }

    modifier onlyExecutor() {
        if (msg.sender != hook && msg.sender != IFlashImpactSource(hook).impactInterceptor()) revert NotHook();
        _;
    }

    function executeExactInput(bytes32 poolId, Currency token, Currency quote, uint256 amount)
        external
        onlyExecutor
        returns (uint256 output)
    {
        if (amount == 0 || amount > type(uint128).max) revert InvalidPlan();
        FlashVenueFleetOptimizer.Plan memory plan =
            optimizer.planExactInput(poolId, Currency.unwrap(token), Currency.unwrap(quote), amount);
        if (!plan.found || _planInput(plan) != amount || plan.totalOut == 0) revert InvalidPlan();
        uint256 balanceBefore = ERC20(Currency.unwrap(token)).balanceOf(address(this)) - amount;
        output = _execute(poolId, token, quote, plan, false, msg.sender);
        if (output != plan.totalOut || ERC20(Currency.unwrap(token)).balanceOf(address(this)) != balanceBefore) {
            revert InvalidPlan();
        }
        emit ExternalRemainder(poolId, false, amount, output);
    }

    function quoteExactOutput(bytes32 poolId, Currency token, Currency quote, uint256 output)
        external
        onlyExecutor
        returns (uint256 input)
    {
        FlashVenueFleetOptimizer.Plan memory plan =
            optimizer.planExactOutput(poolId, Currency.unwrap(token), Currency.unwrap(quote), output);
        if (!plan.found || plan.totalOut != output) revert InvalidPlan();
        input = _planInput(plan);
        if (input == 0 || input > type(uint128).max) revert InvalidPlan();
    }

    function executeExactOutput(
        bytes32 poolId,
        Currency token,
        Currency quote,
        uint256 output,
        uint256 expectedInput
    ) external onlyExecutor returns (uint256 input) {
        FlashVenueFleetOptimizer.Plan memory plan =
            optimizer.planExactOutput(poolId, Currency.unwrap(token), Currency.unwrap(quote), output);
        input = _planInput(plan);
        if (!plan.found || plan.totalOut != output || input == 0 || input != expectedInput) revert InvalidPlan();
        uint256 balanceBefore = ERC20(Currency.unwrap(token)).balanceOf(address(this)) - input;
        uint256 executedOutput = _execute(poolId, token, quote, plan, true, msg.sender);
        if (
            executedOutput != output || ERC20(Currency.unwrap(token)).balanceOf(address(this)) != balanceBefore
        ) revert InvalidPlan();
        emit ExternalRemainder(poolId, true, input, output);
    }

    function _execute(
        bytes32 poolId,
        Currency token,
        Currency quote,
        FlashVenueFleetOptimizer.Plan memory plan,
        bool exactOutput,
        address recipient
    ) private returns (uint256 output) {
        for (uint256 i; i < 4; ++i) {
            uint256 routeInput = plan.amountIn[i];
            uint256 routeOutput = plan.amountOut[i];
            if (routeInput == 0) continue;
            FlashVenueRegistry.Venue memory venue = registry.venueAt(poolId, plan.venueIndex[i]);
            if (!venue.enabled || !registry.approvedAdapter(venue.adapter)) revert InvalidPlan();
            ERC20(Currency.unwrap(token)).safeApprove(venue.adapter, routeInput);
            if (exactOutput) {
                uint256 spent = IFlashVenueAdapter(venue.adapter).swapExactOutput(
                    venue.venuePool,
                    Currency.unwrap(token),
                    Currency.unwrap(quote),
                    routeOutput,
                    routeInput,
                    recipient
                );
                if (spent != routeInput) revert InvalidPlan();
            } else {
                uint256 received = IFlashVenueAdapter(venue.adapter).swapExactInput(
                    venue.venuePool,
                    Currency.unwrap(token),
                    Currency.unwrap(quote),
                    routeInput,
                    routeOutput,
                    recipient
                );
                if (received != routeOutput) revert InvalidPlan();
            }
            ERC20(Currency.unwrap(token)).safeApprove(venue.adapter, 0);
            output += routeOutput;
        }
    }

    function _planInput(FlashVenueFleetOptimizer.Plan memory plan) private pure returns (uint256 total) {
        for (uint256 i; i < 4; ++i) total += plan.amountIn[i];
    }
}
