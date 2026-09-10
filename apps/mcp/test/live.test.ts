/**
 * The counterfactual, for real, against the pinned fork.
 *
 * These tests need `docker compose up -d anvil` in the repository root, with the fork head at the
 * dataset's block. When it is not there they skip — they never pass by default, and they never
 * fabricate a substitute.
 */
import { strict as assert } from "node:assert";
import { test } from "node:test";
import { runEngine } from "../src/engine.js";
import { measureTool } from "../src/tools/measure.js";
import { twinsTool } from "../src/tools/twins.js";
import { BLOCK, HOOK_EXTRACTOR, POOL_EXTRACTOR, cfg, forkAtBlock, payloadOf, store } from "./helpers.js";

const live = await forkAtBlock(BLOCK);
const why = `the pinned fork is not at block ${BLOCK} — run \`docker compose up -d anvil\` in the repository root`;

test("the live counterfactual reproduces the committed row, quote leg for quote leg", { skip: live ? false : why }, async () => {
  const row = store.exact({
    hook: HOOK_EXTRACTOR,
    poolId: POOL_EXTRACTOR,
    amountIn: "1000000000000000",
    zeroForOne: true,
    block: BLOCK,
  });
  assert.ok(row, "the reference row is in the dataset");
  const pool = store.poolById(POOL_EXTRACTOR);
  assert.ok(pool);
  const r = await runEngine({
    rpcUrl: cfg().rpcUrl,
    hook: HOOK_EXTRACTOR,
    currency0: pool.currency0,
    currency1: pool.currency1,
    fee: pool.fee,
    tickSpacing: pool.tick_spacing,
    amountIn: row.amount_in,
    zeroForOne: true,
    block: BLOCK,
    timeoutMs: 120000,
  });
  // Un echec ici a une cause bien plus probable qu'un moteur casse : le fork vise est
  // deja occupe par un autre mesureur. Le talon est un etat GLOBAL du nud ; deux
  // processus qui le posent et le retirent se marchent dessus, et le moteur refuse
  // desormais de rendre un nombre dans ce cas (faux resultat #5). Le message le dit,
  // plutot que de laisser lire "MEASURED attendu, NOT_MEASURABLE obtenu" comme une
  // regression du contrefactuel.
  if (r.label !== "MEASURED" && /mesureur_par_fork|stub_absent/.test(r.reason ?? "")) {
    assert.fail(
      `Le fork ${cfg().rpcUrl} est partage avec un autre mesureur : ${r.reason}\n` +
        "Ce test a besoin d'un fork a lui. Lancez-en un et pointez-le :\n" +
        "  anvil --fork-url $RPC --fork-block-number 50614000 --port 8610 &\n" +
        "  TARE_RPC_URL=http://127.0.0.1:8610 npm test",
    );
  }
  assert.equal(r.label, "MEASURED");
  // Not "close to": the same integers. The stub is deterministic and the fork is pinned.
  assert.equal(r.out_with, row.out_with);
  assert.equal(r.out_without, row.out_without);
  assert.equal(r.stub_hash, row.stub_hash);
  assert.ok(r.bps !== null && Math.abs(r.bps - (row.bps as number)) < 0.005, `${r.bps} vs ${row.bps}`);
});

test("tare_measure reaches the live engine for a size the dataset does not contain", { skip: live ? false : why }, async () => {
  const res = await measureTool(
    // Une taille que le corpus ne contient PAS, choisie parce qu'elle n'est pas une
    // puissance de dix : le balayage ne mesure qu'aux puissances de dix, donc 3e15 ne peut
    // pas s'y trouver. 1e16 y etait autrefois absente ; sur le corpus complet elle existe,
    // et le test testait alors le chemin du corpus en croyant tester le moteur.
    { hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "3000000000000000", direction: "0to1", block: BLOCK },
    cfg({ apiUrl: "http://127.0.0.1:1", apiTimeoutMs: 50, engineTimeoutMs: 120000 }),
    store,
  );
  const r = payloadOf(res)["result"] as Record<string, unknown>;
  assert.equal(r["label"], "MEASURED");
  assert.match(String(r["source"]), /^engine:tare-engine\//);
  assert.ok(BigInt(String(r["out_with"])) > 0n);
  assert.ok(BigInt(String(r["out_without"])) > BigInt(String(r["out_with"])));
  assert.match(String(r["replay"]), /tare_measure\.py/);
});

test("a block the fork is not pinned to is refused, not answered", { skip: live ? false : why }, async () => {
  const res = await measureTool(
    { hook: HOOK_EXTRACTOR, pool: POOL_EXTRACTOR, size: "10000000000000000", direction: "0to1", block: BLOCK + 1 },
    cfg({ apiUrl: "http://127.0.0.1:1", apiTimeoutMs: 50 }),
    store,
  );
  const p = payloadOf(res);
  const r = p["result"] as Record<string, unknown>;
  assert.equal(r["label"], "NOT_MEASURABLE");
  assert.equal(r["bps"], null);
  assert.match(JSON.stringify(p["resolution"]), /fork_block_mismatch/);
});

test("bytecode twins are measured against the fork, on the full code body", { skip: live ? false : why }, async () => {
  const res = await twinsTool({ hook: HOOK_EXTRACTOR }, cfg(), store);
  const byte = payloadOf(res)["bytecode_twins"] as Record<string, unknown>;
  assert.equal(byte["status"], "MEASURED");
  assert.equal(byte["block"], BLOCK);
  const self = byte["self"] as { code_hash: string; code_size_bytes: number };
  assert.match(self.code_hash, /^0x[0-9a-f]{64}$/);
  assert.ok(self.code_size_bytes > 0);
  const probed = byte["universe_probed"] as { status: string }[];
  assert.ok(probed.length >= 12);
});
