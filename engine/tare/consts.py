"""Addresses and selectors. Every value here is checked by a test in tests/test_consts.py."""

# Uniswap v4 on Base
POOL_MANAGER = "0x498581ff718922c3f8e6a244956af099b2652b2b"
V4_QUOTER    = "0x0d5e0f971ed27fbff6c2837bf31316121532048d"
CHAIN_ID     = 8453

# PoolManager storage: `mapping(PoolId => Pool.State) pools` lives at slot 6.
# Within Pool.State: slot0 at +0, feeGrowthGlobal0 at +1, feeGrowthGlobal1 at +2, liquidity at +3.
POOLS_SLOT       = 6
OFF_SLOT0        = 0
OFF_LIQUIDITY    = 3

# slot0 packing (v4-core Slot0.sol), from the low end:
#   sqrtPriceX96 [0..159] | tick [160..183] | protocolFee [184..207] | lpFee [208..231]
SLOT0_LP_FEE_SHIFT       = 208
SLOT0_PROTOCOL_FEE_SHIFT = 184
SLOT0_TICK_SHIFT         = 160
U24 = (1 << 24) - 1

# A PoolKey fee with this bit set means the hook sets the fee per swap.
DYNAMIC_FEE_FLAG = 0x800000

# Event Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)
TOPIC_INITIALIZE = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438"

# IHooks.beforeSwap.selector — the stub must echo this one back.
SEL_BEFORE_SWAP = "575e24b4"
