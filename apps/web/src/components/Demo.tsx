/**
 * LA DEMONSTRATION EN DIRECT (#/demo) — une paire, deux actes, et la distribution au-dessus.
 *
 * CE QUI A CHANGE, ET POURQUOI. La premiere version ouvrait sur le hook qui prend 9 999,53 bps.
 * C'est une ligne sur 125 072, sur un ERC-20 que personne ne detient : mettre l'exception en
 * titre, c'est presenter la queue comme la norme — exactement ce que ce projet reproche aux
 * tableaux de bord qu'il remplace. La these est portee desormais par le BANDEAU DE
 * DISTRIBUTION, en permanence au-dessus : la mediane est a 100 bps, un pour cent de ce qu'on
 * echange. L'extreme reste publie, a un clic, a sa place : un point de la queue.
 *
 * Les deux actes portent la MEME paire, ETH -> USDC, que tout le monde connait :
 *
 *   acte 1  « you read what you sign » : le swap part par la porte actuelle. La garde le lit
 *                                        AVANT la signature, en tire la PoolKey donc le hook,
 *                                        et nomme ce que cette porte prend — un nombre que
 *                                        personne ne pouvait connaitre avant de signer. On
 *                                        envoie le rapport a l'appareil, et on REFUSE : 4001,
 *                                        rien ne part.
 *   acte 2  « there is better »        : une autre porte, mesuree au meme bloc, au meme sens
 *                                        et a la meme taille, ne prend rien. La garde CONSTRUIT
 *                                        le remplacement, ne l'envoie jamais, et le rend au
 *                                        portefeuille. Le portefeuille signe, le fork execute.
 *
 * QUATRE REGLES QUI TIENNENT TOUT L'ECRAN.
 *
 *   1. AUCUN NOMBRE N'EST ECRIT ICI. Chaque chiffre vient du corpus embarque (par
 *      ../demo/scenario.ts, ../demo/table.ts et ../demo/distribution.ts) ou d'une reponse du
 *      service. src/lib/demo.test.ts le verifie, comme facts.test.ts le fait pour les panneaux
 *      08 a 12 : une vitrine est exactement l'endroit ou un chiffre faux passe le mieux.
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
import { distribution, lpFeeBps, POURCENT_EN_BPS } from '../demo/distribution'
import { BandeDistribution, bpsTexte, partTexte } from './DemoDistribution'
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
  DELAI_APPAREIL_S,
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
 * L'ECRAN DE L'APPAREIL, EN DIRECT — et le GESTE REEL, pas celui qu'on imagine.
 *
 * Le PNG est redemande toutes les `PERIODE_MS` avec un jeton qui coupe le cache. Aucune
 * capture n'est gardee : si l'image ne charge pas, l'ecran le dit et ne montre rien. Une
 * capture enregistree ferait passer un enregistrement pour un direct, ce qui est exactement
 * la faute que ce projet refuse partout ailleurs.
 *
 * LES LIBELLES ONT ETE REFAITS APRES MESURE. Ils disaient « Reject (left) » / « Approve
 * (both) », ce qui enseignait le mauvais geste : le PREMIER ecran de l'appareil est une garde
 * — « Blind signing ahead: to accept risk, press both buttons » — ou l'appui gauche n'a
 * strictement aucun effet, verifie dix secondes durant. La sequence reelle est :
 *
 *     confirm (both)   accepter la garde de signature aveugle
 *     next (right) ×N  parcourir tous les champs du rapport
 *     confirm (both)   sur le DERNIER ecran, « Reject » — c'est LA le refus, et il rend 4001
 *
 * D'ou trois choses ici : des libelles qui disent ce que les boutons FONT, une ligne d'aide
 * qui donne la sequence dans l'ordre, et un COMPTEUR. Trente secondes d'appuis sans repere
 * devant un jury, c'est tres long — et le compteur d'ecrans est MESURE (il compte les
 * changements du texte relu sur l'appareil), jamais estime.
 */
const PERIODE_MS = 400

/** A quelle cadence on relit le texte de l'ecran de l'appareil, par le pont. */
const PERIODE_ECRAN_MS = 900

