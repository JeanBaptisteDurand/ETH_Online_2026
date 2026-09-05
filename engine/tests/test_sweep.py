"""The sweep, exercised without a node.

Four things can go wrong in a sweep and none of them announce themselves:

  * it re-measures what it already has, or worse, skips what it does not (reprise);
  * it pays the cold-cache cost five times per pool instead of once (groupement);
  * it writes a line the rest of the project cannot read (schema);
  * it summarises into a number nobody counted (resume).

Two more were not hypotheses. Both were found by running this sweep for real against Base at
block 50,614,000, and both produced wrong numbers rather than errors, so they get their own
classes: a rate-limited node reported as an empty pool, and two measurers on one fork reading
each other's stub. TestShards covers the partition that keeps the second one from happening.
"""
import dataclasses
import io
import json
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch

from tare.measure import Measurement
from tare.poolid import PoolKey
from tare.sweep import (ASYMMETRY_BPS, CALLERS, DIRECTIONS, LABELS, NON_FLAT_BPS,
                        RPC_UNAVAILABLE, SCHEMA_FIELDS, SIZES, append_jsonl, asymmetries,
                        caller_row, caller_verdict, dedupe, is_infra, is_observation, load_pools,
                        measure_resilient, pool_cells, probe_direction, profile, profiles_of,
                        read_done, read_jsonl, resume_key, summarise, summarise_callers, sweep,
                        sweep_pool, CONCURRENT)

# The sweep visits every size in every direction, so one pool costs this many lines. Written as
# a product rather than a literal: the grid widened once already, and the tests that hard-coded
# "5" all had to be edited by hand when it did.
CELLS = len(SIZES) * len(DIRECTIONS)

K = PoolKey("0x1111111111111111111111111111111111111111",
            "0x2222222222222222222222222222222222222222",
            8388608, 200, "0x3333333333333333333333333333333333333333")
K2 = PoolKey("0x4444444444444444444444444444444444444444",
             "0x5555555555555555555555555555555555555555",
             3000, 60, "0x6666666666666666666666666666666666666666")
BLOCK = 50614000


def row(key=K, size=10**15, bps=42.0, label="MEASURED", reason=None, lp_fee=0, zfo=True):
    """A Measurement built by hand, with every schema field populated."""
    return Measurement(
        hook=key.hooks, pool_id="0x" + key.pool_id().hex(), chain_id=8453,
        block_number=BLOCK, currency0=key.currency0, currency1=key.currency1,
        key_fee=key.fee, tick_spacing=key.tick_spacing, fee_is_dynamic=key.is_dynamic_fee,
        stored_lp_fee=lp_fee, stored_protocol_fee=0, zero_for_one=zfo, amount_in=str(size),
        out_with="990" if bps is not None else None,
        out_without="1000" if bps is not None else None,
        bps=bps, label=label, reason=reason,
        stub_hash="0xstub", engine_ver="tare-engine/test",
        observed_at="2026-09-05T00:00:00+00:00",
    )


