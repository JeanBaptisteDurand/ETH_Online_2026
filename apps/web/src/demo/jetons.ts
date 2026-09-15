/**
 * LES MONTANTS, EN UNITES DU JETON — quand on a le droit de les convertir, et seulement alors.
 *
 * Le corpus mesure des montants en plus petite unite : 1 000 000 000 000 pour l'acte. A l'ecran,
 * ce nombre ne dit rien a personne. « 0.000001 ETH » le dit.
 *
 * MAIS LA CONVERSION DEMANDE LES DECIMALES DU JETON, et le depot ne les a pas. `symboles.json`
 * porte `symbol()` et `name()`, lus sur la chaine ; il ne porte pas `decimals()`. Ecrire 18 par
 * defaut serait exactement la faute que ce projet reproche au reste : un jeton a 6 decimales
 * afficherait alors un montant un million de milliards de fois trop petit, et rien ne le dirait.
 *
 * D'ou la regle, dure et courte : ON NE CONVERTIT QUE CE DONT ON CONNAIT LES DECIMALES. L'ETH natif
 * par definition (un wei EST 10^-18 ether) ; un ERC-20 seulement si `decimals()` a ete LU sur son
 * contrat et ecrit dans DECIMALES_LUES, avec la commande qui le relit. Pour tout autre jeton,
 * `montantLisible` rend `null`, et l'ecran affiche le compte d'unites brut.
 */
import { ZERO_ADDRESS } from './garde.mjs'

/** Les decimales de l'ether. Ce n'est pas une lecture : c'est la definition du wei. */
export const DECIMALES_NATIF = 18

/** Vrai pour la monnaie native de la chaine. */
export const estNatif = (monnaie: string): boolean => monnaie.toLowerCase() === ZERO_ADDRESS

/**
 * LES DECIMALES LUES SUR LA CHAINE, et seulement celles-la.
 *
 * L'USDC de Base a ete lu le 15 septembre 2026 sur le fork epingle au bloc 50 614 000 :
 * `decimals()` rend 6. Avant cette lecture, l'ecran affichait « receives 2 442 USDC » pour un swap
 * de 0.000001 ETH — or 2 442 est un compte d'UNITES, soit 0.002442 USDC. Une erreur d'un facteur
 * un million, exactement celle que la regle ci-dessus existe pour empecher.
 */
export const DECIMALES_LUES: Readonly<Record<string, { decimales: number; relire: string }>> = {
  '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
    decimales: 6,
    relire:
      'cast call 0x833589fcd6edb6e08f4c7c32d4f71b54bda02913 "decimals()(uint8)" --block 50614000 --rpc-url https://tare-hooks.tech/rpc',
  },
}

/** Les decimales d'une monnaie quand on les connait, `null` sinon — jamais 18 par defaut. */
export function decimalesDe(monnaie: string): number | null {
  if (estNatif(monnaie)) return DECIMALES_NATIF
  return DECIMALES_LUES[monnaie.toLowerCase()]?.decimales ?? null
}

/**
 * Le montant en unites du jeton, exact, sans flottant.
 *
 * `null` quand on ne connait pas les decimales : l'appelant affiche alors le brut, et il le dit.
 * Aucun arrondi n'est fait — 1 000 000 000 001 wei rend « 0.000001000000000001 », pas
 * « 0.000001 ». Arrondir un montant qu'on va signer serait une drole d'idee.
 */
export function montantLisible(brut: string, monnaie: string): string | null {
  const d = decimalesDe(monnaie)
  if (d === null) return null
  let v: bigint
  try {
    v = BigInt(brut)
  } catch {
    return null
  }
  const negatif = v < 0n
  if (negatif) v = -v
  const s = v.toString().padStart(d + 1, '0')
  const entier = s.slice(0, s.length - d)
  const frac = s.slice(s.length - d).replace(/0+$/, '')
  return `${negatif ? '-' : ''}${entier}${frac ? `.${frac}` : ''}`
}
