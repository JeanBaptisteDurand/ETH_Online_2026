import { useEffect, useMemo, useRef, useState } from 'react'
import type { Series } from '../lib/dataset'
import { palierOf } from '../lib/ramp'
import { groupDigits, powerOfTen } from '../lib/format'

// Canvas nu. Aucune bibliotheque de graphes, aucune spline, aucune animation de valeur.
//
// Regles non negociables (charte §4.9) :
//   - axe X LOGARITHMIQUE ;
//   - axe Y ancre a 0 par defaut ; le zoom existe mais porte l'etiquette ZOOM · Y NON ANCRE ;
//   - les points restent des points (r = 3 px, pleins), jamais lisses ;
//   - la serie de reference — le stub — est TOUJOURS grise : le contrefactuel n'a pas de grandeur.
//
// Une courbe qui exagere est un mensonge, et c'est exactement ce que ce produit denonce.

type Pt = { sx: number; sy: number; bps: number; amountIn: string; poolId: string; zfo: boolean; rowId: number }

const PAD = { l: 54, r: 18, t: 18, b: 40 }

function cssVars(el: HTMLElement, names: string[]): Record<string, string> {
  const cs = getComputedStyle(el)
  const out: Record<string, string> = {}
  for (const n of names) out[n] = cs.getPropertyValue(n).trim()
  return out
}

