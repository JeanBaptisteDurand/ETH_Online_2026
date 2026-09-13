/**
 * UNE PAGE PAR OUTIL — et elle montre ce que l'outil PRODUIT, pas ce qu'il est.
 *
 * Chaque page porte quatre choses, dans cet ordre :
 *
 *   1. LA QUESTION, dans les mots de quelqu'un qui l'a. Pas la signature d'une fonction.
 *   2. LA SORTIE RÉELLE. Des lignes du corpus, des règlements relus, des écrans de Ledger —
 *      ce que l'outil a vraiment rendu, avec de quoi le rejouer. Une page qui décrirait sans
 *      montrer serait une brochure.
 *   3. LA DONNÉE qu'il consomme, nommée par son fichier ou sa route.
 *   4. SON ÉTAT, et quand il n'est pas prêt, POURQUOI.
 *
 * LA SIGNATURE VISUELLE. Chaque outil a son accent, pris sur la rampe de la charte, et sa
 * sortie a une forme différente : des cotations appariées pour la mesure, un journal pour le
 * péage, des écrans pour l'appareil. C'est voulu — quatorze pages identiques se lisent comme
 * une seule, et le lecteur cesse de regarder à la troisième.
 */
import { useMemo, useRef } from 'react'
import { Panel, Copy, NonLu, Replay } from './Prim'
import { FigureAppariee } from './Figure'
import { COULEUR } from './familles'
import { SUITE } from '../compte/substitution'
import { dataset } from '../lib/dataset'
import facts from '../data/facts.json'
import { OUTILS, outil, FAMILLES } from '../lib/outils'
import type { Famille } from '../lib/outils'
import { luPar, ecritPar, taille } from '../lib/donnees'
import type { Jeu as JeuT, Volume } from '../lib/donnees'

/**
 * L'accent d'un outil, pris sur sa FAMILLE et non sur son numéro.
 *
 * Bleu quand il va chercher une donnée, jaune quand il l'interprète, orange quand il change
 * quelque chose. La couleur porte donc une information — et l'orange, la seule famille qui
 * touche à l'argent de quelqu'un, se repère sans lire.
 */
const accent = (n: number): string => COULEUR[outil(n)!.famille]

const court = (a: string) => `${a.slice(0, 10)}…`
const nb = (x: number) => x.toLocaleString('fr')

/* ------------------------------------------------------ les sorties réelles */

/** 1 · MESURER — les deux cotations d'un même swap, et leur écart. */
function SortieMesurer() {
  const runs = useMemo(() => {
    return dataset.rows
      .filter((r) => r.label === 'MESURE' && r.bps !== null && r.out_with && r.out_without && r.bps > 1)
      .sort((a, b) => (b.bps ?? 0) - (a.bps ?? 0))
      .slice(0, 6)
  }, [])
  return (
    <>
      <div className="px-[16px] py-[11px] t-body t-body-muted" style={{ fontSize: 14, maxWidth: '74ch', borderTop: '1px solid var(--line)' }}>
        Six runs of the counterfactual, the largest in the corpus. On each row: the same swap
        quoted <strong style={{ color: 'var(--ink)' }}>with</strong> the hook, then with an 89-byte
        inert stub at its address. The gap <strong style={{ color: 'var(--ink)' }}>is</strong> the
        take.
      </div>
      {runs.map((r) => {
        const sens = r.zero_for_one ? '0→1' : '1→0'
        return (
          <div key={r.pool_id + r.amount_in + sens} className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex flex-wrap items-baseline gap-[10px]">
              <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>hook {court(r.hook)}</span>
              <span className="t-data-sm flex flex-wrap" style={{ gap: 12, color: 'var(--ink-2)' }}>
                <span>{sens}</span>
                <span className="meta-filet">{r.amount_in}</span>
                <span className="meta-filet">block {nb(r.block_number)}</span>
              </span>
              <span className="ml-auto t-data" style={{ color: 'var(--ink)' }}>{r.bps!.toFixed(4)} bps</span>
            </div>
            <div className="mt-[6px] grid gap-[3px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>with the hook</span>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>{r.out_with}</span>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>with the stub</span>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>{r.out_without}</span>
            </div>
            <Replay cmd={[
              'python3 apps/api/scripts/measure_one.py --rpc $RPC',
              `--block ${r.block_number} --hooks ${r.hook}`,
              `--currency0 ${r.currency0} --currency1 ${r.currency1}`,
              `--fee ${r.key_fee} --tick-spacing ${r.tick_spacing}`,
              `--zero-for-one ${r.zero_for_one} --amount-in ${r.amount_in}`,
            ].join(' ')} />
          </div>
        )
      })}
    </>
  )
}

