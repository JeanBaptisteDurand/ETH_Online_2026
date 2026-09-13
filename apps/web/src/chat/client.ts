// LE TRANSPORT VERS L'ASSISTANT.
//
// L'assistant tourne a cote de l'API de mesure (apps/api/src/assistant/server.ts) :
//
//     cd apps/api && npx tsx src/assistant/server.ts     # -> http://127.0.0.1:8788/assistant
//
// Deux chemins, dans cet ordre :
//   1. GET /stream — flux SSE, les etapes arrivent dans l'ordre ou elles se produisent ;
//   2. POST /ask   — une requete simple, si le flux ne s'ouvre pas.
//
// REGLE DURE : on ne conclut JAMAIS sur une reponse tronquee. Si le flux se coupe avant
// l'evenement `done`, rien n'est publie : ni la narration partielle, ni les actions
// partiellement appliquees. L'appelant recoit un echec explicite et remet le tableau comme
// il etait. Six faux resultats de ce projet sont nes d'une reponse coupee lue comme complete.

import type { Citation, Filter } from './types.ts'

export interface Quota {
  questions_used: number
  questions_left: number
  measures_used: number
  measures_left: number
  window_ms: number
  resets_at: number
  why: string
}

export interface ServerData {
  selection: string[]
  criteria: Filter | null
  withheld: { hook: string; name: string | null; reason: string; label: string }[]
  truncated: boolean
  warnings: string[]
}

export interface Answer {
  ok: boolean
  session_id: string
  question: string
  intent: string
  reading: string
  why: string[]
  actions: unknown
  narration: string
  citations: Citation[]
  identifiers: string[]
  label: string | null
  data: ServerData
  dataset: { source: string; measurements: number; hooks: number; pools: number; blocks: number[] }
  registry: { available: boolean; path: string | null; entries: number }
  quota: Quota
  honesty_rules: string[]
  degraded: { reason: string; detail: string } | null
  suggestions: string[]
  timings_ms: { plan: number; execute: number; narrate: number; total: number }
}

import { rienAJoindre } from '../lib/local'

const DEFAULT_BASE = 'http://127.0.0.1:8788/assistant'
const STORAGE_KEY = 'tare.assistant.base'

/** L'adresse de l'assistant : ?assistant= dans l'URL, puis VITE_ASSISTANT_URL, puis le defaut. */
export function assistantBase(): string {
  try {
    const q = new URLSearchParams(window.location.search).get('assistant')
    if (q) {
      window.localStorage.setItem(STORAGE_KEY, q)
      return q.replace(/\/$/, '')
    }
    const kept = window.localStorage.getItem(STORAGE_KEY)
    if (kept) return kept.replace(/\/$/, '')
  } catch {
    /* pas de localStorage (navigation privee) : on continue avec le defaut */
  }
  const env = (import.meta.env?.VITE_ASSISTANT_URL as string | undefined) ?? ''
  return (env || DEFAULT_BASE).replace(/\/$/, '')
}

export const START_COMMAND = 'cd apps/api && npx tsx src/assistant/server.ts'

/**
 * VRAI quand l'adresse de l'assistant est le repli local ET que la page est publique.
 *
 * Un visiteur d'une URL publique verrait sinon « http://127.0.0.1:8788 injoignable » et le
 * lirait comme « ce site est casse » — alors que la verite est « aucun assistant n'est
 * publie pour cette version ». La decision vit dans ../lib/local.ts, partagee avec les
 * encarts du graphe : ecrite deux fois, elle aurait divergé.
 */
export function assistantNonPublie(base = assistantBase()): boolean {
  return rienAJoindre({
    base,
    // `?assistant=` et localStorage sont des choix explicites de l'utilisateur : si l'un des
    // deux a pose une adresse, on la laisse essayer, locale ou non.
    donneeAuBuild: Boolean((import.meta.env?.VITE_ASSISTANT_URL as string | undefined) ?? '') || base !== DEFAULT_BASE,
    hostname: typeof location === 'undefined' ? '' : location.hostname,
  })
}

export interface Health {
  ok: boolean
  complete: boolean
  incomplete_reason: string | null
  dataset: { measurements: number; hooks: number; pools: number; blocks: number[] }
  registry: { available: boolean; entries: number }
  graph: Record<string, number>
}

export async function health(base: string, signal?: AbortSignal): Promise<Health> {
  const r = await fetch(`${base}/health`, { signal })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return (await r.json()) as Health
}

export interface StageHandlers {
  onPlan?: (p: { intent: string; reading: string; why: string[]; actions: unknown }) => void
  onNarrationChunk?: (chunk: string) => void
  /** l'unique porte de publication : rien n'est affiche comme resultat avant elle */
  onDone: (answer: Answer) => void
  onError: (message: string, detail: string | null) => void
}

