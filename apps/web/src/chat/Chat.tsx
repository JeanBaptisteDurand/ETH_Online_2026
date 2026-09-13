import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Chip, Copy, Replay } from '../components/Prim'
import { rampCell } from '../lib/ramp'
import { fmtBlock, groupDigits, powerOfTen, shortAddr } from '../lib/format'
import type { ActionResult, ChatView, Citation, Withheld } from './types'
import { EMPTY_VIEW } from './types'
import type { Model } from './model'
import { applyActions, crossCheck, encodeView } from './engine'
import { parseActions } from './validate'
import { askStream, assistantBase, assistantNonPublie, health, sessionId, START_COMMAND, type Answer, type Health } from './client'

// LE PANNEAU DE CHAT.
//
// Ce panneau ne repond pas : il RELAIE. La question part a l'assistant (apps/api/src/assistant),
// qui rend des ACTIONS TYPEES ; le front les revalide (validate.ts) puis les execute sur le
// tableau qui est deja a l'ecran (engine.ts). Le tableau bouge, et on peut dire pourquoi.
//
// Ce que ce panneau s'interdit :
//   - afficher un nombre que l'assistant n'a pas source (chaque citation porte son bloc,
//     sa taille, son sens et sa commande de rejeu) ;
//   - publier une reponse tronquee : si le flux se coupe avant `done`, le tableau est REMIS
//     comme il etait et l'echec est ecrit ;
//   - retarder le verdict : il est replie au chargement et n'ouvre aucune connexion avant
//     que quelqu'un ne l'ouvre.

const DEMO = 'show me the hooks the registry says vanillaSwap=false but that measure less than 1 bps'

const SUGGESTIONS = [
  DEMO,
  'the hooks that take more than 100 bps',
  'show the contradictions',
  'show the orphans',
]

type Turn =
  | { kind: 'question'; id: number; text: string }
  | { kind: 'systeme'; id: number; text: string; detail: string | null; command: string | null }
  | {
      kind: 'reponse'
      id: number
      answer: Answer
      results: ActionResult[]
      withheld: Withheld[]
      notes: string[]
      divergence: string | null
      registryNote: string | null
    }

let nextId = 1

/* --------------------------------------------------------------- morceaux */

function Ligne({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-[8px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
      <span style={{ minWidth: 96, flexShrink: 0 }}>{k}</span>
      <span className="hex" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>
        {v}
      </span>
    </div>
  )
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--line)', background: 'var(--bg-2)' }}>
      <div className="t-label px-[8px] py-[4px]" style={{ color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }}>
        {titre}
      </div>
      <div className="px-[8px] py-[6px] flex flex-col gap-[4px]">{children}</div>
    </div>
  )
}

/**
 * UNE CITATION. C'est la seule facon dont un nombre entre dans ce panneau : avec ce qu'il
 * veut dire, d'ou il vient, a quel bloc, sur quelle taille, dans quel sens — et la commande
 * qui le rejoue. Un denombrement porte sa recette a la place du bloc.
 */
