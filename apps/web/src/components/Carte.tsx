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
import { OUTILS, FAMILLES, type Famille, type Outil } from '../lib/outils'
import { DONNEES, luPar } from '../lib/donnees'
import { dataset } from '../lib/dataset'
import symboles from '../data/symboles.json'
import { MONNAIES_DE_COTATION } from '../lib/exit'
import { ouAcheter, aMontrer, lpFeeBps } from '../lib/portes'
import { groupDigits } from '../lib/format'
import facts from '../data/facts.json'
import { Raisonnement } from './Raisonnement'

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
  collecte: 'fetches a piece of data',
  analyse: 'interprets',
  action: 'changes something',
}

const ORDRE: Famille[] = ['collecte', 'analyse', 'action']

/** « 13 680 ms » — en millisecondes, comme la chaine les mesure. Arrondir a « 13,7 s »
    perdrait la precision que le fichier porte, sur un produit dont c'est tout le propos. */
const msFr = (ms: number | null): string => (ms === null ? '—' : `${ms.toLocaleString('fr')} ms`)

/** Une seule ligne de métadonnée par nœud — l'anatomie de la référence, rien de plus. */
function meta(o: Outil): string {
  const n = luPar(o.n).length
  const jeux = n === 0 ? 'no dataset read' : n === 1 ? '1 dataset read' : `${n} datasets read`
  if (o.etat === 'pret') return jeux
  if (o.etat === 'hors_ligne') return `${jeux}, offline`
  return `${jeux}, pending`
}

interface Trace {
  cle: string
  d: string
  outil: number | null
  alimente: boolean
  len: number
  /** le tracé du chargement part famille par famille : collecte, analyse, action */
  delai: number
  /** LA COULEUR DE LA PISTE. Une piste grise parmi quarante ne se suit pas ; une piste qui
      porte la couleur de la famille qu'elle dessert se suit du doigt, de l'orchestrateur
      jusqu'à son outil. C'est le même encodage que partout : ce que l'outil fait au monde. */
  couleur: string
}

const DELAI: Record<Famille, number> = { collecte: 0, analyse: 150, action: 300 }

const court = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

/**
 * LES JETONS QU'ON PROPOSE — ceux sur lesquels la question SE POSE.
 *
 * Proposer le jeton le plus present du corpus ne sert a rien : 97,2 % des jetons n'ont qu'une
 * porte, et la reponse est alors « il n'y a qu'une porte ». On ne propose donc que des jetons
 * pour lesquels DEUX portes au moins sont mesurees dans la meme monnaie et a la meme taille —
 * les seuls ou la comparaison existe. Le tri se fait en UNE passe sur le corpus.
 */
/**
 * LE SYMBOLE D'UN JETON — LU SUR LA CHAINE, jamais devine.
 *
 * Le corpus ne porte que des adresses. « 0xb200…4199 » a l'ecran ne dit pas quoi coller. Mais
 * ecrire un nom parce que l'adresse y ressemble serait la faute meme que ce projet reproche au
 * reste : `scripts/fetch-symboles.mjs` appelle donc `symbol()` et `name()` sur un vrai noeud
 * Base, une fois, et le resultat est commite. Un jeton illisible reste sans nom — il n'en
 * recoit pas un joli par defaut.
 */
const SYM: Record<string, { symbole: string | null; nom: string | null }> =
  (symboles as { jetons: Record<string, { symbole: string | null; nom: string | null }> }).jetons

export const symbole = (adresse: string): string | null =>
  SYM[adresse.toLowerCase()]?.symbole ?? null

