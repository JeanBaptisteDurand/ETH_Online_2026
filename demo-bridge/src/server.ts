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
 *   POST /demo/choisir   pose les trois choix SUR L'APPAREIL, et rend la main tout de suite
 *   GET  /demo/choix     quelle question l'appareil affiche, et ce que l'humain a decide
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
  ADRESSE_NULLE,
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
  crediterErc20,
  figerHorloge,
  gazPour,
  noncesAReporter,
  nonceDe,
  setNonce,
  viderLaFile,
  emplacementDuSolde,
  BLOC_EPINGLE,
  USDC_EMPLACEMENT_SOLDES,
  RPC_PUBLIC,
  RPC_SOUS_DOMAINE,
} from "./fork.js";
import { construireTransaction } from "./transaction.js";
import { poolId } from "../vendor/guard/src/poolkey.js";

/**
 * LA PORTE DE REMPLACEMENT EXECUTEE EN DIRECT, 16 septembre 2026.
 *
 * La porte que le corpus donne comme la moins chere (0x0640…, hook 0xd8a63c16…) est un pool a FRAIS
 * DYNAMIQUES. Elle prenait zero le 29 aout, au bloc du corpus. Mesure faite sur le vrai Base ce
 * matin : elle ne cote plus, et le swap n'y passe qu'avec un plancher a zero — elle rend moins de
 * 1 000 unites la ou la route actuelle en rend 2 398. Sur la chaine reelle, la prendre ferait perdre
 * la moitie du swap.
 *
 * Pour la demo en direct, la transaction de remplacement vise donc le pool v4 ETH/USDC SANS HOOK a
 * 0,01 % : cote aujourd'hui, il rend au moins 2 400 unites pour 115 750 de gaz (verifie par eth_call
 * depuis l'adresse du presentateur). L'ECRAN, LUI, CONTINUE D'AFFICHER LA PORTE DU CORPUS : c'est un
 * choix assume du proprietaire, pris a une heure de la finale. `DEMO_REMPLACEMENT=corpus` revient a
 * la porte mesuree en une variable d'environnement.
 */
const REMPLACEMENT_SANS_HOOK = (process.env.DEMO_REMPLACEMENT ?? "sans_hook").toLowerCase() !== "corpus";
const FRAIS_SANS_HOOK = Number(process.env.DEMO_REMPLACEMENT_FEE ?? 100);
const PAS_SANS_HOOK = Number(process.env.DEMO_REMPLACEMENT_TICK ?? 1);

/** La porte dont la transaction de remplacement est construite : celle du corpus, ou le pool sans hook. */
function porteExecutee(porte: Porte): Porte {
  if (!REMPLACEMENT_SANS_HOOK) return porte;
  const cle = { ...porte.pool_key, fee: FRAIS_SANS_HOOK, tickSpacing: PAS_SANS_HOOK, hooks: ADRESSE_NULLE };
  return { ...porte, pool_key: cle, pool_id: poolId(cle), hook: ADRESSE_NULLE };
}
import { construireMessage, messageDeActe } from "./message.js";
import { abandonnerChoix, demarrerChoix, lireChoix } from "./choix.js";
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

/**
 * LA DOTATION. 100 ETH et 10 000 USDC — de quoi repeter la demo autant de fois qu'il faut sans
 * jamais se demander si le portefeuille a de quoi payer le gaz.
 *
 * Elle est publiee dans /demo/etat avec ce qui a REELLEMENT ete lu apres ecriture : une
 * dotation annoncee et absente ferait echouer la repetition sans prevenir.
 */
const DOTATION_WEI = BigInt(process.env.DEMO_DOTATION_WEI ?? "100000000000000000000");
/** 10 000 USDC (6 decimales). Mettre DEMO_DOTATION_USDC=0 pour partir d'un solde nul. */
const DOTATION_USDC = BigInt(process.env.DEMO_DOTATION_USDC ?? "10000000000");

/**
 * LES PORTEFEUILLES DE DEMONSTRATION.
 *
 * Ceux avec lesquels on REPETE. Sans eux, un rembobinage ramenait le portefeuille du
 * presentateur a ses VRAIS soldes de Base — 0,248 ETH et 0 USDC — et la demo devenait
 * injouable au deuxieme tour, en silence. Ils sont donc redotes au demarrage, apres CHAQUE
 * rembobinage, et a chaque /demo/preparer.
 *
 * La liste est une variable d'environnement et non une adresse en dur : un autre presentateur,
 * un autre portefeuille, une seule ligne a changer.
 *   DEMO_PORTEFEUILLES=0x…,0x…
 */
