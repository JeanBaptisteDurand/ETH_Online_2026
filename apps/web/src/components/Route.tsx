import { useEffect, useMemo, useRef, useState } from 'react'
import { dataset } from '../lib/dataset'
import { fmtBps, groupDigits, powerOfTen, shortAddr } from '../lib/format'
import { rampCell } from '../lib/ramp'
import {
  ADDRESS_RE,
  candidatePairs,
  doorsOf,
  isNativeCurrency,
  num,
  partitionAnswer,
  presentationOf,
  probeOf,
  rankBadges,
  readAnswer,
  routePath,
  sizesOf,
  str,
  tokensByFrequency,
  type PresentedAside,
  type PresentedGate,
  type Presentation,
  type Probe,
  type RouteAnswer,
} from '../lib/route'
import { Chip, Copy, Panel, Replay, Absence } from './Prim'
import { API_BASE, getJson, type Fetched } from './GraphApi'

/**
 * PAR QUELLE PORTE PASSER — la surface de GET /route.
 *
 * La question a l'air d'etre du routage. Elle n'en est pas. Au recensement du bloc epingle,
 * l'ecrasante majorite des paires n'a QU'UN pool v4 : il n'y a pas de moins cher a trouver,
 * il y a un peage a connaitre. Cet ecran doit donc rendre visibles deux choses opposees et
 * ne jamais faire passer l'une pour l'autre :
 *
 *   - plusieurs portes  -> un classement par cout total MESURE croissant ;
 *   - une seule porte   -> pas de classement du tout. Un classement a un element ferait
 *                          croire a un choix qui n'existe pas.
 *
 * Ce que ce fichier ne fait PAS : additionner des bps. Le cout total vient de /route, avec
 * sa formule qui NOMME la mesure (total_bps_formula) et sa commande de rejeu. L'ecran lit,
 * range et met en scene ; il ne recalcule rien. Le rangement lui-meme est dans
 * ../lib/route.ts, en fonctions pures, parce qu'il doit etre testable sans navigateur —
 * voir src/lib/route.test.ts.
 *
 * Les etats « pas de nombre a montrer » suivent la regle des encarts de graphe : quand
 * l'API ne repond pas, on dit ce qui manque et on donne la commande. Jamais un zero.
 */

/** Comment relancer l'API quand elle ne repond pas. Aucun nombre ne depend de cette ligne. */
const API_CMD = 'cd apps/api && npm run dev'
/** Combien de jetons la completion propose. Au-dela, on construit du DOM que personne ne lit. */
const PROPOSES_MAX = 200

/**
 * Combien de paires l'ecran sonde TOUT SEUL au chargement.
 *
 * C'est un budget, pas une mesure : aucun chiffre affiche n'en depend, il ne decide que du
 * nombre de questions posees avant que l'utilisateur en demande d'autres. Il est ecrit ici,
 * en clair, plutot que cache dans la boucle.
 *
 * Pourquoi le borner : les balayages ecrivent en continu dans docs/dataset/measurements.jsonl,
 * le cache de /route s'invalide a chaque ecriture, et l'appel suivant relit alors tout le
 * corpus. Le cout de cette relecture depend de la taille du corpus et de la charge de la
 * machine : mesure entre 0,5 et 13 s selon le moment. Une version anterieure de ce
 * commentaire figeait 13 423 ms et en deduisait « dix minutes pour 45 candidats » ; relance,
 * la meme commande rend 500 a 850 ms, et la deduction etait fausse d'un facteur vingt.
 *
 * On ne fige donc plus de chiffre : on donne la commande, et le lecteur mesure chez lui.
 *   cd apps/api && npx tsx -e "import {loadPairIndex} from './src/route.ts'; \
 *     const t=Date.now(); loadPairIndex(true); console.log(Date.now()-t)"
 *
 * Le plafond reste bas pour une raison qui, elle, ne depend d'aucune mesure : au chargement
 * on ne sait pas ce que le lecteur cherche, et sonder tout le corpus pour lui presenter une
 * liste qu'il n'a pas demandee est un mauvais echange. Le bouton leve le plafond.
 */
const AUTO_PROBES = 6

/** Combien de paires a porte unique on montre en exemple. Le total est affiche a cote. */
const SINGLE_SHOWN = 4

/** Le corpus embarque ne porte pas de symboles de jetons : on affiche des adresses. */
function TokenName({ address }: { address: string }) {
  return (
    <span className="hex" style={{ color: 'var(--ink)' }} title={address}>
      {shortAddr(address, 10, 6)}
      {isNativeCurrency(address) && (
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {' '}
          native
        </span>
      )}
    </span>
  )
}


