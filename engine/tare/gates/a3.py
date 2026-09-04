"""Gate A3 — the one an agent cannot fake.

Reproduces the five basis-point figures already recorded for hook 0x1aea38f0 at block 50,614,000.
The expected values are not parameters: they are the numbers an independent rewrite of this engine
produced before this code existed.
"""
import argparse, sys
from ..poolid import PoolKey
from ..measure import measure

HOOK = "0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc"
KEY = PoolKey("0x33747ca0945c56315f3e8ae09fc7d4069f1e8c0c",
              "0x4200000000000000000000000000000000000006",
              8388608, 200, HOOK)
SIZES   = [10**14, 10**15, 10**16, 10**17, 10**18]
EXPECTED = [99.99, 99.93, 99.26, 93.10, 57.44]
TOL = 0.05   # bps

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--rpc", required=True)
    ap.add_argument("--block", type=int, default=50614000)
    a = ap.parse_args()

    from ..quote import first_quotable_direction
    zfo = first_quotable_direction(a.rpc, KEY, 10**15)
    if zfo is None:
        print("  aucun sens cotable — le fork est-il au bon bloc ?")
        return 1
    print(f"  sens cotable retenu : zeroForOne={zfo}\n")

    got, ok = [], True
    for size, want in zip(SIZES, EXPECTED):
        m = measure(a.rpc, KEY, zfo, size, a.block)
        val = m.bps
        got.append(val)
        hit = val is not None and abs(val - want) <= TOL
        ok &= hit
        print(f"  {size:>20}  attendu {want:8.2f}  obtenu "
              f"{'%8.2f' % val if val is not None else '     n/a'}  "
              f"{'OK' if hit else 'ECHEC'}  [{m.label}]")
    print(("\nGATE A3 PASSED" if ok else "\nGATE A3 FAILED"))
    return 0 if ok else 1

if __name__ == "__main__":
    sys.exit(main())
