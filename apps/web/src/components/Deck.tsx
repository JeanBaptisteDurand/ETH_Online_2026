/**
 * LE DECK — la page de vente, et la seule du site qui se pilote au clavier.
 *
 * POURQUOI UNE PAGE À PART, ET PAS UN PDF.
 *
 * Trois des surfaces de TARE ne peuvent pas tourner dans un onglet : le serveur MCP vit dans
 * Claude Desktop, l'extension vit dans le portefeuille de quelqu'un d'autre, et le Ledger est
 * un objet posé sur une table. Un PDF les décrirait ; ce deck les REJOUE — le déroulé est
 * simulé, les valeurs viennent du corpus, et chaque scène le dit au-dessus d'elle-même.
 *
 * CE QUI EST REPRIS D'AILLEURS, ET CE QUI EST CORRIGÉ.
 *
 * Le patron « conteneur de défilement dédié + scroll-snap + mode présentateur » vient d'un deck
 * qu'on a étudié. Deux de ses défauts sont évités ici, parce qu'ils sont réels et vérifiés :
 *   - il écoutait `scroll` sur `window` et appelait `window.scrollTo` alors que l'élément qui
 *     défile est le conteneur : la navigation clavier ne bougeait rien et le compteur restait
 *     figé sur « 01 ». Ici tout passe par `scrollIntoView` sur les sections et par un
 *     `IntersectionObserver`, pas par la position de la fenêtre ;
 *   - sa frappe faisait un `setState` par caractère sur la liste ENTIÈRE des messages : ~550
 *     rendus React pour une réponse. Ici la frappe vit dans le composant de la bulle, et lui
 *     seul se redessine.
 *
 * LA VITESSE DE FRAPPE EST HONNÊTE : 18 ms par caractère. En dessous du plafond du navigateur
 * (~4 ms) une valeur ne veut plus rien dire — elle promet une vitesse que la machine ne tient
 * pas, et elle varie d'un ordinateur à l'autre.
 *
 * `prefers-reduced-motion` : tout se donne d'un coup, dans l'état final. Pas d'écran vide.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Replay } from './Prim'
import { dataset } from '../lib/dataset'
import facts from '../data/facts.json'
import { OUTILS, FAMILLES } from '../lib/outils'
import { DONNEES } from '../lib/donnees'

const nb = (x: number) => x.toLocaleString('fr')
const court = (a: string) => `${a.slice(0, 10)}…${a.slice(-4)}`

const reduit = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ============================================================== les outils communs */

/**
 * LA FRAPPE, isolée dans son propre composant.
 *
 * C'est ce qui évite de redessiner tout un transcript à chaque caractère : seul ce nœud-ci se
 * redessine, et il s'arrête net quand il est démonté. `onFini` sert à rendre la main — sans
 * lui, l'appelant ne saurait pas quand réactiver ses boutons.
 */
function Frappe({ texte, vitesse = 18, onFini }: { texte: string; vitesse?: number; onFini?: () => void }) {
  const [n, setN] = useState(() => (reduit() ? texte.length : 0))
  const fini = useRef(false)

  useEffect(() => {
    setN(reduit() ? texte.length : 0)
    fini.current = false
  }, [texte])

  useEffect(() => {
    if (n >= texte.length) {
      if (!fini.current) {
        fini.current = true
        onFini?.()
      }
      return
    }
    const t = window.setTimeout(() => setN((x) => x + 1), vitesse)
    return () => window.clearTimeout(t)
  }, [n, texte, vitesse, onFini])

  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {texte.slice(0, n)}
      {n < texte.length && <span className="deck-curseur">▌</span>}
    </span>
  )
}

/** Une séquence d'étapes, jouée quand la scène entre à l'écran. */
function useSequence(n: number, delais: number[], actif: boolean): { etape: number; rejouer: () => void } {
  const [etape, setEtape] = useState(() => (reduit() ? n : 0))
  const [tour, setTour] = useState(0)

  useEffect(() => {
    if (!actif || reduit() || etape >= n) return
    const t = window.setTimeout(() => setEtape((e) => e + 1), delais[etape] ?? 700)
    return () => window.clearTimeout(t)
  }, [actif, etape, n, delais, tour])

  return { etape, rejouer: () => { setEtape(0); setTour((t) => t + 1) } }
}


