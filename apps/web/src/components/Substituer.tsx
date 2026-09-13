/**
 * PANEL 16 — SUBSTITUTE THE TRANSACTION.
 *
 * The question that comes right after « what this door takes »: and elsewhere? This panel
 * asks `POST /alternative`, shows the answer exactly as it comes, and — only when a measured
 * cheaper door exists — offers to build the replacement transaction.
 *
 * THREE THINGS IT NEVER DOES:
 *
 *   1. IT DOES NOT SEND. It returns a `{to, data, value}` and a button that hands it to the
 *      wallet. The last hand on the transaction is the user's — that is hard rule n.4 of
 *      packages/guard/src/alternative.ts, held all the way to the screen.
 *
 *   2. IT DOES NOT JUDGE. Neither « this door is better », nor « the transaction is
 *      sendable ». Both judgements come from the server, which takes them from the table of
 *      125 072 measurements. Redoing them here would produce a second version, and two
 *      versions diverge.
 *
 *   3. IT INVENTS NO SENTENCE. Every state has its text in ../compte/substitution.ts, and
 *      the REASON returned by the server is displayed as it stands. A screen that rephrases
 *      a refusal ends up rephrasing it wrong.
 *
 * AND IT SHOWS THE RPC CALL COUNT. Out of 125 072 rows of the corpus, 124 704 answer « there
 * is only one door » and cost ZERO request: the route only touches the network after it has
 * checked that there is something to propose. That count on screen is what makes the promise
 * verifiable instead of something to be believed.
 */
import { useMemo, useState, type ReactNode } from 'react'
import { Panel, Copy, NonLu, Replay, Chip, Absence } from './Prim'
import { dataset } from '../lib/dataset'
import { Refus, ecouterPortefeuilles, type Fournisseur, type PortefeuilleAnnonce } from '../compte/api'
import {
  AFFICHAGE,
  SUITE,
  demanderAlternative,
  type ReponseAlternative,
} from '../compte/substitution'
import { useEffect } from 'react'

/* ------------------------------------------------ the pairs offered on screen */

/**
 * The four pairs of the corpus where a measured door is cheaper, at the same size and in the
 * same direction.
 *
 * We COMPUTE them from the embedded corpus instead of writing them down: the list changes at
 * every sweep, and a written list would silently go wrong. It is the same logic as
 * `chercherAlternative` — same two currencies, same direction, same size — and the server
 * will redo the computation anyway: this only serves to offer clickable examples.
 */
function couplesInteressants(limite = 8) {
  const parEchange = new Map<string, { pool: string; dir: '0->1' | '1->0'; taille: string; bps: number }[]>()
  for (const r of dataset.rows) {
    // The front corpus carries its labels in French: MESURE, INTERPOLE, NON_MESURABLE,
    // NON_COTABLE. `MEASURED` is the form used by the API and by the guard package, and tsc
    // caught the confusion — without it this filter would have kept NO row at all and the
    // example list would have stayed empty without anything saying so.
    if (r.label !== 'MESURE' || r.bps === null) continue
    const dir: '0->1' | '1->0' = r.zero_for_one ? '0->1' : '1->0'
    const entree = (r.zero_for_one ? r.currency0 : r.currency1).toLowerCase()
    const sortie = (r.zero_for_one ? r.currency1 : r.currency0).toLowerCase()
    const k = `${entree}|${sortie}|${r.amount_in}`
    const l = parEchange.get(k) ?? []
    l.push({ pool: r.pool_id, dir, taille: r.amount_in, bps: r.bps })
    parEchange.set(k, l)
  }
  const out: { pool: string; dir: '0->1' | '1->0'; taille: string; ecart: number }[] = []
  for (const l of parEchange.values()) {
    if (new Set(l.map((x) => x.pool)).size < 2) continue
    const pire = l.reduce((a, b) => (b.bps > a.bps ? b : a))
    const meilleur = l.reduce((a, b) => (b.bps < a.bps ? b : a))
    const ecart = pire.bps - meilleur.bps
    if (ecart < 1) continue
    out.push({ pool: pire.pool, dir: pire.dir, taille: pire.taille, ecart })
  }
  return out.sort((a, b) => b.ecart - a.ecart).slice(0, limite)
}

