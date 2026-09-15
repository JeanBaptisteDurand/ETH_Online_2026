/**
 * LE PONT DE LA DEMO LIVE.
 *
 * Cinq routes, 127.0.0.1:8790, expose en https://demo.tare-hooks.tech. Il CONSTRUIT et il
 * REND : il ne signe aucune transaction utilisateur et n'en envoie aucune. La seule signature
 * qu'il obtient est celle d'un humain sur l'ecran de l'appareil, et elle n'engage qu'un
 * affichage et un consentement.
 *
 *   GET  /demo/etat      l'etat du fork, de Speculos, du snapshot
 *   POST /demo/preparer  credite, prend un snapshot, construit le calldata du swap d'origine
 *   POST /demo/approuver envoie l'EIP-712 a l'appareil et attend la decision de l'humain
 *   POST /demo/revenir   revient au snapshot pour rejouer a l'identique
 *   GET  /demo/soldes    les soldes lus sur le fork
 *
 * Tout ce qui echoue rend un etat NOMME et un `motif`. Jamais un zero a la place d'une
 * inconnue : c'est la regle dure du depot, et elle vaut ici aussi.
 */
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  ACTES,
  ACTES_DE_LA_DEMO,
  CORPUS,
  DIVERGENCES,
  EST_ACTE,
  distribution,
  USDC_BASE,
  type NomActe,
  type Porte,
} from "./corpus.js";
import {
  ErreurFork,
  erc20Balance,
  ethBalance,
  etatFork,
  blockNumber,
  revert,
  setBalance,
  snapshot,
  BLOC_EPINGLE,
  RPC_PUBLIC,
  RPC_SOUS_DOMAINE,
} from "./fork.js";
import { construireTransaction } from "./transaction.js";
import { construireMessage, messageDeActe } from "./message.js";
import {
  estRefus,
  joignable,
  ecran,
  signer,
  activerRawMessages,
  occupationAppareil,
  AppareilOccupe,
  AppareilIndisponible,
  SPECULOS_URL,
  CHEMIN_BIP32,
} from "./ledger.js";

const PORT = Number(process.env.DEMO_PORT ?? 8790);
const HOTE = process.env.DEMO_HOST ?? "127.0.0.1";
const ORIGINES = (process.env.DEMO_ORIGINS ?? "https://tare-hooks.tech,https://www.tare-hooks.tech")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** 10 ETH : de quoi payer le gaz et le swap de 1e12 wei, et rien de plus. */
const DOTATION_WEI = BigInt(process.env.DEMO_DOTATION_WEI ?? "10000000000000000000");

const ADRESSE = /^0x[0-9a-fA-F]{40}$/;

/**
 * LES SURFACES PUBLIQUES, ET CELLE QUI MARCHE AUJOURD'HUI.
 *
 * Chaque service de la demo est publie DEUX fois : sur son sous-domaine dedie, et sur un
 * chemin de https://tare-hooks.tech — le nom qui resout deja et dont le certificat est deja
 * emis. Les sous-domaines n'avaient aucun enregistrement DNS au moment ou la demo a ete
 * montee ; les chemins meme-origine ne dependent d'aucun DNS a poser, et ils ont en prime
 * l'avantage d'etre la MEME ORIGINE que la page, donc sans CORS du tout.
 */
const SURFACES = {
  pont: process.env.DEMO_PONT_PUBLIC ?? "https://tare-hooks.tech/pont",
  pont_sous_domaine: "https://demo.tare-hooks.tech",
  rpc: RPC_PUBLIC,
  rpc_sous_domaine: RPC_SOUS_DOMAINE,
  ecran: process.env.DEMO_ECRAN_PUBLIC ?? "https://tare-hooks.tech/ecran",
  ecran_sous_domaine: "https://speculos.tare-hooks.tech",
} as const;

