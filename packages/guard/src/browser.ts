/**
 * LE CHEMIN DAPP : la garde posee dans une page, avec la table embarquee.
 *
 *   import { installTareGuard } from "@tare/guard/browser";
 *   installTareGuard({ askOn: ["warn", "block"] });
 *
 * Toute la mecanique d'interception vit dans ./injection.ts, qui ne connait PAS les mesures :
 * il recoit un `consulter` et l'appelle. Ce fichier-ci ne fait qu'une chose — brancher
 * `tareGuard`, donc la table de 21 Mo, comme consultation par defaut.
 *
 * POURQUOI CETTE SEPARATION EXISTE. `data/table.json` pese 21 Mo et esbuild l'inline dans le
 * bundle : le script de contenu de l'extension faisait 21,9 Mo, et il tourne a
 * document_start sur CHAQUE page. La table vit donc desormais dans le service worker de
 * l'extension, chargee une fois par vie du worker. Un dapp, lui, charge sa page une fois : y
 * embarquer la table est le bon compromis, et c'est ce que ce fichier fait.
 *
 * L'API publique est inchangee : wrapProvider, installTareGuard, showOverlay,
 * overlayApprover, UserRejectedByGuard, InstallOptions.
 */
import { tareGuard } from "./guard.js";
import type { GuardReport, TxRequest } from "./types.js";
import {
  envelopperProvider,
  installerInjection,
  type Eip1193Provider,
  type Installation,
  type OptionsInjection,
} from "./injection.js";

export {
  showOverlay,
  overlayApprover,
  UserRejectedByGuard,
  envelopperProvider,
  installerInjection,
} from "./injection.js";
export type { Eip1193Provider, Installation, OptionsInjection } from "./injection.js";

/** Les options du chemin dapp : `consulter` y est facultatif, la table etant embarquee. */
export type InstallOptions = Omit<OptionsInjection, "consulter"> & {
  consulter?: (tx: TxRequest) => Promise<GuardReport>;
};

/** La consultation par defaut : la table embarquee, en memoire, sans reseau. */
function consultationEmbarquee(opts: InstallOptions): (tx: TxRequest) => Promise<GuardReport> {
  return opts.consulter ?? ((tx: TxRequest) => Promise.resolve(tareGuard(tx, opts)));
}

/**
 * Enveloppe un provider EIP-1193. Idempotent : re-enveloppe pas ce qui l'est deja, sinon
 * chaque annonce EIP-6963 empilerait une couche de plus et ouvrirait N fenetres.
 */
export function wrapProvider(provider: Eip1193Provider, opts: InstallOptions = {}): Eip1193Provider {
  return envelopperProvider(provider, { ...opts, consulter: consultationEmbarquee(opts) });
}

/** Pose la garde sur les trois portes. A appeler le plus tot possible (document_start). */
export function installTareGuard(opts: InstallOptions = {}): Installation {
  return installerInjection({ ...opts, consulter: consultationEmbarquee(opts) });
}
