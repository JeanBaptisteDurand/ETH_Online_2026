/**
 * L'HISTORIQUE DU COMPTE, VU DEPUIS LE MCP.
 *
 * Le serveur MCP ne lisait aucune cle et ne laissait aucune trace : le compte du site
 * promettait « l'historique de tes analyses » et n'en voyait jamais une seule venir d'ici.
 *
 * TROIS REGLES, dans cet ordre de priorite :
 *
 * 1. SANS CLE, AUCUN APPEL. Le MCP repond depuis le corpus commite et depuis le fork local :
 *    il n'a besoin de personne. `TARE_CLE_API` absente n'est pas une degradation, c'est le
 *    mode normal. On ne tente meme pas la requete — un `fetch` vers un service absent ferait
 *    attendre l'agent pour rien.
 *
 * 2. LE DEPOT NE FAIT JAMAIS ATTENDRE UNE REPONSE. Il part apres, sans etre attendu. Un outil
 *    de mesure qui devient lent parce que l'historique est injoignable serait un mauvais
 *    echange : la mesure est le produit, l'historique est le confort.
 *
 * 3. IL NE LEVE JAMAIS. Une erreur ici est ecrite sur stderr — jamais sur stdout, qui porte
 *    le protocole MCP en JSON-RPC : une ligne de journal sur stdout casse la session entiere
 *    du client. C'est le genre de faute qui se voit comme « le MCP ne marche pas ».
 */
import type { Config } from "./config.js";

/** Les natures que l'API accepte. Recopiees ici : apps/mcp ne depend pas de apps/api. */
export type Nature = "analyse" | "verdict" | "substitution" | "mesure";

export interface Journal {
  /** Depose une ligne. Ne rend rien, n'attend rien, ne leve rien. */
  deposer(quoi: Nature, sujet: string | null, detail: Record<string, unknown>): void;
  /** Pour les tests et pour `tare_meta` : ou en est-on. */
  etat(): { actif: boolean; raison: string; api: string; deposes: number; echecs: number };
}

export interface OptionsJournal {
  fetchImpl?: typeof fetch;
  /** en ms ; court, parce que rien ne l'attend */
  timeoutMs?: number;
}

export function creerJournal(cfg: Config, opts: OptionsJournal = {}): Journal {
  const doFetch = opts.fetchImpl ?? fetch;
  const timeout = opts.timeoutMs ?? 5000;
  let deposes = 0;
  let echecs = 0;
  /** On ne repete pas le meme avertissement a chaque appel : une fois suffit a informer. */
  let dejaDit: string | null = null;

  const dire = (m: string): void => {
    if (dejaDit === m) return;
    dejaDit = m;
    // stderr, JAMAIS stdout : stdout porte le JSON-RPC du protocole MCP.
    process.stderr.write(`[tare-mcp] ${m}\n`);
  };

  return {
    deposer(quoi, sujet, detail) {
      if (!cfg.cleApi) return;
      void (async () => {
        try {
          const res = await doFetch(`${cfg.apiUrl}/compte/journal`, {
            method: "POST",
            headers: { "content-type": "application/json", "x-tare-cle": cfg.cleApi! },
            body: JSON.stringify({ source: "mcp", quoi, sujet, detail }),
            signal: AbortSignal.timeout(timeout),
          });
          if (res.ok) {
            deposes += 1;
            return;
          }
          echecs += 1;
          if (res.status === 401)
            dire(
              "cle refusee : inconnue, revoquee, ou de portee 'extension' au lieu de 'mcp'. " +
                "Les outils continuent de repondre — l'historique, non.",
            );
          else if (res.status === 402)
            dire(
              "abonnement inactif : l'historique est ferme. Les mesures ne dependent d'aucun " +
                "service et continuent.",
            );
          else dire(`historique : HTTP ${res.status}`);
        } catch (e) {
          echecs += 1;
          dire(`historique injoignable : ${(e as Error).message.slice(0, 100)}`);
        }
      })();
    },
    etat() {
      return {
        actif: Boolean(cfg.cleApi),
        raison: cfg.cleApi
          ? "une cle est configuree : chaque appel d'outil est depose dans l'historique du compte"
          : "TARE_CLE_API absente : rien n'est envoye, et rien n'en depend. Les outils lisent le " +
            "corpus commite et le fork local.",
        api: cfg.apiUrl,
        deposes,
        echecs,
      };
    },
  };
}
