import { useEffect, useMemo, useRef, useState } from 'react'
import { dataset } from './lib/dataset'
import { PALIERS } from './lib/ramp'
import { fmtBlock } from './lib/format'
import { HookTable } from './components/Table'
import { Detail } from './components/Detail'
import { LedWidget } from './components/Led'
import { RoutePanel } from './components/Route'
import { ExitPanel } from './components/Exit'
import { GraphPanels } from './components/Graph'
import { MachinePanels } from './components/Machine'
import { ComptePanel } from './components/Compte'
import { SubstituerPanel } from './components/Substituer'
import { AccesPanel, DonneesPanel, Pourquoi } from './components/Accueil'
import { IndexPanneaux } from './components/Index'
import { Carte } from './components/Carte'
import { OutilPanel } from './components/Outil'
import { Portefeuilles } from './compte/wallet'
import { DeckPage } from './components/Deck'
import { OUTILS } from './lib/outils'
import { COULEUR as COULEUR_FAM, ORDRE as ORDRE_FAM } from './components/familles'
import { Reveal, Route as RouteMotion } from './components/Motion'
import FA from './data/facts.json'
import { Panel } from './components/Prim'
import { Chat } from './chat/Chat'
import { buildModel } from './chat/model'
import { decodeView, select } from './chat/engine'
import { EMPTY_VIEW, type ChatView } from './chat/types'

// LA REGLE ABSOLUE : un verdict utile a l'ecran en moins de 5 secondes, sans wallet, sans clic,
// sans inscription. Tout ce qui est ci-dessous est deja dans le paquet JS : aucune requete reseau
// n'est necessaire pour lire le tableau.

const P = dataset.provenance
const T = dataset.totals

/**
 * LA BARRE HAUTE.
 *
 * Elle portait la provenance entière en chaîne de points médians — `base · chainid 8453 ·
 * bloc 50 614 000 · tare-engine/0.3.0 · stub 0x8e… · registre ccab541 · 757 fiches`. C'est le
 * tell le plus net d'une page générée, et cette même provenance est déjà écrite cinq autres
 * fois plus bas. Elle passe dans un dépliant, en paires libellé/valeur, et la barre ne garde
 * que ce qui sert à naviguer.
 */
/**
 * LE LIEN D'EVITEMENT. Il ne se voit qu'au clavier, et il fait gagner dix-sept tabulations
 * sur `#/instrument`, ou le sommaire vient avant le premier panneau.
 */
function Evitement() {
  return (
    <a
      href="#contenu"
      className="t-data-sm"
      style={{
        position: 'absolute',
        left: 8,
        top: -60,
        zIndex: 30,
        padding: '10px 12px',
        minHeight: 44,
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--bg-1)',
        border: '1px solid var(--line-strong)',
        color: 'var(--ink)',
        textDecoration: 'none',
      }}
      onClick={(e) => {
        // Le fragment porte la ROUTE : poser `#contenu` sortirait de la page qu'on evite de
        // traverser. On amene donc le focus a la main, sans toucher a l'adresse.
        e.preventDefault()
        const m = document.getElementById('contenu')
        if (!m) return
        m.setAttribute('tabindex', '-1')
        m.focus()
        m.scrollIntoView({ block: 'start' })
      }}
      onFocus={(e) => {
        e.currentTarget.style.top = '8px'
      }}
      onBlur={(e) => {
        e.currentTarget.style.top = '-60px'
      }}
    >
      aller au contenu
    </a>
  )
}

/**
 * LE MENU DES QUATORZE OUTILS, dans la barre haute.
 *
 * On y arrivait par la carte, et seulement par elle : depuis une page d'outil ou depuis
 * l'instrument, il fallait remonter à l'accueil pour en ouvrir un autre. Le menu les donne
 * tous, groupés par famille et dans leur couleur, depuis n'importe quelle route.
 */
