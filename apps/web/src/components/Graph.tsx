import { useEffect, useState, type ReactNode } from 'react'
import { fmtBps, groupDigits, shortAddr } from '../lib/format'
import { Chip, Copy, Panel, Absence } from './Prim'
import {
  API_BASE,
  CLI,
  getJson,
  isDisagreement,
  VERDICT_LABEL,
  type BpsProfile,
  type Disagreement,
  type Fetched,
  type GraphSummary,
  type Impact,
  type Twins,
} from './GraphApi'

/**
 * Les trois encarts de graphe sur la fiche d'un hook.
 *
 * Pas de dessin de graphe. Un graphe dessine se regarde ; une liste chiffree se
 * verifie. Chaque encart est une liste dense qui porte ses comptes, ses etiquettes
 * et la commande qui la rejoue hors du navigateur.
 *
 *   ses jumeaux         les hooks au MEME bytecode (keccak(eth_getCode))
 *   son rayon de souffle les pools et les tokens que le code touche, directement et
 *                        par ses clones — "ce qu'il faudrait re-mesurer"
 *   son desaccord        vanillaSwap declare par le registre, contre la mesure
 *
 * Regle tenue partout ici : un encart qui n'a pas pu lire n'affiche pas zero. Il dit
 * ce qui a manque et donne la commande.
 */

/* ------------------------------------------------------------------ primitives */

/** 'pool:8453:0xabc…' -> '0xabc…'. Un identifiant de noeud n'est pas une adresse. */
function tail(nodeId: string): string {
  const i = nodeId.lastIndexOf(':')
  return i < 0 ? nodeId : nodeId.slice(i + 1)
}

function Line({ k, v, note }: { k: ReactNode; v: ReactNode; note?: ReactNode }) {
  return (
    <div
      className="flex items-baseline gap-[10px] px-[12px] py-[5px]"
      style={{ borderTop: '1px solid var(--line)' }}
    >
      <span className="t-data-sm" style={{ color: 'var(--ink-2)', minWidth: 140 }}>
        {k}
      </span>
      <span className="t-data" style={{ color: 'var(--ink)' }}>
        {v}
      </span>
      {note !== undefined && (
        <span className="t-data-xs ml-auto text-right" style={{ color: 'var(--ink-2)' }}>
          {note}
        </span>
      )}
    </div>
  )
}

function Box({
  title,
  right,
  children,
}: {
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)' }}>
      <header
        className="flex items-baseline gap-[10px] px-[12px] py-[7px]"
        style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line-strong)' }}
      >
        <h3 className="t-label m-0" style={{ color: 'var(--ink-2)' }}>
          {title}
        </h3>
        <div className="ml-auto">{right}</div>
      </header>
      {children}
    </section>
  )
}

/**
 * L'etat « pas de nombre a montrer », dit en toutes lettres et jamais en zero.
 *
 * Cinq surfaces du site dependent d'une API qui n'est pas hebergee, et elles ecrivaient
 * chacune leur propre refus. Elles partagent desormais `Absence` : ce qui manque, la raison,
 * et la commande qui le ferait tourner ici.
 */
function Missing({ head, detail, cmd }: { head: string; detail: string; cmd: string }) {
  const enCours = head.endsWith('…')
  return (
    <Absence
      quoi={head}
      etat={enCours ? 'in progress' : 'no response'}
      raison={detail}
      cmd={cmd}
      panne={!enCours}
    />
  )
}

/** Le profil de mesures, etiquettes comprises. bps_max null ne devient jamais 0. */
function Profile({ p }: { p: BpsProfile }) {
  const labels = (Object.entries(p.by_label) as [string, number][]).filter(([, v]) => v > 0)
  return (
    <>
      <Line
        k="measurements"
        v={p.n}
        note={labels.length ? labels.map(([k, v]) => `${k}=${v}`).join(' · ') : 'none'}
      />
      <Line
        k="bps MEASURED"
        v={
          p.n_measured === 0 ? (
            <span style={{ color: 'var(--ink-2)' }}>no quotable measurement</span>
          ) : (
            `${fmtBps(p.bps_min, 4)} … ${fmtBps(p.bps_max, 4)}`
          )
        }
        note={
          p.n_measured === 0
            ? 'no number to give — this is not a zero'
            : `median ${fmtBps(p.bps_median, 4)} over ${p.n_measured} measurements`
        }
      />
    </>
  )
}

/* ------------------------------------------------------------------- chargement */