/**
 * UN CHEMIN, RENDU RELATIF AU DEPOT.
 *
 * L'API rend le chemin ABSOLU du fichier qu'elle a lu. Deux consequences, et la seconde est
 * la pire : ca deborde de l'ecran, et surtout ca PUBLIE l'arborescence du disque de celui qui
 * fait tourner l'API — `/Users/<prenom>/Documents/...` sur une capture, une video, une demo.
 * Le fait utile est le fichier LU, pas l'endroit ou il se trouve sur une machine.
 */
export function cheminCourt(chemin: string | null | undefined): string {
  if (!chemin) return '—'
  const m = chemin.match(/(?:^|\/)(docs|engine|apps|packages|contracts)\/.*$/)
  return m ? m[0].replace(/^\//, '') : chemin.split('/').slice(-2).join('/')
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="t-data-xs m-0"
      style={{
        color: 'var(--ink-2)',
        maxWidth: '110ch',
        fontFamily: 'var(--mono)',
        // Un chemin de fichier est un mot INSECABLE. Sans ceci, il pousse la page entiere
        // au-dela de l'ecran : l'instrument defilait de cote a 390 px pour cette seule raison.
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </p>
  )
}

/** Une taille en wei, dite exactement : 1e18 quand c'est une puissance de dix, sinon groupee. */
function sizeText(wei: string | null): string {
  if (wei === null) return 'no size requested'
  return powerOfTen(wei) ?? groupDigits(wei)
}

/* --------------------------------------------------------------------- le formulaire */

type Form = {
  currency0: string
  currency1: string
  amount: string
  zeroForOne: 'true' | 'false'
}

function Selector({
  label,
  value,
  onChange,
  listId,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  listId: string
}) {
  const ok = ADDRESS_RE.test(value.trim())
  return (
    <label className="flex flex-col gap-[3px]">
      <span className="t-label" style={{ color: 'var(--ink-2)' }}>
        {label}
      </span>
      <input
        className="t-data hex px-[8px] py-[5px]"
        style={{
          background: 'var(--bg-2)',
          border: `1px solid ${ok ? 'var(--line-strong)' : 'var(--m-4)'}`,
          color: 'var(--ink)',
          // idem : `minWidth: 340` faisait deborder la page a 400 px. Le champ doit pouvoir
          // se retrecir ; c'est `flex-basis` qui porte la largeur souhaitee, pas un plancher.
          flex: '1 1 300px',
          minWidth: 0,
          maxWidth: 340,
        }}
        list={listId}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      {!ok && (
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          invalid address — 0x followed by 40 hex characters
        </span>
      )}
    </label>
  )
}

/* ------------------------------------------------------------------- les portes */

/** L'avertissement de taille, LA OU LE NOMBRE EST AFFICHE, jamais en note de bas de page. */
function SizeWarning({ gate }: { gate: PresentedGate }) {
  const s = gate.size
  if (!s || s.exact_match) return null
  return (
    <div className="t-data-xs mt-[4px]" style={{ color: 'var(--ink)' }}>
      <Chip title={s.note ?? undefined}>size not measured</Chip>{' '}
      {s.requested_wei === null
        ? 'no size requested: this cost is the HIGHEST one measured, across all sizes'
        : `requested ${sizeText(s.requested_wei)} — this cost is read at ${sizeText(s.used_wei)}`}
    </div>
  )
}

function GateRow({ gate, rank }: { gate: PresentedGate; rank: string | null }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-stretch gap-[12px] p-[12px]">
        <div className="flex flex-col justify-center" style={{ minWidth: 54 }}>
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            {rank === null ? 'door' : 'rank'}
          </span>
          <span className="t-title" style={{ color: rank === null ? 'var(--ink-2)' : 'var(--ink)' }}>
            {rank ?? '—'}
          </span>
        </div>

        <div className="px-[12px] py-[8px]" style={{ ...rampCell(gate.total_bps), minWidth: 250 }}>
          <div className="t-title-lg" style={{ color: 'var(--ink)' }}>
            {fmtBps(gate.total_bps)} <span className="t-data-sm">bps</span>
          </div>
          <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            measured total cost = LP fees {fmtBps(gate.lp_fee_bps)} + hook {fmtBps(gate.hook_bps)}
          </div>
          <SizeWarning gate={gate} />
        </div>

        <div className="flex flex-col gap-[3px] flex-1" style={{ minWidth: 320 }}>
          <div className="flex flex-wrap items-center gap-[8px]">
            {gate.label && <Chip>{gate.label}</Chip>}
            <span className="t-data-sm hex" style={{ color: 'var(--ink-2)' }}>
              hook {gate.hook ? shortAddr(gate.hook, 12, 6) : '—'}
            </span>
            <span className="t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
              pool {gate.pool_id ? shortAddr(gate.pool_id, 10, 6) : '—'}
            </span>
            {gate.block_number !== null && (
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                block {groupDigits(String(gate.block_number))}
              </span>
            )}
          </div>
          {gate.formula && (
            <div className="t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
              {gate.formula}
            </div>
          )}
          {gate.lp_divergent && (
            <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {gate.lp_divergent}
            </div>
          )}
          <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            {Object.entries(gate.labels_in_direction)
              .map(([k, v]) => `${k}=${v}`)
              .join(' · ') || 'no label returned'}
            {gate.cost_basis ? ` · cost basis: ${gate.cost_basis}` : ''}
          </div>
        </div>
      </div>
      {gate.replay ? (
        <div className="px-[12px] pb-[12px]">
          <Replay
            cmd={gate.replay}
            note={`This command replays THE measurement that carries the number above${
              gate.measurement_id ? ` (${gate.measurement_id})` : ''
            }. The fork must be running: docker compose up -d anvil.`}
          />
        </div>
      ) : (
        <div className="px-[12px] pb-[12px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
          the response carries no replay command for this door: the number stays verifiable
          through its measurement id, not through a command the screen would
          invent.
        </div>
      )}
    </div>
  )
}

/** Le tas hors classement. Une porte y est LISTEE, jamais chiffree en cout comparable. */
function AsideRow({ gate }: { gate: PresentedAside }) {
  const labels = Object.entries(gate.labels_in_direction)
  return (
    <div className="p-[12px] flex flex-col gap-[5px]" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-center gap-[8px]">
        <Chip>{gate.why ?? 'unranked'}</Chip>
        <span className="t-data-sm hex" style={{ color: 'var(--ink-2)' }}>
          hook {gate.hook ? shortAddr(gate.hook, 12, 6) : '—'}
        </span>
        <span className="t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
          pool {gate.pool_id ? shortAddr(gate.pool_id, 10, 6) : '—'}
        </span>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {labels.length ? labels.map(([k, v]) => `${k}=${v}`).join(' · ') : 'no label'}
        </span>
      </div>
      <div className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '110ch' }}>
        {gate.why_fr ?? 'no reason returned by the API.'}
      </div>
      {gate.hook_bps !== null && (
        <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
          hook take alone:{' '}
          <span style={{ color: 'var(--ink)' }}>{fmtBps(gate.hook_bps)} bps</span> — this is not a
          total cost, the LP fees are missing: this door stays unranked.
        </div>
      )}
      {gate.nearest && (
        <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          at ANOTHER size ({sizeText(gate.nearest.amount_in)}): total{' '}
          <span style={{ color: 'var(--ink-2)' }}>{fmtBps(gate.nearest.total_bps)} bps</span> ·{' '}
          {gate.nearest.label ?? '—'} · {gate.nearest.measurement_id ?? '—'}. {gate.nearest.note}
        </div>
      )}
      {(gate.replay_at_requested_size || gate.replay || gate.nearest?.replay) && (
        <div className="flex items-center gap-[8px] flex-wrap">
          <code
            className="t-data-xs hex overflow-x-auto"
            style={{ color: 'var(--ink-2)', maxWidth: '90ch', whiteSpace: 'nowrap' }}
          >
            {gate.replay_at_requested_size ?? gate.replay ?? gate.nearest?.replay}
          </code>
          <Copy text={(gate.replay_at_requested_size ?? gate.replay ?? gate.nearest?.replay)!} />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ les verdicts */

function Verdict({
  answer,
  pres,
  demoted,
}: {
  answer: RouteAnswer
  pres: Presentation
  demoted: number
}) {
  const alt = answer.alternatives
  return (
    <div
      className="flex flex-col gap-[8px] px-[16px] py-[12px]"
      style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line-strong)' }}
    >
      <div className="flex flex-wrap items-baseline gap-[10px]">
        <Chip>{answer.verdict ?? 'verdict missing'}</Chip>
        <span className="t-title" style={{ color: 'var(--ink)' }}>
          {pres.title}
        </span>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {pres.doors === null
            ? 'number of doors unknown'
            : `${pres.doors} door${pres.doors > 1 ? 's' : ''} · source: ${pres.doorsSource}`}
        </span>
      </div>

      {answer.headline && (
        <p
          className="m-0"
          style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '90ch', color: 'var(--ink)' }}
        >
          {answer.headline}
        </p>
      )}

      {pres.mode === 'PEAGE' && (
        <p
          className="m-0"
          style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '90ch', color: 'var(--ink-2)' }}
        >
          {pres.tollSupported ? (
            <>
              There is nothing to rank: <strong style={{ color: 'var(--ink)' }}>only one
              door exists</strong>. What is taken here is not a competitive price, it is a toll
              on the only road — the hook cannot be avoided.
            </>
          ) : (
            <>
              Only one door is <strong style={{ color: 'var(--ink)' }}>measured</strong>, but the
              census does not allow us to state that no others exist. We do not replace that
              uncertainty with the strong sentence.
            </>
          )}
        </p>
      )}

      {alt.sentence && (
        <Note>
          alternatives · <span style={{ color: 'var(--ink-2)' }}>{alt.claim}</span> — {alt.sentence}
        </Note>
      )}
      {alt.caveat && <Note>caveat · {alt.caveat}</Note>}
      {alt.pools_in_census_note && <Note>{alt.pools_in_census_note}</Note>}
      {demoted > 0 && (
        <Note>
          <span style={{ color: 'var(--ink)' }}>
            {demoted} door(s) ranked by the API without a readable total cost were taken out of
            the ranking by this screen.
          </span>{' '}
          They are listed as unranked, never at zero.
        </Note>
      )}
    </div>
  )
}