/** 10 · PAYER À L'UNITÉ — les règlements, relus sur le mirror node. */
function SortiePayer() {
  const x = facts.x402
  if (!x) return <NonLu quoi="facts.x402" />
  return (
    <>
      <L k="settled and re-read" v={<>{String(x.regles)} <span style={{ color: 'var(--ink-2)' }}>of {String(x.vus)} attempted, {String(x.par_keyring)} signed from the keyring</span></>} />
      <L k="network" v={String(x.reseau)} />
      <L k="facilitator" v={String(x.facilitateur)} />
      <L k="token" v={String(x.jeton)} />
      <L k="unit price" v={`${String(x.prix_unite_usd)} USDC per measurement`} />
      <L k="payer → payee" v={`${String(x.payeur)} → ${String(x.encaisseur)}`} />
      <div className="px-[16px] py-[11px] t-body t-body-muted" style={{ borderTop: '1px solid var(--line)', fontSize: 14, maxWidth: '72ch' }}>
        A settlement is counted only if the <strong style={{ color: 'var(--ink)' }}>mirror node</strong> returns
        it. The server that says “paid” is not enough: it is the one being checked.
      </div>
    </>
  )
}

/** 13 · PROUVER — l'identité d'agent, recalculable. */
function SortieProuver() {
  const a = facts.agent
  if (!a) return <NonLu quoi="facts.agent" />
  return (
    <>
      <L k="UAID" v={<span style={{ wordBreak: 'break-all' }}>{String(a.uaid)}</span>} />
      <L k="standard" v={`${String(a.standard)}, ${String(a.spec)}`} />
      <L k="Hedera topic" v={`${String(a.topic)}, message #${String(a.sequence)}`} />
      <L k="state" v={String(a.etat)} />
      <div className="px-[16px] py-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-data-sm mb-[5px]" style={{ color: 'var(--ink-2)' }}>the six canonical fields, hashed with SHA-384 then encoded in base58</div>
        <div className="t-data-sm" style={{ color: 'var(--ink-2)', wordBreak: 'break-all', fontFamily: 'var(--mono)' }}>
          {String(a.canonical_json)}
        </div>
        <div className="mt-[6px]"><Copy text={String(a.canonical_json)} label="copy the canonical JSON" /></div>
      </div>
    </>
  )
}

/** 14 · ATTESTER — ce qui est écrit on-chain. */
function SortieAttester() {
  const t = facts.attestations
  if (!t) return <NonLu quoi="facts.attestations" />
  return (
    <>
      <L k="contract" v={String(t.contrat)} />
      <L k="written on-chain" v={<><strong style={{ color: 'var(--ink)' }}>{String(t.ecrits)}</strong> <span style={{ color: 'var(--ink-2)' }}>of {String(t.tentes)} transactions sent</span></>} />
      <L k="computed" v={<>{String(t.calcules)} <span style={{ color: 'var(--ink-2)' }}>, {String(t.ecartes)} set aside for lack of a measurement, not written as zero. The gap between {String(t.calcules)} and {String(t.ecrits)} is waiting on gas, and it is published.</span></>} />
      <L k="corpus digest" v={<span style={{ wordBreak: 'break-all' }}>{String(t.corpus_digest)}</span>} />
      <div className="px-[16px] py-[9px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
        Another contract can read these values. It is the only surface of the product a machine
        consumes without asking us for permission.
      </div>
    </>
  )
}

/** 9 · APPROUVER — les écrans rendus sur l'appareil. */
function SortieApprouver() {
  const l = facts.ledger
  if (!l) return <NonLu quoi="facts.ledger" />
  return (
    <>
      <L k="device" v={`${String(l.appareil)}${l.physique ? '' : ' (emulated — and we say so)'}`} />
      <L k="verdict rendered" v={String(l.verdict)} />
      <L k="screens" v={`${String(l.ecrans)}, EIP-712 type ${String(l.type_712)}, ${String(l.champs_712)} fields`} />
      <div className="px-[16px] py-[9px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
        The report is encoded in EIP-712 and rendered <strong style={{ color: 'var(--ink)' }}>field by
        field</strong> on the device: you do not sign an opaque hash, you read what you sign.
      </div>
    </>
  )
}

