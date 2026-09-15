/**
 * DU VERDICT AU MESSAGE SIGNABLE.
 *
 * La page envoie `{ verdict: … }`. Trois formes sont acceptees, et une seule sort :
 *
 *   1. un RAPPORT DE GARDE complet (il a `findings` et `table`) : `buildGuardTypedData` du
 *      depot s'en charge, mot pour mot — c'est le chemin dont docs/ledger/ECRANS.md est la trace ;
 *   2. un MESSAGE deja mis en champs (il a `swaps`) : on le recopie en completant ce qui
 *      manque avec le corpus, et on le dit dans `source` ;
 *   3. un simple NOM D'ACTE ("stop" / "substitution" / "queue"), ou rien du tout : le message
 *      est construit depuis le corpus.
 *
 * AUCUN NOMBRE N'EST INVENTE NULLE PART. Quand le corpus ne mesure pas un point, `take` porte
 * « not measured, not zero » avec son etiquette, exactement comme takeField() du depot. Jamais
 * « 0.00 bps ».
 *
 * ────────────────────────────────────────────────────────────────────────────────────────
 * LE SCHEMA COURT, ET POURQUOI IL EXISTE
 *
 * `TareGuardApproval` — celui de packages/guard/src/ledger.ts, celui dont EIP712.md et
 * docs/ledger/ECRANS.md portent la capture — demande **57 ecrans** sur un Nano X, dont 34 du
 * seul message « Press right button to continue message or press both to skip ». Mesure, pas
 * impression : scripts/chrono-ecrans.sh les compte. Sur scene, ce message revient sans cesse et
 * NOIE le contenu ; le presentateur perd l'attention du jury avant d'arriver au chiffre.
 *
 * On a d'abord essaye de vider les champs plutot que de toucher au schema. **Ca ne marche
 * pas** : un champ a chaine vide occupe quand meme un ecran. Mesure : avec `summary`,
 * `dataset`, `freshness` et `warnings` tous vides et UNE seule porte, l'appareil affiche
 * encore 24 ecrans. Le plancher du schema long est donc au-dessus de la cible.
 *
 * D'ou `TareGuardBrief`, un schema PLUS COURT et NOMME AUTREMENT. Il n'usurpe pas le nom du
 * schema publie : deux structures differentes sous un meme nom seraient exactement le genre
 * d'ambiguite silencieuse que ce projet refuse. L'appareil affiche « Review struct
 * TareGuardBrief », et personne ne peut confondre les deux captures.
 *
 * CE QU'IL PERD : `freshness` (le bloc de mesure et celui du fork sont le meme — `measuredAtBlock`
 * le dit deja), `warnings` (un champ qui dit « none » a chaque fois coute un ecran pour zero
 * information), et le detail de `dataset` (reduit a une ligne de comptes).
 *
 * CE QU'IL NE PERD PAS — et c'est la regle dure : **aucun chiffre**. Le prelevement, la taille,
 * le bloc, le pool, le hook, le sens sont tous la. Le prelevement de la MEILLEURE porte, qui
 * occupait sept ecrans de seconde structure, est desormais dans `summary`, en toutes lettres.
 * Et `promptDigest` scelle le texte integral — moteur et empreinte du stub compris — donc rien
 * de ce qui a disparu de l'ecran n'a disparu de la signature.
 *
 * Le schema long reste construit et disponible : DEMO_MESSAGE=long y revient en une ligne.
 * ────────────────────────────────────────────────────────────────────────────────────────
 */
import { buildGuardTypedData, type Eip712Field, type Eip712TypedData } from "../vendor/guard/src/ledger.js";
import { TARE_GUARD_TYPES, TARE_GUARD_PRIMARY_TYPE } from "../vendor/guard/src/ledger.js";
import { keccak256, toHex } from "../vendor/guard/src/keccak.js";
import { ACTES, CORPUS, EST_ACTE, TABLE, type Acte, type NomActe, type Porte } from "./corpus.js";

const utf8 = (s: string) => new TextEncoder().encode(s);

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;
const MOT32 = /^0x[0-9a-fA-F]{64}$/;

/**
 * TOUT CE QUE L'APPAREIL AFFICHE EST EN ANGLAIS.
 *
 * C'est l'objet que le jury fixe pendant trente secondes, sur un site entierement en anglais.
 * Les commentaires de ce depot restent en francais ; les CHAINES rendues a l'ecran, non.
 *
 * La regle de fond ne change pas d'une langue a l'autre : une etiquette non numerique ne rend
 * jamais un nombre. « not measured — this is not zero » est la traduction exacte de
 * takeField() de packages/guard/src/ledger.ts, et elle dit la meme chose.
 */

