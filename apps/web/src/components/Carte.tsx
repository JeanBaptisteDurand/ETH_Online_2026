/**
 * LA CARTE — la première chose qu'on voit, et le seul objet dessiné du site.
 *
 * Ce n'est pas un canevas d'éditeur de flux : c'est un schéma d'appareil. Un bloc
 * orchestrateur, quatorze blocs d'outils rangés par famille, vingt-sept jeux de données qui
 * entrent par un rail de gauche, et des pistes de 1 px tirées à angle droit entre les trois.
 *
 * POURQUOI DES ANGLES DROITS. À quarante et un nœuds, des courbes de Bézier font un plat de
 * spaghettis, et une courbe contredit le rayon zéro de la charte. L'orthogonale tient la
 * densité et se lit comme un schéma de câblage.
 *
 * DEUX QUALITÉS DE PISTE, ET AUCUNE N'EST UNE COULEUR. Trait plein pour le flux d'un outil,
 * tirets pour un jeu de données qui alimente. Quelqu'un qui ne distingue pas les teintes lit
 * quand même la différence.
 *
 * AUCUN NOMBRE ÉCRIT ICI. Le compte des outils vient de `OUTILS`, celui des jeux de `DONNEES`,
 * le compte d'étapes de la chaîne de `facts.inventaire.chaine` — statté au build.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { OUTILS, type Famille, type Outil } from '../lib/outils'
import { DONNEES, luPar } from '../lib/donnees'
import { groupDigits } from '../lib/format'
import facts from '../data/facts.json'

/**
 * La couleur d'une famille, prise sur ses jetons propres et non sur la rampe de mesure.
 * La rampe encode les bps ; elle s'inverse entre les deux thèmes, et lui emprunter une teinte
 * rapprochait « analyse » et « action » en thème clair. Voir `index.css`.
 */
const COULEUR: Record<Famille, string> = {
  collecte: 'var(--fam-collecte)',
  analyse: 'var(--fam-analyse)',
  action: 'var(--fam-action)',
}

const QUOI: Record<Famille, string> = {
  collecte: 'va chercher une donnée',
  analyse: 'interprète',
  action: 'change quelque chose',
}

const ORDRE: Famille[] = ['collecte', 'analyse', 'action']

/** « 13 680 ms » — en millisecondes, comme la chaine les mesure. Arrondir a « 13,7 s »
    perdrait la precision que le fichier porte, sur un produit dont c'est tout le propos. */
const msFr = (ms: number | null): string => (ms === null ? '—' : `${ms.toLocaleString('fr')} ms`)

/** Une seule ligne de métadonnée par nœud — l'anatomie de la référence, rien de plus. */
function meta(o: Outil): string {
  const n = luPar(o.n).length
  const jeux = n === 0 ? 'aucun jeu lu' : n === 1 ? '1 jeu lu' : `${n} jeux lus`
  if (o.etat === 'pret') return jeux
  if (o.etat === 'hors_ligne') return `${jeux}, hors ligne`
  return `${jeux}, en attente`
}

interface Trace {
  cle: string
  d: string
  outil: number | null
  alimente: boolean
  len: number
}