/**
 * L'ETAT DE BASE DU FORK, ET POURQUOI IL N'Y EN A QU'UN.
 *
 * `/demo/preparer` reprenait un `evm_snapshot` A CHAQUE APPEL. Consequence mesuree : preparer
 * APRES avoir envoye une transaction epinglait l'etat d'APRES, et « rembobiner » ramenait au
 * bloc 50 614 001, puis 50 614 002 — le bandeau annoncait alors un bloc qui n'est pas celui du
 * corpus, et les chiffres montres n'etaient plus ceux qui ont ete mesures.
 *
 * Il n'y a donc plus qu'UN snapshot : celui du bloc epingle, pris une seule fois. Preparer n'y
 * touche pas. Rembobiner y retourne, toujours.
 *
 * DEUX SUBTILITES D'ANVIL, apprises en les heurtant :
 *  - `evm_revert` CONSOMME le snapshot rendu (et invalide tous ceux pris apres). On en reprend
 *    donc un immediatement, sinon le second rembobinage echouerait ;
 *  - `anvil_setBalance` ne mine pas de bloc. On peut donc re-crediter apres un retour sans
 *    faire avancer la chaine — et il FAUT le faire, sinon le retour a l'etat epingle reprendrait
 *    a l'utilisateur les 10 ETH qu'on vient de lui donner.
 */
let snapshotBase: string | null = null;
let blocDeBase: number | null = null;
let motifBase: string | null = null;
/** Les adresses creditees, re-creditees apres chaque retour pour que la demo se rejoue. */
const adressesCreditees = new Set<string>();

async function assurerBase(): Promise<void> {
  if (snapshotBase) return;
  const b = await blockNumber();
  snapshotBase = await snapshot();
  blocDeBase = b;
  motifBase =
    b === BLOC_EPINGLE
      ? null
      : `le fork etait au bloc ${b} et non ${BLOC_EPINGLE} au moment ou l'etat de base a ete pris : ` +
        `un rembobinage ramenera a ${b}. Redemarre tare-demo-anvil pour repartir du bloc du corpus.`;
  if (motifBase) console.log(`[demo-bridge] ATTENTION ${motifBase}`);
  else console.log(`[demo-bridge] etat de base pris au bloc ${b} (snapshot ${snapshotBase})`);
}

/** Le retour a l'etat de base. Rend le bloc atteint, qui doit etre celui du corpus. */
async function rembobiner(): Promise<{ block_number: number; snapshot: string }> {
  if (!snapshotBase) await assurerBase();
  const ok = await revert(snapshotBase!);
  if (!ok) {
    // le snapshot n'existe plus : anvil a redemarre, et son etat vit en RAM
    snapshotBase = null;
    await assurerBase();
    throw new ErreurFork(
      `snapshot_perdu: l'etat de base n'existe plus sur le fork (anvil a redemarre ?). ` +
        `Un nouvel etat de base vient d'etre pris au bloc ${blocDeBase}.`,
    );
  }
  // re-crediter AVANT de reprendre la base, pour que la base porte les fonds
  for (const a of adressesCreditees) await setBalance(a, DOTATION_WEI);
  snapshotBase = await snapshot();
  return { block_number: await blockNumber(), snapshot: snapshotBase };
}

const app = new Hono();

app.use("*", cors({ origin: ORIGINES, allowMethods: ["GET", "POST", "OPTIONS"], allowHeaders: ["content-type"] }));

function porteRendue(p: Porte) {
  return {
    pool_id: p.pool_id,
    hook: p.hook,
    bps: p.bps,
    taille_wei: p.taille_wei,
    sens: p.sens,
    // au-dela du contrat, ce qui rend le chiffre verifiable :
    etiquette: p.etiquette,
    motif: p.motif,
    monnaie_entree: p.monnaie_entree,
    monnaie_sortie: p.monnaie_sortie,
    pool_key: p.pool_key,
    block_number: p.block_number,
    chain_id: p.chain_id,
    rejeu: p.rejeu,
  };
}

