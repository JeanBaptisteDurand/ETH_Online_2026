/**
 * LES ATOMES DE MOUVEMENT ET DE MISE EN PAGE DE LA PLANCHE.
 *
 * `CountUp` et `HashType` sont portés de `finale/atoms.tsx` : même boucle `requestAnimationFrame`,
 * même sortie cubique, même respect de `prefers-reduced-motion` qui donne la valeur finale d'un
 * coup. `Mono` remplace le `Mono` de `design/atoms.js` de la source — le nôtre ne connaît que
 * nos jetons.
 *
 * `Frappe` est la frappe caractère par caractère du chat MCP. LE BUG QU'ON NE COPIE PAS : la
 * source faisait un `setState` par caractère sur la liste ENTIÈRE des messages, soit ~550 rendus
 * React de tout le transcript pour une seule réponse. Ici l'état de la frappe vit DANS la bulle,
 * et seule la bulle en cours se redessine.
 */
import { useEffect, useRef, useState } from 'react'
import type { CSSProperties, ReactNode } from 'react'
import { EASE, MOTION } from './tokens'

export const reduit = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export const nb = (x: number): string => x.toLocaleString('fr-FR')
export const court = (a: string): string => `${a.slice(0, 10)}…${a.slice(-4)}`

/* ------------------------------------------------------------------ la voix des nombres */

type Ton = 'm-4' | 'm-5' | 'm-6' | 'focus' | 'ink' | 'ink-2'

interface MonoProps {
  children: ReactNode
  color?: Ton
  style?: CSSProperties
  className?: string
}

/** Tout ce qui est une valeur passe par là : JetBrains Mono, jamais la prose. */
export function Mono({ children, color, style, className }: MonoProps) {
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--mono)',
        fontVariantNumeric: 'tabular-nums',
        color: color ? `var(--${color})` : undefined,
        ...style,
      }}
    >
      {children}
    </span>
  )
}

interface CountUpProps {
  value: number
  decimals?: number
  prefix?: string
  suffix?: string
  durationMs?: number
  className?: string
  style?: CSSProperties
  flashOnChange?: boolean
  locale?: string
}

