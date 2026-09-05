"""Full liquidity scan of every hooked pool, using an RPC that answers.

The first attempt at this returned 1,835 failures out of 2,286 and I kept the 451 that answered —
which is how docs/pools-liquides.json ended up with 199 pools instead of the real number. A failure
is not a zero: every pool that cannot be read is reported as UNKNOWN, never as empty.
"""
import json, os, sys, collections, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tare.keccak import keccak256
from tare.poolid import PoolKey
from tare.consts import POOL_MANAGER
from tare.rpc import call, RpcError

EXTSLOAD = "0x" + keccak256(b"extsload(bytes32)")[:4].hex()

def load_keys(path):
    keys, seen = [], set()
    for l in open(path):
        d = json.loads(l)["data"][2:] if l.strip().startswith("{") else None
        if d is None:
            continue
    return keys

def from_init_logs(path):
    out, seen = [], set()
    for l in json.load(open(path)):
        d = l["data"][2:]
        c0 = "0x" + l["topics"][2][26:]; c1 = "0x" + l["topics"][3][26:]
        fee = int(d[0:64], 16); ts = int(d[64:128], 16); hook = "0x" + d[128+24:192]
        if int(hook, 16) == 0:
            continue
        if ts > 2**255:
            ts -= 2**256
        k = PoolKey(c0, c1, fee, ts, hook)
        pid = k.pool_id().hex()
        if pid in seen:
            continue
        seen.add(pid); out.append(k)
    return out

def read(url, k):
    try:
        raw = call(url, "eth_call",
                   [{"to": POOL_MANAGER, "data": EXTSLOAD + k.liquidity_slot()[2:]}, "latest"], 25)
    except RpcError as e:
        return k, None, str(e)[:80]           # UNKNOWN, jamais 0
    if raw is None or raw == "0x":
        return k, None, "empty_return"
    return k, int(raw, 16), None

def main():
    url = os.environ["BASE_RPC_URL"]
    keys = from_init_logs(sys.argv[1])
    print(f"pools a hook a scanner : {len(keys)}", flush=True)
    liq, unknown = [], []
    done = 0
    with cf.ThreadPoolExecutor(24) as ex:
        for k, v, err in ex.map(lambda x: read(url, x), keys):
            done += 1
            if v is None:
                unknown.append((k, err))
            elif v > 0:
                liq.append((k, v))
            if done % 400 == 0:
                print(f"  …{done}/{len(keys)}  liquides {len(liq)}  inconnus {len(unknown)}", flush=True)
    n = len(keys)
    print(f"\n=== SCAN COMPLET ===")
    print(f"  pools a hook       : {n}")
    print(f"  liquidite NON NULLE: {len(liq)}  ({len(liq)/n:.1%})")
    print(f"  liquidite nulle    : {n-len(liq)-len(unknown)}")
    print(f"  ILLISIBLES         : {len(unknown)}  <- rapportes, jamais comptes comme vides")
    if unknown:
        print("   causes:", collections.Counter(e for _, e in unknown).most_common(3))
    hooks = {k.hooks for k, _ in liq}
    print(f"  hooks avec au moins un pool liquide : {len(hooks)}")
    out = [[k.hooks, [k.currency0, k.currency1, k.fee, k.tick_spacing, k.hooks], str(v),
            bool(k.fee & 0x800000)] for k, v in liq]
    json.dump(out, open(sys.argv[2], "w"))
    print(f"  -> {sys.argv[2]}")

if __name__ == "__main__":
    main()