class TestReprise(unittest.TestCase):
    """A run that is killed and restarted must cost only what it had not yet done."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "m.jsonl"

    def tearDown(self):
        self.tmp.cleanup()

    def test_absent_file_is_an_empty_resume_set_not_an_error(self):
        self.assertEqual(read_done(self.out), set())

    def test_written_measurements_come_back_as_resume_keys(self):
        for s in SIZES:
            append_jsonl(self.out, row(size=s))
        done = read_done(self.out)
        self.assertEqual(len(done), len(SIZES))
        self.assertIn(resume_key(row(size=10**14)), done)

    def test_resume_key_separates_the_two_directions(self):
        """The sweep measures both sides, so `(pool, block, size)` names two observations. If the
        key collapsed them, `dedupe` would keep whichever was written last and the corpus would
        report one number for a hook that charges two."""
        self.assertNotEqual(resume_key(row(zfo=True)), resume_key(row(zfo=False)))

    def test_a_row_written_before_the_two_direction_sweep_still_resumes(self):
        """The old corpus carries a direction on every line, so it keeps its identity: only the
        side that was never looked at gets measured."""
        append_jsonl(self.out, row(size=10**15, zfo=True))
        done = read_done(self.out)
        self.assertIn(resume_key(row(size=10**15, zfo=True)), done)
        self.assertNotIn(resume_key(row(size=10**15, zfo=False)), done)

    def test_resume_key_separates_sizes_pools_and_blocks(self):
        self.assertNotEqual(resume_key(row(size=10**14)), resume_key(row(size=10**18)))
        self.assertNotEqual(resume_key(row(key=K)), resume_key(row(key=K2)))
        a = row().dict()
        b = row().dict()
        b["block_number"] = 50614001
        self.assertNotEqual(resume_key(a), resume_key(b))

    def test_truncated_final_line_is_skipped_never_guessed(self):
        append_jsonl(self.out, row(size=10**14))
        with self.out.open("a") as fh:
            fh.write('{"pool_id":"0xdead","block_nu')       # killed mid-write
        self.assertEqual(len(read_done(self.out)), 1)
        self.assertEqual(len(read_jsonl(self.out)), 1)

    def test_a_second_sweep_over_done_pools_measures_nothing(self):
        calls = []

        def fake_measure(url, key, zfo, amount, block):
            calls.append((zfo, amount))
            return row(key=key, size=amount, zfo=zfo)

        with patch("tare.sweep.measure", fake_measure), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True):
            first = sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out)
            n_first = len(calls)
            second = sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out)

        self.assertEqual(first["written"], CELLS)
        self.assertEqual(second["written"], 0)
        self.assertEqual(second["pools_skipped"], 1)
        self.assertEqual(len(calls), n_first, "the second run re-measured something")
        self.assertEqual(len(read_jsonl(self.out)), CELLS, "resume duplicated lines")

    def test_partial_pool_resumes_only_the_missing_cells(self):
        """Two sizes already done on one side. Everything else — including the whole other side —
        is still owed."""
        append_jsonl(self.out, row(size=10**12, zfo=True))
        append_jsonl(self.out, row(size=10**13, zfo=True))
        seen = []

        def fake_measure(url, key, zfo, amount, block):
            seen.append((zfo, amount))
            return row(key=key, size=amount, zfo=zfo)

        with patch("tare.sweep.measure", fake_measure), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True):
            sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out)

        self.assertEqual(seen, [(True, s) for s in SIZES[2:]] + [(False, s) for s in SIZES])
        self.assertEqual(len(read_jsonl(self.out)), CELLS)

    def test_a_row_that_only_records_a_dead_node_is_not_done(self):
        """A five-minute outage must not freeze a permanent hole in the dataset."""
        append_jsonl(self.out, row(size=10**14, bps=None, label="NOT_MEASURABLE",
                                   reason=f"{RPC_UNAVAILABLE} empty response"))
        append_jsonl(self.out, row(size=10**15))
        self.assertEqual(read_done(self.out), {resume_key(row(size=10**15))})

    def test_the_next_run_re_measures_what_the_node_refused_to_serve(self):
        append_jsonl(self.out, row(size=10**14, bps=None, label="NOT_MEASURABLE",
                                   reason=f"{RPC_UNAVAILABLE} empty response"))
        seen = []
        with patch("tare.sweep.measure",
                   lambda u, k, z, a, b: seen.append(a) or row(key=k, size=a)), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True):
            sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out)
        self.assertIn(10**14, seen, "the failed size was never retried")

    def test_a_pool_refusal_is_done_and_is_not_retried(self):
        """NOT_QUOTABLE is an answer. On a pinned fork, asking again gives the same one."""
        append_jsonl(self.out, row(size=10**14, bps=None, label="NOT_QUOTABLE",
                                   reason="NOT_ENOUGH_LIQUIDITY"))
        self.assertIn(resume_key(row(size=10**14)), read_done(self.out))

    def test_a_real_observation_survives_a_later_node_failure(self):
        good = row(size=10**14, bps=100.0).dict()
        bad = row(size=10**14, bps=None, label="NOT_MEASURABLE",
                  reason=f"{RPC_UNAVAILABLE} empty response").dict()
        self.assertEqual(dedupe([good, bad])[0]["bps"], 100.0)
        self.assertEqual(dedupe([bad, good])[0]["bps"], 100.0)
        self.assertEqual(len(dedupe([bad, good])), 1)

    def test_is_observation_separates_a_finding_from_a_failure_to_look(self):
        self.assertTrue(is_observation(row().dict()))
        self.assertTrue(is_observation(row(bps=None, label="NOT_QUOTABLE",
                                           reason="NOT_ENOUGH_LIQUIDITY").dict()))
        self.assertTrue(is_observation(row(bps=None, label="NOT_MEASURABLE",
                                           reason="custom accounting").dict()))
        self.assertFalse(is_observation(row(bps=None, label="NOT_MEASURABLE",
                                            reason=f"{RPC_UNAVAILABLE} x").dict()))

    def test_restart_ignores_the_resume_set(self):
        append_jsonl(self.out, row(size=10**14))
        with patch("tare.sweep.measure", lambda u, k, z, a, b: row(key=k, size=a)), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True):
            stats = sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out, resume=False)
        self.assertEqual(stats["written"], CELLS)


class TestGroupement(unittest.TestCase):
    """The first RPC touch of a pool costs ~9 s and the next ones ~0.01 s, so every cell of a
    pool — both directions, every size — must be measured back to back."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "m.jsonl"

    def tearDown(self):
        self.tmp.cleanup()

    def test_the_sweep_no_longer_probes_for_a_direction(self):
        """The probe existed to pick the one side worth the budget. Both sides are in the budget
        now, so a probe would only spend quotes to answer a question nobody asks."""
        probes = []
        with patch("tare.sweep.measure", lambda u, k, z, a, b: row(key=k, size=a, zfo=z)), \
             patch("tare.sweep.first_quotable_direction",
                   lambda u, k, a: probes.append(k.hooks) or True):
            sweep_pool("http://x", K, BLOCK)
        self.assertEqual(probes, [], "the sweep still pays for a direction probe")

    def test_pool_cells_are_every_size_in_every_direction_exactly_once(self):
        cells = pool_cells("0xpool", BLOCK)
        self.assertEqual(len(cells), CELLS)
        self.assertEqual(len({k for _z, _s, k in cells}), CELLS, "a cell is listed twice")
        self.assertEqual({(z, s) for z, s, _k in cells},
                         {(z, s) for z in DIRECTIONS for s in SIZES})

    def test_all_sizes_of_a_pool_are_measured_consecutively(self):
        order = []

        def fake_measure(url, key, zfo, amount, block):
            order.append((key.hooks, amount))
            return row(key=key, size=amount, zfo=zfo)

        with patch("tare.sweep.measure", fake_measure), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True):
            sweep("http://x", [(K, 2, True), (K2, 1, True)], BLOCK, out_path=self.out)

        hooks = [h for h, _ in order]
        self.assertEqual(hooks, [K.hooks] * CELLS + [K2.hooks] * CELLS,
                         "pools are interleaved; the cold cache is paid once per cell")
        self.assertEqual([a for _, a in order[:len(SIZES)]], SIZES)

    def test_one_pool_produces_one_line_per_size_and_direction(self):
        with patch("tare.sweep.measure", lambda u, k, z, a, b: row(key=k, size=a, zfo=z)), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True):
            sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out)
        rows = read_jsonl(self.out)
        self.assertEqual(len(rows), CELLS)
        self.assertEqual(sorted(int(r["amount_in"]) for r in rows), sorted(SIZES * 2))
        for zfo in DIRECTIONS:
            side = [r for r in rows if r["zero_for_one"] is zfo]
            self.assertEqual(sorted(int(r["amount_in"]) for r in side), SIZES)

    def test_every_size_is_measured_in_both_directions(self):
        with patch("tare.sweep.measure",
                   lambda u, k, z, a, b: row(key=k, size=a, zfo=z)), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: False):
            rows = sweep_pool("http://x", K, BLOCK)
        self.assertEqual({(m.zero_for_one, int(m.amount_in)) for m in rows},
                         {(z, s) for z in DIRECTIONS for s in SIZES})

    def test_an_unquotable_pool_still_yields_a_labelled_line_per_cell(self):
        """Zero lines would silently shrink the denominator of every later statistic."""
        with patch("tare.sweep.measure",
                   lambda u, k, z, a, b: row(key=k, size=a, bps=None,
                                             label="NOT_QUOTABLE",
                                             reason="NOT_ENOUGH_LIQUIDITY")), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: None), \
             patch("tare.sweep.quote", lambda *a, **k: (None, "NOT_ENOUGH_LIQUIDITY")):
            rows = sweep_pool("http://x", K, BLOCK)
        self.assertEqual(len(rows), CELLS)
        self.assertTrue(all(m.label == "NOT_QUOTABLE" for m in rows))

    def test_a_throwing_pool_neither_aborts_the_run_nor_vanishes_from_it(self):
        """A pool that makes `measure` raise still owes one labelled line per cell."""
        def boom(url, key, zfo, amount, block):
            if key.hooks == K.hooks:
                raise RuntimeError("node exploded")
            return row(key=key, size=amount)

        with patch("tare.sweep.measure", boom), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True), \
             patch("tare.sweep.time.sleep", lambda *_: None):
            stats = sweep("http://x", [(K, 2, True), (K2, 1, True)], BLOCK, out_path=self.out)

        self.assertEqual(stats["written"], 2 * CELLS, "the surviving pool was not measured")
        rows = read_jsonl(self.out)
        dead = [r for r in rows if r["hook"] == K.hooks]
        self.assertEqual(len(dead), CELLS)
        self.assertEqual({(r["zero_for_one"], int(r["amount_in"])) for r in dead},
                         {(z, s) for z in DIRECTIONS for s in SIZES},
                         "the crash swallowed a direction")
        self.assertTrue(all(r["label"] == "NOT_MEASURABLE" for r in dead))
        self.assertTrue(all(r["bps"] is None for r in dead))

    def test_a_failure_inside_the_sweep_itself_still_writes_its_lines(self):
        with patch("tare.sweep.sweep_pool", side_effect=RuntimeError("kaboom")):
            stats = sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out)
        self.assertEqual(stats["errors"], 1)
        rows = read_jsonl(self.out)
        self.assertEqual(len(rows), CELLS)
        self.assertEqual({(r["zero_for_one"], int(r["amount_in"])) for r in rows},
                         {(z, s) for z in DIRECTIONS for s in SIZES})
        for r in rows:
            self.assertEqual(r["label"], "NOT_MEASURABLE")
            self.assertTrue(r["reason"].startswith(RPC_UNAVAILABLE))
            self.assertIsNone(r["stored_lp_fee"], "unknown must not read as zero")


