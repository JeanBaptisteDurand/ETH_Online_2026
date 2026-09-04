// La rampe de mesure. Elle encode bps, et uniquement bps (charte §4.1, §4.2).
// inferno tronquee [0,18 ; 0,90], 7 paliers logarithmiques. Aucune autre famille chromatique
// n'existe dans l'instrument : si une surface est coloree, c'est qu'elle porte une grandeur.

export type Palier = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const PALIERS: { palier: Palier; domain: string; hi: number | null }[] = [
  { palier: 0, domain: '0', hi: 0 },
  { palier: 1, domain: ']0 ; 1]', hi: 1 },
  { palier: 2, domain: ']1 ; 10]', hi: 10 },
  { palier: 3, domain: ']10 ; 30]', hi: 30 },
  { palier: 4, domain: ']30 ; 100]', hi: 100 },
  { palier: 5, domain: ']100 ; 300]', hi: 300 },
  { palier: 6, domain: '> 300', hi: null },
]

/** Le palier d'une valeur en bps. `null` (non mesurable / non cotable) n'a pas de palier. */
export function palierOf(bps: number | null | undefined): Palier | null {
  if (bps === null || bps === undefined || Number.isNaN(bps)) return null
  if (bps <= 0) return 0
  if (bps <= 1) return 1
  if (bps <= 10) return 2
  if (bps <= 30) return 3
  if (bps <= 100) return 4
  if (bps <= 300) return 5
  return 6
}

/** Fond de cellule + barre interne gauche a pleine saturation. L'encre ne change jamais. */
export function rampCell(bps: number | null | undefined): React.CSSProperties {
  const p = palierOf(bps)
  if (p === null) return {}
  return {
    background: `color-mix(in srgb, var(--m-${p}) var(--mix), var(--bg-1))`,
    boxShadow: `inset 3px 0 0 var(--m-${p})`,
  }
}

export function rampVar(bps: number | null | undefined): string {
  const p = palierOf(bps)
  return p === null ? 'var(--ink-4)' : `var(--m-${p})`
}
