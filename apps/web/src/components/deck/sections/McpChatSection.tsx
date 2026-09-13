/**
 * TEMPS 5 — LE SERVEUR MCP.
 *
 * Copie exacte de `finale/sections/McpChatSection.tsx` : un transcript façon Claude Desktop,
 * deux boutons de questions prêtes, trois rôles de bulle (`user` / `tool` / `agent`), la frappe
 * caractère par caractère, le `↻ reset`, la pastille « répond… », et la grille
 * `minmax(0, 1.6fr) minmax(0, 1fr)` — transcript à gauche, rail de droite avec les questions
 * prêtes et la liste des outils.
 *
 * Les trois durées sont celles de la source : 140 ms avant l'appel d'outil, 320 ms avant la
 * réponse, puis la frappe.
 *
 * LE BUG QU'ON NE COPIE PAS. La source tapait en faisant un `setState` par caractère sur la
 * liste ENTIÈRE des messages : ~550 rendus React de tout le transcript pour une seule réponse.
 * Ici la bulle qui tape porte son propre état (`Frappe`), et elle seule se redessine.
 *
 * LE CONTENU EST LE NÔTRE : quatre outils, trois gratuits, `tare_measure` à 0,001 USDC ; et un
 * appel `tare_lookup` sur le hook le plus prélevant du corpus, avec sa vraie réponse.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Replay } from '../../Prim'
import { Eyebrow, Frappe, Mono, Titre, court, nb } from '../atoms'

interface ChatMsg {
  id: string
  role: 'user' | 'tool' | 'agent'
  content: string
  /** vrai quand la bulle doit se taper au lieu d'apparaître d'un coup */
  reveal?: boolean
}

interface PromptButton {
  id: 'outils' | 'lookup'
  label: string
  prompt: string
  response: string
  tool: string | null
  replay: string | null
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

const reduit = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

const ACCUEIL: ChatMsg = {
  id: 'system',
  role: 'agent',
  content: 'MCP server “tare” connected over stdio. Ready. Pick a question on the right →',
}

interface Pire {
  hook: string
  bps: number
  label: string
  out_with: string
  out_without: string
  block_number: number
  amount_in: string
  zero_for_one: boolean
  currency0: string
  currency1: string
  key_fee: number
  tick_spacing: number
}

interface McpChatSectionProps {
  pire: Pire
  mesures: number
  hooks: number
}

export function McpChatSection({ pire, mesures, hooks }: McpChatSectionProps) {
  const boutons = useMemo<PromptButton[]>(
    () => [
      {
        id: 'outils',
        label: 'which tools do you expose?',
        prompt: 'Which MCP tools does TARE expose, and which ones cost anything?',
        tool: null,
        replay: null,
        response: [
          'TARE exposes 4 tools, all readable offline.',
          '',
          '  • tare_lookup(hook)     everything already measured, labeled      FREE',
          '  • tare_impact(hook)     which pools and which tokens are exposed  FREE',
          '  • tare_twins(hook)      hooks with identical bytecode             FREE',
          '  • tare_measure(...)     a NEW measurement                   0.001 USDC',
          '',
          `The first three read ${nb(mesures)} measurements from disk: no request,`,
          'no key. The fourth needs the fork, and it says so.',
          '',
          'And the rule I cannot get around, because it is written',
          'into the tool descriptions themselves: I never state a number',
          'the tool did not return.',
        ].join('\n'),
      },
      {
        id: 'lookup',
        label: `how much does this hook take? ${court(pire.hook)}`,
        prompt: `How much does this hook really take? ${pire.hook}`,
        tool: `tare_lookup(\n  hook: "${pire.hook}"\n)`,
        response: [
          `→ read from docs/dataset/measurements.jsonl (${nb(mesures)} rows, ${nb(hooks)} hooks)`,
          '',
          `  bps            ${pire.bps.toFixed(4)}`,
          `  label          ${pire.label}`,
          `  out_with       ${pire.out_with}`,
          `  out_without    ${pire.out_without}`,
          `  block_number   ${nb(pire.block_number)}`,
          `  amount_in      ${pire.amount_in}`,
          `  direction      ${pire.zero_for_one ? '0 → 1' : '1 → 0'}`,
          '',
          '✓ measured by counterfactual: the same swap quoted twice, once',
          '  against an 89-byte inert stub at the hook address',
          '✓ replayable in one command — it is in the right-hand rail',
        ].join('\n'),
        replay: [
          'python3 apps/api/scripts/measure_one.py --rpc $RPC',
          `--block ${pire.block_number} --hooks ${pire.hook}`,
          `--currency0 ${pire.currency0} --currency1 ${pire.currency1}`,
          `--fee ${pire.key_fee} --tick-spacing ${pire.tick_spacing}`,
          `--zero-for-one ${pire.zero_for_one} --amount-in ${pire.amount_in}`,
        ].join(' '),
      },
    ],
    [pire, mesures, hooks],
  )

  const [messages, setMessages] = useState<ChatMsg[]>([ACCUEIL])
  const [busy, setBusy] = useState(false)
  const [replay, setReplay] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  // Le transcript suit la dernière bulle.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages])

  const send = useCallback(
    async (btn: PromptButton): Promise<void> => {
      if (busy) return
      setBusy(true)
      setReplay(null)
      const baseId = `${btn.id}-${Date.now()}`
      setMessages((m) => [...m, { id: `${baseId}-u`, role: 'user', content: btn.prompt }])
      await sleep(reduit() ? 0 : 140)
      if (btn.tool) {
        setMessages((m) => [...m, { id: `${baseId}-t`, role: 'tool', content: btn.tool! }])
        await sleep(reduit() ? 0 : 320)
      }
      // La bulle de réponse porte le texte COMPLET et se tape toute seule : c'est la
      // correction du bug de la source, qui réécrivait toute la liste à chaque caractère.
      setMessages((m) => [...m, { id: `${baseId}-a`, role: 'agent', content: btn.response, reveal: true }])
      if (btn.replay) setReplay(btn.replay)
    },
    [busy],
  )

  const reset = useCallback((): void => {
    setMessages([ACCUEIL])
    setReplay(null)
    setBusy(false)
  }, [])

  const fini = useCallback(() => setBusy(false), [])

  return (
    <>
      <Eyebrow tone="m-6">mcp server · claude desktop · stdio</Eyebrow>
      <Titre petit>
        A model asked “how much does this hook take?” invents a plausible number.{' '}
        <span style={{ color: 'var(--m-6)' }}>Click a question.</span>
      </Titre>

      <section className="dk-grille dk-g12 dk-fill" style={{ gridTemplateRows: 'minmax(0, 1fr)' }}>
        {/* Le transcript */}
        <div className="dk-chat">
          <div className="dk-chat-tete">
            <span className="dk-pastille" style={{ background: 'var(--m-6)' }} />
            <Mono style={{ fontSize: 'max(1.0cqi, 10px)', letterSpacing: '0.16em', color: 'var(--ink-2)' }}>
              claude desktop · mcp · tare
            </Mono>
            <button
              type="button"
              className="dk-ghost"
              style={{ marginLeft: 'auto' }}
              onClick={reset}
              title="Start the transcript over"
            >
              ↻ reset
            </button>
          </div>

          <div ref={scrollRef} className="dk-chat-zone">
            {messages.map((m) => (
              <ChatBubble key={m.id} msg={m} onFini={fini} />
            ))}
            {busy && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.7cqi' }}>
                <span className="dk-pastille" />
                <Mono style={{ color: 'var(--ink-2)', fontSize: 'max(0.98cqi, 10px)' }}>
                  tare is answering…
                </Mono>
              </div>
            )}
          </div>
        </div>

        {/* Le rail de droite : questions prêtes, puis les quatre outils */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: '1cqi', minWidth: 0, minHeight: 0 }}>
          <div className="dk-carte" style={{ flex: '0 0 auto' }}>
            <div className="dk-carte-titre">ready-made questions — click</div>
            {boutons.map((b) => (
              <button
                key={b.id}
                type="button"
                className="dk-prompt"
                onClick={() => void send(b)}
                disabled={busy}
                title="Send this question to the “tare” MCP server"
              >
                <span style={{ flex: 1 }}>{b.label}</span>
                <Mono
                  style={{
                    color: 'var(--m-5)',
                    fontSize: 'max(0.96cqi, 10px)',
                    letterSpacing: '0.12em',
                    whiteSpace: 'nowrap',
                  }}
                >
                  ▶ SEND
                </Mono>
              </button>
            ))}
          </div>

