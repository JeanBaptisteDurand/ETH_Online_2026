/**
 * Marcher dans les ecrans de Speculos.
 *
 * Speculos expose l'ECRAN autant que l'APDU : GET /events rend le texte affiche, POST
 * /button/{left,right,both} appuie. C'est ce qui rend l'approbation testable — et c'est ce
 * qui a produit docs/ledger/ECRANS.md pour la garde EIP-712.
 *
 * Le flux de « Ledger Sync » sur Nano X, releve ecran par ecran. Il y a DEUX approbations,
 * pas une, et la seconde ne ressemble pas a la premiere :
 *
 *     1. « Connect to Ledger Sync? »                    (titre)
 *        « Connect »                                    <- appui DOUBLE
 *        « Don't connect »                              (refus)
 *
 *     2. « Connection requested »
 *        « Turn on sync for Ledger Wallet? »            (titre)
 *        « Ledger Wallet will be able to view and update your synced accounts. »
 *        « Turn On sync »                               <- appui DOUBLE
 *        « Don't sync »                                 (refus)
 *
 * Deux regles, apprises en les cassant :
 *
 *   - Un appui double sur le TITRE n'approuve pas, il annule le flux
 *     (« stream has been aborted »). On navigue jusqu'a l'element, et on ne confirme
 *     que sur lui.
 *   - Un libelle inconnu ne se confirme JAMAIS « au cas ou ». La premiere version de ce
 *     marcheur ignorait « Turn On sync », passait dessus, tombait sur « Don't sync » et
 *     refusait la synchronisation en croyant l'accepter. Une garde qui confirme ce
 *     qu'elle n'a pas reconnu ne garde rien.
 */
export interface SpeculosScreen {
  read(): Promise<string>;
  press(button: "left" | "right" | "both"): Promise<void>;
}

export function speculosScreen(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): SpeculosScreen {
  return {
    async read() {
      const res = await fetchImpl(`${apiUrl}/events?currentscreenonly=true`);
      if (!res.ok) throw new Error(`Speculos /events: HTTP ${res.status}`);
      const body = (await res.json()) as { events?: Array<{ text?: string }> };
      return (body.events ?? []).map((e) => e.text ?? "").join(" ").trim();
    },
    async press(button) {
      const res = await fetchImpl(`${apiUrl}/button/${button}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "press-and-release" }),
      });
      if (!res.ok) throw new Error(`Speculos /button/${button}: HTTP ${res.status}`);
    },
  };
}

export interface WalkResult {
  /** chaque ecran distinct traverse, dans l'ordre : la trace de ce que l'appareil a AFFICHE */
  screens: string[];
  /** true seulement si l'element cible a ete atteint et confirme */
  confirmed: boolean;
}

/**
 * Navigue a droite jusqu'a l'element dont le texte satisfait `target`, puis confirme.
 *
 * Rend `confirmed: false` s'il n'est jamais apparu — au lieu de confirmer autre chose.
 * `settled()` permet de sortir des que l'APDU a repondu, pour ne pas continuer a appuyer
 * dans une application qui a fini.
 */
export async function walkAndConfirm(
  screen: SpeculosScreen,
  target: RegExp,
  opts: { steps?: number; delayMs?: number; settled?: () => boolean } = {},
): Promise<WalkResult> {
  const steps = opts.steps ?? 30;
  const delayMs = opts.delayMs ?? 250;
  const screens: string[] = [];
  let confirmed = false;

  for (let i = 0; i < steps; i++) {
    if (opts.settled?.()) break;
    await new Promise((r) => setTimeout(r, delayMs));
    const s = await screen.read();
    if (s && s !== screens[screens.length - 1]) screens.push(s);
    if (target.test(s)) {
      await screen.press("both");
      confirmed = true;
      break;
    }
    await screen.press("right");
  }
  return { screens, confirmed };
}

/** Le premier ecran d'action de Ledger Sync. On confirme sur lui, et sur rien d'autre. */
export const LEDGER_SYNC_CONNECT = /^Connect$/i;

/**
 * Les libelles d'ACTION de Ledger Sync, ceux qui valent une confirmation. La liste est
 * fermee volontairement : tout ce qui n'y est pas se navigue, jamais se confirme.
 */
export const LEDGER_SYNC_CONFIRM =
  /^(Connect|Log ?in|Approve|Confirm|Turn On sync|Add member|Continue)$/i;

/**
 * Les libelles de REFUS. Confirmer l'un d'eux annule le flux — c'est le bug qu'on a
 * commis. On les reconnait pour revenir en arriere, pas pour appuyer.
 */
export const LEDGER_SYNC_REFUSE = /^(Don'?t |Reject|Cancel|Quit)/i;

/**
 * Traverse un flux a PLUSIEURS approbations : navigue, confirme sur les libelles
 * d'action, revient en arriere sur un refus, et s'arrete des que l'APDU a repondu.
 *
 * Rend la trace de tous les ecrans affiches — c'est elle qui fait preuve, pas le
 * resultat : une signature dont on ne sait pas ce qui a ete montre ne prouve rien.
 */
export async function autoApprove(
  screen: SpeculosScreen,
  opts: {
    confirm?: RegExp;
    refuse?: RegExp;
    steps?: number;
    delayMs?: number;
    settled?: () => boolean;
  } = {},
): Promise<WalkResult> {
  const confirm = opts.confirm ?? LEDGER_SYNC_CONFIRM;
  const refuse = opts.refuse ?? LEDGER_SYNC_REFUSE;
  const steps = opts.steps ?? 200;
  const delayMs = opts.delayMs ?? 200;
  const screens: string[] = [];
  let confirmed = false;
  let last = "";

  for (let i = 0; i < steps; i++) {
    if (opts.settled?.()) break;
    await new Promise((r) => setTimeout(r, delayMs));
    let s = "";
    try {
      s = await screen.read();
    } catch {
      // Speculos qui disparait pendant la marche n'est pas une approbation : on sort.
      break;
    }
    if (!s) continue;
    if (s !== last) {
      screens.push(s);
      last = s;
    }
    if (confirm.test(s)) {
      await screen.press("both");
      confirmed = true;
      last = "";
      await new Promise((r) => setTimeout(r, delayMs));
    } else if (refuse.test(s)) {
      await screen.press("left"); // revenir sur l'action, ne jamais confirmer un refus
      last = "";
    } else if (!/app is ready/i.test(s)) {
      await screen.press("right");
    }
  }
  return { screens, confirmed };
}