async function soldesDe(adresse: string): Promise<{ eth_wei: string; usdc: string | null; motif?: string }> {
  const eth = await ethBalance(adresse);
  let usdc: bigint | null = null;
  let motif: string | undefined;
  try {
    usdc = await erc20Balance(USDC_BASE, adresse);
    if (usdc === null) motif = "usdc_illisible: le contrat n'a pas rendu un mot exploitable";
  } catch (e) {
    motif = `usdc_illisible: ${(e as Error).message.slice(0, 120)}`;
  }
  return { eth_wei: eth.toString(), usdc: usdc === null ? null : usdc.toString(), ...(motif ? { motif } : {}) };
}

/* -------------------------------------------------------------------- 1. etat */

app.get("/demo/etat", async (c) => {
  let fork: { chain_id: number; block_number: number; rpc: string } | null = null;
  let motif: string | null = null;
  try {
    fork = await etatFork();
  } catch (e) {
    motif = (e as Error).message;
  }
  const speculosOk = await joignable();
  return c.json({
    fork: fork
      ? { ...fork, rpc_sous_domaine: SURFACES.rpc_sous_domaine }
      : { chain_id: null, block_number: null, rpc: SURFACES.rpc, rpc_sous_domaine: SURFACES.rpc_sous_domaine, motif },
    speculos: {
      joignable: speculosOk,
      ecran: speculosOk ? await ecran() : null,
      chemin: CHEMIN_BIP32,
      api: SPECULOS_URL,
      ecran_public: SURFACES.ecran,
      ecran_sous_domaine: SURFACES.ecran_sous_domaine,
      /** non nul quand une demande occupe deja l'appareil : Speculos n'a qu'une session APDU */
      occupe: occupationAppareil(),
    },
    surfaces: SURFACES,
    snapshot: snapshotBase,
    /** l'etat de base : le bloc auquel /demo/revenir ramene, quoi qu'on ait fait avant */
    base: {
      snapshot: snapshotBase,
      block_number: blocDeBase,
      bloc_epingle: BLOC_EPINGLE,
      conforme: blocDeBase === BLOC_EPINGLE,
      motif: motifBase,
      adresses_creditees: [...adressesCreditees],
    },
    corpus: CORPUS,
    actes: Object.fromEntries(
      (Object.keys(ACTES) as NomActe[]).map((n) => [
        n,
        {
          porte: porteRendue(ACTES[n].porte),
          meilleure_porte: ACTES[n].meilleure_porte ? porteRendue(ACTES[n].meilleure_porte!) : null,
          economie_bps: ACTES[n].economie_bps,
          etat: ACTES[n].etat,
          verdict: ACTES[n].verdict,
          phrase: ACTES[n].phrase,
        },
      ]),
    ),
    /** Les actes que la demo joue, dans l'ordre. « queue » n'y est pas : elle se demande. */
    actes_de_la_demo: ACTES_DE_LA_DEMO,
    /**
     * LA FORME DU CORPUS. Elle est publiee pour qu'aucun chiffre montre ne puisse passer pour
     * le milieu alors qu'il est le bout de la queue — l'erreur que cette demo a failli faire
     * en s'ouvrant sur 9 999,53 bps. Tout y est CALCULE depuis la table, rien n'y est ecrit.
     */
    distribution: distribution(),
    divergences: DIVERGENCES,
  });
});

/* ---------------------------------------------------------------- 2. preparer */

