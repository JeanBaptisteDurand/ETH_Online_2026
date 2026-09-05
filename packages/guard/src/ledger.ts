/**
 * Le transport Ledger : signature CLAIRE, ou rien.
 *
 * approver.ts pose l'interface `LedgerTransport` et la refuse tant qu'elle est absente. Ce
 * fichier est l'implementation qui manquait : il ouvre un appareil par WebHID, instancie
 * @ledgerhq/hw-app-eth, et fait signer un message EIP-712.
 *
 * POURQUOI EIP-712 ET PAS UN BLOB. Un `signPersonalMessage` afficherait a l'humain une suite
 * d'octets, ou au mieux un pave de texte que l'appareil ne sait pas decouper. Un message typed
 * data affiche des CHAMPS : le hook, le pool, le prelevement en bps, l'etiquette, la taille, le
 * sens, le bloc de mesure. C'est le fond du rapport de garde, pas son empreinte. Le texte
 * complet de renderPrompt() n'est pas perdu pour autant : `promptDigest` en porte le keccak256,
 * donc la signature engage aussi la phrase et la commande de rejeu qui l'accompagne.
 *
 * CE QUE LA SIGNATURE PROUVE, ET RIEN DE PLUS : que cet appareil a affiche ces champs-la et
 * qu'un humain a appuye sur "approuver". Elle ne prouve pas que le nombre est juste, elle ne
 * prouve pas que la transaction a ete diffusee, elle ne prouve pas que le hook fait ce que la
 * mesure dit. C'est une attestation d'affichage et de consentement.
 *
 * PAS DE REPLI signEIP712HashedMessage. Un Nano S ne sait pas afficher un EIP-712 complet ;
 * hw-app-eth propose alors de signer deux hachages. Deux hachages sont exactement le blob que
 * ce fichier existe pour eviter. Sur un appareil qui ne sait pas afficher les champs, on
 * refuse — une garde qui echoue en "oui" ne garde rien, et une garde qui echoue en "signe ce
 * hachage" ne garde pas davantage.
 *
 * CE QUI N'A JAMAIS TOURNE : aucun appareil physique, aucun Speculos. Tout ce fichier est
 * verifie contre un faux appareil (test/ledger.test.ts). Voir docs/LIMITS.md section 11.
 */
import { ledgerApprover, renderPrompt, type Approver, type LedgerTransport } from "./approver.js";
import { keccak256, toHex, utf8 } from "./keccak.js";
import { ZERO_ADDRESS } from "./poolkey.js";
import type { Finding, GuardReport, SwapLeg } from "./types.js";

/* --------------------------------------------------------------- typed data */

export interface Eip712Field {
  name: string;
  type: string;
}

export interface Eip712TypedData {
  domain: { name: string; version: string; chainId: number };
  types: Record<string, Eip712Field[]>;
  primaryType: string;
  message: Record<string, unknown>;
}

/**
 * Le chemin de derivation par defaut, celui que tous les portefeuilles Ethereum montrent en
 * premier. Il est parametrable parce qu'un utilisateur qui signe depuis le compte n.3 n'a pas
 * a nous croire sur parole.
 */
export const LEDGER_DEFAULT_PATH = "44'/60'/0'/0/0";

/**
 * Le schema affiche par l'appareil.
 *
 * Chaque champ repond a une question qu'un humain se pose avant de signer, et aucun ne porte
 * un nombre que TARE n'a pas mesure : `take` dit "non mesure" quand l'etiquette ne peut pas
 * porter de nombre, jamais "0.00 bps".
 *
 * Le domaine ne declare PAS de verifyingContract : aucun contrat ne verifie cette signature.
 * En annoncer un serait suggerer une portee que l'attestation n'a pas.
 */
