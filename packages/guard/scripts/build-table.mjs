#!/usr/bin/env node
/**
 * docs/dataset/measurements.jsonl  ->  packages/guard/data/table.json
 *
 * La garde CONSULTE, elle ne mesure pas. Verifie : une mesure a froid demande ~9 s (deux
 * cotations + anvil_setCode + restauration) ; une signature de swap se decide en moins d'une
 * seconde. Mesurer en direct dans le portefeuille est donc impossible, et la seule reponse
 * honnete est une table pre-calculee qui porte son bloc.
 *
 * Regles appliquees ici, une fois pour toutes, pour que la garde n'ait plus a y penser :
 *  - une etiquette non numerique (NOT_MEASURABLE, NOT_QUOTABLE) perd sa valeur en bps ;
 *  - une ligne dont le pool_id ne se rederive pas depuis sa PoolKey est REJETEE, pas corrigee ;
 *  - rien n'est agrege entre pools : les tailles de deux pools ne sont pas comparables.
 *
 *   node scripts/build-table.mjs [--in <jsonl>] [--out <json>]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const REPO = resolve(ROOT, "..", "..");

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] ? argv[i + 1] : dflt;
};
const IN = resolve(arg("--in", resolve(REPO, "docs/dataset/measurements.jsonl")));
const OUT = resolve(arg("--out", resolve(ROOT, "data/table.json")));

const NUMERIC = new Set(["MEASURED", "INTERPOLATED"]);
const CANON = new Set(["MEASURED", "INTERPOLATED", "NOT_MEASURABLE", "NOT_QUOTABLE"]);

/* ---- keccak256, recopie de src/keccak.ts pour que le script n'ait aucune dependance ---- */
const MASK64 = (1n << 64n) - 1n;
const RC = [0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,
0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,
0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,
0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n];
const ROT = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
const rotl = (x, n) => (n === 0 ? x : ((x << BigInt(n)) | (x >> (64n - BigInt(n)))) & MASK64);
function keccakF(a) {
  const B = new Array(25).fill(0n), C = new Array(5).fill(0n), D = new Array(5).fill(0n);
  for (let r = 0; r < 24; r++) {
    for (let x = 0; x < 5; x++) C[x] = a[x] ^ a[x+5] ^ a[x+10] ^ a[x+15] ^ a[x+20];
    for (let x = 0; x < 5; x++) D[x] = C[(x+4)%5] ^ rotl(C[(x+1)%5], 1);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) a[x+5*y] ^= D[x];
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) B[y+5*((2*x+3*y)%5)] = rotl(a[x+5*y], ROT[x+5*y]);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) a[x+5*y] = B[x+5*y] ^ (~B[((x+1)%5)+5*y] & B[((x+2)%5)+5*y] & MASK64);
    a[0] ^= RC[r];
  }
}
function keccak256(input) {
  const RATE = 136, pad = RATE - (input.length % RATE);
  const buf = new Uint8Array(input.length + pad);
  buf.set(input, 0); buf[input.length] = 0x01; buf[buf.length-1] |= 0x80;
  const st = new Array(25).fill(0n);
  for (let off = 0; off < buf.length; off += RATE) {
    for (let i = 0; i < RATE/8; i++) { let lane = 0n; for (let b = 7; b >= 0; b--) lane = (lane << 8n) | BigInt(buf[off+i*8+b]); st[i] ^= lane; }
    keccakF(st);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 4; i++) { let l = st[i]; for (let b = 0; b < 8; b++) { out[i*8+b] = Number(l & 0xffn); l >>= 8n; } }
  return "0x" + Array.from(out, (b) => b.toString(16).padStart(2, "0")).join("");
}
function poolIdOf(c0, c1, fee, ts, hooks) {
  const w = (v) => { let x = BigInt(v); if (x < 0n) x += 1n << 256n; const o = new Uint8Array(32); for (let i = 31; i >= 0; i--) { o[i] = Number(x & 0xffn); x >>= 8n; } return o; };
  const a = (s) => { const o = new Uint8Array(32); for (let i = 0; i < 20; i++) o[12+i] = parseInt(s.slice(2+i*2, 4+i*2), 16); return o; };
  const buf = new Uint8Array(160);
  [a(c0.toLowerCase()), a(c1.toLowerCase()), w(fee), w(ts), a(hooks.toLowerCase())].forEach((p, i) => buf.set(p, i*32));
  return keccak256(buf);
}
/* ---------------------------------------------------------------------------------------- */