/** Combien d'appuis « next » une rafale envoie. Quarante-six appuis a la main, c'est trop. */
const APPUIS_PAR_RAFALE = 10
/** L'espacement entre deux appuis d'une rafale : l'appareil doit avoir le temps de rendre. */
const ENTRE_APPUIS_MS = 140

function EcranAppareil({
  onBouton,
  texte,
}: {
  onBouton: (b: BoutonAppareil) => Promise<boolean>
  texte?: string | null
}) {
  const [jeton, setJeton] = useState(0)
  const [dispo, setDispo] = useState<boolean | null>(null)
  const [appuis, setAppuis] = useState(0)
  const [ecrans, setEcrans] = useState(0)
  const [rafale, setRafale] = useState(false)
  const dernier = useRef<string | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => setJeton((n) => n + 1), PERIODE_MS)
    return () => window.clearInterval(t)
  }, [])

  // LE COMPTEUR D'ECRANS EST MESURE : il avance quand le texte relu sur l'appareil CHANGE.
  // Un total annonce d'avance serait une estimation, et une estimation affichee comme un
  // repere devient un chiffre faux des que le rapport gagne un champ.
  useEffect(() => {
    const t = (texte ?? '').trim()
    if (!t || t === dernier.current) return
    dernier.current = t
    setEcrans((n) => n + 1)
  }, [texte])

  const appuyerUne = async (b: BoutonAppareil) => {
    const ok = await onBouton(b)
    if (ok) setAppuis((n) => n + 1)
    return ok
  }

  const enchainer = async () => {
    setRafale(true)
    for (let i = 0; i < APPUIS_PAR_RAFALE; i += 1) {
      const ok = await appuyerUne('right')
      if (!ok) break
      await new Promise((r) => window.setTimeout(r, ENTRE_APPUIS_MS))
    }
    setRafale(false)
  }

  return (
    <div className="flex flex-col gap-[5px] px-[11px] py-[7px]" style={{ borderTop: '1px solid var(--line)' }}>
      <div
        className="flex items-center justify-center"
        style={{ border: '1px solid var(--line-strong)', background: 'var(--bg)', minHeight: 66, padding: 4 }}
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
        <Bouton onClick={() => void appuyerUne('left')} actif={!rafale}>
          previous (left)
        </Bouton>
        <Bouton onClick={() => void appuyerUne('right')} actif={!rafale}>
          next (right)
        </Bouton>
        <Bouton onClick={() => void enchainer()} actif={!rafale}>
          next ×{APPUIS_PAR_RAFALE}
        </Bouton>
        <Bouton onClick={() => void appuyerUne('both')} actif={!rafale} fort>
          confirm (both)
        </Bouton>
      </div>
      <div className="t-data-xs" style={{ color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>
        screens seen {texte ? ecrans : <Inconnu quoi="the device screen text" />} · presses {appuis}
        {rafale ? ' · burst running' : ''} · {SPECULOS} every {PERIODE_MS} ms, nothing is replayed
      </div>
      <div className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.4 }}>
        First screen is a guard — <em>blind signing ahead</em> — only{' '}
        <strong style={{ color: 'var(--ink)' }}>confirm</strong> clears it, the left button does
        nothing there. Then <strong style={{ color: 'var(--ink)' }}>next</strong> walks every field.
        The last two screens are <em>Approve</em> and <em>Reject</em>:{' '}
        <strong style={{ color: 'var(--ink)' }}>confirm</strong> on <em>Reject</em> is the refusal,
        and it answers code {CODE_REFUS_UTILISATEUR}.
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
          {p.bps === null ? <Inconnu quoi={`take at ${p.amountIn}`} /> : <>{bpsTexte(p.bps)} bps</>}
        </>
      }
    />
  )
}

/* --------------------------------------------------- ou une porte tombe dans le corpus */

/**
 * OU CETTE PORTE TOMBE PARMI LES AUTRES.
 *
 * Un prelevement seul ne dit rien : 4 bps est-ce beaucoup ? La reponse n'est pas une opinion,
 * elle est dans le corpus — et c'est elle qui empeche a la fois de dramatiser une porte
 * ordinaire et de banaliser une porte extreme.
 */
