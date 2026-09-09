/**
 * LA ROUTE QUE L'UTILISATEUR PEUT REELLEMENT UTILISER.
 *
 * Toutes les autres routes demandent une adresse de hook ou un pool_id. Personne n'a ça.
 * Ce qu'un utilisateur possede, c'est UN JETON : une adresse qu'il a copiee depuis un lien,
 * un explorateur, ou l'application ou il l'a achete.
 *
 * Et le jeu de mesures permet d'y repondre sans ambiguite : sur les 8 583 jetons vus hors
 * monnaies de cotation, 97,2 % n'apparaissent que dans UN pool et 99,8 % ne sont rattaches
 * qu'a UN hook. Coller un jeton designe donc sa porte et sa plateforme, sans desambiguisation.
 *
 * LA TRADUCTION QUI COMPTE. Le protocole parle en `zeroForOne` ; un humain pense en
 * « acheter » et « vendre ». La route rend les deux : `direction` pour qui rejoue, et
 * `tu_achetes` / `tu_vends` pour qui decide. C'est cette traduction qui fait qu'un jeton
 * gratuit a l'achat et confisque a la vente se lit en une seconde au lieu de trois minutes.
 *
 * Rien n'est estime. Une taille non mesuree n'apparait pas ; un sens non mesure est annonce
 * absent, jamais rendu a zero.
 */
import type { Measurement } from "./measurement.js";
import type { RegistryEntry } from "./dataset.js";

/** Les monnaies de cotation : ce n'est pas d'elles qu'on demande la fiche. */
export const QUOTE_CURRENCIES: Record<string, string> = {
  "0x0000000000000000000000000000000000000000": "ETH",
  "0x4200000000000000000000000000000000000006": "WETH",
  "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913": "USDC",
};

export function isQuoteCurrency(a: string): boolean {
  return a.toLowerCase() in QUOTE_CURRENCIES;
}

/** Un cote de l'echange, du point de vue de l'humain. */
export interface Side {
  /** ce que le protocole appelle ce sens, pour rejouer */
  direction: "0->1" | "1->0";
  /** nombre de tailles MESUREES dans ce sens */
  sizes: number;
  min_bps: number;
  max_bps: number;
  /** true si l'ecart entre la plus petite et la plus grande taille depasse le seuil */
  varies_with_size: boolean;
  /** chaque point, avec sa commande de rejeu */
  points: { amount_in: string; bps: number; label: string; measurement_id: string; replay: string }[];
}

export interface TokenSheet {
  token: string;
  /** contre quoi il s'echange, en clair */
  against: { address: string; symbol: string | null } | null;
  pool_id: string;
  /** plusieurs pools : on les liste, on n'en choisit pas un au hasard */
  other_pools: string[];
  hook: string;
  /** le nom declare au registre, ou null — et null EST une information */
  platform: string | null;
  platform_declared: boolean;
  block_number: number;
  /** ce que ca coute d'acheter ce jeton, et de le revendre */
  tu_achetes: Side | null;
  tu_vends: Side | null;
  /** les alertes, en francais, prêtes a afficher */
  alertes: string[];
  /** les etiquettes qui ne portent pas de nombre, comptees et jamais promues */
  non_chiffre: Record<string, number>;
  honesty: string[];
}

const VARIE_BPS = 50;
const ASYM_BPS = 50;

function side(rows: Measurement[], zeroForOne: boolean): Side | null {
  const mes = rows
    .filter((r) => r.zero_for_one === zeroForOne && r.label === "MEASURED" && r.bps !== null)
    .sort((a, b) => (BigInt(a.amount_in) < BigInt(b.amount_in) ? -1 : 1));
  if (mes.length === 0) return null;
  const bps = mes.map((m) => m.bps as number);
  const min = Math.min(...bps);
  const max = Math.max(...bps);
  return {
    direction: zeroForOne ? "0->1" : "1->0",
    sizes: mes.length,
    min_bps: min,
    max_bps: max,
    varies_with_size: max - min > VARIE_BPS,
    points: mes.map((m) => ({
      amount_in: m.amount_in,
      bps: m.bps as number,
      label: m.label,
      measurement_id: m.id,
      replay: m.replay.command_exact,
    })),
  };
}

