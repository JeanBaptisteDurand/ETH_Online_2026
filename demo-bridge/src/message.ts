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

/* ------------------------------------------------------------ les trois choix */

/**
 * LES TROIS CHOIX, POSES SUR L'APPAREIL.
 *
 * L'application Ethereum ne termine un message que par « Sign message » ou « Reject » : elle ne
 * sait pas porter un menu a trois lignes. Un vrai menu exigerait une application Ledger a nous.
 * Les trois reponses se posent donc en DEUX questions signees, dans cet ordre :
 *
 *   question 1 « 1 of 3: keep your route »       Sign   -> la transaction d'origine part
 *                                                Reject -> question 2
 *   question 2 « 2 of 3: take the cheaper gate » Sign   -> le remplacement part, en second appel
 *                                                Reject -> « 3 of 3: cancel », rien ne part
 *
 * Sans porte de remplacement (acte `stop`), il n'y a qu'une question, « 1 of 2 », et Reject
 * annule. La decision est donc prise ENTIEREMENT sur l'appareil : la page ne fait qu'afficher
 * ce qu'il demande.
 *
 * LE SCHEMA EST AUSSI COURT QUE POSSIBLE, parce qu'il se traverse jusqu'a deux fois par swap.
 * Chaque champ coute deux ecrans sur un Nano (le champ, puis « Press right button to continue
 * message or press both to skip »). Mesure sur l'appareil : appuyer sur les DEUX boutons sur un
 * de ces separateurs mene directement a « Sign message ». L'ordre des champs est donc celui de la
 * decision : quelle question, ce que prend cette porte, ou mene le refus (avec le chiffre de
 * l'autre porte) — puis, sautables, le hook et `promptDigest`, qui scelle le texte integral.
 * Soit 15 appuis pour signer une question et 16 pour la refuser, contre 25 ecrans au depart.
 */
export type OptionChoix = "actuelle" | "optimisee" | "annuler";
export type OptionPosee = Exclude<OptionChoix, "annuler">;

export interface OptionAnnoncee {
  rang: 1 | 2 | 3;
  option: OptionChoix;
  libelle: string;
}

/**
 * LE DOMAINE NE PORTE QUE SON NOM. Mesure sur l'appareil (Nano X, Ethereum 1.22.3) : chaque
 * champ du domaine coute deux ecrans, et `version` + `chainId` en ajoutaient quatre A CHAQUE
 * question, avant meme le premier mot du choix. La chaine n'est pas perdue : le texte scelle par
 * `promptDigest` porte « chain 8453 ».
 */
export const TARE_CHOIX_TYPES: Record<string, Eip712Field[]> = {
  EIP712Domain: [{ name: "name", type: "string" }],
  TareGuardChoice: [
    { name: "choice", type: "string" },
    { name: "take", type: "string" },
    { name: "ifRejected", type: "string" },
    { name: "hook", type: "address" },
    { name: "promptDigest", type: "bytes32" },
  ],
};

export const TARE_CHOIX_PRIMARY_TYPE = "TareGuardChoice";

/** Les reponses possibles pour un acte, dans l'ordre ou l'appareil les pose. */
export function optionsDe(nom: NomActe): OptionAnnoncee[] {
  const acte = ACTES[nom];
  const m = acte.meilleure_porte;
  if (!m) {
    return [
      { rang: 1, option: "actuelle", libelle: `keep your route · ${champTakeBref(acte.porte)}` },
      { rang: 2, option: "annuler", libelle: "cancel · nothing is sent" },
    ];
  }
  return [
    { rang: 1, option: "actuelle", libelle: `keep your route · ${champTakeBref(acte.porte)}` },
    { rang: 2, option: "optimisee", libelle: `take the cheaper gate · ${champTakeBref(m)}` },
    { rang: 3, option: "annuler", libelle: "cancel · nothing is sent" },
  ];
}