/** Requete simple. Un 429 (quota) rend quand meme un corps complet : ce n'est pas une troncature. */
export async function askOnce(
  base: string,
  question: string,
  sessionId: string,
  signal?: AbortSignal,
): Promise<Answer> {
  const r = await fetch(`${base}/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question, session_id: sessionId }),
    signal,
  })
  const body = (await r.json()) as Answer
  if (!r.ok && r.status !== 429) throw new Error(`HTTP ${r.status}`)
  return body
}

/**
 * Flux SSE. Les etapes sont ASSEMBLEES ici, et rien n'est publie avant `done` :
 * une reponse a moitie arrivee n'est pas une reponse courte, c'est un echec.
 *
 * On ne rejoue pas la question en POST a la fin : ce serait consommer deux fois le quota
 * de la session pour une seule question posee.
 */
export function askStream(
  base: string,
  question: string,
  sessionId: string,
  h: StageHandlers,
): () => void {
  const url = `${base}/stream?q=${encodeURIComponent(question)}&session_id=${encodeURIComponent(sessionId)}`
  let es: EventSource
  try {
    es = new EventSource(url)
  } catch (e) {
    h.onError('stream unavailable', (e as Error).message)
    return () => {}
  }

  let settled = false
  let opened = false
  let fallback: AbortController | null = null
  const acc: Record<string, unknown> = {}
  const chunks: string[] = []

  const stop = () => {
    es.close()
    fallback?.abort()
  }
  const parse = (ev: Event): Record<string, unknown> | null => {
    try {
      return JSON.parse((ev as MessageEvent).data) as Record<string, unknown>
    } catch {
      return null
    }
  }

  es.addEventListener('hello', (ev) => {
    opened = true
    const d = parse(ev)
    if (d) Object.assign(acc, d)
  })
  es.addEventListener('plan', (ev) => {
    opened = true
    const d = parse(ev)
    if (!d) return
    Object.assign(acc, d)
    h.onPlan?.({
      intent: String(d.intent ?? ''),
      reading: String(d.reading ?? ''),
      why: Array.isArray(d.why) ? (d.why as string[]) : [],
      actions: d.actions,
    })
  })
  es.addEventListener('rows', (ev) => {
    const d = parse(ev)
    if (d) acc.rows_stage = d
  })
  es.addEventListener('narration', (ev) => {
    const d = parse(ev)
    if (!d) return
    chunks.push(String(d.chunk ?? ''))
    h.onNarrationChunk?.(String(d.chunk ?? ''))
  })
  es.addEventListener('citations', (ev) => {
    const d = parse(ev)
    if (d) acc.citations_stage = d
  })
  es.addEventListener('degraded', (ev) => {
    const d = parse(ev)
    if (d) acc.degraded = d
  })
  es.addEventListener('error', (ev) => {
    // `error` EMIS PAR LE SERVEUR : il porte un corps JSON. L'evenement d'erreur du
    // navigateur, lui, n'a pas de `data` — il est traite par es.onerror.
    const data = (ev as MessageEvent).data
    if (typeof data !== 'string' || data.length === 0) return
    settled = true
    stop()
    const d = parse(ev)
    h.onError(String(d?.error ?? 'stream interrupted'), d?.detail ? String(d.detail) : null)
  })
  es.addEventListener('done', (ev) => {
    settled = true
    es.close()
    const d = parse(ev) ?? {}
    const rows = acc.rows_stage as Record<string, unknown> | undefined
    const cit = acc.citations_stage as Record<string, unknown> | undefined
    if (!rows) {
      h.onError('incomplete answer', 'the stream ended without publishing a selection.')
      return
    }
    h.onDone({
      ok: true,
      session_id: String(acc.session_id ?? sessionId),
      question,
      intent: String(acc.intent ?? ''),
      reading: String(acc.reading ?? ''),
      why: Array.isArray(acc.why) ? (acc.why as string[]) : [],
      actions: acc.actions,
      narration: chunks.join(''),
      citations: Array.isArray(cit?.citations) ? (cit.citations as Citation[]) : [],
      identifiers: Array.isArray(cit?.identifiers) ? (cit.identifiers as string[]) : [],
      label: (d.label ?? null) as string | null,
      data: {
        selection: Array.isArray(rows.selection) ? (rows.selection as string[]) : [],
        criteria: (rows.criteria ?? null) as Filter | null,
        withheld: Array.isArray(rows.withheld) ? (rows.withheld as ServerData['withheld']) : [],
        truncated: Boolean(rows.truncated),
        warnings: Array.isArray(rows.warnings) ? (rows.warnings as string[]) : [],
      },
      dataset: acc.dataset as Answer['dataset'],
      registry: acc.registry as Answer['registry'],
      quota: d.quota as Quota,
      honesty_rules: Array.isArray(acc.honesty_rules) ? (acc.honesty_rules as string[]) : [],
      degraded: (d.degraded ?? acc.degraded ?? null) as Answer['degraded'],
      suggestions: [],
      timings_ms: (d.timings_ms ?? { plan: 0, execute: 0, narrate: 0, total: 0 }) as Answer['timings_ms'],
    })
  })
  es.onerror = () => {
    if (settled) return
    es.close()
    if (!opened) {
      // Le flux ne s'est jamais ouvert (pas de SSE, CORS, serveur eteint) : requete simple.
      settled = true
      fallback = new AbortController()
      askOnce(base, question, sessionId, fallback.signal).then(
        (a) => h.onDone(a),
        (e) => h.onError('the assistant is not reachable', (e as Error).message),
      )
      return
    }
    settled = true
    h.onError(
      'stream interrupted before the end',
      'no partial result is published: a cut answer is not an answer.',
    )
  }

  return stop
}

/** Un identifiant de session stable pour l'onglet : le quota est par session, pas par question. */
export function sessionId(): string {
  const KEY = 'tare.assistant.session'
  try {
    const kept = window.sessionStorage.getItem(KEY)
    if (kept) return kept
    const made = `web-${Math.random().toString(36).slice(2, 10)}`
    window.sessionStorage.setItem(KEY, made)
    return made
  } catch {
    return 'web-anonyme'
  }
}