export function CountUp({
  value,
  decimals = 0,
  prefix = '',
  suffix = '',
  durationMs = MOTION.countUpMs,
  className,
  style,
  flashOnChange = false,
  locale = 'fr-FR',
}: CountUpProps) {
  const [shown, setShown] = useState(0)
  const [flash, setFlash] = useState(false)
  const fromRef = useRef(0)
  const targetRef = useRef(value)
  const startRef = useRef<number | null>(null)
  const reducedRef = useRef(reduit())

  useEffect(() => {
    if (reducedRef.current) {
      setShown(value)
      return
    }
    fromRef.current = shown
    targetRef.current = value
    startRef.current = performance.now()
    if (flashOnChange) {
      setFlash(true)
      const t = window.setTimeout(() => setFlash(false), 220)
      return () => window.clearTimeout(t)
    }
    return undefined
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (reducedRef.current) return
    let raf = 0
    const tick = (now: number): void => {
      if (startRef.current === null) startRef.current = now
      const t = Math.min(1, (now - startRef.current) / durationMs)
      // sortie cubique, comme la source
      const eased = 1 - Math.pow(1 - t, 3)
      const next = fromRef.current + (targetRef.current - fromRef.current) * eased
      setShown(next)
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [durationMs, value])

  const formatted = shown.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
  return (
    <span
      className={className}
      style={{
        ...style,
        color: flash ? 'var(--m-6)' : style?.color,
        transition: `color 220ms ${EASE.signal}`,
      }}
    >
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

interface HashTypeProps {
  text: string
  durationMs?: number
  className?: string
  style?: CSSProperties
}

/** Un haché qui s'écrit, avec un curseur qui clignote tant qu'il n'est pas fini. */
export function HashType({ text, durationMs = MOTION.hashTypeMs, className, style }: HashTypeProps) {
  const [shown, setShown] = useState('')
  const reducedRef = useRef(reduit())
  useEffect(() => {
    if (reducedRef.current) {
      setShown(text)
      return
    }
    setShown('')
    let raf = 0
    const start = performance.now()
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / durationMs)
      const len = Math.floor(t * text.length)
      setShown(text.slice(0, len))
      if (t < 1) raf = requestAnimationFrame(step)
      else setShown(text)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [text, durationMs])
  return (
    <span
      className={className}
      style={{ fontFamily: 'var(--mono)', letterSpacing: '0.02em', wordBreak: 'break-all', ...style }}
    >
      {shown}
      <span
        aria-hidden
        className="dk-caret"
        style={{ opacity: shown.length === text.length ? 0 : 1 }}
      />
    </span>
  )
}

/**
 * LA FRAPPE, isolée dans son propre composant.
 *
 * `onFini` rend la main à l'appelant : sans lui, il ne saurait pas quand réactiver ses boutons.
 * La vitesse par défaut est 18 ms par caractère — en dessous du plafond du navigateur (~4 ms)
 * une valeur ne veut plus rien dire : elle promet une vitesse que la machine ne tient pas.
 */
export function Frappe({
  texte,
  vitesse = 18,
  onFini,
}: {
  texte: string
  vitesse?: number
  onFini?: () => void
}) {
  const [n, setN] = useState(() => (reduit() ? texte.length : 0))
  const fini = useRef(false)

  useEffect(() => {
    setN(reduit() ? texte.length : 0)
    fini.current = false
  }, [texte])

  useEffect(() => {
    if (n >= texte.length) {
      if (!fini.current) {
        fini.current = true
        onFini?.()
      }
      return
    }
    const t = window.setTimeout(() => setN((x) => x + 1), vitesse)
    return () => window.clearTimeout(t)
  }, [n, texte, vitesse, onFini])

  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {texte.slice(0, n)}
      {n < texte.length && <span aria-hidden className="dk-caret" />}
    </span>
  )
}

/** Une séquence d'étapes, jouée quand la scène entre à l'écran. */
export function useSequence(
  n: number,
  delais: number[],
  actif: boolean,
): { etape: number; rejouer: () => void } {
  const [etape, setEtape] = useState(() => (reduit() ? n : 0))
  const [tour, setTour] = useState(0)

  useEffect(() => {
    if (!actif || reduit() || etape >= n) return
    const t = window.setTimeout(() => setEtape((e) => e + 1), delais[etape] ?? 700)
    return () => window.clearTimeout(t)
  }, [actif, etape, n, delais, tour])

  return {
    etape,
    rejouer: () => {
      setEtape(0)
      setTour((t) => t + 1)
    },
  }
}

/* ------------------------------------------------------------------ la mise en page */

/** Le filet + la capitale mono qui ouvrent chaque planche. Porté de la source. */
export function Eyebrow({ tone = 'm-5', children }: { tone?: Ton; children: ReactNode }) {
  return (
    <div className="dk-eyebrow">
      <span className="dk-filet" style={{ background: `var(--${tone})` }} />
      <span style={{ color: `var(--${tone})` }}>{children}</span>
    </div>
  )
}

export function Titre({ children, petit }: { children: ReactNode; petit?: boolean }) {
  return <h2 className={petit ? 'dk-titre dk-titre-petit' : 'dk-titre'}>{children}</h2>
}

export function Sous({ children }: { children: ReactNode }) {
  return <p className="dk-sous">{children}</p>
}

/**
 * UN CHIFFRE QUI REMPLIT SA CASE.
 *
 * Le nombre est énorme parce que c'est LUI le message ; les deux lignes en dessous disent ce
 * qu'il compte et d'où il sort. Un deck où le chiffre a la même taille que la légende ne dit
 * rien de loin — et un jury regarde de loin.
 */
export function Chiffre({
  v,
  k,
  source,
  ton = 'm-6',
}: {
  v: ReactNode
  k: string
  source?: string
  ton?: Ton
}) {
  // Un nombre court a droit à toute la place ; un nombre long descend d'un cran plutôt que de
  // déborder de sa case.
  const long = typeof v === 'string' && v.length > 6
  return (
    <div className="dk-stat" style={{ borderTop: `2px solid var(--${ton})` }}>
      <b style={{ color: `var(--${ton})`, fontSize: long ? undefined : 'max(4.6cqi, 28px)' }}>{v}</b>
      <span>{k}</span>
      {source && <i>{source}</i>}
    </div>
  )
}

export function Carte({
  titre,
  children,
  style,
}: {
  titre?: string
  children: ReactNode
  style?: CSSProperties
}) {
  return (
    <div className="dk-carte" style={style}>
      {titre && <div className="dk-carte-titre">{titre}</div>}
      {children}
    </div>
  )
}

/**
 * NOTRE PROPRE APPLICATION, DANS LA PLANCHE.
 *
 * La différence avec une capture est énorme : ce qui bouge dans le cadre EST le produit, avec
 * ses vraies données, et un juge peut le voir répondre. On peut se le permettre sans réserve —
 * l'instrument est statique et porte son corpus, donc l'iframe ne demande RIEN au réseau.
 */
export function Vitre({ route, titre }: { route: string; titre: string }) {
  const base = typeof window === 'undefined' ? '/' : window.location.pathname
  return (
    <div className="dk-vitre">
      <div className="dk-vitre-barre">
        <span className="dk-pastille" style={{ background: 'var(--focus)' }} />
        <span className="dk-label">l’instrument, en vrai — {route}</span>
        <a className="dk-label" href={`#${route}`} style={{ marginLeft: 'auto', color: 'var(--ink-2)' }}>
          ouvrir ↗
        </a>
      </div>
      <iframe src={`${base}#${route}`} title={titre} loading="lazy" />
    </div>
  )
}
