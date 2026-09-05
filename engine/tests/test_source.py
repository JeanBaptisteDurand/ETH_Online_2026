"""LOT P — reading the hooks' code.

The tests that matter here are not "does the parser parse". They are the honesty invariants:

  * a hook with no source must never receive a classification (test 5, and test 6 for the case
    where the source is missing because the *provider* failed rather than answered),
  * a provider that could not be reached must never be recorded as a negative answer (tests 3, 4),
  * a rate must never be invented when a read fails (test 12),
  * the citations printed in the report must resolve to real lines of the fetched files (test 8),
  * the arithmetic that decides concordance must be the arithmetic the source performs (tests
    9, 10, 11, 13, 14).

Everything runs offline: the network is replaced by a fake chain, and the source-tree tests run
against docs/hooks-source/ only when it has actually been fetched.
"""
import json
import os
import shutil
import tempfile
import unittest

from tare.source import classify, declared, fetch, profiles, report, scan

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SOURCES = os.path.join(REPO, "docs", "hooks-source")
ANALYSIS = os.path.join(SOURCES, "analysis.json")
MEASUREMENTS = os.path.join(REPO, "docs", "dataset", "measurements.jsonl")


def _analysis():
    if not os.path.exists(ANALYSIS):
        raise unittest.SkipTest("docs/hooks-source/analysis.json not built yet")
    with open(ANALYSIS) as fh:
        return json.load(fh)


class FakeChain:
    """Stands in for declared.Chain. Answers from a dict; raises for anything it was not given."""

    def __init__(self, answers=None, timestamp=1788017347, fail_with=None):
        self.answers = answers or {}
        self.timestamp = timestamp
        self.fail_with = fail_with
        self.calls = []

    def eth_call(self, to, data):
        self.calls.append((to.lower(), data))
        if self.fail_with:
            raise self.fail_with
        key = (to.lower(), data)
        if key not in self.answers:
            raise RuntimeError("execution reverted")
        return self.answers[key]

    def block_timestamp(self):
        if self.fail_with:
            raise self.fail_with
        return self.timestamp


# ----------------------------------------------------------------------------- fetch honesty

class TestFetchOutcomes(unittest.TestCase):
    def test_404_is_a_negative_answer_not_a_failure(self):
        """Sourcify answering 404 is a real 'I hold nothing', distinct from 'I could not answer'."""
        original = fetch.http_get
        fetch.http_get = lambda url, timeout=60: (404, '{"match":null}')
        try:
            got = fetch.fetch_sourcify("0x" + "11" * 20)
        finally:
            fetch.http_get = original
        self.assertEqual(got["outcome"], fetch.NOT_FOUND)
        self.assertEqual(got["sources"], {})

    def test_a_timeout_is_never_a_negative_answer(self):
        """A transport failure must not be allowed to read as 'this contract is unverified'."""
        original = fetch.http_get

        def boom(url, timeout=60):
            raise fetch.FetchFailed("timeout after 60s")

        fetch.http_get = boom
        try:
            got = fetch.fetch_sourcify("0x" + "22" * 20)
        finally:
            fetch.http_get = original
        self.assertTrue(got["outcome"].startswith(fetch.FETCH_FAILED))
        self.assertNotEqual(got["outcome"], fetch.NOT_FOUND)

    def test_a_rate_limit_is_deferred_not_denied(self):
        """429 and 5xx are 'ask again', which http_get must raise rather than return."""
        original = fetch.subprocess.run

        class Proc:
            stdout = "\n429"
            returncode = 0

        fetch.subprocess.run = lambda *a, **k: Proc()
        try:
            with self.assertRaises(fetch.FetchFailed):
                fetch.http_get("https://example.invalid")
        finally:
            fetch.subprocess.run = original

    def test_missing_api_key_is_unavailable_not_not_found(self):
        got = fetch.fetch_etherscan("0x" + "33" * 20, api_key="")
        self.assertEqual(got["outcome"], fetch.UNAVAILABLE)
        self.assertNotEqual(got["outcome"], fetch.NOT_FOUND)

    def test_provider_paths_cannot_escape_the_output_directory(self):
        tmp = tempfile.mkdtemp()
        try:
            attempt = {"provider": "sourcify", "outcome": fetch.FOUND,
                       "sources": {"../../../../etc/evil.sol": "// nope"}}
            prov = fetch.write_hook_sources("0x" + "44" * 20, attempt, tmp)
            written = prov["files"][0]["path"]
            self.assertNotIn("..", written)
            self.assertTrue(os.path.exists(os.path.join(tmp, "0x" + "44" * 20, "sources", written)))
        finally:
            shutil.rmtree(tmp)

    def test_a_hooks_own_code_under_node_modules_is_not_treated_as_a_dependency(self):
        """Zora ships ZoraV4CoinHook inside node_modules/@zoralabs/coins/src/hooks/."""
        self.assertFalse(fetch.is_vendor("node_modules/@zoralabs/coins/src/hooks/ZoraV4CoinHook.sol"))
        self.assertTrue(fetch.is_vendor("node_modules/@zoralabs/coins/node_modules/@openzeppelin/x.sol"))
        self.assertTrue(fetch.is_vendor("lib/v4-core/src/libraries/Hooks.sol"))
        self.assertFalse(fetch.is_vendor("src/hooks/ClankerHookV2.sol"))