export const TARE_GUARD_TYPES: Record<string, Eip712Field[]> = {
  EIP712Domain: [
    { name: "name", type: "string" },
    { name: "version", type: "string" },
    { name: "chainId", type: "uint256" },
  ],
  TareGuardApproval: [
    { name: "verdict", type: "string" },
    { name: "summary", type: "string" },
    { name: "swaps", type: "TareSwap[]" },
    { name: "dataset", type: "string" },
    { name: "measuredAtBlock", type: "uint256" },
    { name: "freshness", type: "string" },
    { name: "warnings", type: "string" },
    { name: "promptDigest", type: "bytes32" },
  ],
  TareSwap: [
    { name: "hook", type: "address" },
    { name: "poolId", type: "bytes32" },
    { name: "take", type: "string" },
    { name: "label", type: "string" },
    { name: "size", type: "string" },
    { name: "direction", type: "string" },
  ],
};

export const TARE_GUARD_PRIMARY_TYPE = "TareGuardApproval";

/**
 * La taille du swap telle que le calldata la fixe — ou le fait qu'il ne la fixe pas.
 *
 * v4 lit un montant a zero comme OPEN_DELTA ("prends tout le solde ouvert"). Recopier ce zero
 * sur l'ecran d'un appareil ferait lire "ce swap ne porte rien", ce qui est faux et rassurant :
 * la pire combinaison. On ecrit l'absence.
 */
export function swapSizeField(leg: SwapLeg): string {
  if (leg.amountIn !== null) return `${leg.amountIn} en entree`;
  if (leg.amountOut !== null) return `${leg.amountOut} en sortie (exact-out)`;
  if (leg.amountIsOpenDelta) return "taille non fixee : OPEN_DELTA, tout le solde ouvert — pas zero";
  return "taille absente du calldata : non lue — pas zero";
}

/** Le prelevement, ou son absence. Une etiquette non numerique ne rend jamais un nombre. */
export function takeField(f: Finding): string {
  if (f.hook === ZERO_ADDRESS) return "aucun hook : rien a prelever";
  if (f.bps === null) return "non mesure — ce n'est pas zero";
  return `${f.bps.toFixed(2)} bps`;
}

/** L'etiquette, avec sa raison quand il y en a une. Jamais promue, jamais raccourcie en oui/non. */
export function labelField(f: Finding): string {
  const basis = f.basis === "interpolated" ? " interpole" : f.basis === "evidence" ? " (faisceau, pas ce point)" : "";
  return f.reason ? `${f.label}${basis} (${f.reason})` : `${f.label}${basis}`;
}

/** De combien la table est en retard sur la chaine — ou le fait qu'on ne le sait pas. */
export function freshnessField(report: GuardReport): string {
  const s = report.staleness;
  if (s.blocksBehind === null) {
    return `mesures au bloc ${s.tableBlock} ; bloc courant non fourni, retard inconnu`;
  }
  return `mesures au bloc ${s.tableBlock}, chaine au bloc ${s.atBlock} : ${s.blocksBehind} blocs de retard`;
}

/** Ce qui a produit les nombres, cite depuis la table elle-meme et non ecrit en dur. */
export function datasetField(report: GuardReport): string {
  const t = report.table;
  return (
    `${t.nMeasurements} mesures, ${t.nHooks} hooks, ${t.nPools} pools, chaine ${t.chainId}, ` +
    `moteur ${t.engineVer ?? "inconnu"}, stub ${t.stubHash ?? "inconnu"}`
  );
}

/** L'empreinte du texte integral montre a l'humain, commande de rejeu comprise. */
export function promptDigest(report: GuardReport): string {
  return toHex(keccak256(utf8(renderPrompt(report))));
}

export interface TypedDataOptions {
  /** le chainId du domaine ; par defaut celui de la table qui a produit les nombres */
  chainId?: number;
  domainName?: string;
  domainVersion?: string;
}

/**
 * Le rapport de garde, mis en champs signables.
 *
 * Fonction pure : elle ne parle a aucun appareil, ce qui la rend testable ligne a ligne. Elle
 * ne recopie que ce que le rapport contient — si le rapport ne sait pas, le champ le dit.
 */
