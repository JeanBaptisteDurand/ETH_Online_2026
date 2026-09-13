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
import { AccesPanel, DonneesPanel, Pourquoi, Promesse } from './components/Accueil'
import { IndexPanneaux } from './components/Index'
import { Carte } from './components/Carte'
import { OutilPanel } from './components/Outil'
import { Portefeuilles, ConnectButton } from './compte/wallet'
import { ReglagesPage } from './components/Reglages'
import { DeckPage } from './components/Deck'
import { DeveloppeursPage } from './components/Developpeurs'
import { FeuillePage } from './components/Feuille'
import { OUTILS, FAMILLES } from './lib/outils'
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
      skip to content
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
      {/* Le libelle nomme L'AGENT, pas « les outils » : le proprietaire avait raison, une barre
          qui listait « outil » a cote d'« instrument » donnait deux freres jumeaux au lieu du
          produit. L'agent est le sujet ; les quatorze outils sont ce qu'il tient. Le compte
          reste dans le `.t-data-sm` que le CSS masque sous 640 px — a cette largeur le menu le
          dit deja en s'ouvrant. */}
      <summary
        className="nav-lien cursor-pointer list-none inline-flex items-center"
        style={{ gap: 7 }}
        aria-current={n !== null ? 'page' : undefined}
      >
        the agent
        <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>{OUTILS.length} tools</span>
      </summary>
      <div className="menu-panneau" role="group" aria-label="the agent’s fourteen tools">
        {ORDRE_FAM.map((f) => (
          <div key={f} className="flex flex-col" style={{ gap: 2 }}>
            <span className="t-data-sm flex items-center" style={{ gap: 8, color: 'var(--ink-2)', padding: '2px 0 6px' }}>
              <span aria-hidden="true" style={{ width: 10, height: 3, background: COULEUR_FAM[f], display: 'inline-block' }} />
              {FAMILLES[f].nom}
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
    ['chain', `base, chainid ${P.measurements.chain_ids.join(', ')}`],
    ['pinned block', P.measurements.blocks.map(fmtBlock).join(', ')],
    ['engine', P.measurements.engine_ver],
    ['stub', P.measurements.stub_hash],
    ['registry', `${P.registry.commit.slice(0, 7)}, ${P.registry.entries} entries`],
  ]
  /**
   * LES ROUTES, dans l'ordre ou on comprend le produit en les lisant.
   *
   * Elle disait « les outils 14 · la carte · l'instrument · le deck » — et « outil » a cote
   * d'« instrument » se lit comme deux fois la meme chose. On ne comprenait nulle part qu'un
   * AGENT tient les quatorze outils, ni que l'instrument n'est pas leur frere mais ce qu'ils
   * ont rendu. L'ordre dit maintenant l'histoire : on verifie un jeton, un agent tient
   * quatorze outils, et voici les pieces. AUCUNE ROUTE N'EST RENOMMEE — le deck, les liens
   * internes et les autres surfaces en dependent ; seuls les libelles et l'ordre bougent.
   *
   * L'entree du menu des outils s'intercale APRES la premiere : elle est rendue a part, plus
   * bas, parce que c'est un depliant et non un lien.
   */
  const routes = [
    // L'operation, et c'est la premiere chose qu'on fait : coller un jeton, lire par ou l'acheter.
    { h: '/', t: 'check a token', actif: vue.quoi === 'accueil' },
    // « the evidence » plutot que « l'instrument » : ce sont les donnees brutes, panneau par
    // panneau, ce que les outils ont rendu — pas un second catalogue d'outils.
    { h: '/instrument', t: 'the evidence', actif: vue.quoi === 'instrument' },
    { h: '/deck', t: 'the deck', actif: vue.quoi === 'deck' },
    { h: '/developpeurs', t: 'developers', actif: vue.quoi === 'developpeurs' },
    { h: '/roadmap', t: 'roadmap', actif: vue.quoi === 'feuille' },
    { h: '/reglages', t: 'settings', actif: vue.quoi === 'reglages' },
  ]
  const lienRoute = (x: { h: string; t: string; actif: boolean }) => (
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
  )
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
        <nav className="flex items-center gap-[2px] ml-[12px] nav-routes" aria-label="the views">
          {/* 1. l'operation — 2. l'agent et ses quatorze outils — 3. les pieces — puis le reste. */}
          {routes.slice(0, 1).map(lienRoute)}
          <MenuOutils n={vue.quoi === 'outil' ? vue.n : null} aller={versOutil} />
          {routes.slice(1).map(lienRoute)}
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
          {theme === 'dark' ? 'light' : 'dark'}
        </button>
        {/* LE PORTEFEUILLE, tout a droite. Le bouton officiel de RainbowKit : un juge le
            reconnait sans le lire. Il est reduit a sa plus petite forme — pas de chaine, pas
            de solde, l'avatar seul une fois connecte — parce qu'a 390 px c'est la barre
            entiere qui doit tenir, pas ce bouton-la. Il ne cede jamais sa largeur : c'est la
            nav des routes, qui defile dans elle-meme, qui absorbe le manque. */}
        <div className="nav-portefeuille" style={{ flexShrink: 0, display: 'flex', alignItems: 'center' }}>
          {/* RainbowKit arrive avec sa propre echelle : 40 px de haut, 16 px gras, sans angle
              coupe. Dans une barre ou tout le reste tient en 32 px et ou le site n'a AUCUN
              rayon, ce bouton-la est le seul objet d'une autre charte. On ne le remplace pas
              — c'est justement le bouton qu'on veut voir reconnu — on le remet a l'echelle de
              la barre. `index.css` n'est pas a nous ici, la regle vit donc avec le composant
              qu'elle habille, et une seule classe suffit a battre la sienne. */}
          <style>{`
            .nav-portefeuille [data-testid='rk-connect-button'],
            .nav-portefeuille [data-testid='rk-account-button'],
            .nav-portefeuille button {
              height: 32px;
              min-height: 32px;
              padding: 0 12px;
              font-size: 14px;
              border-radius: 0;
            }
            @media (max-width: 639px) {
              .nav-portefeuille button {
                padding: 0 9px;
                font-size: 13px;
              }
            }
          `}</style>
          <ConnectButton chainStatus="none" showBalance={false} accountStatus="avatar" />
        </div>
      </div>
    </header>
  )
}