function Situation({ bps, part, n, total }: { bps: number; part: number; n: number; total: number }) {
  return (
    <L
      k="where it sits"
      v={
        <>
          {partTexte(part)} of the measured rows take more than this one —{' '}
          {groupDigits(String(n))} out of {groupDigits(String(total))}, at {bpsTexte(bps)} bps
        </>
      }
    />
  )
}

/* ------------------------------------------------------------------- la page */

/** Les trois vues de la page. Les deux actes portent la meme paire ; la queue est a part. */
type Vue = 'acte1' | 'acte2' | 'queue'

export function DemoPage() {
  /* Le corpus, lu trois fois et une seule : la table de la garde, la distribution, les actes. */
  const table = useMemo(() => tableDuCorpus(), [])
  const seuils = useMemo(() => thresholdsFor(table), [table])
  const dist = useMemo(() => distribution(), [])
  const paire = useMemo(() => acteSubstitution(), [])
  const queue = useMemo(() => acteStop(), [])

  const [vue, setVue] = useState<Vue>('acte1')
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
  /** Le texte de l'ecran de l'appareil, relu en direct : c'est lui qui fait le compteur. */
  const [ecranTexte, setEcranTexte] = useState<string | null>(null)
  /** Depuis combien de secondes on attend. Attendre quatre minutes en silence, c'est une panne. */
  const [attente, setAttente] = useState(0)

  const fournisseur: Fournisseur | null = (portefeuilles[0]?.provider as Fournisseur | undefined) ?? null
  const minuteur = useRef<number | null>(null)
  /**
   * UNE SEULE REQUETE A LA FOIS, et pas « une seule apres le premier `await` ».
   *
   * Le bouton « prepare » ne se desarmait qu'apres l'aller-retour vers le portefeuille — 60 a
   * 120 ms — et un double clic partait en entier : deux preparations, donc DEUX snapshots, et
   * le fork derivait sous la demonstration. `occupe` est pose avant tout `await`, et ce verrou
   * ferme la fenetre qui reste entre le clic et le rendu.
   */
  const enVol = useRef(false)

  const dire = useCallback((quoi: string, texte: string, dur = false) => {
    setJournal((j) => [{ quoi, texte, dur }, ...j].slice(0, 4))
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

  // LE CHRONO D'ATTENTE. `/demo/approuver` ne rend la main que quand l'humain a tranche sur
  // l'appareil : jusqu'a quatre minutes. Un ecran qui ne bouge pas pendant ce temps-la se lit
  // comme une panne, et c'est exactement le mensonge que tout le reste du site refuse.
  useEffect(() => {
    if (occupe === null) {
      setAttente(0)
      return
    }
    const debut = Date.now()
    const t = window.setInterval(() => setAttente(Math.round((Date.now() - debut) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [occupe])

  // LE TEXTE DE L'ECRAN DE L'APPAREIL, relu tant que l'acte 1 est affiche. Il vient du pont,
  // qui interroge Speculos : le navigateur ne peut pas le lire lui-meme. C'est ce texte qui
  // fait avancer le compteur d'ecrans — un compteur MESURE, jamais estime.
  useEffect(() => {
    if (vue !== 'acte1') return
    let vivant = true
    const tic = async () => {
      const e = await lireEtat()
      if (!vivant) return
      setEcranTexte(estRefus(e) ? null : (e.speculos.ecran ?? null))
    }
    void tic()
    const t = window.setInterval(() => void tic(), PERIODE_ECRAN_MS)
    return () => {
      vivant = false
      window.clearInterval(t)
    }
  }, [vue])

  const etatOk = etat !== null && !estRefus(etat) ? etat : null
  const fork = etatOk?.fork ?? null

  /**
   * LA PAIRE EST LA MEME DANS LES DEUX ACTES : acte 1 lit la porte actuelle, acte 2 propose
   * l'autre. Le service, lui, ne connait que deux noms d'acte — c'est son `substitution` qui
   * porte cette paire, et son `stop` qui porte la queue.
   */
  const acteCourant: Acte | null = vue === 'queue' ? queue : paire
  const acteBridge: 'stop' | 'substitution' = vue === 'queue' ? 'stop' : 'substitution'
  const preparation = prep[acteBridge] ?? null
  const preparationOk = preparation && !estRefus(preparation) ? preparation : null

  /** Les frais LP que le pool de l'acte 1 prend DEJA : le point de comparaison le plus honnete. */
  const fraisDuPool =
    paire && paire.actuelle.row.stored_lp_fee !== null ? lpFeeBps(paire.actuelle.row.stored_lp_fee) : null

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
    if (vue !== 'acte2' || !lecture?.alternative) return null
    const cot = preparationOk?.cotation
    return transactionDeRemplacement(lecture.alternative, {
      cotation: cot === null || cot === undefined ? null : BigInt(cot),
      maintenant: BigInt(Math.floor(Date.now() / 1000)),
    })
  }, [vue, lecture, preparationOk])

  /** Ce que le portefeuille signera : le remplacement rendu par le pont, et rien d'autre. */
  const aSigner: TransactionPrete | null =
    vue === 'acte2' ? (preparationOk?.transaction_remplacement ?? null) : null
  const lectureR = useMemo(
    () =>
      vue !== 'acte2'
        ? null
        : aSigner
          ? lire(table, aSigner.data)
          : envoi?.transaction
            ? lire(table, envoi.transaction.data)
            : null,
    [vue, table, aSigner, envoi],
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
    if (enVol.current) return
    enVol.current = true
    setOccupe('bridge')
    let de = adresse
    if (!de && fournisseur) {
      const c = await comptes(fournisseur)
      if (!estRefus(c)) {
        de = c[0] ?? null
        setAdresse(de)
      }
    }
    const r = await preparer(de ?? ZERO_ADDRESS, acteBridge)
    setOccupe(null)
    enVol.current = false
    setPrep((p) => ({ ...p, [acteBridge]: r }))
    if (estRefus(r)) return dire('bridge', r.raison, true)
    setSoldesAvant(r.soldes)
    setSoldesApres(null)
    dire('bridge', `transaction prepared for act ${acteBridge}`)
  }

  /** Envoie le rapport EIP-712 a l'appareil et attend la decision de l'humain. */
  const demanderAppareil = async () => {
    if (enVol.current) return
    enVol.current = true
    setOccupe('device')
    setAppareil(null)
    const r = await approuver(acteBridge)
    setOccupe(null)
    enVol.current = false
    setAppareil(r)
    if (estRefus(r)) return dire('device', r.raison, true)
    if (typeof r.refus === 'number')
      return dire('device', `${r.raison ?? 'rejected on the device'} — code ${r.refus}, nothing left`, true)
    dire('device', r.signature ? `signed on the device: ${shortAddr(r.signature, 12, 6)}` : 'the device answered')
  }

  /** Un appui sur l'appareil. Rend vrai quand il a abouti : le compteur ne compte que le reel. */
  const bouton = async (b: BoutonAppareil): Promise<boolean> => {
    const r = await appuyer(b)
    if (estRefus(r)) {
      dire('device', r.raison, true)
      return false
    }
    return true
  }

  const signerEtEnvoyer = async () => {
    if (enVol.current) return
    if (!aSigner) return dire('wallet', 'the bridge has not returned a replacement transaction', true)
    if (!fournisseur) return dire('wallet', 'no wallet announced on this page', true)
    enVol.current = true
    setOccupe('signature')
    let de = adresse
    if (!de) {
      const c = await comptes(fournisseur)
      if (estRefus(c)) {
        setOccupe(null)
        enVol.current = false
        return dire('wallet', c.raison, true)
      }
      de = c[0] ?? null
      setAdresse(de)
    }
    if (!de) {
      setOccupe(null)
      enVol.current = false
      return dire('wallet', 'the wallet returned no address', true)
    }
    const r = await envoyer(fournisseur, de, aSigner)
    setOccupe(null)
    enVol.current = false
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
    if (enVol.current) return
    enVol.current = true
    setOccupe('bridge')
    const r = await revenir()
    setOccupe(null)
    enVol.current = false
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

  /** Le bloc « ce que cette porte prend », partage par l'acte 1 et par la queue. */
  const ceQuElleprend = (a: Acte, l: Lecture) => (
    <>
      {l.consultation === null || l.verdict === null ? (
        <L k="measurement" v={<Inconnu quoi="no leg to consult" />} />
      ) : (
        <>
          {/* LE CHIFFRE, EXACT. On ne l'arrondit pas : c'est la mesure, et la page entiere
              existe pour dire que personne ne pouvait la connaitre avant de signer. */}
          <div className="px-[11px] pt-[9px] pb-[5px]">
            <div className="t-metric" style={{ color: TON_VERDICT[l.verdict] }}>
              {l.consultation.bps === null ? (
                <Inconnu quoi="take at this size" />
              ) : (
                <>{bpsTexte(l.consultation.bps)} bps</>
              )}
            </div>
            <div className="t-data-xs mt-[3px]" style={{ color: 'var(--ink-2)' }}>
              {l.consultation.bps === null
                ? 'not measured at this size'
                : `${(l.consultation.bps / POURCENT_EN_BPS).toFixed(3)} % of what you send`}
            </div>
          </div>
          <L k="label" v={`${l.consultation.label} · basis ${l.consultation.basis}`} />
          <L
            k="verdict"
            fort
            v={
              <>
                <span style={{ color: TON_VERDICT[l.verdict] }}>{l.verdict}</span> · warn at{' '}
                {bpsTexte(seuils.warnBps)} bps, block at {bpsTexte(seuils.blockBps)} bps — the 90th and
                99th percentiles of the{' '}
                {seuils.derivesDe === null ? (
                  <Inconnu quoi="percentile base" />
                ) : (
                  groupDigits(String(seuils.derivesDe))
                )}{' '}
                numeric measurements, not round numbers
              </>
            }
          />
          {l.consultation.bps !== null &&
            (() => {
              const p = dist.auDessusDe(l.consultation.bps)
              return <Situation bps={l.consultation.bps} part={p.part} n={p.n} total={dist.n} />
            })()}
          {l.consultation.citations[0] && (
            <L
              k="cited"
              v={
                <>
                  block {fmtBlock(l.consultation.citations[0].blockNumber)} · size{' '}
                  {groupDigits(l.consultation.citations[0].amountIn)} · {l.consultation.citations[0].direction}
                </>
              }
            />
          )}
          <div className="px-[11px] py-[7px]" style={{ borderTop: '1px solid var(--line)' }}>
            <Replay cmd={replayCommand(a.actuelle.row)} />
          </div>
        </>
      )}
    </>
  )

  /** L'etape 01, la meme dans les trois vues : ce qu'un dapp enverrait. */
  const leSwap = (a: Acte, titre: string) => (
    <Etape n={1} sur={vue === 'queue' ? 3 : 4} titre={titre}>
      <L
        k="router"
        v={
          <>
            <span className="hex">{shortAddr(preparationOk?.transaction.to ?? a.routeur, 12, 4)}</span> ·{' '}
            {preparationOk ? 'returned by the bridge' : 'Universal Router, from the guard'}
          </>
        }
      />
      <L
        k="spends"
        v={
          <>
            {groupDigits(a.actuelle.amountIn)} unit(s) of {nomMonnaie(a.actuelle.entree)} →{' '}
            {nomMonnaie(a.actuelle.sortie)}
          </>
        }
      />
      <L
        k="value"
        v={
          <>
            {preparationOk?.transaction.value ?? a.value}
            <span style={{ color: 'var(--ink-2)' }}>
              {a.actuelle.entree === ZERO_ADDRESS
                ? ' · native ETH: the amount travels here'
                : ' · an ERC-20 travels through the router, not in value'}
            </span>
          </>
        }
      />
      <LignePorte p={a.actuelle} role="door taken" />
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
  )

  const onglets: { cle: Vue; titre: string; dispo: boolean }[] = [
    { cle: 'acte1', titre: 'act 1 — you read what you sign', dispo: paire !== null },
    { cle: 'acte2', titre: 'act 2 — there is better', dispo: paire !== null },
  ]

  return (
    <div className="flex flex-col" style={{ gap: 9, minWidth: 0 }}>
      {/* ------------------------------------------------------------- l'en-tete */}
      <div className="flex flex-wrap items-end justify-between gap-x-[26px] gap-y-[6px] voile">
        <div className="flex flex-col" style={{ gap: 4, maxWidth: '66ch' }}>
          <h1 className="t-title m-0">One pair, two acts, on a pinned fork</h1>
          <p className="t-data-sm m-0" style={{ color: 'var(--ink-2)', lineHeight: 1.45 }}>
            ETH → USDC. The guard reads the calldata before the wallet does, pulls the PoolKey out
            — so the hook — and names what it takes. Nobody could know that number before signing.
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

      {/* ------------------------------------ LA DISTRIBUTION, au-dessus des deux actes */}
      <BandeDistribution
        d={dist}
        fraisDuPool={fraisDuPool}
        queueOuverte={vue === 'queue'}
        surQueue={() => setVue(vue === 'queue' ? 'acte1' : 'queue')}
      />

      {/* --------------------------------------------------- le pont, en une ligne */}
      {etat === null && (
        <div className="t-data-xs px-[11px] py-[6px]" style={{ color: 'var(--ink-2)', border: '1px solid var(--line)' }}>
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
              {etat.raison}. The page stays readable: the distribution, the calldata decoding and
              the door comparison below need nobody. What needs the bridge is the fork itself —
              the live quote, the balances and the receipt.
            </>
          }
        />
      )}
      {etatOk && (
        <div
          className="flex flex-wrap items-center gap-[9px] px-[11px] py-[6px]"
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
            {etatOk.fork.block_number === null ? <Inconnu quoi="block number" /> : fmtBlock(etatOk.fork.block_number)} ·
            snapshot {etatOk.snapshot === null ? <Inconnu quoi="snapshot" /> : String(etatOk.snapshot)}
          </span>
          <span className="t-data-xs meta-filet" style={{ color: 'var(--ink-2)' }}>
            device {etatOk.speculos.joignable ? 'reachable' : 'not reachable'}
          </span>
          {etatOk.divergences && etatOk.divergences.length > 0 && (
            <span
              className="t-data-xs meta-filet"
              style={{ color: 'var(--m-5)' }}
              // `consequence` est ecrite en francais par le service : on ne la rend pas. Les
              // quatre champs structures suffisent, et ils sont verifiables.
              title={etatOk.divergences
                .map((d) => `act ${d.acte} · ${d.champ}: announced ${d.annonce}, corpus ${d.corpus}`)
                .join('\n')}
            >
              {etatOk.divergences.length} divergence(s) between the script and the corpus — the corpus wins
            </span>
          )}
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

      {/* ------------------------------------------------------------ les deux actes */}
      <div className="flex flex-wrap items-center gap-[6px]">
        {onglets.map((o) => (
          <button
            key={o.cle}
            type="button"
            onClick={() => setVue(o.cle)}
            disabled={!o.dispo}
            className="t-label"
            style={{
              padding: '7px 13px',
              border: `1px solid ${vue === o.cle ? 'var(--m-4)' : 'var(--line)'}`,
              background: vue === o.cle ? 'var(--bg-3)' : 'transparent',
              color: o.dispo ? 'var(--ink)' : 'var(--ink-4)',
              cursor: o.dispo ? 'pointer' : 'not-allowed',
            }}
          >
            {o.titre}
          </button>
        ))}
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {occupe
            ? `waiting on the ${occupe} — ${attente} s${occupe === 'device' ? ` of the ${DELAI_APPAREIL_S} s it allows` : ''}`
            : vue === 'queue'
              ? 'the tail: one row of the corpus, shown because we publish it too'
              : 'both acts are searched in the corpus, not written down'}
        </span>
        <span className="ml-auto">
          <Bouton onClick={demanderPreparation} actif={!occupe} fort>
            prepare on the fork
          </Bouton>
        </span>
      </div>

      {acteCourant === null && (
        <Absence
          quoi={vue === 'queue' ? 'the tail' : 'this pair'}
          etat="not in this corpus"
          raison={
            vue === 'queue'
              ? 'no numeric measurement in the bundled corpus: there is no tail to show.'
              : 'no size where two doors of this pair are both measured: there is nothing to substitute, and inventing one would be the very fault this project refuses.'
          }
        />
      )}

      {preparation !== null && estRefus(preparation) && (
        <Absence
          quoi={`${PONT}/demo/preparer`}
          etat="refused"
          panne
          raison={`${preparation.raison}. The steps below still read: what they lose is the live quote and the fork, not the measurement.`}
        />
      )}

      {/* ------------------------------------------------------------ les etapes */}
      {acteCourant && lecture && (
        <div className={vue === 'queue' ? 'demo-etapes demo-etapes-3' : 'demo-etapes'}>
          {/* ---------------------------------------------------------------- 01 */}
          {leSwap(
            acteCourant,
            vue === 'queue' ? 'the swap that would go there' : 'the swap, before signature',
          )}

          {/* ---------------------------------------------------------------- 02 */}
          {vue === 'acte2' ? (
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
                          {bpsTexte(lecture.alternative.economie_bps)} bps
                          <span style={{ color: 'var(--ink-2)' }}>
                            {' '}
                            · publication threshold {bpsTexte(lecture.alternative.seuil_bps)} bps
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
                            <span key={p.poolId} className="chip hex" title={`${p.poolId} · ${p.label ?? 'not measured'}`}>
                              {shortAddr(p.poolId, 10, 6)} {p.bps === null ? 'unknown' : `${bpsTexte(p.bps)} bps`}
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
          ) : (
            <Etape n={2} sur={vue === 'queue' ? 3 : 4} titre="the guard reads it, before the wallet">
              <CeQuiEstLu l={lecture} attendu={acteCourant.actuelle.poolId} />
            </Etape>
          )}

          {/* ---------------------------------------------------------------- 03 */}
          {vue === 'acte2' ? (
            <Etape n={3} sur={4} titre="the replacement, built and not sent">
              {/* PAS de `suite` ici. Elle viendrait de SUITE, dans ../compte/substitution.ts, ou
                  l'etat PRET est encore libelle en francais — et cet ecran-ci est en anglais. */}
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
                  v="the bridge has not returned one, and no live quote is available here: “prepare on the fork” asks for both."
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
                          · live quote{' '}
                          {preparationOk.cotation === null ? 'unknown' : groupDigits(preparationOk.cotation)}
                          {preparationOk.tolerance_bps == null
                            ? ''
                            : ` minus ${bpsTexte(preparationOk.tolerance_bps)} bps`}
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
          ) : (
            <Etape n={3} sur={vue === 'queue' ? 3 : 4} titre="what this door takes">
              {ceQuElleprend(acteCourant, lecture)}
              {vue === 'queue' && lecture.alternative && (
                <EtatNomme
                  etat={lecture.alternative.etat}
                  suite={AFFICHAGE[lecture.alternative.etat]?.titre}
                  raison={
                    <>
                      One row out of {groupDigits(String(dist.nLignes))}, on a token nobody holds. It is
                      published because it exists — not because it is the norm. The norm is the band
                      above.
                    </>
                  }
                  ton={lecture.verdict ? TON_VERDICT[lecture.verdict] : undefined}
                />
              )}
            </Etape>
          )}

          {/* ---------------------------------------------------------------- 04 */}
          {vue === 'acte1' && (
            <Etape n={4} sur={4} titre="the device asks, you refuse">
              <div className="px-[11px] pt-[7px] pb-[1px] t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.4 }}>
                You do not sign a digest you cannot read: the report goes over field by field.
              </div>
              <EcranAppareil onBouton={bouton} texte={ecranTexte ?? etatOk?.speculos.ecran ?? null} />
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
          )}

          {vue === 'acte2' && (
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
                      <span style={{ color: 'var(--ink-2)' }}> · {recuTx ? 'included' : 'waiting for the receipt…'}</span>
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
              <div
                className="px-[11px] py-[7px] t-data-xs"
                style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)', lineHeight: 1.45 }}
              >
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
