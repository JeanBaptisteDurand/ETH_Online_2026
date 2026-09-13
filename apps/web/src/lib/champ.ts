/**
 * LE CHAMP AU POINTEUR — le fond de la page suit la souris (design/BRIEF.md, lock 16).
 *
 * Ce que ce module fait : il ecrit deux variables CSS sur <html>, `--px` et `--py`, la position
 * du curseur en pixels. TOUT le rendu est en CSS (index.css, `body::before` et `body::after`) :
 * il n'y a ici ni canvas, ni shader, ni dependance, et rien qui redessine.
 *
 * Trois contraintes tenues, et ce sont elles qui expliquent la forme du code :
 *
 *   1. AUCUN REPEINT CONTINU. Le pointeur peut emettre 120 evenements par seconde ; on ne fait
 *      qu'ecrire la derniere position dans une variable, et on ne la pousse au style qu'une
 *      fois par frame, dans un requestAnimationFrame. Les deux couches qui l'utilisent sont sur
 *      des pseudo-elements `position: fixed` et n'animent que `transform`, donc le compositeur
 *      les deplace sans repasser par la mise en page.
 *   2. `prefers-reduced-motion`. Le champ ne se branche pas du tout, et il se debranche si la
 *      preference change en cours de route. Le CSS coupe aussi la couche, ceinture et bretelles.
 *   3. UN POINTEUR FIN SEULEMENT. Sur un ecran tactile il n'y a pas de survol : le champ ne
 *      servirait a rien et couterait une couche.
 *
 * Le listener est `passive` : il ne peut pas retarder le defilement.
 */
export function brancherChampAuPointeur(): () => void {
  if (typeof window === 'undefined') return () => {}

  const finPointeur = window.matchMedia('(hover: hover) and (pointer: fine)')
  const mouvementReduit = window.matchMedia('(prefers-reduced-motion: reduce)')
  const racine = document.documentElement

  let branche = false
  let x = window.innerWidth / 2
  let y = window.innerHeight * 0.4
  let trame: number | null = null

  const pousser = () => {
    trame = null
    racine.style.setProperty('--px', `${x}px`)
    racine.style.setProperty('--py', `${y}px`)
  }
  const surMouvement = (e: PointerEvent) => {
    x = e.clientX
    y = e.clientY
    // Une seule ecriture de style par frame, quelle que soit la cadence du pointeur.
    if (trame === null) trame = requestAnimationFrame(pousser)
  }

  const brancher = () => {
    if (branche) return
    branche = true
    window.addEventListener('pointermove', surMouvement, { passive: true })
    pousser()
  }
  const debrancher = () => {
    if (!branche) return
    branche = false
    window.removeEventListener('pointermove', surMouvement)
    if (trame !== null) cancelAnimationFrame(trame)
    trame = null
    racine.style.removeProperty('--px')
    racine.style.removeProperty('--py')
  }

  const decider = () => {
    if (finPointeur.matches && !mouvementReduit.matches) brancher()
    else debrancher()
  }

  decider()
  finPointeur.addEventListener('change', decider)
  mouvementReduit.addEventListener('change', decider)

  return () => {
    finPointeur.removeEventListener('change', decider)
    mouvementReduit.removeEventListener('change', decider)
    debrancher()
  }
}