/**
 * NOTRE PROPRE APPLICATION, DANS LA PLANCHE.
 *
 * C'est ce qui manquait, et c'est ce que fait le deck voisin : cinq de ses onze temps sont des
 * `<iframe>` de l'app reelle. La difference avec une capture est enorme — ce qui bouge dans le
 * cadre EST le produit, avec ses vraies donnees, et un juge peut le voir repondre.
 *
 * On peut se le permettre sans reserve : l'instrument est statique et porte son corpus, donc
 * l'iframe ne demande RIEN au reseau. Aucun serveur a tenir pendant la demo.
 */
function Vitre({ route, titre }: { route: string; titre: string }) {
  const base = typeof window === 'undefined' ? '/' : window.location.pathname
  return (
    <div className="deck-vitre">
      <div className="deck-vitre-barre">
        <span className="deck-pastille" style={{ background: 'var(--focus)' }} />
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>the instrument, for real — {route}</span>
        <a className="t-label ml-auto" href={`#${route}`} style={{ color: 'var(--ink-2)' }}>open ↗</a>
      </div>
      <iframe src={`${base}#${route}`} title={titre} loading="lazy" />
    </div>
  )
}

/* ============================================================== 1 · le serveur MCP */

interface Bulle {
  role: 'humain' | 'outil' | 'agent'
  texte: string
  frappe?: boolean
}

/** Les deux questions prêtes à cliquer, et ce que l'outil rend vraiment. */
function useEchanges() {
  return useMemo(() => {
    const rows = dataset.rows.filter((x) => x.label === 'MESURE' && x.bps !== null && x.out_with && x.out_without)
    const pire = [...rows].sort((a, b) => (b.bps ?? 0) - (a.bps ?? 0))[0]
    const nMes = dataset.totals.rows
    const nHooks = dataset.hooks.length
    if (!pire) return []
    return [
      {
        cle: 'outils',
        bouton: 'which tools do you expose?',
        question: 'Which MCP tools does TARE expose, and which of them cost something?',
        appel: null as string | null,
        reponse: [
          'TARE exposes 4 tools, all of them readable offline.',
          '',
          '  • tare_lookup(hook)        everything already measured, labeled',
          '  • tare_impact(hook)        which pools and which tokens are exposed',
          '  • tare_twins(hook)         the hooks with identical bytecode',
          '  • tare_measure(...)        a FRESH measurement — 0.001 USDC in x402',
          '',
          `The first three read ${nb(nMes)} measurements from disk: no request,`,
          'no key. The fourth one needs the fork, and it says so.',
          '',
          'And the rule I cannot get around: I never state a number',
          'that the tool did not return.',
        ].join('\n'),
      },
      {
        cle: 'lookup',
        bouton: `how much does this hook take? ${court(pire.hook)}`,
        question: `How much does this hook really take? ${pire.hook}`,
        appel: `tare_lookup(hook: "${pire.hook}")`,
        reponse: [
          `→ read from docs/dataset/measurements.jsonl (${nb(nMes)} rows, ${nb(nHooks)} hooks)`,
          '',
          `  take          ${pire.bps!.toFixed(4)} bps`,
          `  label         ${pire.label}`,
          `  size          ${pire.amount_in}`,
          `  direction     ${pire.zero_for_one ? '0 → 1' : '1 → 0'}`,
          `  block         ${nb(pire.block_number)}`,
          `  with the hook ${pire.out_with}`,
          `  with the stub ${pire.out_without}`,
          '',
          '✓ measured by counterfactual: the same swap quoted twice, once',
          '  against an inert 89-byte stub at the address of the hook',
          '✓ replayable in one command, it is right below',
        ].join('\n'),
        replay: [
          'python3 apps/api/scripts/measure_one.py --rpc $RPC',
          `--block ${pire.block_number} --hooks ${pire.hook}`,
          `--currency0 ${pire.currency0} --currency1 ${pire.currency1}`,
          `--fee ${pire.key_fee} --tick-spacing ${pire.tick_spacing}`,
          `--zero-for-one ${pire.zero_for_one} --amount-in ${pire.amount_in}`,
        ].join(' '),
      },
    ]
  }, [])
}