function jetonsProposes(max = 3): { adresse: string; ecart: number }[] {
  const groupes = new Map<string, Map<string, number>>()
  for (const r of dataset.rows) {
    if (r.label !== 'MESURE' || r.bps === null || r.stored_lp_fee === null) continue
    for (const [t, autre] of [
      [r.currency0, r.currency1],
      [r.currency1, r.currency0],
    ] as [string, string][]) {
      const jeton = t.toLowerCase()
      if (jeton in MONNAIES_DE_COTATION) continue
      const cle = `${jeton}|${autre.toLowerCase()}|${r.amount_in}`
      const m = groupes.get(cle) ?? new Map<string, number>()
      m.set(r.pool_id, lpFeeBps(r.stored_lp_fee) + r.bps)
      groupes.set(cle, m)
    }
  }
  const ecarts = new Map<string, number>()
  for (const [cle, pools] of groupes) {
    if (pools.size < 2) continue
    const v = [...pools.values()]
    const jeton = cle.slice(0, cle.indexOf('|'))
    ecarts.set(jeton, Math.max(ecarts.get(jeton) ?? 0, Math.max(...v) - Math.min(...v)))
  }
  return [...ecarts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, max)
    .map(([adresse, ecart]) => ({ adresse, ecart }))
}

/** « smooth », sauf si la personne a demande moins de mouvement — alors on saute. */
export function doux(): ScrollBehavior {
  return typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ? 'auto'
    : 'smooth'
}

