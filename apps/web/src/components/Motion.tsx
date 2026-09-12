/**
 * LE MOUVEMENT DE LA PAGE : deux gestes, et deux seulement.
 *
 *   1. `Reveal` — une section qui entre dans l'écran monte de douze pixels et s'ouvre, une
 *      fois. Jamais deux fois : un élément qui rejoue son apparition à chaque passage
 *      transforme un défilement en clignotement.
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
import { useEffect, useRef, useState, type ReactNode } from 'react'

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
  const [vu, setVu] = useState(() => reduit())

  useEffect(() => {
    if (vu) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setVu(true)
      return
    }
    const io = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          if (!e.isIntersecting) continue
          setVu(true)
          io.disconnect()
        }
      },
      // 12 % de la section suffit : attendre la moitié fait apparaître le bloc trop tard,
      // quand on le lit déjà.
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [vu])

  return (
    <div
      ref={ref}
      id={id}
      className={[className, 'reveal', vu ? 'reveal--vu' : ''].filter(Boolean).join(' ')}
      style={{ transitionDelay: vu ? `${delai}ms` : undefined }}
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
