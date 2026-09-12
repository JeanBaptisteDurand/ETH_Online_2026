/**
 * LE FOND DU HERO — une crête par hook, empilées.
 *
 * LA RÉFÉRENCE : le *ridgeline plot*, dit *joyplot*. Le nom vient de la pochette d'Unknown
 * Pleasures (Peter Saville, 1979), qui n'est pas un dessin mais un relevé : les impulsions du
 * pulsar PSR B1919+21, tracées l'une sous l'autre, chaque courbe masquant celles du dessous.
 * C'est la forme canonique pour comparer des distributions quand il y en a beaucoup, et c'est
 * exactement la question de ce site : cent douze hooks, et ce que chacun prend.
 *
 * CE QU'ON PEINT : une crête par hook. En abscisse le prélèvement en points de base, réparti
 * en rang sur toute la largeur ; en ordonnée la densité — combien de mesures de ce hook tombent
 * là. Les hooks sont empilés du moins cher en bas au plus cher en haut, et chaque crête est
 * remplie de la couleur du fond, si bien qu'elle masque celles qui sont derrière. Une crête
 * s'illumine à la fois, de bas en haut : l'instrument relit ses hooks l'un après l'autre.
 *
 * DEUX FONDS ONT ÉTÉ REFUSÉS AVANT CELUI-CI, et les deux refus ont appris quelque chose. Des
 * pistes orthogonales qui poussaient : « trop AI generated dans le style » — la forme était
 * celle de n'importe quel site technique. Un semis de points : juste, mais sans style, un voile
 * sans figure. Une crête a une silhouette qu'on reconnaît de loin, et elle dit une chose vraie
 * du corpus : la plupart des hooks prennent un taux fixe, donc leur crête est un pic étroit.
 *
 * CE QU'IL NE FAIT JAMAIS : passer devant un texte (les rectangles de ligne sont mesurés et
 * creusés), tourner dans un onglet caché, ni bouger sous `prefers-reduced-motion` — les crêtes
 * sont alors peintes une fois, complètes et immobiles.
 */
import { useEffect, useRef } from 'react'
import { dataset } from '../lib/dataset'

/** Une crête : la densité des prélèvements d'un hook, en `PAS` valeurs de 0 à 1. */
type Crete = number[]

/** points de la courbe, en largeur. Peu de pas, volontairement : un hook a taux fixe donne
    une barre d'un pixel sur une echelle fine, et une pile de barres n'est pas une silhouette. */
const PAS = 64
/** crêtes empilées — au-delà, elles se touchent et la figure devient une trame */
const CRETES = 18
/** temps d'illumination d'une crête */
const LECTURE_MS = 420

/**
 * LES CRÊTES, construites du corpus.
 *
 * Un histogramme par hook sur l'échelle des prélèvements, puis un lissage court : sans lui un
 * hook à taux fixe donne une barre d'un pixel, avec lui il donne le pic étroit qui le décrit.
 * L'abscisse est le RANG du prélèvement et non sa valeur : la médiane du corpus vaut 100 bps
 * et les valeurs s'entassent, alors que le rang étale les cent douze hooks sur toute la largeur.
 */
function cretes(): Crete[] {
  const parHook = new Map<string, number[]>()
  for (const r of dataset.rows) {
    if (r.label !== 'MESURE' || r.bps === null || r.bps <= 0) continue
    const l = parHook.get(r.hook) ?? []
    l.push(r.bps)
    parHook.set(r.hook, l)
  }
  if (parHook.size === 0) return []

  // L'echelle commune : le rang du prelevement parmi toutes les valeurs vues.
  const toutes = [...parHook.values()].flat().sort((a, b) => a - b)
  const rang = (b: number) => {
    let lo = 0
    let hi = toutes.length - 1
    while (lo < hi) {
      const mi = (lo + hi) >> 1
      if (toutes[mi] < b) lo = mi + 1
      else hi = mi
    }
    return lo / (toutes.length - 1 || 1)
  }

  // Les hooks, du moins cher au plus cher : la pile monte, comme le prelevement.
  const hooks = [...parHook.entries()]
    .map(([h, bs]) => ({ h, bs, med: bs.slice().sort((a, b) => a - b)[Math.floor(bs.length / 2)] }))
    .sort((a, b) => a.med - b.med)

  // On garde CRETES hooks repartis sur toute la pile, pas les CRETES premiers.
  const choisis: typeof hooks = []
  for (let i = 0; i < CRETES; i++) {
    choisis.push(hooks[Math.min(hooks.length - 1, Math.floor((i * hooks.length) / CRETES))])
  }

  return choisis.map(({ bs }) => {
    const h = new Array<number>(PAS).fill(0)
    for (const b of bs) {
      const i = Math.min(PAS - 1, Math.max(0, Math.round(rang(b) * (PAS - 1))))
      h[i] += 1
    }
    // Lissage court, sur des pas larges : assez pour qu'un taux fixe devienne un pic dessinable,
    // pas assez pour l'aplatir en ondulation. La silhouette tient a ce reglage.
    let c = h
    for (let p = 0; p < 2; p++) {
      const n = new Array<number>(PAS).fill(0)
      for (let i = 0; i < PAS; i++) {
        let s = 0
        let k = 0
        for (let d = -2; d <= 2; d++) {
          const j = i + d
          if (j < 0 || j >= PAS) continue
          s += c[j]
          k++
        }
        n[i] = s / k
      }
      c = n
    }
    const max = Math.max(...c, 1)
    return c.map((v) => v / max)
  })
}

