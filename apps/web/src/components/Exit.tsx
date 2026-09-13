// THE EXIT TEST — « you put in 100 €, how much do you get back? »
//
// One field, one number, one sentence. It is the only panel that answers the question in the
// order it is asked: you go in, then you come back out.
//
// Everything is computed HERE, in the browser, from the embedded corpus. No request, no fork,
// no server — so the answer is immediate, and two visitors at once cannot get in each other's
// way. That is deliberate: the version that really EXECUTES the round trip lives behind
// POST /measure and costs compute.
//
// What the screen has to make visible, and which matters more than the number:
//   - an INTERVAL when the sell-back varies with size, never a single value;
//   - a REASONED REFUSAL when only one direction is measured — the other way is not free;
//   - the OTHER DOORS, because « what does this one take » is only half the question, and
//     « there is only one » is an answer, not a hole;
//   - the REPLACEMENT TRANSACTION we know how to build, and the named state that says what
//     is still missing before it could be signed.
import { useMemo, useState } from 'react'
import { dataset } from '../lib/dataset'
import { testDeSortie, MONNAIES_DE_COTATION, type Ligne, type TestSortie } from '../lib/exit'
import {
  ouAcheter,
  aMontrer,
  type EtatRecherche,
  type Groupe,
  type Porte,
  type Recherche,
} from '../lib/portes'
import { Panel, Copy, Replay, NonLu } from './Prim'
import { EtatNomme } from './Substituer'
import { type EtatEnvoi } from '../compte/substitution'
import { rampVar } from '../lib/ramp'
import FA from '../data/facts.json'
import symboles from '../data/symboles.json'

const SYM = (symboles as { jetons: Record<string, { symbole: string | null }> }).jetons
const nomDe = (a: string): string | null => SYM[a.toLowerCase()]?.symbole ?? null

/**
 * THE EXAMPLES CARRY THEIR NAME.
 *
 * An address alone does not say what to click: « 0xb200…bfb8 » teaches nobody anything. The
 * symbols are READ on chain by `scripts/fetch-symboles.mjs` (`symbol()`, `name()`), not
 * guessed — writing a name because the address looks like it would be the very fault this
 * project holds against everyone else. Each example also carries what it DEMONSTRATES, which
 * is the reason it is offered.
 */
const EXEMPLES = [
  { addr: '0xb2000000000000000000000518f4215d5615bfb8', note: 'nothing comes back' },
  { addr: '0xb20000000000000000000090aa1082ce28905f01', note: 'it depends on the size' },
  { addr: '0x69df254076b8a0360ea1180b58aaf1749fe97786', note: 'a known token' },
  // The two tokens below are the reason the « other doors » block exists: out of the 8 586
  // tokens of the corpus, THREE have two comparable doors. Offering one is the only honest
  // way to show a ranking without inventing it.
  { addr: '0xb2000000000000000000007d9640993d01f94199', note: 'two doors, and a gap' },
  { addr: '0xb20000000000000000000078ee7ce2fe4908108c', note: 'many currencies, one ranking' },
]

const EST_ADRESSE = /^0x[0-9a-fA-F]{40}$/

function lignesDuJeton(token: string): Ligne[] {
  const t = token.toLowerCase()
  return (dataset.rows as unknown as Ligne[]).filter(
    (r) => r.currency0.toLowerCase() === t || r.currency1.toLowerCase() === t,
  )
}

/**
 * THE ANSWER SENTENCE, IN ENGLISH, BUILT FROM THE TWO BOUNDS.
 *
 * `phraseSortie` in src/lib/exit.ts writes the same sentence in French, and that module is
 * shared with the API and with the test suite — it is not ours to translate from here. So
 * the sentence is written locally, from the SAME two fields, with the same rule: two bounds
 * that print identically are not an interval, and announcing one would spend trust for
 * nothing.
 */