/** Le verdict. Aucun de ces nombres n'est anime : ils sont ecrits, pas calcules a l'ecran. */
function Verdict() {
  const items: [string, string, string][] = [
    [String(T.over1bpsWithZeroStoredFee), 'measurements above 1 bps', 'on pools whose LP fee, read on-chain, is ZERO'],
    [
      String(T.hooks),
      'hooks measured',
      `${T.pools.toLocaleString('fr')} pools, ${T.rows.toLocaleString('fr')} measurements, ${T.measured.toLocaleString('fr')} of them labeled MESURE`,
    ],
    // Ce nombre est calcule contre l'instantane EPINGLE du registre. Contre un tirage plus
    // recent il en vaut un autre, et le taire reviendrait a publier le plus flatteur des deux :
    // la note dit les deux, avec la date de chacun. Un registre qui gagne 198 adresses en un
    // jour n'est pas un fond stable, et c'est un fait sur le registre.
    [
      String(T.hooksAbsentFromRegistry),
      'of these hooks are absent from the registry',
      FA.registre
        ? `${FA.registre.epingle.adresses} addresses at the pinned commit of ${FA.registre.epingle.le?.slice(0, 10)}. Against the ${FA.registre.plus_recent.le} pull (${FA.registre.plus_recent.adresses} addresses), ${FA.registre.plus_recent.absents} are: the registry added ${FA.registre.gagnes.length} between the two.`
        : `${P.registry.entries} entries, no numeric field`,
    ],
    [
      String(P.registry.field_census.quantitative_fields.length),
      'quantitative field in the registry',
      `${P.registry.field_census.leaf_fields} fields, ${P.registry.field_census.boolean_fields} booleans, 1 numeric (chainId, a network identifier)`,
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
        ramp · inferno [0.18 ; 0.90] · 7 steps · encodes bps and nothing else
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
        ≠ — the registry is qualitative: {P.registry.field_census.leaf_fields} fields,{' '}
        {P.registry.field_census.boolean_fields} booleans, one numeric (chainId). No field can
        contradict the right-hand column, because no field quantifies anything.
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
type Vue =
  | { quoi: 'accueil' }
  | { quoi: 'instrument' }
  | { quoi: 'deck' }
  | { quoi: 'reglages' } | { quoi: 'developpeurs' } | { quoi: 'feuille' }
  | { quoi: 'outil'; n: number }

function lireVue(hash: string): Vue {
  const m = /^#\/outil\/(\d+)/.exec(hash)
  if (m) {
    const n = Number(m[1])
    if (OUTILS.some((o) => o.n === n)) return { quoi: 'outil', n }
  }
  if (hash.startsWith('#/instrument')) return { quoi: 'instrument' }
  if (hash.startsWith('#/deck')) return { quoi: 'deck' }
  if (hash.startsWith('#/reglages')) return { quoi: 'reglages' }
  if (hash.startsWith('#/developpeurs')) return { quoi: 'developpeurs' }
  if (hash.startsWith('#/roadmap') || hash.startsWith('#/feuille')) return { quoi: 'feuille' }
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
            {/* LA PHRASE, PUIS LA CARTE. Le système en une image, et chaque nœud est une porte.
                Elles ne sont pas sous un `Reveal` : elles sont dans le premier écran, et faire
                monter ce qu'on regarde déjà est un effet, pas une lecture.
                Les deux tiennent dans UN bloc a petite gouttiere : la gouttiere de `main` est
                un `clamp(4rem, 8vw, 7rem)`, elle separe les SECTIONS et pousserait la carte
                hors du premier ecran si la phrase devenait une section de plus. */}
            <div className="flex flex-col" style={{ gap: 20 }}>
              <Promesse />
              <Carte surOutil={versOutil} saisie={saisie} setSaisie={setSaisie} />
            </div>
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

  if (vue.quoi === 'reglages') {
    return (
      <div className="min-h-full">
        <Evitement />
        <Head theme={theme} setTheme={setTheme} vue={vue} versOutil={versOutil} />
        <RouteMotion cle="reglages">
          <main id="contenu" className="px-[24px] pt-[24px] pb-[24px] mx-auto w-full" style={{ maxWidth: 1360 }}>
            <ReglagesPage />
          </main>
        </RouteMotion>
      </div>
    )
  }

  if (vue.quoi === 'developpeurs' || vue.quoi === 'feuille') {
    return (
      <div className="min-h-full">
        <Evitement />
        <Head theme={theme} setTheme={setTheme} vue={vue} versOutil={versOutil} />
        <main id="contenu" className="px-[24px] pt-[24px] pb-[24px] mx-auto w-full" style={{ maxWidth: 1360 }}>
          {vue.quoi === 'developpeurs' ? <DeveloppeursPage /> : <FeuillePage />}
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
            {/* Le titre suit la barre : « the evidence ». La page n'a jamais ete un second
                catalogue d'outils — c'est ce que les outils ont RENDU, panneau par panneau. */}
            <h1 className="t-display m-0">The evidence</h1>
            <p className="t-body t-body-muted m-0">
              The whole corpus, panel by panel: what the registry declares, what the measurement
              finds, and everything it takes to check it. Every number below was returned by one
              of the fourteen tools. The contents follow your reading.
            </p>
          </div>
          <span className="flex flex-wrap items-baseline t-data-sm" style={{ gap: 14, color: 'var(--ink-2)' }}>
            <span>{T.rows.toLocaleString('fr')} measurements</span>
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
          title="The same swap, quoted twice"
          meta={['immediate read', 'no wallet', 'no request']}
        >
          <Verdict />
          <p
            className="t-body t-body-muted m-0 px-[16px] py-[14px]"
            style={{ maxWidth: '74ch', borderTop: '1px solid var(--line)' }}
          >
            The PoolKey contains the hook’s address: the same pool without its hook does not exist. On
            a pinned fork we do not change the pool, <strong style={{ color: 'var(--ink)' }}>we change the hook</strong>:
            <code style={{ fontFamily: 'var(--mono)' }}> anvil_setCode</code> replaces its bytecode with an
            89-byte inert stub that conforms to <code style={{ fontFamily: 'var(--mono)' }}>Hooks.sol</code>.
            We quote the same swap twice through V4Quoter. <strong style={{ color: 'var(--ink)' }}>The gap is what the hook took.</strong>{' '}
            Every value shown carries its block, its size and its direction, and replays in one command.
          </p>
        </Panel>

        <Panel
          index="02"
          title="The registry against the measurement"
          right={
            view.filter || view.columns || view.highlight.length ? (
              <span className="t-data-xs flex items-center gap-[8px]" style={{ color: 'var(--ink-2)' }}>
                assistant: {rows.length}/{dataset.hooks.length} rows
                <button
                  type="button"
                  onClick={() => setView(EMPTY_VIEW)}
                  className="t-label px-[6px] py-[2px] cursor-pointer"
                  style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-1)', color: 'var(--ink-2)' }}
                >
                  clear
                </button>
              </span>
            ) : (
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                click a row to open its record
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
            measurements: {P.measurements.path} · {P.measurements.engine_ver} · taken on{' '}
            {P.measurements.observed_at} · stub <span className="hex">{P.measurements.stub_hash}</span>
          </span>
          <span>
            registry: {P.registry.source} · {P.registry.file} · commit{' '}
            <span className="hex">{P.registry.commit}</span> · snapshot of {P.registry.fetched_at} ·{' '}
            {P.registry.entries} entries
          </span>
          <span>
            permission-bit check: {P.registry.flag_bit_check.entries_matching_low14bits}/
            {P.registry.flag_bit_check.entries} entries, {P.registry.flag_bit_check.comparisons} comparisons,
            zero mismatch · field census: {P.registry.field_census.leaf_fields} leaves,{' '}
            {P.registry.field_census.boolean_fields} booleans, numeric [
            {P.registry.field_census.numeric_fields.join(', ')}], quantitative{' '}
            {P.registry.field_census.quantitative_fields.length}
          </span>
          <span>
            labels: MESURE {T.labelCounts.MESURE ?? 0} · INTERPOLE {T.labelCounts.INTERPOLE ?? 0} ·
            NON_MESURABLE {T.labelCounts.NON_MESURABLE ?? 0} · NON_COTABLE {T.labelCounts.NON_COTABLE ?? 0}.
            A bounded read is a NON_MESURABLE, never a value.
          </span>
          <span>dataset compiled on {P.built_at}</span>
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