function SceneMcp() {
  const echanges = useEchanges()
  const depart: Bulle[] = [
    { role: 'agent', texte: 'MCP server “tare” connected over stdio. Pick a question on the right →' },
  ]
  const [bulles, setBulles] = useState<Bulle[]>(depart)
  const [occupe, setOccupe] = useState(false)
  const [replay, setReplay] = useState<string | null>(null)
  const zone = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (zone.current) zone.current.scrollTop = zone.current.scrollHeight
  }, [bulles])

  const jouer = useCallback(
    async (i: number) => {
      const e = echanges[i]
      if (!e || occupe) return
      setOccupe(true)
      setReplay(null)
      setBulles((b) => [...b, { role: 'humain', texte: e.question }])
      await new Promise((r) => setTimeout(r, reduit() ? 0 : 140))
      if (e.appel) {
        setBulles((b) => [...b, { role: 'outil', texte: e.appel! }])
        await new Promise((r) => setTimeout(r, reduit() ? 0 : 320))
      }
      setBulles((b) => [...b, { role: 'agent', texte: e.reponse, frappe: true }])
      if ('replay' in e && e.replay) setReplay(e.replay as string)
    },
    [echanges, occupe],
  )

  const couleur = { humain: 'var(--ink-2)', outil: 'var(--focus)', agent: 'var(--m-6)' } as const
  const etiquette = { humain: 'user', outil: 'tool call · mcp', agent: 'tare · mcp' } as const

  return (
    <div className="deck-grille deck-grille-12">
      <div className="deck-carte" style={{ padding: 0 }}>
        <div
          className="flex items-center gap-[1cqi] px-[1.4cqi] py-[1cqi]"
          style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}
        >
          <span className="deck-pastille" />
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>claude desktop · mcp · tare</span>
          <button
            type="button"
            className="bouton-ghost ml-auto t-label"
            style={{ cursor: 'pointer' }}
            onClick={() => { setBulles(depart); setReplay(null); setOccupe(false) }}
          >
            ↻ start over
          </button>
        </div>
        <div ref={zone} className="deck-mcp-zone" style={{ padding: '1.4cqi' }}>
          {bulles.map((b, i) => (
            <div key={i} className="flex flex-col gap-[0.5cqi]" style={{ animation: 'deck-entre 240ms ease-out both' }}>
              <span className="t-label" style={{ color: couleur[b.role] }}>{etiquette[b.role]}</span>
              <div className="deck-bulle" data-role={b.role}>
                {b.frappe ? <Frappe texte={b.texte} onFini={() => setOccupe(false)} /> : b.texte}
              </div>
            </div>
          ))}
          {occupe && (
            <div className="flex items-center gap-[0.8cqi]">
              <span className="deck-pastille" />
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>tare is answering…</span>
            </div>
          )}
        </div>
      </div>

      <div className="deck-carte">
        <div className="deck-carte-titre">questions ready — click one</div>
        {echanges.map((e, i) => (
          <button key={e.cle} type="button" disabled={occupe} onClick={() => void jouer(i)} className="deck-prompt">
            ▶ {e.bouton}
          </button>
        ))}
        <div className="deck-carte-titre" style={{ marginTop: '0.6cqi' }}>4 tools · 3 free · 1 paid</div>
        {[
          ['tare_lookup', 'free'],
          ['tare_impact', 'free'],
          ['tare_twins', 'free'],
          ['tare_measure', '0.001 USDC'],
        ].map(([o, p]) => (
          <div key={o} className="flex items-baseline gap-[0.8cqi]">
            <code style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{o}</code>
            <span className="t-label ml-auto" style={{ color: p === 'free' ? 'var(--ink-2)' : 'var(--m-4)' }}>{p}</span>
          </div>
        ))}
        <div className="deck-prose" style={{ marginTop: 'auto' }}>
          The server does not run in this tab: it lives next to the model. The sequence is a
          <strong style={{ color: 'var(--m-5)' }}> replay</strong>; the values come from the corpus.
        </div>
        {replay && <Replay cmd={replay} />}
      </div>
    </div>
  )
}

