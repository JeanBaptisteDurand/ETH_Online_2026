/**
 * LA FIGURE APPARIEE — la meme grandeur mesuree deux fois, et l'ecart a cote.
 *
 * Deux series dans les MEMES axes : celle qu'on regarde en encre pleine, celle de reference
 * en gris. Jamais en `accent` : l'orange dit deja « famille action » dans la legende du meme
 * ecran, et une couleur ne peut pas porter deux sens sur une page.
 *
 * Les barres sont PROPORTIONNELLES a la grandeur mesuree, pas decoratives : deux barres de
 * meme longueur pour deux valeurs differentes seraient un mensonge de nuancier. Quand une
 * valeur manque, la barre n'existe pas et le texte le dit — jamais une barre a zero.
 *
 * ELLE N'EST PAS UN SINGLETON. La hero de `#/` en porte une, figee : la porte A4, un swap
 * reellement execute, cote avec son hook puis contre un talon de 89 octets. Celle-ci porte
 * ce que l'utilisateur a demande. Deux objets, deux echelles : `display` pour l'ecart de la
 * hero et de la page de l'outil 1, `metric` pour celui d'une reponse, une fois par ecran.
 */
import type { ReactNode } from 'react'

export interface Serie {
  /** ce que la serie est, en toutes lettres */
  libelle: string
  /** la valeur mesuree, dans l'unite de l'axe. null = pas mesuree, et la barre disparait. */
  valeur: number | null
  /** la valeur telle qu'on l'ecrit */
  texte: ReactNode
  /** d'ou elle vient : pool, hook, bloc */
  provenance?: ReactNode
  /** la serie de reference se tient en gris */
  reference?: boolean
}

const NUANCIER = { width: 24, height: 8, display: 'inline-block' as const }

export function FigureAppariee({
  axe,
  series,
  ecart,
  unite,
  glose,
  taille = 'metric',
  enfants,
}: {
  /** ce que l'axe mesure, en toutes lettres et avec son unite */
  axe: string
  series: [Serie, Serie]
  /** l'ecart entre les deux, ecrit — jamais anime */
  ecart: string
  unite: string
  glose?: ReactNode
  taille?: 'metric' | 'display'
  enfants?: ReactNode
}) {
  const max = Math.max(...series.map((s) => s.valeur ?? 0), 1e-9)
  return (
    <div className="figure flex flex-wrap items-start gap-x-[40px] gap-y-[20px] px-[16px] py-[16px]">
      <div className="grow" style={{ minWidth: 280, flexBasis: 320 }}>
        <p className="t-data-sm m-0 pb-[10px]" style={{ color: 'var(--ink-2)' }}>
          {axe}
        </p>
        <dl className="m-0 grid gap-[12px]">
          {series.map((s) => (
            <div key={s.libelle} className="figure-serie">
              <dt className="t-data-sm m-0 flex items-center gap-[8px]" style={{ color: 'var(--ink-2)' }}>
                <span
                  aria-hidden="true"
                  style={{ ...NUANCIER, background: s.reference ? 'var(--baseline)' : 'var(--ink)' }}
                />
                {s.libelle}
              </dt>
              <dd className="m-0 pt-[5px] flex items-center gap-[10px]" style={{ minWidth: 0 }}>
                <span
                  className="t-data-lg"
                  style={{ color: s.reference ? 'var(--ink-2)' : 'var(--ink)', flexShrink: 0 }}
                >
                  {s.texte}
                </span>
                {/* La barre est PROPORTIONNELLE, et elle cede la place avant le nombre :
                    un chiffre coupe serait un mensonge, une barre raccourcie reste un rapport. */}
                {s.valeur !== null && (
                  // La piste porte l'echelle COMMUNE aux deux series ; la barre porte la
                  // valeur. Sans piste partagee, deux valeurs differentes donnaient deux
                  // barres de meme longueur — un nuancier qui ment.
                  <span aria-hidden="true" style={{ flex: '1 1 80px', maxWidth: 260, minWidth: 0 }}>
                    <span
                      style={{
                        display: 'block',
                        height: 10,
                        width: `${Math.max(0.5, (s.valeur / max) * 100)}%`,
                        background: s.reference ? 'var(--baseline)' : 'var(--ink)',
                      }}
                    />
                  </span>
                )}
              </dd>
              {s.provenance && (
                <dd className="t-data-sm m-0 pt-[3px] hex" style={{ color: 'var(--ink-2)' }}>
                  {s.provenance}
                </dd>
              )}
            </div>
          ))}
        </dl>
      </div>

      <div style={{ minWidth: 200 }}>
        <output className={taille === 'display' ? 't-display' : 't-metric'} style={{ color: 'var(--ink)' }}>
          {ecart}
        </output>
        <p className="t-data-sm m-0 pt-[4px]" style={{ color: 'var(--ink-2)' }}>
          {unite}
        </p>
        {glose && (
          <p
            className="m-0 pt-[10px]"
            style={{ fontFamily: 'var(--prose)', fontSize: 16, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: '34ch' }}
          >
            {glose}
          </p>
        )}
      </div>
      {enfants}
    </div>
  )
}
