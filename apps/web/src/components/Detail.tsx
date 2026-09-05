import { useMemo, useState } from 'react'
import { dataset, profileOf, rowsOfHook, type Hook } from '../lib/dataset'
import { rampCell } from '../lib/ramp'
import { explainReason, fmtBlock, groupDigits, powerOfTen, replayCommand, shortAddr } from '../lib/format'
import { Chip, Panel, Replay } from './Prim'
import { Curve } from './Curve'

/** La phrase de desaccord. Elle n'invente rien : elle rapproche deux lectures. */
function disagreement(h: Hook): string {
  if (h.bpsMax === null)
    return "Aucune cotation exploitable sur ce hook a ce bloc. Une lecture bornee est un NON_MESURABLE, jamais une valeur."
  if (h.bpsMax <= 0)
    return "La mesure ne trouve rien : le meme swap rend la meme quantite avec et sans le hook. Le hook ne prend pas sur ce chemin."
  const fee = h.storedLpFees.every((f) => f === 0)
  const parts: string[] = []
  parts.push(
    `Le meme swap, cote deux fois au bloc ${fmtBlock(h.blocks[0])}, rend ${h.bpsMax.toFixed(2)} bps de moins avec le hook que sans lui.`,
  )
  if (fee) parts.push("La commission LP lue on-chain pour ces pools vaut ZERO : rien dans l'etat du pool n'annonce ce prelevement.")
  if (!h.registry) parts.push("Et ce hook n'a aucune fiche dans le registre officiel.")
  else {
    const d: string[] = []
    if (!h.registry.dynamicFee) d.push('dynamicFee = false')
    if (!h.registry.auditUrl) d.push('aucun audit')
    if (h.registry.verifiedSource) d.push('source verifiee')
    parts.push(`Le registre, lui, dit : ${d.join(', ')} — et pas un seul champ numerique.`)
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

  const current = openRow === null ? null : (rows.find((r) => r.id === openRow) ?? null)

  return (
    <div className="flex flex-col gap-[16px]">
      <Panel
        index="04"
        title={`fiche hook · ${shortAddr(hook.address, 12, 8)}`}
        right={
          <div className="flex gap-[6px]">
            <Chip>{hook.label}</Chip>
            <Chip>{hook.inRegistry ? 'au registre' : 'absent du registre'}</Chip>
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
              <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
                bps maximum observes
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                sur {hook.measuredCount} observations · bloc {fmtBlock(hook.blocks[0])}
              </div>
            </div>
            <div className="flex flex-col justify-center gap-[2px]">
              <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
                {hook.registry ? hook.registry.name : 'aucune fiche au registre'}
              </div>
              <p
                className="t-data-sm m-0"
                style={{ fontFamily: 'var(--prose)', maxWidth: '68ch', color: 'var(--ink-2)' }}
              >
                {hook.registry?.description || 'Le registre officiel ne decrit pas ce hook.'}
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
        index="05"
        title="profil taille → bps"
        right={
          <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
            {focus && series.length < toutes.length
              ? `assistant : ${series.length}/${toutes.length} serie(s) · pool ${shortAddr(focus.pool, 8, 6)}${focus.direction ? ` · ${focus.direction}` : ''}`
              : 'canvas nu · aucune spline · aucune valeur animee'}
          </span>
        }
      >
        <Curve series={series} theme={theme} onPick={setOpenRow} />
      </Panel>

      <Panel
        index="06"
        title={`les ${rows.length} lignes brutes de ce hook`}
        right={
          <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
            {dataset.provenance.measurements.path} · {dataset.provenance.measurements.engine_ver}
          </span>
        }
      >
        <div className="overflow-auto" style={{ maxHeight: 420 }}>
          <table className="w-full border-collapse" style={{ minWidth: 980 }}>
            <thead>
              <tr style={{ background: 'var(--bg-2)' }}>
                {['POOL', 'SENS', 'TAILLE (unites du jeton entrant)', 'BPS', 'ETIQUETTE', 'RAISON', 'BLOC'].map(
                  (h) => (
                    <th
                      key={h}
                      className="t-label px-[10px] py-[6px] text-left sticky top-0"
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
              {rows.map((r, i) => {
                const sel = r.id === openRow
                return (
                  <tr
                    key={r.id}
                    onClick={() => setOpenRow(sel ? null : r.id)}
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
                      style={{ color: 'var(--ink-3)' }}
                      title={explainReason(r.reason) ?? undefined}
                    >
                      {r.reason ? (explainReason(r.reason) ? `${r.reason} · ${explainReason(r.reason)!.split(' — ')[0]}` : r.reason) : '—'}
                    </td>
                    <td className="t-data-xs px-[10px] py-[4px]" style={{ color: 'var(--ink-3)' }}>
                      {fmtBlock(r.block_number)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {current && (
          <div className="p-[16px] flex flex-col gap-[10px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
            <div className="flex flex-wrap gap-x-[24px] gap-y-[4px] t-data-sm" style={{ color: 'var(--ink-3)' }}>
              <span>
                valeur <span style={{ color: 'var(--ink)' }}>{current.bps === null ? '—' : `${current.bps.toFixed(4)} bps`}</span>
              </span>
              <span>
                taille <span style={{ color: 'var(--ink)' }}>{powerOfTen(current.amount_in) ?? groupDigits(current.amount_in)}</span>
              </span>
              <span>
                sens <span style={{ color: 'var(--ink)' }}>{current.zero_for_one ? 'currency0 → currency1' : 'currency1 → currency0'}</span>
              </span>
              <span>
                bloc <span style={{ color: 'var(--ink)' }}>{fmtBlock(current.block_number)}</span>
              </span>
              <span>
                lp fee on-chain <span style={{ color: 'var(--ink)' }}>{String(current.stored_lp_fee)}</span>
              </span>
            </div>
            <div className="flex flex-wrap gap-x-[24px] gap-y-[4px] t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
              <span>avec le hook : {current.out_with ?? '—'}</span>
              <span>sans le hook : {current.out_without ?? '—'}</span>
              <span>empreinte du stub : {shortAddr(current.stub_hash, 10, 8)}</span>
            </div>
            <Replay
              cmd={replayCommand(current)}
              note={`A lancer depuis la racine du depot, apres « docker compose up -d anvil » (fork Base epingle au bloc ${fmtBlock(current.block_number)}). Le moteur remplace le bytecode du hook par le stub inerte, cote deux fois, puis restaure le bytecode d'origine. Verifie : cette commande rend out_with, out_without et bps identiques a la ligne ci-dessus.`}
            />
          </div>
        )}
      </Panel>
    </div>
  )
}
