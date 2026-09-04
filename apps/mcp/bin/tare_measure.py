#!/usr/bin/env python3
"""One measurement, one JSON object on stdout. A thin bridge over engine/tare — it imports the
engine, it does not reimplement it.

The MCP server never computes a basis point. It shells out to this, and prints what comes back.

Two refusals are deliberate:

  * if the fork's head is not the block the caller asked for, we return NOT_MEASURABLE rather
    than a number stamped with a block it was not taken at;
  * any exception becomes NOT_MEASURABLE with the reason attached, never a partial value.

    python3 apps/mcp/bin/tare_measure.py --rpc http://127.0.0.1:8545 \
      --hook 0x985c... --currency0 0x0000... --currency1 0xb200... \
      --fee 0 --tick-spacing 200 --amount 1000000000000000 --zero-for-one 1 --block 50614000
"""
import argparse, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
sys.path.insert(0, os.path.join(REPO, "engine"))


def fail(reason, **extra):
    out = {"label": "NOT_MEASURABLE", "reason": reason, "bps": None,
           "out_with": None, "out_without": None}
    out.update(extra)
    json.dump(out, sys.stdout)
    sys.stdout.write("\n")
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rpc", required=True)
    ap.add_argument("--hook", required=True)
    ap.add_argument("--currency0", required=True)
    ap.add_argument("--currency1", required=True)
    ap.add_argument("--fee", type=int, required=True)
    ap.add_argument("--tick-spacing", type=int, required=True)
    ap.add_argument("--amount", required=True)
    ap.add_argument("--zero-for-one", required=True)
    ap.add_argument("--block", type=int, required=True)
    a = ap.parse_args()

    try:
        from tare.poolid import PoolKey
        from tare.measure import measure
        from tare.rpc import call
    except Exception as e:                                    # noqa: BLE001
        return fail("engine_import_failed:%s" % e)

    try:
        head = int(call(a.rpc, "eth_blockNumber", [], timeout=10), 16)
    except Exception as e:                                    # noqa: BLE001
        return fail("fork_unreachable:%s" % str(e)[:160])

    if head != a.block:
        # A number is only worth its block. Refuse rather than mislabel.
        return fail("fork_block_mismatch:head=%d,requested=%d" % (head, a.block))

    key = PoolKey(a.currency0.lower(), a.currency1.lower(), a.fee, a.tick_spacing, a.hook.lower())
    zfo = a.zero_for_one.lower() in ("1", "true", "yes", "zero_for_one", "0->1")

    try:
        m = measure(a.rpc, key, zfo, int(a.amount), a.block)
    except Exception as e:                                    # noqa: BLE001
        return fail("engine_error:%s" % str(e)[:200],
                    hook=key.hooks, pool_id="0x" + key.pool_id().hex(),
                    block_number=a.block, amount_in=a.amount, zero_for_one=zfo)

    json.dump(m.dict(), sys.stdout)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
