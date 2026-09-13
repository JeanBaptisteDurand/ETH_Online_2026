/**
 * LES JETONS DE MOUVEMENT ET LA LISTE DES TEMPS.
 *
 * Porté ligne à ligne de `finale/tokens.ts` du deck étudié : mêmes noms, mêmes valeurs, même
 * rôle. Ce qui change est le CONTENU de `BEATS` — neuf temps au lieu de onze — et rien d'autre.
 *
 * Les trois durées du chat MCP ne sont pas ici mais dans la section qui les utilise, exactement
 * comme dans la source : 140 ms avant l'appel d'outil, 320 ms avant la réponse, puis la frappe
 * caractère par caractère.
 */

export const MOTION = {
  stagger: 110,
  countUpMs: 800,
  hashTypeMs: 400,
  panelSlideMs: 240,
  badgeFlashMs: 600,
  cascadeStepMs: 800,
  pageFadeMs: 300,
  hardCapMs: 1000,
} as const

export const EASE = {
  signal: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
  precise: 'cubic-bezier(0.4, 0, 0.2, 1)',
} as const

/**
 * LES NEUF TEMPS, dans l'ordre où on les raconte.
 *
 * `id` sert d'ancre (`#deck-hero`), `label` s'affiche dans le bandeau présentateur, `hint` est
 * la phrase que le présentateur se dit à lui-même avant de parler.
 */
export const BEATS: ReadonlyArray<{ id: string; label: string; hint: string }> = [
  { id: 'hero', label: 'le problème', hint: 'un hook peut prélever ; personne ne publie combien' },
  { id: 'methode', label: 'la méthode', hint: 'on remplace le bytecode du hook, et on cote deux fois' },
  { id: 'preuve', label: 'la preuve', hint: 'la porte A4 : annoncé = exécuté, au wei près' },
  { id: 'atlas', label: "l'instrument", hint: "l'app tourne dans la planche, sans réseau" },
  { id: 'mcp', label: 'pour les agents', hint: '4 outils MCP, 3 gratuits, 1 payant' },
  { id: 'extension', label: 'avant la signature', hint: 'deux issues : une porte moins chère, ou une seule' },
  { id: 'speculos', label: "sur l'appareil", hint: 'EIP-712, écran par écran, annuler rend 4001' },
  { id: 'honnetete', label: "ce qu'on ne sait pas", hint: '61 916 lignes qui ne sont pas des valeurs' },
  { id: 'close', label: 'essayez', hint: '14 outils · 27 jeux · 5 accès · le dépôt' },
]

/** Le chrono du mode présentateur : cinq minutes, comme la source. */
export const TOTAL_MS = 5 * 60 * 1000