function MenuOutils({ n, aller }: { n: number | null; aller: (n: number) => void }) {
  const ref = useRef<HTMLDetailsElement | null>(null)
  // Un menu qui reste ouvert derriere la page qu'il vient d'ouvrir est un menu qu'on ferme a
  // la main : on le referme au clic et a l'echappement.
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && ref.current?.open) ref.current.open = false
    }
    const surClic = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false
    }
    document.addEventListener('keydown', surTouche)
    document.addEventListener('click', surClic)
    return () => {
      document.removeEventListener('keydown', surTouche)
      document.removeEventListener('click', surClic)
    }
  }, [])

  return (
    <details ref={ref} className="relative menu-outils">
      <summary className="nav-lien cursor-pointer list-none inline-flex items-center" style={{ gap: 7 }}>
        les outils
        <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>{OUTILS.length}</span>
      </summary>
      <div className="menu-panneau" role="group" aria-label="les quatorze outils">
        {ORDRE_FAM.map((f) => (
          <div key={f} className="flex flex-col" style={{ gap: 2 }}>
            <span className="t-data-sm flex items-center" style={{ gap: 8, color: 'var(--ink-2)', padding: '2px 0 6px' }}>
              <span aria-hidden="true" style={{ width: 10, height: 3, background: COULEUR_FAM[f], display: 'inline-block' }} />
              {f}
            </span>
            {OUTILS.filter((o) => o.famille === f).map((o) => (
              <a
                key={o.n}
                href={`#/outil/${o.n}`}
                aria-current={o.n === n ? 'page' : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                  e.preventDefault()
                  if (ref.current) ref.current.open = false
                  aller(o.n)
                }}
                className="menu-ligne no-underline flex items-baseline"
                style={{ gap: 10, color: o.n === n ? 'var(--ink)' : 'var(--ink-2)' }}
                title={o.question}
              >
                <span className="t-data-sm" style={{ color: 'var(--ink-2)', minWidth: 16 }}>{o.n}</span>
                <span className="t-body" style={{ fontSize: 14 }}>{o.nom}</span>
              </a>
            ))}
          </div>
        ))}
      </div>
    </details>
  )
}

function Head({
  theme,
  setTheme,
  vue,
  versOutil,
}: {
  theme: string
  setTheme: (t: string) => void
  vue: Vue
  versOutil: (n: number) => void
}) {
  const paires: [string, string][] = [
    ['chaîne', `base, chainid ${P.measurements.chain_ids.join(', ')}`],
    ['bloc épinglé', P.measurements.blocks.map(fmtBlock).join(', ')],
    ['moteur', P.measurements.engine_ver],
    ['talon', P.measurements.stub_hash],
    ['registre', `${P.registry.commit.slice(0, 7)}, ${P.registry.entries} fiches`],
  ]
  const routes = [
    { h: '/', t: 'la carte', actif: vue.quoi === 'accueil' || vue.quoi === 'outil' },
    { h: '/instrument', t: "l'instrument", actif: vue.quoi === 'instrument' },
    { h: '/deck', t: 'le deck', actif: vue.quoi === 'deck' },
  ]
  return (
    <header
      className="sticky top-0 z-10"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}
    >
      <div className="flex items-center gap-[8px] px-[12px] sm:px-[24px] mx-auto w-full" style={{ maxWidth: 1360, minHeight: 56 }}>
        {/* La marque : en sans, comme la voix du produit. Plus de capitales chassées. */}
        <a href="#/" className="no-underline" translate="no" style={{ color: 'var(--ink)', fontFamily: 'var(--prose)', fontWeight: 600, fontSize: 20, letterSpacing: '-0.01em' }}>
          TARE
        </a>
        {/* La barre porte une entree de plus depuis le deck : sous 400 px elle depassait la
            page. Elle defile donc DANS elle-meme, comme le bandeau d'onglets, au lieu de
            pousser la fenetre. */}
        <nav className="flex items-center gap-[2px] ml-[12px] nav-routes" aria-label="les vues">
          <MenuOutils n={vue.quoi === 'outil' ? vue.n : null} aller={versOutil} />
          {routes.map((x) => (
            <a
              key={x.h}
              href={`#${x.h}`}
              aria-current={x.actif ? 'page' : undefined}
              className="nav-lien"
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                e.preventDefault()
                window.location.hash = x.h
                window.scrollTo({ top: 0 })
              }}
            >
              {x.t}
            </a>
          ))}
        </nav>
        <details className="ml-auto relative nav-provenance">
          <summary className="bouton-ghost cursor-pointer list-none inline-flex items-center" style={{ minHeight: 32 }}>
            provenance
          </summary>
          <div
            className="absolute right-0 mt-[6px] p-[14px] grid gap-[8px]"
            style={{ background: 'var(--surface-2)', border: '1px solid var(--line-strong)', borderTopColor: 'var(--highlight)', zIndex: 20, minWidth: 320, maxWidth: 'calc(100vw - 32px)' }}
          >
            {paires.map(([k, v]) => (
              <div key={k} className="grid gap-[12px]" style={{ gridTemplateColumns: '96px minmax(0,1fr)' }}>
                <span className="t-body-muted" style={{ fontSize: 13 }}>{k}</span>
                <span className="t-data-sm hex" style={{ color: 'var(--ink)' }}>{v}</span>
              </div>
            ))}
          </div>
        </details>
        <button
          type="button"
          onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          className="bouton-ghost nav-theme"
          style={{ minHeight: 32, flexShrink: 0 }}
        >
          {theme === 'dark' ? 'clair' : 'sombre'}
        </button>
      </div>
    </header>
  )
}