/* ---------------------------------------------------------------- presentation */

const L = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-baseline gap-[10px] px-[16px] py-[6px]" style={{ borderTop: '1px solid var(--line)' }}>
    <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 138 }}>{k}</span>
    <span className="t-data-xs" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>{v}</span>
  </div>
)

/**
 * A NAMED STATE, AND THE REASON THAT GOES WITH IT.
 *
 * Exported because panel 00 shows the very same states — `PRET` and the eight others of
 * packages/guard/src/envoi.ts — at the moment the user pastes a token address. A second
 * rendering of the same states would be a second vocabulary, and the two would drift apart.
 * `encadre: false` drops the frame for a caller that already provides its own padding.
 */
export function EtatNomme({
  etat,
  suite,
  raison,
  ton = 'var(--ink)',
  encadre = true,
}: {
  etat: string
  suite?: string | null
  raison: ReactNode
  ton?: string
  encadre?: boolean
}) {
  return (
    <div
      className={encadre ? 'px-[16px] pt-[13px] pb-[8px]' : ''}
      style={encadre ? { borderTop: '1px solid var(--line-strong)' } : undefined}
    >
      <div className="t-valeur" style={{ color: ton }}>
        {etat}
        {suite && <span style={{ color: 'var(--ink-2)' }}> — {suite}</span>}
      </div>
      <div
        className="t-data-xs mt-[6px]"
        style={{ color: 'var(--ink-2)', maxWidth: '78ch', lineHeight: 1.55, overflowWrap: 'anywhere' }}
      >
        {raison}
      </div>
    </div>
  )
}

/** A button whose inactive form stays visible, with the reason next to it. */
export function Bouton({
  children,
  onClick,
  actif = true,
  fort = false,
  titre,
}: {
  children: React.ReactNode
  onClick: () => void
  actif?: boolean
  fort?: boolean
  titre?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!actif}
      title={titre}
      className="t-label"
      style={{
        padding: '7px 13px',
        border: `1px solid ${fort && actif ? 'var(--line-strong)' : 'var(--line)'}`,
        background: fort && actif ? 'var(--bg-3)' : 'transparent',
        color: actif ? 'var(--ink)' : 'var(--ink-4)',
        cursor: actif ? 'pointer' : 'not-allowed',
      }}
    >
      {children}
    </button>
  )
}

const TON: Record<'neutre' | 'bon' | 'attention', string> = {
  neutre: 'var(--ink-2)',
  bon: 'var(--ink)',
  attention: 'var(--m-5)',
}

/* --------------------------------------------------------------------- the screen */