/** Au-dela, on oublie la plus ancienne adresse ad hoc — jamais un portefeuille configure. */
const MAX_ADRESSES_CREDITEES = Number(process.env.DEMO_MAX_ADRESSES ?? 16);

const PORTEFEUILLES_DEMO = (
  process.env.DEMO_PORTEFEUILLES ?? "0x7d85bF7a82470837A1d832e4fa503a7ebF20ca97"
)
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter((x) => /^0x[0-9a-f]{40}$/.test(x));

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
/** L'horloge du fork est-elle figee sur l'horodatage du bloc epingle ? Publie par /demo/etat. */
let horlogeFigee: { fige: boolean; motif: string | null } = { fige: false, motif: "non tentee" };
/** Les adresses creditees, re-creditees apres chaque retour pour que la demo se rejoue. */
const adressesCreditees = new Set<string>(PORTEFEUILLES_DEMO);

/** Ce qu'on a ecrit, et ce qu'on a RELU juste apres. Publie tel quel par /demo/etat. */
export interface Dotation {
  adresse: string;
  eth_wei: string | null;
  usdc: string | null;
  /** true seulement si les deux soldes relus valent la dotation voulue */
  conforme: boolean;
  motif: string | null;
}

/**
 * Credite une adresse en ETH ET en USDC, puis RELIT les deux.
 *
 * L'ETH passe par `anvil_setBalance`. L'USDC n'a pas d'equivalent : on ecrit dans le stockage
 * du contrat, a l'emplacement du mapping des soldes, et on relit par `balanceOf` — voir
 * fork.ts. Aucune des deux operations ne mine de bloc : la chaine ne bouge pas.
 */
async function dotter(adresse: string): Promise<Dotation> {
  const a = adresse.toLowerCase();
  const motifs: string[] = [];
  let eth: bigint | null = null;
  try {
    await setBalance(a, DOTATION_WEI);
    eth = await ethBalance(a);
    if (eth !== DOTATION_WEI) motifs.push(`eth_relu_${eth}_au_lieu_de_${DOTATION_WEI}`);
  } catch (e) {
    motifs.push(`eth: ${(e as Error).message.slice(0, 100)}`);
  }
  // ZERO EST UNE VALEUR, PAS UNE ABSENCE. `DEMO_DOTATION_USDC=0` veut dire « pars d'un solde
  // nul » — pour que l'arrivee du swap se lise 0 -> 0,002444 au lieu de 10000,000000 ->
  // 10000,002444. Se contenter alors de LIRE laissait en place les 10 000 USDC qu'une
  // execution precedente avait ecrits dans l'etat de base, et la consigne n'avait aucun effet
  // visible. On ECRIT donc toujours, zero compris, et on relit.
  const r = await crediterErc20(USDC_BASE, a, DOTATION_USDC);
  const usdc: bigint | null = r.lu;
  if (!r.ok && r.motif) motifs.push(r.motif);
  return {
    adresse: a,
    eth_wei: eth === null ? null : eth.toString(),
    usdc: usdc === null ? null : usdc.toString(),
    conforme: motifs.length === 0,
    motif: motifs.length ? motifs.join(" | ") : null,
  };
}

/** Redote TOUTES les adresses connues. Ne mine aucun bloc. */
async function dotterTout(): Promise<Dotation[]> {
  const out: Dotation[] = [];
  for (const a of adressesCreditees) out.push(await dotter(a));
  return out;
}

/** La derniere dotation appliquee, telle qu'elle a ete RELUE. Publiee par /demo/etat. */
let derniereDotation: Dotation[] = [];

/**
 * CE QUE LE SERVICE A CREDITE, ET CE QU'IL A RELU JUSTE APRES.
 *
 * Rendu par /demo/etat, /demo/preparer et /demo/revenir, pour qu'on n'ait rien a deviner
 * avant une repetition : `tous_conformes: false` dit exactement ce qui manque, et `dernier`
 * porte les soldes RELUS — pas ceux qu'on a voulu ecrire.
 */
function blocDotation() {
  return {
    eth_wei: DOTATION_WEI.toString(),
    usdc: DOTATION_USDC.toString(),
    jeton_usdc: USDC_BASE,
    emplacement_mapping_usdc: USDC_EMPLACEMENT_SOLDES,
    portefeuilles_demo: PORTEFEUILLES_DEMO,
    dernier: derniereDotation,
    tous_conformes: derniereDotation.length > 0 && derniereDotation.every((d) => d.conforme),
  };
}