/** 6 et 7 · LA PORTE DE REMPLACEMENT — les six états, et leur poids réel. */
function SortiePorte() {
  const s = facts.sens_unique
  return (
    <>
      <div className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-body t-body-muted" style={{ fontSize: 14, maxWidth: '72ch' }}>
          Of the <strong style={{ color: 'var(--ink)' }}>125 072</strong> rows in the corpus,
          <strong style={{ color: 'var(--ink)' }}> 124 704</strong> answer “there is only one
          door” — <strong>99.71%</strong>. Fifteen clear the one-basis-point threshold, across
          four pool pairs; the best takes you from <strong>295.59 to 216.92 bps</strong>.
          None exceeds 100 bps.
        </div>
      </div>
      {s && (
        <L k="one-way pools" v={<>{String(s.pools)} across {String(s.hooks)} hooks <span style={{ color: 'var(--ink-2)' }}>— free on the way in, closed on the way out</span></>} />
      )}
      <div className="px-[16px] py-[11px] t-body t-body-muted" style={{ borderTop: '1px solid var(--line)', fontSize: 14, maxWidth: '72ch' }}>
        “There is only one door” is an <strong style={{ color: 'var(--ink)' }}>answer</strong>, not
        a failed search. It is the sentence no aggregator says.
      </div>
    </>
  )
}

/** 7 · SUBSTITUER — l'actionnable, et ce que Permit2 change vraiment. */
function SortieSubstituer() {
  return (
    <>
      <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-body t-body-muted" style={{ fontSize: 14, maxWidth: '72ch' }}>
          This is the piece that turns a verdict into a <strong style={{ color: 'var(--ink)' }}>decision</strong>.
          The site already has everything: the token address, the amount, the target door. It builds
          the replacement transaction and has it signed — <strong style={{ color: 'var(--ink)' }}>it
          never sends it</strong>.
        </div>
      </div>

      <L k="what it returns" v={<code style={{ fontFamily: 'var(--mono)' }}>{'{ to, data, value }'}</code>} />
      <L k="output floor" v={<>taken from a <strong style={{ color: 'var(--ink)' }}>live quote</strong>, minus 50 bps of tolerance <span style={{ color: 'var(--ink-2)' }}>— never from the corpus, which is pinned to a block</span></>} />
      <L k="deadline" v={<>now + 20 minutes <span style={{ color: 'var(--ink-2)' }}>— the default was 0xffffffff, that is 7 February 2106</span></>} />

      <div className="px-[16px] pt-[12px] pb-[8px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
        <div className="t-data-sm" style={{ color: 'var(--ink)' }}>Permit2 — one signature instead of two transactions</div>
        <div className="t-data-sm mt-[6px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65, maxWidth: '80ch' }}>
          Without it, replacing a transaction takes <strong style={{ color: 'var(--ink)' }}>two</strong>:
          an <code style={{ fontFamily: 'var(--mono)' }}>approve</code> of the token to the router,
          then the swap. With it, you <strong style={{ color: 'var(--ink)' }}>sign off-chain</strong> —
          free, and a signature cannot fail — and the router presents that signature itself, in the
          same transaction as the swap. One send, one signature.
        </div>
      </div>

      <L k="command list" v={<><code style={{ fontFamily: 'var(--mono)' }}>0x0a10</code> <span style={{ color: 'var(--ink-2)' }}>— PERMIT2_PERMIT then V4_SWAP. Order matters: a swap presented before its permit would fail for lack of allowance.</span></>} />
      <L k="EIP-712 domain" v={<><code style={{ fontFamily: 'var(--mono)' }}>EIP712Domain(string name,uint256 chainId,address verifyingContract)</code></>} />

      <div className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <div className="t-data" style={{ color: 'var(--ink)' }}>what Permit2 does not spare you</div>
        <div className="t-data-sm mt-[5px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '80ch' }}>
          The token must have been approved <strong style={{ color: 'var(--ink)' }}>to the Permit2
          contract</strong>, once and for all. That one is a real transaction, and the user may
          never have made it. We do not guess it: the two on-chain reads name it, and the screen
          asks for it BEFORE offering a signature that would fail. Promising “a single signature”
          to someone who has not approved Permit2 would be false.
        </div>
      </div>

    </>
  )
}

/** 4 · COMPRENDRE — ce que la confrontation à une source indépendante donne. */
function SortieComprendre() {
  const g = facts.graph
  if (!g) return <NonLu quoi="facts.graph" />
  return (
    <>
      <L k="source cross-checked" v={`${String(g.nom)}, ${String(g.subgraph)}`} />
      <L k="pools in the census" v={<>{nb(Number(g.pools_du_recensement))} <span style={{ color: 'var(--ink-2)' }}>of which {nb(Number(g.retrouves))} found again — {String(g.part)}</span></>} />
      <L k="volume observed" v={`${String(g.volume_usd)} USD`} />
      <L k="TVL" v={`${String(g.tvl_usd)} USD`} />
    </>
  )
}

/**
 * UNE LIGNE « clé : valeur ».
 *
 * `flex-wrap` et `minWidth: 0` ne sont pas de la décoration : sans eux, une valeur qui
 * contient un mot insécable — un chemin de fichier, une URL, un identifiant de subgraph —
 * pousse la LIGNE au-delà de la page, et c'est la PAGE ENTIÈRE qui défile de côté. Onze des
 * quatorze pages outil débordaient à 400 px pour cette seule raison.
 */
