/**
 * LES SESSIONS ET LEUR QUOTA.
 *
 * Contrainte verifiee, et elle change le produit : facturer `measure` en x402 DEPUIS
 * LE NAVIGATEUR est impossible — aucun visiteur d'une page de demo n'a de compte
 * Hedera, ni la cle pour signer. x402 garde donc l'API et le MCP (des clients qui,
 * eux, ont un compte) ; le chat, lui, tourne sur un QUOTA PAR SESSION.
 *
 * Le quota est en memoire : il protege le fork et le moteur d'un visiteur trop
 * curieux, il ne pretend pas etre une facturation.
 */
export interface Session {
  id: string;
  created_at: number;
  last_seen: number;
  questions: number;
  measures: number;
  /** de quoi parlait la reponse precedente — "ouvre-la" en a besoin */
  lastHooks: string[];
  openHook: string | null;
  openPool: string | null;
}

export interface QuotaConfig {
  /** questions par session et par fenetre */
  questions: number;
  /** demandes de mesure par session et par fenetre */
  measures: number;
  windowMs: number;
  /** nombre max de sessions gardees en memoire */
  maxSessions: number;
}

export const DEFAULT_QUOTA: QuotaConfig = {
  questions: 40,
  measures: 3,
  windowMs: 60 * 60 * 1000,
  maxSessions: 5000,
};

export interface QuotaState {
  questions_used: number;
  questions_left: number;
  measures_used: number;
  measures_left: number;
  window_ms: number;
  resets_at: number;
  /** pourquoi un quota et pas un paiement */
  why: string;
}

const WHY =
  "Le chat tourne sur un quota de session : facturer une mesure en x402 depuis un navigateur est impossible, aucun visiteur n'a de compte Hedera. Le peage x402 garde l'API (POST /measure) et le MCP.";

export class SessionStore {
  private sessions = new Map<string, Session>();

  constructor(private cfg: QuotaConfig = DEFAULT_QUOTA) {}

  private sweep(now: number): void {
    for (const [id, s] of this.sessions) {
      if (now - s.created_at > this.cfg.windowMs) this.sessions.delete(id);
    }
    while (this.sessions.size > this.cfg.maxSessions) {
      const oldest = [...this.sessions.entries()].sort((a, b) => a[1].last_seen - b[1].last_seen)[0];
      if (!oldest) break;
      this.sessions.delete(oldest[0]);
    }
  }

  get(id: string, now = Date.now()): Session {
    this.sweep(now);
    let s = this.sessions.get(id);
    if (!s || now - s.created_at > this.cfg.windowMs) {
      s = {
        id,
        created_at: now,
        last_seen: now,
        questions: 0,
        measures: 0,
        lastHooks: [],
        openHook: null,
        openPool: null,
      };
      this.sessions.set(id, s);
    }
    s.last_seen = now;
    return s;
  }

  state(id: string, now = Date.now()): QuotaState {
    const s = this.get(id, now);
    return {
      questions_used: s.questions,
      questions_left: Math.max(0, this.cfg.questions - s.questions),
      measures_used: s.measures,
      measures_left: Math.max(0, this.cfg.measures - s.measures),
      window_ms: this.cfg.windowMs,
      resets_at: s.created_at + this.cfg.windowMs,
      why: WHY,
    };
  }

  /** Consomme une question. Rend false quand le quota est epuise — sans rien inventer. */
  spendQuestion(id: string, now = Date.now()): { ok: boolean; state: QuotaState } {
    const s = this.get(id, now);
    if (s.questions >= this.cfg.questions) return { ok: false, state: this.state(id, now) };
    s.questions += 1;
    return { ok: true, state: this.state(id, now) };
  }

  spendMeasure(id: string, now = Date.now()): { ok: boolean; state: QuotaState } {
    const s = this.get(id, now);
    if (s.measures >= this.cfg.measures) return { ok: false, state: this.state(id, now) };
    s.measures += 1;
    return { ok: true, state: this.state(id, now) };
  }

  remember(id: string, patch: Partial<Pick<Session, "lastHooks" | "openHook" | "openPool">>): void {
    const s = this.get(id);
    if (patch.lastHooks) s.lastHooks = patch.lastHooks.slice(0, 32);
    if (patch.openHook !== undefined) s.openHook = patch.openHook;
    if (patch.openPool !== undefined) s.openPool = patch.openPool;
  }

  size(): number {
    return this.sessions.size;
  }

  clear(): void {
    this.sessions.clear();
  }
}

/** Un identifiant de session lisible et sans donnee personnelle. */
export function newSessionId(): string {
  return "s_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function safeSessionId(raw: unknown): string {
  if (typeof raw === "string" && /^[A-Za-z0-9_-]{4,64}$/.test(raw)) return raw;
  return newSessionId();
}
