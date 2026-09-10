/**
 * LA PAGE DE REGLAGES — le seul endroit ou la cle d'API entre dans l'extension.
 *
 * Elle fait trois choses, et rien de plus : lire ce qui est stocke, l'ecrire, et proposer de
 * TESTER la cle avant de la croire. Le test compte : une cle collee de travers, revoquee, ou
 * de portee « mcp » au lieu de « extension » echoue silencieusement au moment ou l'extension
 * l'utilise — c'est-a-dire pendant un swap, dans une console que personne ne regarde.
 *
 * Le test ecrit une VRAIE ligne dans l'historique, nommee comme telle. Un test qui ne
 * traverserait pas tout le chemin ne testerait rien.
 */
import { API_DEFAUT, CLES_STOCKAGE } from "./protocole.js";

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const champCle = $<HTMLInputElement>("cle");
const champApi = $<HTMLInputElement>("api");
const caseJournal = $<HTMLInputElement>("journaliser");
const etat = $<HTMLSpanElement>("etat");

function dire(texte: string): void {
  etat.textContent = texte;
}

async function charger(): Promise<void> {
  const s = await chrome.storage.local.get([
    CLES_STOCKAGE.cleApi,
    CLES_STOCKAGE.api,
    CLES_STOCKAGE.journaliser,
  ]);
  champCle.value = typeof s[CLES_STOCKAGE.cleApi] === "string" ? (s[CLES_STOCKAGE.cleApi] as string) : "";
  champApi.value = typeof s[CLES_STOCKAGE.api] === "string" ? (s[CLES_STOCKAGE.api] as string) : API_DEFAUT;
  caseJournal.checked = s[CLES_STOCKAGE.journaliser] !== false;
}

$<HTMLButtonElement>("enregistrer").addEventListener("click", async () => {
  const api = champApi.value.trim() || API_DEFAUT;
  // Une adresse malformee ferait echouer chaque depot sans jamais le dire ailleurs qu'ici.
  try {
    new URL(api);
  } catch {
    dire(`adresse invalide : ${api}`);
    return;
  }
  await chrome.storage.local.set({
    [CLES_STOCKAGE.cleApi]: champCle.value.trim(),
    [CLES_STOCKAGE.api]: api,
    [CLES_STOCKAGE.journaliser]: caseJournal.checked,
  });
  dire(champCle.value.trim() ? "enregistre" : "enregistre — aucune cle, rien ne sera envoye");
});

$<HTMLButtonElement>("essayer").addEventListener("click", async () => {
  const cle = champCle.value.trim();
  const api = (champApi.value.trim() || API_DEFAUT).replace(/\/+$/, "");
  if (!cle) {
    dire("aucune cle a tester — et ce n'est pas un probleme : l'analyse est locale");
    return;
  }
  dire("test en cours…");
  try {
    const res = await fetch(`${api}/compte/journal`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-tare-cle": cle },
      body: JSON.stringify({
        source: "extension",
        quoi: "analyse",
        sujet: null,
        // Nommee, pour qu'une ligne de test ne se fasse pas passer pour un vrai verdict.
        detail: { test_de_cle: true, depuis: "page de reglages de l'extension" },
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      dire("cle acceptee — une ligne de test est dans ton historique");
      return;
    }
    const corps = (await res.json().catch(() => null)) as { error?: string; detail?: string } | null;
    if (res.status === 401)
      dire(`cle refusee : ${corps?.detail ?? "inconnue, revoquee, ou de mauvaise portee"}`);
    else if (res.status === 402)
      dire(`abonnement inactif : ${corps?.detail ?? "l'historique est ferme"}. Les verdicts, eux, continuent`);
    else if (res.status === 503) dire(`l'API repond mais les comptes sont indisponibles : ${corps?.detail ?? ""}`);
    else dire(`HTTP ${res.status} : ${corps?.error ?? "reponse inattendue"}`);
  } catch (e) {
    dire(`API injoignable : ${(e as Error).message}`);
  }
});

void charger();