/**
 * LE SCHEMA COURT. `TareSwap` du depot porte six champs ; `TareGate` en porte cinq, parce que
 * `take` et `label` y sont FONDUS EN UN SEUL. Ce n'est pas une perte : la regle du projet est
 * que l'etiquette voyage avec la valeur (« un take sans son etiquette laisserait croire qu'une
 * absence de mesure vaut zero »), et les fondre rend cette regle inviolable — on ne peut plus
 * lire l'un sans l'autre, meme en photographiant un seul ecran.
 */
export const TARE_BREF_TYPES: Record<string, Eip712Field[]> = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
  ],
  TareGuardBrief: [
    { name: "verdict", type: "string" },
    { name: "summary", type: "string" },
    { name: "gates", type: "TareGate[]" },
    { name: "dataset", type: "string" },
    { name: "measuredAtBlock", type: "uint256" },
    { name: "promptDigest", type: "bytes32" },
  ],
  TareGate: [
    { name: "hook", type: "address" },
    { name: "poolId", type: "bytes32" },
    { name: "take", type: "string" },
    { name: "size", type: "string" },
    { name: "direction", type: "string" },
  ],
};

export const TARE_BREF_PRIMARY_TYPE = "TareGuardBrief";

/** `long` rend le schema publie (57 ecrans) ; `bref` celui qui tient en 20. */
export const FORME_MESSAGE = (process.env.DEMO_MESSAGE ?? "bref").toLowerCase() === "long" ? "long" : "bref";

/**
 * Le prelevement, a la precision du corpus, AVEC son etiquette et sur la meme ligne.
 * 4 decimales : c'est la precision que la table porte, ni plus ni moins.
 */
export function champTakeBref(p: Porte): string {
  if (p.bps === null) return `not measured, not zero [${p.etiquette}]`;
  return `${p.bps.toFixed(4)} bps [${p.etiquette}]`;
}

/** Une porte, en cinq champs. */
function porteBreve(p: Porte) {
  return {
    hook: p.hook,
    poolId: p.pool_id,
    take: champTakeBref(p),
    size: `${p.taille_wei} in`,
    direction: p.sens,
  };
}

/**
 * LE CORPUS EN UNE LIGNE, et pas quatre.
 *
 * Les comptes restent — ce sont des chiffres, et on ne coupe pas les chiffres. Le moteur et
 * l'empreinte du stub sortent de l'ecran mais RESTENT dans le texte scelle par promptDigest :
 * la signature les engage toujours, la page les affiche, l'ecran ne les repete plus.
 */
export function champDatasetBref(): string {
  return `${CORPUS.n_measurements} meas, ${CORPUS.n_pools} pools, chain ${CORPUS.chain_id}`;
}

/** Ce qui a produit les nombres, cite depuis la table elle-meme et non ecrit en dur. */
export function champDataset(): string {
  return (
    `${CORPUS.n_measurements} measurements, ${CORPUS.n_hooks} hooks, ${CORPUS.n_pools} pools, ` +
    `chain ${CORPUS.chain_id}, engine ${CORPUS.engine_ver ?? "unknown"}, stub ${CORPUS.stub_hash ?? "unknown"}`
  );
}