const text = readFileSync(IN, "utf8");
const lines = text.split("\n");
const rows = [];
const rejected = [];
lines.forEach((line, i) => {
  const t = line.trim();
  if (!t) return;
  try {
    const o = JSON.parse(t);
    if (!o || typeof o !== "object") throw new Error("pas un objet");
    rows.push({ line: i + 1, o });
  } catch (e) {
    rejected.push({ line: i + 1, reason: String(e.message).slice(0, 120) });
  }
});

const pools = new Map();
const hooks = new Map();
const blocks = new Set();
const chains = new Set();
let engineVer = null, stubHash = null, kept = 0;

for (const { line, o } of rows) {
  for (const f of ["hook", "pool_id", "label", "amount_in", "block_number"]) {
    if (o[f] === undefined || o[f] === null) { rejected.push({ line, reason: `champ_manquant:${f}` }); o.__bad = true; break; }
  }
  if (o.__bad) continue;
  const label = String(o.label).toUpperCase();
  if (!CANON.has(label)) { rejected.push({ line, reason: `etiquette_inconnue:${o.label}` }); continue; }

  const hook = String(o.hook).toLowerCase();
  const pid = String(o.pool_id).toLowerCase();

  // Re-derivation : une PoolKey qui ne redonne pas son pool_id est une ligne qu'on ne sait
  // pas indexer. On la rejette bruyamment plutot que de la ranger sous une mauvaise cle.
  if (o.currency0 && o.currency1 && o.key_fee !== undefined && o.tick_spacing !== undefined) {
    const d = poolIdOf(o.currency0, o.currency1, o.key_fee, o.tick_spacing, hook);
    if (d !== pid) { rejected.push({ line, reason: `pool_id_non_rederivable:${pid}!=${d}` }); continue; }
  } else {
    rejected.push({ line, reason: "poolkey_incomplete" });
    continue;
  }

  blocks.add(Number(o.block_number));
  chains.add(Number(o.chain_id ?? 8453));
  if (o.engine_ver) engineVer = o.engine_ver;
  if (o.stub_hash) stubHash = o.stub_hash;

  let pool = pools.get(pid);
  if (!pool) {
    pool = {
      hook, currency0: String(o.currency0).toLowerCase(), currency1: String(o.currency1).toLowerCase(),
      fee: Number(o.key_fee), tick_spacing: Number(o.tick_spacing),
      fee_is_dynamic: o.fee_is_dynamic ?? null, stored_lp_fee: o.stored_lp_fee ?? null,
      dirs: {},
    };
    pools.set(pid, pool);
  }
  const dir = o.zero_for_one ? "0->1" : "1->0";
  (pool.dirs[dir] ||= []).push({
    amount_in: String(o.amount_in),
    bps: NUMERIC.has(label) && typeof o.bps === "number" && Number.isFinite(o.bps) ? o.bps : null,
    label,
    reason: o.reason ?? (NUMERIC.has(label) ? null : "label_non_numerique"),
    block_number: Number(o.block_number),
    chain_id: Number(o.chain_id ?? 8453),
  });

  let h = hooks.get(hook);
  if (!h) { h = { n: 0, labels: {}, pools: new Set(), measured: [] }; hooks.set(hook, h); }
  h.n++;
  h.labels[label] = (h.labels[label] ?? 0) + 1;
  h.pools.add(pid);
  if (NUMERIC.has(label) && typeof o.bps === "number" && Number.isFinite(o.bps)) {
    h.measured.push({ bps: o.bps, pool_id: pid, amount_in: String(o.amount_in), direction: dir,
      label, block_number: Number(o.block_number), chain_id: Number(o.chain_id ?? 8453) });
  }
  kept++;
}

// tri par taille croissante : l'interpolation depend de cet ordre
for (const p of pools.values()) {
  for (const d of Object.keys(p.dirs)) {
    p.dirs[d].sort((a, b) => (BigInt(a.amount_in) < BigInt(b.amount_in) ? -1 : BigInt(a.amount_in) > BigInt(b.amount_in) ? 1 : 0));
  }
}

