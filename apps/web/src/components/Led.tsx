import { useEffect, useMemo, useState } from 'react'
import { FLAGS, isAddress, permissionBits, permissionMask, touchesSwap } from '../lib/flags'
import type { RegistryEntry } from '../lib/dataset'
import { dataset } from '../lib/dataset'
import { Chip, Copy, Panel } from './Prim'

const EXAMPLES = [
  { addr: '0x985c14baa2a18316ffda0aefb3a632fadfca2acc', note: 'measures 100.00 bps' },
  { addr: '0xdda9bc41e324ef379e774ae1f7b062d23ea8aacc', note: 'absent from the registry' },
  { addr: '0x1aea38f06dece45c252ef1ac5af989d51dc8e8cc', note: 'door A3' },
  { addr: '0xc71b7fa56c92b05fbe2448a8bfeb2e9c085fe000', note: 'measures 0.00 bps' },
]

/** Chargement paresseux de l'instantane du registre : les LED n'en dependent pas. */
function useRegistry() {
  const [index, setIndex] = useState<Map<string, RegistryEntry[]> | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  useEffect(() => {
    let alive = true
    setState('loading')
    fetch(`${import.meta.env.BASE_URL}data/hooklist.snapshot.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((snap: { entries: RegistryEntry[] }) => {
        if (!alive) return
        const m = new Map<string, RegistryEntry[]>()
        for (const e of snap.entries) {
          const k = e.address.toLowerCase()
          if (!m.has(k)) m.set(k, [])
          m.get(k)!.push(e)
        }
        setIndex(m)
        setState('ready')
      })
      .catch(() => alive && setState('error'))
    return () => {
      alive = false
    }
  }, [])
  return { index, state }
}

export function LedWidget() {
  const [input, setInput] = useState(EXAMPLES[0].addr)
  const { index, state } = useRegistry()
  const value = input.trim()
  const valid = isAddress(value)

  const bits = useMemo(() => (valid ? permissionBits(value) : null), [valid, value])
  const mask = valid ? permissionMask(value) : null
  const reg = valid && index ? (index.get(value.toLowerCase()) ?? []) : []
  const measured = valid
    ? dataset.hooks.find((h) => h.address === value.toLowerCase()) ?? null
    : null

  return (
    <Panel
      index="04"
      title="The permissions, read on-chain"
      meta={['14 bits', 'BigInt(address) & 0x3FFF', 'no network call']}
    >
      <div className="p-[16px] flex flex-col gap-[16px]">
        <p className="prose t-data-sm" style={{ fontFamily: 'var(--prose)', fontSize: 14 }}>
          The 14 permissions of a Uniswap v4 hook <strong>are</strong> the 14 low bits of its
          address — <code style={{ fontFamily: 'var(--mono)' }}>Hooks.sol</code> reads the
          address, not a registry. Verified against the official registry snapshot:{' '}
          <strong>
            {dataset.provenance.registry.flag_bit_check.entries_matching_low14bits}/
            {dataset.provenance.registry.flag_bit_check.entries} entries,{' '}
            {dataset.provenance.registry.flag_bit_check.comparisons} bit comparisons, zero
            mismatch.
          </strong>{' '}
          This panel makes no request: paste an address, the answer is already there.
        </p>

        <div className="flex flex-wrap items-center gap-[8px]">
          <input
            value={input}
            spellCheck={false}
            onChange={(e) => setInput(e.target.value)}
            placeholder="0x0469… a hook address"
            aria-label="hook address"
            name="hook"
            autoComplete="off"
            translate="no"
            className="hex t-data px-[10px] py-[6px] flex-1 min-w-0 basis-[320px]"
            style={{
              background: 'var(--bg-2)',
              border: `1px solid ${valid || value === '' ? 'var(--line-strong)' : 'var(--m-4)'}`,
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
            }}
          />
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            {value === ''
              ? 'waiting'
              : valid
                ? `mask 0x${mask!.toString(16).padStart(4, '0')} · ${bits!.filter(Boolean).length}/14 active`
                : 'invalid address — 40 hex digits after 0x'}
          </span>
        </div>

        <div className="flex flex-wrap gap-[8px]">
          {EXAMPLES.map((e) => (
            <button
              key={e.addr}
              type="button"
              onClick={() => setInput(e.addr)}
              className="t-data-xs hex px-[6px] py-[3px] cursor-pointer text-left"
              style={{
                border: '1px solid var(--line)',
                background: value.toLowerCase() === e.addr ? 'var(--bg-3)' : 'transparent',
                color: 'var(--ink-2)',
              }}
            >
              {e.addr.slice(0, 10)}… <span style={{ color: 'var(--ink-2)' }}>{e.note}</span>
            </button>
          ))}
        </div>

        {/* Les 14 LED. Allume = --m-6 plein. Eteint = --bg-2. Rien d'autre n'est colore. */}
        {/* Une liste, pas quatorze div muettes : `aria-label` sur une balise sans role est
            ignore, et les permissions on-chain sont la seule lecture de cet ecran. */}
        <ul
          className="flex flex-wrap gap-[4px] m-0 p-0"
          style={{ listStyle: 'none' }}
          aria-label="hook permissions, fourteen bits"
        >
          {FLAGS.map((f, i) => {
            const on = bits ? bits[i] : false
            return (
              <li key={f.key} className="flex flex-col items-center gap-[4px] w-[46px]">
                <span
                  role="img"
                  aria-label={`bit ${f.bit}, ${f.key} — ${on ? 'active' : 'inactive'}`}
                  title={`bit ${f.bit} — ${f.key} — ${f.fr} — ${on ? 'ACTIVE' : 'inactive'}`}
                  style={{
                    display: 'block',
                    width: 10,
                    height: 10,
                    border: '1px solid var(--line-strong)',
                    background: on ? 'var(--m-6)' : 'var(--bg-2)',
                    transition: 'background var(--t-feedback) linear',
                  }}
                />
                {/* Eteint ne se dit pas en gris pale : la pastille porte l'etat, le mot
                    reste lisible. */}
                <span
                  className="t-data-sm text-center"
                  style={{ color: 'var(--ink-2)', opacity: on ? 1 : 0.75 }}
                >
                  {f.short}
                </span>
                <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                  {f.bit}
                </span>
              </li>
            )
          })}
        </ul>

        {bits && (
          <div className="flex flex-col gap-[6px]">
            <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
              {touchesSwap(bits)
                ? 'This hook runs on the swap path. It can take.'
                : 'No swap bit: this hook does not run on the swap path.'}
            </div>
            <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              What the permission says is what the hook <em>is allowed</em> to do. It says
              nothing about what it takes. Table 02 says what it takes.
            </div>
            <div className="flex flex-wrap items-center gap-[8px] pt-[4px]">
              <Copy
                text={FLAGS.filter((_, i) => bits[i]).map((f) => f.key).join(',') || '(none)'}
                label="copy the permissions"
              />
              {measured && (
                <Chip title={`this hook appears in our ${dataset.totals.rows.toLocaleString('fr')} measurements`}>
                  measurement: {measured.bpsMax === null ? 'none' : `${measured.bpsMax.toFixed(2)} bps max`}
                </Chip>
              )}
              {state === 'ready' &&
                (reg.length > 0 ? (
                  <Chip title={reg.map((r) => `${r.chain}: ${r.name}`).join(' · ')}>
                    registry: {reg[0].name} ({reg.map((r) => r.chain).join(', ')})
                  </Chip>
                ) : (
                  <Chip title="no entry in Uniswap/hooklist at this commit">
                    registry: absent
                  </Chip>
                ))}
              {state === 'loading' && (
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  registry still loading — the LEDs do not depend on it
                </span>
              )}
              {state === 'error' && (
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  registry snapshot unavailable — LEDs unchanged
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </Panel>
  )
}