async function assurerBase(): Promise<void> {
  if (snapshotBase) return;
  // L'HORLOGE AVANT TOUT LE RESTE. Un fork epingle au bloc 50 614 000 dont le temps avance
  // n'execute plus le swap dans le contexte ou le corpus l'a mesure — voir figerHorloge().
  horlogeFigee = await figerHorloge();
  const b = await blockNumber();
  // LES FONDS AVANT LA BASE. Si l'etat de base ne portait pas la dotation, le premier
  // rembobinage la reprendrait, et le portefeuille du presentateur retomberait a ses vrais
  // soldes de Base — 0,248 ETH — au beau milieu de la repetition.
  derniereDotation = await dotterTout();
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
/** Les nonces reportes au dernier rembobinage : de quoi verifier que MetaMask et le fork sont d'accord. */
let derniersNoncesReportes: Array<{ adresse: string; nonce: string }> = [];

async function rembobiner(): Promise<{ block_number: number; snapshot: string }> {
  if (!snapshotBase) await assurerBase();
  // LES NONCES D'AVANT, lus AVANT le retour en arriere (voir noncesAReporter dans fork.ts).
  const suivis = [...new Set([...adressesCreditees, ...PORTEFEUILLES_DEMO])];
  const avant = new Map<string, bigint>();
  for (const a of suivis) {
    try {
      avant.set(a, await nonceDe(a));
    } catch {
      /* un compte illisible garde le nonce que le fork lui rend */
    }
  }
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
  // La file d'abord : une transaction restee « queued » partirait sinon des que son nonce redevient
  // valide. Puis les nonces : chaque compte retrouve celui d'avant le retour en arriere.
  await viderLaFile();
  const apres = new Map<string, bigint>();
  for (const a of avant.keys()) {
    try {
      apres.set(a, await nonceDe(a));
    } catch {
      /* idem */
    }
  }
  derniersNoncesReportes = [];
  for (const [a, n] of noncesAReporter(avant, apres)) {
    await setNonce(a, n);
    derniersNoncesReportes.push({ adresse: a, nonce: n.toString() });
  }
  // On refige l'horloge a chaque retour : le reglage survit a evm_revert (verifie), mais il
  // ne coute rien de le redire, et un fork redemarre entre-temps le perdrait en silence.
  horlogeFigee = await figerHorloge();
  // re-crediter AVANT de reprendre la base, pour que la base porte les fonds. En ETH ET en
  // USDC : le retour a l'etat epingle rendrait sinon au portefeuille ses vrais soldes de Base.
  derniereDotation = await dotterTout();
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
      /** la conversation des trois choix : la question affichee, et ce qui a ete decide */
      choix: lireChoix(),
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
      /**
       * L'horloge du fork, figee sur l'horodatage du bloc epingle. Sans ca, le bloc qui
       * execute le swap n'est plus dans le contexte temporel de la mesure, et le hook de la
       * porte de remplacement rend 2444 USDC ou zero selon l'heure — voir figerHorloge().
       */
      horloge_figee: horlogeFigee.fige,
      horloge_motif: horlogeFigee.motif,
    },
    dotation: blocDotation(),
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
    // La liste est BORNEE. Chaque rembobinage redote toutes les adresses connues ; sans borne,
    // une page qui prepare en boucle avec des adresses differentes ferait grossir ce travail
    // sans fin, et le rembobinage — le geste qu'on repete devant un jury — ralentirait a vue
    // d'oeil. Les portefeuilles de demonstration configures ne sont jamais oublies.
    if (adressesCreditees.size >= MAX_ADRESSES_CREDITEES) {
      for (const a of adressesCreditees) {
        if (PORTEFEUILLES_DEMO.includes(a)) continue;
        adressesCreditees.delete(a);
        if (adressesCreditees.size < MAX_ADRESSES_CREDITEES) break;
      }
    }
    adressesCreditees.add(adresse);
    // l'adresse demandee ET les portefeuilles de demonstration, en ETH et en USDC
    derniereDotation = await dotterTout();
  } catch (e) {
    return c.json({ erreur: "fork_indisponible", motif: (e as Error).message }, 502);
  }

  const msg = messageDeActe(acteNom);
  const construite = await construireTransaction(acte.porte);
  const soldes = await soldesDe(adresse);

  // Pour l'acte "substitution", le calldata de la MEILLEURE porte est rendu aussi : c'est la
  // transaction de remplacement que l'utilisateur signera, ou pas. Elle n'est jamais envoyee.
  const remplacement = acte.meilleure_porte ? await construireTransaction(porteExecutee(acte.meilleure_porte)) : null;

  // LE GAZ, estime sur le bloc qui sera mine : sans lui MetaMask estime sur le bloc epingle, et la
  // porte de remplacement revert faute de gaz (voir gazPour dans fork.ts).
  const gazOrigine = construite.transaction ? await gazPour({ from: adresse, ...construite.transaction }) : null;
  if (construite.transaction && gazOrigine) construite.transaction.gas = gazOrigine.gas;
  const gazRemplacement = remplacement?.transaction
    ? await gazPour({ from: adresse, ...remplacement.transaction })
    : null;
  if (remplacement?.transaction && gazRemplacement) remplacement.transaction.gas = gazRemplacement.gas;

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
      /**
       * L'horloge du fork, figee sur l'horodatage du bloc epingle. Sans ca, le bloc qui
       * execute le swap n'est plus dans le contexte temporel de la mesure, et le hook de la
       * porte de remplacement rend 2444 USDC ou zero selon l'heure — voir figerHorloge().
       */
      horloge_figee: horlogeFigee.fige,
      horloge_motif: horlogeFigee.motif,
    },
    dotation: blocDotation(),
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
    echeance_iso: construite.echeance_iso,
    horodatage_chaine: construite.horodatage_chaine,
    marge_secondes: construite.marge_secondes,
    relecture: construite.relecture,
    meilleure_porte: acte.meilleure_porte ? porteRendue(acte.meilleure_porte) : null,
    economie_bps: acte.economie_bps,
    etat_alternative: acte.etat,
    phrase: acte.phrase,
    transaction_remplacement: remplacement?.transaction ?? null,
    /**
     * LE POOL REELLEMENT VISE par la transaction de remplacement, relu dans son calldata. La page
     * s'en sert pour reconnaitre le plan deja approuve sur l'appareil ; sans lui, la garde reposerait
     * la question une seconde fois quand ce pool n'est pas celui du corpus (voir porteExecutee).
     */
    pool_id_remplacement: remplacement?.relecture?.pool_id ?? null,
    remplacement_sans_hook: REMPLACEMENT_SANS_HOOK,
    /** la limite de gaz de chaque transaction, et l'estimation dont elle vient */
    gaz: { origine: gazOrigine, remplacement: gazRemplacement },
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