/** Le prelevement, ou son absence. Meme regle que takeField() de packages/guard/src/ledger.ts. */
export function champTake(p: Porte): string {
  if (p.bps === null) return "not measured — this is not zero";
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
    size: `${p.taille_wei} in`,
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

/**
 * LE TEXTE SCELLE PAR promptDigest.
 *
 * Il porte PLUS que l'ecran, et c'est voulu : le moteur, l'empreinte du stub, la commande de
 * rejeu et la comparaison des deux portes ne tiennent pas sur un Nano, mais la signature doit
 * les engager. La page l'affiche en entier a cote de l'appareil, et /demo/message le rend tel
 * quel — c'est ce qui permet de refaire le keccak a la main et de verifier qu'appareil, page
 * et calcul disent le meme nombre.
 *
 * Il est en anglais comme le reste : traduire l'ecran sans retraduire ce texte laisserait
 * l'appareil attester une phrase que plus personne n'affiche.
 */
function texteDe(acte: Acte): string {
  const p = acte.porte;
  const m = acte.meilleure_porte;
  const lignes = [
    `TARE — ${acte.nom.toUpperCase()}`,
    acte.resume,
    acte.phrase,
    `gate  ${p.pool_id}`,
    `hook  ${p.hook}`,
    `take  ${champTakeBref(p)}`,
    `size  ${p.taille_wei} in, direction ${p.sens}`,
  ];
  if (m) {
    lignes.push(`best gate  ${m.pool_id}`);
    lignes.push(`best hook  ${m.hook}`);
    lignes.push(`best take  ${champTakeBref(m)}`);
    if (acte.economie_bps !== null) lignes.push(`spread  ${acte.economie_bps.toFixed(4)} bps`);
  }
  lignes.push(`measured at block ${CORPUS.block_number}, chain ${CORPUS.chain_id}`);
  lignes.push(`dataset  ${champDataset()}`);
  lignes.push(`replay: ${p.rejeu}`);
  return lignes.join("\n");
}

function verdictDe(acte: Acte): string {
  return acte.verdict.toUpperCase();
}

/** Le message COURT — celui que la demo signe. Vingt ecrans sur un Nano X, mesures. */
function messageBref(acte: Acte, texte: string): Eip712TypedData {
  return {
    domain: { name: "TARE Guard", version: "1", chainId: CORPUS.chain_id },
    types: TARE_BREF_TYPES,
    primaryType: TARE_BREF_PRIMARY_TYPE,
    message: {
      verdict: verdictDe(acte),
      summary: acte.resume,
      // UNE porte : celle qu'on signe. Le prelevement de la meilleure est dans `summary`,
      // en toutes lettres — aucun chiffre n'est perdu, seule la seconde structure disparait.
      gates: [porteBreve(acte.porte)],
      dataset: champDatasetBref(),
      measuredAtBlock: CORPUS.block_number,
      promptDigest: toHex(keccak256(utf8(texte))),
    },
  };
}

/** Le message LONG — le schema publie dans EIP712.md. 57 ecrans. DEMO_MESSAGE=long. */
function messageLong(acte: Acte, texte: string): Eip712TypedData {
  const swaps = [swapDe(acte.porte)];
  if (acte.meilleure_porte) swaps.push(swapDe(acte.meilleure_porte));
  return {
    domain: { name: "TARE Guard", version: "1", chainId: CORPUS.chain_id },
    types: TARE_GUARD_TYPES,
    primaryType: TARE_GUARD_PRIMARY_TYPE,
    message: {
      verdict: verdictDe(acte),
      summary: acte.phrase,
      swaps,
      dataset: champDataset(),
      measuredAtBlock: CORPUS.block_number,
      freshness: `measured at block ${CORPUS.block_number}; the demo fork is pinned to the same block, zero lag`,
      warnings: "none",
      promptDigest: toHex(keccak256(utf8(texte))),
    },
  };
}

/** Le message construit depuis le corpus, pour un acte. */
export function messageDeActe(nom: NomActe): MessageConstruit {
  const acte = ACTES[nom];
  const texte = texteDe(acte);
  return {
    source: "corpus",
    texte,
    typed: FORME_MESSAGE === "long" ? messageLong(acte, texte) : messageBref(acte, texte),
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
    if (EST_ACTE(n)) return messageDeActe(n);
    return messageDeActe(acteParDefaut);
  }
  if (typeof brut !== "object") return messageDeActe(acteParDefaut);
  const o = brut as Record<string, unknown>;
  if (typeof o.acte === "string" && EST_ACTE(o.acte)) {
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
        take: String(s.take ?? "not measured — this is not zero"),
        label: String(s.label ?? "NOT_MEASURABLE"),
        size: String(s.size ?? s.taille ?? "size absent from the calldata: not read — not zero"),
        direction: String(s.direction ?? s.sens ?? "0->1"),
      };
    });
    const message: Record<string, unknown> = {
      verdict: String(o.verdict ?? "BLOCK").toUpperCase(),
      summary: String(o.summary ?? o.phrase ?? ""),
      swaps,
      dataset: String(o.dataset ?? champDataset()),
      measuredAtBlock: Number(o.measuredAtBlock ?? TABLE.block_number),
      freshness: String(o.freshness ?? `measured at block ${CORPUS.block_number}`),
      warnings: String(o.warnings ?? "none"),
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
