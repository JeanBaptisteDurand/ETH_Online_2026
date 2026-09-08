/**
 * D'ou vient la cle qui signe les paiements.
 *
 * Deux sources, et le service DIT toujours laquelle il a utilisee :
 *
 *   1. le trousseau Ledger (`var/keyring.json`) — le secret est chiffre sous une cle
 *      derivee de la graine, et le membre qui l'ouvre est revocable ;
 *   2. l'environnement (`HEDERA_PAYER_PRIVATE_KEY`) — en clair, lisible par tout
 *      processus de la machine.
 *
 * Le trousseau gagne quand il existe. L'environnement reste le repli, parce qu'un projet
 * qu'on ne peut plus faire tourner sans conteneur Speculos serait un projet moins
 * utilisable — mais le repli s'annonce. « Il marche » et « il est protege » ne sont pas la
 * meme phrase, et on ne laisse pas croire l'une en constatant l'autre.
 *
 * Ce que le trousseau apporte, exactement : la cle n'est plus en clair sur le disque, son
 * acces est revocable (`removeMember` coupe cette machine sans toucher la graine ni les
 * autres membres) et attribuable, et l'amorcage a exige une approbation materielle. Ce
 * qu'il n'apporte pas : une protection contre un attaquant qui vole le fichier du membre
 * ET peut joindre le backend de Ledger. Ce n'est pas un coffre, c'est une delegation
 * revocable — et c'est deja beaucoup mieux qu'une ligne de .env.
 */
import { resolve } from "node:path";
import { existsSync } from "node:fs";
import { REPO_ROOT } from "../paths.js";

export type SecretSource = "ledger-keyring" | "environnement";

export interface ResolvedSecret {
  value: string;
  source: SecretSource;
  /** ce qu'on peut afficher sans divulguer */
  describe: string;
}

export function keyringPath(): string {
  return process.env.TARE_KEYRING ?? resolve(REPO_ROOT, "var", "keyring.json");
}

/**
 * Le trousseau est charge PARESSEUSEMENT et par import dynamique : @tare/keyring tire le
 * SDK de Ledger, qui est lourd et n'a rien a faire dans le chemin d'une requete qui
 * n'ouvre aucun secret.
 */
async function fromKeyring(path: string, name: string): Promise<string | null> {
  const { readRing, open } = await import("@tare/keyring");
  const { nodeSdkHeadless } = await import("@tare/keyring/node");
  const ring = readRing(path);
  if (ring.nom !== name)
    throw new Error(
      `le trousseau ${path} scelle « ${ring.nom} », pas « ${name} » — on n'ouvre pas au hasard`,
    );
  const sdk = nodeSdkHeadless({ backend: ring.backend });
  return open(sdk, ring);
}

export async function resolvePayerKey(
  name = "HEDERA_PAYER_PRIVATE_KEY",
): Promise<ResolvedSecret> {
  const path = keyringPath();

  if (existsSync(path)) {
    const value = await fromKeyring(path, name);
    if (value)
      return {
        value,
        source: "ledger-keyring",
        describe: `trousseau Ledger (${path}) — ouvert sans appareil`,
      };
  }

  const env = process.env[name];
  if (!env)
    throw new Error(
      `ni trousseau a ${path}, ni ${name} dans l'environnement : aucune cle de paiement.`,
    );
  return {
    value: env,
    source: "environnement",
    describe: `${name} en CLAIR dans l'environnement — scelle-la : ring.ts seal`,
  };
}
