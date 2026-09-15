/**
 * LE BANDEAU DE DISTRIBUTION — ce que prennent les hooks, tous, et pas seulement le pire.
 *
 * Il est en permanence au-dessus du parcours parce que c'est LUI qui porte la these. La mediane
 * est le chiffre de la page : 100 bps, un pour cent de ce qu'on echange, sur 63 156 lignes qui
 * portent un nombre. L'extreme — 9 999,53 bps — existe, il est publie, et il est montre pour ce
 * qu'il est : un point de la queue, a 0,09 % des lignes. Mettre la queue en titre aurait ete le
 * geste que ce projet reproche a tout le monde.
 *
 * LA FORME EST CELLE DE LA MAQUETTE v2 (demo-v2-le-choix) : trois colonnes 300 px · 1fr · 400 px,
 * le chiffre de la page, la bande, les quatre parts en 2x2. Pendant le parcours le bandeau se
 * REPLIE (116 -> 98 px, 480 ms) et recule : la these reste lisible, elle cede la hauteur a ce qui
 * se joue. Quand la garde a lu une porte, un repere blanc la pose sur la bande, a son rang.
 *
 * AUCUN CHIFFRE N'EST ECRIT ICI. Tout vient de ../demo/distribution.ts, qui ne lit que le corpus
 * embarque ; le seuil de comparaison lui-meme est les frais LP du pool de la paire, relus dans sa
 * ligne. src/lib/demo.test.ts le verifie.
 *
 * LA BANDE. Les 63 156 lignes sont rangees par ce que leur hook prend, de la moins chere a la plus
 * chere, et posees sur toute la largeur : l'abscisse est donc une PART DE LIGNES, jamais une
 * echelle de bps deguisee. La couleur est celle de la rampe du site (src/lib/ramp.ts). Les trois
 * filets marquent la mediane, le 90e et le 99e centile, aux memes rangs. Une bande dont les
 * segments seraient a largeur egale mentirait sur la forme ; ceux-ci sont proportionnels.
 */
import { groupDigits } from '../lib/format'
import type { Distribution } from '../demo/distribution'
import { MOITIE_EN_BPS, POURCENT_EN_BPS } from '../demo/distribution'

/** Un nombre de bps, ecrit comme le site ecrit les nombres : la partie entiere groupee. */
export function bpsTexte(bps: number, decimales?: number): string {
  const s = decimales === undefined ? String(bps) : bps.toFixed(decimales)
  const [entier, reste] = s.split('.')
  const signe = entier!.startsWith('-') ? '-' : ''
  const chiffres = signe ? entier!.slice(1) : entier!
  return `${signe}${groupDigits(chiffres)}${reste === undefined ? '' : `.${reste}`}`
}

/** Une part, en pour cent, avec deux decimales — jamais arrondie a l'entier. */
export const partTexte = (p: number): string => `${(p * 100).toFixed(2)} %`

/** Une des quatre parts : le chiffre au-dessus, ce qu'il compte dessous. */
function Part({ valeur, suite, quoi }: { valeur: string; suite?: string; quoi: React.ReactNode }) {
  return (
    <span className="demo-part">
      <span className="demo-part-valeur">
        {valeur}
        {suite && <span className="demo-part-suite"> {suite}</span>}
      </span>
      {quoi}
    </span>
  )
}

