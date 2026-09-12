/**
 * LE FOND DU HERO — et ce n'est pas une décoration : c'est le corpus.
 *
 * Ce qu'on peint : un échantillon des 125 072 mesures embarquées, une par point. En abscisse
 * le rang de la mesure dans le corpus, en ordonnée son rang de prélèvement — la moins chère en
 * bas, la plus chère en haut. Une ligne verticale balaie la bande sans fin, comme la tête d'un
 * enregistreur qui relit son papier : les points qu'elle traverse s'allument une seconde, puis
 * retombent au gris.
 *
 * POURQUOI PAS UN CHAMP DE PISTES QUI POUSSENT. C'était la première version, refusée : « trop
 * AI generated dans le style ». Des traits qui se tracent tout seuls sur un fond sombre, c'est
 * le fond de n'importe quelle page de produit technique, et ça ne dit rien de celle-ci. Un
 * nuage de mesures réelles n'appartient qu'à ce projet : ce que le fond montre est exactement
 * ce que le titre annonce.
 *
 * LA RÉFÉRENCE. Le nuage de sstr.tech, référence numéro un de la charte de l'équipier : la
 * même grandeur mesurée deux fois, en points et jamais en courbe, sans lissage, sans grille.
 * On en reprend la matière — un semis de points fins — et on lui ajoute le seul mouvement
 * qu'un instrument s'autorise : la relecture de sa propre bande.
 *
 * CE QU'IL NE FAIT JAMAIS : passer devant un texte (les blocs protégés sont mesurés, pas
 * devinés), tourner dans un onglet caché, ni bouger sous `prefers-reduced-motion` — le nuage
 * est alors peint une fois, complet et immobile, et c'est la même image.
 */
import { useEffect, useRef } from 'react'
import { dataset } from '../lib/dataset'

/** Un point de la bande, déjà projeté en coordonnées relatives (0 à 1). */
interface Point {
  /** rang dans le corpus, ramené sur [0, 1] — la bande se lit de gauche à droite */
  x: number
  /** prélèvement en bps, en log, ramené sur [0, 1] — 0 en bas */
  y: number
}

const MAX_POINTS = 3400
/** une relecture complète de la bande */
const BALAYAGE_MS = 11000

/**
 * L'ÉCHANTILLON — et la projection, qui est le vrai choix.
 *
 * Porter la taille du swap en abscisse paraissait naturel, et c'était faux : le corpus ne
 * contient que HUIT tailles, alors le nuage se réduisait à huit colonnes. Ce qui se déroule
 * ici est la bande elle-même : en abscisse le rang de la mesure dans le corpus, en ordonnée
 * son prélèvement en points de base, en log parce que la colonne court de 0,1 à 1 800 bps.
 * On lit une bande d'enregistreur, pas un diagramme — et c'est bien ce que le corpus est.
 */
function echantillon(): Point[] {
  const rows = dataset.rows
  const pts: Point[] = []
  const pas = Math.max(1, Math.floor(rows.length / MAX_POINTS))
  const gardees: number[] = []
  for (let i = 0; i < rows.length; i += pas) {
    const r = rows[i]
    // Seules les lignes MESUREES portent un prelevement : une NON_COTABLE n'a pas de valeur,
    // et lui en inventer une serait la faute meme que ce produit reproche au registre.
    if (r.label !== 'MESURE' || r.bps === null || r.bps <= 0) continue
    gardees.push(r.bps)
  }
  if (gardees.length === 0) return pts
  /**
   * L'ORDONNEE EST UN RANG, et c'est un choix, pas une facilite.
   *
   * Porter le prelevement en log sur une echelle de valeurs tassait tout le semis dans le
   * tiers haut de la bande : la mediane du corpus vaut 100 bps, et une distribution aussi
   * asymetrique ne remplit pas une hauteur, elle s'y empile. En ordonnee, chaque mesure est
   * donc placee a son RANG parmi les autres — la mesure la moins chere en bas, la plus chere
   * en haut. Le semis couvre alors toute la bande, et l'axe reste vrai : plus haut veut dire
   * plus cher. La legende le dit en toutes lettres, « rangees par prelevement ».
   */
  const ordre = gardees.map((b, i) => ({ b, i })).sort((x, y) => x.b - y.b)
  const rang = new Array<number>(gardees.length)
  for (let k = 0; k < ordre.length; k++) rang[ordre[k].i] = k / (ordre.length - 1 || 1)
  for (let i = 0; i < gardees.length; i++) {
    pts.push({ x: i / (gardees.length - 1 || 1), y: rang[i] })
  }
  return pts
}