class TestCompact(unittest.TestCase):
    """The append log becomes the dataset: one canonical line per measurement, sorted."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "m.jsonl"

    def tearDown(self):
        self.tmp.cleanup()

    def _compact(self):
        from tare.cli import main
        with redirect_stdout(io.StringIO()):
            return main(["compact", "--in", str(self.out)])

    def test_a_superseded_failure_is_dropped_and_the_observation_kept(self):
        append_jsonl(self.out, row(size=10**15, bps=None, label="NOT_MEASURABLE",
                                   reason=f"{RPC_UNAVAILABLE} empty response"))
        append_jsonl(self.out, row(size=10**15, bps=100.0))
        self._compact()
        rows = read_jsonl(self.out)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["bps"], 100.0)

    def test_lines_are_sorted_by_hook_then_pool_then_size(self):
        for size in reversed(SIZES):
            append_jsonl(self.out, row(key=K2, size=size))
            append_jsonl(self.out, row(key=K, size=size))
        self._compact()
        rows = read_jsonl(self.out)
        self.assertEqual(len(rows), 2 * len(SIZES))
        got = [(r["hook"], int(r["amount_in"])) for r in rows]
        self.assertEqual(got, sorted(got))

    def test_compacting_twice_changes_nothing(self):
        for size in SIZES:
            append_jsonl(self.out, row(size=size))
        self._compact()
        once = self.out.read_text()
        self._compact()
        self.assertEqual(self.out.read_text(), once)

    def test_a_compacted_file_still_resumes(self):
        for size in SIZES:
            append_jsonl(self.out, row(size=size))
        self._compact()
        self.assertEqual(len(read_done(self.out)), len(SIZES))


class TestVerify(unittest.TestCase):
    """`verify` replays lines and compares. It must fail loudly, because it is the only thing
    standing between a contaminated fork and a published number."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "m.jsonl"
        key = load_pools()[0][0]
        self.key = key
        append_jsonl(self.out, row(key=key, size=10**15, bps=100.0))

    def tearDown(self):
        self.tmp.cleanup()

    def _run(self, replay_bps, out_with="990"):
        from tare.cli import main
        fake = row(key=self.key, size=10**15, bps=replay_bps)
        fake = dataclasses.replace(fake, out_with=out_with)
        buf = io.StringIO()
        with patch("tare.cli.measure_resilient", lambda *a, **k: fake), \
             redirect_stdout(buf):
            code = main(["verify", "--in", str(self.out), "--sample", "1"])
        return code, buf.getvalue()

    def test_an_agreeing_replay_passes(self):
        code, out = self._run(100.0)
        self.assertEqual(code, 0)
        self.assertIn("1 identiques", out)

    def test_a_disagreeing_replay_fails_loudly(self):
        code, out = self._run(0.0)
        self.assertEqual(code, 1, "a contaminated fork must not exit 0")
        self.assertIn("DIFFERENT", out)

    def test_a_matching_bps_with_a_different_output_still_fails(self):
        """Equal basis points off different absolute outputs is a coincidence, not a match."""
        code, _ = self._run(100.0, out_with="12345")
        self.assertEqual(code, 1)

    def test_a_replay_the_fork_refuses_is_counted_apart_from_a_disagreement(self):
        code, out = self._run(None)
        self.assertEqual(code, 0, "a fork that would not answer is not evidence of a bad file")
        self.assertIn("1 non rejouables", out)