let cache: Crete[] | null = null
function pile(): Crete[] {
  if (!cache) cache = cretes()
  return cache
}

export function FondCretes() {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduit =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const lignes = pile()
    if (lignes.length === 0) return
    let w = 0
    let h = 0
    let raf = 0
    let debut = 0

    const lire = () => {
      const st = getComputedStyle(document.documentElement)
      return {
        fond: st.getPropertyValue('--bg').trim() || '#08090a',
        trait: st.getPropertyValue('--line-strong').trim() || '#363b42',
        lu: st.getPropertyValue('--ink-2').trim() || '#a2a9b0',
      }
    }
    let couleurs = lire()

    /**
     * LES CREUX suivent les LIGNES de texte, pas les boîtes : un titre de deux lignes occupe
     * une boîte à moitié vide, et creuser la boîte effacerait la figure. Les surfaces opaques
     * (le champ, le bouton) ne sont pas de la partie, elles masquent d'elles-mêmes.
     */
    const PROTEGES =
      '.hero h1, .hero p, .hero-mesure, .hero-saisie label, .hero-saisie span, .scroll-cue span, .hero-fond-legende'
    const creuser = () => {
      const cadre = cv.getBoundingClientRect()
      const parent = cv.parentElement
      if (!parent) return
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      if (typeof ctx.filter === 'string') ctx.filter = 'blur(10px)'
      ctx.fillStyle = 'rgba(0,0,0,1)'
      for (const el of Array.from(parent.querySelectorAll(PROTEGES))) {
        const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
        let n = it.nextNode()
        while (n) {
          if ((n.textContent ?? '').trim().length > 0) {
            const rg = document.createRange()
            rg.selectNodeContents(n)
            for (const r of Array.from(rg.getClientRects())) {
              if (r.width === 0 || r.height === 0) continue
              ctx.fillRect(r.x - cadre.x - 6, r.y - cadre.y - 3, r.width + 12, r.height + 6)
            }
          }
          n = it.nextNode()
        }
      }
      ctx.restore()
    }

    /** `active` est l'indice de la crête illuminée, ou -1. */
    const peindre = (active: number) => {
      ctx.clearRect(0, 0, w, h)
      const mx = 20
      const lw = Math.max(1, w - mx * 2)
      // Les crêtes montent : la première est en bas. Elles se chevauchent d'un tiers, ce qui
      // est ce qui donne la silhouette — une pile sans recouvrement n'est qu'un tableau.
      const pasY = (h - 24) / (lignes.length - 1 || 1)
      // Un pic monte sur cinq a six cretes : c'est le recouvrement qui fait la silhouette.
      const amp = Math.min(96, pasY * 6)
      for (let k = lignes.length - 1; k >= 0; k--) {
        const base = 12 + k * pasY
        const c = lignes[lignes.length - 1 - k]
        ctx.beginPath()
        ctx.moveTo(mx, base)
        // Une courbe lisse plutot qu'une ligne brisee : a soixante-quatre pas, les segments
        // se verraient. On passe par des quadratiques entre milieux de segments.
        const px = (i: number) => mx + (i / (PAS - 1)) * lw
        const py = (i: number) => base - c[i] * amp
        ctx.lineTo(px(0), py(0))
        for (let i = 1; i < PAS - 1; i++) {
          ctx.quadraticCurveTo(px(i), py(i), (px(i) + px(i + 1)) / 2, (py(i) + py(i + 1)) / 2)
        }
        ctx.lineTo(px(PAS - 1), py(PAS - 1))
        ctx.lineTo(mx + lw, base)
        // Le remplissage au fond de page : c'est lui qui fait qu'une crête MASQUE celles du
        // dessous. Sans lui la pile est un enchevetrement illisible.
        ctx.globalAlpha = 1
        ctx.fillStyle = couleurs.fond
        ctx.fill()
        ctx.globalAlpha = lignes.length - 1 - k === active ? 1 : 0.9
        ctx.strokeStyle = lignes.length - 1 - k === active ? couleurs.lu : couleurs.trait
        ctx.lineWidth = 1
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      creuser()
    }

    const pas = (t: number) => {
      if (!debut) debut = t
      const i = Math.floor(((t - debut) / LECTURE_MS) % lignes.length)
      peindre(i)
      raf = window.requestAnimationFrame(pas)
    }

    const dimensionner = () => {
      const r = cv.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      w = Math.max(1, Math.round(r.width))
      h = Math.max(1, Math.round(r.height))
      cv.width = Math.round(w * dpr)
      cv.height = Math.round(h * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      couleurs = lire()
      if (reduit) peindre(-1)
    }

    dimensionner()

    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(dimensionner)
    ro?.observe(cv)

    // Le theme change les trois valeurs : on les relit sans redemarrer la lecture.
    const mo = new MutationObserver(() => {
      couleurs = lire()
      if (reduit) peindre(-1)
    })
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })

    const visibilite = () => {
      if (reduit) return
      if (document.hidden) {
        window.cancelAnimationFrame(raf)
        raf = 0
      } else if (!raf) {
        debut = 0
        raf = window.requestAnimationFrame(pas)
      }
    }
    document.addEventListener('visibilitychange', visibilite)

    if (!reduit) raf = window.requestAnimationFrame(pas)

    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      ro?.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', visibilite)
    }
  }, [])

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%', zIndex: 0 }}
    />
  )
}
