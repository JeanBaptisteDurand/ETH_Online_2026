// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// Minimal production interfaces for the canonical Base Uniswap v4 PoolManager
/// (0x498581fF718922c3f8e6A244956aF099B2652b2b). Only the surface the Model A vault uses.

type Currency is address;
type BalanceDelta is int256;

function amt0(BalanceDelta d) pure returns (int128) {
    return int128(BalanceDelta.unwrap(d) >> 128);
}

function amt1(BalanceDelta d) pure returns (int128) {
    return int128(BalanceDelta.unwrap(d));
}

struct PoolKey {
    Currency currency0;
    Currency currency1;
    uint24 fee;
    int24 tickSpacing;
    address hooks;
}

struct ModifyLiquidityParams {
    int24 tickLower;
    int24 tickUpper;
    int256 liquidityDelta;
    bytes32 salt;
}

interface IPoolManagerV4 {
    function unlock(bytes calldata data) external returns (bytes memory);
    function initialize(PoolKey memory key, uint160 sqrtPriceX96) external returns (int24 tick);
    function modifyLiquidity(PoolKey memory key, ModifyLiquidityParams memory params, bytes calldata hookData)
        external
        returns (BalanceDelta callerDelta, BalanceDelta feesAccrued);
    function sync(Currency currency) external;
    function settle() external payable returns (uint256 paid);
    function take(Currency currency, address to, uint256 amount) external;

    /// ERC-6909 claim accounting. Used ONLY as a v4-native fallback for EARNED FEE deltas that cannot
    /// currently be transferred as the underlying ERC-20 (a paused or blacklisting quote asset, an
    /// unreachable recipient). `mint` clears a positive delta WITHOUT any ERC-20 transfer; `burn`
    /// recreates that delta so a later `take` can deliver the underlying. Principal never touches this.
    function mint(address to, uint256 id, uint256 amount) external;
    function burn(address from, uint256 id, uint256 amount) external;
    function balanceOf(address owner, uint256 id) external view returns (uint256);
}

/// v4 derives an ERC-6909 id from the currency address.
function currencyId(Currency c) pure returns (uint256) {
    return uint256(uint160(Currency.unwrap(c)));
}

interface IUnlockCallbackV4 {
    function unlockCallback(bytes calldata data) external returns (bytes memory);
}

interface IERC20V4 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address who) external view returns (uint256);
}

interface IStateViewV4 {
    function getSlot0(bytes32 poolId)
        external
        view
        returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee);
}
