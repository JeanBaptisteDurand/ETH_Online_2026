/**
 * LE TEST DE SORTIE — « tu mets 100, tu récupères combien ? »
 *
 * C'est le seul nombre qu'une personne qui hésite veut connaitre. Il repond a la question dans
 * l'ordre ou elle se pose : on entre, puis on ressort.
 *
 * CE QUE C'EST, EXACTEMENT. La composition des DEUX prelevements mesures — celui de l'achat et
 * celui de la revente — sur le meme pool, au meme bloc. Chacun vient d'une mesure identifiee,
 * avec sa commande de rejeu.
 *
 * CE QUE CE N'EST PAS, ET IL FAUT LE DIRE. Ce n'est PAS un aller-retour execute. Deux choses
 * l'en separent, et aucune n'est cachee :
 *
 *   1. L'IMPACT DE PRIX est ignore. Le premier echange deplace le prix du pool ; le second part
 *      donc d'un etat different. On compose deux taux de PRELEVEMENT, on ne rejoue pas deux
 *      swaps. Sur un pool profond l'ecart est negligeable ; sur un pool mince, non.
 *   2. LA TAILLE DE REVENTE EST INCONNUE. On sait combien on met a l'achat, pas combien de jetons
 *      on obtient — donc pas a quelle taille on revendra. Le prelevement de revente est donc
 *      BORNE par les mesures disponibles, pas connu.
 *
 * D'ou la forme de la reponse : un INTERVALLE, jamais un nombre unique quand la revente varie.
 * `garde_min` / `garde_max`, et `exact: true` seulement quand la revente est plate a toutes les
 * tailles mesurees. Rendre une seule valeur la ou on n'en connait qu'une plage serait exactement
 * le defaut que ce projet refuse partout ailleurs.
 *
 * Et si un seul sens est mesure, il n'y a PAS de reponse : `null`, avec la raison. L'autre sens
 * n'est pas gratuit, il est inconnu.
 */
import type { Measurement } from "./measurement.js";

/** Le cout total d'un cote : prelevement du hook + frais LP lus dans slot0, en points de base. */
interface Leg {
  amount_in: string;
  total_bps: number;
  hook_bps: number;
  lp_bps: number;
  measurement_id: string;
  replay: string;
}

export interface ExitPoint {
  /** ce qu'on met, en unites de base du jeton de cotation */
  amount_in: string;
  /** la fraction du montant qui revient, au pire de la revente mesuree */
  garde_min: number;
  /** au mieux */
  garde_max: number;
  /** true quand la revente est plate : les deux bornes coincident */
  exact: boolean;
  achat: Leg;
  /** les deux bornes de la revente ; identiques si la revente est plate */
  revente: { pire: Leg; meilleure: Leg };
}

export interface ExitTest {
  token: string;
  pool_id: string;
  hook: string;
  block_number: number;
  /** un point par taille d'achat mesuree */
  points: ExitPoint[];
  /** le pire point, celui qu'on montre en premier */
  pire: ExitPoint;
  methode: string;
  limites: string[];
}

export interface ExitRefus {
  refus: string;
  raison: string;
  sens_mesures: string[];
}

const BPS = 10000;

function legOf(m: Measurement): Leg {
  const hook = m.bps ?? 0;
  const lp = (m.stored_lp_fee ?? 0) / 100;
  return {
    amount_in: m.amount_in,
    total_bps: hook + lp,
    hook_bps: hook,
    lp_bps: lp,
    measurement_id: m.id,
    replay: m.replay.command_exact,
  };
}

/** Ce qui reste apres avoir paye `bps` points de base. Borne a zero : on ne rend jamais un negatif. */
function reste(bps: number): number {
  return Math.max(0, 1 - bps / BPS);
}

/**
 * Le test de sortie d'un jeton, ou le refus motive.
 *
 * `rows` sont les mesures qui concernent ce jeton. Le sens de l'achat depend du cote de la
 * PoolKey qui porte le jeton : si le jeton est currency1, l'acheter c'est aller de 0 vers 1.
 */
