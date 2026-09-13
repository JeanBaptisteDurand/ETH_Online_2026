/**
 * TEMPS 8 — CE QU'ON NE SAIT PAS.
 *
 * C'est la planche qui rend le reste croyable, et c'est pour ça qu'elle est aussi grande que
 * les autres. Un projet qui publie ses trous est un projet qu'on peut contredire — donc un
 * projet qu'on peut croire.
 *
 * Les quatre chiffres viennent de `docs/dataset/summary.json`, par `dataset.totals` : on ne
 * recopie pas « 61 466 » à la main dans une planche qui parle d'honnêteté.
 */
import { Carte, Chiffre, Eyebrow, Sous, Titre, nb } from '../atoms'

interface HonneteteSectionProps {
  mesure: number
  nonCotable: number
  nonMesurable: number
  interpole: number
  attestationsEcrites: number | null
  attestationsCalculees: number | null
}

export function HonneteteSection({
  mesure,
  nonCotable,
  nonMesurable,
  interpole,
  attestationsEcrites,
  attestationsCalculees,
}: HonneteteSectionProps) {
  const pasDesValeurs = nonCotable + nonMesurable
  return (
    <>
      <Eyebrow tone="m-5">published, not hidden</Eyebrow>
      <Titre petit>
        {nb(pasDesValeurs)} of our rows are not values.{' '}
        <span style={{ color: 'var(--m-5)' }}>We keep them anyway.</span>
      </Titre>
      <Sous>A read that fails is NON_MESURABLE — never a zero, never a blank.</Sous>

      <div className="dk-grille dk-g11 dk-fill">
        <div className="dk-grille" style={{ margin: 0, gridTemplateColumns: '1fr 1fr' }}>
          <Chiffre v={nb(mesure)} k="MESURE — real values" ton="m-6" />
          <Chiffre v={nb(nonCotable)} k="NON_COTABLE" ton="m-4" />
          <Chiffre v={nb(nonMesurable)} k="NON_MESURABLE" ton="m-4" />
          <Chiffre v={nb(interpole)} k="INTERPOLE — the label exists and is unused" ton="focus" />
        </div>

        <Carte titre="why we keep them">
          <div style={{ color: 'var(--ink-2)', lineHeight: 1.55 }}>
            A blank reads as “nothing”, and “nothing” reads as “zero”. Every row we could not
            measure keeps <strong style={{ color: 'var(--ink)' }}>its reason</strong> instead.
          </div>
          {attestationsEcrites !== null && attestationsCalculees !== null && (
            <div style={{ color: 'var(--ink-2)', lineHeight: 1.55 }}>
              <strong style={{ color: 'var(--ink)' }}>
                {attestationsEcrites} attestations written on-chain out of {attestationsCalculees}{' '}
                computed.
              </strong>{' '}
              The gap is what we publish — not the flattering number.
            </div>
          )}
          <div style={{ color: 'var(--ink-2)', lineHeight: 1.55, marginTop: 'auto' }}>
            Two past mistakes of this project are published with their correction. That is what
            makes the rest believable.
          </div>
        </Carte>
      </div>
    </>
  )
}