function phraseEnAnglais(t: TestSortie, montant: number, devise = '€'): string {
  const lo = (t.pire.gardeMin * montant).toFixed(2)
  const hi = (t.pire.gardeMax * montant).toFixed(2)
  if (t.pire.exact || lo === hi) return `you are left with ${lo} ${devise}`
  return `you are left with between ${lo} and ${hi} ${devise}`
}

function Barre({ test }: { test: TestSortie }) {
  const p = test.pire
  // The bar is to scale: what comes back, and what stays with the pool. When the sell-back
  // varies, the uncertain zone is drawn between the two bounds rather than averaged away.
  const min = Math.max(0, Math.min(1, p.gardeMin))
  const max = Math.max(0, Math.min(1, p.gardeMax))

  // The colour comes from the MEASUREMENT RAMP, the only chromatic family of the instrument:
  // a coloured surface carries a magnitude (src/lib/ramp.ts). Here the magnitude is the total
  // cost of the round trip, in basis points — that is, what the pool keeps. A colour chosen
  // for « good / bad » would have measured nothing at all.
  const coutBps = (1 - min) * 10000
  const teinte = rampVar(coutBps)

  return (
    <div className="flex flex-col gap-[6px]">
      <div
        className="flex"
        style={{ height: 34, border: '1px solid var(--line-strong)', overflow: 'hidden' }}
      >
        <div style={{ width: `${min * 100}%`, background: 'var(--bg-3)' }} />
        {max > min && (
          <div
            style={{
              width: `${(max - min) * 100}%`,
              background: `repeating-linear-gradient(45deg, ${teinte}, ${teinte} 5px, var(--bg-3) 5px, var(--bg-3) 10px)`,
            }}
            title="uncertain zone: the sell-back varies with the size"
          />
        )}
        <div style={{ flex: 1, background: teinte }} />
      </div>
      <div className="flex justify-between t-data-xs" style={{ color: 'var(--ink-2)' }}>
        <span>what comes back to you</span>
        {max > min && <span>uncertain zone</span>}
        <span>what stays with the pool, {coutBps.toFixed(0)} bps</span>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------- the other doors */

/**
 * WHAT EACH NAMED STATE MEANS, IN FOUR WORDS.
 *
 * The full reason comes from `ouAcheter` and is printed as it stands, underneath. This table
 * only gives the state a readable gloss — it never replaces the reason, and it never turns a
 * refusal into a result.
 */
const GLOSE: Record<EtatRecherche, string> = {
  PLUSIEURS_PORTES: 'ranked, same size and same currency',
  PORTE_UNIQUE: 'one door, nowhere else to go',
  AUCUNE_MESUREE: 'doors exist, none measured at this size',
  JETON_INCONNU: 'not in the corpus',
  MONNAIE_DE_COTATION: 'this is what you spend, not what you buy',
}

/** A door, one line: the total first, then what it is made of, then where it is. */
function PorteLigne({ p, rang, meilleure }: { p: Porte; rang: number; meilleure: Porte }) {
  const ecart = p.totalBps !== null && meilleure.totalBps !== null ? p.totalBps - meilleure.totalBps : null
  return (
    <div
      className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[2px] py-[6px]"
      style={{ borderTop: '1px solid var(--line)', minWidth: 0 }}
    >
      {/* `t-metric` is the size of the panel's headline figure: on a row of four doors it
          swallowed the line it was supposed to open. The total stays the only thing in
          full ink, which is enough to make it the entry point. */}
      <span className="t-data-sm" style={{ color: 'var(--ink)', minWidth: 88 }}>
        {p.totalBps === null ? <NonLu quoi="total take" /> : `${p.totalBps.toFixed(2)} bps`}
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
        {p.lpBps === null ? <NonLu quoi="LP fee from slot0" /> : `${p.lpBps.toFixed(2)} LP fee`}
        {' + '}
        {p.hookBps === null ? <NonLu quoi="hook take" /> : `${p.hookBps.toFixed(2)} hook take`}
        {p.feeDynamique && ' · dynamic fee'}
      </span>
      <span className="t-data-xs hex" style={{ color: 'var(--ink-2)', minWidth: 0 }}>
        pool {p.poolId.slice(0, 10)}… · hook {p.hook.slice(0, 10)}…
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink)' }}>
        {rang === 0 ? 'cheapest' : ecart === null ? '' : `+${ecart.toFixed(2)} bps`}
      </span>
    </div>
  )
}

/** One ranking, valid for ONE currency spent and ONE size. Two currencies never mix. */
function GroupeBloc({ g }: { g: Groupe }) {
  const meilleure = g.classees[0]
  return (
    <div className="flex flex-col" style={{ minWidth: 0 }}>
      <div className="t-label flex flex-wrap gap-x-[12px] gap-y-[2px]" style={{ color: 'var(--ink-2)' }}>
        <span style={{ color: 'var(--ink)' }}>
          paying with {g.paieAvecNom ?? <span className="hex">{g.paieAvec.slice(0, 10)}…</span>}
        </span>
        <span className="hex">size {g.taille}</span>
        {/* Three cases, and none of them may be written as another: nothing measured here,
            one measurement (no gap exists), or a real gap. Saying « one measured door » on a
            group that has none would turn an absence into a result. */}
        <span>
          {g.classees.length === 0
            ? 'nothing measured at this size in this currency'
            : g.ecart_bps === null
              ? 'one measured door: there is no gap to state'
              : `gap ${g.ecart_bps.toFixed(2)} bps between cheapest and dearest`}
        </span>
      </div>
      {meilleure &&
        g.classees.map((p, i) => (
          <PorteLigne key={`${p.poolId}${p.sens}`} p={p} rang={i} meilleure={meilleure} />
        ))}
      {g.non_mesurees.length > 0 && (
        <div className="t-data-xs pt-[6px]" style={{ color: 'var(--ink-2)', borderTop: '1px solid var(--line)' }}>
          {g.non_mesurees.length} more door{g.non_mesurees.length > 1 ? 's' : ''} in this currency
          {g.non_mesurees.length > 1 ? ' are' : ' is'} NOT measured at this size. Not cheaper:{' '}
          <strong style={{ color: 'var(--ink)' }}>unknown</strong> — which is why{' '}
          {g.non_mesurees.length > 1 ? 'they are' : 'it is'} kept out of the ranking instead of
          being counted as zero.
        </div>
      )}
    </div>
  )
}

/**
 * THE REPLACEMENT TRANSACTION, AT THE POINT WHERE THE QUESTION IS ASKED.
 *
 * What the product knows how to do, said where it matters: it BUILDS the swap through the
 * cheaper door and has it signed through Permit2 — one off-chain signature instead of an
 * approval transaction — and IT NEVER SENDS IT.
 *
 * There is no button here, and that is the point. Building needs three live reads and a
 * signer address; panel 00 answers from the embedded corpus with no request at all. So the
 * screen shows the NAMED STATE of packages/guard/src/envoi.ts — `NON_DEMANDE`, the one the
 * route itself returns for `construire: false` — its reason, and the exact request body that
 * panel 16 sends. A reasoned refusal is a feature; a button that does nothing is a lie.
 */
function Remplacement({ g }: { g: Groupe }) {
  const meilleure = g.classees[0]
  const actuelle = g.classees[g.classees.length - 1]
  if (!meilleure || !actuelle || meilleure === actuelle) return null

  // Typed against `EtatEnvoi`: if the state is ever renamed in ../compte/substitution.ts,
  // this file stops compiling instead of quietly displaying a state that no longer exists.
  const etat: EtatEnvoi = 'NON_DEMANDE'
  const corps = JSON.stringify({
    pool_id: actuelle.poolId,
    direction: actuelle.sens,
    amount_in: actuelle.taille,
    construire: true,
  })

  return (
    <div className="flex flex-col gap-[10px] pt-[14px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
      <h3 className="t-label m-0" style={{ color: 'var(--ink)' }}>
        Substitute the transaction — what would be built
      </h3>
      <p className="t-data-xs m-0" style={{ color: 'var(--ink-2)', maxWidth: '78ch', lineHeight: 1.55 }}>
        From here the instrument does not stop at reading. It builds the swap that goes through
        the cheaper door and has it signed through <strong style={{ color: 'var(--ink)' }}>Permit2</strong>:
        one off-chain signature instead of an approval transaction, which costs nothing and
        confirms nothing on chain. The router command list is{' '}
        <code style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>0x0a10</code> —{' '}
        <code style={{ fontFamily: 'var(--mono)' }}>PERMIT2_PERMIT</code> then{' '}
        <code style={{ fontFamily: 'var(--mono)' }}>V4_SWAP</code>, in that order, because a permit
        after its swap authorises nothing. And it is{' '}
        <strong style={{ color: 'var(--ink)' }}>never broadcast</strong>: the route returns a{' '}
        <code style={{ fontFamily: 'var(--mono)' }}>{'{to, data, value}'}</code>, your wallet signs
        it, and the last hand on the transaction is yours.
      </p>

      <div className="flex flex-col" style={{ minWidth: 0 }}>
        <div className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[2px] py-[6px] t-data-xs"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 96 }}>leave this door</span>
          <span className="hex">{actuelle.poolId.slice(0, 14)}…</span>
          <span>{actuelle.totalBps?.toFixed(2)} bps</span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-[12px] gap-y-[2px] py-[6px] t-data-xs"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 96 }}>take that one</span>
          <span className="hex">{meilleure.poolId.slice(0, 14)}…</span>
          <span style={{ color: 'var(--ink)' }}>{meilleure.totalBps?.toFixed(2)} bps</span>
          <span>
            saving {((actuelle.totalBps ?? 0) - (meilleure.totalBps ?? 0)).toFixed(2)} bps, measured,
            at the same size and in the same currency
          </span>
        </div>
      </div>

      <EtatNomme
        etat={etat}
        suite="read the chain, then build"
        encadre={false}
        raison={
          <>
            Nothing has been read on chain here, and nothing will be: this panel answers from the
            embedded corpus, with no request. Building takes three live reads — the token
            allowance to the Permit2 contract, the Permit2 nonce (guessed, it makes the signature
            fail), and a live quote for the output floor, minus 50 bps of tolerance — plus the
            address that will sign, because the Permit2 state of an ERC-20 depends on who signs.
            That is what <span className="hex">POST /alternative</span> does, and what panel 16
            runs. The send button is only ever active on the state{' '}
            <span className="hex">PRET</span>.
          </>
        }
      />

      <Replay
        cmd={`curl -s -X POST "$TARE_API/alternative" -H 'content-type: application/json' -d '${corps}'`}
        note="the exact request for this pair of doors — the body is built from the ranking above, not typed by hand"
      />

      <div className="flex flex-wrap items-center gap-[12px]">
        <a
          href="#/outil/7"
          className="t-data-xs underline"
          style={{ color: 'var(--focus)' }}
        >
          Substitute the transaction — the tool, step by step
        </a>
        <a
          href="#/instrument/p-16"
          className="t-data-xs underline"
          style={{ color: 'var(--focus)' }}
        >
          panel 16, where the request is actually sent
        </a>
      </div>
    </div>
  )
}

/**
 * THE OTHER DOORS FOR THIS TOKEN.
 *
 * `ouAcheter` is pure, embedded and tested: it ranks only what is MEASURED, compares only at
 * equal size AND in the same currency spent, and says « there is only one » when that is the
 * case — which is the case for 99.7 % of the corpus. None of those three refusals is a hole
 * to be filled: each one is the answer aggregators never give.
 */
function Portes({ jeton }: { jeton: string }) {
  const r: Recherche = useMemo(() => ouAcheter(dataset.rows, jeton), [jeton])
  const { montres, restants } = useMemo(() => aMontrer(r, 3), [r])
  const comparable = r.groupes.find((g) => g.classees.length >= 2)

  return (
    <div className="flex flex-col gap-[12px] pt-[14px]" style={{ borderTop: '1px solid var(--line-strong)', minWidth: 0 }}>
      <div className="flex flex-wrap items-baseline gap-x-[14px] gap-y-[4px]">
        <h3 className="t-label m-0" style={{ color: 'var(--ink)' }}>
          Where else could you buy it?
        </h3>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {r.n_portes} door{r.n_portes > 1 ? 's' : ''} in the corpus
          {r.groupes.length > 1 && `, across ${r.groupes.length} currencies`}
          {r.bloc !== null && ` · block ${r.bloc}`}
        </span>
      </div>

      <EtatNomme etat={r.etat} suite={GLOSE[r.etat]} raison={r.raison} encadre={false} />

      {montres.map((g) => (
        <GroupeBloc key={`${g.paieAvec}${g.taille}`} g={g} />
      ))}

      {restants > 0 && (
        <p className="t-data-xs m-0" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
          {restants} other currenc{restants > 1 ? 'ies' : 'y'} can buy this token and {restants > 1 ? 'are' : 'is'}{' '}
          not shown here. The truncation is said out loud rather than performed in silence — and
          none of those currencies would change the ranking above, because a ranking never
          crosses two currencies.
        </p>
      )}

      {comparable?.classees[0] && (
        <Replay
          cmd={comparable.classees[0].rejeu}
          note="the cheapest door of the ranking, replayable line by line against a node — verify rather than believe"
        />
      )}

      {comparable && <Remplacement g={comparable} />}
    </div>
  )
}

export function ExitPanel() {
  const [saisie, setSaisie] = useState('')
  const [montant, setMontant] = useState(100)

  type Resultat =
    | { etat: 'erreur'; message: string }
    | { etat: 'refus'; raison: string }
    | { etat: 'ok'; test: TestSortie }

  const jeton = saisie.trim().toLowerCase()

  const resultat = useMemo<Resultat | null>(() => {
    const t = jeton
    if (!t) return null
    if (!EST_ADRESSE.test(t))
      return { etat: 'erreur', message: 'Paste a contract address: 0x followed by 40 characters.' }
    if (t in MONNAIES_DE_COTATION)
      return {
        etat: 'erreur',
        message: `${MONNAIES_DE_COTATION[t]} is the currency on the other side of the swap, not the token to test.`,
      }
    const lignes = lignesDuJeton(t)
    if (lignes.length === 0)
      return {
        etat: 'erreur',
        message:
          'This token is not in the measurement corpus. That does not make it a token with no take: it is NOT MEASURED.',
      }
    const test = testDeSortie(t, lignes)
    return test.ok ? { etat: 'ok', test } : { etat: 'refus', raison: test.raison }
  }, [jeton])

  return (
    <Panel
      index="00"
      title="The exit test"
      meta={['computed in the browser', 'no request', 'block 50 614 000']}
    >
      <div className="flex flex-col gap-[14px] p-[16px]" style={{ minWidth: 0 }}>
        <div className="flex flex-wrap items-center gap-[10px]">
          <input
            value={saisie}
            onChange={(e) => setSaisie(e.target.value)}
            placeholder="0x4200… the address of a Base token"
            aria-label="token address"
            name="jeton-sortie"
            autoComplete="off"
            translate="no"
            spellCheck={false}
            className="t-data-sm"
            style={{
              flex: '1 1 380px',
              minWidth: 0,
              padding: '10px 12px',
              border: '1px solid var(--line-strong)',
              // `--bg-0` is defined nowhere: the field was painted with an undefined token,
              // so it inherited whatever was behind it. `--bg-2` is the input ground used by
              // the rest of the instrument.
              background: 'var(--bg-2)',
              color: 'var(--ink)',
            }}
          />
          <label className="t-data-xs flex items-center gap-[6px]" style={{ color: 'var(--ink-2)' }}>
            you put in
            <input
              type="number"
              min={1}
              value={montant}
              onChange={(e) => setMontant(Math.max(1, Number(e.target.value) || 1))}
              aria-label="amount in euros"
              className="t-data-sm"
              style={{
                width: 84,
                padding: '10px 8px',
                border: '1px solid var(--line-strong)',
                background: 'var(--bg-2)',
                color: 'var(--ink)',
              }}
            />
            €
          </label>
        </div>

        <div className="flex flex-wrap gap-[8px]">
          {EXEMPLES.map((e) => (
            <button
              key={e.addr}
              onClick={() => setSaisie(e.addr)}
              className="t-data-xs"
              style={{
                padding: '5px 9px',
                border: '1px solid var(--line)',
                background: 'var(--bg-2)',
                color: 'var(--ink-2)',
                cursor: 'pointer',
              }}
            >
              {nomDe(e.addr) ? (
                <strong style={{ color: 'var(--ink)' }}>{nomDe(e.addr)}</strong>
              ) : (
                <span className="hex">{e.addr.slice(0, 10)}…</span>
              )}{' '}
              <span style={{ color: 'var(--ink-2)' }}>{e.note}</span>
            </button>
          ))}
        </div>

        {resultat?.etat === 'erreur' && (
          <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            {resultat.message}
          </p>
        )}

        {resultat?.etat === 'refus' && (
          <div className="flex flex-col gap-[6px]">
            <p className="t-data-sm m-0" style={{ color: 'var(--ink)' }}>
              No round-trip answer for this token.
            </p>
            <p className="t-data-xs m-0" style={{ color: 'var(--ink-2)' }}>
              {resultat.raison}
            </p>
          </div>
        )}

        {resultat?.etat === 'ok' && (
          <div className="flex flex-col gap-[12px]">
            <p style={{ fontSize: 28, lineHeight: 1.15, color: 'var(--ink)', margin: 0 }}>
              You put in {montant} €, {phraseEnAnglais(resultat.test, montant)}.
            </p>
            <Barre test={resultat.test} />
            <div className="flex flex-wrap gap-[16px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
              <span>buy {resultat.test.pire.achat.totalBps.toFixed(2)} bps</span>
              <span>
                sell-back {resultat.test.pire.reventePire.totalBps.toFixed(2)} bps at worst
                {!resultat.test.pire.exact &&
                  `, ${resultat.test.pire.reventeMeilleure.totalBps.toFixed(2)} at best`}
              </span>
              <span>pool {resultat.test.poolId.slice(0, 12)}…</span>
              <span>hook {resultat.test.hook.slice(0, 12)}…</span>
              <Copy text={resultat.test.hook} label="copy the hook" />
            </div>
            {FA.sens_unique && (
              <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
                The <strong>first two</strong> examples above are one-way pools: you go in for
                almost nothing and you do not come back out. Out of the{' '}
                <strong>{FA.sens_unique.pools_deux_sens.toLocaleString('en-US')}</strong> pools
                measured in both directions, there are <strong>{FA.sens_unique.pools}</strong> of
                them, over {FA.sens_unique.hooks} hooks. That is few — and saying it that way is
                better than letting a rule be inferred. The threshold that makes this list (
                {FA.sens_unique.seuil_lourd_bps} bps on the way out,{' '}
                {FA.sens_unique.seuil_plat_bps} on the way in) is a publication choice, not a
                natural border: moving it changes the list.
              </p>
            )}
            <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '70ch' }}>
              This is not an executed round trip: the two measured takes are composed, and the
              price impact of the first swap on the second is ignored. The size at which you would
              sell back is unknown, so the sell-back cost is bounded — which is why the answer is
              sometimes an interval. Everything is measured at block 50 614 000.
            </p>
          </div>
        )}

        {(resultat?.etat === 'ok' || resultat?.etat === 'refus') && <Portes jeton={jeton} />}
      </div>
    </Panel>
  )
}