class TestShards(unittest.TestCase):
    """One shard per fork, and between them they must cover every pool exactly once."""

    def _shard(self, pools, shard, of):
        return [p for i, p in enumerate(pools) if i % of == shard]

    def test_shards_partition_the_pools_with_no_gap_and_no_overlap(self):
        pools = load_pools()
        seen = []
        for i in range(4):
            seen += self._shard(pools, i, 4)
        ids = [p[0].pool_id() for p in seen]
        self.assertEqual(len(ids), len(pools))
        self.assertEqual(len(set(ids)), len({p[0].pool_id() for p in pools}))

    def test_shards_are_within_one_pool_of_each_other(self):
        pools = load_pools()
        sizes = [len(self._shard(pools, i, 4)) for i in range(4)]
        self.assertLessEqual(max(sizes) - min(sizes), 1, "a stride shard is unbalanced")

    def test_an_out_of_range_shard_is_refused_not_silently_empty(self):
        from tare.cli import main
        with redirect_stdout(io.StringIO()):
            self.assertEqual(main(["sweep", "--shard", "4", "--of", "4"]), 2)
            self.assertEqual(main(["sweep", "--shard", "0", "--of", "0"]), 2)


class TestSchema(unittest.TestCase):
    """A line the rest of the project cannot read is not a measurement."""

    V1 = Path(__file__).resolve().parents[2] / "docs" / "measurements-v1.json"

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.out = Path(self.tmp.name) / "m.jsonl"

    def tearDown(self):
        self.tmp.cleanup()

    def test_schema_fields_match_measurements_v1(self):
        v1 = json.loads(self.V1.read_text())
        self.assertEqual(set(v1[0].keys()), set(SCHEMA_FIELDS))

    def test_schema_fields_match_the_measurement_dataclass(self):
        self.assertEqual(set(row().dict().keys()), set(SCHEMA_FIELDS))

    def test_each_written_line_carries_every_field(self):
        with patch("tare.sweep.measure", lambda u, k, z, a, b: row(key=k, size=a)), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True):
            sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out)
        for r in read_jsonl(self.out):
            self.assertEqual(set(r.keys()), set(SCHEMA_FIELDS))

    def test_one_json_object_per_line(self):
        with patch("tare.sweep.measure", lambda u, k, z, a, b: row(key=k, size=a)), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True):
            sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out)
        lines = self.out.read_text().splitlines()
        self.assertEqual(len(lines), CELLS)
        for line in lines:
            self.assertIsInstance(json.loads(line), dict)

    def test_labels_are_from_the_closed_set(self):
        with patch("tare.sweep.measure", lambda u, k, z, a, b: row(key=k, size=a)), \
             patch("tare.sweep.first_quotable_direction", lambda *a, **k: True):
            sweep("http://x", [(K, 1, True)], BLOCK, out_path=self.out)
        for r in read_jsonl(self.out):
            self.assertIn(r["label"], LABELS)

    def test_amounts_are_strings_so_they_survive_json(self):
        """1e18 exceeds float precision; a number here would round the swap size."""
        r = row(size=10**18).dict()
        self.assertIsInstance(r["amount_in"], str)
        self.assertEqual(int(json.loads(json.dumps(r))["amount_in"]), 10**18)

    def test_every_line_is_replayable(self):
        r = row().dict()
        for f in ("pool_id", "block_number", "amount_in", "zero_for_one",
                  "chain_id", "stub_hash", "engine_ver", "observed_at"):
            self.assertIsNotNone(r[f], f"{f} missing -> the line cannot be replayed")

    def test_pools_file_loads_into_valid_keys(self):
        pools = load_pools()
        self.assertGreater(len(pools), 100)
        key, liq, dyn = pools[0]
        self.assertEqual(len(key.pool_id()), 32)
        self.assertTrue(key.hooks.startswith("0x"))
        self.assertGreater(liq, 0, "pools-liquides.json must only hold liquid pools")