/**
 * LE COMPTE DES ETATS D'ENVOI, derive de `SUITE` et de rien d'autre.
 *
 * L'ecran se contredisait : la section disait « 10 etats » et le champ `etat`, declare dans
 * `lib/outils.ts:307`, disait « PRET, ou l'un des huit ». d008 tranche en faveur de ce qui est
 * declare dans l'implementation, et l'implementation en porte dix, verifies par
 * `lib/substituer.test.ts`. `lib/` appartient a l'equipier : la reecriture se fait donc ici,
 * au rendu, a partir de la meme source que la liste affichee — un seul compte, tenu deux fois.
 */
const N_ETATS = Object.keys(SUITE).length

const CHAMP_REECRIT: Record<string, string> = {
  etat: `PRET, or one of the ${N_ETATS - 1} other states that say what is missing`,
}

/** Un titre de section commence par une majuscule et rien d'autre : ni capitales espacees,
    ni ordinal sur ce qui n'est pas une sequence. */
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

const L = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[3px] px-[16px] py-[6px]" style={{ borderTop: '1px solid var(--line)' }}>
    <span className="t-data-sm" style={{ color: 'var(--ink-2)', minWidth: 120, flexShrink: 0 }}>{k}</span>
    <span className="t-data-sm" style={{ color: 'var(--ink-2)', flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
  </div>
)

/** Les outils qui ont une sortie REELLE a montrer, et non seulement des champs declares. */
const aSortie = (n: number): boolean => [1, 4, 6, 7, 9, 10, 13, 14].includes(n)

/** La sortie propre à chaque outil, quand elle existe. */
function Sortie({ n }: { n: number }) {
  switch (n) {
    case 1: return <SortieMesurer />
    case 4: return <SortieComprendre />
    case 6: return <SortiePorte />
    case 7: return <SortieSubstituer />
    case 9: return <SortieApprouver />
    case 10: return <SortiePayer />
    case 13: return <SortieProuver />
    case 14: return <SortieAttester />
    default: return null
  }
}

/* --------------------------------- les trois temps d'une page outil */

/**
 * ENTRÉE → EXÉCUTION → SORTIE, mais pas avec les mêmes mots selon la famille.
 *
 * « Donnée d'entrée » convient à un outil d'analyse, qui lit un fichier. Il ne convient pas à
 * un outil de collecte, qui va chercher ce qui n'existait pas, ni à un outil d'action, dont
 * le point n'est pas ce qu'il rend mais CE QU'IL CHANGE. Trois vocabulaires, donc, pour que
 * la page dise vraiment ce que l'outil fait.
 */
const TEMPS: Record<Famille, { entree: string; milieu: string; sortie: string }> = {
  collecte: { entree: 'what it goes and fetches', milieu: 'it runs', sortie: 'what it brings back' },
  analyse: { entree: 'input data', milieu: 'it runs', sortie: 'output data' },
  action: { entree: 'what it reads before acting', milieu: 'the action', sortie: 'what changes' },
}

const INV = (facts as { inventaire?: Record<string, Volume> }).inventaire ?? {}

/** Un jeu de données, avec son volume statté au build — « non lu » quand le fichier manque. */
function Jeu({ j, sens }: { j: JeuT; sens: 'reads' | 'writes' }) {
  const v = INV[j.cle]
  return (
    <div className="px-[16px] py-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-baseline gap-[8px]">
        <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>{sens}</span>
        <span className="t-data-sm" style={{ color: 'var(--ink)' }}>{j.nom}</span>
        {v ? (
          <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            {taille(v.octets)}{v.n !== null && v.unite ? `, ${nb(v.n)} ${v.unite}` : ''}
          </span>
        ) : (
          <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>not read</span>
        )}
        <code className="ml-auto" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)', wordBreak: 'break-all' }}>{v?.fichier ?? j.cle}</code>
      </div>
      <div className="t-data-sm mt-[4px]" style={{ color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: '82ch' }}>{j.quoi}</div>
      <div className="t-data-sm mt-[4px]" style={{ color: 'var(--ink-2)' }}>produced by <code style={{ fontFamily: 'var(--mono)' }}>{j.produit}</code></div>
    </div>
  )
}

/* ------------------------------------------------- ce que l'outil INGÈRE */

/**
 * L'ENTRÉE : ce qui n'est pas un fichier d'abord, les fichiers ensuite, avec leur volume.
 *
 * Une page qui montrerait seulement la sortie laisserait croire que le nombre sort de nulle
 * part. Le lecteur doit voir les deux bouts : ces lignes-là entrent, ce résultat-là sort.
 */
