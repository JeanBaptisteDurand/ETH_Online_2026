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
import { Chip, Copy, Panel, Replay } from './Prim'
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
        <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          {' '}
          natif
        </span>
      )}
    </span>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p
      className="t-data-xs m-0"
      style={{ color: 'var(--ink-3)', maxWidth: '110ch', fontFamily: 'var(--mono)' }}
    >
      {children}
    </p>
  )
}

/** Une taille en wei, dite exactement : 1e18 quand c'est une puissance de dix, sinon groupee. */
function sizeText(wei: string | null): string {
  if (wei === null) return 'aucune taille demandee'
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
      <span className="t-label" style={{ color: 'var(--ink-3)' }}>
        {label}
      </span>
      <input
        className="t-data hex px-[8px] py-[5px]"
        style={{
          background: 'var(--bg-2)',
          border: `1px solid ${ok ? 'var(--line-strong)' : 'var(--m-4)'}`,
          color: 'var(--ink)',
          minWidth: 340,
        }}
        list={listId}
        value={value}
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      {!ok && (
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          adresse invalide — 0x suivi de 40 hexadecimaux
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
      <Chip title={s.note ?? undefined}>taille non mesuree</Chip>{' '}
      {s.requested_wei === null
        ? 'aucune taille demandee : ce cout est le PLUS ELEVE mesure, toutes tailles confondues'
        : `demande ${sizeText(s.requested_wei)} — ce cout est lu a ${sizeText(s.used_wei)}`}
    </div>
  )
}

function GateRow({ gate, rank }: { gate: PresentedGate; rank: string | null }) {
  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-stretch gap-[12px] p-[12px]">
        <div className="flex flex-col justify-center" style={{ minWidth: 54 }}>
          <span className="t-label" style={{ color: 'var(--ink-3)' }}>
            {rank === null ? 'porte' : 'rang'}
          </span>
          <span className="t-title" style={{ color: rank === null ? 'var(--ink-3)' : 'var(--ink)' }}>
            {rank ?? '—'}
          </span>
        </div>

        <div className="px-[12px] py-[8px]" style={{ ...rampCell(gate.total_bps), minWidth: 250 }}>
          <div className="t-title-lg" style={{ color: 'var(--ink)' }}>
            {fmtBps(gate.total_bps)} <span className="t-data-sm">bps</span>
          </div>
          <div className="t-data-sm" style={{ color: 'var(--ink-3)' }}>
            cout total mesure = frais LP {fmtBps(gate.lp_fee_bps)} + hook {fmtBps(gate.hook_bps)}
          </div>
          <SizeWarning gate={gate} />
        </div>

        <div className="flex flex-col gap-[3px] flex-1" style={{ minWidth: 320 }}>
          <div className="flex flex-wrap items-center gap-[8px]">
            {gate.label && <Chip>{gate.label}</Chip>}
            <span className="t-data-sm hex" style={{ color: 'var(--ink-2)' }}>
              hook {gate.hook ? shortAddr(gate.hook, 12, 6) : '—'}
            </span>
            <span className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
              pool {gate.pool_id ? shortAddr(gate.pool_id, 10, 6) : '—'}
            </span>
            {gate.block_number !== null && (
              <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                bloc {groupDigits(String(gate.block_number))}
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
          <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
            {Object.entries(gate.labels_in_direction)
              .map(([k, v]) => `${k}=${v}`)
              .join(' · ') || 'aucune etiquette rendue'}
            {gate.cost_basis ? ` · base du cout : ${gate.cost_basis}` : ''}
          </div>
        </div>
      </div>
      {gate.replay ? (
        <div className="px-[12px] pb-[12px]">
          <Replay
            cmd={gate.replay}
            note={`Cette commande rejoue LA mesure qui porte le nombre ci-dessus${
              gate.measurement_id ? ` (${gate.measurement_id})` : ''
            }. Le fork doit tourner : docker compose up -d anvil.`}
          />
        </div>
      ) : (
        <div className="px-[12px] pb-[12px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
          la reponse ne porte pas de commande de rejeu pour cette porte : le nombre reste
          verifiable par son identifiant de mesure, pas par une commande que l'ecran
          inventerait.
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
        <Chip>{gate.why ?? 'hors classement'}</Chip>
        <span className="t-data-sm hex" style={{ color: 'var(--ink-2)' }}>
          hook {gate.hook ? shortAddr(gate.hook, 12, 6) : '—'}
        </span>
        <span className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
          pool {gate.pool_id ? shortAddr(gate.pool_id, 10, 6) : '—'}
        </span>
        <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          {labels.length ? labels.map(([k, v]) => `${k}=${v}`).join(' · ') : 'aucune etiquette'}
        </span>
      </div>
      <div className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '110ch' }}>
        {gate.why_fr ?? 'aucun motif rendu par l API.'}
      </div>
      {gate.hook_bps !== null && (
        <div className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
          prelevement du hook seul&nbsp;:{' '}
          <span style={{ color: 'var(--ink)' }}>{fmtBps(gate.hook_bps)} bps</span> — ce n'est pas un
          cout total, il manque les frais LP : cette porte reste hors classement.
        </div>
      )}
      {gate.nearest && (
        <div className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          a une AUTRE taille ({sizeText(gate.nearest.amount_in)})&nbsp;: total{' '}
          <span style={{ color: 'var(--ink-2)' }}>{fmtBps(gate.nearest.total_bps)} bps</span> ·{' '}
          {gate.nearest.label ?? '—'} · {gate.nearest.measurement_id ?? '—'}. {gate.nearest.note}
        </div>
      )}
      {(gate.replay_at_requested_size || gate.replay || gate.nearest?.replay) && (
        <div className="flex items-center gap-[8px] flex-wrap">
          <code
            className="t-data-xs hex overflow-x-auto"
            style={{ color: 'var(--ink-3)', maxWidth: '90ch', whiteSpace: 'nowrap' }}
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
        <Chip>{answer.verdict ?? 'verdict absent'}</Chip>
        <span className="t-title" style={{ color: 'var(--ink)' }}>
          {pres.title}
        </span>
        <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          {pres.doors === null
            ? 'nombre de portes inconnu'
            : `${pres.doors} porte${pres.doors > 1 ? 's' : ''} · source : ${pres.doorsSource}`}
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
              Il n'y a rien a classer&nbsp;: <strong style={{ color: 'var(--ink)' }}>une seule
              porte existe</strong>. Ce qui est preleve ici n'est pas un prix concurrentiel, c'est
              un peage sur la seule route — on ne peut pas contourner le hook.
            </>
          ) : (
            <>
              Une seule porte est <strong style={{ color: 'var(--ink)' }}>mesuree</strong>, mais le
              recensement ne permet pas d'affirmer qu'il n'en existe pas d'autres. On ne remplace
              pas cette incertitude par la phrase forte.
            </>
          )}
        </p>
      )}

      {alt.sentence && (
        <Note>
          alternatives · <span style={{ color: 'var(--ink-2)' }}>{alt.claim}</span> — {alt.sentence}
        </Note>
      )}
      {alt.caveat && <Note>reserve · {alt.caveat}</Note>}
      {alt.pools_in_census_note && <Note>{alt.pools_in_census_note}</Note>}
      {demoted > 0 && (
        <Note>
          <span style={{ color: 'var(--ink)' }}>
            {demoted} porte(s) classee(s) par l'API sans cout total lisible ont ete sorties du
            classement par cet ecran.
          </span>{' '}
          Elles sont listees hors classement, jamais a zero.
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
        <Note>{answer.structure_note ?? 'recensement indisponible : aucune phrase structurelle.'}</Note>
      </div>
    )
  return (
    <div
      className="px-[16px] py-[12px] flex flex-col gap-[6px]"
      style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-1)' }}
    >
      <div className="flex flex-wrap items-baseline gap-x-[24px] gap-y-[4px]">
        <span className="t-label" style={{ color: 'var(--ink-3)' }}>
          structure du marche, derivee du recensement
        </span>
        <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
          {s.pairs_discovered ?? '—'} paires ·{' '}
          <span style={{ color: 'var(--ink)' }}>{s.pairs_with_more_than_one_pool ?? '—'}</span> a plus
          d'une porte ({s.share_pct === null ? '—' : `${s.share_pct} %`}) ·{' '}
          <span style={{ color: 'var(--ink)' }}>{s.pairs_with_a_single_pool ?? '—'}</span> n'ont
          qu'une porte
        </span>
        {s.block_number !== null && (
          <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
            bloc {groupDigits(String(s.block_number))}
          </span>
        )}
        {s.is_lower_bound && <Chip title={s.caveat ?? undefined}>minorant</Chip>}
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
      {s.source && <Note>source · {s.source}</Note>}
    </div>
  )
}

/* -------------------------------------------------------------------- le panneau */

type Query = { currency0: string; currency1: string; amount: string | null; zeroForOne: boolean }

export function RoutePanel() {
  // Tout ce qui est propose vient du corpus embarque, recalcule a chaque chargement.
  const tokens = useMemo(() => tokensByFrequency(dataset.rows), [])
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
      index="07"
      title="par quelle porte passer · le cout total mesure"
      right={
        <span className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
          {API_BASE}/route · aucun cout n'est recalcule ici
        </span>
      }
    >
      {/* ------------------------------------------------------------ le formulaire */}
      <div
        className="p-[16px] flex flex-wrap items-end gap-[16px]"
        style={{ borderBottom: '1px solid var(--line)' }}
      >
        <datalist id="tare-tokens">
          {tokens.map((t) => (
            <option key={t.address} value={t.address}>
              {t.rows} mesures dans le corpus
            </option>
          ))}
        </datalist>
        <Selector
          label="jeton A"
          value={form.currency0}
          listId="tare-tokens"
          onChange={(v) => {
            touched.current = true
            setForm((f) => ({ ...f, currency0: v }))
          }}
        />
        <Selector
          label="jeton B"
          value={form.currency1}
          listId="tare-tokens"
          onChange={(v) => {
            touched.current = true
            setForm((f) => ({ ...f, currency1: v }))
          }}
        />
        <label className="flex flex-col gap-[3px]">
          <span className="t-label" style={{ color: 'var(--ink-3)' }}>
            taille (wei)
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
            <option value="">aucune — cout mesure le plus eleve</option>
            {sizes.map((s) => (
              <option key={s} value={s}>
                {sizeText(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-[3px]">
          <span className="t-label" style={{ color: 'var(--ink-3)' }}>
            sens
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
          interroger /route
        </button>
        <Note>
          les {tokens.length} jetons proposes et les {sizes.length} tailles viennent du corpus
          embarque ({dataset.rows.length} mesures) ; toute autre adresse peut etre tapee. Le
          corpus ne porte pas de symbole de jeton : on affiche des adresses, on n'en invente pas
          le nom.
        </Note>
      </div>

      {/* ---------------------------------------------------------- le bandeau sonde */}
      <div className="px-[16px] py-[10px] flex flex-col gap-[6px]" style={{ borderBottom: '1px solid var(--line)' }}>
        <div className="flex flex-wrap items-baseline gap-[12px]">
          <span className="t-label" style={{ color: 'var(--ink-3)' }}>
            paires derivees du corpus, portes comptees par /route
          </span>
          <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
            {probed}/{candidates.length} paires interrogees · {multi.length} a plusieurs portes ·{' '}
            {single.length} a porte unique{single.length > SINGLE_SHOWN
              ? ` (${SINGLE_SHOWN} montrees)`
              : ''} · {none.length} sans mesure
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
              sonder les {candidates.length - budget} restantes
            </button>
          )}
        </div>
        {probeError ? (
          <div className="flex flex-col gap-[4px]">
            <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
              le sondage s'est arrete : {probeError}
            </span>
            <div className="flex items-center gap-[8px]">
              <code className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
                {API_CMD}
              </code>
              <Copy text={API_CMD} />
            </div>
            <Note>
              aucune paire n'est proposee de memoire : sans reponse de l'API, le nombre de portes
              d'une paire est inconnu, et inconnu n'est pas un.
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
                  · {doorsOf(p)} porte{doorsOf(p) > 1 ? 's' : ''}
                </span>
              </button>
            ))}
            {probes.length === 0 && (
              <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                sondage en cours — aucune paire n'est affichee avant que /route ait repondu.
              </span>
            )}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- la reponse */}
      {answer === null && (
        <div className="px-[16px] py-[12px]">
          <Note>aucune question posee.</Note>
        </div>
      )}
      {answer?.state === 'loading' && (
        <div className="px-[16px] py-[12px] t-data-sm" style={{ color: 'var(--ink-3)' }}>
          interrogation de /route…
        </div>
      )}
      {answer?.state === 'error' && (
        <div className="px-[16px] py-[12px] flex flex-col gap-[6px]">
          <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            {API_BASE} n'a pas repondu : {answer.detail}
          </span>
          <div className="flex items-center gap-[8px]">
            <code className="t-data-xs hex" style={{ color: 'var(--ink-3)' }}>
              {API_CMD}
            </code>
            <Copy text={API_CMD} />
          </div>
          <Note>
            aucun cout n'est affiche de memoire. Une porte sans reponse n'est pas une porte a zero.
          </Note>
        </div>
      )}
      {answer?.state === 'absent' && (
        <div className="px-[16px] py-[12px] t-data-sm" style={{ color: 'var(--ink-2)' }}>
          {answer.detail}
        </div>
      )}

      {parsed && part && pres && (
        <>
          <Verdict answer={parsed} pres={pres} demoted={part.demoted} />

          <div
            className="px-[16px] py-[8px] flex flex-wrap gap-x-[24px] gap-y-[4px] t-data-xs"
            style={{ color: 'var(--ink-3)', borderBottom: '1px solid var(--line)' }}
          >
            <span className="hex">
              paire {parsed.pair.currency0 ? <TokenName address={parsed.pair.currency0} /> : '—'} /{' '}
              {parsed.pair.currency1 ? <TokenName address={parsed.pair.currency1} /> : '—'}
            </span>
            <span>
              sens <span style={{ color: 'var(--ink)' }}>{parsed.direction.human ?? '—'}</span> (
              {parsed.direction.source ?? '—'})
            </span>
            <span>
              taille demandee{' '}
              <span style={{ color: 'var(--ink)' }}>{sizeText(parsed.size.requested_wei)}</span>
            </span>
            <span>
              bloc(s) des mesures{' '}
              <span style={{ color: 'var(--ink)' }}>
                {parsed.block.measurements.length
                  ? parsed.block.measurements.map((b) => groupDigits(String(b))).join(', ')
                  : 'aucun'}
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
                  reposer la question dans l'autre sens
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
                    ? `classement · ${part.gates.length} couts mesures, croissants`
                    : 'la seule porte chiffree — aucun classement'}
                </span>
                <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
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
                  hors classement · {part.aside.length} porte(s) sans cout comparable
                </span>
                <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                  aucune n'est a zero, aucune n'est derniere
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
                  {parsed.unmeasured_gates.length} porte(s) recensee(s) et jamais mesuree(s)
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
                      <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
                        fee {num(g['key_fee']) ?? '—'} · tickSpacing {num(g['tick_spacing']) ?? '—'}
                      </span>
                    </div>
                    <Note>{str(g['note']) ?? ''}</Note>
                    {cmd ? (
                      <div className="flex items-center gap-[8px] flex-wrap">
                        <code
                          className="t-data-xs hex"
                          style={{ color: 'var(--ink-3)', maxWidth: '90ch', whiteSpace: 'nowrap', overflowX: 'auto' }}
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
                source {s.kind ?? '—'} · {s.path ?? '—'} · {s.measurements ?? '—'} mesures lues sur{' '}
                {s.rows_read ?? '—'} lignes · {s.rejected_lines ?? '—'} ligne(s) illisible(s)
                {s.exists ? '' : ' · FICHIER ABSENT'}
              </Note>
            ))}
            {parsed.census_source.path && (
              <Note>
                recensement · {parsed.census_source.path} · pools illisibles{' '}
                {parsed.census_source.unreadable_pools === null
                  ? 'inconnu'
                  : parsed.census_source.unreadable_pools}{' '}
                — {parsed.census_source.unreadable_pools_note ?? ''}
              </Note>
            )}
            {parsed.cost_model.assumption && <Note>hypothese · {parsed.cost_model.assumption}</Note>}
            {parsed.honesty.map((h) => (
              <Note key={h}>{h}</Note>
            ))}
          </div>
        </>
      )}
    </Panel>
  )
}
