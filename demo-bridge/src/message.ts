/**
 * DU VERDICT AU MESSAGE SIGNABLE.
 *
 * La page envoie `{ verdict: … }`. Trois formes sont acceptees, et une seule sort :
 *
 *   1. un RAPPORT DE GARDE complet (il a `findings` et `table`) : `buildGuardTypedData` du
 *      depot s'en charge, mot pour mot — c'est le chemin dont docs/ledger/ECRANS.md est la trace ;
 *   2. un MESSAGE deja mis en champs (il a `swaps`) : on le recopie en completant ce qui
 *      manque avec le corpus, et on le dit dans `source` ;
 *   3. un simple NOM D'ACTE ("stop" / "substitution"), ou rien du tout : le message est
 *      construit depuis le corpus.
 *
 * AUCUN NOMBRE N'EST INVENTE NULLE PART. Quand le corpus ne mesure pas un point, `take` porte
 * « non mesure — ce n'est pas zero », exactement comme takeField() du depot. Jamais « 0.00 bps ».
 */
import { buildGuardTypedData, type Eip712TypedData } from "../vendor/guard/src/ledger.js";
import { TARE_GUARD_TYPES, TARE_GUARD_PRIMARY_TYPE } from "../vendor/guard/src/ledger.js";
import { keccak256, toHex } from "../vendor/guard/src/keccak.js";
import { ACTES, CORPUS, TABLE, type Acte, type NomActe, type Porte } from "./corpus.js";

const utf8 = (s: string) => new TextEncoder().encode(s);

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;
const MOT32 = /^0x[0-9a-fA-F]{64}$/;

/** Ce qui a produit les nombres, cite depuis la table elle-meme et non ecrit en dur. */
export function champDataset(): string {
  return (
    `${CORPUS.n_measurements} mesures, ${CORPUS.n_hooks} hooks, ${CORPUS.n_pools} pools, ` +
    `chaine ${CORPUS.chain_id}, moteur ${CORPUS.engine_ver ?? "inconnu"}, stub ${CORPUS.stub_hash ?? "inconnu"}`
  );
}

/** Le prelevement, ou son absence. Meme regle que takeField() de packages/guard/src/ledger.ts. */
export function champTake(p: Porte): string {
  if (p.bps === null) return "non mesure — ce n'est pas zero";
  return `${p.bps.toFixed(2)} bps`;
}

function champLabel(p: Porte): string {
  return p.motif ? `${p.etiquette} (${p.motif})` : p.etiquette;
}

function swapDe(p: Porte) {
  return {
    hook: p.hook,
    poolId: p.pool_id,
    take: champTake(p),
    label: champLabel(p),
    size: `${p.taille_wei} en entree`,
    direction: p.sens,
  };
}

export interface MessageConstruit {
  typed: Eip712TypedData;
  /** d'ou vient le message : c'est ce qui rend l'ecran verifiable */
  source: "rapport_de_garde" | "message_fourni" | "corpus";
  /** le texte dont promptDigest porte le keccak256 */
  texte: string;
}

function estRapport(v: unknown): v is { findings: unknown[]; table: unknown } {
  return (
    typeof v === "object" &&
    v !== null &&
    Array.isArray((v as { findings?: unknown }).findings) &&
    typeof (v as { table?: unknown }).table === "object" &&
    (v as { table?: unknown }).table !== null
  );
}

function texteDe(acte: Acte): string {
  const p = acte.porte;
  return [
    `TARE — ${acte.nom.toUpperCase()}`,
    acte.phrase,
    `pool ${p.pool_id}`,
    `hook ${p.hook}`,
    `prelevement ${champTake(p)} [${p.etiquette}]`,
    `taille ${p.taille_wei} en entree, sens ${p.sens}`,
    `mesures au bloc ${CORPUS.block_number}, chaine ${CORPUS.chain_id}`,
    `rejeu : ${p.rejeu}`,
  ].join("\n");
}

function verdictDe(acte: Acte): string {
  if (acte.nom === "stop") return "BLOCK";
  return acte.etat === "MEILLEURE_PORTE" ? "WARN" : "OK";
}

