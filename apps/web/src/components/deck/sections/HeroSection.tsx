/**
 * TEMPS 1 — LE PROBLÈME.
 *
 * Porté de `finale/sections/HeroSection.tsx` : bandeau « en direct » en haut, thèse empilée en
 * trois lignes qui se révèlent l'une après l'autre (`ThesisLine`, 0 / 650 / 1300 ms), sous-titre,
 * trio de `ProofRow` à liseré, bandeau de compteurs `CountUp`, double appel à l'action.
 *
 * Ce qui change : les nombres. Les trois viennent du corpus et de `facts.json`, jamais d'ici —
 *   9 hooks sur 1 559 déclarent ce qu'ils prennent (docs/dataset/declarations.json),
 *   0 champ quantitatif sur les 27 du registre (son recensement de champs),
 *   78 des 112 hooks mesurés sont absents du registre (registre-couverture.json).
 */
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { CountUp, Eyebrow, Mono } from '../atoms'

interface HeroSectionProps {
  presenter?: boolean
  /** les trois chiffres, lus par le deck et passés ici — la section n'en invente aucun */
  declarants: number
  hooksRecenses: number
  champsRegistre: number
  champsQuantitatifs: number
  absents: number
  hooksMesures: number
  mesures: number
  bloc: number
  chaine: number
  onVoirLaMethode: () => void
}

export function HeroSection({
  presenter,
  declarants,
  hooksRecenses,
  champsRegistre,
  champsQuantitatifs,
  absents,
  hooksMesures,
  mesures,
  bloc,
  chaine,
  onVoirLaMethode,
}: HeroSectionProps) {
  return (
    <>
      {/* Le bandeau « en direct » de la source, réduit à une ligne : la planche porte déjà son
          en-tête et son pied, il n'y a pas de place pour une seconde barre pleine largeur. */}
      <Eyebrow tone="m-4">
        <span className="dk-pastille" style={{ background: 'var(--m-4)', marginRight: '0.8cqi' }} />
        en direct · ETHOnline 2026 · le prélèvement des hooks v4, sur Base
      </Eyebrow>

      <h1 className="dk-titre" style={{ fontSize: 'max(3.3cqi, 22px)', maxWidth: '34ch' }}>
        <ThesisLine delay={0}>
          Un hook Uniswap v4 peut <span style={{ color: 'var(--m-4)' }}>prélever sur votre swap</span>.
        </ThesisLine>
        <ThesisLine delay={650} subdued>
          Personne ne publie combien.
        </ThesisLine>
        <ThesisLine delay={1300}>
          <span style={{ color: 'var(--m-5)' }}>TARE</span> le mesure, et publie la mesure.
        </ThesisLine>
      </h1>

      <p className="dk-sous">
        Pas une estimation, pas un modèle : le même swap coté deux fois sur un fork épinglé, une
        fois contre le hook, une fois contre un talon inerte. L’écart est ce qu’il prend.
      </p>

      {/* Le trio de preuves, à liseré, comme la source */}
      <div className="dk-grille dk-g3">
        <ProofRow
          tone="m-4"
          label={
            <>
              <CountUp value={declarants} /> / <CountUp value={hooksRecenses} />
            </>
          }
          sub="hooks qui déclarent ce qu’ils prennent"
          note="docs/dataset/declarations.json · 200 000 blocs Base"
        />
        <ProofRow
          tone="focus"
          label={
            <>
              <CountUp value={champsQuantitatifs} /> sur {champsRegistre}
            </>
          }
          sub="champ quantitatif au registre officiel"
          note="son schéma interdit d’en ajouter un"
        />
        <ProofRow
          tone="m-6"
          label={
            <>
              <CountUp value={absents} /> / {hooksMesures}
            </>
          }
          sub="hooks mesurés que le registre ne connaît pas"
          note="docs/dataset/registre-couverture.json"
        />
      </div>

      {/* Le bandeau de compteurs, en ligne — un ticker, pas un tableau de bord */}
      <div className="dk-ticker">
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.7cqi' }}>
          <span className="dk-pastille" />
          <Mono style={{ letterSpacing: '0.14em', color: 'var(--ink-2)' }}>PUBLIÉ</Mono>
        </span>
        <CounterChip label="MESURES" value={mesures} />
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <CounterChip label="BLOC ÉPINGLÉ" value={bloc} />
        <span style={{ color: 'var(--ink-3)' }}>·</span>
        <CounterChip label="CHAÎNE" value={chaine} />
      </div>

      <div className="dk-cta">
        <button type="button" className="dk-prompt" onClick={onVoirLaMethode} style={{ flex: '0 0 auto' }}>
          <span>▶ comment on le mesure</span>
        </button>
        <a className="dk-prompt" href="#/" style={{ flex: '0 0 auto', textDecoration: 'none' }}>
          <span>↗ ouvrir l’instrument</span>
        </a>
        <Mono style={{ color: 'var(--ink-3)', fontSize: 'max(0.98cqi, 10px)', letterSpacing: '0.06em' }}>
          {presenter ? 'mode présentateur · espace ⇢ suivant · f ⇢ plein écran' : 'espace pour avancer · f pour le plein écran'}
        </Mono>
      </div>

      <style>{`
.dk-ticker{display:flex;align-items:center;gap:1.4cqi;padding:0.8cqi 1.2cqi;border:1px solid var(--line);background:var(--surface-1);margin-top:1.3cqi;flex-wrap:wrap;font-family:var(--mono);font-size:max(1.1cqi,11px)}
.dk-cta{display:flex;gap:1cqi;align-items:center;flex-wrap:wrap;margin-top:1.3cqi}
.dk-proof{position:relative;padding:1.2cqi 1.4cqi 1.2cqi 1.7cqi;border:1px solid var(--line);background:var(--surface-1);display:flex;flex-direction:column;gap:0.4cqi;min-width:0}
.dk-proof>.dk-liseret{position:absolute;left:0;top:0;bottom:0;width:3px}
.dk-proof b{font-family:var(--mono);font-weight:500;font-size:max(2.1cqi,17px);letter-spacing:-0.01em;line-height:1.1;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.dk-proof span{font-family:var(--prose);font-size:max(1.2cqi,12px);line-height:1.35;color:var(--ink)}
.dk-proof i{font-family:var(--mono);font-style:normal;font-size:max(0.96cqi,10px);color:var(--ink-2);overflow-wrap:anywhere;line-height:1.4}
@media (max-width:900px){
  .dk-ticker{gap:10px;padding:10px 12px;margin-top:12px}
  .dk-cta{gap:8px;margin-top:12px}
  .dk-proof{padding:12px 14px 12px 16px;gap:5px}
}
`}</style>
    </>
  )
}

