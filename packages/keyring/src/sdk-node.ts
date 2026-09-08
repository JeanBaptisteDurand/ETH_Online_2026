/**
 * Le SDK de Ledger, cable sur un transport qu'on choisit.
 *
 * C'est le seul fichier du paquet qui touche les modules de Ledger, et il les charge par
 * `require` : @ledgerhq/ledger-key-ring-protocol et le transport Speculos sont publies en
 * CommonJS, et leur resolution ESM est cassee en amont (@ledgerhq/errors importe sans
 * extension de fichier). Ce n'est pas une preference, c'est la seule forme qui marche.
 *
 * `WithDevice` est le point d'injection du SDK : une fonction qui rend un Observable rxjs
 * autour d'un Transport. Le CLI de Ledger y met un transport USB en dur ; on y met ce
 * qu'on veut. C'est toute la difference entre « il faut un Nano » et « il en faut un une
 * fois, pour l'amorcage ».
 */
import { createRequire } from "node:module";
import type { TrustchainSdk } from "./ring.js";
import { APPLICATION_ID, LKRP_STAGING } from "./ring.js";

const require = createRequire(import.meta.url);

export interface SdkOptions {
  /** l'URL de l'API Speculos, p.ex. http://127.0.0.1:5011. Absente => aucun appareil. */
  speculosUrl?: string;
  backend?: string;
  name?: string;
}

/**
 * Un SDK qui peut parler a l'appareil (Speculos), pour SCELLER.
 */
export function nodeSdkWithDevice(opts: SdkOptions): TrustchainSdk {
  const { defer, from, concatMap, finalize } = require("rxjs");
  const SpeculosHttpTransport = require("@ledgerhq/hw-transport-node-speculos-http").default;
  const { getSdk } = require("@ledgerhq/ledger-key-ring-protocol");

  const url = opts.speculosUrl;
  if (!url) throw new Error("nodeSdkWithDevice exige speculosUrl (ou utilise nodeSdkHeadless)");
  const apiPort = Number(new URL(url).port || 5011);

  const withDevice =
    () =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (fn: (t: unknown) => any) =>
      defer(() => from(SpeculosHttpTransport.open({ apiPort }))).pipe(
        concatMap((t: { close(): Promise<void> }) =>
          fn(t).pipe(finalize(() => t.close().catch(() => {}))),
        ),
      );

  return getSdk(
    false,
    {
      applicationId: APPLICATION_ID,
      name: opts.name ?? "TARE",
      apiBaseUrl: opts.backend ?? LKRP_STAGING,
    },
    withDevice,
  ) as TrustchainSdk;
}

/**
 * Un SDK qui ne peut PAS parler a un appareil : le transport jette si on l'appelle.
 *
 * Ce n'est pas de la prudence decorative. C'est ce qui rend la promesse verifiable : si
 * l'ouverture d'un secret touchait l'appareil, ce chemin echouerait bruyamment au lieu de
 * marcher par accident parce qu'un Speculos tournait dans un coin.
 */
export function nodeSdkHeadless(opts: SdkOptions = {}): TrustchainSdk {
  const { defer } = require("rxjs");
  const { getSdk } = require("@ledgerhq/ledger-key-ring-protocol");

  const noDevice = () => () =>
    defer(() => {
      throw new Error(
        "APPAREIL INTERDIT — ce chemin doit fonctionner sans appareil. " +
          "Si le SDK en demande un, c'est que l'hypothese est fausse.",
      );
    });

  return getSdk(
    false,
    {
      applicationId: APPLICATION_ID,
      name: opts.name ?? "TARE",
      apiBaseUrl: opts.backend ?? LKRP_STAGING,
    },
    noDevice,
  ) as TrustchainSdk;
}
