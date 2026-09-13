/**
 * LE MODE PRÉSENTATEUR — navigation clavier et chrono.
 *
 * Porté de `finale/presenter.ts` : mêmes touches (espace / ← → = temps suivant et précédent,
 * `f` plein écran, `r` remet le chrono, `p` met en pause), même chrono de 5:00 qui descend, et
 * même API — `beat`, `setBeat`, `next`, `prev`, `reset`, `toggleFullscreen`, `elapsedMs`,
 * `remainingMs`, `running`, `start`, `pause`.
 *
 * LE BUG QU'ON NE COPIE PAS. La source attachait son écoute de `scroll` à `window` et appelait
 * `window.scrollTo`, alors que l'élément qui défile est un CONTENEUR (`overflow-y: auto`). Sur
 * un conteneur, la fenêtre ne défile pas : la navigation clavier ne bougeait rien et le
 * compteur restait figé sur « 01 ».
 *
 * Ici tout passe par le conteneur :
 *   - on va à un temps par `scrollIntoView` sur `[data-finale-beat]`, jamais par `scrollTo` ;
 *   - on SAIT quel temps est à l'écran en écoutant `scroll` SUR LE CONTENEUR, et en prenant la
 *     section dont le haut est le plus proche du haut du conteneur.
 *
 * Le clavier, lui, reste sur `window` : c'est la fenêtre qui reçoit les touches, le conteneur
 * n'a pas le focus. Ce n'était pas le bug.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { TOTAL_MS } from './tokens'

export interface PresenterState {
  beat: number
  setBeat: (n: number) => void
  next: () => void
  prev: () => void
  reset: () => void
  toggleFullscreen: () => void
  elapsedMs: number
  remainingMs: number
  running: boolean
  start: () => void
  pause: () => void
}

const reduit = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

export function usePresenter(
  beatCount: number,
  active: boolean,
  scrollRef: RefObject<HTMLDivElement | null>,
): PresenterState {
  const [beat, setBeatState] = useState(0)
  const [running, setRunning] = useState(false)
  const [now, setNow] = useState(Date.now())
  const startRef = useRef<number | null>(null)
  const accumRef = useRef(0)

  /** Aller à un temps : `scrollIntoView` sur la section, jamais `window.scrollTo`. */
  const setBeat = useCallback(
    (n: number): void => {
      const clamped = Math.max(0, Math.min(beatCount - 1, n))
      setBeatState(clamped)
      const root = scrollRef.current
      if (!root) return
      const sections = root.querySelectorAll<HTMLElement>('[data-finale-beat]')
      const target = sections[clamped]
      if (target) target.scrollIntoView({ behavior: reduit() ? 'auto' : 'smooth', block: 'start' })
    },
    [beatCount, scrollRef],
  )

  const next = useCallback((): void => setBeat(beat + 1), [beat, setBeat])
  const prev = useCallback((): void => setBeat(beat - 1), [beat, setBeat])

  const start = useCallback((): void => {
    if (running) return
    startRef.current = Date.now()
    setRunning(true)
  }, [running])

  const pause = useCallback((): void => {
    if (!running) return
    if (startRef.current !== null) {
      accumRef.current += Date.now() - startRef.current
      startRef.current = null
    }
    setRunning(false)
  }, [running])

  const reset = useCallback((): void => {
    accumRef.current = 0
    startRef.current = running ? Date.now() : null
    setNow(Date.now())
  }, [running])

  const toggleFullscreen = useCallback((): void => {
    if (typeof document === 'undefined') return
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => undefined)
    } else {
      void document.exitFullscreen?.().catch(() => undefined)
    }
  }, [])

  /**
   * QUI EST À L'ÉCRAN — lu sur le CONTENEUR.
   *
   * On prend la section dont le bord haut est le plus proche du bord haut du conteneur. C'est
   * exact avec `scroll-snap`, et ça survit à un défilement à la molette comme à la roulette du
   * trackpad. On écoute toujours, présentateur ou non : les scènes animées ont besoin de savoir
   * qu'elles viennent d'entrer à l'écran.
   */
  useEffect(() => {
    const root = scrollRef.current
    if (!root) return
    let trame = 0
    const lire = (): void => {
      trame = 0
      const sections = root.querySelectorAll<HTMLElement>('[data-finale-beat]')
      if (sections.length === 0) return
      const haut = root.getBoundingClientRect().top
      let meilleur = 0
      let ecart = Infinity
      sections.forEach((s, i) => {
        const d = Math.abs(s.getBoundingClientRect().top - haut)
        if (d < ecart) {
          ecart = d
          meilleur = i
        }
      })
      setBeatState((b) => (b === meilleur ? b : meilleur))
    }
    const sur = (): void => {
      if (trame) return
      trame = window.requestAnimationFrame(lire)
    }
    root.addEventListener('scroll', sur, { passive: true })
    window.addEventListener('resize', sur)
    lire()
    return () => {
      if (trame) window.cancelAnimationFrame(trame)
      root.removeEventListener('scroll', sur)
      window.removeEventListener('resize', sur)
    }
  }, [scrollRef, beatCount])

  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault()
        if (!running) start()
        next()
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') {
        e.preventDefault()
        prev()
      } else if (e.key === 'f' || e.key === 'F') {
        e.preventDefault()
        toggleFullscreen()
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault()
        reset()
      } else if (e.key === 'p' || e.key === 'P') {
        e.preventDefault()
        if (running) pause()
        else start()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, next, prev, toggleFullscreen, reset, running, start, pause])

  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [running])

  const elapsedMs = accumRef.current + (running && startRef.current ? now - startRef.current : 0)
  const remainingMs = Math.max(0, TOTAL_MS - elapsedMs)

  return {
    beat,
    setBeat,
    next,
    prev,
    reset,
    toggleFullscreen,
    elapsedMs,
    remainingMs,
    running,
    start,
    pause,
  }
}

export function fmtChrono(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}
