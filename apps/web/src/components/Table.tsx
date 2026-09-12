import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table'
import { dataset, rowsById, type Hook } from '../lib/dataset'
import type { ColumnName, SortDir } from '../chat/types'
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
      className="t-data-sm inline-flex items-center gap-[3px]"
      // Eteint n'est pas gris pale : la pastille porte l'etat, le mot reste lisible.
      style={{ color: on ? 'var(--ink)' : 'var(--ink-2)', opacity: on ? 1 : 0.8 }}
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

/**
 * Le tableau est pilotable par l'assistant : `rows` restreint la selection, `visibleColumns`
 * choisit les colonnes, `sort` impose le tri, `highlight` marque des lignes. Sans ces
 * proprietes il se comporte exactement comme avant — le verdict initial ne depend d'aucune d'elles.
 */
export function HookTable({
  selected,
  onSelect,
  rows,
  visibleColumns,
  sort,
  highlight,
}: {
  selected: string | null
  onSelect: (address: string) => void
  rows?: Hook[]
  visibleColumns?: ColumnName[] | null
  sort?: { col: ColumnName; dir: SortDir } | null
  highlight?: string[]
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'mesure', desc: true }])
  // Le tri demande par l'assistant s'applique au tableau, et reste ensuite manipulable a la main.
  useEffect(() => {
    if (sort) setSorting([{ id: sort.col, desc: sort.dir === 'desc' }])
  }, [sort?.col, sort?.dir])
  const marques = useMemo(() => new Set(highlight ?? []), [highlight])
  const cadre = useRef<HTMLDivElement | null>(null)
  /** combien de colonnes sont hors du cadre, a droite — 0 quand tout tient */
  const [reste, setReste] = useState(0)
  const mesurer = useCallback(() => {
    const c = cadre.current
    if (!c) return
    const bord = c.getBoundingClientRect().right
    const ths = [...c.querySelectorAll('thead th')]
    setReste(ths.filter((t) => t.getBoundingClientRect().right > bord + 1).length)
  }, [])
  useEffect(() => {
    mesurer()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(mesurer)
    if (cadre.current) ro.observe(cadre.current)
    return () => ro.disconnect()
  }, [mesurer])
  const data = rows ?? dataset.hooks
  const columnVisibility = useMemo<VisibilityState>(() => {
    if (!visibleColumns || visibleColumns.length === 0) return {}
    const all: ColumnName[] = ['hook', 'registre', 'mesure', 'pools', 'mesures', 'etiquette', 'audit']
    return Object.fromEntries(all.map((c) => [c, visibleColumns.includes(c)]))
  }, [visibleColumns])

  const columns = useMemo(
    () => [
      col.accessor('address', {
        id: 'hook',
        header: 'hook',
        cell: (c) => {
          const h = c.row.original
          return (
            <div className="px-[10px] py-[6px]">
              <div className="t-data hex" style={{ color: 'var(--ink)' }}>
                {shortAddr(h.address, 10, 6)}
              </div>
              <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                {h.registry ? h.registry.name : 'nom inconnu'}
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                base · chainid {h.chainId}
              </div>
            </div>
          )
        },
      }),

      col.accessor((h) => (h.inRegistry ? 1 : 0), {
        id: 'registre',
        header: 'ce que le registre dit',
        cell: (c) => {
          const r = c.row.original.registry
          if (!r)
            return (
              <div className="px-[10px] py-[6px]">
                <div className="t-data" style={{ color: 'var(--ink)' }}>
                  ABSENT
                </div>
                <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                  aucune fiche dans hooklist.json
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
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
              <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                swapAccess : {r.swapAccess}
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                aucun champ numerique dans les {dataset.provenance.registry.entries} fiches
              </div>
            </div>
          )
        },
      }),

      col.accessor((h) => h.bpsMax ?? -1, {
        id: 'mesure',
        header: '\u2260 ce que la mesure dit',
        cell: (c) => {
          const h = c.row.original
          if (h.bpsMax === null)
            return (
              <div className="px-[10px] py-[6px] text-right">
                <div className="t-data" style={{ color: 'var(--ink)' }}>
                  —
                </div>
                <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                  aucune cotation
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
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
                {h.bpsMax.toFixed(2)} <span style={{ color: 'var(--ink-2)' }}>bps</span>
              </div>
              <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                min {h.bpsMin!.toFixed(2)} · {h.measuredCount} obs
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                bloc {fmtBlock(h.blocks[0])}
                {w && ` · ${powerOfTen(w.amount_in) ?? groupDigits(w.amount_in)} · ${w.zero_for_one ? 'c0→c1' : 'c1→c0'}`}
              </div>
            </div>
          )
        },
      }),

      col.accessor('poolCount', {
        id: 'pools',
        header: 'pools',
        cell: (c) => {
          const h = c.row.original
          return (
            <div className="px-[10px] py-[6px] text-right">
              <div className="t-data">{h.poolCount}</div>
              <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                {h.poolCountMeasured} cotes
              </div>
              <div
                className="t-data-sm"
                style={{ color: 'var(--ink-2)' }}
                title={`commissions LP lues on-chain : ${h.storedLpFees.join(', ')}`}
              >
                lp fee {h.storedLpFees.slice(0, 3).join('/')}
                {h.storedLpFees.length > 3 && ` +${h.storedLpFees.length - 3}`}
              </div>
            </div>
          )
        },
      }),

      col.accessor('rowCount', {
        id: 'mesures',
        header: 'mesures',
        cell: (c) => {
          const h = c.row.original
          return (
            <div className="px-[10px] py-[6px] text-right">
              <div className="t-data">{h.rowCount}</div>
              <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                {h.counts.MESURE} mesure
              </div>
              <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                {h.counts.NON_COTABLE} non cotable · {h.counts.NON_MESURABLE} non mesurable
              </div>
            </div>
          )
        },
      }),

      col.accessor('label', {
        id: 'etiquette',
        header: 'étiquette',
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
        header: 'audit',
        cell: (c) => {
          const r = c.row.original.registry
          const url = r?.auditUrl ?? ''
          return (
            <div className="px-[10px] py-[6px]">
              <div className="t-data" style={{ color: url ? 'var(--ink)' : 'var(--ink-2)' }}>
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
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
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
    data,
    columns,
    state: { sorting, columnVisibility },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  return (
    <div style={{ position: 'relative' }}>
    <div
      ref={cadre}
      className="overflow-x-auto tableau-registre"
      tabIndex={0}
      role="region"
      aria-label="tableau registre contre mesure, défilement horizontal"
      onScroll={mesurer}
    >
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
                  className="t-data-sm px-[10px] py-[8px] text-left cursor-pointer select-none align-bottom"
                  style={{
                    color: middle ? 'var(--ink)' : 'var(--ink-2)',
                    borderBottom: '1px solid var(--line-strong)',
                    borderLeft: hd.column.id === 'mesure' ? '1px solid var(--line-strong)' : undefined,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {flexRender(hd.column.columnDef.header, hd.getContext())}
                  <span style={{ color: 'var(--ink-2)' }}>
                    {dir === 'asc' ? ' ↑' : dir === 'desc' ? ' ↓' : ' ·'}
                  </span>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {table.getRowModel().rows.length === 0 && (
            <tr>
              <td
                colSpan={table.getVisibleFlatColumns().length}
                className="t-data-sm px-[10px] py-[12px]"
                style={{ color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }}
              >
                Aucune ligne ne satisfait ce critere. Ce n'est pas un zero : c'est une selection vide.
              </td>
            </tr>
          )}
          {table.getRowModel().rows.map((row, i) => {
            const h = row.original
            const isSel = selected === h.address
            const isMarque = marques.has(h.address)
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
                  background: isSel || isMarque ? 'var(--bg-3)' : i % 2 ? 'var(--bg-1)' : 'transparent',
                  borderBottom: '1px solid var(--line)',
                  outline: isSel ? '1px solid var(--line-strong)' : undefined,
                }}
              >
                {row.getVisibleCells().map((cell, ci) => (
                  <td
                    key={cell.id}
                    data-col={String(cell.column.columnDef.header)}
                    className="align-top"
                    style={{
                      // le surlignage de l'assistant est ACHROMATIQUE : il designe, il ne mesure pas
                      borderLeft:
                        ci === 0 && isMarque
                          ? '3px solid var(--ink-2)'
                          : cell.column.id === 'mesure'
                            ? '1px solid var(--line-strong)'
                            : undefined,
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
    {/* LE REPERE DE TRONCATURE. Un nom accessible prevenait le lecteur d'ecran et personne
        d'autre ; l'interdiction d'ombre portee prive la page de l'affordance habituelle. Le
        filet fort marque le bord coupe, et le compte dit combien de colonnes restent. */}
    {reste > 0 && (
      <div
        aria-hidden="true"
        style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 1, background: 'var(--line-strong)' }}
      />
    )}
    {reste > 0 && (
      <div
        aria-hidden="true"
        className="t-data-sm"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          padding: '8px 10px',
          background: 'var(--bg-2)',
          borderLeft: '1px solid var(--line-strong)',
          borderBottom: '1px solid var(--line-strong)',
          color: 'var(--ink-2)',
          pointerEvents: 'none',
        }}
      >
        {reste} colonne{reste > 1 ? 's' : ''} à droite →
      </div>
    )}
    </div>
  )
}