/* ======================================================= 2 · l'extension */

function SceneExtension({ actif }: { actif: boolean }) {
  const [issue, setIssue] = useState<'alternative' | 'unique'>('alternative')
  const chere = issue === 'alternative'
  const etapes = [
    'an exchange site prepares the transaction and calls the wallet',
    'the guard intercepts it BEFORE the signature and reads the PoolKey back from the Universal Router calldata',
    'it queries its embedded table — no request, the service worker carries it',
    chere
      ? 'this hook takes, and a cheaper door exists on the same pair'
      : 'this hook takes, and no other measured door exists on this pair',
  ]
  const { etape, rejouer } = useSequence(etapes.length, [700, 900, 800, 900], actif)
  const g = facts.garde as Record<string, unknown> | undefined

  return (
    <div className="deck-grille deck-grille-12">
      <div className="deck-carte">
        <div className="flex flex-wrap items-center gap-[0.8cqi]">
          <span className="deck-carte-titre">what it does, step by step</span>
          <span className="ml-auto flex gap-[0.6cqi]">
            {(['alternative', 'unique'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setIssue(k); rejouer() }}
                className="t-label deck-onglet"
                aria-pressed={issue === k}
              >
                {k === 'alternative' ? 'there is better' : 'there is only one door'}
              </button>
            ))}
          </span>
        </div>
        {etapes.map((t, i) => (
          <div key={i} className="deck-etape" style={{ opacity: i < etape ? 1 : 0.2 }}>
            <span
              className="t-label"
              style={{ color: i === 3 ? (chere ? 'var(--m-4)' : 'var(--m-5)') : 'var(--ink-2)', minWidth: '1.6cqi' }}
            >
              {i + 1}
            </span>
            <span className="deck-prose" style={{ color: i === 3 ? 'var(--ink)' : 'var(--ink-2)' }}>{t}</span>
          </div>
        ))}
        {g && (
          <div className="deck-prose" style={{ marginTop: 'auto' }}>
            decoded on {String(g['transactions_reelles'] ?? '—')} real Base transactions ·
            12 kB of script · the table lives in the service worker, so it answers{' '}
            <strong style={{ color: 'var(--ink)' }}>even with our server off</strong>.
          </div>
        )}
      </div>

      <div
        className="deck-verdict"
        data-issue={chere ? 'alternative' : 'unique'}
        style={{
          opacity: etape >= etapes.length ? 1 : 0,
          transform: etape >= etapes.length ? 'none' : 'translateY(0.6cqi)',
        }}
      >
        <div className="t-label" style={{ color: chere ? 'var(--m-4)' : 'var(--m-5)' }}>
          {chere ? 'a cheaper door exists' : 'there is only one door'}
        </div>
        <div className="deck-prose" style={{ color: 'var(--ink)' }}>
          {chere ? (
            <>
              The same swap goes through another pool. The replacement transaction is{' '}
              <strong>built and signed through Permit2</strong> — an off-chain signature instead of
              an approval transaction — and <strong>it is never sent by us</strong>.
            </>
          ) : (
            <>
              On <strong>99.71%</strong> of the corpus rows, the answer is “there is only one
              door”. So the extension proposes nothing: it displays what the hook takes and asks
              for a confirmation. <strong>Inventing an alternative would be worse than staying silent.</strong>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-[0.7cqi]">
          {(chere ? ['READY — substitute', 'sign as is', 'cancel'] : ['confirm knowingly', 'cancel']).map(
            (b, i) => (
              <span key={b} className="t-label deck-bouton" data-fort={i === 0 ? 'oui' : undefined}>{b}</span>
            ),
          )}
        </div>
        {chere && (
          <div className="t-label" style={{ color: 'var(--ink-2)', marginTop: 'auto' }}>
            command list <code style={{ fontFamily: 'var(--mono)' }}>0x0a10</code> — PERMIT2_PERMIT
            then V4_SWAP, in that order
          </div>
        )}
      </div>
    </div>
  )
}

