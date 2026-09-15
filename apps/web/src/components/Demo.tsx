/**
 * LA DEMONSTRATION EN DIRECT (#/demo) — deux actes, quatre etapes chacun.
 *
 *   acte 1  « ne signe pas »  : un swap part vers la pire porte du corpus. La garde le lit
 *                               AVANT la signature, en tire la PoolKey donc le hook, et dit
 *                               ce qu'il prend. Aucune autre porte ne fait cet echange :
 *                               l'ecran ne propose rien, il demande. On refuse sur l'appareil.
 *   acte 2  « il y a mieux »  : un swap ETH -> USDC. Une autre porte, mesuree au meme bloc,
 *                               au meme sens et a la meme taille, prend moins. La garde
 *                               CONSTRUIT le remplacement, ne l'envoie jamais, et le rend au
 *                               portefeuille. Le portefeuille signe, le fork execute.
 *
 * QUATRE REGLES QUI TIENNENT TOUT L'ECRAN.
 *
 *   1. AUCUN NOMBRE N'EST ECRIT ICI. Chaque chiffre vient du corpus embarque (par
 *      ../demo/scenario.ts et ../demo/table.ts) ou d'une reponse du service. src/lib/
 *      demo.test.ts le verifie, comme facts.test.ts le fait pour les panneaux 08 a 12 : une
 *      vitrine est exactement l'endroit ou un chiffre faux passe le mieux.
 *   2. UNE ABSENCE DE MESURE S'AFFICHE « unknown », JAMAIS ZERO. Une porte non mesuree n'est
 *      pas une porte gratuite : elle est inconnue.
 *   3. RIEN N'EST REJOUE. L'ecran de l'appareil est un PNG servi en direct ; s'il ne charge
 *      pas, la page le DIT et ne montre rien. Le service peut etre injoignable : la page
 *      reste lisible, parce que le corpus et le decodage ne demandent personne.
 *   4. LES DIVERGENCES SONT AFFICHEES. Le service publie les endroits ou le scenario annonce
 *      autre chose que ce que le corpus mesure. On les montre : c'est ce qui permet a un tiers
 *      de verifier que le chiffre a l'ecran est celui de la mesure, et non celui de l'histoire.
 *
 * LE DECODAGE, LA CONSULTATION, LE VERDICT, LA COMPARAISON ET LA CONSTRUCTION viennent tous de
 * packages/guard — calldata.ts, poolkey.ts, table.ts, verdict.ts, alternative.ts, envoi.ts.
 * Ce fichier n'est qu'un ecran : il n'a aucun jugement a lui.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Absence, Copy, Replay } from './Prim'
import { Bouton, EtatNomme } from './Substituer'
import { AFFICHAGE } from '../compte/substitution'
import { ecouterPortefeuilles, type PortefeuilleAnnonce } from '../compte/api'
import { chainName, fmtBlock, groupDigits, replayCommand, shortAddr } from '../lib/format'
import { MONNAIES_DE_COTATION } from '../lib/exit'
import { acteStop, acteSubstitution, type Acte, type Porte } from '../demo/scenario'
import { tableDuCorpus } from '../demo/table'
import {
  COMMAND_PERMIT2_PERMIT,
  COMMAND_V4_SWAP,
  ZERO_ADDRESS,
  chercherAlternative,
  consult,
  decodeUniversalRouterCalldata,
  gradeConsultation,
  thresholdsFor,
  transactionDeRemplacement,
} from '../demo/garde.mjs'
import type {
  Alternative,
  Consultation,
  DecodeResult,
  Envoi,
  GuardTable,
  SwapLeg,
  Verdict,
} from '../demo/garde.mjs'
import {
  CODE_REFUS_UTILISATEUR,
  PONT,
  SPECULOS,
  ajouterEtBasculer,
  appuyer,
  approuver,
  comptes,
  envoyer,
  estRefus,
  lireEtat,
  lireSoldes,
  preparer,
  recu,
  revenir,
  urlEcran,
  type Approbation,
  type Bouton as BoutonAppareil,
  type EtatDemo,
  type Fournisseur,
  type Preparation,
  type Recu,
  type Refus,
  type Soldes,
  type TransactionPrete,
} from '../demo/pont'

/* --------------------------------------------------------------- les primitifs */

/** Une valeur qu'aucune mesure ne porte. Elle se DIT ; un blanc se lirait zero. */
const Inconnu = ({ quoi }: { quoi: string }) => (
  <span className="t-data-xs" style={{ color: 'var(--ink-2)' }} title={`no measurement: ${quoi}`}>
    unknown
  </span>
)

/** Une ligne « clef / valeur », la meme forme que le panneau 16 de l'instrument. */
function L({ k, v, fort = false }: { k: string; v: React.ReactNode; fort?: boolean }) {
  return (
    <div
      className="flex items-baseline gap-[9px] px-[11px] py-[5px]"
      style={{ borderTop: '1px solid var(--line)', minWidth: 0 }}
    >
      <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 92, flex: 'none' }}>
        {k}
      </span>
      <span
        className="t-data-xs"
        style={{ color: fort ? 'var(--ink)' : 'var(--ink-2)', overflowWrap: 'anywhere', minWidth: 0 }}
      >
        {v}
      </span>
    </div>
  )
}