/* ------------------------------------------------------ 3 bis. les trois choix */

/**
 * LES TROIS CHOIX, SUR L'APPAREIL.
 *
 * Rend la main TOUT DE SUITE (202) : deux questions lues par un humain peuvent durer plusieurs
 * minutes, et une requete aussi longue se ferait couper par un proxy. La page suit ensuite
 * GET /demo/choix. Voir src/choix.ts.
 *
 * `auto` ("actuelle" | "optimisee" | "annuler") ne sert qu'a la verification hors public.
 */
app.post("/demo/choisir", async (c) => {
  let corps: Record<string, unknown> = {};
  try {
    corps = (await c.req.json()) as Record<string, unknown>;
  } catch {
    /* un corps vide vaut l'acte de substitution */
  }
  const nom = String(corps.acte ?? "substitution");
  if (!EST_ACTE(nom)) {
    return c.json({ erreur: "acte_inconnu", motif: `acte attendu : ${Object.keys(ACTES).join(", ")}` }, 400);
  }
  const auto =
    corps.auto === "actuelle" || corps.auto === "optimisee" || corps.auto === "annuler" ? corps.auto : undefined;

  if (!(await joignable())) {
    return c.json({ erreur: "speculos_injoignable", motif: `The device does not answer (${SPECULOS_URL}). Nothing was sent.` }, 503);
  }
  try {
    const d = demarrerChoix(nom as NomActe, { auto });
    return c.json({ ok: true, id: d.id, options: d.options }, 202);
  } catch (e) {
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
    return c.json({ erreur: "choix_impossible", motif: (e as Error).message, rien_envoye: true }, 500);
  }
});

app.get("/demo/choix", (c) => c.json(lireChoix()));

/** La page reprend la main : la question ouverte est refusee sur l'appareil, et c'est tout. */
app.post("/demo/choix/abandonner", (c) => c.json({ ok: true, abandonne: abandonnerChoix() }));

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
      /** les comptes dont le nonce a ete remis a sa valeur d'avant le retour (voir fork.ts) */
      nonces_reportes: derniersNoncesReportes,
      dotation: blocDotation(),
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

app.notFound((c) => c.json({ erreur: "route_inconnue", routes: ["/demo/etat", "/demo/preparer", "/demo/approuver", "/demo/choisir", "/demo/choix", "/demo/revenir", "/demo/soldes"] }, 404));

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
  void assurerBase()
    .then(() => {
      for (const d of derniereDotation) {
        console.log(
          `[demo-bridge] dotation ${d.adresse} : ${d.eth_wei} wei, ${d.usdc} USDC` +
            (d.conforme ? "" : ` — NON CONFORME : ${d.motif}`),
        );
      }
    })
    .catch((e) => console.log(`[demo-bridge] etat de base impossible a prendre : ${(e as Error).message}`));

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