class TestResume(unittest.TestCase):
    """Every number in summary.json is counted from the lines, or it is not published."""

    def test_empty_input_gives_zeros_not_omissions(self):
        s = summarise([])
        self.assertEqual(s["n_measurements"], 0)
        self.assertIsNone(s["bps_median"])
        for label in LABELS:
            self.assertEqual(s["by_label"][label], 0)

    def test_counts_labels_pools_and_hooks(self):
        n = len(SIZES)
        rows = [row(key=K, size=s).dict() for s in SIZES]
        rows += [row(key=K2, size=s, bps=None, label="NOT_QUOTABLE").dict() for s in SIZES]
        s = summarise(rows)
        self.assertEqual(s["n_measurements"], 2 * n)
        self.assertEqual(s["by_label"]["MEASURED"], n)
        self.assertEqual(s["by_label"]["NOT_QUOTABLE"], n)
        self.assertEqual(s["n_pools"], 2)
        self.assertEqual(s["n_hooks"], 2)
        self.assertEqual(s["n_pools_measured"], 1)

    def test_min_median_max_are_the_real_order_statistics(self):
        rows = [row(size=s, bps=b).dict()
                for s, b in zip(SIZES, [1.0, 2.0, 3.0, 4.0, 100.0])]
        s = summarise(rows)
        self.assertEqual((s["bps_min"], s["bps_median"], s["bps_max"]), (1.0, 3.0, 100.0))

    def test_hidden_fee_count_needs_both_conditions(self):
        rows = [
            row(size=10**14, bps=5.0, lp_fee=0).dict(),      # counts
            row(size=10**15, bps=0.5, lp_fee=0).dict(),      # under 1 bps
            row(size=10**16, bps=5.0, lp_fee=3000).dict(),   # fee is declared
            row(size=10**17, bps=None, label="NOT_QUOTABLE", lp_fee=0).dict(),
        ]
        s = summarise(rows)
        self.assertEqual(s["n_gt_1bps_at_zero_stored_lp_fee"], 1)

    def test_flat_profile_is_not_reported_as_non_flat(self):
        rows = [row(size=s, bps=100.0).dict() for s in SIZES]
        s = summarise(rows)
        self.assertEqual(s["n_non_flat_profiles"], 0)

    def test_profile_that_travels_is_reported_with_both_ends(self):
        # The gate A3 curve, stretched over whatever grid SIZES currently holds.
        curve = [99.99, 99.93, 99.26, 93.10, 57.44]
        sizes = SIZES[:len(curve)]
        rows = [row(size=s, bps=b).dict() for s, b in zip(sizes, curve)]
        s = summarise(rows)
        self.assertEqual(s["n_non_flat_profiles"], 1)
        p = s["non_flat_profiles"][0]
        self.assertEqual(p["bps_at_min_size"], 99.99)
        self.assertEqual(p["bps_at_max_size"], 57.44)
        self.assertAlmostEqual(p["amplitude_bps"], 42.55, places=2)
        self.assertEqual(p["sizes"], [str(s) for s in sizes])

    def test_amplitude_threshold_is_the_documented_one(self):
        """Exactly NON_FLAT_BPS of travel counts; a hundredth less does not."""
        def sweep_of(end_bps):
            return [row(size=s, bps=b).dict()
                    for s, b in zip(SIZES, [10.0, 10.0, 10.0, 10.0, end_bps])]
        self.assertEqual(summarise(sweep_of(10.0 + NON_FLAT_BPS))["n_non_flat_profiles"], 1)
        self.assertEqual(summarise(sweep_of(10.0 + NON_FLAT_BPS - 0.01))["n_non_flat_profiles"], 0)

    def test_profile_is_ordered_by_size_not_by_file_order(self):
        curve = [57.44, 93.10, 99.26, 99.93, 99.99]
        sizes = SIZES[:len(curve)]
        rows = [row(size=s, bps=b).dict() for s, b in zip(reversed(sizes), curve)]
        p = profile(rows)
        self.assertEqual(p["sizes"], [str(s) for s in sizes])
        self.assertEqual(p["bps"][0], 99.99)

    def test_a_single_point_is_not_a_profile(self):
        self.assertEqual(profile([row().dict()]), {})

    def test_summary_carries_its_provenance(self):
        s = summarise([row().dict()], block=BLOCK)
        for f in ("generated_at", "engine_ver", "stub_hash", "block_number", "chain_id", "sizes"):
            self.assertIsNotNone(s[f], f"{f} missing -> the summary cannot be traced")
        self.assertEqual(s["block_number"], BLOCK)