interface ThesisLineProps {
  delay: number
  subdued?: boolean
  children: ReactNode
}

function ThesisLine({ delay, subdued, children }: ThesisLineProps) {
  const [visible, setVisible] = useState(delay === 0)
  useEffect(() => {
    if (delay === 0) return
    const id = window.setTimeout(() => setVisible(true), delay)
    return () => window.clearTimeout(id)
  }, [delay])
  return (
    <span
      style={{
        display: 'block',
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(14px)',
        filter: visible ? 'blur(0)' : 'blur(4px)',
        transition:
          'opacity 720ms cubic-bezier(0.2,0.8,0.2,1), transform 720ms cubic-bezier(0.2,0.8,0.2,1), filter 720ms cubic-bezier(0.2,0.8,0.2,1)',
        color: subdued ? 'var(--ink-2)' : 'var(--ink)',
      }}
    >
      {children}
    </span>
  )
}

function ProofRow({
  tone,
  label,
  sub,
  note,
}: {
  tone: 'm-4' | 'm-5' | 'm-6' | 'focus'
  label: ReactNode
  sub: string
  note: string
}) {
  return (
    <div className="dk-proof">
      <span aria-hidden className="dk-liseret" style={{ background: `var(--${tone})` }} />
      <b style={{ color: `var(--${tone})` }}>{label}</b>
      <span>{sub}</span>
      <i>{note}</i>
    </div>
  )
}

function CounterChip({ label, value }: { label: string; value: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '0.6cqi', minWidth: 0 }}>
      <span style={{ color: 'var(--ink-2)', fontSize: 'max(0.96cqi, 10px)', letterSpacing: '0.14em' }}>
        {label}
      </span>
      <span style={{ color: 'var(--m-5)', fontWeight: 500 }}>
        <CountUp value={value} flashOnChange />
      </span>
    </span>
  )
}