function Cite({ c }: { c: Citation }) {
  const [ouvert, setOuvert] = useState(false)
  const mesure = c.kind === 'measurement'
  return (
    <div style={{ border: '1px solid var(--line)', background: 'var(--bg-1)' }}>
      <div className="flex items-baseline gap-[8px] px-[8px] py-[5px]" style={mesure ? rampCell(Number(c.token)) : undefined}>
        <span className="t-data" style={{ color: 'var(--ink)' }}>
          {c.token}
        </span>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {c.what}
        </span>
        {c.label && (
          <span className="ml-auto">
            <Chip title="label of the cited measurement, never promoted">{c.label}</Chip>
          </span>
        )}
      </div>
      <div className="px-[8px] py-[5px] flex flex-col gap-[2px]" style={{ borderTop: '1px solid var(--line)' }}>
        {c.block_number != null && <Ligne k="block" v={fmtBlock(c.block_number)} />}
        {c.amount_in && <Ligne k="size" v={powerOfTen(c.amount_in) ?? groupDigits(c.amount_in)} />}
        {c.direction && <Ligne k="direction" v={c.direction === '0->1' ? 'currency0 → currency1' : 'currency1 → currency0'} />}
        {c.pool_id && <Ligne k="pool" v={shortAddr(c.pool_id, 12, 8)} />}
        {c.measurement_id && <Ligne k="measurement id" v={c.measurement_id} />}
        {c.derived_from && <Ligne k="recipe" v={c.derived_from} />}
        <Ligne k="source" v={c.source} />
        {c.replay ? (
          <>
            <button
              type="button"
              className="t-label px-[6px] py-[2px] self-start cursor-pointer"
              style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-2)', color: 'var(--ink-2)' }}
              onClick={() => setOuvert((o) => !o)}
            >
              {ouvert ? 'hide the replay' : 'replay this value'}
            </button>
            {ouvert && <Replay cmd={c.replay} note="The fork must be running: docker compose up -d anvil." />}
          </>
        ) : (
          <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            count: it replays through its recipe, not through a measurement command.
          </div>
        )}
      </div>
    </div>
  )
}