const hookOut = {};
for (const [addr, h] of hooks) {
  h.measured.sort((a, b) => a.bps - b.bps);
  const bps = h.measured.map((m) => m.bps);
  hookOut[addr] = {
    n: h.n,
    labels: h.labels,
    n_pools: h.pools.size,
    pools: [...h.pools].sort(),
    measured: bps.length
      ? {
          n: bps.length,
          bps_min: bps[0],
          bps_median: bps[bps.length >> 1],
          bps_max: bps[bps.length - 1],
          worst: h.measured[h.measured.length - 1],
        }
      : null,
  };
}

if (blocks.size !== 1) console.warn(`[build-table] ${blocks.size} blocs distincts : ${[...blocks].join(",")}`);
if (chains.size !== 1) console.warn(`[build-table] ${chains.size} chaines distinctes : ${[...chains].join(",")}`);

const table = {
  schema: "tare-guard-table/1",
  generated_at: new Date().toISOString(),
  source: "docs/dataset/measurements.jsonl",
  source_sha256: createHash("sha256").update(text).digest("hex"),
  engine_ver: engineVer,
  stub_hash: stubHash,
  chain_id: chains.size === 1 ? [...chains][0] : 0,
  block_number: blocks.size === 1 ? [...blocks][0] : 0,
  blocks: [...blocks].sort((a, b) => a - b),
  n_measurements: kept,
  n_lines_read: rows.length,
  n_rejected: rejected.length,
  rejected: rejected.slice(0, 50),
  n_hooks: hooks.size,
  n_pools: pools.size,
  // LES SEUILS, DERIVES DU CORPUS ET NON ECRITS A LA MAIN.
  //
  // Ils etaient absolus : warn a 25 bps, block a 100. Et le commentaire qui les portait
  // admettait le probleme sans en tirer la consequence — « la mediane du jeu TARE est
  // exactement a 100 bps, ce n'est pas un cas rare ». Mesure : avec ces seuils, la garde
  // affichait `block` sur 49,6 % des lignes et sur 51,1 % des couples (pool, sens). Un garde
  // qui bloque plus d'une transaction sur deux se fait desinstaller dans la semaine, et une
  // alerte qui se declenche toujours ne previent plus de rien.
  //
  // Le sens du produit n'a jamais ete « 1 % c'est trop » : c'est « CE pool prend plus que les
  // autres ». Le seuil est donc un CENTILE du corpus. warn au 90e, block au 99e — soit
  // 89,7 % ok, 9,3 % warn, 1,0 % block. Ils se recalculent a chaque construction de la table :
  // ecrits en dur, ils redeviendraient faux au prochain balayage, exactement comme les
  // premiers.
  seuils: (() => {
    const tous = [];
    for (const p of pools.values())
      for (const pts of Object.values(p.dirs))
        for (const pt of pts) if (pt.label === "MEASURED" && typeof pt.bps === "number") tous.push(pt.bps);
    tous.sort((a, b) => a - b);
    const c = (q) => (tous.length ? tous[Math.min(tous.length - 1, Math.floor((tous.length * q) / 100))] : null);
    return {
      warn_bps: c(90),
      block_bps: c(99),
      derives_de: tous.length,
      centiles: { p50: c(50), p75: c(75), p90: c(90), p95: c(95), p99: c(99), p99_9: c(99.9) },
      note:
        "warn = 90e centile, block = 99e centile des mesures chiffrees. Un seuil ABSOLU " +
        "bloquait la transaction mediane : la mediane du corpus vaut 100,00 bps, et l'ancien " +
        "block etait a 100. Le verdict dit desormais « ce pool prend plus que N % des pools " +
        "mesures », pas « ce pool depasse un chiffre rond ».",
    };
  })(),
  hooks: hookOut,
  pools: Object.fromEntries([...pools.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
};

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(table));
const size = JSON.stringify(table).length;
console.log(
  `[build-table] ${kept}/${rows.length} mesures retenues, ${rejected.length} rejetees, ` +
    `${hooks.size} hooks, ${pools.size} pools, bloc ${table.block_number}, ${(size / 1024).toFixed(0)} Ko -> ${OUT}`,
);
if (rejected.length) console.log("[build-table] premiers rejets :", JSON.stringify(rejected.slice(0, 5)));