export function SubstituerPanel() {
  const exemples = useMemo(() => couplesInteressants(), [])
  const [pool, setPool] = useState(() => exemples[0]?.pool ?? '')
  const [dir, setDir] = useState<'0->1' | '1->0'>(() => exemples[0]?.dir ?? '0->1')
  const [taille, setTaille] = useState(() => exemples[0]?.taille ?? '')
  const [r, setR] = useState<ReponseAlternative | null>(null)
  const [refus, setRefus] = useState<Refus | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState<string | null>(null)
  const [portefeuilles, setPortefeuilles] = useState<PortefeuilleAnnonce[]>([])

  useEffect(() => ecouterPortefeuilles(setPortefeuilles), [])
  const fournisseur: Fournisseur | null = portefeuilles[0]?.provider ?? null

  const demander = async (construire: boolean) => {
    setOccupe(construire ? 'reading the chain' : 'comparing, no network')
    setRefus(null)
    setEnvoye(null)
    try {
      // The address is only asked for when BUILDING: the Permit2 state of an ERC-20 depends
      // on who signs. The comparison depends on nobody.
      let proprietaire: string | undefined
      if (construire && fournisseur) {
        const c = (await fournisseur.request({ method: 'eth_requestAccounts' })) as string[]
        proprietaire = c?.[0]
      }
      setR(
        await demanderAlternative({
          pool_id: pool,
          direction: dir,
          amount_in: taille || undefined,
          construire,
          proprietaire,
        }),
      )
    } catch (e) {
      setRefus(e instanceof Refus ? e : new Refus('erreur', (e as Error).message))
      setR(null)
    } finally {
      setOccupe(null)
    }
  }

  const envoyer = async () => {
    const tx = r?.envoi.transaction
    if (!tx || !fournisseur) return
    setOccupe('signature in the wallet')
    try {
      const c = (await fournisseur.request({ method: 'eth_requestAccounts' })) as string[]
      const hash = (await fournisseur.request({
        method: 'eth_sendTransaction',
        params: [{ from: c?.[0], to: tx.to, data: tx.data, value: tx.value }],
      })) as string
      setEnvoye(hash)
    } catch (e) {
      const err = e as { code?: number; message?: string }
      setRefus(
        new Refus(
          'erreur',
          err.code === 4001
            ? 'declined in the wallet. That is an answer, not a failure.'
            : `could not send: ${err.message ?? 'no message'}`,
        ),
      )
    } finally {
      setOccupe(null)
    }
  }

  const approuver = async () => {
    const a = r?.envoi.permit2?.approbation
    if (!a || !fournisseur) return
    setOccupe('approval in the wallet')
    try {
      const c = (await fournisseur.request({ method: 'eth_requestAccounts' })) as string[]
      const hash = (await fournisseur.request({
        method: 'eth_sendTransaction',
        params: [{ from: c?.[0], to: a.to, data: a.data }],
      })) as string
      setEnvoye(hash)
    } catch (e) {
      setRefus(new Refus('erreur', `could not approve: ${(e as Error).message}`))
    } finally {
      setOccupe(null)
    }
  }

  const alt = r?.alternative
  const env = r?.envoi
  const aff = alt ? AFFICHAGE[alt.etat] : null
  const suite = env ? SUITE[env.etat] : null

  return (
    <Panel
      index="16"
      title="And elsewhere? The replacement door"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {r ? `${r.appels_rpc} RPC call(s)` : 'the comparison costs no request'}
        </span>
      }
    >
      <p
        className="m-0 px-[16px] py-[12px]"
        style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '78ch', color: 'var(--ink-2)' }}
      >
        Out of the <strong style={{ color: 'var(--ink)' }}>125 072</strong> rows of the corpus,{' '}
        <strong style={{ color: 'var(--ink)' }}>124 704</strong> answer « there is only one door »
        — and that is an answer, not a failed search.{' '}
        <strong style={{ color: 'var(--ink)' }}>Fifteen</strong> clear the one basis point
        threshold, over <strong>four</strong> pairs of pools; the best one takes you from 295.59
        down to 216.92 bps, two pools with the same currencies, the same fee and the same{' '}
        <code style={{ fontFamily: 'var(--mono)' }}>tickSpacing</code>, differing only by their
        hook. None of them exceeds 100 bps. The real actionable variable is still the size.
      </p>

      {exemples.length > 0 && (
        <L
          k="pairs from the corpus"
          v={
            <span className="flex flex-wrap gap-[6px]">
              {exemples.map((e) => (
                <button
                  key={`${e.pool}${e.dir}${e.taille}`}
                  type="button"
                  onClick={() => {
                    setPool(e.pool)
                    setDir(e.dir)
                    setTaille(e.taille)
                    setR(null)
                    setRefus(null)
                  }}
                  className="t-label"
                  style={{
                    padding: '4px 8px',
                    border: `1px solid ${pool === e.pool && dir === e.dir && taille === e.taille ? 'var(--line-strong)' : 'var(--line)'}`,
                    background: 'transparent',
                    color: 'var(--ink-2)',
                    cursor: 'pointer',
                  }}
                  title={`${e.pool} · ${e.dir} · ${e.taille}`}
                >
                  {e.pool.slice(0, 8)}… {e.dir} · {e.ecart.toFixed(1)} bps
                </button>
              ))}
            </span>
          }
        />
      )}

      <L
        k="pool"
        v={
          <input
            value={pool}
            onChange={(ev) => setPool(ev.target.value.trim())}
            spellCheck={false}
            aria-label="identifier of the current pool"
            name="pool"
            autoComplete="off"
            translate="no"
            className="t-data-sm"
            style={{
              width: '100%',
              maxWidth: 560,
              padding: '5px 8px',
              border: '1px solid var(--line)',
              background: 'var(--bg-2)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
            }}
            placeholder="0x… (64 hex)"
          />
        }
      />
      <L
        k="direction · size"
        v={
          <span className="flex flex-wrap items-center gap-[8px]">
            {(['0->1', '1->0'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDir(d)}
                className="t-label"
                style={{
                  padding: '4px 9px',
                  border: `1px solid ${dir === d ? 'var(--line-strong)' : 'var(--line)'}`,
                  background: dir === d ? 'var(--bg-3)' : 'transparent',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                {d}
              </button>
            ))}
            <input
              value={taille}
              onChange={(ev) => setTaille(ev.target.value.replace(/[^0-9]/g, ''))}
              spellCheck={false}
              aria-label="size spent, in units of the input token"
              name="taille"
              autoComplete="off"
              inputMode="numeric"
              className="t-data-sm"
              style={{
                // A fixed `width: 230` overflowed at 400 px: a fixed width inside a row that
                // wraps is not a width, it is a floor.
                flex: '1 1 200px',
                minWidth: 0,
                maxWidth: 230,
                padding: '5px 8px',
                border: '1px solid var(--line)',
                background: 'var(--bg-2)',
                color: 'var(--ink)',
                fontFamily: 'var(--mono)',
              }}
              placeholder="1000000000000000000… in units of the input token"
            />
          </span>
        }
      />

      <div className="px-[16px] py-[11px] flex flex-wrap items-center gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
        <Bouton onClick={() => demander(false)} actif={Boolean(pool) && !occupe}>
          compare
        </Bouton>
        <Bouton
          onClick={() => demander(true)}
          actif={Boolean(pool) && !occupe}
          titre="reads the live quote and the Permit2 state: up to three billed eth_call"
        >
          compare and build
        </Bouton>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {occupe ?? '« compare » touches no node. « build » reads one, and says so.'}
        </span>
      </div>

      {refus && (
        <Absence
          quoi={refus.genre === 'api_absente' ? 'the substitution API' : refus.genre.replace(/_/g, ' ')}
          etat={refus.genre === 'api_absente' ? undefined : 'refused'}
          panne={refus.genre !== 'api_absente'}
          raison={refus.message}
          cmd={refus.genre === 'api_absente' ? 'cd apps/api && npm start' : undefined}
        />
      )}

      {alt && aff && (
        <>
          <EtatNomme etat={alt.etat} suite={aff.titre} raison={alt.raison} ton={TON[aff.ton]} />

          <L
            k="current door"
            v={
              <>
                {alt.actuelle.poolId.slice(0, 14)}… · hook {alt.actuelle.hook.slice(0, 12) || '—'}… ·{' '}
                {alt.actuelle.bps === null ? <NonLu quoi="measurement at this size" /> : `${alt.actuelle.bps.toFixed(4)} bps`}
              </>
            }
          />
          {alt.proposee && (
            <>
              <L
                k="proposed door"
                v={
                  <>
                    {alt.proposee.poolId.slice(0, 14)}… · hook {alt.proposee.hook.slice(0, 12)}… ·{' '}
                    {alt.proposee.bps === null ? <NonLu quoi="measurement" /> : `${alt.proposee.bps.toFixed(4)} bps`} ·{' '}
                    fee {alt.proposee.poolKey.fee} · tickSpacing {alt.proposee.poolKey.tickSpacing}
                  </>
                }
              />
              <L
                k="measured saving"
                v={
                  <>
                    {alt.economie_bps === null ? <NonLu quoi="gap" /> : `${alt.economie_bps.toFixed(4)} bps`}
                    <span style={{ color: 'var(--ink-2)' }}> · publication threshold {alt.seuil_bps} bps</span>
                  </>
                }
              />
            </>
          )}
          <L
            k="doors examined"
            v={
              alt.examinees.length === 0 ? (
                'none: nothing else makes this swap in the corpus'
              ) : (
                <span className="flex flex-wrap gap-[6px]">
                  {alt.examinees.map((p) => (
                    <Chip key={p.poolId} title={`${p.poolId} · ${p.label ?? 'not measured'}`}>
                      {p.poolId.slice(0, 8)}… {p.bps === null ? 'not measured' : `${p.bps.toFixed(2)} bps`}
                    </Chip>
                  ))}
                </span>
              )
            }
          />
          <L k="corpus block" v={`${alt.block_number} · chain ${alt.chain_id}`} />

          {/* --------------------------------------------------------- the send */}
          {env && (
            <>
              <EtatNomme etat={env.etat} suite={suite} raison={env.raison} />

              {env.monnaieEntree && (
                <L
                  k="currency spent"
                  v={
                    <>
                      {env.monnaieEntree}
                      <span style={{ color: 'var(--ink-2)' }}>
                        {env.native
                          ? ' · native ETH: nothing to authorise, the amount travels in `value`'
                          : ' · ERC-20: Permit2 is required'}
                      </span>
                    </>
                  }
                />
              )}
              {env.amountOutMinimum && (
                <L
                  k="output floor"
                  v={
                    <>
                      {env.amountOutMinimum}
                      <span style={{ color: 'var(--ink-2)' }}>
                        {' '}· live quote {env.cotation} minus {env.toleranceBps} bps
                      </span>
                    </>
                  }
                />
              )}
              {env.deadline && (
                <L
                  k="deadline"
                  v={
                    <>
                      {new Date(Number(env.deadline) * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC
                      <span style={{ color: 'var(--ink-2)' }}> · not the year 2106</span>
                    </>
                  }
                />
              )}
              {env.commandes && (
                <L
                  k="router commands"
                  v={
                    <>
                      {env.commandes}
                      <span style={{ color: 'var(--ink-2)' }}>
                        {env.commandes === '0x0a10' ? ' · the permit BEFORE the swap' : ' · swap alone'}
                      </span>
                    </>
                  }
                />
              )}

              {r.lectures.length > 0 && (
                <div className="px-[16px] py-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
                  <div className="t-label mb-[6px]" style={{ color: 'var(--ink-2)' }}>
                    the {r.appels_rpc} on-chain read(s), each replayable
                  </div>
                  {r.lectures.map((l) => (
                    <div key={l.quoi} className="mb-[6px]">
                      <div className="t-data-xs" style={{ color: l.raison ? 'var(--m-3)' : 'var(--ink-2)' }}>
                        {l.quoi}
                        {l.raison && ` — ${l.raison}`}
                      </div>
                      <Replay cmd={l.rejeu} />
                    </div>
                  ))}
                </div>
              )}

              <div className="px-[16px] py-[11px] flex flex-wrap items-center gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
                {/* The button is ACTIVE only on PRET. On every other state it stays visible
                    and greyed, with the reason next to it: a missing button would make the
                    user think they skipped a step. */}
                <Bouton
                  onClick={envoyer}
                  actif={env.etat === 'PRET' && Boolean(fournisseur) && !occupe}
                  fort
                  titre={
                    env.etat !== 'PRET'
                      ? `unavailable: ${env.etat}`
                      : !fournisseur
                        ? 'no wallet announced'
                        : 'the transaction leaves YOUR wallet, after YOUR signature'
                  }
                >
                  sign and send
                </Bouton>
                {env.etat === 'APPROBATION_REQUISE' && env.permit2?.approbation && (
                  <Bouton onClick={approuver} actif={Boolean(fournisseur) && !occupe}>
                    approve the token to Permit2
                  </Bouton>
                )}
                {env.transaction && (
                  <>
                    <Copy text={env.transaction.data} label="copy the calldata" />
                    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                      to {env.transaction.to.slice(0, 12)}… · value {env.transaction.value}
                    </span>
                  </>
                )}
                {!fournisseur && (
                  <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    no wallet announced: the calldata stays copyable, and checkable
                  </span>
                )}
              </div>

              {envoye && (
                <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                  <div className="t-label" style={{ color: 'var(--ink)' }}>transaction sent</div>
                  <div className="t-data-xs mt-[5px]" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>
                    {envoye}
                  </div>
                  <div className="t-data-xs mt-[6px]" style={{ color: 'var(--ink-2)', maxWidth: '76ch' }}>
                    Sent is not included. This panel will not follow its fate: it has no way to do
                    that honestly without reading the chain in a loop, and a spinner that turns
                    forever would be silence in disguise.
                  </div>
                </div>
              )}
            </>
          )}

          {r.note && (
            <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              {r.note}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
