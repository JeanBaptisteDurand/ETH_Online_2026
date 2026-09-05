"""Collect Initialize events over a wide window.

The first corpus covered 24,000 blocks (13 h) because a public RPC could not serve more. With a
keyed endpoint the window is a choice, not a limit. Every chunk that fails is reported *and
written down* next to the logs, and the run refuses to publish a total that includes a gap it did
not read.

Two things this file learned the hard way.

1. **`eth_getLogs` is inclusive on both ends.** `fromBlock=a, toBlock=a+CHUNK` covers CHUNK+1
   blocks, not CHUNK. With the old tiling every boundary block was fetched twice, and against an
   endpoint that caps the range at 10 blocks every single request was rejected as 11 blocks wide.
   The tiling here is exact: `[a, a + CHUNK - 1]`, and the events are de-duplicated on
   `(blockNumber, logIndex)` anyway so an overlap could never inflate a count.

2. **A gap has to survive the run.** Printing "3 chunks failed" and then writing only the logs
   turns an incomplete read into a file that looks complete. `<out>.manifest.json` carries the
   window, the chunk size, the exact block ranges that never answered, and the resulting coverage.
   A reader who does not open the manifest still cannot be misled: `coverage` is repeated in the
   log of the run and any gap makes it < 1.

    python3 -m tare.collect <end_block> <span> <out.json> [chunk] [workers]
"""
import json, os, sys, concurrent.futures as cf
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from tare.consts import POOL_MANAGER, TOPIC_INITIALIZE
from tare.rpc import call, RpcError

# 10 is what a free-tier Alchemy key serves; a paid endpoint happily does 2000. Passing it in
# means the same file works against both instead of failing every request against one of them.
CHUNK = int(os.environ.get("TARE_LOG_CHUNK", "10"))
WORKERS = int(os.environ.get("TARE_LOG_WORKERS", "16"))


def ranges_for(end: int, span: int, chunk: int):
    """Exact tiling of `span` blocks ending at `end`, inclusive on both ends, no overlap."""
    start = end - span + 1
    return [(a, min(a + chunk - 1, end)) for a in range(start, end + 1, chunk)]


def main():
    url = os.environ["BASE_RPC_URL"]
    end = int(sys.argv[1]) if len(sys.argv) > 1 else int(call(url, "eth_blockNumber", []), 16)
    span = int(sys.argv[2]) if len(sys.argv) > 2 else 200_000
    out_path = sys.argv[3]
    chunk = int(sys.argv[4]) if len(sys.argv) > 4 else CHUNK
    workers = int(sys.argv[5]) if len(sys.argv) > 5 else WORKERS

    ranges = ranges_for(end, span, chunk)
    print(f"fenetre : {span:,} blocs jusqu'a {end:,}  ({span * 2 / 86400:.1f} jours), "
          f"{len(ranges):,} tranches de {chunk}, {workers} threads", flush=True)

    def fetch(r):
        a, b = r
        for _ in range(3):
            try:
                return r, call(url, "eth_getLogs",
                               [{"address": POOL_MANAGER, "topics": [TOPIC_INITIALIZE],
                                 "fromBlock": hex(a), "toBlock": hex(b)}], 40)
            except RpcError as e:
                last = str(e)[:70]
        return r, last

    logs, failed, seen = [], [], set()
    done = 0
    with cf.ThreadPoolExecutor(workers) as ex:
        for r, res in ex.map(fetch, ranges):
            done += 1
            if isinstance(res, list):
                for l in res:
                    k = (l["blockNumber"], l["logIndex"])
                    if k not in seen:
                        seen.add(k)
                        logs.append(l)
            else:
                failed.append((r, res))
            if done % 500 == 0:
                print(f"  …{done:,}/{len(ranges):,}  logs {len(logs)}  "
                      f"tranches KO {len(failed)}", flush=True)

    coverage = (len(ranges) - len(failed)) / len(ranges) if ranges else 0.0
    print(f"\n  evenements Initialize : {len(logs)}")
    print(f"  tranches en echec     : {len(failed)}  <- un trou lu est un trou declare")
    print(f"  couverture reelle     : {coverage:.4%} de la fenetre")
    hooked = [l for l in logs if int("0x" + l["data"][2:][128 + 24:192], 16) != 0]
    hooks = {"0x" + l["data"][2:][128 + 24:192] for l in hooked}
    print(f"  pools avec hook       : {len(hooked)}")
    print(f"  hooks distincts       : {len(hooks)}")

    logs.sort(key=lambda l: (int(l["blockNumber"], 16), int(l["logIndex"], 16)))
    json.dump(logs, open(out_path, "w"))
    manifest = {
        "source": "eth_getLogs(PoolManager, Initialize)",
        "pool_manager": POOL_MANAGER,
        "topic": TOPIC_INITIALIZE,
        "end_block": end, "span_blocks": span, "start_block": end - span + 1,
        "chunk_blocks": chunk, "chunks_total": len(ranges), "chunks_failed": len(failed),
        "coverage": round(coverage, 6),
        "failed_ranges": [[a, b, why] for (a, b), why in failed],
        "n_events": len(logs), "n_hooked": len(hooked), "n_hooks": len(hooks),
        "replay": f"python3 -m tare.collect {end} {span} {out_path} {chunk} {workers}",
    }
    json.dump(manifest, open(out_path + ".manifest.json", "w"), indent=1)
    print(f"  -> {out_path}")
    print(f"  -> {out_path}.manifest.json  (fenetre, tranches KO, couverture)")


if __name__ == "__main__":
    main()