/** Le verdict. Aucun de ces nombres n'est anime : ils sont ecrits, pas calcules a l'ecran. */
function Verdict() {
  const items: [string, string, string][] = [
    [String(T.over1bpsWithZeroStoredFee), 'mesures au-dessus de 1 bps', 'sur des pools dont la commission LP lue on-chain vaut ZERO'],
    [
      String(T.hooks),
      'hooks mesurés',
      `${T.pools.toLocaleString('fr')} pools, ${T.rows.toLocaleString('fr')} mesures, dont ${T.measured.toLocaleString('fr')} étiquetées MESURE`,
    ],
    // Ce nombre est calcule contre l'instantane EPINGLE du registre. Contre un tirage plus
    // recent il en vaut un autre, et le taire reviendrait a publier le plus flatteur des deux :
    // la note dit les deux, avec la date de chacun. Un registre qui gagne 198 adresses en un
    // jour n'est pas un fond stable, et c'est un fait sur le registre.
    [
      String(T.hooksAbsentFromRegistry),
      'de ces hooks sont absents du registre',
      FA.registre
        ? `${FA.registre.epingle.adresses} adresses au commit épinglé du ${FA.registre.epingle.le?.slice(0, 10)}. Contre le tirage du ${FA.registre.plus_recent.le} (${FA.registre.plus_recent.adresses} adresses), ils sont ${FA.registre.plus_recent.absents} : le registre en a inscrit ${FA.registre.gagnes.length} entre les deux.`
        : `${P.registry.entries} fiches, aucun champ numérique`,
    ],
    [
      String(P.registry.field_census.quantitative_fields.length),
      'champ quantitatif dans le registre',
      `${P.registry.field_census.leaf_fields} champs, ${P.registry.field_census.boolean_fields} booléens, 1 numérique (chainId, un identifiant de réseau)`,
    ],
  ]
  return (
    <section
      className="grid gap-px"
      style={{ background: 'var(--line)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
    >
      {items.map(([n, l, s]) => (
        <div key={l} className="px-[16px] py-[16px] flex flex-col" style={{ background: 'var(--surface-1)', gap: 4 }}>
          <div className="t-metric" style={{ color: 'var(--ink)' }}>
            {n}
          </div>
          <div className="t-body" style={{ fontSize: 14, color: 'var(--ink)' }}>
            {l}
          </div>
          <div className="t-body" style={{ fontSize: 13, lineHeight: 1.45, color: 'var(--ink-2)' }}>
            {s}
          </div>
        </div>
      ))}
    </section>
  )
}

function Legend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-[16px] gap-y-[6px] px-[16px] py-[8px]"
      style={{ borderTop: '1px solid var(--line)' }}
    >
      <span className="t-label" style={{ color: 'var(--ink-2)' }}>
        rampe · inferno [0,18 ; 0,90] · 7 paliers · encode bps et rien d'autre
      </span>
      {PALIERS.map((p) => (
        <span key={p.palier} className="t-data-xs inline-flex items-center gap-[5px]" style={{ color: 'var(--ink-2)' }}>
          <span
            style={{
              width: 22,
              height: 10,
              display: 'inline-block',
              background: `color-mix(in srgb, var(--m-${p.palier}) var(--mix), var(--bg-1))`,
              boxShadow: `inset 3px 0 0 var(--m-${p.palier})`,
            }}
          />
          {p.domain}
        </span>
      ))}
      <span className="t-data-xs w-full" style={{ color: 'var(--ink-2)' }}>
        ≠ — le registre est qualitatif&nbsp;: {P.registry.field_census.leaf_fields} champs,{' '}
        {P.registry.field_census.boolean_fields} booleens, un seul numerique (chainId). Aucun champ
        ne peut contredire la colonne de droite, parce qu'aucun champ ne chiffre quoi que ce soit.
      </span>
    </div>
  )
}