/**
 * La fiche d'un jeton. `rows` sont les mesures qui le concernent, deja filtrees.
 *
 * Le sens « acheter » depend de quel cote de la PoolKey porte le jeton demande : si le jeton
 * est currency1, l'acheter c'est aller de 0 vers 1. Se tromper la-dessus inverserait le
 * conseil, ce qui serait pire que ne rien dire.
 */
export function buildTokenSheet(
  token: string,
  rows: Measurement[],
  registry: Map<string, RegistryEntry>,
): TokenSheet {
  const t = token.toLowerCase();
  const first = rows[0]!;
  const tokenIsCurrency1 = (first.currency1 ?? "").toLowerCase() === t;

  // acheter le jeton = recevoir le jeton = aller vers le cote qui le porte
  const acheter = side(rows, tokenIsCurrency1 /* 0->1 rend currency1 */);
  const vendre = side(rows, !tokenIsCurrency1);

  const contre = tokenIsCurrency1 ? first.currency0 : first.currency1;
  const nonChiffre: Record<string, number> = {};
  for (const r of rows) if (r.label !== "MEASURED") nonChiffre[r.label] = (nonChiffre[r.label] ?? 0) + 1;

  const entry = registry.get(first.hook.toLowerCase());
  // RegistryEntry est { address, fields } : le nom vit dans les champs, et sa forme
  // depend de l'instantane. On le lit sans supposer, et on rend null si absent.
  const champs = (entry?.fields ?? {}) as Record<string, unknown>;
  const nested = (champs.hook ?? {}) as Record<string, unknown>;
  const nomDeclare =
    (typeof nested.name === "string" && nested.name) ||
    (typeof champs.name === "string" && champs.name) ||
    null;
  const alertes: string[] = [];

  if (acheter?.varies_with_size)
    alertes.push(
      `Le cout d'ACHAT change avec la taille : de ${acheter.min_bps} a ${acheter.max_bps} bps. ` +
        `Un devis pris sur une petite taille ne vaut pas pour une grosse.`,
    );
  if (vendre?.varies_with_size)
    alertes.push(
      `Le cout de VENTE change avec la taille : de ${vendre.min_bps} a ${vendre.max_bps} bps.`,
    );
  if (acheter && vendre) {
    const ecart = Math.abs(vendre.max_bps - acheter.max_bps);
    if (ecart > ASYM_BPS)
      alertes.push(
        `ASYMETRIE de ${Math.round(ecart)} bps entre acheter et vendre` +
          (vendre.max_bps > acheter.max_bps
            ? ` — il est plus cher d'en sortir que d'y entrer.`
            : ` — il est plus cher d'y entrer que d'en sortir.`),
      );
  }
  if (!acheter || !vendre)
    alertes.push(
      `Un seul sens est mesure. L'autre n'est pas a zero : il est NON MESURE, et rien ne permet de le supposer.`,
    );
  if (!entry)
    alertes.push(
      `Le hook de ce pool n'est pas decrit au registre officiel des hooks. Personne n'a declare ce qu'il fait.`,
    );

  const pools = [...new Set(rows.map((r) => r.pool_id))];

  return {
    token: t,
    against: contre ? { address: contre, symbol: QUOTE_CURRENCIES[contre.toLowerCase()] ?? null } : null,
    pool_id: first.pool_id,
    other_pools: pools.slice(1),
    hook: first.hook,
    platform: nomDeclare,
    platform_declared: Boolean(entry),
    block_number: first.block_number,
    tu_achetes: acheter,
    tu_vends: vendre,
    alertes,
    non_chiffre: nonChiffre,
    honesty: [
      "Chaque bps vient d'une mesure identifiee, avec son bloc, sa taille, son sens et sa commande de rejeu.",
      "Un sens ou une taille non mesure n'est jamais rendu a zero : il est absent, et c'est dit.",
      "Le nom de la plateforme vient du registre declaratif, pas de la mesure : c'est une declaration, pas une preuve.",
    ],
  };
}
