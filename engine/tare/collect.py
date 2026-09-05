"""Collect Initialize events over a wide window.

The first corpus covered 24,000 blocks (13 h) because a public RPC could not serve more. With a
keyed endpoint the window is a choice, not a limit. Every chunk that fails is reported, and the
run refuses to publish a total that includes a gap it did not read.
"""
import json, os, sys, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tare.consts import POOL_MANAGER, TOPIC_INITIALIZE
from tare.rpc import call, RpcError

CHUNK = 2000

def main():
    url = os.environ["BASE_RPC_URL"]
    end = int(sys.argv[1]) if len(sys.argv) > 1 else int(call(url, "eth_blockNumber", []), 16)
    span = int(sys.argv[2]) if len(sys.argv) > 2 else 200_000
    out_path = sys.argv[3]
    ranges = [(end - i - CHUNK, end - i) for i in range(0, span, CHUNK)]
    print(f"fenetre : {span:,} blocs jusqu'a {end:,}  ({span*2/86400:.1f} jours), {len(ranges)} tranches", flush=True)

    def fetch(r):
        a, b = r
        for _ in range(3):
            try:
                return r, call(url, "eth_getLogs",
                               [{"address": POOL_MANAGER, "topics": [TOPIC_INITIALIZE],
                                 "fromBlock": hex(a), "toBlock": hex(b)}], 40)
            except RpcError as e:
                last = str(e)[:70]
        return r, None

    logs, failed = [], []
    done = 0
    with cf.ThreadPoolExecutor(16) as ex:
        for r, res in ex.map(fetch, ranges):
            done += 1
            if isinstance(res, list):
                logs += res
            else:
                failed.append(r)
            if done % 20 == 0:
                print(f"  …{done}/{len(ranges)}  logs {len(logs)}  tranches KO {len(failed)}", flush=True)

    print(f"\n  evenements Initialize : {len(logs)}")
    print(f"  tranches en echec     : {len(failed)}  <- un trou lu est un trou declare")
    if failed:
        print(f"     couverture reelle  : {(len(ranges)-len(failed))/len(ranges):.1%} de la fenetre")
    hooked = [l for l in logs if int("0x" + l["data"][2:][128+24:192], 16) != 0]
    hooks = {"0x" + l["data"][2:][128+24:192] for l in hooked}
    print(f"  pools avec hook       : {len(hooked)}")
    print(f"  hooks distincts       : {len(hooks)}")
    json.dump(logs, open(out_path, "w"))
    print(f"  -> {out_path}")

if __name__ == "__main__":
    main()