# ----------------------------------------------------------------------------- THE invariant

class TestNoSourceNoClassification(unittest.TestCase):
    def test_a_hook_without_source_receives_no_classification(self):
        """The load-bearing test of LOT P, on synthetic input: unread means unclassified."""
        tmp = tempfile.mkdtemp()
        try:
            addr = "0x" + "55" * 20
            fetch.write_hook_sources(addr, {"provider": "sourcify", "outcome": fetch.NOT_FOUND,
                                            "sources": {}}, tmp,
                                     attempts=[{"provider": "sourcify", "outcome": "NOT_FOUND"}])
            rows = [{"hook": addr, "pool_id": "0x" + "00" * 32, "label": "MEASURED",
                     "bps": 99.99, "amount_in": "100000000000000", "out_with": "1", "out_without": "2",
                     "zero_for_one": True, "stored_lp_fee": 0}]
            rec = classify.classify_hook(addr, rows, tmp)
            self.assertFalse(rec["read"])
            self.assertIsNone(rec["classification"])
            self.assertEqual(rec["verdict"], classify.UNREAD)
            for forbidden in ("taken_where", "announced", "modifiable", "citations",
                              "concordance", "pool_checks", "rate_unit", "contract"):
                self.assertNotIn(forbidden, rec, f"{forbidden} leaked onto an unread hook")
        finally:
            shutil.rmtree(tmp)

    def test_a_failed_fetch_is_as_unread_as_a_negative_answer(self):
        """FETCH_FAILED must not licence a classification either — it is not evidence."""
        tmp = tempfile.mkdtemp()
        try:
            addr = "0x" + "66" * 20
            fetch.write_hook_sources(addr, {"provider": "sourcify",
                                            "outcome": "FETCH_FAILED:timeout after 60s",
                                            "sources": {}}, tmp)
            rec = classify.classify_hook(addr, [], tmp)
            self.assertFalse(rec["read"])
            self.assertIsNone(rec["classification"])
            self.assertIn("says nothing", rec["why"])
        finally:
            shutil.rmtree(tmp)

    def test_no_hook_without_source_is_classified_in_the_real_analysis(self):
        """Same invariant, over the artefact that actually ships."""
        analysis = _analysis()
        unread = [h for h in analysis["hooks"] if not h["read"]]
        self.assertTrue(unread, "expected at least one unread hook in this corpus")
        for h in unread:
            self.assertIsNone(h["classification"])
            self.assertEqual(h["verdict"], classify.UNREAD)
            for forbidden in ("taken_where", "announced", "modifiable", "concordance",
                              "pool_checks", "citations"):
                self.assertNotIn(forbidden, h, f"{h['hook']} was classified without a source")


# ----------------------------------------------------------------------------- citations