class TestInstrumentVsSubject(unittest.TestCase):
    """The bug this sweep actually hit.

    On its first real run against a rate-limited archive node, ten rows came back
    `NOT_QUOTABLE` with the reason `failed to get storage for 0x498...`. That is anvil failing to
    backfill a slot from upstream — the instrument — not the pool declining the swap. Re-run
    against a working node, every one of those pools measured cleanly at 100.00 bps.

    A failure to look must never be recorded as a finding about what was looked at.
    """

    def test_node_failures_are_recognised(self):
        for reason in ("{'code': -32603, 'message': 'failed to get storage for 0x498...'}",
                       "empty response from http://127.0.0.1:8545",
                       "error sending request for url",
                       "You reached Public endpoint rate limit",
                       "operation timed out"):
            self.assertTrue(is_infra(reason), reason)

    def test_pool_verdicts_are_not_mistaken_for_node_failures(self):
        for reason in ("NOT_ENOUGH_LIQUIDITY", "ZERO_OUT", "SHORT_RETURN", None,
                       "custom accounting"):
            self.assertFalse(is_infra(reason), reason)

    def test_a_transient_node_failure_is_retried_then_succeeds(self):
        seq = [row(bps=None, label="NOT_QUOTABLE", reason="failed to get storage for 0x498"),
               row(bps=100.0)]
        with patch("tare.sweep.measure", lambda *a, **k: seq.pop(0)), \
             patch("tare.sweep.time.sleep", lambda *_: None):
            m = measure_resilient("http://x", K, True, 10**15, BLOCK)
        self.assertEqual(m.label, "MEASURED")
        self.assertEqual(m.bps, 100.0)

    def test_a_persistent_node_failure_is_not_measurable_never_not_quotable(self):
        bad = row(bps=None, label="NOT_QUOTABLE", reason="failed to get storage for 0x498")
        with patch("tare.sweep.measure", lambda *a, **k: bad), \
             patch("tare.sweep.time.sleep", lambda *_: None):
            m = measure_resilient("http://x", K, True, 10**15, BLOCK, attempts=3)
        self.assertEqual(m.label, "NOT_MEASURABLE")
        self.assertTrue(m.reason.startswith(RPC_UNAVAILABLE))
        self.assertIsNone(m.bps)

    def test_a_real_pool_refusal_is_returned_at_once_without_retrying(self):
        n = {"calls": 0}

        def once(*a, **k):
            n["calls"] += 1
            return row(bps=None, label="NOT_QUOTABLE", reason="NOT_ENOUGH_LIQUIDITY")

        with patch("tare.sweep.measure", once), patch("tare.sweep.time.sleep", lambda *_: None):
            m = measure_resilient("http://x", K, True, 10**15, BLOCK, attempts=4)
        self.assertEqual(n["calls"], 1, "a pinned fork gives the same refusal four times")
        self.assertEqual(m.label, "NOT_QUOTABLE")

    def test_probe_reports_whether_silence_came_from_the_node(self):
        with patch("tare.sweep.first_quotable_direction", lambda *a, **k: None), \
             patch("tare.sweep.quote", lambda *a, **k: (None, "failed to get storage")):
            zfo, size, infra = probe_direction("http://x", K)
        self.assertIsNone(zfo)
        self.assertTrue(is_infra(infra))

    def test_probe_reports_a_genuine_refusal_as_such(self):
        with patch("tare.sweep.first_quotable_direction", lambda *a, **k: None), \
             patch("tare.sweep.quote", lambda *a, **k: (None, "NOT_ENOUGH_LIQUIDITY")):
            zfo, size, infra = probe_direction("http://x", K)
        self.assertIsNone(zfo)
        self.assertIsNone(infra)

    def test_a_pool_the_node_could_not_serve_is_never_written_as_unquotable(self):
        """No probe stands in front of this any more: `measure_resilient` alone has to tell the
        node's silence from the pool's refusal, for every cell of the grid."""
        with patch("tare.sweep.measure",
                   lambda u, k, z, a, b: row(key=k, size=a, zfo=z, bps=None,
                                             label="NOT_QUOTABLE",
                                             reason="failed to get storage for 0x498")), \
             patch("tare.sweep.time.sleep", lambda *_: None):
            rows = sweep_pool("http://x", K, BLOCK)
        self.assertEqual(len(rows), CELLS)
        for m in rows:
            self.assertEqual(m.label, "NOT_MEASURABLE")
            self.assertTrue(m.reason.startswith(RPC_UNAVAILABLE))

    def test_every_failure_rpc_py_can_raise_is_recognised_as_the_instrument(self):
        """The exact strings `rpc.py` produces, not paraphrases of them.

        `transport failure` and `empty body` were absent from INFRA_MARKERS. Widening the size
        grid made the sweep touch cold pools whose first quote outlives curl's timeout, and every
        one of those was written down as NOT_QUOTABLE — the instrument's clock published as the
        pool's answer. The reasons below are copied from the three `raise` sites in rpc.py.
        """
        for reason in ("transport failure for http://127.0.0.1:8600 (28)",
                       "empty body, HTTP 200, from http://127.0.0.1:8600",
                       "HTTP 429 from https://base-mainnet.g.alchemy.com/v2/k"):
            self.assertTrue(is_infra(reason), f"{reason!r} lu comme un verdict du pool")

    def test_a_pool_refusal_is_still_not_infra(self):
        for reason in ("NOT_ENOUGH_LIQUIDITY", "ZERO_OUT", "SHORT_RETURN",
                       "custom accounting"):
            self.assertFalse(is_infra(reason), f"{reason!r} lu comme une panne du noeud")

    def test_a_transport_timeout_becomes_not_measurable_not_not_quotable(self):
        bad = row(bps=None, label="NOT_QUOTABLE",
                  reason="transport failure for http://127.0.0.1:8600 (28)")
        with patch("tare.sweep.measure", lambda *a, **k: bad), \
             patch("tare.sweep.time.sleep", lambda *_: None):
            m = measure_resilient("http://x", K, True, 10**12, BLOCK, attempts=2)
        self.assertEqual(m.label, "NOT_MEASURABLE")
        self.assertTrue(m.reason.startswith(RPC_UNAVAILABLE))
        self.assertIsNone(m.bps)

    def test_a_second_measurer_on_the_same_fork_is_refused_not_recorded(self):
        """`anvil_setCode` is global state. Replaying a row against the anvil a shard was still
        sweeping turned 100.00 bps into 0.00 — twice out of three. A measurement taken while
        someone else's stub is installed describes their stub, so it must not be taken."""
        with patch("tare.sweep.stub_is_installed", lambda *a: True), \
             patch("tare.sweep.measure", lambda *a, **k: row(bps=0.0)), \
             patch("tare.sweep.time.sleep", lambda *_: None):
            m = measure_resilient("http://x", K, True, 10**15, BLOCK)
        self.assertEqual(m.label, "NOT_MEASURABLE")
        self.assertTrue(m.reason.startswith(CONCURRENT))
        self.assertIsNone(m.bps, "a contended reading must never be published as a number")

    def test_a_stub_that_clears_between_attempts_does_not_block_the_measurement(self):
        states = [True, False]
        with patch("tare.sweep.stub_is_installed", lambda *a: states.pop(0)), \
             patch("tare.sweep.measure", lambda *a, **k: row(bps=100.0)), \
             patch("tare.sweep.time.sleep", lambda *_: None):
            m = measure_resilient("http://x", K, True, 10**15, BLOCK)
        self.assertEqual(m.label, "MEASURED")
        self.assertEqual(m.bps, 100.0)

    def test_a_contended_row_is_retried_by_the_next_run(self):
        """Like a node failure, contention means we did not look — never a permanent hole."""
        self.assertFalse(is_observation(
            row(bps=None, label="NOT_MEASURABLE", reason=f"{CONCURRENT} x").dict()))

    def test_summary_surfaces_instrument_failures(self):
        rows = [row(bps=None, label="NOT_MEASURABLE",
                    reason=f"{RPC_UNAVAILABLE} failed to get storage").dict()]
        s = summarise(rows)
        self.assertEqual(s["n_rpc_unavailable"], 1)
        self.assertEqual(s["n_pools_rpc_unavailable"], 1)


