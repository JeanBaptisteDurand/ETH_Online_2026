/**
 * SCRIPT DE CONTENU, MONDE ISOLATED — le pont, et rien d'autre.
 *
 * Il existe pour une raison unique : dans Chrome MV3, un script du monde MAIN ne voit pas
 * `chrome.runtime`, et un script qui voit `chrome.runtime` ne voit pas `window.ethereum`. Il
 * faut donc les deux, et quelqu'un au milieu.
 *
 * Il ne decide rien, ne garde rien, ne lit aucune cle. Il transporte. C'est volontaire : plus
 * ce fichier est petit, moins il y a d'endroits ou une erreur peut changer un verdict.
 */
import { estDeNous, MARQUE } from "./protocole.js";

window.addEventListener("message", (ev) => {
  if (ev.source !== window) return;
  const m = ev.data;
  if (!estDeNous(m)) return;

  if (m.genre === "consulter") {
    chrome.runtime.sendMessage(m, (reponse) => {
      // `lastError` DOIT etre lu, sinon Chrome l'imprime comme une erreur non geree. Et un
      // worker endormi ou une extension rechargee tombent ici : on renvoie un verdict nul
      // avec sa raison, jamais un silence — le monde MAIN attend une reponse et laisserait
      // passer la transaction au bout du delai sans savoir pourquoi.
      const err = chrome.runtime.lastError;
      window.postMessage(
        err || !reponse
          ? {
              marque: MARQUE,
              genre: "verdict",
              id: m.id,
              rapport: null,
              raison: err?.message ?? "le service worker n'a rien renvoye",
            }
          : reponse,
        window.location.origin,
      );
    });
    return;
  }

  if (m.genre === "journal") {
    // Sans rappel : le journal ne doit rien faire attendre a personne. Une erreur ici est
    // lue et jetee, parce qu'un historique indisponible n'est pas une raison de gener un
    // swap.
    chrome.runtime.sendMessage(m, () => void chrome.runtime.lastError);
  }
});
