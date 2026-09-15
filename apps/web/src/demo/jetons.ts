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
 * D'ou la regle, dure et courte : ON NE CONVERTIT QUE L'ETH NATIF. Un wei EST 10^-18 ether, par
 * definition du protocole — ce n'est pas une donnee qu'on suppose, c'est l'unite elle-meme. Pour
 * tout autre jeton, `montantLisible` rend `null`, et l'ecran affiche le compte d'unites brut. Le
 * jour ou `decimals()` sera lu et commite a cote des symboles, cette fonction s'ouvrira ; pas
 * avant.
 */
import { ZERO_ADDRESS } from './garde.mjs'

/** Les decimales de l'ether. Ce n'est pas une lecture : c'est la definition du wei. */
export const DECIMALES_NATIF = 18

/** Vrai pour la monnaie native de la chaine — la seule dont on connaisse les decimales. */
export const estNatif = (monnaie: string): boolean => monnaie.toLowerCase() === ZERO_ADDRESS

/**
 * Le montant en unites du jeton, exact, sans flottant.
 *
 * `null` quand on ne connait pas les decimales : l'appelant affiche alors le brut, et il le dit.
 * Aucun arrondi n'est fait — 1 000 000 000 001 wei rend « 0.000001000000000001 », pas
 * « 0.000001 ». Arrondir un montant qu'on va signer serait une drole d'idee.
 */
export function montantLisible(brut: string, monnaie: string): string | null {
  if (!estNatif(monnaie)) return null
  let v: bigint
  try {
    v = BigInt(brut)
  } catch {
    return null
  }
  const negatif = v < 0n
  if (negatif) v = -v
  const s = v.toString().padStart(DECIMALES_NATIF + 1, '0')
  const entier = s.slice(0, s.length - DECIMALES_NATIF)
  const frac = s.slice(s.length - DECIMALES_NATIF).replace(/0+$/, '')
  return `${negatif ? '-' : ''}${entier}${frac ? `.${frac}` : ''}`
}