/** Les questions reellement posees : toutes les options sauf l'annulation, qui est le refus final. */
export function questionsDe(nom: NomActe): OptionPosee[] {
  return optionsDe(nom)
    .map((o) => o.option)
    .filter((o): o is OptionPosee => o !== "annuler");
}

export interface QuestionConstruite {
  rang: 1 | 2;
  option: OptionPosee;
  typed: Eip712TypedData;
  texte: string;
  prompt_digest: string;
}

/** Le texte scelle d'une question : plus que l'ecran, comme pour le rapport. */
function texteDeQuestion(acte: Acte, option: OptionPosee, choix: string, siRejet: string): string {
  const p = option === "actuelle" ? acte.porte : acte.meilleure_porte!;
  const autre = option === "actuelle" ? acte.meilleure_porte : acte.porte;
  const lignes = [
    `TARE — ${choix.toUpperCase()}`,
    option === "actuelle"
      ? "sign: the original transaction goes to the wallet, unchanged"
      : "sign: the page sends the replacement as a second call, and the wallet opens on it",
    `reject: ${siRejet}`,
    `gate  ${p.pool_id}`,
    `hook  ${p.hook}`,
    `take  ${champTakeBref(p)}`,
    `size  ${p.taille_wei} in, direction ${p.sens}`,
  ];
  if (autre) {
    lignes.push(`other gate  ${autre.pool_id}`);
    lignes.push(`other hook  ${autre.hook}`);
    lignes.push(`other take  ${champTakeBref(autre)}`);
    if (acte.economie_bps !== null) lignes.push(`spread  ${acte.economie_bps.toFixed(4)} bps`);
  }
  lignes.push(`measured at block ${CORPUS.block_number}, chain ${CORPUS.chain_id}`);
  lignes.push(`dataset  ${champDataset()}`);
  lignes.push(`replay: ${p.rejeu}`);
  return lignes.join("\n");
}

/** Une question de l'appareil, construite depuis le corpus. Aucun nombre n'y est ecrit a la main. */
export function questionDe(nom: NomActe, option: OptionPosee): QuestionConstruite {
  const acte = ACTES[nom];
  const options = optionsDe(nom);
  const total = options.length;
  const moi = options.find((o) => o.option === option);
  if (!moi) throw new Error(`question_impossible: l'acte ${nom} ne propose pas « ${option} »`);
  if (option === "optimisee" && !acte.meilleure_porte) {
    throw new Error(`question_impossible: l'acte ${nom} n'a pas de porte de remplacement`);
  }
  const suivante = options[moi.rang]; // rang est 1-indexe : options[rang] est la suivante
  if (!suivante) throw new Error(`question_impossible: rien ne suit « ${option} » dans l'acte ${nom}`);
  const p = option === "actuelle" ? acte.porte : acte.meilleure_porte!;

  const choix =
    option === "actuelle" ? `${moi.rang} of ${total}: keep your route` : `${moi.rang} of ${total}: take the cheaper gate`;
  const siRejet =
    suivante.option === "annuler"
      ? `${suivante.rang} of ${total}: cancel, nothing is sent`
      : `${suivante.rang} of ${total}: cheaper gate, ${champTakeBref(acte.meilleure_porte!)}`;

  const texte = texteDeQuestion(acte, option, choix, siRejet);
  const prompt_digest = toHex(keccak256(utf8(texte)));
  return {
    rang: moi.rang as 1 | 2,
    option,
    texte,
    prompt_digest,
    typed: {
      // Le type du depot exige `version` et `chainId` ; EIP-712 ne les exige pas, et le schema
      // ci-dessus ne les declare pas — ils ne seraient donc ni affiches ni signes.
      domain: { name: "TARE Guard" } as Eip712TypedData["domain"],
      types: TARE_CHOIX_TYPES,
      primaryType: TARE_CHOIX_PRIMARY_TYPE,
      message: {
        choice: choix,
        take: champTakeBref(p),
        ifRejected: siRejet,
        hook: p.hook,
        promptDigest: prompt_digest,
      },
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