app.post("/demo/preparer", async (c) => {
  let corps: { adresse?: unknown; acte?: unknown };
  try {
    corps = (await c.req.json()) as typeof corps;
  } catch {
    return c.json({ erreur: "corps_illisible", motif: "le corps n'est pas du JSON" }, 400);
  }
  const adresse = String(corps.adresse ?? "").toLowerCase();
  const acteNom = String(corps.acte ?? "");
  if (!ADRESSE.test(adresse)) {
    return c.json({ erreur: "adresse_invalide", motif: `« ${String(corps.adresse)} » n'est pas une adresse 0x + 40` }, 400);
  }
  if (!EST_ACTE(acteNom)) {
    return c.json(
      {
        erreur: "acte_inconnu",
        motif: `acte attendu : "stop", "substitution" ou "queue", recu « ${acteNom} »`,
        actes: Object.keys(ACTES),
      },
      400,
    );
  }
  const acte = ACTES[acteNom as NomActe];

  try {
    // L'etat de base est pris UNE fois, au bloc epingle. Preparer n'y touche pas : sinon
    // « rembobiner » ramenerait a l'etat d'apres l'envoi, et le bandeau afficherait un
    // bloc qui n'est pas celui du corpus.
    await assurerBase();
    adressesCreditees.add(adresse);
    await setBalance(adresse, DOTATION_WEI);
  } catch (e) {
    return c.json({ erreur: "fork_indisponible", motif: (e as Error).message }, 502);
  }

  const msg = messageDeActe(acteNom);
  const construite = await construireTransaction(acte.porte);
  const soldes = await soldesDe(adresse);

  // Pour l'acte "substitution", le calldata de la MEILLEURE porte est rendu aussi : c'est la
  // transaction de remplacement que l'utilisateur signera, ou pas. Elle n'est jamais envoyee.
  const remplacement = acte.meilleure_porte ? await construireTransaction(acte.meilleure_porte) : null;

  return c.json({
    snapshot: snapshotBase,
    /** l'etat de base : le bloc auquel /demo/revenir ramene, quoi qu'on ait fait avant */
    base: {
      snapshot: snapshotBase,
      block_number: blocDeBase,
      bloc_epingle: BLOC_EPINGLE,
      conforme: blocDeBase === BLOC_EPINGLE,
      motif: motifBase,
      adresses_creditees: [...adressesCreditees],
    },
    transaction: construite.transaction,
    porte: porteRendue(acte.porte),
    soldes: { eth_wei: soldes.eth_wei, usdc: soldes.usdc },
    // au-dela du contrat :
    acte: acteNom,
    verdict: acte.verdict,
    etat_transaction: construite.etat,
    motif: construite.motif,
    cotation: construite.cotation,
    plancher: construite.plancher,
    tolerance_bps: construite.tolerance_bps,
    echeance: construite.echeance,
    relecture: construite.relecture,
    meilleure_porte: acte.meilleure_porte ? porteRendue(acte.meilleure_porte) : null,
    economie_bps: acte.economie_bps,
    etat_alternative: acte.etat,
    phrase: acte.phrase,
    transaction_remplacement: remplacement?.transaction ?? null,
    // LE MESSAGE QUE L'APPAREIL AFFICHERA, rendu AVANT la signature. La page peut donc montrer
    // exactement les memes champs et la MEME empreinte que l'appareil — `promptDigest` est le
    // keccak256 de `texte_signe`, et les deux sont ici pour qu'on puisse le refaire a la main.
    message: msg.typed.message,
    texte_signe: msg.texte,
    prompt_digest: (msg.typed.message as Record<string, unknown>).promptDigest,
    corpus: CORPUS,
  });
});

/* --------------------------------------------------------------- 3. approuver */