export function Curve({
  series,
  theme,
  onPick,
}: {
  series: Series[]
  theme: string
  onPick?: (rowId: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ptsRef = useRef<Pt[]>([])
  const [zoom, setZoom] = useState(false)
  const [hover, setHover] = useState<Pt | null>(null)
  const [size, setSize] = useState({ w: 900, h: 320 })

  const flat = useMemo(() => series.flatMap((s) => s.points.map((p) => ({ ...p, s }))), [series])

  const domain = useMemo(() => {
    if (flat.length === 0) return null
    const xs = flat.map((p) => p.x)
    const ys = flat.map((p) => p.bps)
    const x0 = Math.min(...xs)
    const x1 = Math.max(...xs)
    const yMax = Math.max(...ys)
    const yMin = Math.min(...ys)
    return { x0, x1, yMax, yMin }
  }, [flat])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: Math.max(260, Math.min(380, Math.round(el.clientWidth * 0.34))) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cv = canvasRef.current
    const root = document.documentElement
    if (!cv || !domain) return
    const c = cssVars(root, [
      '--ink', '--ink-2', '--ink-3', '--ink-4', '--line', '--bg-1', '--baseline',
      '--m-0', '--m-1', '--m-2', '--m-3', '--m-4', '--m-5', '--m-6',
    ])
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const { w, h } = size
    cv.width = Math.round(w * dpr)
    cv.height = Math.round(h * dpr)
    cv.style.width = `${w}px`
    cv.style.height = `${h}px`
    const ctx = cv.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, w, h)

    const plotW = w - PAD.l - PAD.r
    const plotH = h - PAD.t - PAD.b

    // --- echelle X : logarithmique, bornee aux decades entieres qui encadrent les donnees
    const lo = Math.floor(Math.log10(domain.x0)) - 0.35
    const hi = Math.ceil(Math.log10(domain.x1)) + 0.35
    const sx = (x: number) => PAD.l + ((Math.log10(x) - lo) / (hi - lo)) * plotW

    // --- echelle Y : ancree a 0 sauf zoom explicite
    const yTop = zoom ? domain.yMax + (domain.yMax - domain.yMin) * 0.12 + 0.01 : domain.yMax * 1.1 || 1
    const yBot = zoom ? Math.max(0, domain.yMin - (domain.yMax - domain.yMin) * 0.12 - 0.01) : 0
    const sy = (v: number) => PAD.t + plotH - ((v - yBot) / (yTop - yBot || 1)) * plotH

    ctx.font = '10px ' + (getComputedStyle(root).getPropertyValue('--mono') || 'monospace')
    ctx.textBaseline = 'middle'

    // --- grille Y + graduations
    const yTicks = 5
    // Meme nombre de decimales sur toute l'echelle : deux graduations formatees differemment
    // se lisent comme deux grandeurs differentes.
    const yDec = yTop - yBot >= 10 ? 0 : 2
    ctx.strokeStyle = c['--line']
    ctx.fillStyle = c['--ink-2']
    ctx.lineWidth = 1
    for (let i = 0; i <= yTicks; i++) {
      const v = yBot + ((yTop - yBot) * i) / yTicks
      const y = Math.round(sy(v)) + 0.5
      ctx.beginPath()
      ctx.moveTo(PAD.l, y)
      ctx.lineTo(w - PAD.r, y)
      ctx.stroke()
      ctx.textAlign = 'right'
      ctx.fillText(v.toFixed(yDec), PAD.l - 8, y)
    }

    // --- graduations X : une par decade, en 10^n
    ctx.textAlign = 'center'
    for (let d = Math.ceil(lo); d <= Math.floor(hi); d++) {
      const x = Math.round(sx(10 ** d)) + 0.5
      ctx.strokeStyle = c['--line']
      ctx.beginPath()
      ctx.moveTo(x, PAD.t)
      ctx.lineTo(x, PAD.t + plotH)
      ctx.stroke()
      // Le trait de graduation reste discret, son ETIQUETTE non : elle porte l'echelle
      // logarithmique, donc la lecture du graphe. `--ink-4` y donnait 2,2:1.
      ctx.fillStyle = c['--ink-2']
      ctx.fillText(`1e${d}`, x, PAD.t + plotH + 14)
    }
    ctx.fillStyle = c['--ink-2']
    ctx.fillText('taille du swap, unites du jeton entrant — echelle LOGARITHMIQUE', PAD.l + plotW / 2, h - 10)

    // --- axes
    ctx.strokeStyle = c['--ink-4']
    ctx.beginPath()
    ctx.moveTo(PAD.l + 0.5, PAD.t)
    ctx.lineTo(PAD.l + 0.5, PAD.t + plotH + 0.5)
    ctx.lineTo(w - PAD.r, PAD.t + plotH + 0.5)
    ctx.stroke()

    // --- la serie de reference : le stub. 0 bps par construction. TOUJOURS grise.
    if (yBot <= 0) {
      const y0 = Math.round(sy(0)) + 0.5
      ctx.strokeStyle = c['--baseline']
      ctx.setLineDash([4, 4])
      ctx.beginPath()
      ctx.moveTo(PAD.l, y0)
      ctx.lineTo(w - PAD.r, y0)
      ctx.stroke()
      ctx.setLineDash([])
      // Le trait reste en `--baseline` : c'est lui qui DIT « serie de reference ». Son
      // libelle, lui, doit se lire — 4,04:1 echouait en AA.
      // Le libelle est pose sur le nuage le plus dense du graphe, qui le traverse : un fond
      // plein le detache sans ajouter de couleur. Le contraste ne sert a rien si le texte
      // est illisible pour une autre raison.
      const legende = 'sans hook, talon inerte, 0 bps par construction'
      ctx.textAlign = 'left'
      const lw = ctx.measureText(legende).width
      ctx.fillStyle = c['--bg-1']
      ctx.fillRect(PAD.l + 3, y0 - 20, lw + 6, 15)
      ctx.fillStyle = c['--ink-2']
      ctx.fillText(legende, PAD.l + 6, y0 - 9)
    }

    // --- les series mesurees : segments fins, aucun lissage
    const pts: Pt[] = []
    for (const s of series) {
      if (s.points.length === 0) continue
      if (s.points.length > 1) {
        // Opacite faible : la ou plusieurs series se superposent, le trait devient plus dense.
        // La densite est une information reelle ; deplacer un point pour le rendre visible
        // (jitter) en serait une fausse. On ne deplace rien.
        ctx.globalAlpha = 0.45
        ctx.strokeStyle = c['--ink-4']
        ctx.lineWidth = 1
        ctx.beginPath()
        s.points.forEach((p, i) => {
          const X = sx(p.x)
          const Y = sy(p.bps)
          if (i === 0) ctx.moveTo(X, Y)
          else ctx.lineTo(X, Y)
        })
        ctx.stroke()
        ctx.globalAlpha = 1
      }
      for (const p of s.points) {
        const X = sx(p.x)
        const Y = sy(p.bps)
        pts.push({ sx: X, sy: Y, bps: p.bps, amountIn: p.amountIn, poolId: s.poolId, zfo: s.zeroForOne, rowId: p.rowId })
      }
    }

    // points dessines apres les traits, r = 3 px, pleins, couleur = palier de la rampe
    ctx.globalAlpha = 0.8
    for (const p of pts) {
      const pal = palierOf(p.bps) ?? 0
      ctx.fillStyle = c[`--m-${pal}`]
      ctx.beginPath()
      ctx.arc(p.sx, p.sy, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1

    // reticule du point survole
    if (hover) {
      ctx.strokeStyle = c['--ink-3']
      ctx.setLineDash([2, 3])
      ctx.beginPath()
      ctx.moveTo(hover.sx + 0.5, PAD.t)
      ctx.lineTo(hover.sx + 0.5, PAD.t + plotH)
      ctx.moveTo(PAD.l, hover.sy + 0.5)
      ctx.lineTo(w - PAD.r, hover.sy + 0.5)
      ctx.stroke()
      ctx.setLineDash([])
      ctx.strokeStyle = c['--ink']
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(hover.sx, hover.sy, 5.5, 0, Math.PI * 2)
      ctx.stroke()
    }

    // etiquette Y
    ctx.save()
    ctx.translate(13, PAD.t + plotH / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.textAlign = 'center'
    ctx.fillStyle = c['--ink-2']
    ctx.fillText('bps preleves', 0, 0)
    ctx.restore()

    ptsRef.current = pts
  }, [series, domain, size, zoom, hover, theme])

  if (!domain) {
    return (
      <div className="p-[16px] t-data-sm" style={{ color: 'var(--ink-2)' }}>
        Aucun point cotable pour ce hook. Une lecture bornee est un NON_MESURABLE, jamais une valeur.
      </div>
    )
  }

  const nSizes = new Set(flat.map((p) => p.amountIn)).size

  return (
    <div className="flex flex-col">
      <div
        className="flex flex-wrap items-center gap-[12px] px-[16px] py-[8px]"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <span className="t-label" style={{ color: zoom ? 'var(--ink)' : 'var(--ink-2)' }}>
          {zoom ? 'zoom — y non ancré' : 'y ancré à 0'}
        </span>
        <button
          type="button"
          className="t-label px-[6px] py-[2px] cursor-pointer"
          onClick={() => setZoom((z) => !z)}
          style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-2)', color: 'var(--ink-2)' }}
        >
          {zoom ? 'ancrer Y a 0' : 'zoomer Y'}
        </button>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {series.length} series (pool × sens) · {flat.length} points · {nSizes} tailles distinctes
          {nSizes < 5 && ` · le profil vise 5 tailles, ce jeu de donnees en contient ${nSizes}`}
        </span>
        <span className="ml-auto t-data-xs flex items-center gap-[6px]" style={{ color: 'var(--ink-2)' }}>
          <span style={{ display: 'inline-block', width: 14, height: 2, background: 'var(--baseline)' }} />
          sans hook
          <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--m-4)', marginLeft: 8 }} />
          avec hook
        </span>
      </div>

      <div ref={wrapRef} className="relative w-full">
        <canvas
          ref={canvasRef}
          className="block w-full"
          onMouseLeave={() => setHover(null)}
          onMouseMove={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            const mx = e.clientX - r.left
            const my = e.clientY - r.top
            let best: Pt | null = null
            let bd = 24 * 24
            for (const p of ptsRef.current) {
              const d = (p.sx - mx) ** 2 + (p.sy - my) ** 2
              if (d < bd) {
                bd = d
                best = p
              }
            }
            setHover(best)
          }}
          onClick={() => hover && onPick?.(hover.rowId)}
        />
      </div>

      <div
        className="t-data-sm hex px-[16px] py-[8px] flex flex-wrap gap-x-[20px] gap-y-[2px]"
        style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)', minHeight: 34 }}
      >
        {hover ? (
          <>
            <span style={{ color: 'var(--ink)' }}>{hover.bps.toFixed(2)} bps</span>
            <span>
              taille {powerOfTen(hover.amountIn) ?? groupDigits(hover.amountIn)} unites
            </span>
            <span>sens {hover.zfo ? 'currency0 → currency1' : 'currency1 → currency0'}</span>
            <span>pool {hover.poolId.slice(0, 10)}…</span>
            <span style={{ color: 'var(--ink-2)' }}>cliquer : ouvrir la ligne et sa commande de rejeu</span>
          </>
        ) : (
          <span>survoler un point pour lire sa valeur, sa taille, son sens et son pool</span>
        )}
      </div>
    </div>
  )
}
