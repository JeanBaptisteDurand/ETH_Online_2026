/**
 * SERVICE WORKER — la table, la cle, le reseau. Les trois choses qu'un script de contenu ne
 * doit pas porter.
 *
 * LA TABLE EST CHARGEE PARESSEUSEMENT, une seule fois par vie du worker, par `fetch` sur une
 * ressource du paquet. Elle pese 21 Mo. C'est la raison d'etre de toute cette architecture :
 * embarquee dans le script de contenu, elle coutait 21,9 Mo de source JS a parser sur CHAQUE
 * page visitee, a document_start. Ici, elle est parsee au premier swap intercepte, et le
 * worker s'endort quand il n'y a rien a faire.
 *
 * LA CLE D'API EST FACULTATIVE, et c'est un choix de produit : l'extension ANALYSE hors
 * ligne, avec la table du paquet, sans compte et sans abonnement. La cle ne sert qu'a une
 * chose — deposer l'action dans l'historique du compte. Sans elle, tout marche sauf
 * l'historique, et le worker ne tente aucun appel.
 *
 * RIEN DE CE QUE LE JOURNAL FAIT NE PEUT RETARDER UN VERDICT. La reponse part d'abord ; le
 * depot est lance apres, sans etre attendu, et son echec est ecrit en console.
 */
import { assertTable, type GuardTable } from "../src/table.js";
import { tareGuard } from "../src/guard-sans-table.js";
import {
  API_DEFAUT,
  CLES_STOCKAGE,
  MARQUE,
  estDeNous,
  type DemandeConsultation,
  type DemandeJournal,
} from "./protocole.js";

/** Le nom de la ressource du paquet. Voir web_accessible_resources du manifeste. */
const RESSOURCE_TABLE = "table.json";

let table: GuardTable | null = null;
let chargement: Promise<GuardTable> | null = null;

/**
 * Charge la table UNE fois. Les appels concurrents partagent la meme promesse : deux swaps
 * simultanes ne doivent pas parser 21 Mo deux fois.
 */
function charger(): Promise<GuardTable> {
  if (table) return Promise.resolve(table);
  if (chargement) return chargement;
  chargement = (async () => {
    const t0 = Date.now();
    const res = await fetch(chrome.runtime.getURL(RESSOURCE_TABLE));
    if (!res.ok)
      throw new Error(
        `${RESSOURCE_TABLE} absente du paquet (HTTP ${res.status}). Lance ` +
          "`npm run build:table` puis `npm run build:extension` avant d'empaqueter.",
      );
    const t = assertTable(await res.json());
    table = t;
    console.info(
      `[TARE Guard] table chargee : ${t.n_measurements} mesures, bloc ${t.block_number}, ` +
        `${Date.now() - t0} ms`,
    );
    return t;
  })();
  chargement = chargement.catch((e) => {
    // Un echec ne doit pas etre memorise pour toujours : la tentative suivante reessaie.
    chargement = null;
    throw e;
  });
  return chargement;
}

interface Reglages {
  cleApi: string | null;
  api: string;
  journaliser: boolean;
}

async function reglages(): Promise<Reglages> {
  const s = await chrome.storage.local.get([
    CLES_STOCKAGE.cleApi,
    CLES_STOCKAGE.api,
    CLES_STOCKAGE.journaliser,
  ]);
  const cle = s[CLES_STOCKAGE.cleApi];
  return {
    cleApi: typeof cle === "string" && cle.length > 0 ? cle : null,
    api: typeof s[CLES_STOCKAGE.api] === "string" ? (s[CLES_STOCKAGE.api] as string) : API_DEFAUT,
    // Par defaut ON journalise QUAND une cle existe : poser une cle est le consentement.
    // Sans cle, la valeur ne change rien — aucun appel n'est tente.
    journaliser: s[CLES_STOCKAGE.journaliser] !== false,
  };
}

/**
 * Depose une ligne dans l'historique du compte. Ne leve jamais, n'est jamais attendue.
 *
 * Un 402 ici veut dire « la cle est valide mais l'abonnement ne l'est plus » : on l'ecrit
 * clairement, parce que c'est la seule facon pour l'utilisateur de comprendre pourquoi son
 * historique s'est arrete alors que les verdicts continuent.
 */
async function deposer(m: DemandeJournal): Promise<void> {
  const r = await reglages();
  if (!r.cleApi || !r.journaliser) return;
  try {
    const res = await fetch(`${r.api.replace(/\/+$/, "")}/compte/journal`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tare-cle": r.cleApi },
      body: JSON.stringify({
        source: "extension",
        quoi: m.quoi,
        sujet: m.sujet,
        detail: m.detail,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (res.status === 402) {
      console.warn(
        "[TARE Guard] historique ferme : la cle est valide mais l'abonnement ne l'est plus. " +
          "Les verdicts continuent — ils ne dependent d'aucun service.",
      );
      return;
    }
    if (res.status === 401) {
      console.warn(
        "[TARE Guard] cle refusee : inconnue, revoquee, ou de portee 'mcp' au lieu de " +
          "'extension'. Regenere-la depuis ton compte.",
      );
      return;
    }
    if (!res.ok) console.warn(`[TARE Guard] historique : HTTP ${res.status}`);
  } catch (e) {
    // Le reseau absent n'est pas une panne de l'extension : l'analyse est locale.
    console.warn(`[TARE Guard] historique injoignable : ${(e as Error).message}`);
  }
}

chrome.runtime.onMessage.addListener((brut, _expediteur, repondre) => {
  if (!estDeNous(brut)) return false;

  if (brut.genre === "consulter") {
    const m = brut as DemandeConsultation;
    charger()
      .then((t) => {
        const rapport = tareGuard({ to: m.tx.to, data: m.tx.data ?? m.tx.input }, { table: t });
        repondre({ marque: MARQUE, genre: "verdict", id: m.id, rapport, raison: null });
      })
      .catch((e: Error) => {
        // Un verdict nul avec sa raison, jamais un silence : le monde MAIN laisse alors
        // passer la transaction et l'ecrit, ce qui est le bon comportement par defaut.
        repondre({ marque: MARQUE, genre: "verdict", id: m.id, rapport: null, raison: e.message });
      });
    return true; // reponse asynchrone
  }

  if (brut.genre === "journal") {
    void deposer(brut as DemandeJournal);
    repondre({ recu: true });
    return false;
  }

  return false;
});

// Au premier demarrage seulement : on ne precharge pas la table, pour ne pas payer 21 Mo a
// qui installe l'extension et ne swappe pas.
chrome.runtime.onInstalled.addListener((d) => {
  console.info(`[TARE Guard] worker installe (${d.reason}). La table sera chargee au premier swap.`);
});