/** La phrase de structure : l'argument le plus fort du projet, et il est derive, pas ecrit. */
function StructureBar({ answer }: { answer: RouteAnswer }) {
  const s = answer.structure
  if (!s)
    return (
      <div className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
        <Note>{answer.structure_note ?? 'census unavailable: no structural sentence.'}</Note>
      </div>
    )
  return (
    <div
      className="px-[16px] py-[12px] flex flex-col gap-[6px]"
      style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}
    >
      <div className="flex flex-wrap items-baseline gap-x-[24px] gap-y-[4px]">
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>
          market structure, derived from the census
        </span>
        <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
          {s.pairs_discovered ?? '—'} pairs ·{' '}
          <span style={{ color: 'var(--ink)' }}>{s.pairs_with_more_than_one_pool ?? '—'}</span> with
          more than one door ({s.share_pct === null ? '—' : `${s.share_pct} %`}) ·{' '}
          <span style={{ color: 'var(--ink)' }}>{s.pairs_with_a_single_pool ?? '—'}</span> have only
          one door
        </span>
        {s.block_number !== null && (
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            block {groupDigits(String(s.block_number))}
          </span>
        )}
        {s.is_lower_bound && <Chip title={s.caveat ?? undefined}>lower bound</Chip>}
      </div>
      {s.sentence && (
        <p
          className="m-0"
          style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '90ch', color: 'var(--ink)' }}
        >
          {s.sentence}
        </p>
      )}
      {s.caveat && <Note>{s.caveat}</Note>}
      {s.source && <Note>source · {cheminCourt(s.source)}</Note>}
    </div>
  )
}

