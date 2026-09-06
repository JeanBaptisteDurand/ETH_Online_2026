// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.26;
import {PoolKey} from "@uniswap/v4-core/src/types/PoolKey.sol";
import {PoolId} from "@uniswap/v4-core/src/types/PoolId.sol";
import {PathKey} from "@uniswap/v4-periphery/src/libraries/PathKey.sol";

/*//////////////////////////////////////////////////////////////
                            ENUMS
//////////////////////////////////////////////////////////////*/
enum WhitelistType {
    DISABLED, // Default
    INTERNAL, // Tokens launched on BuilDeFi protocol
    EXTERNAL // External tokens
}

enum PoolType {
    NONE,
    EXTERNAL, // External whitelisted tokens
    DEFAULT, // 1 Full-Range Position
    FULL_SPEC // 2 SSL + 1 Full-Range Positions
}

enum ExternalPoolType {
    NONE,
    V3,
    V4
}

enum ModifyLiquidityAction {
    MINT_POSITION,
    ADD_LIQUIDITY,
    REMOVE_LIQUIDITY
}

/*//////////////////////////////////////////////////////////////
                            STRUCTS
//////////////////////////////////////////////////////////////*/

struct PoolPositionInfo {
    uint256 fullRangeId;
    uint256 tokenSslId;
    uint256 parentSslId;
}

struct PoolCoreInfo {
    address token;
    address parentToken;
    PoolType poolType;
    bool isParentToken0;
}

struct PoolBalance {
    uint256 eth;
    uint256 parentToken;
    uint256 token;
}

struct LiquidityActionArgs {
    uint256 amount0;
    uint256 amount1;
    uint256 positionId;
    int24 tickLower;
    int24 tickUpper;
}

/// Edge: token -> parent
struct ExternalPoolInfo {
    address parent; // ETH, WETH, or an already whitelisted EXTERNAL token
    ExternalPoolType poolType; // V3 or V4
    PoolKey poolKey; // shared for V3 and V4
}

/// Precomputed route segments:
struct ComputedRoute {
    bytes v3Path;
    PathKey[] v4Path;
}

struct ExternalWhitelistRequest {
    PoolKey poolKey;
    bool isUniswapV4;
}
