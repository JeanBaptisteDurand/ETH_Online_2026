/**
 * LE MOUVEMENT DE LA PAGE : deux gestes, et deux seulement.
 *
 *   1. `Reveal` — une section qui entre dans l'écran MONTE de vingt-deux pixels, une fois.
 *      Jamais deux fois : un élément qui rejoue son apparition à chaque passage transforme un
 *      défilement en clignotement. Et jamais par l'opacité : voir la note dans `index.css`,
 *      un bloc invisible tant que JavaScript n'a pas parlé est un bloc qu'on peut perdre.
 *   2. `Route` — le contenu d'une route qui change se repose, court et net. C'est ce qui dit
 *      qu'on a changé de page sans qu'un titre saute.
 *
 * POURQUOI PAS DE BIBLIOTHÈQUE. Les deux gestes tiennent en un `IntersectionObserver` et deux
 * animations CSS sur `transform` et `opacity`. Ajouter un moteur d'animation au paquet pour
 * cela coûterait plus que ce que ça rend.
 *
 * SOUS `prefers-reduced-motion`, rien ne bouge : les éléments sont posés, opaques, à leur
 * place. C'est le même design, complet — pas une version amputée.
 */
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

const reduit = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * Une section qui s'ouvre en entrant dans l'écran.
 *
 * `delai` décale les enfants d'un même groupe : trois blocs qui montent ensemble se lisent
 * comme un seul, décalés de 60 ms ils se lisent comme trois. Au-delà de trois, on ne décale
 * plus — une cascade de douze est une animation, pas une lecture.
 */
export function Reveal({
  children,
  delai = 0,
  className,
  id,
}: {
  children: ReactNode
  delai?: number
  className?: string
  id?: string
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  /**
   * ON PART VISIBLE, ET C'EST LA REGLE.
   *
   * Un reveal qui part a `opacity: 0` et attend JavaScript cache le contenu quand le script
   * tarde, echoue, ou qu'un observateur ne se declenche pas — et la revue l'a pris en flagrant
   * delit : en capture pleine page, trois sections sur quatre etaient blanches. On ne cache
   * donc un bloc QUE si on a verifie, a la mise en page, qu'il est hors de l'ecran ; ce qui
   * est deja visible le reste, et l'absence de JavaScript ne cache plus rien.
   */
  const [etat, setEtat] = useState<'pose' | 'cache' | 'vu'>('pose')

  useLayoutEffect(() => {
    if (reduit()) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const r = el.getBoundingClientRect()
    const h = window.innerHeight || 0
    // Deja dans l'ecran (ou au-dessus) : on ne le fait pas monter, on le laisse en place.
    if (r.top < h - 40) return
    setEtat('cache')
    const io = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (!e.isIntersecting) continue
          setEtat('vu')
          io.disconnect()
        }
      },
      // 12 % de la section suffit : attendre la moitié fait apparaître le bloc trop tard,
      // quand on le lit déjà.
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)

    /**
     * LES DEUX FILETS. Un observateur ne se declenche pas toujours : a l'impression, et dans
     * une capture pleine page, la fenetre s'etire sans qu'aucun defilement ait lieu — et la
     * revue a vu trois sections blanches sur la capture pleine page de l'accueil. Dans les
     * deux cas, la bonne reponse est de tout montrer : personne ne fait defiler une feuille.
     */
    const montrer = () => setEtat('vu')
    const surTaille = () => {
      if ((window.innerHeight || 0) > 1600) montrer()
    }
    window.addEventListener('beforeprint', montrer)
    window.addEventListener('resize', surTaille)
    surTaille()

    return () => {
      io.disconnect()
      window.removeEventListener('beforeprint', montrer)
      window.removeEventListener('resize', surTaille)
    }
  }, [])

  return (
    <div
      ref={ref}
      id={id}
      className={[className, etat === 'pose' ? '' : 'reveal', etat === 'vu' ? 'reveal--vu' : '']
        .filter(Boolean)
        .join(' ')}
      style={{ transitionDelay: etat === 'vu' ? `${delai}ms` : undefined }}
    >
      {children}
    </div>
  )
}

/**
 * LE CHANGEMENT DE ROUTE. Le contenu se repose en 260 ms ; `cle` est la route, et c'est elle
 * qui relance l'animation. Le `key` de React remonte le sous-arbre, ce qui remet aussi les
 * `Reveal` à zéro : on arrive sur une page neuve, pas sur une page à moitié jouée.
 */
export function Route({ cle, children }: { cle: string; children: ReactNode }) {
  return (
    <div key={cle} className="route-entre">
      {children}
    </div>
  )
}