export function Carte({
  surOutil,
  saisie,
  setSaisie,
}: {
  surOutil: (n: number) => void
  saisie: string
  setSaisie: (v: string) => void
}) {
  const boite = useRef<HTMLDivElement | null>(null)
  const champ = useRef<HTMLInputElement | null>(null)
  const chaine = useRef<HTMLDivElement | null>(null)
  const rail = useRef<HTMLDivElement | null>(null)
  const noeuds = useRef(new Map<number, HTMLAnchorElement>())
  const [traces, setTraces] = useState<Trace[]>([])
  const [taille, setTaille] = useState({ w: 0, h: 0 })
  const [actif, setActif] = useState<number | null>(null)
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
        const fam = OUTILS.find((o) => o.n === n)?.famille ?? 'collecte'
        out.push({
          cle: `o${n}`,
          d,
          outil: n,
          alimente: false,
          len: longueur(d),
          delai: DELAI[fam],
          couleur: COULEUR[fam],
        })
      }
    }

    // Le rail des jeux de données alimente l'orchestrateur : tirets, pas trait plein. Il n'a
    // de sens que quand le rail est a gauche de l'orchestrateur ; empile, les deux se suivent.
    const rl = rail.current
    if (rl) {
      const r = rel(rl.getBoundingClientRect())
      if (r.x + r.width <= rch.x + 1) {
        const d = `M ${r.x + r.width} ${r.y + 14} H ${r.x + r.width + 14} V ${rch.y + rch.height / 2} H ${rch.x}`
        out.push({
          cle: 'rail',
          d,
          outil: null,
          alimente: true,
          len: longueur(d),
          delai: 0,
          couleur: 'var(--line-strong)',
        })
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

  // Le tracé n'a lieu qu'une fois, au premier rendu. Un recalcul de mise en page ne doit pas
  // relancer une animation : rien ne rejoue derrière le dos du lecteur.
  useEffect(() => {
    const t = window.setTimeout(() => setTracee(true), 700)
    return () => window.clearTimeout(t)
  }, [])

  const ch = facts.chaine
  const nJeux = DONNEES.length

  /** L'adresse est-elle lisible ? */
  const jeton = saisie.trim().toLowerCase()
  const valide = /^0x[0-9a-fA-F]{40}$/.test(jeton)
  const demos = useMemo(() => jetonsProposes(), [])

  /**
   * LA REPONSE, calculee ici et affichee ici.
   *
   * La section d'operation qui vivait sous la carte a disparu : la barre du hero la remplace,
   * et c'est le bloc de droite qui repond — le meme endroit ou se lit, par defaut, l'ecart de
   * la porte A4. Un refus motive (« il n'y a qu'une porte ») prend la meme place que le
   * succes : c'est une reponse, pas un trou.
   */
  const recherche = useMemo(
    () => (valide ? ouAcheter(dataset.rows, jeton) : null),
    [jeton, valide],
  )

  const reponse = useMemo(() => {
    const r = recherche
    if (!r) return null
    const vue = aMontrer(r)
    const g = vue.montres.find((x) => x.classees.length >= 2 && x.ecart_bps !== null)
    if (g) {
      return {
        quoi: 'ecart' as const,
        ecart: g.ecart_bps!.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        bas: g.classees[0]!.totalBps!.toFixed(2),
        haut: g.classees[g.classees.length - 1]!.totalBps!.toFixed(2),
        portes: g.classees.length,
        monnaie: g.paieAvecNom ?? court(g.paieAvec),
      }
    }
    return { quoi: 'refus' as const, etat: r.etat.replace(/_/g, ' ').toLowerCase(), raison: r.raison }
  }, [recherche])

  /** La carte est dans le premier écran : le repère de défilement mène donc à ce qui vient
      après elle, l'opération. Le defilement doux est un mouvement : sous
      `prefers-reduced-motion`, il saute. */
  const versSuite = useCallback(() => {
    document.getElementById('operation')?.scrollIntoView({ block: 'start', behavior: doux() })
  }, [])

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
      avec: `${sur100.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      sans: '100.00',
      bps: (e.bps_publies ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      avecWei: groupDigits(e.avec_hook.cote),
      sansWei: groupDigits(e.avec_talon.cote),
    }
  }, [])

  return (
    <section aria-labelledby="carte-titre" className="flex flex-col" style={{ gap: 64 }}>
      {/* LE HERO. Trois choses dans le premier écran, et les trois interactions avec elles :
          le titre, le champ où l'on colle une adresse (on agit), l'écart déjà mesuré (on lit),
          et en bas le repère de défilement (on descend). Derrière, le champ de câblage. */}
      <div className="hero-cadre">
        <div className="flex flex-col" style={{ gap: 24 }}>
          <div className="hero">
            <div className="flex flex-col" style={{ gap: 16 }}>
              {/* Deux lignes, pas trois : le premier ecran doit porter AUSSI la carte entiere,
                  et c'est elle qui ne se reduit pas. La glose qui suivait le titre disait ce que
                  la mesure, a droite, montre deja. */}
              <h1 id="carte-titre" className="t-display m-0" style={{ maxWidth: '21ch' }}>
                What a hook really takes on a swap.
              </h1>

              {/* PREMIÈRE INTERACTION : coller une adresse. C'est l'action primaire de la page,
                  et le seul bouton orange du site. La recherche se fait sur le corpus embarqué :
                  aucune requête, et la réponse s'écrit dans la section juste dessous. */}
              <form
                className="hero-saisie flex flex-wrap items-end"
                style={{ gap: 12, rowGap: 6 }}
                onSubmit={(e) => {
                  e.preventDefault()
                  // La reponse s'ecrit a droite, dans le meme ecran : il n'y a nulle part ou
                  // aller. Le bouton sert donc a revenir a la mesure de reference.
                  if (saisie) {
                    setSaisie('')
                    champ.current?.focus()
                  }
                }}
              >
                <div className="flex flex-col grow" style={{ gap: 6, minWidth: 0, flexBasis: 320 }}>
                  <label className="t-body t-body-muted" htmlFor="jeton-hero" style={{ fontSize: 14 }}>
                    paste a token address, read what it costs
                  </label>
                  <input
                    id="jeton-hero"
                    name="jeton"
                    value={saisie}
                    onChange={(e) => setSaisie(e.target.value)}
                    spellCheck={false}
                    autoComplete="off"
                    translate="no"
                    inputMode="text"
                    aria-describedby="jeton-hero-aide"
                    aria-invalid={saisie.length > 0 && !valide}
                    ref={champ}
                    placeholder="0x2eb2… 40 characters after 0x"
                    className="t-data hex champ"
                  />
                </div>
                <button type="submit" className="bouton-primaire">
                  {saisie ? 'start over' : 'see what it costs'}
                </button>
                {/* L'aide et les jetons de demonstration partagent la ligne du dessous : la
                    barre remplace la section d'operation, il faut donc pouvoir essayer sans
                    aller chercher une adresse ailleurs. */}
                <span className="hero-aide flex flex-wrap items-center" style={{ gap: 10, flexBasis: '100%' }}>
                  <span id="jeton-hero-aide" className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                    {saisie.length > 0 && !valide
                      ? 'an ERC-20 contract address on Base: 0x followed by 40 hexadecimal characters'
                      : valide
                        ? 'computed here, on the embedded corpus — no request'
                        : 'nothing is sent, the corpus is in the page — or try one of these three measured tokens'}
                  </span>
                  {!saisie &&
                    demos.map((d) => (
                      <button
                        key={d.adresse}
                        type="button"
                        className="jeton-demo t-data-sm"
                        onClick={() => setSaisie(d.adresse)}
                        title={`${d.adresse} — ${d.ecart.toFixed(2)} bps between its cheapest and its most expensive door`}
                      >
                        {/* L'ADRESSE SEULE NE DIT PAS QUOI CLIQUER. Le depot n'a aucune table de
                            symboles : ecrire « USDC » serait invente. On affiche donc ce qu'on
                            SAIT de ce jeton — l'ecart entre ses portes — et c'est justement la
                            raison pour laquelle il est propose. */}
                        {symbole(d.adresse) ? (
                          <strong style={{ color: 'var(--ink)' }}>{symbole(d.adresse)}</strong>
                        ) : (
                          <span className="hex">{court(d.adresse)}</span>
                        )}
                        <span style={{ color: 'var(--m-6)', marginLeft: 6 }}>
                          {d.ecart.toFixed(0)} bps gap
                        </span>
                      </button>
                    ))}
                </span>
              </form>
            </div>

            {/* L'ÉCART, dans le premier écran : c'est ce que le produit mesure, et il se lit
                avant tout le reste. Les deux cotations viennent de `facts.execution`, la porte
                A4 — un swap réellement exécuté sur Base, coté deux fois sur le fork. */}
            <div className="hero-mesure flex flex-col" style={{ gap: 6 }} aria-live="polite">
              {/* L'AGENT AU TRAVAIL. Les cinq etapes que `ouAcheter()` execute vraiment,
                  rendues visibles. Ce n'est pas une decoration : chaque ligne correspond a une
                  passe que le code fait, avec le nombre qu'elle a produit. */}
              {valide && <Raisonnement jeton={jeton} recherche={recherche} />}
              {reponse?.quoi === 'refus' ? (
                <>
                  <p className="t-title m-0" style={{ color: 'var(--ink)' }}>
                    {reponse.etat}
                  </p>
                  <p className="t-body m-0 t-body-muted" style={{ maxWidth: '34ch' }}>
                    {reponse.raison}
                  </p>
                </>
              ) : reponse?.quoi === 'ecart' ? (
                <>
                  <output className="t-number m-0" style={{ color: 'var(--ink)' }}>
                    {reponse.ecart}
                  </output>
                  <p className="t-body m-0 t-body-muted" style={{ maxWidth: '34ch' }}>
                    bps between its {reponse.portes} doors, paid in {reponse.monnaie}: from{' '}
                    <span className="t-data" style={{ color: 'var(--ink)' }}>{reponse.bas}</span> to{' '}
                    <span className="t-data">{reponse.haut}</span> bps depending on which one you take.
                  </p>
                </>
              ) : (
                paire && (
                  <>
                    <output className="t-number m-0" style={{ color: 'var(--ink)' }}>
                      {paire.bps}
                    </output>
                    <p className="t-body m-0 t-body-muted" style={{ maxWidth: '34ch' }}>
                      bps taken on a swap that really ran: {' '}
                      <span className="t-data" style={{ color: 'var(--ink)' }}>{paire.avec}</span> is
                      left instead of <span className="t-data">{paire.sans}</span>, to within 89 inert bytes.
                    </p>
                  </>
                )
              )}
            </div>
          </div>

          {/* L'ENCEINTE : la carte entière sur une surface un cran plus claire, cadrée d'un filet.
          Elle est DANS le premier écran, avec le titre, la mesure et le champ : le schéma ne se
          réduit pas, c'est la mesure et le champ qui se compactent autour de lui. */}
          <div className="enceinte">
        <div className="flex flex-wrap items-baseline justify-between gap-x-[24px] gap-y-[6px] pb-[14px]">
          <div className="flex flex-wrap items-baseline" style={{ gap: 12 }}>
            <h2 className="t-headline m-0" style={{ fontSize: '1.25rem' }}>
              The chain and its {OUTILS.length} tools
            </h2>
            {/* DEUXIÈME INTERACTION, écrite : un nœud s'ouvre. */}
            <span className="t-body t-body-muted" style={{ fontSize: 13 }}>
              clicking a tool opens its page, hovering lights its path
            </span>
          </div>
          <dl className="legende m-0 p-0 flex flex-wrap items-baseline" style={{ gap: 16 }}>
            {ORDRE.map((f) => (
              <div key={f} className="flex items-baseline" style={{ gap: 8 }}>
                <span aria-hidden="true" className="nuancier" style={{ background: COULEUR[f], height: 6 }} />
                <dt className="legende-nom m-0" style={{ fontSize: 14 }}>{FAMILLES[f].nom}</dt>
                <dd className="legende-glose m-0 t-body-muted" style={{ fontSize: 13 }}>
                  {QUOI[f]}
                </dd>
              </div>
            ))}
          </dl>
        </div>

      <div ref={boite} className="relative grid" style={{ gridTemplateColumns: 'minmax(0, 1fr)' }}>
        <svg
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none"
          width={taille.w}
          height={taille.h}
          viewBox={`0 0 ${taille.w} ${taille.h}`}
          style={{ zIndex: 0 }}
        >
          {traces.map((t) => (
            <g key={t.cle}>
              <path
                d={t.d}
                className={[
                  'piste',
                  t.alimente ? 'piste--alimente' : '',
                  !tracee ? 'piste--trace' : '',
                  actif === null ? '' : actif === t.outil ? 'piste--allumee' : 'piste--eteinte',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={
                  {
                    '--piste-len': t.len,
                    '--piste-delay': `${t.delai}ms`,
                    '--piste-couleur': t.couleur,
                  } as CSSProperties
                }
              />
              {/* LE FLUX : un tiret court qui descend de l'orchestrateur vers l'outil, en
                  continu. C'est le seul mouvement de la carte après le tracé initial, et il
                  dit ce que le schéma ne peut pas dire : ça circule. Il s'arrête sous
                  `prefers-reduced-motion`, et il ne part qu'une fois le tracé fini. */}
              {!t.alimente && tracee && (
                <path
                  d={t.d}
                  className={[
                    'flux',
                    actif === null ? '' : actif === t.outil ? 'flux--allume' : 'flux--eteint',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={
                    {
                      '--piste-len': t.len,
                      '--piste-delay': `${t.delai}ms`,
                      '--piste-couleur': t.couleur,
                    } as CSSProperties
                  }
                />
              )}
            </g>
          ))}
        </svg>

        <div className="relative grid items-start" style={{ gridTemplateColumns: 'minmax(0,1fr)', zIndex: 1 }}>
          <div className="carte-grille grid items-start">
            {/* LA SOURCE : les jeux de données, comptés, tronqués en le disant. */}
            <div ref={rail} className="flex flex-col carte-source">
              <p className="t-data-sm m-0 pb-[8px]" style={{ color: 'var(--ink-2)' }}>
                {nJeux} datasets
              </p>
              <ul className="m-0 p-0 flex flex-col" style={{ listStyle: 'none', borderTop: '1px solid var(--line)' }}>
                {DONNEES.slice(0, empile ? 3 : 6).map((j) => (
                  <li key={j.cle} style={{ borderBottom: '1px solid var(--line)' }}>
                    <a
                      href={`#donnees-${j.cle}`}
                      className="noeud-donnee t-data-sm py-[6px] hex no-underline block"
                      style={{ color: 'var(--ink-2)' }}
                    >
                      {j.nom}
                    </a>
                  </li>
                ))}
                <li className="t-data-sm py-[6px]" style={{ color: 'var(--ink-2)' }}>
                  and {nJeux - (empile ? 3 : 6)} more, further down
                </li>
              </ul>
            </div>

            {/* L'ORCHESTRATEUR : la plaque large, la seule qui porte une séquence. */}
            <div
              ref={chaine}
              className="plaque plaque-orch flex flex-col justify-between self-center carte-chaine relative"
              style={{ minHeight: 134 }}
            >
              {ORDRE.map((f, i) => (
                <span
                  key={f}
                  className="plaque-port plaque-port--sortie"
                  aria-hidden="true"
                  style={{ background: COULEUR[f], top: `${34 + i * 22}%` }}
                />
              ))}
              <div className="px-[16px] pt-[14px]">
                <p className="t-headline m-0" style={{ fontSize: '1.25rem' }}>
                  The chain
                </p>
                <p className="t-data m-0 pt-[6px]" style={{ color: 'var(--ink)' }}>
                  {ch ? `${ch.n_ok}/${ch.n_total} steps in ${msFr(ch.duree_ms)}` : '—'}
                </p>
                <p className="m-0 pt-[2px] t-body-muted" style={{ fontSize: 13, lineHeight: 1.4 }}>
                  {ch?.complete ? 'end to end, under a single clock' : 'one step did not run'}
                </p>
              </div>
              <ul
                className="flex items-end gap-[4px] px-[16px] pb-[14px] m-0"
                style={{ listStyle: 'none', height: (empile ? 22 : 40) + 14, marginTop: 10 }}
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

            {/* Empilé, le rail descend sous les outils : un compteur prend sa place. */}
            <a href="#donnees" className="carte-compteur t-data-sm no-underline px-[10px] py-[8px]"
               style={{ color: 'var(--ink-2)', border: '1px solid var(--line)', minHeight: 44, display: 'none', alignItems: 'center' }}>
              {nJeux} datasets, upstream
            </a>

            {/* LES QUATORZE PLAQUES, trois colonnes de famille. */}
            <div className="grid gap-[12px] carte-outils" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(174px, 1fr))' }}>
              {ORDRE.map((f) => (
                <div key={f} className="flex flex-col gap-[4px]">
                  {OUTILS.filter((o) => o.famille === f).map((o) => (
                    <a
                      key={o.n}
                      ref={(el) => {
                        if (el) noeuds.current.set(o.n, el)
                        else noeuds.current.delete(o.n)
                      }}
                      href={`#/outil/${o.n}`}
                      onClick={(e) => {
                        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                        e.preventDefault()
                        surOutil(o.n)
                      }}
                      onMouseEnter={() => setActif(o.n)}
                      onMouseLeave={() => setActif(null)}
                      onFocus={() => setActif(o.n)}
                      onBlur={() => setActif(null)}
                      className="plaque noeud flex items-stretch no-underline"
                      style={{
                        borderLeft: `3px solid ${COULEUR[f]}`,
                        minHeight: 44,
                        color: 'inherit',
                      }}
                    >
                      {/* LE PORT : le carré de 7 px où le câble se branche. Il dit qu'une
                          plaque est un nœud connecté, et pas une case dans une liste. */}
                      <span className="plaque-port" aria-hidden="true" style={{ background: COULEUR[f] }} />
                      <span className="flex flex-col justify-center px-[11px] py-[6px] grow" style={{ gap: 0, minWidth: 0 }}>
                        <span className="flex items-baseline" style={{ gap: 10 }}>
                          <span className="t-data-sm" style={{ color: 'var(--ink-2)', minWidth: 16 }}>{o.n}</span>
                          <span className="plaque-titre">{o.nom}</span>
                          {/* la deuxième interaction, montrée : au survol, le chevron dit que
                              la plaque s'ouvre sur la page de l'outil */}
                          <span className="plaque-chevron" aria-hidden="true">›</span>
                        </span>
                        <span className="noeud-meta t-data-sm" style={{ color: 'var(--ink-2)', paddingLeft: 26 }}>
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
          </div>

          {/* TROISIÈME INTERACTION : descendre. Le segment tombe en boucle dans son trait, et
              le bouton défile jusqu'à la section suivante. Immobile sous mouvement réduit. */}
          <button type="button" className="scroll-cue" onClick={versSuite}>
            <span className="scroll-cue-trait" aria-hidden="true">
              <span className="scroll-cue-pion" />
            </span>
            <span className="t-data-sm">
              further down: why TARE exists, the five ways in, and which data serves which tool
            </span>
          </button>
        </div>
      </div>
    </section>
  )
}
