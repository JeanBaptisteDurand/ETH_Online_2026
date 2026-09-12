/**
 * SCRIPT DE CONTENU, MONDE MAIN — la seule piece qui voit window.ethereum.
 *
 * Elle ne porte AUCUNE mesure. Elle enveloppe le portefeuille, decode rien, decide rien :
 * elle pose la question au service worker par l'intermediaire du pont, et affiche la reponse.
 *
 * C'est ce qui a change, et le chiffre le dit : ce bundle pesait 21,9 Mo parce qu'esbuild y
 * inlinait data/table.json, et il tourne a document_start sur CHAQUE page visitee. La table
 * vit maintenant dans le worker, chargee une fois par vie du worker.
 *
 * SI LE WORKER NE REPOND PAS — extension rechargee, navigateur qui l'a mise en sommeil,
 * table absente du paquet — la transaction PASSE, et la console le dit. Bloquer par accident
 * quelqu'un qui n'a rien demande est un plus gros defaut que rater une alerte.
 */
import { installerInjection } from "../src/injection.js";
import type { GuardReport } from "../src/types.js";
import { MARQUE, estDeNous, CIBLE_MEME_FENETRE, type ReponseConsultation } from "./protocole.js";

/** Au-dela, on considere que le worker ne repondra pas. Un swap n'attend pas trois secondes. */
const DELAI_MS = 2500;

let compteur = 0;
const enAttente = new Map<string, (r: ReponseConsultation) => void>();

window.addEventListener("message", (ev) => {
  // Meme fenetre uniquement : un iframe ne repond pas pour son parent.
  if (ev.source !== window) return;
  const m = ev.data;
  if (!estDeNous(m) || m.genre !== "verdict") return;
  const resoudre = enAttente.get(m.id);
  if (!resoudre) return;
  enAttente.delete(m.id);
  resoudre(m);
});

function demander(genre: "consulter", tx: unknown): Promise<ReponseConsultation> {
  const id = `${Date.now().toString(36)}.${(compteur += 1)}`;
  return new Promise((resoudre) => {
    const minuteur = setTimeout(() => {
      enAttente.delete(id);
      resoudre({
        marque: MARQUE,
        genre: "verdict",
        id,
        rapport: null,
        raison: `le service worker n'a pas repondu en ${DELAI_MS} ms`,
      });
    }, DELAI_MS);
    enAttente.set(id, (r) => {
      clearTimeout(minuteur);
      resoudre(r);
    });
    window.postMessage({ marque: MARQUE, genre, id, tx }, CIBLE_MEME_FENETRE);
  });
}

const installation = installerInjection({
  askOn: ["warn", "block"],
  async consulter(tx) {
    const r = await demander("consulter", {
      to: tx.to ?? null,
      data: tx.data ?? tx.input ?? null,
      chainId: (tx as { chainId?: unknown }).chainId,
    });
    if (r.rapport === null) throw new Error(r.raison ?? "consultation impossible");
    return r.rapport as GuardReport;
  },
  onReport: (rapport) => {
    // Une ligne par interception, pour qu'on voie la garde travailler sans rien ouvrir.
    console.info(
      "[TARE Guard]",
      rapport.verdict,
      rapport.findings[0]?.hook ?? "(aucun hook mesure)",
      rapport.headline,
    );
    // Le journal du compte part du WORKER, pas d'ici : le monde MAIN ne voit ni
    // chrome.storage (donc pas la cle) ni chrome.runtime (donc pas le reseau autorise).
    window.postMessage(
      {
        marque: MARQUE,
        genre: "journal",
        id: `j.${Date.now().toString(36)}`,
        quoi: "verdict",
        sujet: rapport.findings[0]?.hook ?? null,
        detail: {
          verdict: rapport.verdict,
          bps: rapport.findings[0]?.bps ?? null,
          etiquette: rapport.findings[0]?.label ?? null,
          pool_id: rapport.findings[0]?.leg?.poolId ?? null,
          taille: rapport.findings[0]?.leg?.amountIn ?? null,
          calldata_lu_en_entier: rapport.complete,
          alternative: rapport.alternative?.etat ?? null,
          economie_bps: rapport.alternative?.economie_bps ?? null,
          origine: window.location.host,
        },
      },
      CIBLE_MEME_FENETRE,
    );
  },
});

console.info(`[TARE Guard] posee sur ${installation.wrapped.length} provider(s)`);