export function buildExitTest(token: string, rows: Measurement[]): ExitTest | ExitRefus {
  const t = token.toLowerCase();
  const first = rows[0];
  if (!first) return { refus: "jeton inconnu", raison: "aucune mesure pour ce jeton", sens_mesures: [] };

  const tokenIsCurrency1 = (first.currency1 ?? "").toLowerCase() === t;
  // Une ligne n'entre dans le calcul que si TOUT ce qu'on compose y est lu. `stored_lp_fee`
  // a `null` veut dire « slot0 non relu », pas « pas de frais LP » : le passer a zero
  // rendrait un montant de sortie trop FLATTEUR, et il aurait l'air d'une mesure. Aucune
  // ligne MEASURED du corpus n'est dans ce cas aujourd'hui (14 lignes sur 125 072 ont un
  // frais nul, toutes NOT_QUOTABLE ou NOT_MEASURABLE) ; la garde est la pour le jour ou
  // le moteur en produira une.
  const mesurees = rows.filter(
    (r) => r.label === "MEASURED" && r.bps !== null && r.stored_lp_fee !== null,
  );

  const achats = mesurees
    .filter((r) => r.zero_for_one === tokenIsCurrency1)
    .sort((a, b) => (BigInt(a.amount_in) < BigInt(b.amount_in) ? -1 : 1));
  const reventes = mesurees.filter((r) => r.zero_for_one !== tokenIsCurrency1);

  if (achats.length === 0 || reventes.length === 0) {
    const sens: string[] = [];
    if (achats.length) sens.push("achat");
    if (reventes.length) sens.push("revente");
    return {
      refus: "aller-retour non calculable",
      raison:
        sens.length === 0
          ? "aucune mesure chiffree sur ce jeton, dans aucun sens"
          : `un seul sens est mesure (${sens[0]}). L'autre n'est pas gratuit : il est INCONNU, ` +
            `et le composer avec zero rendrait un nombre faux.`,
      sens_mesures: sens,
    };
  }

  const legsRevente = reventes.map(legOf);
  const pireRevente = legsRevente.reduce((a, b) => (b.total_bps > a.total_bps ? b : a));
  const meilleureRevente = legsRevente.reduce((a, b) => (b.total_bps < a.total_bps ? b : a));
  // Comparer deux taux en flottant strict est une erreur : une revente mesuree a 99,9999 bps et
  // une autre a 100,0000 bps donnent le MEME centime a l'affichage, et pourtant `===` les separe.
  // On obtenait alors « il te reste entre 98.01 et 98.01 EUR » avec exact: false — une phrase qui
  // annonce une incertitude qu'elle ne montre pas. Un centieme de point de base est en dessous de
  // tout ce qu'un montant affiche peut distinguer.
  const EPS_BPS = 0.01;
  const reventePlate = Math.abs(pireRevente.total_bps - meilleureRevente.total_bps) < EPS_BPS;

  const points: ExitPoint[] = achats.map((a) => {
    const achat = legOf(a);
    const apresAchat = reste(achat.total_bps);
    return {
      amount_in: achat.amount_in,
      garde_min: apresAchat * reste(pireRevente.total_bps),
      garde_max: apresAchat * reste(meilleureRevente.total_bps),
      exact: reventePlate,
      achat,
      revente: { pire: pireRevente, meilleure: meilleureRevente },
    };
  });

  const pire = points.reduce((a, b) => (b.garde_min < a.garde_min ? b : a));

  return {
    token: t,
    pool_id: first.pool_id,
    hook: first.hook,
    block_number: first.block_number,
    points,
    pire,
    methode:
      "composition des deux prelevements mesures (achat puis revente) sur le meme pool, au meme " +
      "bloc. total = prelevement du hook + frais LP lus dans slot0.",
    limites: [
      "Ce n'est PAS un aller-retour execute : l'impact de prix du premier echange sur le second est ignore.",
      "La taille de revente est inconnue — on sait ce qu'on met, pas combien de jetons on obtient. Le prelevement de revente est donc BORNE, d'ou l'intervalle.",
      reventePlate
        ? "Ici la revente est plate a toutes les tailles mesurees : les deux bornes coincident, la reponse est exacte a la composition pres."
        : "Ici la revente varie selon la taille : la reponse est un intervalle, jamais un nombre unique.",
      "Tout est mesure a un seul bloc. Un hook qui a change de comportement depuis n'est pas decrit.",
    ],
  };
}

/** « il te reste 98,01 EUR sur 100 » — la phrase que lit un humain. */
export function phrase(test: ExitTest, montant: number, devise = "EUR"): string {
  const p = test.pire;
  const lo = (p.garde_min * montant).toFixed(2);
  const hi = (p.garde_max * montant).toFixed(2);
  // Deux bornes qui s'affichent pareil ne sont pas un intervalle : « entre 98.01 et 98.01 »
  // annonce une incertitude que le lecteur ne voit pas, ce qui use la confiance pour rien.
  if (p.exact || lo === hi) return `tu mets ${montant} ${devise}, il te reste ${lo} ${devise}`;
  return `tu mets ${montant} ${devise}, il te reste entre ${lo} et ${hi} ${devise}`;
}