/** Une etape. L'ordinal est une SEQUENCE ici : quatre gestes, dans cet ordre. */
function Etape({ n, sur, titre, children }: { n: number; sur: number; titre: string; children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col"
      style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', minWidth: 0 }}
    >
      <header className="px-[11px] pt-[9px] pb-[7px] flex items-baseline gap-[8px]">
        <span className="t-label" style={{ color: 'var(--m-4)', flex: 'none' }}>
          {String(n).padStart(2, '0')}/{String(sur).padStart(2, '0')}
        </span>
        <h3 className="t-label m-0" style={{ color: 'var(--ink)' }}>
          {titre}
        </h3>
      </header>
      <div className="flex flex-col" style={{ minWidth: 0 }}>
        {children}
      </div>
    </section>
  )
}

const TON_VERDICT: Record<Verdict, string> = {
  ok: 'var(--ink-2)',
  warn: 'var(--m-5)',
  block: 'var(--m-3)',
}

/** Le nom d'une monnaie quand le corpus en connait un, son adresse courte sinon. */
const nomMonnaie = (a: string): string => MONNAIES_DE_COTATION[a.toLowerCase()] ?? shortAddr(a)

/**
 * La liste de commandes de l'Universal Router, DECODEE octet par octet.
 *
 * Elle n'est pas ecrite : elle est lue dans le calldata que le portefeuille recevrait. C'est
 * toute la difference entre MONTRER l'ordre des commandes et l'affirmer. Le bit 0x80 est
 * FLAG_ALLOW_REVERT : on masque sur 0x3f, comme le fait calldata.ts.
 */
function nomsDeCommandes(commands: string): string[] {
  const h = commands.replace(/^0x/, '')
  const noms: string[] = []
  for (let i = 0; i + 1 < h.length; i += 2) {
    const b = parseInt(h.slice(i, i + 2), 16) & 0x3f
    noms.push(
      b === COMMAND_PERMIT2_PERMIT ? 'PERMIT2_PERMIT' : b === COMMAND_V4_SWAP ? 'V4_SWAP' : `0x${b.toString(16)}`,
    )
  }
  return noms
}

/* ------------------------------------------------------- ce que la garde a lu */

interface Lecture {
  decode: DecodeResult
  leg: SwapLeg | null
  consultation: Consultation | null
  verdict: Verdict | null
  alternative: Alternative | null
}

function lire(table: GuardTable, calldata: string): Lecture {
  const decode = decodeUniversalRouterCalldata(calldata)
  const leg = decode.legs[0] ?? null
  if (!leg) return { decode, leg, consultation: null, verdict: null, alternative: null }
  const c = consult(table, leg.poolId, leg.poolKey.hooks, leg.direction, leg.amountIn)
  const g = gradeConsultation(c, thresholdsFor(table), leg.poolKey.hooks !== ZERO_ADDRESS)
  return {
    decode,
    leg,
    consultation: c,
    verdict: g.verdict,
    alternative: chercherAlternative(table, leg.poolId, leg.direction, leg.amountIn),
  }
}

/** Le bloc « la garde a lu ceci », partage par les deux actes. */
function CeQuiEstLu({ l, attendu }: { l: Lecture; attendu?: string }) {
  return (
    <>
      <L k="selector" v={<span className="hex">{l.decode.selector}</span>} />
      <L
        k="commands"
        v={
          <>
            <span className="hex">{l.decode.commands}</span> · {nomsDeCommandes(l.decode.commands).join(' then ')}
          </>
        }
      />
      {l.leg === null ? (
        <L k="swap" v={<Inconnu quoi="no v4 swap in this calldata" />} />
      ) : (
        <>
          <L
            k="poolkey"
            v={
              <>
                {nomMonnaie(l.leg.poolKey.currency0)} / {nomMonnaie(l.leg.poolKey.currency1)} · fee{' '}
                {l.leg.poolKey.fee} · tickSpacing {l.leg.poolKey.tickSpacing}
              </>
            }
          />
          <L k="hook" fort v={<span className="hex">{l.leg.poolKey.hooks}</span>} />
          <L
            k="pool id"
            v={
              <>
                <span className="hex">{shortAddr(l.leg.poolId, 12, 6)}</span>
                <span style={{ color: 'var(--ink-2)' }}>
                  {attendu === undefined
                    ? ' · re-derived from the PoolKey'
                    : l.leg.poolId === attendu
                      ? ' · re-derived from the PoolKey, identical to the corpus'
                      : ' · re-derived from the PoolKey, and it is not the pool expected'}
                </span>
              </>
            }
          />
          <L
            k="direction"
            v={
              <>
                {l.leg.direction} · {l.leg.actionName} ·{' '}
                {l.leg.amountIn === null ? <Inconnu quoi="size fixed by the calldata" /> : groupDigits(l.leg.amountIn)}
              </>
            }
          />
        </>
      )}
      <L
        k="read whole"
        v={
          l.decode.complete
            ? 'yes — nothing was left unread'
            : l.decode.issues.map((i) => `${i.where}: ${i.reason}`).join(' · ')
        }
      />
    </>
  )
}

/* ------------------------------------------------------------- l'ecran du Ledger */