app.post("/demo/approuver", async (c) => {
  let corps: Record<string, unknown> = {};
  try {
    corps = (await c.req.json()) as Record<string, unknown>;
  } catch {
    /* un corps vide est accepte : le message est alors construit depuis le corpus */
  }
  const defaut: NomActe = corps.acte === "substitution" ? "substitution" : "stop";
  let message;
  try {
    message = construireMessage(corps.verdict ?? corps.acte ?? null, defaut);
  } catch (e) {
    return c.json({ erreur: "verdict_illisible", motif: (e as Error).message }, 400);
  }

  if (!(await joignable())) {
    return c.json({ erreur: "speculos_injoignable", motif: `aucune reponse sur ${SPECULOS_URL}` }, 503);
  }

  try {
    const r = await signer(message.typed, { auto: corps.auto === true });
    if (estRefus(r)) {
      return c.json({ refus: 4001, raison: r.raison, ecrans: r.ecrans, source: message.source });
    }
    return c.json({
      signature: r.signature,
      v: r.v,
      r: r.r,
      s: r.s,
      ecrans: r.ecrans,
      source: message.source,
      primaryType: message.typed.primaryType,
      champs: Object.keys(message.typed.message),
      message: message.typed.message,
    });
  } catch (e) {
    // Deux demandes qui se chevauchent verraient leurs reponses APDU se croiser : on refuse
    // la seconde tout de suite, avec un nom, plutot que de rendre des octets qui n'en sont pas.
    if (e instanceof AppareilOccupe) {
      return c.json(
        {
          erreur: "appareil_occupe",
          motif: "The device is already handling another request. Nothing was signed and nothing was sent.",
          detail: e.message,
          occupe: occupationAppareil(),
        },
        409,
      );
    }
    // L'appareil n'a pas pu OUVRIR la demande (0x6a00, 0x6a80 non rattrapes). Ce n'est ni un
    // refus humain — on ne met donc pas de code numerique, que la page lirait comme un 4001 —
    // ni une panne du pont. On le dit en toutes lettres, et on redit que rien n'est parti.
    if (e instanceof AppareilIndisponible) {
      return c.json({ erreur: "appareil_indisponible", motif: e.message, rien_envoye: true }, 409);
    }
    return c.json({ erreur: "appareil", motif: (e as Error).message, rien_envoye: true }, 502);
  }
});

/* ----------------------------------------------------------------- 4. revenir */

app.post("/demo/revenir", async (c) => {
  try {
    const r = await rembobiner();
    const conforme = r.block_number === BLOC_EPINGLE;
    return c.json({
      ok: true,
      block_number: r.block_number,
      // au-dela du contrat : de quoi verifier d'un coup d'oeil que le bandeau ne ment pas
      snapshot: r.snapshot,
      bloc_epingle: BLOC_EPINGLE,
      conforme,
      motif: conforme ? null : motifBase,
      adresses_recreditees: [...adressesCreditees],
    });
  } catch (e) {
    const code = e instanceof ErreurFork ? 502 : 500;
    return c.json({ ok: false, motif: (e as Error).message }, code);
  }
});

/* ------------------------------------------------------------------ 5. soldes */

app.get("/demo/soldes", async (c) => {
  const adresse = String(c.req.query("adresse") ?? "").toLowerCase();
  if (!ADRESSE.test(adresse)) {
    return c.json({ erreur: "adresse_invalide", motif: "parametre ?adresse=0x… attendu" }, 400);
  }
  try {
    const s = await soldesDe(adresse);
    return c.json({ eth_wei: s.eth_wei, usdc: s.usdc, ...(s.motif ? { motif: s.motif } : {}), jeton_usdc: USDC_BASE });
  } catch (e) {
    return c.json({ erreur: "fork_indisponible", motif: (e as Error).message }, 502);
  }
});

/**
 * Rejouer « Raw messages » a la demande. Le reglage vit en RAM du conteneur Speculos : un
 * `docker restart` le remet a Disabled. Cette route le remet, sans toucher a l'appareil s'il
 * est en pleine signature (elle rend alors OCCUPE).
 */
app.post("/demo/speculos/raw", async (c) => {
  const r = await activerRawMessages();
  const ok = r.etat === "ACTIVE" || r.etat === "DEJA_ACTIVE";
  return c.json({ ok, etat: r.etat, ecrans: r.ecrans }, ok ? 200 : 503);
});

/**
 * LE MESSAGE SIGNABLE, SANS SIGNER.
 *
 * La page l'affiche champ par champ a cote de l'ecran de l'appareil. `prompt_digest` est le
 * keccak256 de `texte_signe` : les deux sont rendus pour que l'empreinte montree par la page
 * et celle affichee par l'appareil soient le MEME nombre, verifiable a la main.
 */