function Reponse({ t }: { t: Extract<Turn, { kind: 'reponse' }> }) {
  const a = t.answer
  const mesures = a.citations.filter((c) => c.kind === 'measurement')
  return (
    <div className="flex flex-col gap-[8px]">
      <div className="flex flex-wrap items-baseline gap-[8px]">
        <Chip title="the intent read in the question">{a.intent || 'no intent'}</Chip>
        {a.label && <Chip title="label of the answer">{a.label}</Chip>}
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {a.reading}
        </span>
      </div>

      {a.why.length > 0 && (
        <ul className="m-0 pl-[14px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {a.why.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}

      {a.narration && (
        <p
          className="m-0"
          style={{ fontFamily: 'var(--prose)', fontSize: 14, lineHeight: 1.55, color: 'var(--ink)' }}
        >
          {a.narration}
        </p>
      )}

      <Bloc titre={`${t.results.length} action(s) run on the table`}>
        {t.results.map((r, i) => (
          <div key={i} className="flex flex-col gap-[2px]">
            <div className="flex items-baseline gap-[6px]">
              <span className="t-label" style={{ color: r.ok ? 'var(--ink-2)' : 'var(--ink-4)' }}>
                {r.action.type}
              </span>
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                {r.note}
              </span>
            </div>
            {r.lines.slice(0, 8).map((l, j) => (
              <Ligne key={j} k={l.k} v={l.v} />
            ))}
            {r.lines.length > 8 && (
              <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                … {r.lines.length - 8} more, in the table
              </div>
            )}
            {r.payload && r.action.type !== 'clarify' && (
              <div className="self-start">
                <Copy text={r.payload} label={r.action.type === 'permalink' ? 'copy the permalink' : 'copy the export'} />
              </div>
            )}
          </div>
        ))}
      </Bloc>

      {mesures.length === 0 && a.citations.length === 0 && (
        <div className="t-data-xs px-[8px] py-[5px]" style={{ color: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          No number is cited in this answer. There is therefore nothing to replay: the assistant has
          no measurement to produce here, and it does not invent one.
        </div>
      )}

      {a.citations.length > 0 && (
        <Bloc titre={`${a.citations.length} number(s) cited, each with its provenance`}>
          <div className="flex flex-col gap-[6px]">
            {a.citations.map((c, i) => (
              <Cite key={`${c.token}-${i}`} c={c} />
            ))}
          </div>
        </Bloc>
      )}

      {t.withheld.length > 0 && (
        <Bloc titre={`${t.withheld.length} row(s) set aside — never in silence`}>
          {t.withheld.map((w) => (
            <div key={w.hook} className="flex flex-col">
              <div className="flex items-baseline gap-[6px]">
                <span className="t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
                  {shortAddr(w.hook, 10, 6)}
                </span>
                <Chip>{w.label}</Chip>
              </div>
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                {w.reason}
              </span>
            </div>
          ))}
        </Bloc>
      )}

      {(t.divergence ||
        t.registryNote ||
        t.notes.length > 0 ||
        a.data.warnings.length > 0 ||
        a.data.truncated ||
        a.degraded) && (
        <Bloc titre="what to know before citing this answer">
          {t.divergence && (
            <div className="t-data-xs" style={{ color: 'var(--ink)' }}>
              {t.divergence}
            </div>
          )}
          {t.registryNote && (
            <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {t.registryNote}
            </div>
          )}
          {t.notes.map((n) => (
            <div key={n} className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {n}
            </div>
          ))}
          {a.data.warnings.map((w) => (
            <div key={w} className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {w}
            </div>
          ))}
          {a.data.truncated && (
            <div className="t-data-xs" style={{ color: 'var(--ink)' }}>
              PARTIAL READ on the server side: no numeric conclusion holds on this answer.
            </div>
          )}
          {a.degraded && (
            <div className="t-data-xs" style={{ color: 'var(--ink)' }}>
              {a.degraded.reason} — {a.degraded.detail}
            </div>
          )}
        </Bloc>
      )}

      <div className="flex flex-wrap gap-x-[12px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
        <span>
          server: {a.dataset?.measurements ?? '—'} measurements · registry {a.registry?.entries ?? '—'} entries
        </span>
        {a.quota && <span>quota: {a.quota.questions_left} question(s), {a.quota.measures_left} measurement(s)</span>}
        {a.timings_ms && <span>{a.timings_ms.total} ms</span>}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- panneau */

export function Chat({
  model,
  view,
  onView,
}: {
  model: Model
  view: ChatView
  onView: (v: ChatView) => void
}) {
  const [ouvert, setOuvert] = useState(false)
  const [tours, setTours] = useState<Turn[]>([])
  const [texte, setTexte] = useState('')
  const [enCours, setEnCours] = useState<string | null>(null)
  const [sante, setSante] = useState<Health | null>(null)
  const [santeErreur, setSanteErreur] = useState<string | null>(null)
  const base = useMemo(() => assistantBase(), [])
  const sid = useMemo(() => sessionId(), [])
  const filRef = useRef<HTMLDivElement>(null)
  const stopRef = useRef<(() => void) | null>(null)
  const vueRef = useRef<ChatView>(view)
  vueRef.current = view

  // Aucune requete tant que le panneau est replie : le verdict initial ne doit rien attendre.
  useEffect(() => {
    if (!ouvert || sante) return
    const ctl = new AbortController()
    health(base, ctl.signal).then(
      (h) => {
        setSante(h)
        setSanteErreur(null)
      },
      (e) => setSanteErreur((e as Error).message),
    )
    return () => ctl.abort()
  }, [ouvert, sante, base])

  useEffect(() => {
    filRef.current?.scrollTo({ top: filRef.current.scrollHeight })
  }, [tours, enCours])

  useEffect(() => () => stopRef.current?.(), [])

  const envoyer = useCallback(
    (question: string) => {
      const q = question.trim()
      if (q === '' || enCours !== null) return
      const avant: ChatView = vueRef.current
      setTexte('')
      setTours((t) => [...t, { kind: 'question', id: nextId++, text: q }])
      setEnCours(q)
      stopRef.current?.()

      const echec = (text: string, detail: string | null) => {
        // Regle dure : on ne conclut jamais sur une reponse tronquee. Le tableau revient
        // exactement comme il etait avant la question.
        onView(avant)
        setEnCours(null)
        setTours((t) => [
          ...t,
          {
            kind: 'systeme',
            id: nextId++,
            text,
            detail,
            command: detail && /reachable|Failed|NetworkError|fetch/i.test(`${text} ${detail}`) ? START_COMMAND : null,
          },
        ])
      }

      stopRef.current = askStream(base, q, sid, {
        onDone: (a) => {
          setEnCours(null)
          const parsed = parseActions(a.actions)
          if (!parsed.ok) {
            onView(avant)
            setTours((t) => [
              ...t,
              {
                kind: 'systeme',
                id: nextId++,
                text: 'the assistant returned actions this front end refuses to run',
                detail: parsed.issues.join(' · '),
                command: null,
              },
            ])
            return
          }
          const out = applyActions(parsed.actions, model, avant)
          onView(out.view)
          // Les deux cotes ne lisent pas forcement le MEME registre. Quand les corpus different,
          // les listes d'ecartes different aussi : on l'ecrit au lieu de laisser croire a un bug.
          const fichesServeur = a.registry?.entries ?? null
          setTours((t) => [
            ...t,
            {
              kind: 'reponse',
              id: nextId++,
              answer: a,
              results: out.results,
              withheld: out.withheld,
              notes: out.notes,
              divergence: crossCheck(out.selection, a.data.selection, out.view.filter, a.data.criteria),
              registryNote:
                fichesServeur !== null && fichesServeur !== model.registryEntries
                  ? `the server reads ${fichesServeur} registry entries, this browser ${model.registryEntries}: the set-aside lists may differ. The selection itself is compared row by row.`
                  : null,
            },
          ])
        },
        onError: echec,
      })
    },
    [base, sid, model, onView, enCours],
  )

  if (!ouvert)
    return (
      // Le pave flottant recouvrait un rang de la table a 390 et cumulait deux tells :
      // capitales chassees et point median. A cette largeur il se reduit a une cible de
      // 44 px qui porte son nom accessible ; au-dessus, il s'ecrit en toutes lettres.
      <button
        type="button"
        onClick={() => setOuvert(true)}
        aria-expanded={false}
        aria-label="open the assistant, which drives the table"
        className="fixed t-data cursor-pointer chat-pave"
        style={{
          right: 16,
          bottom: 16,
          zIndex: 20,
          minWidth: 44,
          minHeight: 44,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '0 12px',
          border: '1px solid var(--line-strong)',
          background: 'var(--bg-2)',
          color: 'var(--ink-2)',
        }}
      >
        <span aria-hidden="true">?</span>
        <span className="chat-pave-mot">the assistant drives the table</span>
      </button>
    )

  return (
    <aside
      className="fixed flex flex-col"
      style={{
        right: 16,
        bottom: 16,
        zIndex: 20,
        width: 'min(460px, calc(100vw - 32px))',
        maxHeight: 'min(720px, calc(100vh - 96px))',
        border: '1px solid var(--line-strong)',
        background: 'var(--bg-1)',
      }}
    >
      <header
        className="flex items-baseline gap-[10px] px-[12px] py-[8px]"
        style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line-strong)' }}
      >
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>
          07
        </span>
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>
          assistant
        </span>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {sante
            ? `${sante.dataset.measurements} measurements · ${sante.registry.entries} entries${sante.complete ? '' : ' · PARTIAL READ'}`
            : santeErreur
              ? 'offline'
              : 'contacting…'}
        </span>
        <button
          type="button"
          onClick={() => {
            stopRef.current?.()
            setOuvert(false)
          }}
          className="ml-auto t-label px-[6px] py-[2px] cursor-pointer"
          style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-1)', color: 'var(--ink-2)' }}
        >
          collapse
        </button>
      </header>

      <div ref={filRef} className="flex-1 overflow-y-auto px-[12px] py-[10px] flex flex-col gap-[12px]">
        {tours.length === 0 && (
          <div className="flex flex-col gap-[8px]">
            <p className="m-0 t-data-sm" style={{ color: 'var(--ink-2)' }}>
              Ask a question. The assistant does not answer with a number: it returns actions, this
              panel runs them on the table, and every cited value carries its block and its replay
              command.
            </p>
            {santeErreur && (
              <Bloc titre={assistantNonPublie(base) ? 'no assistant published' : 'assistant unreachable'}>
                <Ligne k="address" v={base} />
                <Ligne k="reason" v={santeErreur} />
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  {assistantNonPublie(base)
                    ? 'This version of the site is served without an assistant: the address above is the local fallback, and there is nothing to reach from here. This is not a breakage — everything else on this screen comes from the bundle and asks for no server. To try it: run the command, then come back with ?assistant=http://127.0.0.1:8788/assistant'
                    : 'Nothing is fabricated locally to make up for it: without the assistant, there is no answer. Start it, or pass another address with ?assistant='}
                </div>
                <Replay cmd={START_COMMAND} />
              </Bloc>
            )}
          </div>
        )}

        {tours.map((t) =>
          t.kind === 'question' ? (
            <div key={t.id} className="t-data" style={{ color: 'var(--ink)' }}>
              <span style={{ color: 'var(--ink-2)' }}>&gt; </span>
              {t.text}
            </div>
          ) : t.kind === 'systeme' ? (
            <div key={t.id} style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-2)' }}>
              <div className="t-label px-[8px] py-[4px]" style={{ color: 'var(--ink)', borderBottom: '1px solid var(--line)' }}>
                {t.text}
              </div>
              <div className="px-[8px] py-[6px] flex flex-col gap-[6px]">
                {t.detail && (
                  <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    {t.detail}
                  </div>
                )}
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  The table has been put back exactly as it was: nothing partial is published.
                </div>
                {t.command && <Replay cmd={t.command} />}
              </div>
            </div>
          ) : (
            <Reponse key={t.id} t={t} />
          ),
        )}

        {enCours !== null && (
          <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            reading in progress · nothing shows before the answer is whole
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-[4px] px-[12px] py-[6px]" style={{ borderTop: '1px solid var(--line)' }}>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={enCours !== null}
            onClick={() => envoyer(s)}
            className="t-data-xs px-[6px] py-[3px] cursor-pointer text-left"
            style={{
              border: '1px solid var(--line)',
              background: 'var(--bg-2)',
              color: enCours === null ? 'var(--ink-2)' : 'var(--ink-3)',
              maxWidth: '100%',
            }}
          >
            {s === DEMO ? 'the demo · vanillaSwap=false but less than 1 bps' : s}
          </button>
        ))}
        <button
          type="button"
          onClick={() => {
            onView(EMPTY_VIEW)
            setTours((t) => [
              ...t,
              { kind: 'systeme', id: nextId++, text: 'table reset', detail: null, command: null },
            ])
          }}
          className="t-data-xs px-[6px] py-[3px] cursor-pointer"
          style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink-2)' }}
        >
          reset
        </button>
        <button
          type="button"
          onClick={() => {
            const hash = encodeView(vueRef.current)
            window.history.replaceState(null, '', hash)
            navigator.clipboard?.writeText(window.location.href).catch(() => {})
          }}
          className="t-data-xs px-[6px] py-[3px] cursor-pointer"
          style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink-2)' }}
        >
          permalink
        </button>
      </div>

      <form
        className="flex gap-[6px] px-[12px] py-[8px]"
        style={{ borderTop: '1px solid var(--line-strong)', background: 'var(--bg-2)' }}
        onSubmit={(e) => {
          e.preventDefault()
          envoyer(texte)
        }}
      >
        <input
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          maxLength={600}
          aria-label="a question about the measured hooks"
          name="question"
          autoComplete="off"
          placeholder="which hooks take more than 100 bps?…"
          className="flex-1 t-data px-[8px] py-[6px]"
          style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-1)', color: 'var(--ink)' }}
        />
        <button
          type="submit"
          disabled={enCours !== null || texte.trim() === ''}
          className="t-label px-[10px] py-[6px] cursor-pointer"
          style={{
            border: '1px solid var(--line-strong)',
            background: 'var(--bg-1)',
            color: enCours === null && texte.trim() !== '' ? 'var(--ink)' : 'var(--ink-4)',
          }}
        >
          send
        </button>
      </form>
    </aside>
  )
}