function useFetched<T>(path: string | null): Fetched<T> {
  const [got, setGot] = useState<Fetched<T>>({ state: 'loading' })
  useEffect(() => {
    if (path === null) return
    const ac = new AbortController()
    setGot({ state: 'loading' })
    getJson<T>(path, ac.signal).then(
      (r) => {
        if (!ac.signal.aborted) setGot(r)
      },
      () => undefined,
    )
    return () => ac.abort()
  }, [path])
  return got
}

/* ------------------------------------------------------------- encart : jumeaux */

function TwinsBox({ hook }: { hook: string }) {
  const got = useFetched<Twins>(`/graph/twins/${hook}`)
  const cmd = `${CLI} twins --hook ${hook}`

  if (got.state === 'loading')
    return (
      <Box title="its twins">
        <Missing head="reading the graph…" detail={`${API_BASE}/graph/twins`} cmd={cmd} />
      </Box>
    )
  if (got.state !== 'ready')
    return (
      <Box title="its twins">
        <Missing
          head={got.state === 'absent' ? 'hook absent from the graph' : 'graph unreachable'}
          detail={`${got.detail} — no twin is shown, and above all not “0 twins”: the graph did not answer.`}
          cmd={cmd}
        />
      </Box>
    )

  const t = got.data
  if (t.status !== 'CODE')
    return (
      <Box title="its twins" right={<Chip>{t.status}</Chip>}>
        <Missing
          head="bytecode not read for this hook"
          detail={`${t.reason ?? 'no bytecode in the graph'}. “Not read” is not “no twin”.`}
          cmd={cmd}
        />
      </Box>
    )

  return (
    <Box
      title="its twins"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          same keccak(eth_getCode)
        </span>
      }
    >
      <Line
        k="keccak(code)"
        v={<span className="hex">{shortAddr(t.code_hash ?? '—', 10, 6)}</span>}
        note={t.code_size ? `${groupDigits(String(t.code_size))} bytes` : undefined}
      />
      <Line
        k="twins"
        v={t.n_twins ?? 0}
        note={
          (t.n_twins ?? 0) === 0
            ? 'this bytecode is deployed only once in the graph'
            : 'same code, different address'
        }
      />
      {t.twins.map((x) => (
        <Line
          key={x.id}
          k={<span className="hex">{shortAddr(x.address, 10, 6)}</span>}
          v={x.label ?? '—'}
          note={`${x.n_pools} measured pool(s)`}
        />
      ))}
      <div className="px-[12px] py-[7px] flex items-center gap-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
        <code className="t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
          {cmd}
        </code>
        <Copy text={cmd} />
      </div>
    </Box>
  )
}

/* ------------------------------------------------- encart : rayon de souffle */

function ImpactBox({ hook }: { hook: string }) {
  const got = useFetched<Impact>(`/graph/impact/${hook}`)
  const cmd = `${CLI} impact --hook ${hook}`

  if (got.state !== 'ready')
    return (
      <Box title="its blast radius">
        <Missing
          head={
            got.state === 'loading'
              ? 'reading the graph…'
              : got.state === 'absent'
                ? 'hook absent from the graph'
                : 'graph unreachable'
          }
          detail={
            got.state === 'loading'
              ? `${API_BASE}/graph/impact`
              : `${got.detail} — no radius is shown: a silent graph is not a zero radius.`
          }
          cmd={cmd}
        />
      </Box>
    )

  const i = got.data
  const extra = i.n_pools_at_risk - i.n_pools
  return (
    <Box
      title="its blast radius"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          what would have to be re-measured
        </span>
      }
    >
      <Line k="attached pools" v={i.n_pools} note="in the published dataset" />
      <Line k="tokens touched" v={i.n_tokens} note="currency0 + currency1 of these pools" />
      <Line
        k="twin pools"
        v={i.n_twin_pools}
        note={`${i.bytecode.n_twins} twin(s) at the same bytecode`}
      />
      <Line
        k="deployer siblings"
        v={i.deployer.n_siblings}
        note={
          i.deployer.status === 'CODE'
            ? `${i.deployer.deployers.map((d) => shortAddr(d, 8, 4)).join(', ')} · ${i.sibling_pools.length} pool(s)`
            : `deployer ${i.deployer.status} — not counted`
        }
      />
      <Profile p={i.measurements} />
      <div
        className="px-[12px] py-[9px] flex items-baseline gap-[10px]"
        style={{ borderTop: '1px solid var(--line-strong)' }}
      >
        <span className="t-metric" style={{ color: 'var(--ink)' }}>
          {i.n_pools_at_risk}
        </span>
        <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
          pools to re-measure if the flaw is in the code
        </span>
        <span className="t-data-xs ml-auto text-right" style={{ color: 'var(--ink-2)' }}>
          {i.n_pools} direct
          {extra > 0 ? ` + ${extra} through the twins` : ' · no known twin'}
        </span>
      </div>
      <div className="px-[12px] py-[7px] flex items-center gap-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
        <code className="t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
          {cmd}
        </code>
        <Copy text={cmd} />
      </div>
    </Box>
  )
}

