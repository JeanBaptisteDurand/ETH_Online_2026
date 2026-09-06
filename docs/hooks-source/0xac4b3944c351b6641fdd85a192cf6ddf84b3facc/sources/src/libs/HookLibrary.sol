// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {TruncatedOracle} from "@libs/oracle/TruncatedOracle.sol";
import {IBDeFiHook} from "@interfaces/IBDeFiHook.sol";
import {IBDeFiCore} from "@interfaces/IBDeFiCore.sol";

import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

import {TickMath} from "@uniswap/v4-core/src/libraries/TickMath.sol";
import {SwapParams} from "@uniswap/v4-core/src/types/PoolOperation.sol";
import {BalanceDelta} from "@uniswap/v4-core/src/types/BalanceDelta.sol";
import {Currency} from "@uniswap/v4-core/src/types/Currency.sol";

import "@types/PoolInfo.sol";

/// @title HookLibrary
/// @notice Helper functions for TWAP observation checks, price quoting, and swap tax deltas.
library HookLibrary {
    /*//////////////////////////////////////////////////////////////
                             TWAP OBSERVATIONS
    //////////////////////////////////////////////////////////////*/

    /// @notice Returns whether the pool has enough observation history for the requested lookback.
    /// @param poolKey Pool key used to read hook oracle state.
    /// @param lookbackTime Lookback window in seconds.
    /// @return missing True when oldest stored observation is newer than lookbackTime.
    function isObservationMissing(PoolKey calldata poolKey, uint256 lookbackTime) public view returns (bool missing) {
        uint32 oldest = getOldestObservationSecondsAgo(poolKey);
        if (oldest < lookbackTime) missing = true;
    }

    /// @notice Returns how many seconds ago the oldest initialized observation was recorded.
    /// @dev Follows Uniswap's `OracleLibrary.getOldestObservationSecondsAgo`.
    /// @param poolKey Pool key used to read hook oracle state.
    /// @return secondsAgo Seconds elapsed since the oldest initialized observation.
    function getOldestObservationSecondsAgo(PoolKey calldata poolKey) public view returns (uint32 secondsAgo) {
        IBDeFiHook hook = IBDeFiHook(address(poolKey.hooks));
        IBDeFiHook.ObservationState memory state = hook.getState(poolKey);
        require(state.cardinality > 0, "NI");

        TruncatedOracle.Observation memory observation =
            hook.getObservation(poolKey, (state.index + 1) % state.cardinality);

        // The next index might not be initialized if the cardinality is in the process of increasing
        // In this case the oldest observation is always in index 0
        if (!observation.initialized) {
            observation = hook.getObservation(poolKey, 0);
        }

        unchecked {
            secondsAgo = uint32(block.timestamp) - observation.blockTimestamp;
        }
    }

    /// @notice Returns TWAP sqrt price for a pool over the requested lookback.
    /// @param poolKey Pool key used to query hook oracle observations.
    /// @param lookbackTime Lookback window in seconds.
    /// @return twapSqrtPriceX96 TWAP sqrt price in Q96 format.
    function getTwapSqrtPriceX96(PoolKey memory poolKey, uint32 lookbackTime)
        public
        view
        returns (uint160 twapSqrtPriceX96)
    {
        // Get the arithmetic mean tick from the oracle
        (int24 arithmeticMeanTick,) = _consult(IBDeFiHook(address(poolKey.hooks)), poolKey, lookbackTime);

        // Get sqrt price from tick
        return TickMath.getSqrtPriceAtTick(arithmeticMeanTick);
    }

    /// @notice Quotes tokenOut amount for tokenIn amount using a sqrt price ratio.
    /// @dev Adapted from Uniswap quoting logic to accept sqrt ratio directly.
    /// @param _sqrtRatioX96 Sqrt price ratio in Q96 format.
    /// @param _tokenAmount Input amount denominated in tokenIn.
    /// @param _tokenIn Input token address.
    /// @param _tokenOut Output token address.
    /// @return quoteAmount Output amount denominated in tokenOut.
    function getQuoteForSqrtRatioX96(uint160 _sqrtRatioX96, uint256 _tokenAmount, address _tokenIn, address _tokenOut)
        public
        pure
        returns (uint256 quoteAmount)
    {
        // Calculate quoteAmount with better precision if it doesn't overflow when multiplied by itself
        if (_sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(_sqrtRatioX96) ** 2;
            quoteAmount = _tokenIn < _tokenOut
                ? Math.mulDiv(ratioX192, _tokenAmount, 1 << 192)
                : Math.mulDiv(1 << 192, _tokenAmount, ratioX192);
        } else {
            uint256 ratioX128 = Math.mulDiv(_sqrtRatioX96, _sqrtRatioX96, 1 << 64);
            quoteAmount = _tokenIn < _tokenOut
                ? Math.mulDiv(ratioX128, _tokenAmount, 1 << 128)
                : Math.mulDiv(1 << 128, _tokenAmount, ratioX128);
        }
    }

    /*//////////////////////////////////////////////////////////////
                             BUY/SELL TAX
    //////////////////////////////////////////////////////////////*/
    /// @notice Computes swap tax delta and tax currency for before or after swap hook path.
    /// @param bdefiCore Core registry used to read token tax settings.
    /// @param params Swap parameters.
    /// @param poolKey Pool key of the active swap.
    /// @param balanceDelta Swap balance delta, used only for after-swap flow.
    /// @param isBeforeSwap True for before-swap tax calculation, false for after-swap.
    /// @return delta Tax amount to collect.
    /// @return taxCurrency Currency in which tax should be collected.
    function getBuySellTaxDelta(
        IBDeFiCore bdefiCore,
        SwapParams calldata params,
        PoolKey calldata poolKey,
        BalanceDelta balanceDelta,
        bool isBeforeSwap
    ) external view returns (int256 delta, Currency taxCurrency) {
        if (isBeforeSwap) {
            (delta, taxCurrency) = applyBuySellTaxBeforeSwap(bdefiCore, params, poolKey);
        } else {
            (delta, taxCurrency) = applyBuySellTaxAfterSwap(bdefiCore, params, poolKey, balanceDelta);
        }
    }

    /// @notice Computes before-swap tax from specified swap amount.
    /// @param bdefiCore Core registry used to read token tax settings.
    /// @param params Swap parameters.
    /// @param poolKey Pool key of the active swap.
    /// @return specifiedDelta Tax amount to apply in before-swap path.
    /// @return taxCurrency Currency in which tax should be collected.
    function applyBuySellTaxBeforeSwap(IBDeFiCore bdefiCore, SwapParams calldata params, PoolKey calldata poolKey)
        internal
        view
        returns (int256 specifiedDelta, Currency taxCurrency)
    {
        // Get the fee currency based on the swap direction and amount sign
        taxCurrency = ((params.amountSpecified < 0) == (params.zeroForOne)) ? poolKey.currency0 : poolKey.currency1;

        uint16 taxBps = bdefiCore.tokenTaxBps(Currency.unwrap(taxCurrency));
        if (taxBps == 0) return (specifiedDelta, taxCurrency);

        uint256 swapAmount =
            params.amountSpecified < 0 ? uint256(-params.amountSpecified) : uint256(params.amountSpecified);

        specifiedDelta = int256((swapAmount * taxBps) / 100_00);
    }

    /// @notice Computes after-swap tax from realized output amount in balanceDelta.
    /// @param bdefiCore Core registry used to read token tax settings.
    /// @param params Swap parameters.
    /// @param poolKey Pool key of the active swap.
    /// @param balanceDelta Swap balance delta returned by pool manager.
    /// @return hookUnspecifiedDelta Tax amount to apply in after-swap path.
    /// @return taxCurrency Currency in which tax should be collected.
    function applyBuySellTaxAfterSwap(
        IBDeFiCore bdefiCore,
        SwapParams calldata params,
        PoolKey calldata poolKey,
        BalanceDelta balanceDelta
    ) internal view returns (int256 hookUnspecifiedDelta, Currency taxCurrency) {
        // Get the fee currency based on the swap direction and amount sign
        taxCurrency = ((params.amountSpecified < 0) == (params.zeroForOne)) ? poolKey.currency1 : poolKey.currency0;

        uint16 taxBps = bdefiCore.tokenTaxBps(Currency.unwrap(taxCurrency));
        if (taxBps == 0) return (hookUnspecifiedDelta, taxCurrency);

        // After-swap tax applies to the output token amount. Use balanceDelta to get the actual output amount.
        int128 deltaForFeeCurrency = Currency.unwrap(taxCurrency) == Currency.unwrap(poolKey.currency0)
            ? balanceDelta.amount0()
            : balanceDelta.amount1();
        uint256 swapAmount = deltaForFeeCurrency < 0 ? uint128(-deltaForFeeCurrency) : uint128(deltaForFeeCurrency);

        hookUnspecifiedDelta = int128(int256((swapAmount * taxBps) / 100_00));
    }

    /*//////////////////////////////////////////////////////////////
                            INTERNAL FUNCTIONS
    //////////////////////////////////////////////////////////////*/

    function _consult(IBDeFiHook hook, PoolKey memory poolKey, uint32 lookbackTime)
        internal
        view
        returns (int24 arithmeticMeanTick, uint128 harmonicMeanLiquidity)
    {
        // Create arrays for oracle query
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = lookbackTime; // Past time
        secondsAgos[1] = 0; // Current time

        // Get tick cumulatives from the oracle
        (int48[] memory tickCumulatives, uint144[] memory secondsPerLiquidityCumulativeX128s) =
            hook.observe(poolKey, secondsAgos);

        int48 tickCumulativesDelta = tickCumulatives[1] - tickCumulatives[0];
        uint144 secondsPerLiquidityCumulativesDelta =
            secondsPerLiquidityCumulativeX128s[1] - secondsPerLiquidityCumulativeX128s[0];

        // Safe casting of lookbackTime to int48 for division
        int48 secondsAgoInt48 = int48(int32(lookbackTime));

        // Calculate arithmetic mean tick
        arithmeticMeanTick = int24(tickCumulativesDelta / secondsAgoInt48);

        // Always round to negative infinity
        if (tickCumulativesDelta < 0 && (tickCumulativesDelta % secondsAgoInt48 != 0)) arithmeticMeanTick--;

        // Safe casting of lookbackTime to uint192 for multiplication
        uint192 secondsAgoUint192 = uint192(lookbackTime);
        harmonicMeanLiquidity = uint128(
            (secondsAgoUint192 * uint192(type(uint160).max)) / (uint192(secondsPerLiquidityCumulativesDelta) << 32)
        );
    }
}