export function buildGuardTypedData(report: GuardReport, opts: TypedDataOptions = {}): Eip712TypedData {
  const swaps = report.findings.map((f) => ({
    hook: f.hook,
    poolId: f.leg.poolId,
    take: takeField(f),
    label: labelField(f),
    size: swapSizeField(f.leg),
    direction: f.leg.direction,
  }));

  return {
    domain: {
      name: opts.domainName ?? "TARE Guard",
      version: opts.domainVersion ?? "1",
      chainId: opts.chainId ?? report.table.chainId,
    },
    types: TARE_GUARD_TYPES,
    primaryType: TARE_GUARD_PRIMARY_TYPE,
    message: {
      verdict: report.verdict.toUpperCase(),
      summary: report.headline,
      swaps,
      dataset: datasetField(report),
      measuredAtBlock: report.table.blockNumber,
      freshness: freshnessField(report),
      warnings: report.warnings.length > 0 ? report.warnings.join(" | ") : "aucun",
      promptDigest: promptDigest(report),
    },
  };
}

/* --------------------------------------------------------------- l'appareil */

export interface DeviceSignature {
  r: string;
  s: string;
  v: number;
}

/**
 * La part de @ledgerhq/hw-app-eth que ce fichier utilise, et rien de plus.
 *
 * On declare la forme au lieu d'importer la classe : le faux appareil des tests l'implemente
 * en six lignes, et le paquet reel n'est charge qu'au moment ou un appareil est reellement
 * ouvert (voir openWebHidDevice).
 */
export interface EthLike {
  signEIP712Message(path: string, message: Eip712TypedData, fullImplem?: boolean): Promise<DeviceSignature>;
}

export interface DeviceSession {
  eth: EthLike;
  close(): Promise<void>;
}

export type OpenDevice = () => Promise<DeviceSession>;

/** CONDITIONS_OF_USE_NOT_SATISFIED : le code que l'appareil rend quand l'humain refuse. */
export const LEDGER_STATUS_USER_REJECTED = 0x6985;

/**
 * Un refus n'est pas une panne, et il ne faut pas les confondre dans le journal : l'un dit
 * "l'humain a lu et a dit non", l'autre dit "on ne sait pas ce que l'humain a vu".
 */
export function isUserRejection(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const o = e as { statusCode?: unknown; statusText?: unknown };
  if (o.statusCode === LEDGER_STATUS_USER_REJECTED) return true;
  return o.statusText === "CONDITIONS_OF_USE_NOT_SATISFIED";
}

const HEX_WORD = /^[0-9a-fA-F]{1,64}$/;

/**
 * r || s || v, 65 octets, la concatenation habituelle.
 *
 * On recopie ce que l'appareil a rendu et on ne normalise pas v : decider si 0/1 ou 27/28 est
 * "le bon" v est une interpretation, et une interpretation silencieuse est exactement ce que
 * ce projet reproche aux autres. Ce qui n'est pas lisible leve, et un jet donne approved:false.
 */
export function encodeSignature(sig: DeviceSignature): string {
  const r = sig.r.startsWith("0x") ? sig.r.slice(2) : sig.r;
  const s = sig.s.startsWith("0x") ? sig.s.slice(2) : sig.s;
  if (!HEX_WORD.test(r) || !HEX_WORD.test(s)) {
    throw new Error(`signature_illisible: r/s hors format (r=${sig.r}, s=${sig.s})`);
  }
  if (!Number.isInteger(sig.v) || sig.v < 0 || sig.v > 255) {
    throw new Error(`signature_illisible: v=${String(sig.v)} ne tient pas sur un octet`);
  }
  return `0x${r.toLowerCase().padStart(64, "0")}${s.toLowerCase().padStart(64, "0")}${sig.v
    .toString(16)
    .padStart(2, "0")}`;
}

