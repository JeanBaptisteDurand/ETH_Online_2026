import { useEffect, useMemo, useState } from 'react'
import { dataset, profileOf, rowsOfHook, type Hook } from '../lib/dataset'
import { rampCell } from '../lib/ramp'
import { explainReason, fmtBlock, groupDigits, powerOfTen, replayCommand, shortAddr } from '../lib/format'
import { Chip, Panel, Replay } from './Prim'
import { Curve } from './Curve'

/** Lignes brutes affichees d'un coup. Le reste est a une page de distance, jamais retire. */
const PAGE = 200

/** La phrase de desaccord. Elle n'invente rien : elle rapproche deux lectures. */
function disagreement(h: Hook): string {
  if (h.bpsMax === null)
    return "No usable quote on this hook at this block. A bounded read is a NON_MESURABLE, never a value."
  if (h.bpsMax <= 0)
    return "The measurement finds nothing: the same swap returns the same amount with and without the hook. The hook takes nothing on this path."
  const fee = h.storedLpFees.every((f) => f === 0)
  const parts: string[] = []
  parts.push(
    `The same swap, quoted twice at block ${fmtBlock(h.blocks[0])}, returns ${h.bpsMax.toFixed(2)} bps less with the hook than without it.`,
  )
  if (fee) parts.push("The LP fee read on-chain for these pools is ZERO: nothing in the pool state announces this take.")
  if (!h.registry) parts.push("And this hook has no entry in the official registry.")
  else {
    const d: string[] = []
    if (!h.registry.dynamicFee) d.push('dynamicFee = false')
    if (!h.registry.auditUrl) d.push('no audit')
    if (h.registry.verifiedSource) d.push('verified source')
    parts.push(`The registry, for its part, says: ${d.join(', ')} — and not a single numeric field.`)
  }
  return parts.join(' ')
}

/**
 * `focus` vient de l'action plotCurve de l'assistant : elle restreint la courbe a un pool et,
 * eventuellement, a un sens. Elle ne cache aucune ligne du tableau brut ci-dessous.
 */