export function BandeDistribution({
  d,
  fraisDuPool,
  surQueue,
  queueOuverte,
  replie,
  porte,
}: {
  d: Distribution
  /** les frais LP du pool de la paire, en bps : le point de comparaison le plus honnete */
  fraisDuPool: number | null
  surQueue: () => void
  queueOuverte: boolean
  /** vrai pendant le parcours : le bandeau se replie et recule */
  replie: boolean
  /** la porte que la garde vient de lire — posee sur la bande a son rang. null avant le clic. */
  porte: { bps: number } | null
}) {
  const auDessusDesFrais = fraisDuPool === null ? null : d.auDessusDe(fraisDuPool)
  const auDessusDunPourCent = d.auDessusDe(POURCENT_EN_BPS)
  // LA QUEUE, nommee par une UNITE et non par un chiffre rond : « plus de la moitie de ce que tu
  // echanges ». C'est la que vit le maximum du corpus, et c'est la qu'il doit se lire.
  const queue = d.auDessusDe(MOITIE_EN_BPS)
  // Le RANG de la porte lue : la part des lignes qui prennent au plus autant qu'elle.
  const rangPorte = porte === null ? null : 1 - d.auDessusDe(porte.bps).part

  /** Les filets : la mediane, le 90e et le 99e centile, poses a leur propre rang. */
  const reperes: { part: number; quoi: string; valeur: number }[] = [
    { part: 0.5, quoi: 'median', valeur: d.mediane },
    { part: 0.9, quoi: 'p90', valeur: d.p90 },
    { part: 0.99, quoi: 'p99', valeur: d.p99 },
  ]

  return (
    <section
      aria-label="what the measured hooks take, across the whole corpus"
      className={`demo-bande${replie ? ' demo-bande-replie demo-recule' : ''}`}
    >
      {/* ------------------------------------------------------ le chiffre de la page */}
      <div className="demo-bande-mediane">
        <span className="demo-bande-libelle">the median hook takes</span>
        <span className="demo-bande-chiffre">
          {bpsTexte(d.mediane, 2)} <span className="demo-bande-unite">bps</span>
        </span>
        <span className="demo-bande-glose">
          {(d.mediane / POURCENT_EN_BPS).toFixed(2)} % of what you swap
          {fraisDuPool !== null && <> · this pool’s LP fee is {bpsTexte(fraisDuPool)} bps</>}
        </span>
      </div>

      {/* ------------------------------------------------------------------ la bande */}
      <div className="demo-bande-rangs">
        <div className="demo-bande-barre">
          <svg
            viewBox="0 0 1000 30"
            preserveAspectRatio="none"
            role="img"
            aria-label={`the ${d.n} measured rows, sorted by what the hook takes: median ${d.mediane} bps, 90th percentile ${d.p90} bps, 99th percentile ${d.p99} bps, maximum ${d.max} bps`}
          >
            {d.tranches.map((t, i) => {
              const x0 = (i === 0 ? 0 : d.tranches[i - 1]!.cumul) * 1000
              const w = t.part * 1000
              if (w <= 0) return null
              return (
                <rect
                  key={t.palier}
                  className="demo-tranche"
                  style={{ animationDelay: `${i * 110}ms` }}
                  x={x0}
                  y={0}
                  width={w}
                  height={30}
                  fill={`var(--m-${t.palier})`}
                >
                  <title>{`${t.domain} bps — ${groupDigits(String(t.n))} rows, ${partTexte(t.part)}`}</title>
                </rect>
              )
            })}
            {reperes.map((r) => (
              <rect key={r.quoi} x={r.part * 1000 - 1} y={0} width={2} height={30} fill="var(--bg)">
                <title>{`${r.quoi} — ${r.valeur} bps`}</title>
              </rect>
            ))}
          </svg>
          <span className="demo-bande-balayage" aria-hidden="true" />
          {rangPorte !== null && (
            <span className="demo-bande-porte" style={{ left: `${rangPorte * 100}%` }} aria-hidden="true" />
          )}
        </div>
        <div className="demo-bande-echelle">
          {rangPorte === null ? (
            <span style={{ left: 0 }}>min {bpsTexte(d.min)}</span>
          ) : (
            <span className="demo-bande-echelle-porte" style={{ left: `${rangPorte * 100}%` }}>
              ▲ your gate {bpsTexte(porte!.bps)}
            </span>
          )}
          <span className="demo-bande-echelle-mediane">median {bpsTexte(d.mediane, 2)}</span>
          <span className="demo-bande-echelle-droite">
            <span title={`rules at the median, the 90th (${d.p90} bps) and the 99th (${d.p99} bps) percentile`}>
              p90 {bpsTexte(d.p90)} · p99 {bpsTexte(d.p99)}
            </span>
            <button
              type="button"
              onClick={surQueue}
              className={`demo-bande-queue${queueOuverte ? ' demo-bande-queue-ouverte' : ''}`}
            >
              {queueOuverte ? 'close the tail' : 'see the tail'}
            </button>
          </span>
        </div>
        <span className="demo-bande-note">
          {groupDigits(String(d.n))} rows carry a number · {groupDigits(String(d.nSansNombre))} carry none:
          not counted, not called zero. The highest, {bpsTexte(d.max, 2)} bps, is one row of{' '}
          {groupDigits(String(d.nLignes))}. We publish those too.
        </span>
      </div>

      {/* --------------------------------------------------------------- les parts */}
      <div className="demo-bande-parts">
        {auDessusDesFrais === null ? (
          <span className="demo-part">the LP fee of the pair’s pool was not read: no comparison is drawn</span>
        ) : (
          <Part valeur={partTexte(auDessusDesFrais.part)} quoi={<>take more than {bpsTexte(fraisDuPool!)} bps</>} />
        )}
        <Part
          valeur={partTexte(auDessusDunPourCent.part)}
          quoi={<>take more than {bpsTexte(POURCENT_EN_BPS)} bps</>}
        />
        <Part
          valeur={partTexte(d.zero.part)}
          quoi={
            <>
              take nothing
              {d.negatives.n > 0 && (
                <span title="a hook can give back: these rows return more than the pool without it">
                  {' '}
                  · {groupDigits(String(d.negatives.n))} below
                </span>
              )}
            </>
          }
        />
        <Part
          valeur={`${groupDigits(String(queue.n))} rows`}
          suite={`/ ${groupDigits(String(d.n))}`}
          quoi={<>take more than half of what you swap</>}
        />
      </div>
    </section>
  )
}
