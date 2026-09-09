import { useEffect, useState, type ReactNode } from 'react'
import { fmtBps, groupDigits, shortAddr } from '../lib/format'
import { Chip, Copy, Panel } from './Prim'
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
      <span className="t-data-sm" style={{ color: 'var(--ink-3)', minWidth: 140 }}>
        {k}
      </span>
      <span className="t-data" style={{ color: 'var(--ink)' }}>
        {v}
      </span>
      {note !== undefined && (
        <span className="t-data-xs ml-auto text-right" style={{ color: 'var(--ink-3)' }}>
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

/** L'etat "pas de nombre a montrer", dit en toutes lettres et jamais en zero. */
function Missing({ head, detail, cmd }: { head: string; detail: string; cmd: string }) {
  return (
    <div className="px-[12px] py-[10px] flex flex-col gap-[6px]">
      <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
        {head}
      </div>
      <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
        {detail}
      </div>
      <div className="flex items-center gap-[8px]">
        <code className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
          {cmd}
        </code>
        <Copy text={cmd} />
      </div>
    </div>
  )
}

/** Le profil de mesures, etiquettes comprises. bps_max null ne devient jamais 0. */
function Profile({ p }: { p: BpsProfile }) {
  const labels = (Object.entries(p.by_label) as [string, number][]).filter(([, v]) => v > 0)
  return (
    <>
      <Line
        k="mesures"
        v={p.n}
        note={labels.length ? labels.map(([k, v]) => `${k}=${v}`).join(' · ') : 'aucune'}
      />
      <Line
        k="bps MESURES"
        v={
          p.n_measured === 0 ? (
            <span style={{ color: 'var(--ink-3)' }}>aucune mesure cotable</span>
          ) : (
            `${fmtBps(p.bps_min, 4)} … ${fmtBps(p.bps_max, 4)}`
          )
        }
        note={
          p.n_measured === 0
            ? 'pas de nombre a donner — ce n’est pas un zero'
            : `mediane ${fmtBps(p.bps_median, 4)} sur ${p.n_measured} mesures`
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
      <Box title="ses jumeaux">
        <Missing head="lecture du graphe…" detail={`${API_BASE}/graph/twins`} cmd={cmd} />
      </Box>
    )
  if (got.state !== 'ready')
    return (
      <Box title="ses jumeaux">
        <Missing
          head={got.state === 'absent' ? 'hook absent du graphe' : 'graphe non joignable'}
          detail={`${got.detail} — aucun clone n’est affiche, et surtout pas « 0 clone » : le graphe n’a pas repondu.`}
          cmd={cmd}
        />
      </Box>
    )

  const t = got.data
  if (t.status !== 'CODE')
    return (
      <Box title="ses jumeaux" right={<Chip>{t.status}</Chip>}>
        <Missing
          head="bytecode non lu pour ce hook"
          detail={`${t.reason ?? 'aucun bytecode dans le graphe'}. « Pas lu » n’est pas « pas de clone ».`}
          cmd={cmd}
        />
      </Box>
    )

  return (
    <Box
      title="ses jumeaux"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          meme keccak(eth_getCode)
        </span>
      }
    >
      <Line
        k="keccak(code)"
        v={<span className="hex">{shortAddr(t.code_hash ?? '—', 10, 6)}</span>}
        note={t.code_size ? `${groupDigits(String(t.code_size))} octets` : undefined}
      />
      <Line
        k="clones"
        v={t.n_twins ?? 0}
        note={
          (t.n_twins ?? 0) === 0
            ? 'ce bytecode n’est deploye qu’une fois dans le graphe'
            : 'meme code, autre adresse'
        }
      />
      {t.twins.map((x) => (
        <Line
          key={x.id}
          k={<span className="hex">{shortAddr(x.address, 10, 6)}</span>}
          v={x.label ?? '—'}
          note={`${x.n_pools} pool(s) mesure(s)`}
        />
      ))}
      <div className="px-[12px] py-[7px] flex items-center gap-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
        <code className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
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
      <Box title="son rayon de souffle">
        <Missing
          head={
            got.state === 'loading'
              ? 'lecture du graphe…'
              : got.state === 'absent'
                ? 'hook absent du graphe'
                : 'graphe non joignable'
          }
          detail={
            got.state === 'loading'
              ? `${API_BASE}/graph/impact`
              : `${got.detail} — aucun rayon n’est affiche : un graphe muet n’est pas un rayon nul.`
          }
          cmd={cmd}
        />
      </Box>
    )

  const i = got.data
  const extra = i.n_pools_at_risk - i.n_pools
  return (
    <Box
      title="son rayon de souffle"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          ce qu’il faudrait re-mesurer
        </span>
      }
    >
      <Line k="pools attaches" v={i.n_pools} note="dans le jeu publie" />
      <Line k="tokens touches" v={i.n_tokens} note="currency0 + currency1 de ces pools" />
      <Line
        k="pools des clones"
        v={i.n_twin_pools}
        note={`${i.bytecode.n_twins} clone(s) au meme bytecode`}
      />
      <Line
        k="freres du deployeur"
        v={i.deployer.n_siblings}
        note={
          i.deployer.status === 'CODE'
            ? `${i.deployer.deployers.map((d) => shortAddr(d, 8, 4)).join(', ')} · ${i.sibling_pools.length} pool(s)`
            : `deployeur ${i.deployer.status} — non compte`
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
          pools a re-mesurer si le defaut est dans le code
        </span>
        <span className="t-data-xs ml-auto text-right" style={{ color: 'var(--ink-3)' }}>
          {i.n_pools} direct{i.n_pools > 1 ? 's' : ''}
          {extra > 0 ? ` + ${extra} par les clones` : ' · aucun clone connu'}
        </span>
      </div>
      <div className="px-[12px] py-[7px] flex items-center gap-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
        <code className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
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
      <Box title="son desaccord avec le registre">
        <Missing
          head={
            got.state === 'loading'
              ? 'lecture du graphe…'
              : got.state === 'absent'
                ? 'hook absent du graphe'
                : 'graphe non joignable'
          }
          detail={
            got.state === 'loading'
              ? `${API_BASE}/graph/disagreement`
              : `${got.detail} — ni accord ni desaccord n’est affiche : les deux se lisent, aucun ne se suppose.`
          }
          cmd={cmd}
        />
      </Box>
    )

  const d = got.data
  const strong = isDisagreement(d.verdict)
  return (
    <Box
      title="son desaccord avec le registre"
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
          style={{ color: 'var(--ink-3)', maxWidth: '60ch', marginTop: 4 }}
        >
          {d.note}
        </p>
      </div>
      <Line
        k="vanillaSwap declare"
        v={
          d.vanillaSwap_declared.length === 0
            ? '—'
            : d.vanillaSwap_declared.map((v) => String(v)).join(', ')
        }
        note={`${d.n_registry_entries} fiche(s) au registre`}
      />
      <Line k="seuil de platitude" v={`${d.flat_bps} bps`} note="sous ce seuil, bruit d’arrondi du quoter" />
      <Profile p={d.profile} />
      <div className="px-[12px] py-[7px] flex items-center gap-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
        <code className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
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
      <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
        {got.state === 'loading' ? 'lecture du graphe…' : `graphe non joignable · ${API_BASE}`}
      </span>
    )
  const f = got.data.findings
  const g = got.data.graph
  return (
    <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
      {f.clone_clusters} grappes de clones ({f.hooks_in_clone_clusters} hooks) · {f.orphans}/
      {f.listed_hooks_on_chain} orphelins · {f.contradictions}/
      {f.hooks_with_multiple_registry_entries} fiches doubles qui divergent ·{' '}
      {f.registry_says_active_measure_says_flat + f.registry_says_vanilla_measure_says_active}{' '}
      desaccord(s) · {f.not_comparable} non comparables · bloc{' '}
      {g.block_number === null ? '—' : groupDigits(String(g.block_number))}
    </span>
  )
}

export function GraphPanels({ hook }: { hook: string }) {
  return (
    <Panel index="08" title="le graphe · ce que le hook touche autour de lui" right={<Findings />}>
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
        style={{ color: 'var(--ink-3)', maxWidth: '96ch' }}
      >
        Le graphe est bati depuis trois sources et rien d’autre : les mesures publiees, le registre
        officiel, et <code style={{ fontFamily: 'var(--mono)' }}>eth_getCode</code> au bloc epingle.
        Il ne calcule aucun bps — il range ceux que le moteur a mesures et les rend avec leur
        etiquette. Ces encarts viennent de l’API ({API_BASE}) : si elle ne repond pas, ils le disent
        au lieu d’afficher zero.
      </p>
    </Panel>
  )
}

/** Les pools que le rayon de souffle designe, listes. Exporte pour l'inspection. */
export function poolsAtRisk(i: Impact): string[] {
  return i.pools_at_risk.map(tail)
}