/* -------------------------------------------------------------------- le panneau */

type Query = { currency0: string; currency1: string; amount: string | null; zeroForOne: boolean }

export function RoutePanel() {
  // Tout ce qui est propose vient du corpus embarque, recalcule a chaque chargement.
  const tokens = useMemo(() => tokensByFrequency(dataset.rows), [])
  // La liste de completion est BORNEE. Les 8 583 jetons du corpus tenaient dans un <datalist>,
  // soit 8 583 <option> a construire avant le premier texte affiche — pour une liste qu'aucun
  // navigateur ne deroule en entier. On propose les plus mesures, et le champ accepte toujours
  // n'importe quelle adresse : la borne est un confort de saisie, jamais un filtre sur le corpus.
  const proposes = useMemo(() => tokens.slice(0, PROPOSES_MAX), [tokens])
  const sizes = useMemo(() => sizesOf(dataset.rows), [])
  const candidates = useMemo(() => candidatePairs(dataset.rows, 10), [])

  const [form, setForm] = useState<Form>(() => ({
    currency0: tokens[0]?.address ?? '',
    currency1: tokens[1]?.address ?? '',
    // Aucune taille par defaut : /route dit alors explicitement qu'il classe sur la PIRE
    // taille mesuree. Choisir une taille « raisonnable » serait un chiffre invente.
    amount: '',
    zeroForOne: 'true',
  }))
  const [query, setQuery] = useState<Query | null>(null)
  const [answer, setAnswer] = useState<Fetched<unknown> | null>(null)
  const [probes, setProbes] = useState<Probe[]>([])
  const [probed, setProbed] = useState(0)
  const [probeError, setProbeError] = useState<string | null>(null)
  // Combien de candidats on s'autorise a sonder. Voir AUTO_PROBES en tete de fichier pour la
  // raison du plafond ; le bouton « sonder les N restantes » le leve a la demande.
  const [budget, setBudget] = useState(AUTO_PROBES)
  const done = useRef(new Set<string>())
  const touched = useRef(false)

  const ask = (f: Form) => {
    touched.current = true
    if (!ADDRESS_RE.test(f.currency0) || !ADDRESS_RE.test(f.currency1)) return
    setQuery({
      currency0: f.currency0,
      currency1: f.currency1,
      amount: f.amount === '' ? null : f.amount,
      zeroForOne: f.zeroForOne === 'true',
    })
  }

  /* Le sondage du bandeau. Il interroge /route paire par paire : c'est l'API qui compte les
     portes. Aucune paire n'est ecrite en dur, et un sondage qui echoue ne devient pas zero. */
  useEffect(() => {
    const ac = new AbortController()
    let stop = false
    // Une passe qui recommence efface l'erreur de la precedente : sinon le bandeau
    // continuerait d'annoncer une panne au-dessus de paires qui viennent de repondre.
    setProbeError(null)
    void (async () => {
      for (const c of candidates.slice(0, budget)) {
        if (stop) return
        if (done.current.has(c.key)) continue
        done.current.add(c.key)
        const r = await getJson<unknown>(
          routePath({ currency0: c.a, currency1: c.b, amount: null, zeroForOne: null }),
          ac.signal,
        )
        if (stop) {
          // Sondage interrompu : la paire n'a pas ete interrogee, elle redevient candidate.
          done.current.delete(c.key)
          return
        }
        if (r.state === 'error') {
          // La paire n'a pas de reponse : elle redevient candidate, comme apres une
          // interruption. Sans cela une panne passagere de l'API la retirerait
          // definitivement du bandeau, et son absence se lirait comme « pas de portes ».
          done.current.delete(c.key)
          setProbeError(r.detail)
          return
        }
        if (r.state === 'ready') {
          const p = probeOf(c, readAnswer(r.data))
          setProbes((old) => [...old, p])
          // Premiere paire a plusieurs portes trouvee : on l'ouvre, sauf si l'utilisateur
          // a deja pose sa propre question.
          if (!touched.current && doorsOf(p) > 1) {
            touched.current = true
            setForm((f) => ({ ...f, currency0: p.a, currency1: p.b }))
            setQuery({ currency0: p.a, currency1: p.b, amount: null, zeroForOne: true })
          }
        }
        setProbed((n) => n + 1)
      }
    })()
    return () => {
      stop = true
      ac.abort()
    }
  }, [candidates, budget])

  /* La question posee. Une reponse en cours n'efface pas la precedente sans le dire. */
  useEffect(() => {
    if (!query) return
    const ac = new AbortController()
    let stop = false
    setAnswer({ state: 'loading' })
    void (async () => {
      const r = await getJson<unknown>(routePath(query), ac.signal)
      if (!stop) setAnswer(r)
    })()
    return () => {
      stop = true
      ac.abort()
    }
  }, [query?.currency0, query?.currency1, query?.amount, query?.zeroForOne])

  const parsed = useMemo(
    () => (answer && answer.state === 'ready' ? readAnswer(answer.data) : null),
    [answer],
  )
  const part = useMemo(() => (parsed ? partitionAnswer(parsed) : null), [parsed])
  const pres = useMemo(
    () => (parsed && part ? presentationOf(parsed, part) : null),
    [parsed, part],
  )
  const badges = useMemo(() => (part && pres ? rankBadges(part, pres) : []), [part, pres])

  const multi = probes.filter((p) => doorsOf(p) > 1).sort((a, b) => doorsOf(b) - doorsOf(a))
  const single = probes.filter((p) => doorsOf(p) === 1)
  const none = probes.filter((p) => doorsOf(p) === 0)

  return (
    <Panel
      index="03"
      title="Which door to take"
      meta={[
        <span className="hex" key="api">{API_BASE}/route</span>,
        'no cost is recalculated here',
      ]}
    >
      {/* ------------------------------------------------------------ le formulaire */}
      <div
        className="p-[16px] flex flex-wrap items-end gap-[16px]"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <datalist id="tare-tokens">
          {proposes.map((t) => (
            <option key={t.address} value={t.address}>
              {t.rows} measurements in the corpus
            </option>
          ))}
        </datalist>
        <Selector
          label="token A"
          value={form.currency0}
          listId="tare-tokens"
          onChange={(v) => {
            touched.current = true
            setForm((f) => ({ ...f, currency0: v }))
          }}
        />
        <Selector
          label="token B"
          value={form.currency1}
          listId="tare-tokens"
          onChange={(v) => {
            touched.current = true
            setForm((f) => ({ ...f, currency1: v }))
          }}
        />
        <label className="flex flex-col gap-[3px]">
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            size (wei)
          </span>
          <select
            className="t-data px-[8px] py-[5px]"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
            value={form.amount}
            onChange={(e) => {
              touched.current = true
              setForm((f) => ({ ...f, amount: e.target.value }))
            }}
          >
            <option value="">none — highest measured cost</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {sizeText(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-[3px]">
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            direction
          </span>
          <select
            className="t-data px-[8px] py-[5px]"
            style={{ background: 'var(--bg-2)', border: '1px solid var(--line-strong)', color: 'var(--ink)' }}
            value={form.zeroForOne}
            onChange={(e) => {
              touched.current = true
              setForm((f) => ({ ...f, zeroForOne: e.target.value as 'true' | 'false' }))
            }}
          >
            <option value="true">currency0 → currency1</option>
            <option value="false">currency1 → currency0</option>
          </select>
        </label>
        <button
          type="button"
          className="t-label px-[10px] py-[6px] cursor-pointer"
          style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-3)', color: 'var(--ink)' }}
          onClick={() => ask(form)}
        >
          query /route
        </button>
        <Note>
          autocomplete offers the {proposes.length} most measured tokens out of the{' '}
          {tokens.length} in the embedded corpus ({dataset.rows.length} measurements), and the{' '}
          {sizes.length} sizes come from it too; any other address can be typed in. The corpus
          carries no token symbol: we show addresses, we do not invent a name for them.
        </Note>
      </div>

      {/* ---------------------------------------------------------- le bandeau sonde */}
      <div className="px-[16px] py-[10px] flex flex-col gap-[6px]" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="flex flex-wrap items-baseline gap-[12px]">
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            pairs derived from the corpus, doors counted by /route
          </span>
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            {probed}/{candidates.length} pairs queried · {multi.length} with several doors ·{' '}
            {single.length} with a single door{single.length > SINGLE_SHOWN
              ? ` (${SINGLE_SHOWN} shown)`
              : ''} · {none.length} with no measurement
          </span>
          {/* Le reste du sondage est explicite : on ne fait pas patienter l'API sans le dire.
              Les paires non sondees ne sont pas comptees a zero porte — elles ne sont pas
              comptees du tout, et le compteur ci-dessus le montre. */}
          {budget < candidates.length && (
            <button
              type="button"
              className="t-label px-[8px] py-[3px] cursor-pointer"
              style={{
                border: '1px solid var(--line-strong)',
                background: 'var(--bg-2)',
                color: 'var(--ink-2)',
              }}
              onClick={() => setBudget(candidates.length)}
            >
              probe the remaining {candidates.length - budget}
            </button>
          )}
        </div>
        {probeError ? (
          <div className="flex flex-col gap-[4px]">
            <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
              probing stopped: {probeError}
            </span>
            <div className="flex items-center gap-[8px]">
              <code className="t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
                {API_CMD}
              </code>
              <Copy text={API_CMD} />
            </div>
            <Note>
              no pair is offered from memory: without an answer from the API, the number of
              doors of a pair is unknown, and unknown is not one.
            </Note>
          </div>
        ) : (
          <div className="flex flex-wrap gap-[6px]">
            {/* Les paires a porte unique sont legion — 7 794 sur 7 802 au recensement. On en
                montre quelques-unes a titre d'exemple, et le compte total est affiche a cote
                pour qu'aucun lecteur ne prenne cette liste pour l'ensemble. Une version
                anterieure tronquait a quatre sans le dire : une troncature muette dans un
                chemin de donnees est exactement ce que ce projet reproche ailleurs. */}
            {[...multi, ...single.slice(0, SINGLE_SHOWN)].map((p) => (
              <button
                key={p.key}
                type="button"
                className="t-data-xs hex px-[8px] py-[4px] cursor-pointer text-left"
                style={{
                  border: '1px solid var(--line-strong)',
                  background: doorsOf(p) > 1 ? 'var(--bg-3)' : 'var(--bg-2)',
                  color: 'var(--ink-2)',
                }}
                onClick={() => {
                  touched.current = true
                  setForm((f) => ({ ...f, currency0: p.a, currency1: p.b }))
                  ask({ ...form, currency0: p.a, currency1: p.b })
                }}
              >
                {shortAddr(p.a, 8, 4)} / {shortAddr(p.b, 8, 4)}
                <span style={{ color: 'var(--ink)' }}>
                  {' '}
                  · {doorsOf(p)} door{doorsOf(p) > 1 ? 's' : ''}
                </span>
              </button>
            ))}
            {probes.length === 0 && (
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                probing in progress — no pair is shown before /route has answered.
              </span>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- la reponse */}
      {answer === null && (
        <div className="px-[16px] py-[12px]">
          <Note>no question asked.</Note>
        </div>
      )}
      {answer?.state === 'loading' && (
        <div className="px-[16px] py-[12px] t-data-sm" style={{ color: 'var(--ink-2)' }}>
          querying /route…
        </div>
      )}
      {answer?.state === 'error' && (
        <Absence
          quoi={`${API_BASE}/route`}
          panne
          raison={`${answer.detail}. No cost is shown from memory: a door with no answer is not a door at zero.`}
          cmd={API_CMD}
        />
      )}
      {answer?.state === 'absent' && (
        <Absence quoi={`${API_BASE}/route`} raison={answer.detail} cmd={API_CMD} />
      )}

      {parsed && part && pres && (
        <>
          <Verdict answer={parsed} pres={pres} demoted={part.demoted} />

          <div
            className="px-[16px] py-[8px] flex flex-wrap gap-x-[24px] gap-y-[4px] t-data-xs"
            style={{ color: 'var(--ink-2)', borderBottom: '1px solid var(--line)' }}
          >
            <span className="hex">
              pair {parsed.pair.currency0 ? <TokenName address={parsed.pair.currency0} /> : '—'} /{' '}
              {parsed.pair.currency1 ? <TokenName address={parsed.pair.currency1} /> : '—'}
            </span>
            <span>
              direction <span style={{ color: 'var(--ink)' }}>{parsed.direction.human ?? '—'}</span> (
              {parsed.direction.source ?? '—'})
            </span>
            <span>
              requested size{' '}
              <span style={{ color: 'var(--ink)' }}>{sizeText(parsed.size.requested_wei)}</span>
            </span>
            <span>
              block(s) of the measurements{' '}
              <span style={{ color: 'var(--ink)' }}>
                {parsed.block.measurements.length
                  ? parsed.block.measurements.map((b) => groupDigits(String(b))).join(', ')
                  : 'none'}
              </span>
            </span>
          </div>

          {/* L'API refuse de basculer de sens toute seule — un cout mesure dans un sens n'est
              pas le cout de l'autre. Elle le DIT, dans direction.hint. L'ecran offre alors le
              geste, sans le faire a la place de personne : c'est une nouvelle question posee
              a /route, pas une reponse recyclee. */}
          {parsed.direction.hint && (
            <div
              className="px-[16px] py-[8px] flex flex-wrap items-center gap-[10px]"
              style={{ borderBottom: '1px solid var(--line)' }}
            >
              <Note>
                <span style={{ color: 'var(--ink-2)' }}>{parsed.direction.hint}</span>
              </Note>
              {query !== null && (parsed.direction.pools_quoted_in_other_direction ?? 0) > 0 && (
                <button
                  type="button"
                  className="t-label px-[8px] py-[3px] cursor-pointer"
                  style={{
                    border: '1px solid var(--line-strong)',
                    background: 'var(--bg-3)',
                    color: 'var(--ink)',
                  }}
                  onClick={() => {
                    const z = !query.zeroForOne
                    setForm((f) => ({ ...f, zeroForOne: z ? 'true' : 'false' }))
                    setQuery({ ...query, zeroForOne: z })
                  }}
                >
                  ask the question in the other direction
                </button>
              )}
            </div>
          )}

          {/* Le classement. Il n'existe que si l'ecran a le droit de presenter un choix. */}
          {part.gates.length > 0 && (
            <div>
              <div
                className="px-[16px] py-[7px] flex flex-wrap items-baseline gap-[12px]"
                style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line-strong)' }}
              >
                <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                  {pres.isChoice
                    ? `ranking · ${part.gates.length} measured costs, ascending`
                    : 'the only door with a cost — no ranking'}
                </span>
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  {parsed.cost_model.formula ?? ''}
                </span>
              </div>
              {part.gates.map((g, i) => (
                <GateRow key={`${g.pool_id ?? i}`} gate={g} rank={badges[i] ?? null} />
              ))}
              {parsed.ranking_note && (
                <div className="px-[12px] py-[8px]">
                  <Note>
                    <span style={{ color: 'var(--ink-2)' }}>{parsed.ranking_note}</span>
                  </Note>
                </div>
              )}
            </div>
          )}

          {/* Le tas hors classement, SEPARE. Ni zero, ni derniere place. */}
          {part.aside.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line-strong)' }}>
              <div
                className="px-[16px] py-[7px] flex flex-wrap items-baseline gap-[12px]"
                style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line-strong)' }}
              >
                <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                  unranked · {part.aside.length} door(s) with no comparable cost
                </span>
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  none is at zero, none is last
                </span>
              </div>
              {part.aside.map((g, i) => (
                <AsideRow key={`${g.pool_id ?? i}-${g.why ?? i}`} gate={g} />
              ))}
              {parsed.unranked_note && (
                <div className="px-[12px] py-[8px]">
                  <Note>{parsed.unranked_note}</Note>
                </div>
              )}
            </div>
          )}

          {/* Les portes du recensement qu'aucune mesure ne couvre. */}
          {parsed.unmeasured_gates.length > 0 && (
            <div style={{ borderTop: '1px solid var(--line-strong)' }}>
              <div
                className="px-[16px] py-[7px]"
                style={{ background: 'var(--bg-2)', borderBottom: '1px solid var(--line-strong)' }}
              >
                <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                  {parsed.unmeasured_gates.length} door(s) in the census and never measured
                </span>
              </div>
              {parsed.unmeasured_gates.map((g, i) => {
                const cmd = str(g['replay_to_measure'])
                return (
                  <div
                    key={`${str(g['hook']) ?? i}`}
                    className="p-[12px] flex flex-col gap-[4px]"
                    style={{ borderTop: '1px solid var(--line)' }}
                  >
                    <div className="flex flex-wrap items-center gap-[8px]">
                      <Chip>{str(g['label']) ?? 'NOT_MEASURED'}</Chip>
                      <span className="t-data-sm hex" style={{ color: 'var(--ink-2)' }}>
                        hook {str(g['hook']) ? shortAddr(str(g['hook'])!, 12, 6) : '—'}
                      </span>
                      <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                        fee {num(g['key_fee']) ?? '—'} · tickSpacing {num(g['tick_spacing']) ?? '—'}
                      </span>
                    </div>
                    <Note>{str(g['note']) ?? ''}</Note>
                    {cmd ? (
                      <div className="flex items-center gap-[8px] flex-wrap">
                        <code
                          className="t-data-xs hex"
                          style={{ color: 'var(--ink-2)', maxWidth: '90ch', whiteSpace: 'nowrap', overflowX: 'auto' }}
                        >
                          {cmd}
                        </code>
                        <Copy text={cmd} />
                      </div>
                    ) : (
                      <Note>{str(g['replay_note']) ?? ''}</Note>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          <StructureBar answer={parsed} />

          <div
            className="px-[16px] py-[10px] flex flex-col gap-[3px]"
            style={{ borderTop: '1px solid var(--line)' }}
          >
            {parsed.sources.map((s) => (
              <Note key={s.path ?? s.kind ?? 'source'}>
                source {s.kind ?? '—'} · {cheminCourt(s.path)} · {s.measurements ?? '—'} measurements read out of{' '}
                {s.rows_read ?? '—'} rows · {s.rejected_lines ?? '—'} unreadable line(s)
                {s.exists ? '' : ' · FILE MISSING'}
              </Note>
            ))}
            {parsed.census_source.path && (
              <Note>
                census · {cheminCourt(parsed.census_source.path)} · unreadable pools{' '}
                {parsed.census_source.unreadable_pools === null
                  ? 'unknown'
                  : parsed.census_source.unreadable_pools}{' '}
                — {parsed.census_source.unreadable_pools_note ?? ''}
              </Note>
            )}
            {parsed.cost_model.assumption && <Note>assumption · {parsed.cost_model.assumption}</Note>}
            {parsed.honesty.map((h) => (
              <Note key={h}>{h}</Note>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}