/** La bande est la même pour toute la session : on la calcule une fois. */
let cache: Point[] | null = null
function bande(): Point[] {
  if (!cache) cache = echantillon()
  return cache
}

export function FondCorpus() {
  const ref = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    const ctx = cv.getContext('2d')
    if (!ctx) return

    const reduit =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const pts = bande()
    let w = 0
    let h = 0
    let raf = 0
    let debut = 0

    const lire = () => {
      const st = getComputedStyle(document.documentElement)
      return {
        repos: st.getPropertyValue('--ink-4').trim() || '#454a50',
        lu: st.getPropertyValue('--ink-2').trim() || '#a2a9b0',
        tete: st.getPropertyValue('--ink').trim() || '#e8eaed',
      }
    }
    let couleurs = lire()

    /**
     * LES CREUX — et ils suivent les LIGNES, pas les boîtes.
     *
     * Creuser le rectangle de chaque bloc revenait à effacer la bande entière : un titre de
     * deux lignes occupe une boîte de 780 px de large dont la moitié est vide. On creuse donc
     * les rectangles de ligne, obtenus du `Range` de chaque nœud de texte — ce qui libère tout
     * ce qui n'est pas un glyphe, et c'est là que la bande se voit.
     *
     * Les surfaces opaques (le champ, le bouton) ne sont pas de la partie : le canvas est
     * derrière elles, elles le masquent d'elles-mêmes.
     */
    const PROTEGES = '.hero h1, .hero p, .hero-mesure, .hero-saisie label, .hero-saisie span, .scroll-cue span, .hero-fond-legende'
    const lignes = (el: Element): DOMRect[] => {
      const out: DOMRect[] = []
      const it = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
      let n = it.nextNode()
      while (n) {
        if ((n.textContent ?? '').trim().length > 0) {
          const r = document.createRange()
          r.selectNodeContents(n)
          for (const rect of Array.from(r.getClientRects())) out.push(rect)
          r.detach?.()
        }
        n = it.nextNode()
      }
      return out
    }
    const creuser = () => {
      const cadre = cv.getBoundingClientRect()
      const parent = cv.parentElement
      if (!parent) return
      ctx.save()
      ctx.globalCompositeOperation = 'destination-out'
      if (typeof ctx.filter === 'string') ctx.filter = 'blur(10px)'
      ctx.fillStyle = 'rgba(0,0,0,1)'
      for (const el of Array.from(parent.querySelectorAll(PROTEGES))) {
        for (const r of lignes(el)) {
          if (r.width === 0 || r.height === 0) continue
          const mx = 6
          const my = 3
          ctx.fillRect(r.x - cadre.x - mx, r.y - cadre.y - my, r.width + mx * 2, r.height + my * 2)
        }
      }
      ctx.restore()
    }

    /** `tete` est l'abscisse relative de la ligne de lecture, ou -1 quand elle ne passe pas. */
    const peindre = (tete: number) => {
      ctx.clearRect(0, 0, w, h)
      const mx = 24
      const my = 10
      const lw = Math.max(1, w - mx * 2)
      const lh = Math.max(1, h - my * 2)
      for (const p of pts) {
        const x = mx + p.x * lw
        const y = my + (1 - p.y) * lh
        // La distance a la tete de lecture : les points qu'elle vient de traverser sont encore
        // chauds, les autres sont au repos.
        const d = tete < 0 ? 1 : tete - p.x
        if (d >= 0 && d < 0.07) {
          ctx.fillStyle = d < 0.012 ? couleurs.tete : couleurs.lu
          ctx.globalAlpha = d < 0.012 ? 0.95 : 0.6 * (1 - d / 0.07)
          ctx.fillRect(x - 1, y - 1, 2, 2)
        } else {
          ctx.fillStyle = couleurs.repos
          ctx.globalAlpha = 0.85
          ctx.fillRect(x, y, 1, 1)
        }
      }
      // La tete de lecture : un trait de 1 px, pas un halo.
      if (tete >= 0) {
        ctx.globalAlpha = 0.45
        ctx.fillStyle = couleurs.tete
        ctx.fillRect(Math.round(mx + tete * lw) + 0.5, my, 1, lh)
      }
      ctx.globalAlpha = 1
      creuser()
    }

    const pas = (t: number) => {
      if (!debut) debut = t
      peindre(((t - debut) % BALAYAGE_MS) / BALAYAGE_MS)
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

    // Le theme change les trois valeurs : on les relit sans redemarrer le balayage.
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