class TestCitations(unittest.TestCase):
    def test_every_published_citation_points_at_a_real_line(self):
        analysis = _analysis()
        checked = 0
        for h in analysis["hooks"]:
            for cit in h.get("citations", []) + h.get("delegate_citations", []):
                if cit.get("status") != "OK":
                    continue
                root = h["delegate"] if cit in h.get("delegate_citations", []) else h["hook"]
                path = os.path.join(SOURCES, root, "sources", cit["file"])
                self.assertTrue(os.path.exists(path), f"{path} is missing")
                with open(path, errors="replace") as fh:
                    lines = fh.read().splitlines()
                self.assertIn(cit["anchor"], lines[cit["line"] - 1],
                              f"{cit['file']}:{cit['line']} no longer contains its anchor")
                checked += 1
        self.assertGreater(checked, 20, "expected the report to rest on many citations")

    def test_an_unresolvable_anchor_is_reported_not_guessed(self):
        tmp = tempfile.mkdtemp()
        try:
            addr = "0x" + "77" * 20
            fetch.write_hook_sources(addr, {"provider": "sourcify", "outcome": fetch.FOUND,
                                            "sources": {"src/A.sol": "contract A {}\n"}}, tmp)
            got = classify.resolve_citations(
                os.path.join(tmp, addr),
                [{"claim": "x", "file": "src/A.sol", "anchor": "NOT THERE"},
                 {"claim": "y", "file": "src/Missing.sol", "anchor": "z"}])
            self.assertEqual(got[0]["status"], "UNRESOLVED")
            self.assertIsNone(got[0]["line"])
            self.assertEqual(got[1]["status"], "FILE_MISSING")
        finally:
            shutil.rmtree(tmp)


# ----------------------------------------------------------------------------- the models