/**
 * L'ECRAN DE L'APPAREIL, EN DIRECT.
 *
 * Le PNG est redemande toutes les `PERIODE_MS` avec un jeton qui coupe le cache. Aucune
 * capture n'est gardee : si l'image ne charge pas, l'ecran le dit et ne montre rien. Une
 * capture enregistree ferait passer un enregistrement pour un direct, ce qui est exactement
 * la faute que ce projet refuse partout ailleurs.
 */
const PERIODE_MS = 400

function EcranAppareil({ onBouton, texte }: { onBouton: (b: BoutonAppareil) => void; texte?: string | null }) {
  const [jeton, setJeton] = useState(0)
  const [dispo, setDispo] = useState<boolean | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => setJeton((n) => n + 1), PERIODE_MS)
    return () => window.clearInterval(t)
  }, [])

  return (
    <div className="flex flex-col gap-[7px] px-[11px] py-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
      <div
        className="flex items-center justify-center"
        style={{ border: '1px solid var(--line-strong)', background: 'var(--bg)', minHeight: 84, padding: 5 }}
      >
        <img
          src={urlEcran(jeton)}
          alt="the device screen, live"
          onLoad={() => setDispo(true)}
          onError={() => setDispo(false)}
          style={{
            display: dispo === true ? 'block' : 'none',
            imageRendering: 'pixelated',
            maxWidth: '100%',
            height: 'auto',
          }}
        />
        {dispo !== true && (
          <span className="t-data-xs" style={{ color: 'var(--ink-2)', textAlign: 'center' }}>
            {dispo === null ? 'reading the device screen…' : 'device screen unavailable'}
          </span>
        )}
      </div>
      {texte ? (
        <div className="t-data-xs hex" style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>
          {texte}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-[6px]">
        <Bouton onClick={() => onBouton('left')}>Reject (left)</Bouton>
        <Bouton onClick={() => onBouton('right')}>next (right)</Bouton>
        <Bouton onClick={() => onBouton('both')} fort>
          Approve (both)
        </Bouton>
      </div>
      <div className="t-data-xs" style={{ color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>
        {SPECULOS} · refreshed every {PERIODE_MS} ms · nothing is replayed. A refusal on the left
        button answers code {CODE_REFUS_UTILISATEUR} — the EIP-1193 code for « the human said no » —
        and nothing leaves.
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- une porte */

function LignePorte({ p, role }: { p: Porte; role: string }) {
  return (
    <L
      k={role}
      fort
      v={
        <>
          <span className="hex">{shortAddr(p.poolId, 10, 4)}</span> · hook{' '}
          <span className="hex">{shortAddr(p.hook, 10, 4)}</span> ·{' '}
          {p.bps === null ? <Inconnu quoi={`take at ${p.amountIn}`} /> : <>{p.bps} bps</>}
        </>
      }
    />
  )
}

/* ------------------------------------------------------------------- la page */

export function DemoPage() {
  /* La table de la garde, batie une fois depuis le corpus deja embarque dans le paquet JS. */
  const table = useMemo(() => tableDuCorpus(), [])
  const seuils = useMemo(() => thresholdsFor(table), [table])
  const stop = useMemo(() => acteStop(), [])
  const substitution = useMemo(() => acteSubstitution(), [])

  const [acte, setActe] = useState<'stop' | 'substitution'>('stop')
  const [etat, setEtat] = useState<EtatDemo | Refus | null>(null)
  const [portefeuilles, setPortefeuilles] = useState<PortefeuilleAnnonce[]>([])
  const [adresse, setAdresse] = useState<string | null>(null)
  const [journal, setJournal] = useState<{ quoi: string; texte: string; dur?: boolean }[]>([])
  const [prep, setPrep] = useState<Record<string, Preparation | Refus | null>>({})
  const [appareil, setAppareil] = useState<Approbation | Refus | null>(null)
  const [hash, setHash] = useState<string | null>(null)
  const [recuTx, setRecuTx] = useState<Recu | null>(null)
  const [soldesAvant, setSoldesAvant] = useState<Soldes | null>(null)
  const [soldesApres, setSoldesApres] = useState<Soldes | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)

  const fournisseur: Fournisseur | null = (portefeuilles[0]?.provider as Fournisseur | undefined) ?? null
  const minuteur = useRef<number | null>(null)

  const dire = useCallback((quoi: string, texte: string, dur = false) => {
    setJournal((j) => [{ quoi, texte, dur }, ...j].slice(0, 5))
  }, [])

  useEffect(() => ecouterPortefeuilles(setPortefeuilles), [])
  useEffect(() => {
    let vivant = true
    void lireEtat().then((e) => {
      if (vivant) setEtat(e)
    })
    return () => {
      vivant = false
    }
  }, [])
  useEffect(
    () => () => {
      if (minuteur.current !== null) window.clearInterval(minuteur.current)
    },
    [],
  )

  const etatOk = etat !== null && !estRefus(etat) ? etat : null
  const fork = etatOk?.fork ?? null

  const acteCourant: Acte | null = acte === 'stop' ? stop : substitution
  const preparation = prep[acte] ?? null
  const preparationOk = preparation && !estRefus(preparation) ? preparation : null

  /**
   * LE CALLDATA LU PAR LA GARDE : celui du service quand il repond — c'est lui qui partira sur
   * le fork — et sinon celui que le corpus permet de reconstruire pour la meme porte, a la
   * meme taille. Les deux passent par le MEME decodeur, et l'ecran dit lequel il lit.
   */
  const calldata = preparationOk?.transaction.data ?? acteCourant?.calldata ?? null
  const lecture = useMemo(() => (calldata ? lire(table, calldata) : null), [table, calldata])

  /**
   * LA TRANSACTION DE REMPLACEMENT, construite par envoi.ts et jamais envoyee.
   *
   * Sans cotation vivante, envoi.ts rend l'etat nomme SANS_PLANCHER — et c'est la bonne
   * reponse : une transaction sans plancher de sortie serait signable a n'importe quel prix.
   * Le service, lui, cote sur le fork ; sa cotation est reprise telle quelle.
   */
  const envoi: Envoi | null = useMemo(() => {
    if (acte !== 'substitution' || !lecture?.alternative) return null
    const cot = preparationOk?.cotation
    return transactionDeRemplacement(lecture.alternative, {
      cotation: cot === null || cot === undefined ? null : BigInt(cot),
      maintenant: BigInt(Math.floor(Date.now() / 1000)),
    })
  }, [acte, lecture, preparationOk])

  /** Ce que le portefeuille signera : le remplacement rendu par le pont, et rien d'autre. */
  const aSigner: TransactionPrete | null = preparationOk?.transaction_remplacement ?? null
  const lectureR = useMemo(
    () => (aSigner ? lire(table, aSigner.data) : envoi?.transaction ? lire(table, envoi.transaction.data) : null),
    [table, aSigner, envoi],
  )

  /* --------------------------------------------------------------- les gestes */

  const connecter = async () => {
    if (!fournisseur) return dire('wallet', 'no wallet announced on this page', true)
    setOccupe('wallet')
    const c = await comptes(fournisseur)
    setOccupe(null)
    if (estRefus(c)) return dire('wallet', c.raison, true)
    setAdresse(c[0] ?? null)
    dire('wallet', c[0] ? `connected as ${shortAddr(c[0])}` : 'the wallet returned no address', !c[0])
  }

  const brancherReseau = async () => {
    if (!fournisseur) return dire('network', 'no wallet announced on this page', true)
    if (!fork) return dire('network', 'the bridge has not published the fork RPC yet', true)
    setOccupe('network')
    const r = await ajouterEtBasculer(fournisseur, fork)
    setOccupe(null)
    dire(
      'network',
      estRefus(r) ? r.raison : `switched to ${fork.chain_id === null ? 'the fork' : chainName(fork.chain_id)}`,
      estRefus(r),
    )
  }

  const demanderPreparation = async () => {
    let de = adresse
    if (!de && fournisseur) {
      const c = await comptes(fournisseur)
      if (!estRefus(c)) {
        de = c[0] ?? null
        setAdresse(de)
      }
    }
    setOccupe('bridge')
    const r = await preparer(de ?? ZERO_ADDRESS, acte)
    setOccupe(null)
    setPrep((p) => ({ ...p, [acte]: r }))
    if (estRefus(r)) return dire('bridge', r.raison, true)
    setSoldesAvant(r.soldes)
    setSoldesApres(null)
    dire('bridge', `transaction prepared for act « ${acte} »`)
  }

  /** Envoie le rapport EIP-712 a l'appareil et attend la decision de l'humain. */
  const demanderAppareil = async () => {
    setOccupe('device')
    const r = await approuver(acte)
    setOccupe(null)
    setAppareil(r)
    if (estRefus(r)) return dire('device', r.raison, true)
    if (typeof r.refus === 'number')
      return dire('device', `${r.raison ?? 'rejected on the device'} — code ${r.refus}, nothing left`, true)
    dire('device', r.signature ? `signed on the device: ${shortAddr(r.signature, 12, 6)}` : 'the device answered')
  }

  const bouton = async (b: BoutonAppareil) => {
    const r = await appuyer(b)
    if (estRefus(r)) return dire('device', r.raison, true)
    dire('device', `pressed ${b}`)
  }

  const signerEtEnvoyer = async () => {
    if (!aSigner) return dire('wallet', 'the bridge has not returned a replacement transaction', true)
    if (!fournisseur) return dire('wallet', 'no wallet announced on this page', true)
    let de = adresse
    if (!de) {
      const c = await comptes(fournisseur)
      if (estRefus(c)) return dire('wallet', c.raison, true)
      de = c[0] ?? null
      setAdresse(de)
    }
    if (!de) return dire('wallet', 'the wallet returned no address', true)
    setOccupe('signature')
    const r = await envoyer(fournisseur, de, aSigner)
    setOccupe(null)
    if (estRefus(r)) return dire('wallet', r.raison, true)
    setHash(r.hash)
    dire('wallet', `sent: ${shortAddr(r.hash, 12, 8)}`)
    // Le recu se RELIT, il ne se devine pas. Tant qu'il n'est pas la, l'ecran dit qu'il attend.
    const compte = de
    if (minuteur.current !== null) window.clearInterval(minuteur.current)
    minuteur.current = window.setInterval(() => {
      void recu(fournisseur, r.hash).then(async (x) => {
        if (x === null || estRefus(x)) return
        if (minuteur.current !== null) window.clearInterval(minuteur.current)
        setRecuTx(x)
        const s = await lireSoldes(compte)
        if (!estRefus(s)) setSoldesApres(s)
      })
    }, PERIODE_MS * 2)
  }

  const remettre = async () => {
    setOccupe('bridge')
    const r = await revenir()
    setOccupe(null)
    setHash(null)
    setRecuTx(null)
    setSoldesApres(null)
    setAppareil(null)
    dire(
      'fork',
      estRefus(r)
        ? r.raison
        : r.block_number === undefined
          ? 'back to the snapshot'
          : `back to block ${fmtBlock(r.block_number)}`,
      estRefus(r),
    )
  }

  /* ----------------------------------------------------------------- le rendu */

  const soldeUsdc = (s: Soldes) => (s.usdc === null ? <Inconnu quoi="USDC balance" /> : groupDigits(s.usdc))
  const refusAppareil =
    appareil !== null && !estRefus(appareil) && typeof appareil.refus === 'number' ? appareil.refus : null

  return (
    <div className="flex flex-col" style={{ gap: 10, minWidth: 0 }}>
      {/* ------------------------------------------------------------- l'en-tete */}
      <div className="flex flex-wrap items-end justify-between gap-x-[26px] gap-y-[8px] voile">
        <div className="flex flex-col" style={{ gap: 5, maxWidth: '62ch' }}>
          <h1 className="t-title m-0">Two acts, on a pinned fork</h1>
          <p className="t-data-sm m-0" style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>
            The guard reads the calldata before the wallet does: it pulls the PoolKey out — so the
            hook — and says what that hook takes. Then it builds the replacement, and never sends
            it. Every figure below is read from the corpus or returned by the fork.
          </p>
        </div>
        <div className="flex flex-wrap items-baseline t-data-xs" style={{ gap: 11, color: 'var(--ink-2)' }}>
          <span>
            corpus block {fmtBlock(table.block_number)} · {groupDigits(String(table.n_measurements))} measurements
          </span>
          <span className="meta-filet">
            {table.n_pools} pools · {table.n_hooks} hooks
          </span>
          <span className="meta-filet">chain {table.chain_id}</span>
        </div>
      </div>

      {/* --------------------------------------------------- le pont, en une ligne */}
      {etat === null && (
        <div className="t-data-xs px-[11px] py-[7px]" style={{ color: 'var(--ink-2)', border: '1px solid var(--line)' }}>
          reading {PONT}/demo/etat…
        </div>
      )}
      {etat !== null && estRefus(etat) && (
        <Absence
          quoi="the demo bridge"
          etat="unreachable"
          panne
          raison={
            <>
              {etat.raison}. The page stays readable: the corpus, the calldata decoding and the door
              comparison below need nobody. What needs the bridge is the fork itself — the live
              quote, the balances and the receipt.
            </>
          }
        />
      )}
      {etatOk && (
        <div
          className="flex flex-wrap items-center gap-[9px] px-[11px] py-[7px]"
          style={{ border: '1px solid var(--line)', background: 'var(--bg-1)' }}
        >
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            fork{' '}
            {etatOk.fork.chain_id === null ? (
              <Inconnu quoi="chain id: the fork did not answer" />
            ) : (
              chainName(etatOk.fork.chain_id)
            )}{' '}
            · block{' '}
            {etatOk.fork.block_number === null ? (
              <Inconnu quoi="block number" />
            ) : (
              fmtBlock(etatOk.fork.block_number)
            )}{' '}
            · snapshot {etatOk.snapshot === null ? <Inconnu quoi="snapshot" /> : String(etatOk.snapshot)}
          </span>
          <span className="t-data-xs meta-filet" style={{ color: 'var(--ink-2)' }}>
            device {etatOk.speculos.joignable ? 'reachable' : 'not reachable'}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-[6px]">
            <Bouton onClick={brancherReseau} actif={Boolean(fournisseur) && !occupe}>
              add the fork network
            </Bouton>
            <Bouton onClick={connecter} actif={Boolean(fournisseur) && !occupe}>
              {adresse ? shortAddr(adresse) : 'connect the wallet'}
            </Bouton>
            <Bouton onClick={remettre} actif={!occupe}>
              reset the fork
            </Bouton>
          </span>
        </div>
      )}

      {/* LES DIVERGENCES. Le service les publie ; les taire reviendrait a choisir en silence. */}
      {etatOk?.divergences && etatOk.divergences.length > 0 && (
        <div style={{ border: '1px solid var(--line)' }}>
          <div className="t-label px-[11px] py-[5px]" style={{ color: 'var(--m-5)' }}>
            what the script announces, and what the corpus measures
          </div>
          {etatOk.divergences.map((d, i) => (
            <div
              key={`${d.acte}-${d.champ}-${i}`}
              className="t-data-xs px-[11px] py-[4px]"
              style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)', overflowWrap: 'anywhere' }}
              title={d.consequence}
            >
              act « {d.acte} » · {d.champ} — announced <span className="hex">{d.annonce}</span>, corpus{' '}
              <span className="hex" style={{ color: 'var(--ink)' }}>
                {d.corpus}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ------------------------------------------------------------ les deux actes */}
      <div className="flex flex-wrap items-center gap-[6px]">
        {(
          [
            ['stop', 'act 1 — do not sign', stop],
            ['substitution', 'act 2 — there is better', substitution],
          ] as const
        ).map(([cle, titre, a]) => (
          <button
            key={cle}
            type="button"
            onClick={() => setActe(cle)}
            disabled={a === null}
            className="t-label"
            style={{
              padding: '7px 13px',
              border: `1px solid ${acte === cle ? 'var(--m-4)' : 'var(--line)'}`,
              background: acte === cle ? 'var(--bg-3)' : 'transparent',
              color: a === null ? 'var(--ink-4)' : 'var(--ink)',
              cursor: a === null ? 'not-allowed' : 'pointer',
            }}
          >
            {titre}
          </button>
        ))}
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {occupe ? `waiting on the ${occupe}…` : 'both acts are searched in the corpus, not written down'}
        </span>
        <span className="ml-auto">
          <Bouton onClick={demanderPreparation} actif={!occupe} fort>
            prepare on the fork
          </Bouton>
        </span>
      </div>

      {acteCourant === null && (
        <Absence
          quoi={`act « ${acte} »`}
          etat="not in this corpus"
          raison={
            acte === 'stop'
              ? 'no numeric measurement in the bundled corpus: there is no worst door to show.'
              : 'no size where two doors of this pair are both measured: there is nothing to substitute, and inventing one would be the very fault this project refuses.'
          }
        />
      )}

      {preparation !== null && estRefus(preparation) && (
        <Absence
          quoi={`${PONT}/demo/preparer`}
          etat="refused"
          panne
          raison={`${preparation.raison}. The four steps below still read: what they lose is the live quote and the fork, not the measurement.`}
        />
      )}

      {/* ------------------------------------------------------------ les quatre etapes */}
      {acteCourant && lecture && (
        <div className="demo-etapes">
          {/* -------------------------------------------------------------- 01 */}
          <Etape n={1} sur={4} titre={acte === 'stop' ? 'the swap, before signature' : 'the swap you would send'}>
            <L
              k="router"
              v={
                <>
                  <span className="hex">{shortAddr(preparationOk?.transaction.to ?? acteCourant.routeur, 12, 4)}</span> ·{' '}
                  {preparationOk ? 'returned by the bridge' : 'Universal Router, from the guard'}
                </>
              }
            />
            <L
              k="spends"
              v={
                <>
                  {groupDigits(acteCourant.actuelle.amountIn)} unit(s) of {nomMonnaie(acteCourant.actuelle.entree)} →{' '}
                  {nomMonnaie(acteCourant.actuelle.sortie)}
                </>
              }
            />
            <L
              k="value"
              v={
                <>
                  {preparationOk?.transaction.value ?? acteCourant.value}
                  <span style={{ color: 'var(--ink-2)' }}>
                    {acteCourant.actuelle.entree === ZERO_ADDRESS
                      ? ' · native ETH: the amount travels here'
                      : ' · an ERC-20 travels through the router, not in value'}
                  </span>
                </>
              }
            />
            <LignePorte p={acteCourant.actuelle} role="door taken" />
            <div
              className="px-[11px] py-[7px] flex flex-wrap items-center gap-[7px]"
              style={{ borderTop: '1px solid var(--line)' }}
            >
              <Copy text={calldata ?? ''} label="copy the calldata" />
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                {preparationOk
                  ? 'this is the calldata the fork would execute'
                  : 'rebuilt from the corpus: the bridge has not answered'}
              </span>
            </div>
          </Etape>

          {/* -------------------------------------------------------------- 02 */}
          {acte === 'stop' ? (
            <Etape n={2} sur={4} titre="the guard reads it, before the wallet">
              <CeQuiEstLu l={lecture} attendu={acteCourant.actuelle.poolId} />
            </Etape>
          ) : (
            <Etape n={2} sur={4} titre="the doors, at the same size">
              {lecture.alternative === null ? (
                <L k="comparison" v={<Inconnu quoi="no leg to compare" />} />
              ) : (
                <>
                  <EtatNomme
                    etat={lecture.alternative.etat}
                    suite={AFFICHAGE[lecture.alternative.etat]?.titre}
                    raison={`Same two currencies, same direction, same block, same size — ${groupDigits(
                      acteCourant.actuelle.amountIn,
                    )} unit(s). Anything else would manufacture the saving it claims to measure.`}
                    encadre={false}
                  />
                  <LignePorte p={acteCourant.actuelle} role="current door" />
                  {acteCourant.proposee && <LignePorte p={acteCourant.proposee} role="cheaper door" />}
                  <L
                    k="measured gap"
                    fort
                    v={
                      lecture.alternative.economie_bps === null ? (
                        <Inconnu quoi="gap" />
                      ) : (
                        <>
                          {lecture.alternative.economie_bps} bps
                          <span style={{ color: 'var(--ink-2)' }}>
                            {' '}
                            · publication threshold {lecture.alternative.seuil_bps} bps
                          </span>
                        </>
                      )
                    }
                  />
                  <L
                    k="examined"
                    v={
                      lecture.alternative.examinees.length === 0 ? (
                        'none: nothing else makes this swap in the corpus'
                      ) : (
                        <span className="flex flex-wrap gap-[5px]">
                          {lecture.alternative.examinees.map((p) => (
                            <span
                              key={p.poolId}
                              className="chip hex"
                              title={`${p.poolId} · ${p.label ?? 'not measured'}`}
                            >
                              {shortAddr(p.poolId, 10, 6)} {p.bps === null ? 'unknown' : `${p.bps} bps`}
                            </span>
                          ))}
                        </span>
                      )
                    }
                  />
                  <L
                    k="corpus"
                    v={`block ${fmtBlock(lecture.alternative.block_number)} · chain ${lecture.alternative.chain_id}`}
                  />
                </>
              )}
            </Etape>
          )}

          {/* -------------------------------------------------------------- 03 */}
          {acte === 'stop' ? (
            <Etape n={3} sur={4} titre="what this door takes">
              {lecture.consultation === null || lecture.verdict === null ? (
                <L k="measurement" v={<Inconnu quoi="no leg to consult" />} />
              ) : (
                <>
                  {/* LE CHIFFRE, A TROIS ETAGES (charte 4.9) : la valeur arrondie porte le
                      coup d'oeil, la valeur EXACTE est juste en dessous. Arrondir sans
                      publier l'exact serait perdre une mesure ; publier l'exact seul rendrait
                      illisible le seul nombre que la salle doit retenir. */}
                  <div className="px-[11px] pt-[9px] pb-[5px]">
                    <div className="t-metric" style={{ color: TON_VERDICT[lecture.verdict] }}>
                      {lecture.consultation.bps === null ? (
                        <Inconnu quoi="take at this size" />
                      ) : (
                        <>{groupDigits(lecture.consultation.bps.toFixed(2))} bps</>
                      )}
                    </div>
                    <div className="t-data-xs mt-[3px]" style={{ color: 'var(--ink-2)' }}>
                      {lecture.consultation.bps === null
                        ? 'not measured at this size'
                        : `exact ${lecture.consultation.bps} · ${(lecture.consultation.bps / 100).toFixed(3)} % of what you send`}
                    </div>
                  </div>
                  <L k="label" v={`${lecture.consultation.label} · basis ${lecture.consultation.basis}`} />
                  <L
                    k="verdict"
                    fort
                    v={
                      <>
                        <span style={{ color: TON_VERDICT[lecture.verdict] }}>{lecture.verdict}</span> · past the{' '}
                        {seuils.blockBps} bps mark, which is the 99th percentile of the{' '}
                        {seuils.derivesDe === null ? (
                          <Inconnu quoi="percentile base" />
                        ) : (
                          groupDigits(String(seuils.derivesDe))
                        )}{' '}
                        numeric measurements — not a round number
                      </>
                    }
                  />
                  {lecture.consultation.citations[0] && (
                    <L
                      k="cited"
                      v={
                        <>
                          block {fmtBlock(lecture.consultation.citations[0].blockNumber)} · size{' '}
                          {groupDigits(lecture.consultation.citations[0].amountIn)} ·{' '}
                          {lecture.consultation.citations[0].direction}
                        </>
                      }
                    />
                  )}
                  {lecture.alternative && (
                    <EtatNomme
                      etat={lecture.alternative.etat}
                      suite={AFFICHAGE[lecture.alternative.etat]?.titre}
                      raison={
                        AFFICHAGE[lecture.alternative.etat]?.action === null
                          ? 'This screen proposes nothing. It asks.'
                          : 'The guard hands the choice back to you.'
                      }
                      ton={TON_VERDICT[lecture.verdict]}
                    />
                  )}
                  <div className="px-[11px] py-[7px]" style={{ borderTop: '1px solid var(--line)' }}>
                    <Replay cmd={replayCommand(acteCourant.actuelle.row)} />
                  </div>
                </>
              )}
            </Etape>
          ) : (
            <Etape n={3} sur={4} titre="the replacement, built and not sent">
              {/* PAS de `suite` ici. Elle viendrait de SUITE, dans ../compte/substitution.ts, ou
                  l'etat PRET est encore libelle en francais — et cet ecran-ci est en anglais.
                  L'etat NOMME se lit dans les deux langues ; la phrase qui le suit est ecrite
                  ici, une fois, plutot que traduite a cote de sa source. */}
              {envoi && (
                <EtatNomme
                  etat={envoi.etat}
                  raison={
                    envoi.etat === 'PRET'
                      ? 'Built and handed back. The last hand on this transaction is yours.'
                      : 'The guard will not hand out a transaction it cannot floor. The bridge quotes on the fork: that is what it is for.'
                  }
                  encadre={false}
                />
              )}
              {lectureR ? (
                <CeQuiEstLu l={lectureR} attendu={acteCourant.proposee?.poolId} />
              ) : (
                <L
                  k="transaction"
                  v="the bridge has not returned one, and no live quote is available here: « prepare on the fork » asks for both."
                />
              )}
              {preparationOk?.cotation !== undefined && (
                <L
                  k="output floor"
                  v={
                    preparationOk.plancher == null ? (
                      <Inconnu quoi="floor: no live quote" />
                    ) : (
                      <>
                        {groupDigits(preparationOk.plancher)}
                        <span style={{ color: 'var(--ink-2)' }}>
                          {' '}
                          · live quote {preparationOk.cotation === null ? 'unknown' : groupDigits(preparationOk.cotation)}
                          {preparationOk.tolerance_bps == null ? '' : ` minus ${preparationOk.tolerance_bps} bps`}
                        </span>
                      </>
                    )
                  }
                />
              )}
              {aSigner && (
                <div
                  className="px-[11px] py-[7px] flex flex-wrap items-center gap-[7px]"
                  style={{ borderTop: '1px solid var(--line)' }}
                >
                  <Copy text={aSigner.data} label="copy the calldata" />
                  <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    to {shortAddr(aSigner.to, 10, 4)} · value {aSigner.value}
                  </span>
                </div>
              )}
            </Etape>
          )}

          {/* -------------------------------------------------------------- 04 */}
          {acte === 'stop' ? (
            <Etape n={4} sur={4} titre="the device asks, you refuse">
              <div
                className="px-[11px] pt-[8px] pb-[2px] t-data-xs"
                style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}
              >
                A hardware wallet that shows an opaque digest protects nothing. The report goes to
                the device field by field, and refusing is an answer the chain never sees.
              </div>
              <EcranAppareil onBouton={bouton} texte={etatOk?.speculos.ecran ?? null} />
              <div
                className="px-[11px] py-[7px] flex flex-wrap items-center gap-[7px]"
                style={{ borderTop: '1px solid var(--line)' }}
              >
                <Bouton onClick={demanderAppareil} actif={!occupe} fort>
                  send the report to the device
                </Bouton>
                {appareil !== null && !estRefus(appareil) && appareil.ecrans !== undefined && (
                  <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    {appareil.ecrans} screens rendered
                    {appareil.primaryType ? ` · ${appareil.primaryType}` : ''}
                  </span>
                )}
              </div>
              {appareil !== null && estRefus(appareil) && (
                <L k="device" v={<span style={{ color: 'var(--m-3)' }}>{appareil.raison}</span>} />
              )}
              {refusAppareil !== null && (
                <L
                  k="answer"
                  fort
                  v={
                    <span style={{ color: 'var(--m-3)' }}>
                      code {refusAppareil} — nothing left. Not an outage: an answer.
                    </span>
                  }
                />
              )}
              {appareil !== null && !estRefus(appareil) && appareil.signature && (
                <L
                  k="signature"
                  v={
                    <>
                      <span className="hex">{shortAddr(appareil.signature, 12, 6)}</span>
                      <span style={{ color: 'var(--ink-2)' }}> · it approves a reading, not a transfer</span>
                    </>
                  }
                />
              )}
            </Etape>
          ) : (
            <Etape n={4} sur={4} titre="your wallet signs, the fork executes">
              <L
                k="balances"
                v={
                  soldesAvant === null ? (
                    <Inconnu quoi="balances before" />
                  ) : (
                    <>
                      before: {groupDigits(soldesAvant.eth_wei)} wei · {soldeUsdc(soldesAvant)} USDC
                      {soldesApres && (
                        <>
                          <br />
                          after: {groupDigits(soldesApres.eth_wei)} wei · {soldeUsdc(soldesApres)} USDC
                        </>
                      )}
                    </>
                  )
                }
              />
              <div
                className="px-[11px] py-[7px] flex flex-wrap items-center gap-[7px]"
                style={{ borderTop: '1px solid var(--line)' }}
              >
                <Bouton onClick={signerEtEnvoyer} actif={Boolean(aSigner) && Boolean(fournisseur) && !occupe} fort>
                  sign and send
                </Bouton>
                {!fournisseur && (
                  <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    no wallet announced: the calldata stays copyable, and checkable
                  </span>
                )}
                {fournisseur && !aSigner && (
                  <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    nothing to sign until the bridge has built the replacement
                  </span>
                )}
              </div>
              {hash && (
                <L
                  k="sent"
                  v={
                    <>
                      <span className="hex">{shortAddr(hash, 14, 6)}</span>
                      <span style={{ color: 'var(--ink-2)' }}>
                        {' '}
                        · {recuTx ? 'included' : 'waiting for the receipt…'}
                      </span>
                    </>
                  }
                />
              )}
              {recuTx && (
                <L
                  k="receipt"
                  fort
                  v={
                    <>
                      block {fmtBlock(Number(recuTx.blockNumber))} · status {recuTx.status} · gas{' '}
                      {groupDigits(String(Number(recuTx.gasUsed)))}
                    </>
                  }
                />
              )}
              <div className="px-[11px] py-[7px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)', lineHeight: 1.5 }}>
                The guard never sent anything. It built a transaction and handed it back; the
                signature, and the risk, stayed with the wallet.
              </div>
            </Etape>
          )}
        </div>
      )}

      {/* ------------------------------------------------------------- le journal */}
      {journal.length > 0 && (
        <div style={{ border: '1px solid var(--line)' }}>
          {journal.map((l, i) => (
            <div
              key={`${l.quoi}-${i}`}
              className="flex items-baseline gap-[9px] px-[11px] py-[3px]"
              style={{ borderTop: i === 0 ? undefined : '1px solid var(--line)' }}
            >
              <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 62, flex: 'none' }}>
                {l.quoi}
              </span>
              <span
                className="t-data-xs"
                style={{ color: l.dur ? 'var(--m-3)' : 'var(--ink-2)', overflowWrap: 'anywhere' }}
              >
                {l.texte}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