export function Carte({ surOutil }: { surOutil: (n: number) => void }) {
  const boite = useRef<HTMLDivElement | null>(null)
  const chaine = useRef<HTMLDivElement | null>(null)
  const rail = useRef<HTMLDivElement | null>(null)
  const noeuds = useRef(new Map<number, HTMLAnchorElement>())
  const [traces, setTraces] = useState<Trace[]>([])
  const [taille, setTaille] = useState({ w: 0, h: 0 })
  const [actif, setActif] = useState<number | null>(null)
  // LE FIL DE LA RUBRIQUE 0. Il descendait de 40 px en dur et s'arretait 63 px au-dessus de sa
  // cible : la promesse etait qu'il vienne SE BRANCHER sur la figure. On mesure donc la
  // position reelle du premier nuancier, comme la carte mesure celle de ses noeuds.
  const cadreFigure = useRef<HTMLDivElement | null>(null)
  const nuancier = useRef<HTMLSpanElement | null>(null)
  const [fil, setFil] = useState(0)
  const [tracee, setTracee] = useState(false)
  // Empile : sous 900 px la grille passe en une colonne. L'ordre de lecture change avec elle.
  const [empile, setEmpile] = useState(false)

  /**
   * Les pistes sont calculées après la mise en page, pas devinées : on lit la position réelle
   * de chaque bloc. C'est ce qui les garde justes quand la grille se replie à 768 et à 390.
   */
  const calculer = useCallback(() => {
    const b = boite.current
    const c = chaine.current
    if (!b || !c) return
    const cadre = b.getBoundingClientRect()
    const rel = (r: DOMRect): DOMRect =>
      new DOMRect(r.x - cadre.x, r.y - cadre.y, r.width, r.height)
    const rch = rel(c.getBoundingClientRect())
    const out: Trace[] = []
    const longueur = (d: string): number => {
      // La longueur d'une polyligne orthogonale est la somme de ses segments : pas besoin
      // du DOM pour la connaitre, et c'est elle qui regle le dash du trace initial.
      const n = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? []
      let total = 0
      let x = n[0] ?? 0
      let y = n[1] ?? 0
      const parts = d.split(' ')
      for (let i = 2; i < parts.length; i += 2) {
        const op = parts[i]
        const v = Number(parts[i + 1])
        if (op === 'H') { total += Math.abs(v - x); x = v }
        else if (op === 'V') { total += Math.abs(v - y); y = v }
      }
      return total + 8
    }

    // LE FOND DE PANIER, a toutes les largeurs. Un tronc horizontal juste au-dessus de la
    // grille d'outils, un bus vertical par colonne dans la gouttiere, un piquage court dans
    // chaque nœud. Aucune piste ne traverse un bloc : c'est toute la difference entre un
    // schéma et un plat de spaghettis. Seul le point de sortie de l'orchestrateur change,
    // selon qu'il est a cote de la grille ou au-dessus d'elle.
    const noeudsTries = [...noeuds.current.entries()].sort((a, b2) => a[0] - b2[0])
    if (noeudsTries.length === 0) {
      setTaille({ w: cadre.width, h: cadre.height })
      setTraces([])
      return
    }

    let hautGrille = Infinity
    let gaucheGrille = Infinity
    const parColonne = new Map<number, [number, HTMLAnchorElement][]>()
    for (const e of noeudsTries) {
      const r = rel(e[1].getBoundingClientRect())
      hautGrille = Math.min(hautGrille, r.y)
      gaucheGrille = Math.min(gaucheGrille, r.x)
      const cle = Math.round(r.x)
      const liste = parColonne.get(cle) ?? []
      liste.push(e)
      parColonne.set(cle, liste)
    }

    const aCote = rch.x + rch.width <= gaucheGrille + 1
    setEmpile(!aCote)
    const tronc = hautGrille - 14
    const sortie = aCote
      ? { x: rch.x + rch.width, y: rch.y + rch.height / 2 }
      : { x: rch.x + 24, y: rch.y + rch.height }
    const amorce = aCote
      ? `M ${sortie.x} ${sortie.y} H ${sortie.x + 14} V ${tronc}`
      : `M ${sortie.x} ${sortie.y} V ${tronc}`

    for (const [colX, liste] of parColonne) {
      const bus = Math.max(2, colX - 16)
      for (const [n, el] of liste) {
        const r = rel(el.getBoundingClientRect())
        const y = Math.round(r.y + r.height / 2)
        const d = `${amorce} H ${bus} V ${y} H ${r.x}`
        out.push({ cle: `o${n}`, d, outil: n, alimente: false, len: longueur(d) })
      }
    }

    // Le rail des jeux de données alimente l'orchestrateur : tirets, pas trait plein. Il n'a
    // de sens que quand le rail est a gauche de l'orchestrateur ; empile, les deux se suivent.
    const rl = rail.current
    if (rl) {
      const r = rel(rl.getBoundingClientRect())
      if (r.x + r.width <= rch.x + 1) {
        const d = `M ${r.x + r.width} ${r.y + 14} H ${r.x + r.width + 14} V ${rch.y + rch.height / 2} H ${rch.x}`
        out.push({ cle: 'rail', d, outil: null, alimente: true, len: longueur(d) })
      }
    }

    setTaille({ w: cadre.width, h: cadre.height })
    setTraces(out)
  }, [])

  useLayoutEffect(() => {
    calculer()
    const b = boite.current
    if (!b || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(calculer)
    ro.observe(b)
    return () => ro.disconnect()
  }, [calculer])

  useLayoutEffect(() => {
    const mesurer = () => {
      const c = cadreFigure.current
      const n = nuancier.current
      if (!c || !n) return
      // depuis le filet de section (28 px au-dessus du cadre) jusqu'au bord haut du nuancier
      setFil(Math.max(0, n.getBoundingClientRect().top - c.getBoundingClientRect().top + 28))
    }
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mesurer)
    if (cadreFigure.current) ro.observe(cadreFigure.current)
    return () => ro.disconnect()
  })

  // Le tracé n'a lieu qu'une fois, au premier rendu. Un recalcul de mise en page ne doit pas
  // relancer une animation : rien ne rejoue derrière le dos du lecteur.
  useEffect(() => {
    const t = window.setTimeout(() => setTracee(true), 700)
    return () => window.clearTimeout(t)
  }, [])

  const ch = facts.chaine
  const nJeux = DONNEES.length

  // Le temps PROPRE de chaque etape : `a_ms` est un cumul depuis le debut de la chaine.
  const durees = useMemo(() => {
    const e = ch?.etapes ?? []
    return e.map((x, i) => ({
      n: x.n,
      quoi: x.quoi,
      etat: x.etat,
      ms: Math.max(0, (x.a_ms ?? 0) - (i === 0 ? 0 : (e[i - 1].a_ms ?? 0))),
    }))
  }, [ch])
  const maxMs = Math.max(1, ...durees.map((d) => d.ms))

  /**
   * LA PAIRE. `facts.execution` porte les deux cotations d'un swap reellement execute — avec
   * le hook, et contre le talon — plus l'ecart en points de base. Les montants sont des wei a
   * vingt-six chiffres : illisibles tels quels, on les ramene sur une base de 100 recus sans
   * le hook, et on garde le wei brut en dessous. Rien n'est arrondi en silence.
   */
  const paire = useMemo(() => {
    const e = facts.execution
    if (!e?.avec_hook?.cote || !e?.avec_talon?.cote) return null
    const avec = BigInt(e.avec_hook.cote)
    const sans = BigInt(e.avec_talon.cote)
    if (sans === 0n) return null
    const sur100 = Number((avec * 1000000n) / sans) / 10000
    return {
      avec: `${sur100.toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sans: '100,00',
      bps: (e.bps_publies ?? 0).toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      avecWei: groupDigits(e.avec_hook.cote),
      sansWei: groupDigits(e.avec_talon.cote),
    }
  }, [])

  return (
    <section aria-labelledby="carte-titre">
      <header
        className="flex flex-wrap items-baseline justify-between gap-x-[24px] gap-y-[4px] pb-[10px]"
        style={{ borderBottom: '1px solid var(--line-strong)' }}
      >
        <h1 id="carte-titre" className="t-hero m-0">
          La chaîne et ses {OUTILS.length} outils
        </h1>
        {/* Une legende, pas une liste de formules « mot — fragment » : le nom de la famille
            sur une ligne, ce qu'elle fait dessous. Aucun tiret cadratin espace. */}
        <dl className="legende flex flex-wrap gap-x-[24px] gap-y-[6px] m-0 p-0">
          {/* `dt` et `dd` sont des enfants DIRECTS du div de groupe : une seconde division
              entre eux et la liste casse `definition-list`, et la legende cesse d'etre lue
              comme une legende. La grille garde le rendu au pixel — le nuancier tient les
              deux lignes, le nom au-dessus de sa glose. */}
          {ORDRE.map((f) => (
            <div
              key={f}
              style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', columnGap: 8 }}
            >
              <span
                aria-hidden="true"
                style={{ width: 24, height: 8, background: COULEUR[f], display: 'inline-block', marginTop: 5, gridRow: '1 / span 2' }}
              />
              <dt className="t-data-sm m-0" style={{ color: 'var(--ink)' }}>
                {f}
              </dt>
              <dd className="legende-glose t-data-sm m-0" style={{ color: 'var(--ink-2)' }}>
                {QUOI[f]}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <div ref={boite} className="relative grid gap-x-[32px] gap-y-[24px] pt-[24px]" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <svg
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          width={taille.w}
          height={taille.h}
          viewBox={`0 0 ${taille.w} ${taille.h}`}
          style={{ zIndex: 0 }}
        >
          {traces.map((t) => (
            <path
              key={t.cle}
              d={t.d}
              className={[
                'piste',
                t.alimente ? 'piste--alimente' : '',
                !tracee ? 'piste--trace' : '',
                actif === null ? '' : actif === t.outil ? 'piste--allumee' : 'piste--eteinte',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ '--piste-len': t.len } as CSSProperties}
            />
          ))}
        </svg>

        <div className="relative grid gap-[24px] items-start" style={{ gridTemplateColumns: 'minmax(0,1fr)', zIndex: 1 }}>
          <div className="carte-grille grid gap-[24px] items-start">
            {/* LA SOURCE — les jeux de données, comptés, tronqués en le disant. */}
            <div ref={rail} className="flex carte-source" style={{ gap: 8 }}>
              <div className="gouttiere" aria-hidden="true">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i}>#</div>
                ))}
              </div>
              <div className="flex flex-col grow" style={{ borderLeft: '1px solid var(--line)' }}>
              <p className="t-data-sm m-0 px-[10px] pb-[8px]" style={{ color: 'var(--ink-2)' }}>
                {nJeux} jeux de données, en amont
              </p>
              <ul className="m-0 p-0 flex flex-col" style={{ listStyle: 'none' }}>
                {DONNEES.slice(0, empile ? 3 : 9).map((j) => (
                  <li key={j.cle} style={{ borderTop: '1px solid var(--line)' }}>
                    <a
                      href={`#donnees-${j.cle}`}
                      className="noeud-donnee t-data-sm px-[10px] py-[7px] hex no-underline block"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      {j.nom}
                    </a>
                  </li>
                ))}
                <li
                  className="t-data-sm px-[10px] py-[5px]"
                  style={{ color: 'var(--ink-2)', borderTop: '1px solid var(--line)' }}
                >
                  et {nJeux - (empile ? 3 : 9)} autres, plus bas
                </li>
              </ul>
              </div>
            </div>

            {/* L'ORCHESTRATEUR. Le seul bloc qui porte une séquence, donc le seul qui a des
                numéros d'étape : six étapes sous une seule horloge. */}
            <div
              ref={chaine}
              className="flex flex-col justify-between self-center carte-chaine"
              style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', minHeight: 148 }}
            >
              <div className="px-[14px] pt-[12px]">
                <p className="t-title m-0" style={{ fontFamily: 'var(--prose)', fontWeight: 600 }}>
                  La chaîne
                </p>
                {/* L'HORLOGE REELLE, pas le mot « horloge » : le compte d'etapes vertes sur le
                    total, et la duree bout en bout. Les deux viennent de `facts.chaine`, lu au
                    build depuis `docs/dataset/chaine-complete.json`. */}
                <p className="t-data m-0 pt-[4px]" style={{ color: 'var(--ink)' }}>
                  {ch ? `${ch.n_ok}/${ch.n_total} étapes en ${msFr(ch.duree_ms)}` : '—'}
                </p>
                <p className="m-0 pt-[3px]" style={{ fontFamily: 'var(--prose)', fontSize: 13, lineHeight: '18px', color: 'var(--ink-2)' }}>
                  {ch?.complete ? 'bout en bout, sous une seule horloge' : 'une étape n’a pas tourné'}
                </p>
              </div>
              {/* Une graduation par etape, haute comme le temps qu'elle a pris. L'escalier
                  croissant d'avant n'encodait rien ; celui-ci encode `a_ms`. */}
              <ul
                className="flex items-end gap-[4px] px-[14px] pb-[12px] m-0"
                style={{ listStyle: 'none', height: (empile ? 22 : 40) + 12, marginTop: 10 }}
              >
                {durees.map((d) => (
                  <li
                    key={d.n}
                    title={`${d.n} · ${d.quoi} — ${msFr(d.ms)}`}
                    style={{
                      width: 6,
                      height: Math.max(3, Math.round((d.ms / maxMs) * (empile ? 22 : 40))),
                      background: d.etat === 'OK' ? 'var(--ink-2)' : 'var(--ink-4)',
                    }}
                  />
                ))}
              </ul>
            </div>

            {/* Empile, le rail des donnees descend sous les outils : un compteur prend sa place
                dans le premier ecran, et il mene au recensement complet. */}
            <a href="#donnees" className="carte-compteur t-data-sm no-underline px-[10px] py-[8px]"
               style={{ color: 'var(--ink-2)', border: '1px solid var(--line)', minHeight: 44, display: 'none', alignItems: 'center' }}>
              {nJeux} jeux de données, en amont
            </a>

            {/* LES QUATORZE OUTILS, groupés par famille : trois colonnes qui disent ce que la
                couleur dit déjà. */}
            <div className="grid gap-[16px] carte-outils" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              {ORDRE.map((f) => (
                <div key={f} className="flex flex-col gap-[8px]">
                  {OUTILS.filter((o) => o.famille === f).map((o) => (
                    <a
                      key={o.n}
                      ref={(el) => {
                        if (el) noeuds.current.set(o.n, el)
                        else noeuds.current.delete(o.n)
                      }}
                      href={`#/outil/${o.n}`}
                      onClick={(e) => {
                        // Un clic modifie (Cmd, Ctrl, Maj, molette) doit garder son comportement
                        // natif : ouvrir dans un onglet. On n'intercepte que le clic nu.
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                        e.preventDefault()
                        surOutil(o.n)
                      }}
                      onMouseEnter={() => setActif(o.n)}
                      onMouseLeave={() => setActif(null)}
                      onFocus={() => setActif(o.n)}
                      onBlur={() => setActif(null)}
                      className="noeud flex items-stretch no-underline"
                      style={{
                        background: 'var(--bg-1)',
                        border: '1px solid var(--line)',
                        borderLeft: `3px solid ${COULEUR[f]}`,
                        minHeight: 44,
                        color: 'inherit',
                      }}
                    >
                      <span className="flex flex-col justify-center px-[10px] py-[7px]">
                        <span className="t-data" style={{ color: 'var(--ink)' }}>
                          <span style={{ color: 'var(--ink-2)', paddingRight: 10 }}>{o.n}</span>
                          {o.nom}
                        </span>
                        <span className="noeud-meta t-data-sm" style={{ color: 'var(--ink-2)' }}>
                          {meta(o)}
                        </span>
                      </span>
                    </a>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* L'ECART, une fois par ecran, dans le seul role `display` de la charte.
          C'est la PAIRE qui est montree, pas un extreme : le meme swap cote deux fois, une
          fois avec le hook en place, une fois contre un talon inerte de 89 octets — et la
          difference. Les deux cotations viennent de `facts.execution`, la porte A4, le seul
          endroit du depot ou une cotation devient un swap reellement execute. */}
      {paire && (
        <div ref={cadreFigure} className="relative pt-[28px] mt-[28px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
          {/* La piste continue : elle sort de la carte, franchit le filet de section et vient
              se brancher sur la figure. C'est ce qui fait que la page entiere a l'air cablee
              plutot qu'empilee. */}
          <svg
            aria-hidden="true"
            className="absolute pointer-events-none"
            width="16"
            height={Math.max(1, fil)}
            viewBox={`0 0 16 ${Math.max(1, fil)}`}
            style={{ left: 0, top: -28 }}
          >
            {/* le fil, puis le segment perpendiculaire de 6 px qui marque la jonction */}
            <path className="piste" d={`M 2 0 V ${Math.max(1, fil - 3)}`} />
            <path className="piste" d={`M 0 ${Math.max(1, fil - 3)} H 6`} />
          </svg>
          <div className="flex flex-wrap items-end gap-x-[40px] gap-y-[16px]">
            <dl className="m-0 grid gap-[10px]" style={{ minWidth: 250 }}>
              <div>
                <dt className="t-data-sm m-0" style={{ color: 'var(--ink-2)' }}>
                  reçu avec le hook en place
                </dt>
                <dd className="t-data-lg m-0" style={{ color: 'var(--ink)' }}>
                  <span ref={nuancier} aria-hidden="true" style={{ width: 24, height: 8, background: 'var(--ink)', display: 'inline-block', marginRight: 8 }} />
                  {paire.avec}
                </dd>
              </div>
              <div>
                <dt className="t-data-sm m-0" style={{ color: 'var(--ink-2)' }}>
                  reçu contre 89 octets inertes
                </dt>
                <dd className="t-data-lg m-0" style={{ color: 'var(--ink-2)' }}>
                  <span aria-hidden="true" style={{ width: 24, height: 8, background: 'var(--baseline)', display: 'inline-block', marginRight: 8 }} />
                  {paire.sans}
                </dd>
              </div>
            </dl>
            <output className="t-display" style={{ color: 'var(--ink)' }}>
              {paire.bps}
            </output>
            <p
              className="m-0"
              style={{ fontFamily: 'var(--prose)', fontSize: 16, lineHeight: 1.5, color: 'var(--ink-2)', maxWidth: '34ch' }}
            >
              bps, l’écart entre les deux. C’est ce que le hook a pris, sur un swap réellement
              exécuté puis reconfronté à sa cotation.
            </p>
          </div>
          <p className="t-data-sm m-0 pt-[12px] hex" style={{ color: 'var(--ink-2)' }}>
            en wei, tels que le fork les rend : {paire.avecWei} contre {paire.sansWei}
          </p>
        </div>
      )}

    </section>
  )
}