class TestModels(unittest.TestCase):
    def test_zora_constant_is_one_percent_and_the_corpus_agrees(self):
        """LP_FEE_V4 = 10 000 pips = 1 % = 100 bps; the model must say exactly that."""
        got = profiles.zora_predict({"lp_fee_pips": 10_000}, {"stored_lp_fee": 0})
        self.assertAlmostEqual(got["predicted_bps"], 100.0, places=6)
        self.assertEqual(got["side"], "input")

    def test_zora_divides_by_the_pools_stored_fee_rather_than_assuming_zero(self):
        got = profiles.zora_predict({"lp_fee_pips": 10_000}, {"stored_lp_fee": 10_000})
        self.assertAlmostEqual(got["predicted_bps"], 0.0, places=6)

    def test_clanker_prices_the_protocol_carve_it_was_given_not_a_hard_coded_twenty_percent(self):
        """The cc0 fork sets the numerator to 0; hard-coding 20 % mispriced a whole hook."""
        row = {"stored_lp_fee": 0, "zero_for_one": False}
        vals = {"token_fee": 10_000, "paired_fee": 10_000, "is_token0": True}
        upstream = profiles.clanker_predict(dict(vals, protocol_fee_numerator=200_000), row)
        forked = profiles.clanker_predict(dict(vals, protocol_fee_numerator=0), row)
        self.assertAlmostEqual(upstream["predicted_bps"], 119.7605, places=3)
        self.assertAlmostEqual(forked["predicted_bps"], 100.0, places=4)
        self.assertEqual(forked["detail"]["protocol_fee_pips"], 0)

    def test_clanker_prices_both_branches_when_the_direction_selector_is_internal(self):
        row = {"stored_lp_fee": 0, "zero_for_one": True}
        got = profiles.clanker_predict(
            {"token_fee": 10_000, "paired_fee": 10_000, "is_token0": None,
             "protocol_fee_numerator": 200_000}, row)
        self.assertIsNone(got["predicted_bps"])
        lo, hi = got["predicted_bps_range"]
        self.assertLess(lo, hi)
        self.assertIn("internal", got["note"])

    def test_launchhook_reads_an_unregistered_pool_as_exactly_nothing(self):
        got = profiles.launchhook_predict(
            {"pool_config": {"initialized": False}, "block_timestamp": 1788017347},
            {"zero_for_one": True})
        self.assertEqual(got["predicted_bps"], 0.0)

    def test_launchhook_decays_the_anti_snipe_surcharge_the_way_the_source_does(self):
        cfg = {"initialized": True, "tokenIsCurrency0": False, "baseFeeBps": 100,
               "antiSnipeStartTotalBps": 9900, "antiSnipeWindowSeconds": 100,
               "launchTime": 1_000_000}
        closed = profiles.launchhook_predict(
            {"pool_config": cfg, "block_timestamp": 1_000_200}, {"zero_for_one": True})
        halfway = profiles.launchhook_predict(
            {"pool_config": cfg, "block_timestamp": 1_000_050}, {"zero_for_one": True})
        self.assertEqual(closed["predicted_bps"], 100.0)
        self.assertEqual(halfway["predicted_bps"], 100.0 + (9900 - 100) * 50 // 100)

    def test_doppler_uses_the_end_fee_once_the_schedule_has_run_out(self):
        got = profiles.doppler_predict(
            {"fee_schedule": {"starting_time": 1_000, "start_fee": 800_000, "end_fee": 10_500,
                              "last_fee": 800_000, "duration_seconds": 14},
             "block_timestamp": 1_000_000, "delegate": "0x" + "ab" * 20},
            {"stored_lp_fee": 0})
        self.assertAlmostEqual(got["predicted_bps"], 105.0, places=6)
        self.assertEqual(got["side"], "output")


# ----------------------------------------------------------------------------- reading on chain

class TestDeclaredReads(unittest.TestCase):
    def test_a_rate_limited_read_yields_no_rate_and_no_zero(self):
        chain = FakeChain(fail_with=RuntimeError("HTTP 429"))
        got = declared.read_declared(chain, profiles.CLANKER_V2,
                                     "0x" + "88" * 20,
                                     {"pool_id": "0x" + "00" * 32, "stored_lp_fee": 0,
                                      "zero_for_one": True})
        self.assertFalse(got["ok"])
        self.assertIn("429", got["reason"])
        self.assertNotIn("token_fee", got["values"])

    def test_an_empty_return_is_an_error_not_a_zero(self):
        with self.assertRaises(ValueError):
            declared.decode("uint", "0x")

    def test_a_struct_is_decoded_with_the_layout_from_the_source_not_a_guess(self):
        """Two LaunchHook deployments ship different 11-member PoolConfig structs."""
        if not os.path.isdir(os.path.join(SOURCES, "0x985c14baa2a18316ffda0aefb3a632fadfca2acc")):
            raise unittest.SkipTest("sources not fetched")
        a = scan.parse_struct(os.path.join(SOURCES, "0x985c14baa2a18316ffda0aefb3a632fadfca2acc"),
                              "src/LaunchHook.sol", "PoolConfig")
        b = scan.parse_struct(os.path.join(SOURCES, "0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc"),
                              "src/LaunchHook.sol", "PoolConfig")
        self.assertEqual(len(a), len(b), "both structs flatten to the same number of words")
        self.assertNotEqual([n for _, n in a], [n for _, n in b],
                            "…but not the same fields, which is exactly the trap")
        self.assertEqual([n for _, n in a].index("baseFeeBps"), 4)
        self.assertEqual([n for _, n in b].index("baseFeeBps"), 7)
        word = lambda v: f"{v:064x}"
        raw = "0x" + "".join(word(v) for v in
                             [1, 0, 0, 0, 0, 0, 0, 100, 9900, 60, 1_787_858_193])
        decoded = declared.decode_struct(b, raw)
        self.assertEqual(decoded["baseFeeBps"], 100)
        self.assertTrue(decoded["initialized"])


# ----------------------------------------------------------------------------- comparison rules

class TestConcordanceRules(unittest.TestCase):
    def _row(self, bps, amount="100000000000000", out="1000000000000000000000",
             elasticity=1.0, quant=0.0001):
        return {"pool_id": "0x" + "0a" * 32, "amount_in": amount, "bps": bps,
                "zero_for_one": True, "stored_lp_fee": 0, "out_without": out,
                "label": "MEASURED", "_quantization_bps": quant, "_size_elasticity": elasticity}

    def test_a_gap_inside_the_tolerance_is_concordant_and_outside_it_is_not(self):
        pred = {"predicted_bps": 100.0, "side": "output", "detail": {}, "note": ""}
        near = classify.concordance_for_pool(pred, self._row(99.9956))
        far = classify.concordance_for_pool(pred, self._row(97.0))
        self.assertEqual(near["verdict"], classify.CONCORDANT)
        self.assertEqual(far["verdict"], classify.DIVERGENT)
        self.assertAlmostEqual(far["delta_bps"], -3.0, places=4)

    def test_a_size_insensitive_pool_cannot_resolve_an_input_side_fee(self):
        """Ten times the input buying the same output means an input-side fee cannot show."""
        pred = {"predicted_bps": 100.0, "side": "input", "detail": {}, "note": ""}
        got = classify.concordance_for_pool(pred, self._row(0.0007, elasticity=7.3e-7))
        self.assertEqual(got["verdict"], classify.NOT_RESOLVABLE)
        self.assertIn("insensitive to size", got["reason"])

    def test_the_same_pool_still_resolves_an_output_side_fee(self):
        pred = {"predicted_bps": 100.0, "side": "output", "detail": {}, "note": ""}
        got = classify.concordance_for_pool(pred, self._row(0.0007, elasticity=7.3e-7))
        self.assertEqual(got["verdict"], classify.DIVERGENT)

    def test_the_reference_size_skips_rows_whose_rounding_noise_swamps_the_tolerance(self):
        """One corpus pool quotes 2 458 units out at 1e14 in — one unit there is 4 bps."""
        rows = [
            {"pool_id": "p", "label": "MEASURED", "amount_in": "100000000000000",
             "out_without": "2458", "bps": 16.2734},
            {"pool_id": "p", "label": "MEASURED", "amount_in": "1000000000000000",
             "out_without": "24586", "bps": 19.93},
            {"pool_id": "p", "label": "MEASURED", "amount_in": "10000000000000000",
             "out_without": "245869", "bps": 19.97},
        ]
        chosen = classify.reference_rows(rows)[0]
        self.assertEqual(chosen["amount_in"], "10000000000000000")
        self.assertTrue(chosen["_quantization_clean"])
        self.assertLess(chosen["_quantization_bps"], classify.TOL_BPS * classify.QUANT_FRACTION)

    def test_a_pool_with_no_clean_size_still_reports_its_noise(self):
        rows = [{"pool_id": "p", "label": "MEASURED", "amount_in": "1", "out_without": "10",
                 "bps": 1.0}]
        chosen = classify.reference_rows(rows)[0]
        self.assertFalse(chosen["_quantization_clean"])
        self.assertGreater(chosen["_quantization_bps"], classify.TOL_BPS)

    def test_not_resolvable_pools_never_count_as_agreement(self):
        recs = [{"verdict": classify.CONCORDANT, "delta_bps": 0.01},
                {"verdict": classify.NOT_RESOLVABLE},
                {"verdict": classify.UNVERIFIED}]
        summary = classify.summarise(recs)
        self.assertEqual(summary["concordant"], 1)
        self.assertEqual(summary["not_resolvable"], 1)
        self.assertEqual(summary["comparable"], 1)
        self.assertEqual(classify.summarise([{"verdict": classify.NOT_RESOLVABLE}])["label"],
                         classify.NOT_RESOLVABLE)


# ----------------------------------------------------------------------------- the artefact

class TestPublishedArtefact(unittest.TestCase):
    def test_the_report_never_prints_a_rate_for_an_unread_hook(self):
        analysis = _analysis()
        md = report.render(analysis)
        for h in analysis["hooks"]:
            if h["read"]:
                continue
            short = h["hook"][:10]
            line = next(l for l in md.splitlines() if short in l and l.startswith("|"))
            self.assertIn("behaviour not read", line)
            self.assertIn("not read", line)

    def test_the_analysis_pins_the_corpus_it_was_computed_from(self):
        analysis = _analysis()
        self.assertEqual(len(analysis.get("measurements_sha256", "")), 64)
        self.assertGreater(analysis.get("measurements_rows", 0), 0)

    def test_every_measured_hook_in_the_corpus_appears_in_the_analysis(self):
        analysis = _analysis()
        if not os.path.exists(MEASUREMENTS):
            raise unittest.SkipTest("corpus missing")
        with open(MEASUREMENTS) as fh:
            hooks = {json.loads(l)["hook"].lower() for l in fh if l.strip()}
        listed = {h["hook"] for h in analysis["hooks"]}
        self.assertTrue(hooks.issubset(listed),
                        f"missing from the analysis: {sorted(hooks - listed)}")


if __name__ == "__main__":
    unittest.main()
