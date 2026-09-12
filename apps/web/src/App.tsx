import { useEffect, useMemo, useState } from 'react'
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
import { AccueilPanel, AccesPanel, DonneesPanel } from './components/Accueil'
import { IndexPanneaux } from './components/Index'
import { Carte, doux } from './components/Carte'
import { OutilPanel } from './components/Outil'
import { OUTILS } from './lib/outils'
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

function Head({ theme, setTheme, vue }: { theme: string; setTheme: (t: string) => void; vue: Vue }) {
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
  ]
  return (
    <header
      className="sticky top-0 z-10"
      style={{ background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}
    >
      <div className="flex items-center gap-[8px] px-[24px] mx-auto w-full" style={{ maxWidth: 1360, minHeight: 56 }}>
        {/* La marque : en sans, comme la voix du produit. Plus de capitales chassées. */}
        <a href="#/" className="no-underline" translate="no" style={{ color: 'var(--ink)', fontFamily: 'var(--prose)', fontWeight: 600, fontSize: 20, letterSpacing: '-0.01em' }}>
          TARE
        </a>
        <nav className="flex items-center gap-[2px] ml-[12px]" aria-label="les vues">
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
          style={{ minHeight: 32 }}
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
    [String(T.hooks), 'hooks mesures', `${T.pools} pools · ${T.rows} mesures · ${T.measured} etiquetees MESURE`],
    // Ce nombre est calcule contre l'instantane EPINGLE du registre. Contre un tirage plus
    // recent il en vaut un autre, et le taire reviendrait a publier le plus flatteur des deux :
    // la note dit les deux, avec la date de chacun. Un registre qui gagne 198 adresses en un
    // jour n'est pas un fond stable, et c'est un fait sur le registre.
    [
      String(T.hooksAbsentFromRegistry),
      'de ces hooks sont absents du registre',
      FA.registre
        ? `${FA.registre.epingle.adresses} adresses au commit epingle du ${FA.registre.epingle.le?.slice(0, 10)}` +
          ` — contre le tirage du ${FA.registre.plus_recent.le} (${FA.registre.plus_recent.adresses} adresses),` +
          ` ils sont ${FA.registre.plus_recent.absents} : le registre en a inscrit ${FA.registre.gagnes.length} entre les deux`
        : `${P.registry.entries} fiches, aucun champ numerique`,
    ],
    [
      String(P.registry.field_census.quantitative_fields.length),
      'champ quantitatif dans le registre',
      `${P.registry.field_census.leaf_fields} champs, ${P.registry.field_census.boolean_fields} booleens, 1 numerique (chainId, un identifiant de reseau)`,
    ],
  ]
  return (
    <section
      className="grid gap-px"
      style={{ background: 'var(--line)', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
    >
      {items.map(([n, l, s]) => (
        <div key={l} className="px-[16px] py-[14px]" style={{ background: 'var(--bg-1)' }}>
          <div className="t-metric" style={{ color: 'var(--ink)' }}>
            {n}
          </div>
          <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            {l}
          </div>
          <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
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
type Vue = { quoi: 'accueil' } | { quoi: 'instrument' } | { quoi: 'outil'; n: number }

function lireVue(hash: string): Vue {
  const m = /^#\/outil\/(\d+)/.exec(hash)
  if (m) {
    const n = Number(m[1])
    if (OUTILS.some((o) => o.n === n)) return { quoi: 'outil', n }
  }
  if (hash.startsWith('#/instrument')) return { quoi: 'instrument' }
  return { quoi: 'accueil' }
}

export default function App() {
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
        <Head theme={theme} setTheme={setTheme} vue={vue} />
        <main id="contenu" className="flex flex-col px-[24px] pt-[40px] pb-[24px] mx-auto w-full" style={{ maxWidth: 1360, gap: 'clamp(4rem, 8vw, 7rem)' }}>
          {/* LA CARTE D'ABORD. Le système en une image, et chaque nœud est une porte. */}
          <Carte
            surOutil={versOutil}
            saisie={saisie}
            setSaisie={setSaisie}
            versOperation={() =>
              document.getElementById('operation')?.scrollIntoView({ block: 'start', behavior: doux() })
            }
          />
          <div id="operation">
            <AccueilPanel saisie={saisie} setSaisie={setSaisie} />
          </div>
          <AccesPanel surOutil={versOutil} />
          {/* La cible des liens du rail de la carte : « le detail d'un jeu de donnees ». */}
          <div id="donnees">
            <DonneesPanel surOutil={versOutil} />
          </div>
        </main>
      </div>
    )
  }

  if (vue.quoi === 'outil') {
    return (
      <div className="min-h-full">
        <Evitement />
        <Head theme={theme} setTheme={setTheme} vue={vue} />
        <main id="contenu" className="flex flex-col gap-[16px] px-[24px] pb-[24px] mx-auto w-full" style={{ maxWidth: 1360 }}>
          <OutilPanel n={vue.n} surOutil={versOutil} />
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-full">
      <Evitement />
      <Head theme={theme} setTheme={setTheme} vue={vue} />

      <main id="contenu" className="px-[24px] pt-[24px] pb-[24px] mx-auto w-full" style={{ maxWidth: 1360 }}>
        <div className="pb-[16px]">
        <h1 className="t-hero m-0">L’instrument</h1>
        <p
          className="m-0 pt-[10px]"
          style={{ fontFamily: 'var(--prose)', fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: '68ch' }}
        >
          Le corpus en entier, panneau par panneau&nbsp;: ce que le registre déclare, ce que la
          mesure trouve, et tout ce qui sert à le vérifier. Le sommaire suit la lecture.
        </p>
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
            className="m-0 px-[16px] py-[12px]"
            style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '78ch', color: 'var(--ink-2)', borderTop: '1px solid var(--line)' }}
          >
            La PoolKey contient l'adresse du hook&nbsp;: le meme pool sans son hook n'existe pas. Sur un
            fork epingle, on ne change pas le pool, <strong style={{ color: 'var(--ink)' }}>on change le hook</strong> —
            <code style={{ fontFamily: 'var(--mono)' }}> anvil_setCode</code> remplace son bytecode par un
            stub inerte de 89 octets conforme a <code style={{ fontFamily: 'var(--mono)' }}>Hooks.sol</code>.
            On cote le meme swap deux fois via V4Quoter. <strong style={{ color: 'var(--ink)' }}>L'ecart est ce que le hook a pris.</strong>{' '}
            Chaque valeur affichee porte son bloc, sa taille et son sens, et se rejoue en une commande.
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
