"""Full liquidity scan of every hooked pool, using an RPC that answers.

The first attempt at this returned 1,835 failures out of 2,286 and the 451 that answered were
kept — which is how docs/pools-liquides.json ended up with 199 pools instead of the real number.
A failure is not a zero: every pool that cannot be read is written to a companion file as
UNKNOWN, never dropped and never counted as empty.

Two corrections this file carries.

1. **The block.** The scan used to read `latest`. The measurement fork is pinned at 50,614,000, so
   a pool that was drained yesterday read as empty here and quoted fine there, and one funded
   yesterday read as liquid here and reverted there. Liquidity is now read at the same block the
   sweep measures at — the two files describe the same instant or they describe nothing.

2. **The output tells you what it does not know.** `<out>` holds the pools with non-zero
   liquidity, in the shape `load_pools` expects. `<out>.scan.json` holds the whole census:
   how many were readable, how many read zero, and every pool that could not be read with the
   reason the node gave.

    python3 -m tare.rescan <init-logs.json> <out.json> [block] [workers]
"""
import json, os, sys, collections, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tare.keccak import keccak256
from tare.poolid import PoolKey
from tare.consts import POOL_MANAGER, SLOT0_LP_FEE_SHIFT, U24
from tare.rpc import call, RpcError

EXTSLOAD = "0x" + keccak256(b"extsload(bytes32)")[:4].hex()
BLOCK = 50614000
WORKERS = int(os.environ.get("TARE_SCAN_WORKERS", "12"))


def from_init_logs(path):
    """Initialize events -> the distinct hooked PoolKeys they describe.

    Uniqueness is on the poolId, not on the log: a pool can be re-initialised, and counting it
    twice would inflate every denominator downstream.
    """
    out, seen = [], set()
    for l in json.load(open(path)):
        d = l["data"][2:]
        c0 = "0x" + l["topics"][2][26:]
        c1 = "0x" + l["topics"][3][26:]
        fee = int(d[0:64], 16)
        ts = int(d[64:128], 16)
        hook = "0x" + d[128 + 24:192]
        if int(hook, 16) == 0:
            continue
        if ts > 2**255:
            ts -= 2**256
        k = PoolKey(c0, c1, fee, ts, hook)
        pid = k.pool_id().hex()
        if pid in seen:
            continue
        seen.add(pid)
        out.append(k)
    return out


def read(url, k, block):
    """(key, liquidity, error). `None` liquidity means UNKNOWN — never 0."""
    tag = hex(block) if isinstance(block, int) else block
    try:
        raw = call(url, "eth_call",
                   [{"to": POOL_MANAGER, "data": EXTSLOAD + k.liquidity_slot()[2:]}, tag], 25)
    except RpcError as e:
        return k, None, str(e)[:80]
    if raw is None or raw == "0x":
        return k, None, "empty_return"
    return k, int(raw, 16), None


def main():
    url = os.environ["BASE_RPC_URL"]
    keys = from_init_logs(sys.argv[1])
    out_path = sys.argv[2]
    block = int(sys.argv[3]) if len(sys.argv) > 3 else BLOCK
    workers = int(sys.argv[4]) if len(sys.argv) > 4 else WORKERS

    print(f"pools a hook a scanner : {len(keys)}  au bloc {block}  ({workers} threads)",
          flush=True)
    liq, empty, unknown = [], [], []
    done = 0
    with cf.ThreadPoolExecutor(workers) as ex:
        for k, v, err in ex.map(lambda x: read(url, x, block), keys):
            done += 1
            if v is None:
                unknown.append((k, err))
            elif v > 0:
                liq.append((k, v))
            else:
                empty.append(k)
            if done % 250 == 0:
                print(f"  …{done}/{len(keys)}  liquides {len(liq)}  vides {len(empty)}  "
                      f"inconnus {len(unknown)}", flush=True)

    n = len(keys)
    readable = n - len(unknown)
    print(f"\n=== SCAN COMPLET  bloc {block} ===")
    print(f"  pools a hook       : {n}")
    print(f"  lisibles           : {readable}  ({readable / n:.1%})")
    print(f"  liquidite NON NULLE: {len(liq)}  ({len(liq) / n:.1%} du total, "
          f"{len(liq) / readable:.1%} des lisibles)" if readable else "")
    print(f"  liquidite nulle    : {len(empty)}")
    print(f"  ILLISIBLES         : {len(unknown)}  <- rapportes, jamais comptes comme vides")
    if unknown:
        print("   causes:", collections.Counter(e for _, e in unknown).most_common(3))
    hooks = {k.hooks for k, _ in liq}
    print(f"  hooks avec au moins un pool liquide : {len(hooks)}")

    liq.sort(key=lambda kv: -kv[1])
    out = [[k.hooks, [k.currency0, k.currency1, k.fee, k.tick_spacing, k.hooks], str(v),
            bool(k.fee & 0x800000)] for k, v in liq]
    json.dump(out, open(out_path, "w"))

    census = {
        "block_number": block,
        "source_logs": sys.argv[1],
        "n_hooked_pools": n,
        "n_readable": readable,
        "n_liquid": len(liq),
        "n_zero_liquidity": len(empty),
        "n_unknown": len(unknown),
        "n_hooks_total": len({k.hooks for k in keys}),
        "n_hooks_with_liquid_pool": len(hooks),
        "unknown_causes": collections.Counter(e for _, e in unknown).most_common(10),
        "unknown_pools": [{"pool_id": "0x" + k.pool_id().hex(), "hook": k.hooks, "reason": e}
                          for k, e in unknown],
        "replay": f"python3 -m tare.rescan {sys.argv[1]} {out_path} {block} {workers}",
    }
    json.dump(census, open(out_path + ".scan.json", "w"), indent=1)
    print(f"  -> {out_path}")
    print(f"  -> {out_path}.scan.json  (recensement complet, dont les illisibles)")


if __name__ == "__main__":
    main()