class TestDeuxSens(unittest.TestCase):
    """A pool is two curves, not one. Everything downstream has to know that."""

    def _pair(self, bps_up, bps_down, size=10**15, key=K):
        return [row(key=key, size=size, bps=bps_up, zfo=True).dict(),
                row(key=key, size=size, bps=bps_down, zfo=False).dict()]

    def test_the_two_sides_of_one_pool_are_two_profiles(self):
        """Folding them into one curve interleaves two series and invents a slope."""
        rows = []
        for s, up, down in zip(SIZES, [10.0] * len(SIZES), [90.0] * len(SIZES)):
            rows += self._pair(up, down, size=s)
        ps = profiles_of(rows)
        self.assertEqual(len(ps), 2)
        self.assertEqual({p["zero_for_one"] for p in ps}, {True, False})
        for p in ps:
            self.assertEqual(len(p["bps"]), len(SIZES))
            self.assertEqual(p["amplitude_bps"], 0.0, "a flat curve came out sloped")

    def test_profile_refuses_a_mixture_of_directions(self):
        with self.assertRaises(ValueError):
            profile(self._pair(10.0, 90.0))

    def test_a_pool_that_charges_differently_each_way_is_reported(self):
        a = asymmetries(self._pair(10.0, 90.0))
        self.assertEqual(len(a), 1)
        self.assertEqual(a[0]["max_gap_bps"], 80.0)
        self.assertEqual(a[0]["bps_zero_for_one"], 10.0)
        self.assertEqual(a[0]["bps_one_for_zero"], 90.0)
        self.assertEqual(a[0]["at_size"], str(10**15))

    def test_a_symmetric_pool_is_not_reported(self):
        self.assertEqual(asymmetries(self._pair(30.0, 30.0)), [])

    def test_the_asymmetry_threshold_is_the_documented_one(self):
        self.assertEqual(len(asymmetries(self._pair(30.0, 30.0 + ASYMMETRY_BPS))), 1)
        self.assertEqual(len(asymmetries(self._pair(30.0, 30.0 + ASYMMETRY_BPS - 0.01))), 0)

    def test_the_size_curve_is_never_mistaken_for_an_asymmetry(self):
        """One side at 1e12 against the other at 1e19 is not a comparison. Only cells measured
        both ways at the same size may be differenced."""
        rows = [row(size=10**12, bps=10.0, zfo=True).dict(),
                row(size=10**19, bps=900.0, zfo=False).dict()]
        self.assertEqual(asymmetries(rows), [])

    def test_a_side_that_does_not_quote_is_not_an_asymmetry(self):
        """That is a liquidity fact and it already has its own NOT_QUOTABLE rows."""
        rows = [row(size=10**15, bps=30.0, zfo=True).dict(),
                row(size=10**15, bps=None, label="NOT_QUOTABLE", zfo=False).dict()]
        self.assertEqual(asymmetries(rows), [])

    def test_summary_counts_both_sides_separately(self):
        rows = self._pair(10.0, 90.0) + [row(key=K2, size=10**15, bps=5.0, zfo=True).dict()]
        s = summarise(rows)
        self.assertEqual(s["n_measured_zero_for_one"], 2)
        self.assertEqual(s["n_measured_one_for_zero"], 1)
        self.assertEqual(s["n_pools_measured_both_sides"], 1)
        self.assertEqual(s["n_pools_measured_one_side"], 1)
        self.assertEqual(s["n_asymmetric_pools"], 1)

    def test_dedupe_keeps_both_sides_of_the_same_cell(self):
        """The bug this guards: one resume key for two observations, and half the corpus gone."""
        self.assertEqual(len(dedupe(self._pair(10.0, 90.0))), 2)