/* ========================================================= 3 · Speculos */

function SceneLedger({ actif }: { actif: boolean }) {
  const l = facts.ledger as Record<string, unknown> | undefined
  const ecrans: [string, string][] = [
    ['Review', 'TareGuardApproval'],
    ['verdict', 'MEASURED TAKE'],
    ['hook', '0xb429d62f…ba28cc'],
    ['pool', '0x010d0023…6c538'],
    ['take', '9 999.53 bps'],
    ['size', '1 000 000 000 000'],
    ['block', '50 614 000'],
    ['Approve ?', 'Approve / Reject'],
  ]
  const { etape, rejouer } = useSequence(ecrans.length, ecrans.map(() => 520), actif)

  return (
    <div className="deck-grille deck-grille-12">
      <div className="deck-ecrans" style={{ gridColumn: '1 / -1', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {ecrans.map(([k, v], i) => (
          <div
            key={k}
            className="deck-ecran"
            style={{
              opacity: i < etape ? 1 : 0.1,
              transform: i < etape ? 'none' : 'translateY(0.5cqi)',
              borderColor: i === ecrans.length - 1 && i < etape ? 'var(--m-4)' : 'var(--line)',
            }}
          >
            <span className="t-label" style={{ color: 'var(--ink-2)' }}>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="deck-prose" style={{ gridColumn: '1 / -1', marginTop: '-0.6cqi' }}>
        The report is encoded as <strong style={{ color: 'var(--ink)' }}>EIP-712</strong> and
        rendered <strong style={{ color: 'var(--ink)' }}>field by field</strong>: you do not sign an
        opaque hash, you read what you sign. A cancellation returns code{' '}
        <strong style={{ color: 'var(--ink)' }}>4001</strong>, and no call goes out.
        {l ? ` ${String(l['ecrans'] ?? '—')} screens rendered, type ${String(l['type_712'] ?? '—')}.` : ''}
        {' '}The sequence is a <strong style={{ color: 'var(--m-5)' }}>replay</strong>; the screens
        are the ones Speculos rendered, and the repository publishes their trace.{' '}
        <button type="button" onClick={rejouer} className="bouton-ghost t-label" style={{ cursor: 'pointer' }}>
          replay
        </button>
      </div>
    </div>
  )
}

/* ============================================================ les beats */

interface Beat {
  id: string
  marqueur: string
  titre: string
  sous?: string
  rendu: (actif: boolean) => React.ReactNode
}

/**
 * UN CHIFFRE QUI REMPLIT SA CASE.
 *
 * C'est l'objet de base d'une planche : le nombre est enorme parce que c'est LUI le message,
 * et les deux lignes en dessous disent ce qu'il compte et d'ou il sort. Un deck ou le chiffre
 * a la meme taille que la legende ne dit rien de loin — et un jury regarde de loin.
 */
function Chiffre({
  v,
  k,
  source,
  accent,
}: {
  v: string
  k: string
  source?: string
  accent?: 'jaune' | 'orange' | 'bleu'
}) {
  return (
    <div className="deck-stat" data-accent={accent ?? 'jaune'} data-long={v.length > 6 ? 'oui' : undefined}>
      <b>{v}</b>
      <span>{k}</span>
      {source && <i>{source}</i>}
    </div>
  )
}

export function DeckPage({ surOutil }: { surOutil?: (n: number) => void }) {
  const t = dataset.totals
  const conteneur = useRef<HTMLDivElement | null>(null)
  const [actif, setActif] = useState(0)

  const ex = facts.execution as Record<string, unknown> | undefined
  const reg = facts.registre as { epingle?: Record<string, unknown> } | undefined

  const beats: Beat[] = useMemo(
    () => [
      {
        id: 'probleme',
        marqueur: '01 · the problem',
        titre: 'A Uniswap v4 hook can take from your swap. Nobody publishes how much.',
        sous: 'Neither the official registry, nor the hooks themselves.',
        rendu: () => (
          <>
            <div className="deck-grille deck-grille-3">
              <Chiffre
                v="9 / 1 559"
                k="hooks that declare what they take"
                source="docs/dataset/declarations.json · 200 000 Base blocks"
                accent="orange"
              />
              <Chiffre
                v="0"
                k="quantitative field in the official registry, out of 27"
                source="its schema forbids adding one"
              />
              <Chiffre
                v={reg?.epingle ? `${String(reg.epingle['absents'])} / 112` : '—'}
                k="measured hooks that the registry does not know"
                source="docs/dataset/registre-couverture.json"
                accent="bleu"
              />
            </div>
          </>
        ),
      },
      {
        id: 'methode',
        marqueur: '02 · the method',
        titre: 'You cannot take the hook out of a pool. So we change its code.',
        sous: 'The key of a v4 pool contains the hook address: “the same pool without its hook” does not exist.',
        rendu: () => (
          <div className="deck-grille deck-grille-12">
            <div className="deck-carte">
              <div className="deck-carte-titre">the counterfactual, in four moves</div>
              {[
                'we pin a fork at block 50 614 000',
                'we quote the swap, hook in place',
                'anvil_setCode replaces the hook bytecode with 89 inert bytes',
                'we quote the SAME swap against the stub — the gap is the take',
              ].map((l, i) => (
                <div key={l} className="deck-etape" style={{ opacity: 1 }}>
                  <span className="t-label" style={{ color: 'var(--m-6)', minWidth: '1.6cqi' }}>{i + 1}</span>
                  <span className="deck-prose">{l}</span>
                </div>
              ))}
              <div className="deck-prose" style={{ marginTop: 'auto', color: 'var(--ink)' }}>
                The <code>poolId</code>, the liquidity, <code>slot0</code> and the reserves stay
                identical down to the bit. The only thing that changes is the code that runs
                during the swap.
              </div>
            </div>
            <div className="deck-grille deck-grille-2" style={{ margin: 0, gridTemplateRows: 'auto 1fr' }}>
              <Chiffre v={nb(t.rows)} k="published measurements" />
              <Chiffre v="89" k="bytes of inert stub" accent="orange" />
              <div style={{ gridColumn: '1 / -1', minHeight: 0 }}>
                <Vitre route="/outil/1" titre="the page of the Measure tool, for real" />
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'preuve',
        marqueur: '03 · the proof',
        titre: 'And when we actually execute it, the quote holds to the wei.',
        sous: 'Gate A4: a swap really sent, put back against what the quote announced.',
        rendu: () => (
          <div className="deck-grille deck-grille-12">
            <div className="deck-grille deck-grille-2" style={{ margin: 0 }}>
              <Chiffre
                v={ex ? `${Number(ex['bps_executes']).toFixed(2)}` : '—'}
                k="bps actually executed"
                accent="orange"
              />
              <Chiffre
                v={ex ? `${Number(ex['bps_publies']).toFixed(2)}` : '—'}
                k="bps announced by the quote"
              />
            </div>
            <div className="deck-carte">
              <div className="deck-carte-titre">the objection, and the answer</div>
              <div className="deck-prose">
                “A quote on a fork, what is that worth?” So we <strong style={{ color: 'var(--ink)' }}>executed
                the swap</strong> and put the result back against what the quote announced.{' '}
                <strong style={{ color: 'var(--ink)' }}>To the wei.</strong>
              </div>
              <div className="deck-prose">
                And we also publish the pool where it does <strong style={{ color: 'var(--ink)' }}>not</strong>{' '}
                agree — one in three.
              </div>
              <div className="deck-prose" style={{ marginTop: 'auto' }}>
                The complete chain runs end to end: <strong style={{ color: 'var(--ink)' }}>6 steps
                out of 6, in 13.7 seconds</strong> — real transaction, verdict, door search,
                measurement paid in x402, HCS anchoring, signature on the device.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'mcp',
        marqueur: '04 · for agents',
        titre: 'A model asked “how much does this hook take?” invents a plausible number.',
        sous: 'The four MCP tools carry, in their own descriptions, the ban on stating one.',
        rendu: () => <SceneMcp />,
      },
      {
        id: 'extension',
        marqueur: '05 · at the right moment',
        titre: 'The right moment is not while you search. It is three seconds before signing.',
        sous: 'The extension sits between the exchange site and the wallet.',
        rendu: (a: boolean) => <SceneExtension actif={a} />,
      },
      {
        id: 'ledger',
        marqueur: '06 · you read what you sign',
        titre: 'The verdict is rendered field by field on the device.',
        sous: 'EIP-712, eight screens, and canceling lets nothing go out.',
        rendu: (a: boolean) => <SceneLedger actif={a} />,
      },
      {
        id: 'honnetete',
        marqueur: '07 · what we do not know',
        titre: 'Out of 125 072 measurements, 61 916 are not values. We keep them anyway.',
        sous: 'A read that fails is NON_MESURABLE — never a zero, never a blank.',
        rendu: () => (
          <div className="deck-grille deck-grille-12">
            <div className="deck-grille deck-grille-2" style={{ margin: 0 }}>
              <Chiffre v="63 156" k="MESURE — actual values" />
              <Chiffre v="61 466" k="NON_COTABLE" accent="orange" />
              <Chiffre v="450" k="NON_MESURABLE" accent="orange" />
              <Chiffre v="0" k="INTERPOLE — the label exists and is unused" accent="bleu" />
            </div>
            <div className="deck-carte">
              <div className="deck-carte-titre">why we keep them</div>
              <div className="deck-prose">
                A blank reads as “nothing”, and “nothing” reads as “zero”. So every row we could
                not measure keeps <strong style={{ color: 'var(--ink)' }}>its reason</strong>.
              </div>
              <div className="deck-prose">
                <strong style={{ color: 'var(--ink)' }}>16 attestations written on-chain out of 99
                computed.</strong> That gap is what we publish, not the flattering number.
              </div>
              <div className="deck-prose" style={{ marginTop: 'auto' }}>
                Two past mistakes of this project are published along with their fix. That is what
                makes the rest believable.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'surfaces',
        marqueur: '08 · try it',
        titre: 'Five ways in. The corpus itself sits whole inside the page.',
        rendu: () => (
          <div className="deck-grille deck-grille-12">
            <div className="deck-grille deck-grille-3" style={{ margin: 0 }}>
              <Chiffre v={String(OUTILS.length)} k="named tools" />
              <Chiffre v={String(DONNEES.length)} k="published datasets" accent="bleu" />
              <Chiffre v="5" k="ways in" accent="orange" />
            </div>
            <div style={{ minHeight: 0 }}>
              <Vitre route="/" titre="the operation: paste a token, read where to buy it" />
            </div>
            <div className="deck-carte">
              <div className="deck-carte-titre">the fourteen tools</div>
              <div className="flex flex-wrap gap-[0.7cqi]" style={{ overflowY: 'auto', minHeight: 0 }}>
                {OUTILS.map((o) => (
                  <button
                    key={o.n}
                    type="button"
                    onClick={() => surOutil?.(o.n)}
                    className="t-label deck-puce"
                    style={{ color: FAMILLES[o.famille].couleur }}
                    title={o.question}
                  >
                    {o.n}. {o.nom}
                  </button>
                ))}
              </div>
              <div className="deck-prose" style={{ marginTop: 'auto' }}>
                The site, the extension, the MCP server, the x402 toll on Hedera, the account.
                Everything is published — the corpus, the replay commands, and what we do not know.
              </div>
              <div className="flex flex-wrap items-center gap-[1.2cqi]">
                <Copy text="https://github.com/JeanBaptisteDurand/ETH_Online_2026" label="copy the repository" />
                <a className="deck-prose" href="#/" style={{ color: 'var(--ink)' }}>open the instrument →</a>
              </div>
            </div>
          </div>
        ),
      },
    ],
    [t, reg, ex, surOutil],
  )

  /* LE MODE PRÉSENTATEUR : `?presenter=1`. Il n'existe pas autrement. */
  const presentateur =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('presenter')
  const [restant, setRestant] = useState(240)
  const [court_, setCourt] = useState(false)

  useEffect(() => {
    if (!presentateur || !court_) return
    const i = window.setInterval(() => setRestant((r) => Math.max(0, r - 1)), 1000)
    return () => window.clearInterval(i)
  }, [presentateur, court_])

  /* Qui est à l'écran : l'observateur, pas la position de la fenêtre. */
  useEffect(() => {
    const el = conteneur.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const o = new IntersectionObserver(
      (entrees) => {
        const vu = entrees.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (vu) setActif(Number((vu.target as HTMLElement).dataset['beat'] ?? 0))
      },
      { root: el, threshold: [0.35, 0.6] },
    )
    el.querySelectorAll('[data-beat]').forEach((s) => o.observe(s))
    return () => o.disconnect()
  }, [beats.length])

  const aller = useCallback(
    (i: number) => {
      const el = conteneur.current?.querySelector<HTMLElement>(`[data-beat="${Math.max(0, Math.min(beats.length - 1, i))}"]`)
      el?.scrollIntoView({ behavior: reduit() ? 'auto' : 'smooth', block: 'start' })
    },
    [beats.length],
  )

  useEffect(() => {
    const sur = (e: KeyboardEvent) => {
      const c = e.target as HTMLElement | null
      if (c && /^(INPUT|TEXTAREA)$/.test(c.tagName)) return
      if ([' ', 'ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)) {
        e.preventDefault()
        setCourt(true)
        aller(actif + 1)
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        aller(actif - 1)
      } else if (e.key === 'r') {
        setRestant(240)
      } else if (e.key === 'f') {
        void document.documentElement.requestFullscreen?.().catch(() => undefined)
      }
    }
    window.addEventListener('keydown', sur)
    return () => window.removeEventListener('keydown', sur)
  }, [actif, aller])

  const mm = String(Math.floor(restant / 60)).padStart(2, '0')
  const ss = String(restant % 60).padStart(2, '0')

  return (
    <div className="deck" ref={conteneur}>
      {beats.map((b, i) => (
        <section key={b.id} data-beat={i} id={`deck-${b.id}`} className="deck-beat" aria-label={b.titre}>
          <div className="deck-cadre">
            <header className="deck-tete">
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>TARE · ETHOnline 2026</span>
              <span className="t-label ml-auto" style={{ color: 'var(--m-5)' }}>{b.marqueur}</span>
            </header>

            <div className="deck-corps">
              <div className="deck-eyebrow">{b.marqueur.replace(/^\d+ · /, '')}</div>
              <h2 className="deck-titre">{b.titre}</h2>
              {b.sous && <p className="deck-sous">{b.sous}</p>}
              {b.rendu(actif === i)}
            </div>

            <footer className="deck-pied">
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                measured on Base, block 50 614 000 — every number replays in one command
              </span>
              <span className="t-label ml-auto" style={{ color: 'var(--ink-2)' }}>
                {String(i + 1).padStart(2, '0')} / {String(beats.length).padStart(2, '0')}
              </span>
            </footer>
          </div>
        </section>
      ))}

      {presentateur && (
        <>
          <div className="deck-hud deck-hud-gauche">
            <span className="t-label" style={{ color: 'var(--ink)' }}>
              {String(actif + 1).padStart(2, '0')} / {String(beats.length).padStart(2, '0')}
            </span>
            <span className="t-label" style={{ color: 'var(--ink-2)' }}>{beats[actif]?.marqueur}</span>
            <span className="deck-tirets">
              {beats.map((b, i) => (
                <i key={b.id} data-etat={i < actif ? 'passe' : i === actif ? 'courant' : 'a-venir'} />
              ))}
            </span>
            <span className="t-label" style={{ color: 'var(--ink-2)' }}>space · ← → · f · r</span>
          </div>
          <div className="deck-hud deck-hud-droite" data-fini={restant === 0 ? 'oui' : undefined}>
            {court_ && <span className="deck-pastille" />}
            <span className="t-data-sm" style={{ fontFamily: 'var(--mono)', color: restant === 0 ? 'var(--m-4)' : 'var(--ink)' }}>
              {mm}:{ss}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