/** Le message construit depuis le corpus, pour un acte. */
export function messageDeActe(nom: NomActe): MessageConstruit {
  const acte = ACTES[nom];
  const texte = texteDe(acte);
  const swaps = [swapDe(acte.porte)];
  if (acte.meilleure_porte) swaps.push(swapDe(acte.meilleure_porte));
  return {
    source: "corpus",
    texte,
    typed: {
      domain: { name: "TARE Guard", version: "1", chainId: CORPUS.chain_id },
      types: TARE_GUARD_TYPES,
      primaryType: TARE_GUARD_PRIMARY_TYPE,
      message: {
        verdict: verdictDe(acte),
        summary: acte.phrase,
        swaps,
        dataset: champDataset(),
        measuredAtBlock: CORPUS.block_number,
        freshness: `mesures au bloc ${CORPUS.block_number} ; le fork de la demo est epingle au meme bloc, retard nul`,
        warnings: "aucun",
        promptDigest: toHex(keccak256(utf8(texte))),
      },
    },
  };
}

function texteLibre(m: Record<string, unknown>): string {
  return [
    `TARE — ${String(m.verdict ?? "")}`,
    String(m.summary ?? ""),
    JSON.stringify(m.swaps ?? []),
    String(m.dataset ?? ""),
  ].join("\n");
}

/**
 * Le point d'entree : `{ verdict }` tel que la page l'envoie -> un message signable.
 * `acteParDefaut` sert quand le corps ne dit rien d'exploitable.
 */
export function construireMessage(brut: unknown, acteParDefaut: NomActe = "stop"): MessageConstruit {
  // forme 3 : un nom d'acte, ou rien
  if (brut === undefined || brut === null) return messageDeActe(acteParDefaut);
  if (typeof brut === "string") {
    const n = brut.toLowerCase();
    if (n === "stop" || n === "substitution") return messageDeActe(n);
    return messageDeActe(acteParDefaut);
  }
  if (typeof brut !== "object") return messageDeActe(acteParDefaut);
  const o = brut as Record<string, unknown>;
  if (typeof o.acte === "string" && (o.acte === "stop" || o.acte === "substitution")) {
    return messageDeActe(o.acte);
  }

  // forme 1 : un rapport de garde complet
  if (estRapport(o)) {
    const typed = buildGuardTypedData(o as never);
    return { typed, source: "rapport_de_garde", texte: "" };
  }

  // forme 2 : un message deja mis en champs
  if (Array.isArray(o.swaps)) {
    const swaps = (o.swaps as Array<Record<string, unknown>>).map((s, i) => {
      const hook = String(s.hook ?? "");
      const pool = String(s.poolId ?? s.pool_id ?? "");
      if (!ADRESSE.test(hook)) throw new Error(`swaps[${i}].hook n'est pas une adresse : ${hook}`);
      if (!MOT32.test(pool)) throw new Error(`swaps[${i}].poolId n'est pas un bytes32 : ${pool}`);
      return {
        hook: hook.toLowerCase(),
        poolId: pool.toLowerCase(),
        take: String(s.take ?? "non mesure — ce n'est pas zero"),
        label: String(s.label ?? "NOT_MEASURABLE"),
        size: String(s.size ?? s.taille ?? "taille absente du calldata : non lue — pas zero"),
        direction: String(s.direction ?? s.sens ?? "0->1"),
      };
    });
    const message: Record<string, unknown> = {
      verdict: String(o.verdict ?? "BLOCK").toUpperCase(),
      summary: String(o.summary ?? o.phrase ?? ""),
      swaps,
      dataset: String(o.dataset ?? champDataset()),
      measuredAtBlock: Number(o.measuredAtBlock ?? TABLE.block_number),
      freshness: String(o.freshness ?? `mesures au bloc ${CORPUS.block_number}`),
      warnings: String(o.warnings ?? "aucun"),
      promptDigest: "",
    };
    const digest = typeof o.promptDigest === "string" && MOT32.test(o.promptDigest) ? o.promptDigest : null;
    const texte = digest ? "" : texteLibre(message);
    message.promptDigest = digest ?? toHex(keccak256(utf8(texte)));
    return {
      source: "message_fourni",
      texte,
      typed: {
        domain: { name: "TARE Guard", version: "1", chainId: Number(o.chainId ?? CORPUS.chain_id) },
        types: TARE_GUARD_TYPES,
        primaryType: TARE_GUARD_PRIMARY_TYPE,
        message,
      },
    };
  }

  return messageDeActe(acteParDefaut);
}