/**
 * L'ouverture reelle : WebHID, puis hw-app-eth.
 *
 * Les deux paquets sont charges par import() dynamique et pas en tete de fichier, pour deux
 * raisons mesurees :
 *  - leurs builds ESM (lib-es) utilisent des imports relatifs sans extension, que Node ne sait
 *    pas resoudre ; ils demandent un empaqueteur. Charger en tete casserait tout import de
 *    @tare/guard cote serveur, y compris la garde qui ne veut pas de Ledger ;
 *  - ils pesent ~800 Ko une fois empaquetes. Un utilisateur sans Ledger n'a pas a les
 *    telecharger.
 *
 * TransportWebHID.request() ouvre le selecteur d'appareil du navigateur : il doit etre appele
 * dans le fil d'un clic, sinon le navigateur le refuse.
 */
export const openWebHidDevice: OpenDevice = async () => {
  const nav = (globalThis as { navigator?: { hid?: unknown } }).navigator;
  if (!nav || !nav.hid) {
    throw new Error(
      "webhid_indisponible: navigator.hid absent (hors navigateur, Firefox, Safari, ou contexte non securise)",
    );
  }
  const { default: TransportWebHID } = await import("@ledgerhq/hw-transport-webhid");
  const { default: Eth } = await import("@ledgerhq/hw-app-eth");

  // openConnected() reutilise un appareil deja autorise et n'ouvre pas de fenetre ; request()
  // en ouvre une. On prefere la voie silencieuse, et on ne derange que s'il le faut.
  const transport = (await TransportWebHID.openConnected().catch(() => null)) ?? (await TransportWebHID.request());
  const eth = new Eth(transport) as unknown as EthLike;
  return {
    eth,
    close: () => transport.close(),
  };
};

export interface LedgerTransportOptions extends TypedDataOptions {
  /** le chemin de derivation ; defaut LEDGER_DEFAULT_PATH */
  path?: string;
  /** l'ouverture de l'appareil ; les tests en injectent une fausse */
  openDevice?: OpenDevice;
}

/** Fermer n'est pas signer : une fermeture ratee ne change pas la decision deja prise. */
async function closeQuietly(session: DeviceSession): Promise<void> {
  try {
    await session.close();
  } catch {
    /* ignore volontairement */
  }
}

/**
 * Le transport reel, branchable dans ledgerApprover().
 *
 * Sans rapport de garde il LEVE au lieu de signer : le texte seul ne se met pas en champs sans
 * l'inventer, et signer ce qu'on ne sait pas afficher est precisement ce qu'on refuse.
 */
export function ledgerWebHidTransport(opts: LedgerTransportOptions = {}): LedgerTransport {
  const path = opts.path ?? LEDGER_DEFAULT_PATH;
  const open = opts.openDevice ?? openWebHidDevice;

  return {
    async showAndConfirm(_text: string, report?: GuardReport) {
      if (!report) {
        throw new Error(
          "ledger_sans_rapport: aucun typed data a afficher — on ne signe pas un texte que l'appareil ne sait pas decouper",
        );
      }
      const typed = buildGuardTypedData(report, opts);
      const session = await open();
      try {
        const sig = await session.eth.signEIP712Message(path, typed);
        return { confirmed: true, attestation: encodeSignature(sig) };
      } catch (e) {
        if (isUserRejection(e)) return { confirmed: false };
        throw e;
      } finally {
        await closeQuietly(session);
      }
    },
  };
}

/**
 * Le raccourci : un Approver Ledger pret a poser dans installTareGuard({ approver }).
 *
 * Toutes les voies d'echec — pas de WebHID, appareil absent, application Ethereum fermee,
 * appareil trop ancien pour l'EIP-712 complet, refus de l'humain — passent par ledgerApprover
 * et rendent approved:false. Aucune ne rend approved:true par defaut.
 */
export function ledgerEip712Approver(opts: LedgerTransportOptions = {}): Approver {
  return ledgerApprover(ledgerWebHidTransport(opts));
}
