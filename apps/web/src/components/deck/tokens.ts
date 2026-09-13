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
  { id: 'hero', label: 'the problem', hint: 'a hook can take; nobody publishes how much' },
  { id: 'methode', label: 'the method', hint: 'we replace the hook bytecode, and we quote twice' },
  { id: 'preuve', label: 'the proof', hint: 'door A4: announced = executed, to the wei' },
  { id: 'atlas', label: 'the instrument', hint: 'the app runs inside the slide, with no network' },
  { id: 'mcp', label: 'for agents', hint: '4 MCP tools, 3 free, 1 paid' },
  { id: 'extension', label: 'before the signature', hint: 'two outcomes: a cheaper door, or only one' },
  { id: 'speculos', label: 'on the device', hint: 'EIP-712, screen by screen, cancel returns 4001' },
  { id: 'honnetete', label: 'what we do not know', hint: '61 916 rows that are not values' },
  { id: 'close', label: 'try it', hint: '14 tools · 27 datasets · 5 ways in · the repository' },
]

/** Le chrono du mode présentateur : cinq minutes, comme la source. */
export const TOTAL_MS = 5 * 60 * 1000