          <div className="dk-carte" style={{ flex: '0 0 auto' }}>
            <div className="dk-carte-titre">4 tools · 3 free · 1 paid</div>
            <ToolLine name="tare_lookup" prix="FREE" />
            <ToolLine name="tare_impact" prix="FREE" />
            <ToolLine name="tare_twins" prix="FREE" />
            <ToolLine name="tare_measure" prix="0.001 USDC" paye />
          </div>

          {replay ? (
            <div style={{ minWidth: 0 }}>
              <Replay cmd={replay} />
            </div>
          ) : (
            <div className="dk-prose" style={{ marginTop: 'auto' }}>
              The server does not run in this tab: it lives next to the model. The exchange is{' '}
              <strong style={{ color: 'var(--m-5)' }}>replayed</strong>; the values come from the corpus.
            </div>
          )}
        </aside>
      </section>
    </>
  )
}

/**
 * UNE BULLE. C'est ICI que vit la frappe — pas dans le parent.
 *
 * Un `setState` par caractère dans le parent redessinerait tout le transcript ; ici il ne
 * redessine que ce nœud-là.
 */
function ChatBubble({ msg, onFini }: { msg: ChatMsg; onFini: () => void }) {
  const etiquette =
    msg.role === 'user' ? 'user' : msg.role === 'tool' ? 'tool call · mcp' : 'tare · mcp'
  const couleur =
    msg.role === 'user' ? 'var(--ink-2)' : msg.role === 'tool' ? 'var(--focus)' : 'var(--m-6)'
  return (
    <div className="dk-bulle" data-role={msg.role}>
      <Mono
        style={{
          fontSize: 'max(0.9cqi, 9px)',
          letterSpacing: '0.18em',
          color: couleur,
          textTransform: 'uppercase',
          fontWeight: 600,
        }}
      >
        {etiquette}
      </Mono>
      <span>{msg.reveal ? <Frappe texte={msg.content} onFini={onFini} /> : msg.content}</span>
    </div>
  )
}

function ToolLine({ name, prix, paye }: { name: string; prix: string; paye?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.8cqi', padding: '0.25cqi 0', minWidth: 0 }}>
      <span
        aria-hidden
        style={{
          width: 'max(0.5cqi, 5px)',
          height: 'max(0.5cqi, 5px)',
          background: paye ? 'var(--m-4)' : 'var(--focus)',
          flex: '0 0 auto',
        }}
      />
      <Mono style={{ color: 'var(--ink)', fontSize: 'max(1.1cqi, 11px)' }}>{name}</Mono>
      <Mono
        style={{
          marginLeft: 'auto',
          color: paye ? 'var(--m-4)' : 'var(--ink-2)',
          fontSize: 'max(0.92cqi, 9.5px)',
          letterSpacing: '0.16em',
          whiteSpace: 'nowrap',
        }}
      >
        {prix}
      </Mono>
    </div>
  )
}
