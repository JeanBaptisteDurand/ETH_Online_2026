import { useState, type CSSProperties, type ReactNode } from 'react'

/** Etiquette qualitative : typographique, jamais coloree (charte §4.1.4). */
export function Chip({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span className="chip hex" title={title}>
      {children}
    </span>
  )
}

/**
 * La cellule a trois etages (js-framework-benchmark, charte §4.9) :
 *   valeur 13px --ink · precision 11px --ink-3 · provenance 10px --ink-3
 * Le fond porte l'ordre de grandeur, la barre gauche porte le signal, l'encre ne change jamais.
 */
export function Cell({
  value,
  second,
  third,
  style,
  align = 'right',
  title,
}: {
  value: ReactNode
  second?: ReactNode
  third?: ReactNode
  style?: CSSProperties
  align?: 'left' | 'right'
  title?: string
}) {
  return (
    <div
      className="px-[10px] py-[6px] h-full"
      style={{ textAlign: align, ...style }}
      title={title}
    >
      <div className="t-data" style={{ color: 'var(--ink)' }}>
        {value}
      </div>
      {second !== undefined && (
        <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
          {second}
        </div>
      )}
      {third !== undefined && (
        <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          {third}
        </div>
      )}
    </div>
  )
}

/** Un bouton de copie qui dit ce qu'il a copie. Aucun nombre ne bouge, aucune couleur n'apparait. */
export function Copy({ text, label = 'copier' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false)
  return (
    <button
      type="button"
      className="t-label px-[6px] py-[2px] cursor-pointer"
      style={{
        border: '1px solid var(--line-strong)',
        background: 'var(--bg-2)',
        color: 'var(--ink-2)',
        transition: `color var(--t-feedback) linear`,
      }}
      onClick={() => {
        navigator.clipboard?.writeText(text).then(
          () => {
            setDone(true)
            window.setTimeout(() => setDone(false), 1200)
          },
          () => setDone(false),
        )
      }}
    >
      {done ? 'copie' : label}
    </button>
  )
}

/** Une commande rejouable, telle quelle, sans reformulation. */
export function Replay({ cmd, note }: { cmd: string; note?: string }) {
  return (
    <div style={{ border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
      <div
        className="t-label flex items-center justify-between px-[10px] py-[6px]"
        style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-3)' }}
      >
        <span>rejouer cette valeur</span>
        <Copy text={cmd} />
      </div>
      <pre
        className="t-data-sm hex px-[10px] py-[8px] m-0 overflow-x-auto whitespace-pre"
        style={{ color: 'var(--ink-2)' }}
      >
        {cmd}
      </pre>
      {note && (
        <div
          className="t-data-xs px-[10px] pb-[8px]"
          style={{ color: 'var(--ink-3)' }}
        >
          {note}
        </div>
      )}
    </div>
  )
}

export function Panel({
  index,
  title,
  right,
  children,
}: {
  index: string
  title: string
  right?: ReactNode
  children: ReactNode
}) {
  return (
    <section style={{ border: '1px solid var(--line)', background: 'var(--bg-1)' }}>
      <header
        className="flex items-baseline gap-[12px] px-[16px] py-[10px]"
        style={{ borderBottom: '1px solid var(--line-strong)', background: 'var(--bg-2)' }}
      >
        <span className="t-label" style={{ color: 'var(--ink-4)' }}>
          {index}
        </span>
        <h2 className="t-label m-0" style={{ color: 'var(--ink-2)' }}>
          {title}
        </h2>
        <div className="ml-auto">{right}</div>
      </header>
      {children}
    </section>
  )
}