export function Detail({
  hook,
  theme,
  focus,
}: {
  hook: Hook
  theme: string
  focus?: { pool: string; direction: '0->1' | '1->0' | null } | null
}) {
  const rows = useMemo(() => {
    const r = rowsOfHook(hook.address)
    return [...r].sort((a, b) => {
      if (a.pool_id !== b.pool_id) return a.pool_id.localeCompare(b.pool_id)
      if (a.zero_for_one !== b.zero_for_one) return a.zero_for_one ? -1 : 1
      return Number(a.amount_in) - Number(b.amount_in)
    })
  }, [hook.address])

  const toutes = useMemo(() => profileOf(hook.address), [hook.address])
  const series = useMemo(() => {
    if (!focus) return toutes
    const gardees = toutes.filter(
      (s) =>
        s.poolId === focus.pool &&
        (focus.direction === null || (focus.direction === '0->1') === s.zeroForOne),
    )
    // Un focus qui ne correspond a rien ne vide pas la courbe : il ne s'applique pas.
    return gardees.length ? gardees : toutes
  }, [toutes, focus?.pool, focus?.direction])
  const [openRow, setOpenRow] = useState<number | null>(hook.worstRowId)

  // Le tableau des lignes brutes est PAGINE. Il ne l'etait pas, et le hook le plus mesure en
  // deroulait 18 800 d'un coup : 132 000 cellules construites avant le premier texte affiche,
  // 6,9 s d'attente pour une page dont on ne lit jamais que le haut. Aucune ligne n'est
  // retiree — le titre du panneau annonce toujours le total, et chacune reste atteignable.
  const [page, setPage] = useState(0)
  const nbPages = Math.max(1, Math.ceil(rows.length / PAGE))
  const debut = page * PAGE
  const visibles = rows.slice(debut, debut + PAGE)

  /** Choisir une ligne, d'ou qu'elle vienne (le tableau, ou un point de la courbe), amene sa
   *  page. Sans ca, le detail du bas decrirait une ligne absente de l'ecran. */
  const choisir = (id: number | null) => {
    setOpenRow(id)
    if (id === null) return
    const i = rows.findIndex((r) => r.id === id)
    if (i >= 0) setPage(Math.floor(i / PAGE))
  }

  // On change de hook : on retombe sur SA pire ligne, et sur la page qui la porte.
  useEffect(() => {
    setOpenRow(hook.worstRowId)
    const i = rows.findIndex((r) => r.id === hook.worstRowId)
    setPage(i >= 0 ? Math.floor(i / PAGE) : 0)
  }, [hook.address, hook.worstRowId, rows])

  const current = openRow === null ? null : (rows.find((r) => r.id === openRow) ?? null)

  return (
    <div className="flex flex-col gap-[16px]">
      <Panel
        index="05"
        title="The record of the selected hook"
        meta={[<span className="hex" key="a">{shortAddr(hook.address, 12, 8)}</span>]}
        right={
          <div className="flex gap-[6px]">
            <Chip>{hook.label}</Chip>
            <Chip>{hook.inRegistry ? 'in the registry' : 'absent from the registry'}</Chip>
          </div>
        }
      >
        <div className="p-[16px] flex flex-col gap-[12px]">
          <div className="hex t-data-lg" style={{ color: 'var(--ink)' }}>
            {hook.address}
          </div>

          <div className="flex flex-wrap gap-[24px]">
            <div style={rampCell(hook.bpsMax)} className="px-[12px] py-[8px]">
              <div className="t-metric" style={{ color: 'var(--ink)' }}>
                {hook.bpsMax === null ? '—' : hook.bpsMax.toFixed(2)}
              </div>
              <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                maximum bps observed
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                over {hook.measuredCount} observations · block {fmtBlock(hook.blocks[0])}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-[2px]">
              <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                {hook.registry ? hook.registry.name : 'no entry in the registry'}
              </div>
              <p
                className="t-data-sm m-0"
                style={{ fontFamily: 'var(--prose)', maxWidth: '68ch', color: 'var(--ink-2)' }}
              >
                {hook.registry?.description || 'The official registry does not describe this hook.'}
              </p>
            </div>
          </div>

          <p
            className="m-0"
            style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '78ch', color: 'var(--ink)' }}
          >
            {disagreement(hook)}
          </p>
        </div>
      </Panel>

      <Panel
        index="06"
        title="The size-to-bps profile"
        right={
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            {focus && series.length < toutes.length
              ? `assistant: ${series.length}/${toutes.length} series, pool ${shortAddr(focus.pool, 8, 6)}${focus.direction ? `, ${focus.direction}` : ''}`
              : 'bare canvas, no spline, no animated value'}
          </span>
        }
      >
        <Curve series={series} theme={theme} onPick={choisir} />
      </Panel>

      <Panel
        index="07"
        title="The raw rows of this hook"
        meta={[
          `${rows.length} rows`,
          dataset.provenance.measurements.path,
          dataset.provenance.measurements.engine_ver,
        ]}
      >
        <div
          className="overflow-auto"
          tabIndex={0}
          role="region"
          aria-label="the raw rows of this hook, scrolling table"
          style={{ maxHeight: 420 }}
        >
          <table className="w-full border-collapse" style={{ minWidth: 980 }}>
            <thead>
              <tr style={{ background: 'var(--bg-2)' }}>
                {['pool', 'direction', 'size (units of the input token)', 'bps', 'label', 'reason', 'block'].map(
                  (h) => (
                    <th
                      key={h}
                      className="t-data-sm px-[10px] py-[6px] text-left sticky top-0"
                      style={{
                        color: 'var(--ink-2)',
                        background: 'var(--bg-2)',
                        borderBottom: '1px solid var(--line-strong)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {visibles.map((r, k) => {
                const i = debut + k
                const sel = r.id === openRow
                return (
                  <tr
                    key={r.id}
                    onClick={() => choisir(sel ? null : r.id)}
                    className="cursor-pointer"
                    style={{
                      background: sel ? 'var(--bg-3)' : i % 2 ? 'var(--bg-1)' : 'transparent',
                      borderBottom: '1px solid var(--line)',
                    }}
                  >
                    <td className="t-data-sm hex px-[10px] py-[4px]" style={{ color: 'var(--ink-2)' }}>
                      {shortAddr(r.pool_id, 10, 6)}
                    </td>
                    <td className="t-data-sm px-[10px] py-[4px]" style={{ color: 'var(--ink-2)' }}>
                      {r.zero_for_one ? 'c0 → c1' : 'c1 → c0'}
                    </td>
                    <td className="t-data-sm px-[10px] py-[4px] text-right" style={{ color: 'var(--ink-2)' }}>
                      {powerOfTen(r.amount_in) ?? groupDigits(r.amount_in)}
                    </td>
                    <td className="t-data px-[10px] py-[4px] text-right" style={rampCell(r.bps)}>
                      {r.bps === null ? '—' : r.bps.toFixed(2)}
                    </td>
                    <td className="px-[10px] py-[4px]">
                      <Chip>{r.label}</Chip>
                    </td>
                    <td
                      className="t-data-xs hex px-[10px] py-[4px]"
                      style={{ color: 'var(--ink-2)' }}
                      title={explainReason(r.reason) ?? undefined}
                    >
                      {r.reason ? (explainReason(r.reason) ? `${r.reason} · ${explainReason(r.reason)!.split(' — ')[0]}` : r.reason) : '—'}
                    </td>
                    <td className="t-data-xs px-[10px] py-[4px]" style={{ color: 'var(--ink-2)' }}>
                      {fmtBlock(r.block_number)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {nbPages > 1 && (
          <div
            className="flex flex-wrap items-center gap-[10px] px-[16px] py-[8px] t-data-xs"
            style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}
          >
            <button
              onClick={() => setPage((p) => Math.max(0, p - 1))}
              disabled={page === 0}
              className="t-data-xs"
              style={{
                padding: '4px 9px',
                border: '1px solid var(--line)',
                background: 'var(--bg-2)',
                color: page === 0 ? 'var(--ink-4)' : 'var(--ink-2)',
                cursor: page === 0 ? 'default' : 'pointer',
              }}
            >
              ‹ previous
            </button>
            <span>
              rows {groupDigits(String(debut + 1))} to{' '}
              {groupDigits(String(Math.min(debut + PAGE, rows.length)))} of{' '}
              {groupDigits(String(rows.length))} · page {page + 1}/{nbPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(nbPages - 1, p + 1))}
              disabled={page >= nbPages - 1}
              className="t-data-xs"
              style={{
                padding: '4px 9px',
                border: '1px solid var(--line)',
                background: 'var(--bg-2)',
                color: page >= nbPages - 1 ? 'var(--ink-4)' : 'var(--ink-2)',
                cursor: page >= nbPages - 1 ? 'default' : 'pointer',
              }}
            >
              next ›
            </button>
            {hook.worstRowId !== null && (
              <button
                onClick={() => choisir(hook.worstRowId)}
                className="t-data-xs"
                style={{
                  padding: '4px 9px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-2)',
                  color: 'var(--ink-2)',
                  cursor: 'pointer',
                }}
              >
                go to the worst row
              </button>
            )}
          </div>
        )}

        {current && (
          <div className="p-[16px] flex flex-col gap-[10px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
            <div className="flex flex-wrap gap-x-[24px] gap-y-[4px] t-data-sm" style={{ color: 'var(--ink-2)' }}>
              <span>
                value <span style={{ color: 'var(--ink)' }}>{current.bps === null ? '—' : `${current.bps.toFixed(4)} bps`}</span>
              </span>
              <span>
                size <span style={{ color: 'var(--ink)' }}>{powerOfTen(current.amount_in) ?? groupDigits(current.amount_in)}</span>
              </span>
              <span>
                direction <span style={{ color: 'var(--ink)' }}>{current.zero_for_one ? 'currency0 → currency1' : 'currency1 → currency0'}</span>
              </span>
              <span>
                block <span style={{ color: 'var(--ink)' }}>{fmtBlock(current.block_number)}</span>
              </span>
              <span>
                lp fee on-chain <span style={{ color: 'var(--ink)' }}>{String(current.stored_lp_fee)}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-x-[24px] gap-y-[4px] t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
              <span>with the hook: {current.out_with ?? '—'}</span>
              <span>without the hook: {current.out_without ?? '—'}</span>
              <span>stub fingerprint: {shortAddr(current.stub_hash, 10, 8)}</span>
            </div>
            <Replay
              cmd={replayCommand(current)}
              note={`Run from the root of the repository, after “docker compose up -d anvil” (Base fork pinned at block ${fmtBlock(current.block_number)}). The engine replaces the hook bytecode with the inert stub, quotes twice, then restores the original bytecode. Verified: this command returns out_with, out_without and bps identical to the row above.`}
            />
          </div>
        )}
      </Panel>
    </div>
  )
}