app.get("/demo/message", (c) => {
  const n = String(c.req.query("acte") ?? "stop");
  if (!EST_ACTE(n)) {
    return c.json({ erreur: "acte_inconnu", motif: `acte attendu : ${Object.keys(ACTES).join(", ")}` }, 400);
  }
  const m = messageDeActe(n);
  return c.json({
    acte: n,
    primaryType: m.typed.primaryType,
    domain: m.typed.domain,
    types: m.typed.types,
    message: m.typed.message,
    texte_signe: m.texte,
    prompt_digest: (m.typed.message as Record<string, unknown>).promptDigest,
  });
});

app.get("/demo/sante", (c) => c.json({ ok: true, service: "tare-demo-bridge", port: PORT }));

app.notFound((c) => c.json({ erreur: "route_inconnue", routes: ["/demo/etat", "/demo/preparer", "/demo/approuver", "/demo/revenir", "/demo/soldes"] }, 404));

serve({ fetch: app.fetch, hostname: HOTE, port: PORT }, (info) => {
  console.log(`[demo-bridge] http://${HOTE}:${info.port}`);
  console.log(`[demo-bridge] corpus bloc ${CORPUS.block_number}, ${CORPUS.n_measurements} mesures, chaine ${CORPUS.chain_id}`);
  for (const d of DIVERGENCES) {
    console.log(`[demo-bridge] DIVERGENCE ${d.acte}.${d.champ} : annonce=${d.annonce} corpus=${d.corpus} — ${d.consequence}`);
  }
  console.log(`[demo-bridge] origines CORS : ${ORIGINES.join(", ")}`);
  console.log(`[demo-bridge] RPC annonce a la page : ${SURFACES.rpc} (sous-domaine : ${SURFACES.rpc_sous_domaine})`);

  // L'ETAT DE BASE EST PRIS TOUT DE SUITE, pas au premier /demo/preparer. Si quelqu'un envoie
  // une transaction avant d'avoir prepare, la base serait sinon celle d'APRES l'envoi, et
  // « rembobiner » ne ramenerait jamais au bloc du corpus.
  void assurerBase().catch((e) =>
    console.log(`[demo-bridge] etat de base impossible a prendre : ${(e as Error).message}`),
  );

  // AU DEMARRAGE, ON REJOUE « Raw messages ». Le reglage vit en RAM du conteneur Speculos ;
  // sans lui l'appareil repond 0x6a80 au lieu d'afficher les champs. On ne bloque pas le
  // demarrage dessus — le service doit repondre meme si l'appareil est absent — et on ne
  // touche a rien si l'appareil est occupe.
  //
  // ET IL REESSAIE, parce que OCCUPE n'est pas une reponse definitive : l'appareil peut etre
  // en pleine signature au moment du redemarrage (constate — un test de la page tournait), et
  // abandonner la laisserait sans reglage pour la suite. Cinq essais espaces de 20 s, puis on
  // arrete : le rattrapage sur 0x6a80 et la veille docker restent derriere.
  if (process.env.DEMO_SANS_AMORCAGE !== "1") {
    const amorcer = async (essai: number): Promise<void> => {
      try {
        const r = await activerRawMessages();
        console.log(`[demo-bridge] amorcage « Raw messages » (essai ${essai}) : ${r.etat}`);
        if (r.etat === "ACTIVE" || r.etat === "DEJA_ACTIVE") return;
      } catch (e) {
        console.log(`[demo-bridge] amorcage « Raw messages » (essai ${essai}) impossible : ${(e as Error).message}`);
      }
      if (essai < 5) setTimeout(() => void amorcer(essai + 1), 20000);
      else console.log("[demo-bridge] amorcage abandonne — le rattrapage sur 0x6a80 prendra le relais");
    };
    setTimeout(() => void amorcer(1), 1500);
  }
});

export { app };
