/**
 * LA COULEUR D'UNE FAMILLE, prise sur ses jetons propres et non sur la rampe de mesure.
 *
 * `lib/outils.ts` porte encore `var(--focus)`, `var(--m-6)` et `var(--m-4)` : la rampe encode
 * les bps et elle s'inverse entre les deux themes, si bien qu'en clair « analyse » et
 * « action » se rapprochent — alors que l'orange, la seule famille qui touche a l'argent de
 * quelqu'un, doit se reperer sans lire. Trois jetons propres tiennent l'ecart dans les deux
 * themes. `lib/` appartient a l'equipier : la correction vit donc ici, du cote des composants,
 * et `Carte.tsx` porte deja la meme table.
 */
import type { Famille } from '../lib/outils'

export const COULEUR: Record<Famille, string> = {
  collecte: 'var(--fam-collecte)',
  analyse: 'var(--fam-analyse)',
  action: 'var(--fam-action)',
}

export const ORDRE: readonly Famille[] = ['collecte', 'analyse', 'action']
