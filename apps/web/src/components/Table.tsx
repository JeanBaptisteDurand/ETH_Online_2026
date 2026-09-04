import { useMemo, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { dataset, rowsById, type Hook } from '../lib/dataset'
import { rampCell } from '../lib/ramp'
import { fmtBlock, powerOfTen, groupDigits, shortAddr } from '../lib/format'
import { Chip } from './Prim'

// Le tableau EST le resultat : il s'affiche au chargement, sans clic, sans wallet, sans reseau.
// Les deux colonnes du milieu — ce que le registre declare, ce que la mesure trouve — ne sont pas
// d'accord. C'est tout le produit.

const col = createColumnHelper<Hook>()

/** Un booleen n'est pas une grandeur : il n'est jamais colore (charte §4.1.4). */
function Bool({ on, label, title }: { on: boolean; label: string; title: string }) {
  return (
    <span
      title={title}
      className="t-data-xs inline-flex items-center gap-[3px]"
      style={{ color: on ? 'var(--ink)' : 'var(--ink-4)' }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          display: 'inline-block',
          border: '1px solid var(--line-strong)',
          background: on ? 'var(--ink-2)' : 'transparent',
        }}
      />
      {label}
    </span>
  )
}

export function HookTable({
  selected,
  onSelect,
}: {
  selected: string | null
  onSelect: (address: string) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'mesure', desc: true }])

  const columns = useMemo(
    () => [
      col.accessor('address', {
        id: 'hook',
        header: 'HOOK',
        cell: (c) => {
          const h = c.row.original
          return (
            <div className="px-[10px] py-[6px]">
              <div className="t-data hex" style={{ color: 'var(--ink)' }}>
                {shortAddr(h.address, 10, 6)}
              </div>
              <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
                {h.registry ? h.registry.name : 'nom inconnu'}
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                base · chainid {h.chainId}
              </div>
            </div>
          )
        },
      }),

      col.accessor((h) => (h.inRegistry ? 1 : 0), {
        id: 'registre',
        header: 'CE QUE LE REGISTRE DIT',
        cell: (c) => {
          const r = c.row.original.registry
          if (!r)
            return (
              <div className="px-[10px] py-[6px]">
                <div className="t-data" style={{ color: 'var(--ink)' }}>
                  ABSENT
                </div>
                <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
                  aucune fiche dans hooklist.json
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                  commit {dataset.provenance.registry.commit.slice(0, 7)}
                </div>
              </div>
            )
          return (
            <div className="px-[10px] py-[6px] flex flex-col gap-[3px]">
              <div className="flex flex-wrap gap-x-[10px] gap-y-[2px]">
                <Bool on={r.verifiedSource} label="SRC" title="verifiedSource — source verifiee" />
                <Bool on={r.dynamicFee} label="DYN" title="dynamicFee — commission dynamique declaree" />
                <Bool on={r.upgradeable} label="UPG" title="upgradeable — contrat evolutif" />
                <Bool on={r.vanillaSwap} label="VAN" title="vanillaSwap — swap standard" />
                <Bool
                  on={r.requiresCustomSwapData}
                  label="CSD"
                  title="requiresCustomSwapData — donnees de swap specifiques"
                />
              </div>
              <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
                swapAccess : {r.swapAccess}
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                aucun champ numerique dans les {dataset.provenance.registry.entries} fiches
              </div>
            </div>
          )
        },
      }),

      col.accessor((h) => h.bpsMax ?? -1, {
        id: 'mesure',
        header: '\u2260 CE QUE LA MESURE DIT',
        cell: (c) => {
          const h = c.row.original
          if (h.bpsMax === null)
            return (
              <div className="px-[10px] py-[6px] text-right">
                <div className="t-data" style={{ color: 'var(--ink)' }}>
                  —
                </div>
                <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
                  aucune cotation
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                  bloc {fmtBlock(h.blocks[0])}
                </div>
              </div>
            )
          // Regle 4 : la valeur affichee porte le bloc, la taille et le sens de l'observation
          // qui la produit — celle du maximum, pas une moyenne sans provenance.
          const w = h.worstRowId === null ? null : (rowsById.get(h.worstRowId) ?? null)
          return (
            <div className="px-[10px] py-[6px] text-right h-full" style={rampCell(h.bpsMax)}>
              <div className="t-data" style={{ color: 'var(--ink)' }}>
                {h.bpsMax.toFixed(2)} <span style={{ color: 'var(--ink-3)' }}>bps</span>
              </div>
              <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
                min {h.bpsMin!.toFixed(2)} · {h.measuredCount} obs
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                bloc {fmtBlock(h.blocks[0])}
                {w && ` · ${powerOfTen(w.amount_in) ?? groupDigits(w.amount_in)} · ${w.zero_for_one ? 'c0→c1' : 'c1→c0'}`}
              </div>
            </div>
          )
        },
      }),

      col.accessor('poolCount', {
        id: 'pools',
        header: 'POOLS',
        cell: (c) => {
          const h = c.row.original
          return (
            <div className="px-[10px] py-[6px] text-right">
              <div className="t-data">{h.poolCount}</div>
              <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
                {h.poolCountMeasured} cotes
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                lp fee on-chain {h.storedLpFees.join('/')}
              </div>
            </div>
          )
        },
      }),

      col.accessor('rowCount', {
        id: 'mesures',
        header: 'MESURES',
        cell: (c) => {
          const h = c.row.original
          return (
            <div className="px-[10px] py-[6px] text-right">
              <div className="t-data">{h.rowCount}</div>
              <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
                {h.counts.MESURE} mesure
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                {h.counts.NON_COTABLE} non cotable · {h.counts.NON_MESURABLE} non mesurable
              </div>
            </div>
          )
        },
      }),

      col.accessor('label', {
        id: 'etiquette',
        header: 'ETIQUETTE',
        cell: (c) => (
          <div className="px-[10px] py-[6px]">
            <Chip title="etiquette la plus forte presente sur ce hook, jamais une moyenne">
              {c.getValue()}
            </Chip>
          </div>
        ),
      }),

      col.accessor((h) => (h.registry?.auditUrl ? 1 : 0), {
        id: 'audit',
        header: 'AUDIT',
        cell: (c) => {
          const r = c.row.original.registry
          const url = r?.auditUrl ?? ''
          return (
            <div className="px-[10px] py-[6px]">
              <div className="t-data" style={{ color: url ? 'var(--ink)' : 'var(--ink-3)' }}>
                {url ? 'oui' : 'non'}
              </div>
              {url ? (
                <a
                  className="t-data-xs underline"
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: 'var(--focus)' }}
                >
                  ouvrir
                </a>
              ) : (
                <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                  {r ? 'auditUrl vide' : 'hors registre'}
                </div>
              )}
            </div>
          )
        },
      }),
    ],
    [],
  )

  const table = useReactTable({
    data: dataset.hooks,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse" style={{ minWidth: 1080 }}>
        <thead>
          <tr style={{ background: 'var(--bg-2)' }}>
            {table.getHeaderGroups()[0].headers.map((hd) => {
              const dir = hd.column.getIsSorted()
              const middle = hd.column.id === 'registre' || hd.column.id === 'mesure'
              return (
                <th
                  key={hd.id}
                  onClick={hd.column.getToggleSortingHandler()}
                  className="t-label px-[10px] py-[8px] text-left cursor-pointer select-none align-bottom"
                  style={{
                    color: middle ? 'var(--ink)' : 'var(--ink-2)',
                    borderBottom: '1px solid var(--line-strong)',
                    borderLeft: hd.column.id === 'mesure' ? '1px solid var(--line-strong)' : undefined,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {flexRender(hd.column.columnDef.header, hd.getContext())}
                  <span style={{ color: 'var(--ink-4)' }}>
                    {dir === 'asc' ? ' ↑' : dir === 'desc' ? ' ↓' : ' ·'}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, i) => {
            const h = row.original
            const isSel = selected === h.address
            return (
              <tr
                key={row.id}
                tabIndex={0}
                aria-selected={isSel}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onSelect(h.address)
                  }
                }}
                onClick={() => onSelect(h.address)}
                className="cursor-pointer"
                style={{
                  background: isSel ? 'var(--bg-3)' : i % 2 ? 'var(--bg-1)' : 'transparent',
                  borderBottom: '1px solid var(--line)',
                  outline: isSel ? '1px solid var(--line-strong)' : undefined,
                }}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="align-top"
                    style={{
                      borderLeft:
                        cell.column.id === 'mesure' ? '1px solid var(--line-strong)' : undefined,
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
