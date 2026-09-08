/**
 * Marcher dans les ecrans de Speculos.
 *
 * Speculos expose l'ECRAN autant que l'APDU : GET /events rend le texte affiche, POST
 * /button/{left,right,both} appuie. C'est ce qui rend l'approbation testable — et c'est ce
 * qui a produit docs/ledger/ECRANS.md pour la garde EIP-712.
 *
 * Le flux de « Ledger Sync » sur Nano X, releve ecran par ecran :
 *
 *     « Connect to Ledger Sync? »   (titre)
 *     « Connect »                   <- appui DOUBLE ici
 *     « Don't connect »             (refus)
 *
 * L'ordre compte : un appui double sur le TITRE n'approuve pas, il annule le flux
 * (« stream has been aborted »). On navigue donc jusqu'a l'element voulu, et on ne
 * confirme que sur lui — jamais « au cas ou ».
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

/** Le flux d'approbation de Ledger Sync : on confirme sur « Connect », et sur rien d'autre. */
export const LEDGER_SYNC_CONNECT = /^Connect$/i;