class TestAppelant(unittest.TestCase):
    """The third axis: the same swap from several `tx.origin`, and nothing claimed beyond that."""

    def _r(self, name, out, reason=None, size=10**15, zfo=True):
        addr = dict(CALLERS)[name]
        return caller_row(K, zfo, size, BLOCK, name, addr, out, reason)

    def test_a_reading_carries_its_origin_and_its_verdict(self):
        r = self._r("eoa_a", 1000)
        self.assertEqual(r["caller_name"], "eoa_a")
        self.assertEqual(r["out"], "1000")
        self.assertEqual(r["label"], "MEASURED")
        self.assertIsInstance(r["out"], str, "an amount must survive JSON")

    def test_a_refusal_keeps_its_line_and_its_reason_never_a_zero(self):
        r = self._r("eoa_a", None, "NOT_ENOUGH_LIQUIDITY")
        self.assertIsNone(r["out"])
        self.assertEqual(r["label"], "NOT_QUOTABLE")
        self.assertEqual(r["reason"], "NOT_ENOUGH_LIQUIDITY")

    def test_a_node_failure_is_not_measurable_never_not_quotable(self):
        r = self._r("eoa_a", None, "failed to get storage for 0x498")
        self.assertEqual(r["label"], "NOT_MEASURABLE")
        self.assertTrue(r["reason"].startswith(RPC_UNAVAILABLE))

    def test_same_output_for_every_origin_is_invariant(self):
        rows = [self._r(n, 1000) for n, _a in CALLERS]
        self.assertEqual(caller_verdict(rows)["verdict"], "ORIGIN_INVARIANT")

    def test_a_different_output_for_one_origin_is_sensitive(self):
        rows = [self._r(n, 1000) for n, _a in CALLERS[:3]] + [self._r("router", 999)]
        v = caller_verdict(rows)
        self.assertEqual(v["verdict"], "ORIGIN_SENSITIVE")
        self.assertEqual(len(v["diverging_cells"]), 1)
        self.assertEqual(v["diverging_cells"][0]["by_caller"]["router"], "999")

    def test_one_origin_quoting_where_another_reverts_is_sensitive(self):
        rows = [self._r(n, 1000) for n, _a in CALLERS[:3]]
        rows.append(self._r("router", None, "NOT_ENOUGH_LIQUIDITY"))
        self.assertEqual(caller_verdict(rows)["verdict"], "ORIGIN_SENSITIVE")

    def test_a_cell_the_node_ate_is_not_compared_at_all(self):
        """Comparing an origin that answered with one that could not be read is how a rate limit
        becomes a discrimination finding."""
        rows = [self._r(n, 1000) for n, _a in CALLERS[:3]]
        rows.append(self._r("router", None, "failed to get storage"))
        v = caller_verdict(rows)
        self.assertEqual(v["verdict"], "NOT_MEASURABLE")
        self.assertEqual(v["cells_compared"], 0)
        self.assertTrue(v["rpc_blocked"])

    def test_no_origin_quoting_anywhere_is_the_pool_saying_no(self):
        rows = [self._r(n, None, "NOT_ENOUGH_LIQUIDITY") for n, _a in CALLERS]
        self.assertEqual(caller_verdict(rows)["verdict"], "NOT_QUOTABLE")

    def test_a_hook_is_sensitive_as_soon_as_one_of_its_pools_is(self):
        rows = [self._r(n, 1000, size=10**15) for n, _a in CALLERS]
        rows += [self._r(n, 1000, size=10**18) for n, _a in CALLERS[:3]]
        rows.append(self._r("router", 42, size=10**18))
        s = summarise_callers(rows)
        self.assertEqual(s["n_pools_origin_sensitive"], 1)
        self.assertEqual(s["hook_verdicts"][K.hooks], "ORIGIN_SENSITIVE")

    def test_the_summary_states_what_this_axis_cannot_see(self):
        s = summarise_callers([self._r(n, 1000) for n, _a in CALLERS])
        self.assertIn("tx.origin", s["caveat"])
        self.assertIn("hookData", s["caveat"])
        self.assertEqual(s["n_pools_origin_invariant"], 1)

    def test_origins_are_distinct_addresses(self):
        addrs = [a.lower() for _n, a in CALLERS]
        self.assertEqual(len(set(addrs)), len(addrs))


if __name__ == "__main__":
    unittest.main()