/* ------------------------------------------------------------ encart : desaccord */

function DisagreementBox({ hook }: { hook: string }) {
  const got = useFetched<Disagreement>(`/graph/disagreement/${hook}`)
  const cmd = `${CLI} disagreement`

  if (got.state !== 'ready')
    return (
      <Box title="its disagreement with the registry">
        <Missing
          head={
            got.state === 'loading'
              ? 'reading the graph…'
              : got.state === 'absent'
                ? 'hook absent from the graph'
                : 'graph unreachable'
          }
          detail={
            got.state === 'loading'
              ? `${API_BASE}/graph/disagreement`
              : `${got.detail} — neither agreement nor disagreement is shown: both are read, neither is assumed.`
          }
          cmd={cmd}
        />
      </Box>
    )

  const d = got.data
  const strong = isDisagreement(d.verdict)
  return (
    <Box
      title="its disagreement with the registry"
      right={<Chip title={d.note}>{d.verdict}</Chip>}
    >
      <div className="px-[12px] py-[9px]" style={{ borderBottom: '1px solid var(--line)' }}>
        <div
          className="t-data"
          style={{ color: strong ? 'var(--ink)' : 'var(--ink-2)', fontWeight: strong ? 700 : 400 }}
        >
          {VERDICT_LABEL[d.verdict]}
        </div>
        <p
          className="m-0 t-data-sm"
          style={{ color: 'var(--ink-2)', maxWidth: '60ch', marginTop: 4 }}
        >
          {d.note}
        </p>
      </div>
      <Line
        k="vanillaSwap declared"
        v={
          d.vanillaSwap_declared.length === 0
            ? '—'
            : d.vanillaSwap_declared.map((v) => String(v)).join(', ')
        }
        note={`${d.n_registry_entries} entr${d.n_registry_entries === 1 ? 'y' : 'ies'} in the registry`}
      />
      <Line k="flatness threshold" v={`${d.flat_bps} bps`} note="below this threshold, quoter rounding noise" />
      <Profile p={d.profile} />
      <div className="px-[12px] py-[7px] flex items-center gap-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
        <code className="t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
          {cmd}
        </code>
        <Copy text={cmd} />
      </div>
    </Box>
  )
}

/* ------------------------------------------------------------------ le panneau */

/** Les comptes que les traversees revelent, sur tout le graphe. */
function Findings() {
  const got = useFetched<GraphSummary>('/graph')
  if (got.state !== 'ready')
    return (
      <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
        {got.state === 'loading' ? 'reading the graph…' : `graph unreachable · ${API_BASE}`}
      </span>
    )
  const f = got.data.findings
  const g = got.data.graph
  return (
    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
      {f.clone_clusters} twin clusters ({f.hooks_in_clone_clusters} hooks) · {f.orphans}/
      {f.listed_hooks_on_chain} orphans · {f.contradictions}/
      {f.hooks_with_multiple_registry_entries} duplicate entries that diverge ·{' '}
      {f.registry_says_active_measure_says_flat + f.registry_says_vanilla_measure_says_active}{' '}
      disagreement(s) · {f.not_comparable} not comparable · block{' '}
      {g.block_number === null ? '—' : groupDigits(String(g.block_number))}
    </span>
  )
}

export function GraphPanels({ hook }: { hook: string }) {
  return (
    <Panel index="08" title="The graph around the hook" right={<Findings />}>
      <div
        className="grid gap-px p-[16px]"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16 }}
      >
        <TwinsBox hook={hook} />
        <ImpactBox hook={hook} />
        <DisagreementBox hook={hook} />
      </div>
      <p
        className="m-0 px-[16px] pb-[14px] t-data-xs"
        style={{ color: 'var(--ink-2)', maxWidth: '96ch' }}
      >
        The graph is built from three sources and nothing else: the published measurements, the
        official registry, and <code style={{ fontFamily: 'var(--mono)' }}>eth_getCode</code> at the
        pinned block. It computes no bps — it sorts the ones the engine measured and gives them back
        with their label. These boxes come from the API ({API_BASE}): if it does not answer, they say
        so instead of showing zero.
      </p>
    </Panel>
  )
}

/** Les pools que le rayon de souffle designe, listes. Exporte pour l'inspection. */
export function poolsAtRisk(i: Impact): string[] {
  return i.pools_at_risk.map(tail)
}
