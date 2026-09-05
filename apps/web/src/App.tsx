import { useEffect, useMemo, useState } from 'react'
import { dataset } from './lib/dataset'
import { PALIERS } from './lib/ramp'
import { fmtBlock } from './lib/format'
import { HookTable } from './components/Table'
import { Detail } from './components/Detail'
import { LedWidget } from './components/Led'
import { RoutePanel } from './components/Route'
import { GraphPanels } from './components/Graph'
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

function Head({ theme, setTheme }: { theme: string; setTheme: (t: string) => void }) {
  return (
    <header
      className="sticky top-0 z-10 flex flex-wrap items-center gap-x-[24px] gap-y-[4px] px-[16px] py-[8px]"
      style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line-strong)' }}
    >
      <span className="t-label" style={{ color: 'var(--ink)', letterSpacing: '0.18em', fontWeight: 700 }}>
        TARE
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
        instrument
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
        base · chainid {P.measurements.chain_ids.join(', ')} · bloc {P.measurements.blocks.map(fmtBlock).join(', ')}
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
        {P.measurements.engine_ver}
      </span>
      <span className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
        stub {P.measurements.stub_hash.slice(0, 10)}…
      </span>
      <span className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
        registre {P.registry.commit.slice(0, 7)} · {P.registry.entries} fiches
      </span>
      <button
        type="button"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        className="ml-auto t-label px-[6px] py-[2px] cursor-pointer"
        style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-1)', color: 'var(--ink-2)' }}
      >
        {theme === 'dark' ? 'clair' : 'sombre'}
      </button>
    </header>
  )
}

/** Le verdict. Aucun de ces nombres n'est anime : ils sont ecrits, pas calcules a l'ecran. */
function Verdict() {
  const items: [string, string, string][] = [
    [String(T.over1bpsWithZeroStoredFee), 'mesures au-dessus de 1 bps', 'sur des pools dont la commission LP lue on-chain vaut ZERO'],
    [String(T.hooks), 'hooks mesures', `${T.pools} pools · ${T.rows} mesures · ${T.measured} etiquetees MESURE`],
    [String(T.hooksAbsentFromRegistry), 'de ces hooks sont absents du registre', `${P.registry.entries} fiches, aucun champ numerique`],
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
          <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
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
      <span className="t-label" style={{ color: 'var(--ink-3)' }}>
        rampe · inferno [0,18 ; 0,90] · 7 paliers · encode bps et rien d'autre
      </span>
      {PALIERS.map((p) => (
        <span key={p.palier} className="t-data-xs inline-flex items-center gap-[5px]" style={{ color: 'var(--ink-3)' }}>
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
      <span className="t-data-xs w-full" style={{ color: 'var(--ink-3)' }}>
        ≠ — le registre est qualitatif&nbsp;: {P.registry.field_census.leaf_fields} champs,{' '}
        {P.registry.field_census.boolean_fields} booleens, un seul numerique (chainId). Aucun champ
        ne peut contredire la colonne de droite, parce qu'aucun champ ne chiffre quoi que ce soit.
      </span>
    </div>
  )
}

export default function App() {
  const [theme, setTheme] = useState('dark')
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

  return (
    <div className="min-h-full">
      <Head theme={theme} setTheme={setTheme} />

      <main className="flex flex-col gap-[16px] p-[16px] mx-auto" style={{ maxWidth: 1560 }}>
        <Panel
          index="01"
          title="le meme swap, cote deux fois"
          right={
            <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
              lecture immediate · aucun wallet · aucune requete
            </span>
          }
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
          title="ce que le registre declare · ce que la mesure trouve"
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
              <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
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

        <footer
          className="t-data-xs px-[16px] py-[12px] flex flex-col gap-[3px]"
          style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--line)' }}
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
      </main>

      <Chat model={model} view={view} onView={setView} />
    </div>
  )
}