/**
 * LE ROUTEUR, en trois vues et sans dépendance.
 *
 *   #/            l'opération : on colle un jeton, on lit par où l'acheter
 *   #/outil/<n>   une page par outil, avec ce que cet outil PRODUIT
 *   #/instrument  les dix-sept panneaux d'analyse
 *
 * Le fragment porte déjà l'état de l'assistant, encodé sous `tare=` (voir chat/engine.ts).
 * Les chemins commencent donc par `/`, que ce décodeur-là ne peut pas confondre avec le sien.
 */
type Vue = { quoi: 'accueil' } | { quoi: 'instrument' } | { quoi: 'deck' } | { quoi: 'outil'; n: number }

function lireVue(hash: string): Vue {
  const m = /^#\/outil\/(\d+)/.exec(hash)
  if (m) {
    const n = Number(m[1])
    if (OUTILS.some((o) => o.n === n)) return { quoi: 'outil', n }
  }
  if (hash.startsWith('#/instrument')) return { quoi: 'instrument' }
  if (hash.startsWith('#/deck')) return { quoi: 'deck' }
  return { quoi: 'accueil' }
}

function AppInterne() {
  const [theme, setTheme] = useState('dark')
  /** L'ADRESSE COLLÉE. Elle est saisie dans le hero et lue par la section qui répond : deux
      surfaces, un seul état. Sans cela le champ du premier écran serait un décor. */
  const [saisie, setSaisie] = useState('')
  const [vue, setVue] = useState<Vue>(() =>
    lireVue(typeof window === 'undefined' ? '' : window.location.hash),
  )
  const [selected, setSelected] = useState<string>(
    [...dataset.hooks].sort((a, b) => (b.bpsMax ?? -1) - (a.bpsMax ?? -1))[0].address,
  )

  // L'etat que l'assistant pilote. Il est lu depuis l'URL au chargement (permalien) et ne
  // declenche AUCUNE requete : le verdict s'affiche sans rien attendre du chat.
  const [view, setView] = useState<ChatView>(
    () => decodeView(typeof window === 'undefined' ? '' : window.location.hash) ?? EMPTY_VIEW,
  )

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Le bouton « précédent » du navigateur doit marcher : on écoute le fragment plutôt que de
  // garder l'état seul. Sans ça, revenir en arrière quitte le site au lieu de la page outil.
  useEffect(() => {
    const sur = () => setVue(lireVue(window.location.hash))
    window.addEventListener('hashchange', sur)
    return () => window.removeEventListener('hashchange', sur)
  }, [])

  const aller = (h: string) => {
    window.location.hash = h
    window.scrollTo({ top: 0 })
  }
  const versOutil = (n: number) => aller(`/outil/${n}`)

  const model = useMemo(
    () => buildModel(dataset.hooks, dataset.rows, dataset.provenance.registry.entries),
    [],
  )
  const byAddress = useMemo(() => new Map(dataset.hooks.map((h) => [h.address, h])), [])
  const rows = useMemo(() => {
    if (!view.filter && !view.sort) return dataset.hooks
    return select(model, view)
      .rows.map((n) => byAddress.get(n.address))
      .filter((h): h is (typeof dataset.hooks)[number] => Boolean(h))
  }, [model, byAddress, view])

  // Quand l'assistant ouvre une fiche, la fiche s'ouvre. C'est la seule chose qu'il impose ici.
  useEffect(() => {
    if (view.open && byAddress.has(view.open.hook)) setSelected(view.open.hook)
  }, [view.open?.hook, byAddress])

  const hook = dataset.hooks.find((h) => h.address === selected)!

  // Les quatorze pastilles numérotées et la légende des familles vivaient ici, en doublon de
  // ce que la carte montre maintenant en entier. Sur la page outil, le bandeau d'onglets les
  // remplace ; sur l'accueil, c'est la carte elle-même qui sert de navigation.

  if (vue.quoi === 'accueil') {
    return (
      <div className="min-h-full">
        <Evitement />
        <Head theme={theme} setTheme={setTheme} vue={vue} versOutil={versOutil} />
        <RouteMotion cle="accueil">
          <main
            id="contenu"
            className="flex flex-col px-[24px] pt-[40px] pb-[24px] mx-auto w-full"
            style={{ maxWidth: 1360, gap: 'clamp(4rem, 8vw, 7rem)' }}
          >
            {/* LA CARTE D'ABORD. Le système en une image, et chaque nœud est une porte.
                Elle n'est pas sous un `Reveal` : elle est dans le premier écran, et faire
                monter ce qu'on regarde déjà est un effet, pas une lecture. */}
            <Carte surOutil={versOutil} saisie={saisie} setSaisie={setSaisie} />
            <Reveal>
              <Pourquoi />
            </Reveal>
            <Reveal>
              <AccesPanel surOutil={versOutil} />
            </Reveal>
            {/* La cible des liens du rail de la carte : « le detail d'un jeu de donnees ». */}
            <Reveal id="donnees">
              <DonneesPanel surOutil={versOutil} />
            </Reveal>
          </main>
        </RouteMotion>
      </div>
    )
  }

  if (vue.quoi === 'deck') {
    return (
      <div className="min-h-full">
        <Evitement />
        <Head theme={theme} setTheme={setTheme} vue={vue} versOutil={versOutil} />
        {/* Pas de <main> a marges ici : le deck EST son propre conteneur de defilement, et
            l'enfermer dans une colonne centree lui volerait la hauteur dont il vit. */}
        <main id="contenu">
          <DeckPage surOutil={versOutil} />
        </main>
      </div>
    )
  }

  if (vue.quoi === 'outil') {
    return (
      <div className="min-h-full">
        <Evitement />
        <Head theme={theme} setTheme={setTheme} vue={vue} versOutil={versOutil} />
        <RouteMotion cle={`outil-${vue.n}`}>
          <main className="flex flex-col gap-[16px] px-[24px] pb-[24px] mx-auto w-full" id="contenu" style={{ maxWidth: 1360 }}>
            <OutilPanel n={vue.n} surOutil={versOutil} />
          </main>
        </RouteMotion>
      </div>
    )
  }

  return (
    <div className="min-h-full">
      <Evitement />
      <Head theme={theme} setTheme={setTheme} vue={vue} versOutil={versOutil} />

      <main id="contenu" className="px-[24px] pt-[24px] pb-[24px] mx-auto w-full" style={{ maxWidth: 1360 }}>
        <div className="flex flex-wrap items-end justify-between gap-x-[40px] gap-y-[12px] pb-[28px]">
          <div className="flex flex-col" style={{ gap: 12, maxWidth: '52ch' }}>
            <h1 className="t-display m-0">L’instrument</h1>
            <p className="t-body t-body-muted m-0">
              Le corpus en entier, panneau par panneau&nbsp;: ce que le registre déclare, ce que
              la mesure trouve, et tout ce qui sert à le vérifier. Le sommaire suit la lecture.
            </p>
          </div>
          <span className="flex flex-wrap items-baseline t-data-sm" style={{ gap: 14, color: 'var(--ink-2)' }}>
            <span>{T.rows.toLocaleString('fr')} mesures</span>
            <span className="meta-filet">{T.hooks} hooks</span>
            <span className="meta-filet">{T.pools.toLocaleString('fr')} pools</span>
          </span>
        </div>
      <div className="instrument">
        <IndexPanneaux />
        <div className="flex flex-col" style={{ minWidth: 0 }}>
        {/* Le test de sortie vient EN PREMIER : c'est la seule question qu'un visiteur se pose
            avant d'avoir appris quoi que ce soit du protocole. Tout le reste explique pourquoi
            ce nombre est ce qu'il est. */}
        <ExitPanel />

        <Panel
          index="01"
          title="Le même swap, coté deux fois"
          meta={['lecture immédiate', 'aucun portefeuille', 'aucune requête']}
        >
          <Verdict />
          <p
            className="t-body t-body-muted m-0 px-[16px] py-[14px]"
            style={{ maxWidth: '74ch', borderTop: '1px solid var(--line)' }}
          >
            La PoolKey contient l’adresse du hook&nbsp;: le même pool sans son hook n’existe pas. Sur un
            fork épinglé, on ne change pas le pool, <strong style={{ color: 'var(--ink)' }}>on change le hook</strong> :
            <code style={{ fontFamily: 'var(--mono)' }}> anvil_setCode</code> remplace son bytecode par un
            talon inerte de 89 octets conforme à <code style={{ fontFamily: 'var(--mono)' }}>Hooks.sol</code>.
            On cote le même swap deux fois via V4Quoter. <strong style={{ color: 'var(--ink)' }}>L’écart est ce que le hook a pris.</strong>{' '}
            Chaque valeur affichée porte son bloc, sa taille et son sens, et se rejoue en une commande.
          </p>
        </Panel>

        <Panel
          index="02"
          title="Le registre contre la mesure"
          right={
            view.filter || view.columns || view.highlight.length ? (
              <span className="t-data-xs flex items-center gap-[8px]" style={{ color: 'var(--ink-2)' }}>
                assistant&nbsp;: {rows.length}/{dataset.hooks.length} lignes
                <button
                  type="button"
                  onClick={() => setView(EMPTY_VIEW)}
                  className="t-label px-[6px] py-[2px] cursor-pointer"
                  style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-1)', color: 'var(--ink-2)' }}
                >
                  retirer
                </button>
              </span>
            ) : (
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                cliquer une ligne pour ouvrir sa fiche
              </span>
            )
          }
        >
          <HookTable
            selected={selected}
            onSelect={setSelected}
            rows={rows}
            visibleColumns={view.columns}
            sort={view.sort}
            highlight={view.highlight}
          />
          <Legend />
        </Panel>

        {/* La route : le classement des portes d'une paire, servi par GET /route. L'ordinal 07
            est le prochain libre — la position dans la page prime sur l'ordre des ordinaux,
            renumeroter les autres panneaux sortirait du perimetre de ce chantier. */}
        <RoutePanel />

        <LedWidget />

        <Detail
          hook={hook}
          theme={theme}
          focus={
            view.curve && view.curve.hook === hook.address
              ? { pool: view.curve.pool, direction: view.curve.direction }
              : null
          }
        />

        {/* Les trois encarts de graphe. Ils viennent de l'API et ne bloquent jamais la page :
            si elle ne repond pas, ils le disent au lieu d'afficher zero. */}
        <GraphPanels hook={hook.address} />

        {/* Le peage, l'identite d'agent, les attestations, The Graph et les autres surfaces.
            Tout cela tournait sans qu'aucun visiteur du site n'en voie un mot. */}
        <MachinePanels />

        {/* 15 — la seule surface qui demande un serveur ET un portefeuille. Elle le dit. */}
        <ComptePanel />

        {/* 16 — la vraie action : et si je passais par une autre porte ? */}
        <SubstituerPanel />

        <footer
          className="t-data-xs px-[16px] py-[12px] flex flex-col gap-[3px]"
          style={{ color: 'var(--ink-2)', borderTop: '1px solid var(--line)' }}
        >
          <span>
            mesures&nbsp;: {P.measurements.path} · {P.measurements.engine_ver} · relevees le{' '}
            {P.measurements.observed_at} · stub <span className="hex">{P.measurements.stub_hash}</span>
          </span>
          <span>
            registre&nbsp;: {P.registry.source} · {P.registry.file} · commit{' '}
            <span className="hex">{P.registry.commit}</span> · instantane du {P.registry.fetched_at} ·{' '}
            {P.registry.entries} fiches
          </span>
          <span>
            controle des bits de permission&nbsp;: {P.registry.flag_bit_check.entries_matching_low14bits}/
            {P.registry.flag_bit_check.entries} fiches, {P.registry.flag_bit_check.comparisons} comparaisons,
            zero ecart · recensement des champs&nbsp;: {P.registry.field_census.leaf_fields} feuilles,{' '}
            {P.registry.field_census.boolean_fields} booleens, numeriques [
            {P.registry.field_census.numeric_fields.join(', ')}], quantitatifs{' '}
            {P.registry.field_census.quantitative_fields.length}
          </span>
          <span>
            etiquettes&nbsp;: MESURE {T.labelCounts.MESURE ?? 0} · INTERPOLE {T.labelCounts.INTERPOLE ?? 0} ·
            NON_MESURABLE {T.labelCounts.NON_MESURABLE ?? 0} · NON_COTABLE {T.labelCounts.NON_COTABLE ?? 0}.
            Une lecture bornee est un NON_MESURABLE, jamais une valeur.
          </span>
          <span>jeu de donnees compile le {P.built_at}</span>
        </footer>
        </div>
      </div>
      </main>

      <Chat model={model} view={view} onView={setView} />
    </div>
  )
}


/**
 * LA RACINE — elle ne fait qu'une chose : poser le fournisseur de portefeuilles.
 *
 * Il est DEHORS de l'instrument, et volontairement : `AppInterne` ne sait rien de wagmi, et
 * l'instrument continue de fonctionner sans portefeuille, sans compte et sans une requete.
 * Le theme est lu sur `data-theme`, pose par `AppInterne` lui-meme, pour que le modal de
 * connexion suive le theme du site sans faire remonter l'etat d'un cran.
 */
export default function App() {
  const [theme, setTheme] = useState(
    typeof document === 'undefined' ? 'dark' : document.documentElement.getAttribute('data-theme') ?? 'dark',
  )
  useEffect(() => {
    const o = new MutationObserver(() =>
      setTheme(document.documentElement.getAttribute('data-theme') ?? 'dark'),
    )
    o.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => o.disconnect()
  }, [])
  return (
    <Portefeuilles theme={theme}>
      <AppInterne />
    </Portefeuilles>
  )
}
