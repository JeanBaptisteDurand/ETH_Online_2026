/**
 * LE BANDEAU DE DISTRIBUTION — ce que prennent les hooks, tous, et pas seulement le pire.
 *
 * Il est en permanence au-dessus des deux actes parce que c'est LUI qui porte la these. La
 * mediane est le chiffre de la page : 100 bps, un pour cent de ce qu'on echange, sur 63 156
 * lignes qui portent un nombre. L'extreme — 9 999,53 bps — existe, il est publie, et il est
 * montre pour ce qu'il est : un point de la queue, a 0,09 % des lignes. Mettre la queue en
 * titre aurait ete le geste que ce projet reproche a tout le monde.
 *
 * AUCUN CHIFFRE N'EST ECRIT ICI. Tout vient de ../demo/distribution.ts, qui ne lit que le
 * corpus embarque ; le seuil de comparaison lui-meme est les frais LP du pool de l'acte 1,
 * relus dans sa ligne. src/lib/demo.test.ts le verifie.
 *
 * LA BANDE. Les 63 156 lignes sont rangees par ce que leur hook prend, de la moins chere a la
 * plus chere, et posees sur toute la largeur : l'abscisse est donc une PART DE LIGNES, jamais
 * une echelle de bps deguisee. La couleur est celle de la rampe du site (src/lib/ramp.ts) —
 * sept paliers logarithmiques, les memes qui colorent le tableau de l'instrument. Les trois
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

function Chiffre({
  valeur,
  quoi,
  glose,
  fort = false,
}: {
  valeur: string
  quoi: string
  glose: React.ReactNode
  fort?: boolean
}) {
  // LE CHIFFRE DE LA PAGE EST EMPILE, pas mis a cote de son libelle : dans une colonne de
  // trois cents pixels, « 100.00 bps » en taille metrique ne laisse plus rien a sa droite, et
  // la glose tombait en colonne d'un caractere. Mesure faite : le bandeau passait de 120 a
  // 208 px de haut, et poussait les etapes sous le pli.
  return (
    <div className={fort ? 'flex flex-col' : 'flex items-baseline gap-[9px]'} style={{ minWidth: 0 }}>
      <span
        className={fort ? 't-metric' : 't-data'}
        style={{ color: fort ? 'var(--m-4)' : 'var(--ink)', flex: 'none', lineHeight: 1.05 }}
      >
        {valeur}
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink-2)', minWidth: 0, lineHeight: 1.35 }}>
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>
          {quoi}
        </span>
        {' · '}
        {glose}
      </span>
    </div>
  )
}

export function BandeDistribution({
  d,
  /** les frais LP du pool de l'acte 1, en bps : le point de comparaison le plus honnete */
  fraisDuPool,
  surQueue,
  queueOuverte,
}: {
  d: Distribution
  fraisDuPool: number | null
  surQueue: () => void
  queueOuverte: boolean
}) {
  const auDessusDesFrais = fraisDuPool === null ? null : d.auDessusDe(fraisDuPool)
  const auDessusDunPourCent = d.auDessusDe(POURCENT_EN_BPS)
  // LA QUEUE, nommee par une UNITE et non par un chiffre rond : « plus de la moitie de ce que
  // tu echanges ». C'est la que vit le maximum du corpus, et c'est la qu'il doit se lire.
  const queue = d.auDessusDe(MOITIE_EN_BPS)

  /** Les filets : la mediane, le 90e et le 99e centile, poses a leur propre rang. */
  const reperes: { part: number; quoi: string; valeur: number }[] = [
    { part: 0.5, quoi: 'median', valeur: d.mediane },
    { part: 0.9, quoi: 'p90', valeur: d.p90 },
    { part: 0.99, quoi: 'p99', valeur: d.p99 },
  ]

  return (
    <section
      aria-label="what the measured hooks take, across the whole corpus"
      className="demo-bande"
      style={{ border: '1px solid var(--line)', background: 'var(--bg-1)' }}
    >
      {/* ------------------------------------------------------ le chiffre de la page */}
      <div className="flex flex-col gap-[4px] px-[12px] py-[5px]" style={{ minWidth: 0 }}>
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>
          what a measured hook takes
        </span>
        <Chiffre
          fort
          valeur={`${bpsTexte(d.mediane, 2)} bps`}
          quoi="median"
          glose={<>{(d.mediane / POURCENT_EN_BPS).toFixed(2)} % of what you swap</>}
        />
        <span className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.35 }}>
          {groupDigits(String(d.n))} rows carry a number · {groupDigits(String(d.nSansNombre))} carry
          none: not counted, not called zero.
        </span>
      </div>

      {/* --------------------------------------------------------------- les parts */}
      <div className="flex flex-col gap-[4px] px-[12px] py-[5px]" style={{ borderLeft: '1px solid var(--line)', minWidth: 0 }}>
        {auDessusDesFrais === null ? (
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            the LP fee of the act 1 pool was not read: no comparison is drawn
          </span>
        ) : (
          <Chiffre
            valeur={partTexte(auDessusDesFrais.part)}
            quoi={`take more than ${bpsTexte(fraisDuPool!)} bps`}
            glose={<>the LP fee this pool already charges</>}
          />
        )}
        <Chiffre
          valeur={partTexte(auDessusDunPourCent.part)}
          quoi={`take more than ${bpsTexte(POURCENT_EN_BPS)} bps`}
          glose={<>one percent · {groupDigits(String(auDessusDunPourCent.n))} rows</>}
        />
        <Chiffre
          valeur={partTexte(d.zero.part)}
          quoi="take nothing at all"
          glose={
            <>
              {groupDigits(String(d.zero.n))} at zero
              {d.negatives.n > 0 && <>, {groupDigits(String(d.negatives.n))} below — a hook can give back</>}
            </>
          }
        />
      </div>

      {/* ------------------------------------------------------------------ la bande */}
      <div className="flex flex-col gap-[4px] px-[12px] py-[5px]" style={{ borderLeft: '1px solid var(--line)', minWidth: 0 }}>
        <svg
          viewBox="0 0 1000 26"
          preserveAspectRatio="none"
          role="img"
          aria-label={`the ${d.n} measured rows, sorted by what the hook takes: median ${d.mediane} bps, 90th percentile ${d.p90} bps, 99th percentile ${d.p99} bps, maximum ${d.max} bps`}
          style={{ width: '100%', height: 26, display: 'block' }}
        >
          {d.tranches.map((t, i) => {
            const x0 = (i === 0 ? 0 : d.tranches[i - 1]!.cumul) * 1000
            const w = t.part * 1000
            if (w <= 0) return null
            return (
              <rect key={t.palier} x={x0} y={0} width={w} height={26} fill={`var(--m-${t.palier})`}>
                <title>{`${t.domain} bps — ${groupDigits(String(t.n))} rows, ${partTexte(t.part)}`}</title>
              </rect>
            )
          })}
          {reperes.map((r) => (
            <rect key={r.quoi} x={r.part * 1000 - 1} y={0} width={2} height={26} fill="var(--bg)">
              <title>{`${r.quoi} — ${r.valeur} bps`}</title>
            </rect>
          ))}
        </svg>
        <div className="flex items-baseline justify-between gap-[8px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
          <span>min {bpsTexte(d.min)}</span>
          <span title={`rules at the median, the 90th (${d.p90} bps) and the 99th (${d.p99} bps) percentile`}>
            rules: median · p90 · p99
          </span>
          <span style={{ textAlign: 'right' }}>max {bpsTexte(d.max, 2)}</span>
        </div>
      </div>

      {/* ------------------------------------------------------------------ la queue */}
      <div className="flex flex-col gap-[4px] px-[12px] py-[5px]" style={{ borderLeft: '1px solid var(--line)', minWidth: 0 }}>
        <div className="flex flex-wrap items-baseline gap-[8px]">
          <span className="t-data-xs" style={{ color: 'var(--ink-2)', minWidth: 0, lineHeight: 1.4 }}>
            the tail: {groupDigits(String(queue.n))} rows ({partTexte(queue.part)}) take more than half of
            what you swap. The highest, {bpsTexte(d.max, 2)} bps, is one row of{' '}
            {groupDigits(String(d.nLignes))}. We publish those too.
          </span>
          <button
            type="button"
            onClick={surQueue}
            className="t-label"
            style={{
              padding: '4px 9px',
              border: `1px solid ${queueOuverte ? 'var(--m-4)' : 'var(--line)'}`,
              background: queueOuverte ? 'var(--bg-3)' : 'transparent',
              color: 'var(--ink)',
              cursor: 'pointer',
              marginLeft: 'auto',
            }}
          >
            {queueOuverte ? 'close the tail' : 'see the tail'}
          </button>
        </div>
      </div>
    </section>
  )
}