function Ingere({ n }: { n: number }) {
  const o = outil(n)!
  const jeux = luPar(n)
  const echantillon = useMemo(() => {
    // Les outils qui lisent le corpus montrent des lignes du corpus. Les autres montrent le
    // fichier qu'ils lisent, et son volume — jamais une ligne inventée pour faire joli.
    if ([1, 2, 3, 5, 6, 7].includes(n)) {
      return dataset.rows
        .filter((r) => r.label === 'MESURE' && r.bps !== null)
        .slice(0, 5)
    }
    return []
  }, [n])

  return (
    <>
      {o.entree.map((e) => (
        <div key={e} className="px-[16px] py-[8px] flex gap-[12px]" style={{ borderTop: '1px solid var(--line)' }}>
          {/* Un port, pas une fleche collee au texte : la fleche est le tell que
              frontend-design nomme, et elle ne dit rien de plus que le filet. */}
          <span
            aria-hidden="true"
            style={{ width: 7, height: 7, background: accent(n), flex: 'none', marginTop: 7 }}
          />
          <span className="t-body t-body-muted" style={{ fontSize: 14, maxWidth: '76ch' }}>
            {e}
          </span>
        </div>
      ))}
      {jeux.map((j) => <Jeu key={j.cle} j={j} sens="reads" />)}
      {jeux.length === 0 && (
        <div className="px-[16px] py-[7px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          no file from the repository: everything it reads is read <strong style={{ color: 'var(--ink)' }}>on
          the chain</strong>, at the moment it is asked for it
        </div>
      )}
      {echantillon.length > 0 && (
        // IMPORTANCE 3 : la rubrique 5 la veut « derriere une interaction : se deplie, et le
        // compte total reste affiche pour que la troncature se voie ». Le compte est donc dans
        // le resume, ferme comme ouvert.
        <details>
        <summary
          className="t-data px-[16px] py-[12px] cursor-pointer list-none"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}
        >
          expand five rows of the corpus — out of {nb(dataset.totals.rows)} in total
        </summary>
        <div tabIndex={0} role="region" aria-label="corpus sample" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['hook', 'pool', 'size', 'direction', 'LP fee', 'bps', 'label'].map((h, i) => (
                  <th key={h} scope="col" className="t-data-sm px-[10px] py-[5px]"
                    style={{ color: 'var(--ink-2)', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {echantillon.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="t-data-sm px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>{court(r.hook)}</td>
                  <td className="t-data-sm px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>{court(r.pool_id)}</td>
                  <td className="t-data-sm px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>{r.amount_in}</td>
                  <td className="t-data-sm px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>{r.zero_for_one ? '0→1' : '1→0'}</td>
                  <td className="t-data-sm px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-2)' }}>
                    {r.stored_lp_fee === null ? '—' : (r.stored_lp_fee / 100).toFixed(2)}
                  </td>
                  <td className="t-data-sm px-[10px] py-[5px] text-right" style={{ color: 'var(--ink)' }}>{r.bps!.toFixed(4)}</td>
                  <td className="t-data-sm px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-2)' }}>{r.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-[16px] py-[6px] t-data-sm" style={{ color: 'var(--ink-2)' }}>
            five rows out of {nb(dataset.totals.rows)} — a sample, and the count is stated so the
            truncation shows
          </div>
        </div>
        </details>
      )}
    </>
  )
}

/* ----------------------------------------------- ce que l'outil EXÉCUTE */

/** Les étapes, numérotées, dans l'ordre où elles arrivent — et ce que ça coûte. */
function Execute({ n }: { n: number }) {
  const o = outil(n)!
  const c = COULEUR[o.famille]
  return (
    <>
      {o.execute.map((e, i) => (
        <div key={e} className="px-[16px] py-[7px] flex gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="t-data-sm" style={{ color: c, minWidth: 16 }}>{i + 1}</span>
          <span className="t-data-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: '82ch' }}
            dangerouslySetInnerHTML={{ __html: e.replace(/\b([A-ZÉÈÊÀÇ]{4,}(?:_[A-Z0-9]+)*)\b/g, '<strong style="color:var(--ink)">$1</strong>') }} />
        </div>
      ))}
    </>
  )
}

/* --------------------------------------------------- ce que l'outil REND */

/** Les champs rendus, nommés, puis la sortie réelle quand l'outil en a une à montrer. */
function Rend({ n }: { n: number }) {
  const o = outil(n)!
  const ecrits = ecritPar(n)
  return (
    <>
      {o.sortie.map((c) => (
        <div key={c.champ} className="px-[16px] py-[6px] flex flex-wrap items-baseline gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
          <code style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)', minWidth: 120, wordBreak: 'break-all' }}>{c.champ}</code>
          <span className="t-data-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: '78ch', flex: '1 1 200px', minWidth: 0 }}>
            {n === 7 && CHAMP_REECRIT[c.champ] ? CHAMP_REECRIT[c.champ] : c.quoi}
          </span>
        </div>
      ))}
      {ecrits.map((j) => <Jeu key={j.cle} j={j} sens="writes" />)}
    </>
  )
}
/* ---------------------------------------------- le bandeau d'onglets, un par outil */

/**
 * LES QUATORZE ONGLETS — la « redirection » de d002 : l'orchestrateur passe d'un outil a
 * l'autre, et le bandeau reste sous la main pendant tout le defilement.
 *
 * Ce sont des LIENS : un onglet s'ouvre dans un nouvel onglet de navigateur, son adresse se
 * copie, et le bouton « precedent » marche. Le clavier les parcourt aux fleches, comme un
 * vrai jeu d'onglets, et l'onglet actif porte le soulignement de SA famille — la couleur
 * redit ce que la carte a deja dit.
 */
function Onglets({ n, surOutil }: { n: number; surOutil?: (x: number) => void }) {
  const bande = useRef<HTMLElement | null>(null)

  const auClavier = (e: React.KeyboardEvent<HTMLElement>) => {
    const cles = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!cles.includes(e.key)) return
    e.preventDefault()
    const i = OUTILS.findIndex((o) => o.n === n)
    const suivant =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? OUTILS.length - 1
          : (i + (e.key === 'ArrowRight' ? 1 : OUTILS.length - 1)) % OUTILS.length
    const cible = OUTILS[suivant]!
    if (surOutil) surOutil(cible.n)
    else window.location.hash = `/outil/${cible.n}`
    // Le focus suit la selection : sans ca, la fleche suivante repartirait de l'ancien onglet.
    window.requestAnimationFrame(() => {
      bande.current?.querySelector<HTMLAnchorElement>(`[data-outil="${cible.n}"]`)?.focus()
    })
  }

  return (
    /* UNE NAVIGATION, PAS UN JEU D'ONGLETS ARIA. Chaque entree CHANGE DE ROUTE : le motif
       `tablist` promet a un lecteur d'ecran un panneau dans la meme page, et il n'y en a pas.
       On garde donc des liens, `aria-current` sur celui qu'on lit, tous atteignables au
       clavier — et les fleches restent, comme raccourci. */
    <nav
      ref={bande}
      aria-label="the fourteen tools"
      onKeyDown={auClavier}
      className="onglets flex"
    >
      {OUTILS.map((x) => {
        const actif = x.n === n
        return (
          <a
            key={x.n}
            data-outil={x.n}
            aria-current={actif ? 'page' : undefined}
            href={`#/outil/${x.n}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              if (!surOutil) return
              e.preventDefault()
              surOutil(x.n)
            }}
            className="onglet no-underline flex items-center gap-[8px] px-[12px]"
            style={{
              minHeight: 44,
              whiteSpace: 'nowrap',
              color: actif ? 'var(--ink)' : 'var(--ink-2)',
              borderBottomColor: actif ? COULEUR[x.famille] : 'transparent',
              background: actif ? 'var(--surface-1)' : 'transparent',
            }}
            title={x.question}
          >
            {/* LE REPERE DE FAMILLE, avant le numero : la couleur se lit sans lire, et elle
                dit la meme chose que sur la carte. */}
            <span
              aria-hidden="true"
              style={{ width: 8, height: 8, background: COULEUR[x.famille], flex: 'none', opacity: actif ? 1 : 0.65 }}
            />
            <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>{x.n}</span>
            <span className="t-body" style={{ fontSize: 14 }}>{x.nom}</span>
          </a>
        )
      })}
    </nav>
  )
}

/* --------------------------------- 1 · la figure appariee, en grand */

/**
 * LA PAGE DE L'OUTIL 1 porte l'idee du projet en une image : le meme swap, cote deux fois.
 *
 * On prend la mesure la plus forte du corpus — celle ou le hook prend le plus — et on ramene
 * les deux sorties sur une base de 100 recus SANS le hook. Les deux montants bruts restent
 * ecrits dessous, en wei : rien n'est arrondi en silence. C'est le seul `display` de cet
 * ecran, et il n'y a pas de hero au-dessus pour le lui disputer.
 */
function FigureMesure() {
  const paire = useMemo(() => {
    // LA MEDIANE, pas le maximum. Le maximum du corpus est un pool ou il ne sort presque
    // rien : 76 wei contre 1 609 989, soit 0,00 sur 100 — vrai, et illisible comme figure.
    // La mediane des mesures qui prelevent plus d'un point de base montre ce que l'outil
    // rend d'ordinaire, et le libelle de l'axe dit lequel des 125 072 releves c'est.
    const mesures = dataset.rows
      .filter((x) => x.label === 'MESURE' && x.bps !== null && x.bps > 1 && x.out_with && x.out_without)
      .sort((a, b) => (a.bps ?? 0) - (b.bps ?? 0))
    const r = mesures[Math.floor(mesures.length / 2)]
    if (!r) return null
    const avec = BigInt(r.out_with!)
    const sans = BigInt(r.out_without!)
    if (sans === 0n) return null
    return { r, sur100: Number((avec * 1000000n) / sans) / 10000 }
  }, [])
  if (!paire) return <NonLu quoi="a corpus measurement with both of its outputs" />
  const { r, sur100 } = paire
  return (
    <>
      <FigureAppariee
        taille="display"
        axe={`out of 100 received without the hook, what the same swap returns with it — the corpus median above one basis point, pool ${court(r.pool_id)}, size ${r.amount_in}, block ${nb(r.block_number)}`}
        series={[
          {
            libelle: 'quoted with the hook in place',
            valeur: sur100,
            texte: sur100.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            provenance: <span>out_with {r.out_with}</span>,
          },
          {
            libelle: 'quoted against an 89-byte inert stub',
            valeur: 100,
            texte: '100.00',
            reference: true,
            provenance: <span>out_without {r.out_without}</span>,
          },
        ]}
        ecart={r.bps!.toFixed(2)}
        unite="bps, what the hook took"
        glose={
          <>
            The PoolKey contains the hook’s address: the same pool without its hook does not
            exist. So we do not change the pool, we replace the hook’s bytecode with an inert
            stub, and we quote twice. The gap <em>is</em> the take.
          </>
        }
      />
      <div className="px-[16px] pb-[16px]">
        <Replay cmd={[
          'python3 apps/api/scripts/measure_one.py --rpc $RPC',
          `--block ${r.block_number} --hooks ${r.hook}`,
          `--currency0 ${r.currency0} --currency1 ${r.currency1}`,
          `--fee ${r.key_fee} --tick-spacing ${r.tick_spacing}`,
          `--zero-for-one ${r.zero_for_one} --amount-in ${r.amount_in}`,
        ].join(' ')} note="the measurement above, replayable as is" />
      </div>
    </>
  )
}

/* --------------------------------- 7 · les dix etats d'envoi, tous visibles */

/**
 * LES ETATS DE LA SUBSTITUTION, tous a l'ecran, et un seul qui laisse envoyer.
 *
 * `SUITE` (compte/substitution.ts) est la source : dix etats, dont quatre menent quelque part.
 * Un etat masque ferait croire a une etape ratee ; un bouton actif sur un autre que `PRET`
 * signerait au mieux une transaction qui revert, au pire une transaction sans plancher de
 * prix. Le bouton est donc ici DESACTIVE avec sa raison — cette page decrit l'outil, elle ne
 * tient pas de portefeuille : la vraie commande vit dans le panneau 16.
 */
function EtatsEnvoi() {
  const etats = Object.entries(SUITE) as [string, string | null][]
  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      <p className="m-0 px-[16px] pt-[12px] pb-[10px] t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '76ch' }}>
        {N_ETATS} send states, and only one allows signing: <strong style={{ color: 'var(--ink)' }}>PRET</strong>.
        The other {N_ETATS - 1} stay visible with what they are missing — a hidden state would
        suggest a step went wrong.
      </p>
      <ul className="m-0 p-0" style={{ listStyle: 'none' }}>
        {etats.map(([e, suite]) => {
          const pret = e === 'PRET'
          return (
            <li
              key={e}
              className="px-[16px] py-[10px] flex flex-wrap items-center gap-x-[16px] gap-y-[8px]"
              style={{ borderTop: '1px solid var(--line)', background: pret ? 'var(--bg-1)' : 'transparent' }}
            >
              <span
                className="t-data"
                style={{ color: pret ? 'var(--ink)' : 'var(--ink-2)', minWidth: 220 }}
              >
                {e}
              </span>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)', flex: '1 1 260px', minWidth: 0 }}>
                {suite ?? 'nothing to click — a read is missing, and the state names it'}
              </span>
              <button
                type="button"
                disabled
                aria-label={pret ? `${e} — sign, without sending` : `${e} — inactive`}
                className="t-data"
                style={{
                  padding: '8px 12px',
                  minHeight: 44,
                  border: `1px solid ${pret ? 'var(--line-strong)' : 'var(--line)'}`,
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  cursor: 'not-allowed',
                }}
              >
                {pret ? 'sign, without sending' : 'inactive'}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="m-0 px-[16px] py-[12px] t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '76ch', borderTop: '1px solid var(--line)' }}>
        On this page all {N_ETATS} buttons are inactive, and the reason is the same for every one
        of them: no proposal was built here. The real control lives in panel 16 of the instrument,
        where a wallet is connected — and there too the transaction is built and signed,{' '}
        <strong style={{ color: 'var(--ink)' }}>never sent</strong> by us.
      </p>
    </div>
  )
}

/* --------------------------------------------------------------- la page */

export function OutilPanel({ n, surOutil }: { n: number; surOutil?: (n: number) => void }) {
  const o = outil(n)
  if (!o) return null
  const c = accent(o.n)
  const etat = o.etat === 'pret' ? 'ready' : o.etat === 'en_attente' ? 'pending' : 'offline'
  return (
    <>
      {/* LE NOM ET LA QUESTION — le titre de page, une fois, en tete de route. */}
      <header className="px-[16px] pt-[8px] pb-[14px]">
        <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[6px] pb-[10px]">
          <span className="t-body flex items-center gap-[8px]" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
            <span aria-hidden="true" className="nuancier" style={{ background: c }} />
            {FAMILLES[o.famille].nom}
          </span>
          <span className="t-body meta-filet" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
            {etat}
          </span>
          <span className="t-body meta-filet" style={{ fontSize: 14, color: 'var(--ink-2)' }}>
            {o.cout}
          </span>
        </div>
        <h1 className="t-display m-0" style={{ color: 'var(--ink)', maxWidth: '20ch' }}>
          <span style={{ color: 'var(--ink-3)', paddingRight: 18 }}>{o.n}</span>
          {o.nom}
        </h1>
        <p
          className="t-title m-0 pt-[14px]"
          style={{ fontSize: '1.25rem', color: 'var(--ink)', maxWidth: '52ch' }}
        >
          « {o.question} »
        </p>
        <p className="t-body t-body-muted m-0 pt-[12px]" style={{ maxWidth: '68ch' }}>
          {o.rend}
        </p>
        {/* La glose de la famille : une phrase, pas une formule « MOT — fragment ». */}
        <p className="t-body m-0 pt-[8px]" style={{ fontSize: 14, color: 'var(--ink-2)', maxWidth: '68ch' }}>
          It is a {FAMILLES[o.famille].nom} tool: {FAMILLES[o.famille].quoi}.
        </p>
      </header>

      <Onglets n={o.n} surOutil={surOutil} />

      {/* LA SORTIE REELLE D'ABORD, sur les quatorze pages et pas seulement sur la premiere.
          La rubrique 5 la classe importance 1 ; l'outil 7 la posait a y = 2 215, derriere deux
          ecrans d'importance 2 — l'ordre exact contraire de ce que le document demande. */}
      {aSortie(o.n) && (
        <Panel index={`outil-${o.n}-sortie`} title={cap(TEMPS[o.famille].sortie)}>
          {/* Pour l'outil 7, LES ETATS d'abord : c'est eux la sortie reelle, et ce que le
              document classe importance 1. La prose sur Permit2 explique, elle ne montre pas. */}
          {o.n === 7 && <EtatsEnvoi />}
          {o.n === 1 ? <FigureMesure /> : <Sortie n={o.n} />}
        </Panel>
      )}

      <Panel index={`outil-${o.n}-entree`} title={cap(TEMPS[o.famille].entree)}>
        <Ingere n={o.n} />
      </Panel>
      <Panel index={`outil-${o.n}-execution`} title={cap(TEMPS[o.famille].milieu)} meta={[o.cout]}>
        <Execute n={o.n} />
      </Panel>
      <Panel index={`outil-${o.n}-champs`} title="The fields it returns">
        <Rend n={o.n} />
      </Panel>

      <Panel index={`outil-${o.n}-reperes`} title="Where it lives, in the repository">
        {o.routes.length > 0 && (
          <L k="routes" v={<span className="flex flex-wrap gap-[12px]">{o.routes.map((r) => (
            <code key={r} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', wordBreak: 'break-all' }}>{r}</code>
          ))}</span>} />
        )}
        <L k="the code" v={<span className="flex flex-wrap gap-[12px]">{o.code.map((d) => (
          <code key={d} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', wordBreak: 'break-all' }}>{d}</code>
        ))}</span>} />
        <L k="access" v={<span className="flex flex-wrap gap-[12px]">{o.acces.map((a) => <span key={a}>{a}</span>)}</span>} />
        {o.panneaux.length > 0 && (
          <L k="already shown in" v={`panel ${o.panneaux.join(', ')}`} />
        )}
      </Panel>

      {o.pourquoi && (
        <div className="px-[16px] py-[18px]" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="t-title" style={{ fontSize: '1.0625rem', color: 'var(--ink)' }}>
            Why it is not ready
          </div>
          <div className="t-body t-body-muted mt-[8px]" style={{ fontSize: 14, maxWidth: '72ch' }}
            dangerouslySetInnerHTML={{ __html: o.pourquoi.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink)">$1</strong>') }} />
        </div>
      )}
    </>
  )
}
