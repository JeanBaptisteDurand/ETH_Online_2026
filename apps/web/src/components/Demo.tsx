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
import { Copy, Replay } from './Prim'
import { EtatNomme } from './Substituer'
import { AFFICHAGE } from '../compte/substitution'
import { ecouterPortefeuilles, type PortefeuilleAnnonce } from '../compte/api'
import { RPC_LOCAL, chainName, fmtBlock, groupDigits, replayCommand, shortAddr } from '../lib/format'
import { symbole } from './Carte'
import { CeQuOnAGarde, DeuxRoutes, RouteSwap, type PorteRoute, type RouteCandidate } from './DemoRoute'
import { PanneauPaires, nomJeton } from './DemoPaires'
import { montantLisible } from '../demo/jetons'
import { cleDe, lpFeeBps as lpDuPool } from '../demo/paires'
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
  Eip1193Provider,
  Envoi,
  GuardReport,
  GuardTable,
  SwapLeg,
  Verdict,
} from '../demo/garde.mjs'
import { poserLaGarde } from '../demo/interception'
import {
  CODE_REFUS_UTILISATEUR,
  PONT,
  ajouterEtBasculer,
  appuyer,
  approuver,
  comptes,
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

/**
 * D'OU VIENT UNE VALEUR — et c'est tout l'argument du produit.
 *
 * L'utilisateur ne fournit RIEN : ni pool id, ni adresse de hook, ni taille. La garde les LIT
 * dans le calldata que le site d'echange a construit. Une page qui affiche ces valeurs comme
 * si elles avaient ete saisies se confond avec un formulaire ou l'on colle une adresse — ce
 * qui est exactement ce que ce produit n'est pas. Chaque ligne porte donc un lisere qui dit sa
 * provenance, et le pave de legende en haut du panneau les nomme.
 */
export type Source = 'calldata' | 'derive' | 'corpus' | 'chaine'

/**
 * LE LISERE PORTE UNE PROVENANCE, donc il doit se DISTINGUER. `calldata` et `derive` etaient
 * deux gris a 1,2:1 l'un de l'autre (#383c42 contre #454a50) : sur une video compressee, un
 * seul gris. Ils sont maintenant l'encre pleine et l'encre moyenne — un ecart de clarte qui
 * survit a la compression — et la legende les NOMME en toutes lettres.
 */
const LISERE: Record<Source, string> = {
  calldata: 'var(--ink)',
  derive: 'var(--ink-3)',
  corpus: 'var(--m-4)',
  chaine: 'var(--focus)',
}

const DIT: Record<Source, string> = {
  calldata: 'read from the calldata — nobody typed it',
  derive: 're-derived here, then matched against the corpus',
  corpus: 'from the published measurements',
  chaine: 'read on the chain',
}

/** Une ligne « clef / valeur », la meme forme que le panneau 16 de l'instrument. */
function L({
  k,
  v,
  fort = false,
  gros = false,
  src,
}: {
  k: string
  v: React.ReactNode
  fort?: boolean
  /** la valeur porte la demonstration : elle passe au corps de lecture (14 px dans la scene) */
  gros?: boolean
  src?: Source
}) {
  return (
    <div
      className="flex items-baseline gap-[9px] px-[11px] py-[2px]"
      style={{
        borderTop: '1px solid var(--line)',
        minWidth: 0,
        boxShadow: src ? `inset 3px 0 0 ${LISERE[src]}` : undefined,
      }}
      title={src ? DIT[src] : undefined}
    >
      <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 92, flex: 'none' }}>
        {k}
      </span>
      <span
        className={gros ? 't-data' : 't-data-xs'}
        style={{ color: fort ? 'var(--ink)' : 'var(--ink-2)', overflowWrap: 'anywhere', minWidth: 0 }}
      >
        {v}
      </span>
    </div>
  )
}

/**
 * Une etape. L'ordinal est CELUI DE LA BARRE DES SIX ETAPES, en bas de la scene : un panneau
 * « 02 the guard got there first » renvoie a la case « 02 the guard intercepts ». Il disait
 * « 02/03 » — une seconde numerotation a cote de la premiere, et un jury qui ne sait plus
 * laquelle suivre. Sans ordinal, le panneau n'est pas une etape du parcours.
 */
function Etape({ n, titre, children }: { n?: number; titre: string; children: React.ReactNode }) {
  return (
    <section
      className="flex flex-col"
      style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', minWidth: 0 }}
    >
      <header className="px-[11px] pt-[3px] pb-[2px] flex items-baseline gap-[8px]">
        {n !== undefined && (
          <span className="t-label" style={{ color: 'var(--m-4)', flex: 'none' }}>
            {String(n).padStart(2, '0')}
          </span>
        )}
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

/**
 * UN BOUTON QUI DIT SON ROLE PAR SA FORME — avec la palette du site, et rien d'autre.
 *
 *   contour  un prealable (ajouter le reseau)          filet neutre, fond vide
 *   plein    un etat qu'on pose (le portefeuille)      fond souleve, filet fort
 *   alerte   un geste qui DETRUIT l'etat (reset)       filet et encre de signal, --m-5
 *   accent   L'action principale — une par ecran       plein orange, encre du fond
 *
 * La forme vit dans la charte (index.css, .demo-bouton-*), pas en style en ligne : l'etat
 * desactive doit pouvoir la reprendre, et un style en ligne l'emporterait sur `:disabled`.
 * `etiquette` est le nom accessible quand le libelle visible est plus court que le geste.
 */
function BoutonRole({
  role,
  onClick,
  actif = true,
  titre,
  etiquette,
  grand = false,
  children,
}: {
  role: 'contour' | 'plein' | 'alerte' | 'accent'
  onClick: () => void
  actif?: boolean
  titre?: string
  etiquette?: string
  grand?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!actif}
      title={titre}
      aria-label={etiquette}
      className={`demo-bouton demo-bouton-${role}${grand ? ' demo-bouton-grand' : ''}`}
    >
      {children}
    </button>
  )
}

/**
 * UNE DES TROIS REPONSES. Elles etaient en 11 px, avec un filet que le fond avalait : deux sur
 * trois se lisaient comme du texte, pas comme des boutons. Elles montent au corps de lecture,
 * portent un filet visible, et la TOUCHE qui les declenche.
 *
 * La touche est `aria-hidden` : le nom accessible reste exactement le libelle — « refuse ·
 * send nothing » — et ne devient pas « 1 refuse · send nothing ». Le chiffre est une aide pour
 * l'oeil et pour la main, pas une partie de la reponse.
 */
function BoutonChoix({
  touche,
  onClick,
  actif,
  fort = false,
  titre,
  children,
}: {
  touche: 1 | 2 | 3
  onClick: () => void
  actif: boolean
  fort?: boolean
  titre?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!actif}
      title={titre}
      className={`demo-bouton-choix${fort ? ' demo-bouton-choix-fort' : ''}`}
    >
      <kbd aria-hidden="true" className="demo-touche">
        {touche}
      </kbd>
      <span>{children}</span>
    </button>
  )
}

/**
 * Combien d'ecrans l'appareil a rendus. Le contrat du pont dit un NOMBRE ; le pont publie rend
 * la LISTE des textes relus. On compte ce qu'on recoit, sans rien supposer : une liste se
 * compte, un nombre se lit, le reste ne s'affiche pas.
 */
function nombreDEcrans(a: Approbation | Refus | null): number | null {
  if (a === null || estRefus(a)) return null
  const e: unknown = a.ecrans
  if (Array.isArray(e)) return e.length
  return typeof e === 'number' ? e : null
}

const TON_VERDICT: Record<Verdict, string> = {
  ok: 'var(--ink-2)',
  warn: 'var(--m-5)',
  block: 'var(--m-3)',
}

/**
 * Le nom d'une monnaie : le symbole LU sur la chaine d'abord, puis l'adresse tronquee. Quand
 * `symbol()` n'a pas ete lu pour cette adresse, on rend l'adresse SEULE — un joli nom invente
 * vaut moins qu'une adresse nue, et c'est la regle que tout ce depot applique.
 */
const nomMonnaie = (a: string): string => nomJeton(a)

/** Le symbole seul, pour les phrases ou l'adresse encombrerait. Peut etre null. */
const sym = (a: string): string | null => symbole(a)

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
      {/* LA LEGENDE. Un spectateur doit voir d'un coup d'oeil ce qui vient de la transaction,
          ce qui vient du calcul, et ce qui vient des mesures publiees. */}
      <div
        className="px-[11px] py-[2px] flex flex-wrap gap-x-[10px] t-data-xs"
        style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}
      >
        {(['calldata', 'derive', 'corpus'] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-[4px]">
            <span aria-hidden="true" style={{ width: 8, height: 2, background: LISERE[k], display: 'inline-block' }} />
            {k === 'calldata' ? 'read from the calldata' : k === 'derive' ? 're-derived' : 'from the corpus'}
          </span>
        ))}
      </div>
      <L
        src="calldata"
        k="commands"
        v={
          <>
            <span className="hex" title={`selector ${l.decode.selector}`}>
              {l.decode.commands}
            </span>{' '}
            · {nomsDeCommandes(l.decode.commands).join(' then ')}
          </>
        }
      />
      {l.leg === null ? (
        <L src="calldata" k="swap" v={<Inconnu quoi="no v4 swap in this calldata" />} />
      ) : (
        <>
          <L
            src="calldata"
            k="poolkey"
            v={
              <>
                {nomMonnaie(l.leg.poolKey.currency0)} / {nomMonnaie(l.leg.poolKey.currency1)} · fee{' '}
                {l.leg.poolKey.fee} · tickSpacing {l.leg.poolKey.tickSpacing}
              </>
            }
          />
          <L src="calldata" k="hook" fort v={<span className="hex">{l.leg.poolKey.hooks}</span>} />
          <L
            src="derive"
            k="pool id"
            v={
              <>
                <span className="hex">{shortAddr(l.leg.poolId, 12, 6)}</span>
                <span style={{ color: 'var(--ink-2)' }}>
                  {attendu === undefined
                    ? ' · re-derived'
                    : l.leg.poolId === attendu
                      ? ' · re-derived, matches the corpus'
                      : ' · re-derived, NOT the pool expected'}
                </span>
              </>
            }
          />
          <L
            src="calldata"
            k="direction"
            v={
              <>
                {l.leg.direction} · {l.leg.actionName} ·{' '}
                {l.leg.amountIn === null ? <Inconnu quoi="size fixed by the calldata" /> : groupDigits(l.leg.amountIn)}
                <span style={{ color: 'var(--ink-3)' }}>
                  {' '}
                  ·{' '}
                  {l.decode.complete
                    ? 'read whole'
                    : l.decode.issues.map((i) => `${i.where}: ${i.reason}`).join(' · ')}
                </span>
              </>
            }
          />
        </>
      )}
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
/** Combien d'ecrans defiles on garde sous les yeux. Au-dela, la trace cesse d'etre lisible. */
const TRACE_MAX = 3

function EcranAppareil({
  onBouton,
  texte,
  lireEcran,
  grand = false,
  sousLEcran,
  aCote,
}: {
  onBouton: (b: BoutonAppareil) => Promise<boolean>
  texte?: string | null
  /** relit le texte de l'ecran, une fois. La rafale s'en sert pour ne rien sauter. */
  lireEcran: () => Promise<string | null>
  /** vrai quand le plan est sur l'appareil : c'est l'objet que le jury fixe */
  grand?: boolean
  /** ce qui se lit JUSTE SOUS l'ecran — l'etat de ce qui est parti, pas la mecanique */
  sousLEcran?: React.ReactNode
  /**
   * ce qui se lit A COTE de l'ecran, au repos. La carte de l'appareil est la plus large de la
   * rangee : empiler le contexte sous l'ecran la rendait la plus HAUTE, et c'est la hauteur que
   * la scene n'a pas.
   */
  aCote?: React.ReactNode
}) {
  const [jeton, setJeton] = useState(0)
  const [dispo, setDispo] = useState<boolean | null>(null)
  const [appuis, setAppuis] = useState(0)
  const [ecrans, setEcrans] = useState(0)
  const [rafale, setRafale] = useState(false)
  const rafaleRef = useRef(false)
  rafaleRef.current = rafale
  /**
   * CE QUI VIENT DE PASSER.
   *
   * Mesure faite en direct : avec une rafale, `take 4.09 bps` n'est reste lisible a l'ecran
   * dans AUCUN des deux passages de l'audit. La rafale mene au refus, mais elle saute
   * par-dessus le seul champ qui porte la demonstration. On garde donc la TRACE des ecrans
   * defiles — relus sur l'appareil, un par appui — pour que la salle voie ce qui est passe
   * meme si c'etait rapide. Aucune liste ecrite d'avance : ce serait montrer une chose et en
   * signer une autre.
   */
  const [trace, setTrace] = useState<string[]>([])
  const dernier = useRef<string | null>(null)

  useEffect(() => {
    const t = window.setInterval(() => setJeton((n) => n + 1), PERIODE_MS)
    return () => window.clearInterval(t)
  }, [])

  // LE COMPTEUR D'ECRANS EST MESURE : il avance quand le texte relu sur l'appareil CHANGE.
  // Un total annonce d'avance serait une estimation, et une estimation affichee comme un
  // repere devient un chiffre faux des que le rapport gagne un champ.
  const noter = useCallback((brut: string | null) => {
    const t = (brut ?? '').trim()
    if (!t || t === dernier.current) return
    dernier.current = t
    setEcrans((n) => n + 1)
    setTrace((l) => [t, ...l].slice(0, TRACE_MAX))
  }, [])

  useEffect(() => noter(texte ?? null), [texte, noter])

  const appuyerUne = async (b: BoutonAppareil) => {
    const ok = await onBouton(b)
    if (ok) setAppuis((n) => n + 1)
    return ok
  }

  /**
   * ESPACE (ou fleche droite) = « next (right) », et SEULEMENT quand le plan est sur l'appareil. Devant un jury,
   * viser un bouton a la souris coute un regard ; une touche ne coute rien. Au repos l'appareil
   * affiche son menu, et un appui droit n'y avancerait rien : la touche s'y tait.
   *
   * Trois precautions. La repetition automatique est ignoree — tenir la barre enverrait trente
   * appuis par seconde a Speculos. Le defilement de la page est empeche. Et le bouton qui a le
   * focus le perd : sans ca, espace « cliquerait » aussi le dernier bouton clique a la souris —
   * typiquement confirm (both) — et confirmerait deux fois.
   */
  const appuyerRef = useRef(appuyerUne)
  appuyerRef.current = appuyerUne
  useEffect(() => {
    if (!grand) return
    const surTouche = (e: KeyboardEvent) => {
      if ((e.key !== ' ' && e.key !== 'ArrowRight' && e.key !== 'Enter') || e.metaKey || e.ctrlKey || e.altKey) return
      const cible = e.target as HTMLElement | null
      if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName))) return
      e.preventDefault()
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      if (e.repeat || rafaleRef.current) return
      // Entree confirme (les deux boutons), espace et fleche droite avancent. Sans Entree, il
      // fallait lacher le clavier pour viser « confirm » a la souris devant le jury.
      void appuyerRef.current(e.key === 'Enter' ? 'both' : 'right')
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [grand])

  /**
   * LA RAFALE LIT APRES CHAQUE APPUI. Elle ne se contente pas d'appuyer vite : elle relit
   * l'ecran entre deux appuis, ce qui la cadence naturellement ET garantit qu'aucun champ ne
   * passe sans etre note. Appuyer plus vite que la lecture reviendrait a montrer un defilement
   * dont on ne saurait pas dire ce qu'il a contenu.
   */
  const enchainer = async () => {
    setRafale(true)
    for (let i = 0; i < APPUIS_PAR_RAFALE; i += 1) {
      const ok = await appuyerUne('right')
      if (!ok) break
      await new Promise((r) => window.setTimeout(r, ENTRE_APPUIS_MS))
      noter(await lireEcran())
    }
    setRafale(false)
  }

  const ecran = (
    <div className={grand ? 'demo-ecran demo-ecran-grand' : 'demo-ecran'}>
      <img
        src={urlEcran(jeton)}
        alt="the device screen, live"
        onLoad={() => setDispo(true)}
        onError={() => setDispo(false)}
        style={{
          display: dispo === true ? 'block' : 'none',
          imageRendering: 'pixelated',
          maxWidth: '100%',
          height: '100%',
          width: 'auto',
          objectFit: 'contain',
        }}
      />
      {dispo !== true && (
        <span className="t-data-xs" style={{ color: 'var(--ink-2)', textAlign: 'center' }}>
          {dispo === null ? 'reading the device screen…' : 'device screen unavailable'}
        </span>
      )}
    </div>
  )

  return (
    <div className="flex flex-col gap-[5px] px-[11px] py-[6px]" style={{ borderTop: '1px solid var(--line)' }}>
      {/* L'ECRAN A UNE HAUTEUR FIXE, en multiple entier de ses 64 lignes (voir .demo-ecran) :
          l'image reste nette en `pixelated`, et la hauteur de la scene ne depend plus de la
          largeur de la colonne. Elle en dependait : a `width: 100%` l'ecran montait a 360 px
          en phase 3, et la page defilait de 120 px devant le jury.

          Le texte relu n'est plus repete sous l'ecran : au repos « on the device: » le porte,
          en phase 3 « field now » le porte en gros. C'etait la meme ligne deux fois. */}
      {aCote ? (
        <div className="demo-ecran-rangee">
          <div className="demo-ecran-colonne">
            {ecran}
            {sousLEcran}
          </div>
          <div className="demo-ecran-contexte">{aCote}</div>
        </div>
      ) : (
        <>
          {ecran}
          {sousLEcran}
        </>
      )}
      <div className="flex flex-wrap items-center gap-[6px]">
        <BoutonRole role="contour" onClick={() => void appuyerUne('left')} actif={!rafale} titre="previous — does nothing on the guard screen">
          previous (left)
        </BoutonRole>
        <BoutonRole role="contour" onClick={() => void appuyerUne('right')} actif={!rafale} titre="next field — the space bar does it too while the plan is on the device">
          next (right)
        </BoutonRole>
        <BoutonRole role="contour" onClick={() => void enchainer()} actif={!rafale} titre={`${APPUIS_PAR_RAFALE} next presses, reading the screen between each`}>
          ×{APPUIS_PAR_RAFALE}
        </BoutonRole>
        <BoutonRole role="plein" onClick={() => void appuyerUne('both')} actif={!rafale} titre="confirm the screen">
          confirm (both)
        </BoutonRole>
      </div>
      {/* LA TRACE TIENT SUR UNE LIGNE. Elle passait a la ligne et se coupait a mi-hauteur sous
          son `maxHeight` : un demi-texte n'est pas une trace, c'est une rature. Le plus recent
          d'abord ; ce qui ne tient pas se tronque, et se lit entier au survol. */}
      {trace.length > (grand ? 0 : 1) && (
        <div
          className="flex gap-[4px]"
          aria-label="the screens that just went by"
          style={{ overflow: 'hidden', minWidth: 0 }}
        >
          {trace.map((t, i) => (
            <span
              key={`${i}-${t}`}
              className="t-data-xs hex px-[5px]"
              title={t}
              style={{
                border: '1px solid var(--line-strong)',
                background: i === 0 ? 'var(--bg-3)' : 'transparent',
                // Un champ qui porte un CHIFFRE est celui que la demonstration doit montrer :
                // il se distingue, sans qu'on ait besoin de savoir lequel c'est a l'avance.
                color: /\d/.test(t) ? 'var(--m-4)' : 'var(--ink-2)',
                flex: i === 0 ? '0 0 auto' : '0 1 auto',
                maxWidth: '100%',
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t}
            </span>
          ))}
        </div>
      )}
      <div className="demo-ecran-pied">
      <div className="t-data-xs" style={{ color: 'var(--ink-2)', overflowWrap: 'anywhere' }}>
        screens {texte ? ecrans : <Inconnu quoi="the device screen text" />} · presses {appuis}
        {rafale ? ' · burst' : ''} · live every {PERIODE_MS} ms, nothing is replayed
      </div>
      <details>
        <summary className="t-data-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
          the gesture, in order
        </summary>
        <div className="t-data-xs mt-[3px]" style={{ color: 'var(--ink-2)', lineHeight: 1.4 }}>
          First screen is a guard — <em>blind signing ahead</em> — only{' '}
          <strong style={{ color: 'var(--ink)' }}>confirm</strong> clears it, the left button does
          nothing there. Then <strong style={{ color: 'var(--ink)' }}>next</strong> walks every field.
          The last two screens are <em>Approve</em> and <em>Reject</em>:{' '}
          <strong style={{ color: 'var(--ink)' }}>confirm</strong> on <em>Reject</em> is the refusal,
          and it answers code {CODE_REFUS_UTILISATEUR}.
        </div>
      </details>
      </div>
    </div>
  )
}

/* ----------------------------------------------------------------- une porte */

/**
 * OU CETTE PORTE TOMBE PARMI LES AUTRES.
 *
 * Un prelevement seul ne dit rien : 4 bps, est-ce beaucoup ? La reponse n'est pas une opinion,
 * elle est dans le corpus — et c'est elle qui empeche a la fois de dramatiser une porte
 * ordinaire et de banaliser une porte extreme.
 */
function Situation({ part, n, total }: { part: number; n: number; total: number }) {
  return (
    <L
      src="corpus"
      k="where it sits"
      v={
        <>
          {partTexte(part)} of the corpus takes more than this — {groupDigits(String(n))}/
          {groupDigits(String(total))}
        </>
      }
    />
  )
}

/* ------------------------------------------------------------------- la page */


/**
 * UNE SEULE HISTOIRE, DEUX FINS.
 *
 * Plus deux actes cote a cote : un seul parcours, celui de l'extension. L'utilisateur clique
 * « swap » comme sur n'importe quel site d'echange, la garde intercepte AVANT le portefeuille,
 * son rapport part a l'appareil, et l'humain decide la. Le refus et la substitution sont deux
 * ISSUES DU MEME CLIC, rejouables sans recharger.
 */
type Issue =
  /** l'humain a refuse : 4001 rendu a l'appelant, le portefeuille jamais ouvert */
  | 'REFUSEE'
  /** l'humain passe QUAND MEME : la transaction D'ORIGINE part au portefeuille, telle quelle */
  | 'ORIGINE'
  /** l'humain substitue : la transaction DE REMPLACEMENT part, en second appel delibere */
  | 'REMPLACEMENT'

/**
 * Ce que l'ecran ECRIT pour chaque issue. Les valeurs ci-dessus sont des etats internes, lus par
 * le code et par les tests ; elles n'ont jamais eu vocation a etre affichees telles quelles, et
 * elles s'affichaient en francais au milieu d'une page anglaise.
 */
const LIBELLE_ISSUE: Record<Issue, string> = {
  REFUSEE: 'refused',
  ORIGINE: 'sent as is',
  REMPLACEMENT: 'other gate taken',
}

/**
 * LES TROIS REPONSES A LA MEME QUESTION.
 *
 * Il n'y a qu'un objet de decision — le RAPPORT de la garde — et il nomme deux faits : ce que
 * la porte actuelle prend, et ce qu'une autre prendrait. L'humain n'a donc pas deux questions,
 * il en a une, avec trois reponses. La troisieme, « passer quand meme », est celle qui compte
 * le plus pour la credibilite : sans elle, un outil qui n'offre que « refuse » ou « prends ma
 * route » est un routeur deguise. La garde INFORME, elle ne decide pas a la place.
 */
type Choix = 'refuser' | 'passer' | 'substituer'

/** La vue de reference : la queue du corpus, ouverte depuis le bandeau. Pas un acte. */
type Vue = 'parcours' | 'queue'

export function DemoPage() {
  /* Le corpus, lu une fois : la table de la garde, la distribution, la paire, la queue. */
  const table = useMemo(() => tableDuCorpus(), [])
  const seuils = useMemo(() => thresholdsFor(table), [table])
  const dist = useMemo(() => distribution(), [])
  const paire = useMemo(() => acteSubstitution(), [])
  const queue = useMemo(() => acteStop(), [])

  const [vue, setVue] = useState<Vue>('parcours')
  const [etat, setEtat] = useState<EtatDemo | Refus | null>(null)
  const [portefeuilles, setPortefeuilles] = useState<PortefeuilleAnnonce[]>([])
  const [adresse, setAdresse] = useState<string | null>(null)
  const [journal, setJournal] = useState<{ quoi: string; texte: string; dur?: boolean }[]>([])
  const alerte = journal.find((l) => l.dur) ?? null
  const [prep, setPrep] = useState<Record<string, Preparation | Refus | null>>({})
  const [hash, setHash] = useState<string | null>(null)
  const [recuTx, setRecuTx] = useState<Recu | null>(null)
  const [soldesAvant, setSoldesAvant] = useState<Soldes | null>(null)
  const [soldesApres, setSoldesApres] = useState<Soldes | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [ecranTexte, setEcranTexte] = useState<string | null>(null)
  const [attente, setAttente] = useState(0)
  const [paireChoisie, setPaireChoisie] = useState<string>('')
  const [basculee, setBasculee] = useState(false)

  /* ---------------------------------------------------- l'etat du parcours */
  /** Ce que la garde a lu du calldata interceptE. Null tant qu'on n'a pas clique. */
  const [rapport, setRapport] = useState<GuardReport | null>(null)
  /** Vrai pendant que l'appareil affiche le rapport et qu'on attend la main humaine. */
  const [demande, setDemande] = useState(false)
  const [issue, setIssue] = useState<Issue | null>(null)
  const [codeRendu, setCodeRendu] = useState<number | null>(null)
  const [ouvertures, setOuvertures] = useState(0)
  /** Combien de fois l'appareil a rendu des ecrans, quand il l'a dit. */
  const [appareil, setAppareil] = useState<Approbation | Refus | null>(null)
  /** Qui a decide, et pourquoi — repris du `ApprovalDecision` de la garde. */
  const [decision, setDecision] = useState<{ by: string; reason: string; attestation?: string | null } | null>(null)

  const fournisseurBrut: Fournisseur | null = (portefeuilles[0]?.provider as Fournisseur | undefined) ?? null
  const minuteur = useRef<number | null>(null)
  const enVol = useRef(false)
  /** La main posee sur la decision en cours : l'echappatoire de scene, quand le pont manque. */
  const trancher = useRef<((d: { approved: boolean; by: string; reason: string; attestation?: string | null }) => void) | null>(null)
  /** Laquelle des trois reponses a ete donnee. Lue apres coup : la garde, elle, ne connait que oui/non. */
  const choix = useRef<Choix | null>(null)
  /** La main posee sur le CHOIX DU PLAN, avant que l'appareil ne confirme quoi que ce soit. */
  const choisir = useRef<((c: Choix) => void) | null>(null)
  /**
   * LE PLAN DEJA APPROUVE SUR L'APPAREIL.
   *
   * Substituer, c'est refuser la transaction d'origine puis envoyer le remplacement — donc un
   * SECOND appel, que la garde intercepte aussi. Redemander a l'appareil de confirmer le plan
   * qu'un humain vient d'approuver champ par champ ne protegerait personne : ce serait la meme
   * question, posee deux fois, et une garde qui demande deux fois se fait desinstaller. On
   * retient donc le pool approuve, et on ne redemande que si le calldata vise autre chose.
   */
  const planApprouve = useRef<string | null>(null)
  /** La transaction de remplacement, vue par l'approbateur : Approve sur l'appareil vaut « le plan ». */
  const remplacementRef = useRef<TransactionPrete | null>(null)

  const dire = useCallback((quoi: string, texte: string, dur = false) => {
    setJournal((j) => [{ quoi, texte, dur }, ...j].slice(0, 3))
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
  useEffect(() => {
    if (occupe === null) {
      setAttente(0)
      return
    }
    const debut = Date.now()
    const t = window.setInterval(() => setAttente(Math.round((Date.now() - debut) / 1000)), 1000)
    return () => window.clearInterval(t)
  }, [occupe])

  /**
   * LE TEMPS QUI RESTE A L'APPAREIL, et il doit se VOIR arriver.
   *
   * Lire un nombre qui monte ne previent de rien : la jauge sous la rangee de choix se vide, et
   * elle passe a l'encre d'alerte sur la fin. La phase de CHOIX, elle, n'expire pas — on attend
   * un humain devant sa page, pas une requete.
   */
  /**
   * LA MISE EN PAGE SUIT LA PHASE.
   *
   * Tout avait la meme importance tout le temps, donc rien ne guidait l'oeil. Quatre phases,
   * quatre hierarchies : au repos la these domine ; quand la garde demande, les deux routes et
   * les trois choix prennent la place ; quand le plan est sur l'appareil, l'ecran du Ledger
   * devient l'objet central — c'est lui que le jury fixe pendant vingt secondes ; a la fin,
   * c'est ce qu'on a garde. Ce qui ne compte pas a cet instant se replie, il ne disparait pas.
   */
  const restantS = occupe === 'device' ? Math.max(0, DELAI_APPAREIL_S - attente) : null
  const partRestante = restantS === null ? null : restantS / DELAI_APPAREIL_S

  const etatOk = etat !== null && !estRefus(etat) ? etat : null
  const fork = etatOk?.fork ?? null
  /**
   * LE NOEUD QUE LA COMMANDE DE REJEU VISE.
   *
   * Il vient de `/demo/etat`, jamais du JSX : le fork est public, et son adresse changera le
   * jour ou le sous-domaine sera pose. Sans le pont on retombe sur l'anvil local — et la ligne
   * en dessous le dit, parce qu'une commande qui ne tourne que chez nous rend fausse la
   * promesse ecrite partout ici.
   */
  const rpcRejeu = fork?.rpc ?? RPC_LOCAL
  const rejouable = fork?.rpc != null

  /** Une lecture du texte de l'ecran, par le pont. Le navigateur ne peut pas lire Speculos. */
  const lireEcran = useCallback(async (): Promise<string | null> => {
    const e = await lireEtat()
    const t = estRefus(e) ? null : (e.speculos.ecran ?? null)
    setEcranTexte(t)
    return t
  }, [])

  /**
   * LE PREALABLE TECHNIQUE, FAIT EN SILENCE.
   *
   * Crediter l'adresse, prendre un instantane, construire le calldata : c'est le travail du
   * site d'echange, pas un geste de l'utilisateur. On le fait au chargement, une fois, pour que
   * la route, l'empreinte et le calldata affiches soient ceux du pont des la premiere seconde —
   * et pour que le seul bouton de la scene s'appelle « swap », comme sur n'importe quel site.
   */
  const prepareAuChargement = useRef(false)
  useEffect(() => {
    if (!etatOk || prepareAuChargement.current) return
    prepareAuChargement.current = true
    void preparer(adresse ?? ZERO_ADDRESS, 'substitution').then((r) =>
      setPrep((p) => ({ ...p, substitution: r })),
    )
    void preparer(ZERO_ADDRESS, 'stop').then((r) => setPrep((p) => ({ ...p, stop: r })))
  }, [etatOk, adresse])

  useEffect(() => {
    if (vue !== 'parcours') return
    void lireEcran()
    const t = window.setInterval(() => void lireEcran(), PERIODE_ECRAN_MS)
    return () => window.clearInterval(t)
  }, [vue, lireEcran])

  type Phase = 'repos' | 'choix' | 'appareil' | 'fini'
  const phase: Phase =
    vue === 'queue'
      ? 'repos'
      : issue !== null
        ? 'fini'
        : demande && occupe === 'device'
          ? 'appareil'
          : demande
            ? 'choix'
            : 'repos'

  const acteAffiche: Acte | null = vue === 'queue' ? queue : paire
  const acteBridge: 'stop' | 'substitution' = vue === 'queue' ? 'stop' : 'substitution'
  const preparation = prep[acteBridge] ?? null
  const preparationOk = preparation && !estRefus(preparation) ? preparation : null

  const fraisDuPool =
    paire && paire.actuelle.row.stored_lp_fee !== null ? lpFeeBps(paire.actuelle.row.stored_lp_fee) : null
  const cleExecutee = paire ? cleDe(paire.actuelle.entree, paire.actuelle.sortie) : ''
  const surLaPaireExecutee = paireChoisie === '' || paireChoisie === cleExecutee

  const montantLisibleActe = acteAffiche
    ? montantLisible(acteAffiche.actuelle.amountIn, acteAffiche.actuelle.entree)
    : null
  const libelleSwap = acteAffiche
    ? `swap ${montantLisibleActe ?? groupDigits(acteAffiche.actuelle.amountIn)} ${
        sym(acteAffiche.actuelle.entree) ?? shortAddr(acteAffiche.actuelle.entree)
      } → ${sym(acteAffiche.actuelle.sortie) ?? shortAddr(acteAffiche.actuelle.sortie)}`
    : 'swap'

  /** La porte, dans la forme compacte de RouteSwap. */
  const porteChoisie = (p: Porte | null | undefined): PorteRoute | null =>
    p
      ? {
          poolId: p.poolId,
          hook: p.hook,
          bps: p.bps,
          lpBps: p.row.stored_lp_fee === null ? null : lpDuPool(p.row.stored_lp_fee),
        }
      : null

  /** Une route candidate : la porte, ce qu'elle prend, et ce que le swap REND par elle. */
  const candidate = (p: Porte | null | undefined): RouteCandidate | null =>
    p
      ? {
          poolId: p.poolId,
          hook: p.hook,
          bps: p.bps,
          lpBps: p.row.stored_lp_fee === null ? null : lpDuPool(p.row.stored_lp_fee),
          // `out_with` est la sortie MESUREE par cette porte. Absente, elle reste « unknown ».
          recu: p.row.out_with,
        }
      : null

  /** Le calldata intercepte : celui du pont quand il repond, celui du corpus sinon. */
  const calldata = preparationOk?.transaction.data ?? acteAffiche?.calldata ?? null
  const lecture = useMemo(() => (calldata ? lire(table, calldata) : null), [table, calldata])

  const envoi: Envoi | null = useMemo(() => {
    if (!lecture?.alternative) return null
    const cot = preparationOk?.cotation
    return transactionDeRemplacement(lecture.alternative, {
      cotation: cot === null || cot === undefined ? null : BigInt(cot),
      maintenant: BigInt(Math.floor(Date.now() / 1000)),
    })
  }, [lecture, preparationOk])

  const remplacement: TransactionPrete | null =
    preparationOk?.transaction_remplacement ?? envoi?.transaction ?? null
  remplacementRef.current = remplacement

  /* ------------------------------------------- LA GARDE, POSEE POUR DE VRAI */

  /**
   * L'APPROBATEUR. Il ne decide rien : il DEMANDE. A l'appareil quand le pont repond, et a
   * l'ecran sinon — une garde qui echouerait en « oui » ne garderait rien, donc l'absence de
   * reponse est un refus, jamais un laissez-passer.
   *
   * Les deux chemins courent ensemble : le presentateur garde la main sur scene meme si
   * l'appareil est lent, et la decision rendue DIT qui a tranche.
   */
  const approuverLeRapport = useCallback(
    async (r: GuardReport) => {
      setRapport(r)
      const vise = r.decode.legs[0]?.poolId ?? null
      if (vise !== null && vise === planApprouve.current) {
        planApprouve.current = null
        return {
          approved: true,
          by: 'the device',
          reason: 'this is the plan the human already approved, field by field',
          attestation: null,
        }
      }
      setDemande(true)
      setOccupe('choice')
      // 1. LA PAGE PROPOSE. L'app Ledger n'a que deux boutons : elle ne peut pas porter un choix
      //    a trois. Le plan se choisit donc ici, ou les deux routes sont cote a cote.
      const c = await new Promise<Choix>((resoudre) => {
        choisir.current = resoudre
      })
      choisir.current = null
      choix.current = c
      if (c === 'refuser') {
        setDemande(false)
        setOccupe(null)
        setDecision({ by: 'the page', reason: 'refused before anything left' })
        return { approved: false, by: 'the page', reason: 'refused before anything left', attestation: null }
      }
      // 2. L'APPAREIL CONFIRME LE PLAN CHOISI. Le rapport nomme CE plan : si l'utilisateur a
      //    pris la substitution, la porte affichee sur l'appareil est la nouvelle.
      setOccupe('device')
      const aLaMain = new Promise<{ approved: boolean; by: string; reason: string }>((resoudre) => {
        trancher.current = resoudre
      })
      const parLAppareil = (async () => {
        const rep = await approuver(acteBridge)
        setAppareil(rep)
        if (estRefus(rep))
          return {
            approved: false,
            by: 'bridge',
            reason:
              rep.refus === 'expire'
                ? `the request expired after ${DELAI_APPAREIL_S} s without an answer on the device — click swap again`
                : `the bridge did not answer: ${rep.raison}`,
          }
        if (typeof rep.refus === 'number')
          return { approved: false, by: 'device', reason: rep.raison ?? 'rejected on the device' }
        return { approved: true, by: 'device', reason: 'approved on the device' }
      })()
      const d = await Promise.race([aLaMain, parLAppareil])
      trancher.current = null
      setDemande(false)
      setOccupe(null)
      setDecision(d)
      if (!d.approved) {
        choix.current = 'refuser'
        return { approved: false, by: d.by, reason: d.reason, attestation: null }
      }
      // 3. APPROUVE. « go through anyway » laisse passer la transaction d'origine ; « take the
      //    cheaper gate » la refuse et envoie le remplacement en SECOND appel — la garde ne
      //    reecrit jamais ce qu'on lui a donne.
      if (c === 'substituer') planApprouve.current = paire?.proposee?.poolId ?? null
      return { approved: c === 'passer', by: d.by, reason: d.reason, attestation: null }
    },
    [acteBridge, paire],
  )

  const approuverRef = useRef(approuverLeRapport)
  approuverRef.current = approuverLeRapport

  /**
   * LE POSTE DE GARDE. Pose UNE FOIS par fournisseur : `envelopperProvider` est idempotent,
   * mais empiler des enveloppes ouvrirait N fenetres pour un seul swap.
   *
   * `askOn` inclut `ok`, et l'ecran le DIT : le defaut du paquet ne demande que sur `warn` et
   * `block`, et ce prelevement-ci tombe sous le seuil `warn`. Laisser croire que l'extension
   * arrete ce swap-la par defaut serait faux.
   */
  const poste = useMemo(() => {
    if (!fournisseurBrut || !paire) return null
    return poserLaGarde(fournisseurBrut as unknown as Eip1193Provider, {
      table,
      routeur: paire.routeur,
      atBlock: fork?.block_number ?? null,
      askOn: ['ok', 'warn', 'block'],
      approver: { name: 'tare-demo', approve: (r: GuardReport) => approuverRef.current(r) },
      onReport: (r) => setRapport(r),
    })
    // `fork.block_number` volontairement hors dependances : rebrancher la garde en cours de
    // parcours perdrait l'enveloppe posee et la question en vol.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fournisseurBrut, paire, table])

  /* --------------------------------------------------------------- les gestes */

  const comptesDu = async (): Promise<string | null> => {
    if (!fournisseurBrut) return null
    const c = await comptes(fournisseurBrut)
    if (estRefus(c)) {
      dire('wallet', c.raison, true)
      return null
    }
    const a = c[0] ?? null
    setAdresse(a)
    return a
  }

  const connecter = async () => {
    setOccupe('wallet')
    const a = await comptesDu()
    setOccupe(null)
    if (a) dire('wallet', `connected as ${shortAddr(a)}`)
  }

  const brancherReseau = async () => {
    if (!fournisseurBrut) return dire('network', 'no wallet announced on this page', true)
    if (!fork) return dire('network', 'the bridge has not published the fork RPC yet', true)
    setOccupe('network')
    const r = await ajouterEtBasculer(fournisseurBrut, fork)
    setOccupe(null)
    dire(
      'network',
      estRefus(r) ? r.raison : `switched to ${fork.chain_id === null ? 'the fork' : chainName(fork.chain_id)}`,
      estRefus(r),
    )
  }

  /** Le prealable technique, fait SILENCIEUSEMENT derriere le meme clic. */
  const preparer1 = async (de: string | null): Promise<Preparation | null> => {
    const deja = prep[acteBridge]
    if (deja && !estRefus(deja)) return deja
    const r = await preparer(de ?? ZERO_ADDRESS, acteBridge)
    setPrep((p) => ({ ...p, [acteBridge]: r }))
    if (estRefus(r)) {
      dire('bridge', r.raison, true)
      return null
    }
    setSoldesAvant(r.soldes)
    return r
  }

  /**
   * Envoie une transaction A TRAVERS LA GARDE. C'est ELLE qui decide si le portefeuille
   * s'ouvre — la page ne fait que ce qu'un site d'echange fait : `eth_sendTransaction`.
   */
  const parLaGarde = async (
    tx: TransactionPrete,
    de: string,
  ): Promise<{ etat: 'passee' | 'refusee' | 'erreur'; hash: string | null }> => {
    if (!poste) {
      dire('guard', 'no wallet announced: nothing to place the guard on', true)
      return { etat: 'erreur', hash: null }
    }
    try {
      const h = (await poste.fournisseur.request({
        method: 'eth_sendTransaction',
        params: [{ from: de, to: tx.to, data: tx.data, value: tx.value }],
      })) as string
      setOuvertures(poste.surveillance.ouvertures)
      setHash(h)
      return { etat: 'passee', hash: h }
    } catch (e) {
      setOuvertures(poste.surveillance.ouvertures)
      const err = e as { code?: number; message?: string }
      setCodeRendu(typeof err.code === 'number' ? err.code : null)
      if (err.code === CODE_REFUS_UTILISATEUR) return { etat: 'refusee', hash: null }
      dire('guard', err.message ?? 'the call failed', true)
      return { etat: 'erreur', hash: null }
    }
  }

  const suivreLeRecu = (de: string, h: string) => {
    if (!fournisseurBrut) return
    if (minuteur.current !== null) window.clearInterval(minuteur.current)
    minuteur.current = window.setInterval(() => {
      void recu(fournisseurBrut, h).then(async (x) => {
        if (x === null || estRefus(x)) return
        if (minuteur.current !== null) window.clearInterval(minuteur.current)
        setRecuTx(x)
        const s = await lireSoldes(de)
        if (!estRefus(s)) setSoldesApres(s)
      })
    }, PERIODE_MS * 2)
  }

  /** LE CLIC. Celui qu'un utilisateur fait sur n'importe quel site d'echange. */
  const lancerLeSwap = async () => {
    if (enVol.current) return
    if (!surLaPaireExecutee) return
    enVol.current = true
    setIssue(null)
    setCodeRendu(null)
    setDecision(null)
    setAppareil(null)
    setBasculee(false)
    setHash(null)
    setRecuTx(null)
    setSoldesApres(null)
    setOccupe('bridge')
    const de = (await comptesDu()) ?? adresse
    const p = await preparer1(de)
    setOccupe(null)
    const tx = p?.transaction ?? (acteAffiche ? { to: acteAffiche.routeur, data: acteAffiche.calldata, value: acteAffiche.value } : null)
    if (!tx || !de) {
      enVol.current = false
      return dire('swap', 'no transaction to send and no address to send it from', true)
    }
    const r = await parLaGarde(tx, de)
    enVol.current = false
    if (r.etat === 'passee') {
      setIssue('ORIGINE')
      dire('wallet', 'the original went to the wallet, unchanged')
      if (r.hash) suivreLeRecu(de, r.hash)
      return
    }
    if (r.etat !== 'refusee') return
    if (choix.current === 'substituer') {
      // SUBSTITUER, C'EST REFUSER PUIS ENVOYER AUTRE CHOSE. La garde ne reecrit jamais : elle
      // rend 4001 sur la transaction d'origine, et le remplacement part en SECOND appel —
      // qu'elle controle aussi. C'est la regle dure n.4 d'alternative.ts, tenue jusqu'ici.
      await envoyerLeRemplacement(de)
      return
    }
    // Pas de ligne d'alerte ici : le resume de la bande centrale dit deja le code et le
    // compteur d'ouvertures, et une scene qui fait 900 px n'a pas de ligne a perdre.
    setIssue('REFUSEE')
  }

  /** LA TROISIEME REPONSE : la porte de remplacement, envoyee deliberement, en SECOND appel. */
  const envoyerLeRemplacement = async (depuis?: string) => {
    if (!remplacement) return dire('guard', 'no replacement has been built yet', true)
    if (!depuis && enVol.current) return
    if (!depuis) enVol.current = true
    setBasculee(true)
    const de = depuis ?? adresse ?? (await comptesDu())
    if (!de) {
      enVol.current = false
      return
    }
    choix.current = 'substituer'
    const r = await parLaGarde(remplacement, de)
    enVol.current = false
    if (r.etat === 'passee') {
      setIssue('REMPLACEMENT')
      dire('wallet', 'the replacement went to the wallet')
      if (r.hash) suivreLeRecu(de, r.hash)
    } else if (r.etat === 'refusee') {
      setIssue('REFUSEE')
    }
  }

  const rejouer = () => {
    setIssue(null)
    setRapport(null)
    setDecision(null)
    setAppareil(null)
    setCodeRendu(null)
    setBasculee(false)
    setHash(null)
    setRecuTx(null)
    setSoldesApres(null)
  }

  const remettre = async () => {
    if (enVol.current) return
    enVol.current = true
    setOccupe('bridge')
    const r = await revenir()
    setOccupe(null)
    enVol.current = false
    rejouer()
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

  const bouton = async (b: BoutonAppareil): Promise<boolean> => {
    const r = await appuyer(b)
    if (estRefus(r)) {
      dire('device', r.raison, true)
      return false
    }
    return true
  }

  /* ----------------------------------------------------------------- le rendu */

  /**
   * LA COMMANDE DE REJEU, VISANT LE FORK PUBLIC.
   *
   * Elle pointait sur un anvil local que personne d'autre n'a : la promesse « chaque chiffre se
   * rejoue en une commande » etait donc fausse pour tout lecteur exterieur. Elle vise desormais
   * le noeud rendu par `/demo/etat`. Deux limites sont ecrites a cote, parce qu'une precaution
   * tue vaut moins qu'une precaution avouee.
   */
  const leRejeu = (a: Acte) => (
    <details className="px-[11px] py-[3px]" style={{ borderTop: '1px solid var(--line)' }}>
      <summary className="t-data-xs cursor-pointer" style={{ color: 'var(--ink-2)' }}>
        replay this number yourself
      </summary>
      <div className="mt-[5px]">
        <Replay cmd={replayCommand(a.actuelle.row, rpcRejeu)} />
        <div className="t-data-xs mt-[4px]" style={{ color: 'var(--ink-2)', lineHeight: 1.35 }}>
          It runs our engine, so it needs the repository and Python 3 — it is not magic.{' '}
          {rejouable
            ? 'The node it points at is the demo fork, and it is shared: the replay rewrites the hook bytecode and puts it back, so two people replaying at the same moment can get in each other’s way. For your own node: make up, with your own Base RPC.'
            : 'The bridge has not published a node, so the command points at a local anvil — which nobody else has. Start one with make up, using your own Base RPC.'}
        </div>
      </div>
    </details>
  )

  const soldeUsdc = (s: Soldes) => (s.usdc === null ? <Inconnu quoi="USDC balance" /> : groupDigits(s.usdc))
  const prise = lecture?.consultation?.bps ?? null

  /**
   * CE QUI EST PARTI — dit juste sous l'ecran de l'appareil, en capitales parce que c'est un
   * ETAT (la rubrique 3 de la charte autorise la capitale la, et seulement la). Deux mots qui
   * different par leur texte, jamais par une seule nuance.
   */
  const badgeSeul = (
    <span className={hash ? 'demo-badge demo-badge-parti' : 'demo-badge'}>{hash ? 'SENT' : 'NOTHING SENT'}</span>
  )
  const phraseEnvoi = (
    <span className="t-data-xs" style={{ color: 'var(--ink-2)', minWidth: 0 }}>
      {hash ? (
        <>
          the wallet signed · <span className="hex">{shortAddr(hash, 10, 6)}</span>
        </>
      ) : issue === 'REFUSEE' ? (
        'refused — the wallet never opened'
      ) : occupe === 'device' ? (
        'the plan is on the device; no transaction has left'
      ) : (
        'nothing has been sent yet: the device receives the plan you pick.'
      )}
    </span>
  )
  const badgeEnvoi = (
    <div className="flex flex-wrap items-center gap-x-[8px] gap-y-[2px]" style={{ minWidth: 0 }}>
      {badgeSeul}
      {phraseEnvoi}
    </div>
  )

  /**
   * LA BARRE DES SIX ETAPES — ou en est-on, pour un jury qui decouvre le produit en direct, et
   * le fil du presentateur. L'etape se DERIVE de l'etat de la page : aucune bascule manuelle,
   * donc aucune case allumee a tort.
   *
   * Un refus arrete le fil la ou il a eu lieu — au choix (03) ou sur l'appareil (04) — et la
   * case le DIT par un mot, pas par une couleur. On retient la derniere phase vue pour savoir
   * laquelle : la phase courante, elle, est deja retombee a « repos » quand le refus arrive.
   */
  const phaseVue = useRef<'choix' | 'appareil' | null>(null)
  if (phase === 'choix' || phase === 'appareil') phaseVue.current = phase
  else if (issue === null && decision === null && occupe === null) phaseVue.current = null
  const etapeCourante: number = recuTx
    ? 6
    : hash
      ? 5
      : issue === 'REFUSEE'
        ? phaseVue.current === 'appareil'
          ? 4
          : 3
        : phase === 'appareil'
          ? 4
          : phase === 'choix'
            ? 3
            : decision !== null && issue === null
              ? 5
              : occupe === 'bridge'
                ? 2
                : 1
  const arrete = issue === 'REFUSEE'
  const ETAPES: { n: number; quoi: string }[] = [
    { n: 1, quoi: 'swap' },
    { n: 2, quoi: 'the guard intercepts' },
    { n: 3, quoi: 'your call · 1 / 2 / 3' },
    { n: 4, quoi: 'the device confirms' },
    { n: 5, quoi: 'the wallet opens · sign' },
    { n: 6, quoi: 'received · would have · kept' },
  ]

  /**
   * LES TROIS REPONSES AU CLAVIER : 1, 2, 3, dans l'ordre ou elles sont posees. Elles appellent
   * EXACTEMENT les memes mains que les boutons, et se taisent quand le bouton se tait — la
   * troisieme n'existe pas tant qu'aucun remplacement n'a ete construit. Jamais pendant une
   * saisie, jamais en repetition automatique. (Espace, lui, vit dans l'ecran de l'appareil :
   * il n'a de sens que quand le plan y est.)
   */
  const clavierRef = useRef<(k: string) => boolean>(() => false)
  clavierRef.current = (k: string) => {
    if (!demande || occupe !== 'choice') return false
    if (k === '1') {
      choisir.current?.('refuser')
      trancher.current?.({ approved: false, by: 'the page', reason: 'refused on the page' })
      return true
    }
    if (k === '2') {
      choisir.current?.('passer')
      setBasculee(false)
      return true
    }
    if (k === '3' && remplacement) {
      choisir.current?.('substituer')
      setBasculee(true)
      return true
    }
    return false
  }
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      const cible = e.target as HTMLElement | null
      if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName))) return
      if (clavierRef.current(e.key)) e.preventDefault()
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [])

  return (
    <div className="demo-scene flex flex-col" style={{ gap: 3, minWidth: 0 }}>
      {/* ------------------------------------------------------------- l'en-tete */}
      {/* LE TITRE RESTE CELUI-CI. La maquette v2 ecrivait « Execute the best possible swap » :
          une promesse de meilleur prix que le produit ne tient pas — sur l'immense majorite des
          lignes du corpus il n'existe qu'une porte, donc aucun « meilleur swap ». Ce titre-ci dit
          ce que la page montre : la garde arrive avant le portefeuille.

          Le titre et la provenance partagent une ligne, la phrase tient sur la suivante : deux
          lignes de 11 px sous un titre, c'etait seize pixels pris a la scene. */}
      <div className="flex flex-col voile" style={{ gap: 0 }}>
        <div className="flex flex-wrap items-baseline justify-between gap-x-[24px]">
          <h1 className="t-title m-0">One click, and the guard gets there first</h1>
          <div className="flex flex-wrap items-baseline t-data-xs" style={{ gap: 10, color: 'var(--ink-2)' }}>
            <span>
              corpus block {fmtBlock(table.block_number)} · {groupDigits(String(table.n_measurements))} measurements
            </span>
            <span className="meta-filet">chain {table.chain_id}</span>
          </div>
        </div>
        <p className="t-data-sm m-0" style={{ color: 'var(--ink-2)', lineHeight: 1.35 }}>
          You click swap. The guard wraps <code>eth_sendTransaction</code>, reads the calldata, pulls
          the hook out of the PoolKey, and asks — before the wallet opens.
        </p>
      </div>

      {/* AU REPOS LA THESE DOMINE ; ailleurs elle se replie a une ligne pour laisser la place
          a ce qui se joue. Elle ne disparait jamais : le chiffre de la page reste lisible. */}
      {phase === 'repos' ? (
        <BandeDistribution
          d={dist}
          fraisDuPool={fraisDuPool}
          queueOuverte={vue === 'queue'}
          surQueue={() => setVue(vue === 'queue' ? 'parcours' : 'queue')}
        />
      ) : (
        <div
          className="flex items-baseline gap-x-[14px] px-[11px] py-[4px] t-data-xs demo-barre"
          style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', color: 'var(--ink-2)' }}
        >
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            what a measured hook takes
          </span>
          <span className="t-data" style={{ color: 'var(--m-4)' }}>
            {bpsTexte(dist.mediane, 2)} bps
          </span>
          <span>median of {groupDigits(String(dist.n))} measured rows</span>
          {fraisDuPool !== null && (
            <span>
              {partTexte(dist.auDessusDe(fraisDuPool).part)} take more than {bpsTexte(fraisDuPool)} bps
            </span>
          )}
          <span>{partTexte(dist.zero.part)} take nothing</span>
          {/* La queue reste atteignable dans TOUTES les phases : repliee, la these garde sa porte. */}
          <span className="ml-auto" style={{ flex: 'none' }}>
            <BoutonRole role="contour" onClick={() => setVue(vue === 'queue' ? 'parcours' : 'queue')}>
              {vue === 'queue' ? 'close the tail' : 'see the tail'}
            </BoutonRole>
          </span>
        </div>
      )}

      {/* ------------------------------- le pont, l'etat du fork et le clic d'entree */}
      {/* LA BARRE D'ETAT TIENT SUR UNE LIGNE, et defile dans elle-meme si elle deborde — comme
          la nav du site. Une seconde ligne ici coutait dix-sept pixels a la scene, et la scene
          fait exactement 1440x900. */}
      <div
        className="flex items-center gap-[8px] px-[11px] py-[3px] demo-barre"
        style={{ border: '1px solid var(--line)', background: 'var(--bg-1)' }}
      >
        {etat === null && (
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            reading {PONT}/demo/etat…
          </span>
        )}
        {etat !== null && estRefus(etat) && (
          <span
            className="t-data-xs"
            style={{ color: 'var(--m-3)' }}
            title={`${etat.raison}. The corpus, the interception and the gate comparison need nobody; the fork, the live quote and the receipt do.`}
          >
            the demo bridge is unreachable — the corpus and the interception still answer
          </span>
        )}
        {etatOk && (
          <>
            <span className="t-data-xs" style={{ color: 'var(--ink-2)' }} title={`rpc ${etatOk.fork.rpc}`}>
              fork{' '}
              {etatOk.fork.chain_id === null ? <Inconnu quoi="chain id" /> : chainName(etatOk.fork.chain_id)}{' '}
              {etatOk.fork.block_number === null ? (
                <Inconnu quoi="block number" />
              ) : (
                fmtBlock(etatOk.fork.block_number)
              )}{' '}
              · device {etatOk.speculos.joignable ? 'ok' : 'off'}
            </span>
            {etatOk.divergences && etatOk.divergences.length > 0 && (
              <span
                className="t-data-xs"
                style={{ color: 'var(--m-5)' }}
                title={etatOk.divergences
                  .map((d) => `act ${d.acte} · ${d.champ}: announced ${d.annonce}, corpus ${d.corpus}`)
                  .join('\n')}
              >
                · {etatOk.divergences.length} divergence(s), corpus wins
              </span>
            )}
          </>
        )}
        {/* TROIS ROLES, TROIS TRAITEMENTS — et on voit quoi cliquer sans lire. Le reseau est un
            prealable discret (contour neutre) ; le portefeuille est un etat qu'on pose (plein
            neutre) ; le reset DETRUIT l'etat du fork (contour d'alerte). L'accent orange plein
            reste reserve a l'action principale, plus bas : il n'y en a qu'une. */}
        <span className="ml-auto flex flex-wrap items-center gap-[6px]">
          <BoutonRole role="contour" onClick={brancherReseau} actif={Boolean(fournisseurBrut) && !occupe} titre="add the fork network to the wallet, and switch to it">
            network
          </BoutonRole>
          <BoutonRole role="plein" onClick={connecter} actif={Boolean(fournisseurBrut) && !occupe}>
            {adresse ? shortAddr(adresse) : 'connect the wallet'}
          </BoutonRole>
          <BoutonRole role="alerte" onClick={remettre} actif={!occupe} titre="rewinds the fork to its snapshot: what was executed is undone">
            reset
          </BoutonRole>
          {vue === 'queue' && (
            <BoutonRole role="accent" onClick={() => setVue('parcours')}>
              back to the swap
            </BoutonRole>
          )}
        </span>
      </div>

      {/* ------------------------------------------- LE POINT D'ENTREE, IMMANQUABLE */}
      {/* Defaut vecu en repetition : le bouton d'entree etait un bouton parmi d'autres dans la
          barre grise, et le presentateur a cherche ou cliquer. Le geste ordinaire — ce montant,
          vers cette monnaie, swap — a donc sa propre bande, encadree d'accent, avec le seul
          bouton plein orange de la page.

          LE MONTANT N'EST PAS EDITABLE, et c'est voulu : la garde ne sait dire ce qu'une porte
          prend qu'aux tailles REELLEMENT mesurees, et le pont ne prepare que celle-ci. Un champ
          libre afficherait un prelevement interpole a une taille que personne n'a mesuree. */}
      {/* Pendant que la garde demande et que l'appareil confirme, le bouton est desactive et
          la bande ne sert plus : elle se retire pour laisser la hauteur aux routes et a l'ecran.
          La barre des etapes, en bas, garde « 01 swap » sous les yeux. */}
      {vue === 'parcours' && acteAffiche && (phase === 'repos' || phase === 'fini') && (
        <div className="demo-depart">
          <span className="t-label demo-depart-libelle">START HERE · the ordinary gesture</span>
          <span className="flex items-baseline gap-[8px]" style={{ minWidth: 0 }}>
            <span className="demo-depart-montant hex">
              {montantLisibleActe ?? groupDigits(acteAffiche.actuelle.amountIn)}
            </span>
            <span className="t-data" style={{ color: 'var(--ink-2)' }}>
              {sym(acteAffiche.actuelle.entree) ?? shortAddr(acteAffiche.actuelle.entree)}
            </span>
          </span>
          <span className="demo-depart-montant" style={{ color: 'var(--ink-2)' }} aria-hidden="true">
            →
          </span>
          <span className="demo-depart-montant">
            {sym(acteAffiche.actuelle.sortie) ?? shortAddr(acteAffiche.actuelle.sortie)}
          </span>
          {!surLaPaireExecutee && (
            <span className="t-data-xs" style={{ color: 'var(--m-5)' }}>
              the bridge only prepares the executed one
            </span>
          )}
          <span className="ml-auto flex items-center gap-[10px]" style={{ minWidth: 0 }}>
            <span className="t-data-xs" style={{ color: 'var(--ink-2)', textAlign: 'right' }}>
              the guard sits on the wallet: it reads this swap before anything opens
            </span>
            <BoutonRole
              role="accent"
              grand
              onClick={lancerLeSwap}
              actif={!occupe && surLaPaireExecutee && Boolean(fournisseurBrut)}
              etiquette={libelleSwap}
              titre={
                !fournisseurBrut
                  ? 'no wallet announced on this page: the guard has nothing to sit on'
                  : !surLaPaireExecutee
                    ? 'the panel is on another pair; the bridge only prepares the executed one'
                    : 'the guard sits on eth_sendTransaction: it gets there before the wallet'
              }
            >
              swap
            </BoutonRole>
          </span>
        </div>
      )}

      {/* Les pannes seules remontent ici : le reste se lit dans la bande centrale. */}
      {alerte && (
        <div className="t-data-xs px-[11px] py-[2px]" style={{ color: 'var(--m-3)', overflowWrap: 'anywhere' }}>
          {alerte.quoi} — {alerte.texte}
        </div>
      )}

      {/* ----------- LES DEUX ROUTES. Le visuel central, lisible sur un flux video compresse. */}
      {acteAffiche && (
        <div
          className="flex flex-col gap-[4px] px-[11px] py-[5px]"
          style={{ border: '1px solid var(--line)', background: 'var(--bg-1)' }}
        >
          {issue === null || issue === 'REFUSEE' ? (
            <DeuxRoutes
              entree={acteAffiche.actuelle.entree}
              sortie={acteAffiche.actuelle.sortie}
              symboleEntree={sym(acteAffiche.actuelle.entree)}
              symboleSortie={sym(acteAffiche.actuelle.sortie)}
              montant={
                <>
                  {montantLisibleActe ?? groupDigits(acteAffiche.actuelle.amountIn)}{' '}
                  {sym(acteAffiche.actuelle.entree) ?? shortAddr(acteAffiche.actuelle.entree)} ·{' '}
                  {groupDigits(acteAffiche.actuelle.amountIn)} {montantLisibleActe ? 'wei' : 'unit(s)'}
                </>
              }
              courante={candidate(acteAffiche.actuelle)!}
              proposee={candidate(acteAffiche.proposee)}
              choisie={basculee ? 'proposee' : null}
              ecartBps={acteAffiche.ecartBps}
              taille={phase === 'choix' ? 'grande' : phase === 'appareil' ? 'petite' : 'moyenne'}
            />
          ) : (
            <CeQuOnAGarde
              recu={
                issue === 'REMPLACEMENT'
                  ? (acteAffiche.proposee?.row.out_with ?? null)
                  : acteAffiche.actuelle.row.out_with
              }
              auraitRecu={
                issue === 'REMPLACEMENT'
                  ? acteAffiche.actuelle.row.out_with
                  : (acteAffiche.proposee?.row.out_with ?? null)
              }
              gardeBps={issue === 'REMPLACEMENT' ? acteAffiche.ecartBps : 0}
              sortie={acteAffiche.actuelle.sortie}
              symboleSortie={sym(acteAffiche.actuelle.sortie)}
            />
          )}
          {/* CE QUI S'EST PASSE, en une ligne : l'issue, qui a decide, ce qui est parti, et le
              recu. La page ne devine rien — le recu est RELU sur la chaine. */}
          {(issue !== null || hash) && (
            <div className="flex items-baseline gap-x-[12px] t-data-xs demo-barre" style={{ color: 'var(--ink-2)' }}>
              {issue && (
                <span className="t-label" style={{ color: issue === 'REFUSEE' ? 'var(--m-3)' : 'var(--ink)' }}>
                  {LIBELLE_ISSUE[issue]}
                </span>
              )}
              {issue === 'REFUSEE' && (
                <span style={{ color: 'var(--m-3)' }}>
                  code {codeRendu ?? CODE_REFUS_UTILISATEUR} · wallet opened {ouvertures} time(s) · nothing left
                </span>
              )}
              {decision && <span>decided by {decision.by} — {decision.reason}</span>}
              {rapport && (
                <span>
                  report: {rapport.findings.length} finding(s) · {rapport.decode.complete ? 'calldata read whole' : 'calldata not read whole'}
                </span>
              )}
              {hash && (
                <span>
                  sent <span className="hex">{shortAddr(hash, 10, 6)}</span> ·{' '}
                  {recuTx ? `block ${fmtBlock(Number(recuTx.blockNumber))} · status ${recuTx.status}` : 'waiting for the receipt…'}
                </span>
              )}
              {soldesAvant && (
                <span>
                  balances {groupDigits(soldesAvant.eth_wei)} wei / {soldeUsdc(soldesAvant)}
                  {soldesApres && <> → {groupDigits(soldesApres.eth_wei)} wei / {soldeUsdc(soldesApres)}</>}
                </span>
              )}
              {issue !== null && (
                <span className="ml-auto">
                  <BoutonRole role="contour" onClick={rejouer}>replay</BoutonRole>
                </span>
              )}
            </div>
          )}
          {/* UNE QUESTION, TROIS REPONSES — ET LA MAIN PASSE A L'HUMAIN.
              Defaut mesure en repetition : tout fonctionnait, et le presentateur a cru que rien
              ne s'etait passe. L'ecran disait `asking — 18 s of 240 s`, ce qui DECRIT le systeme
              au lieu de dire quoi faire, et les trois boutons ressemblaient au reste de la page.
              Ils s'allument donc des que la garde demande : liseré d'accent, fond souleve, et une
              CONSIGNE avant la mecanique. Les trois restent visibles au repos — celle du milieu,
              « passer quand meme », est ce qui distingue une garde d'un routeur. */}
          <div
            className={`demo-choix ${demande ? 'demo-choix-demande' : ''}`}
          >
            {demande && (
              <span className="t-data" style={{ color: 'var(--m-4)', flex: 'none' }}>
                {occupe === 'device' ? 'On the device now —' : 'Pick one —'}
              </span>
            )}
            <BoutonChoix
              touche={1}
              onClick={() => {
                choisir.current?.('refuser')
                trancher.current?.({ approved: false, by: 'the page', reason: 'refused on the page' })
              }}
              actif={demande && occupe === 'choice'}
              titre={`nothing leaves: the caller gets ${CODE_REFUS_UTILISATEUR} and the wallet never opens`}
            >
              refuse · send nothing
            </BoutonChoix>
            <BoutonChoix
              touche={2}
              onClick={() => {
                choisir.current?.('passer')
                setBasculee(false)
              }}
              actif={demande && occupe === 'choice'}
              titre="the original transaction, unchanged, goes to the wallet"
            >
              pay {acteAffiche.actuelle.bps === null ? 'unknown' : `${bpsTexte(acteAffiche.actuelle.bps)} bps`} ·
              send as is
            </BoutonChoix>
            <BoutonChoix
              touche={3}
              onClick={() => {
                choisir.current?.('substituer')
                setBasculee(true)
              }}
              actif={demande && occupe === 'choice' && Boolean(remplacement)}
              fort
              titre={
                remplacement
                  ? 'the replacement goes instead — a second call, which the guard checks too'
                  : 'no replacement has been built: the bridge quotes on the fork'
              }
            >
              pay{' '}
              {acteAffiche.proposee?.bps === null || acteAffiche.proposee === null
                ? 'unknown'
                : `${bpsTexte(acteAffiche.proposee.bps!)} bps`}{' '}
              · take the other gate
            </BoutonChoix>
            <span className="demo-choix-consigne t-data-xs">
              {demande ? (
                occupe === 'device' ? (
                  <>
                    <strong style={{ color: 'var(--ink)' }}>Reject or Approve on the device.</strong>{' '}
                    <em>Reject</em> leaves nothing, <em>Approve</em> approves <em>that</em> plan
                    {restantS !== null ? ` · ${restantS} s left of ${DELAI_APPAREIL_S}` : ''}
                  </>
                ) : (
                  <strong style={{ color: 'var(--ink)' }}>
                    the plan you choose goes to the device — nothing has been sent yet
                  </strong>
                )
              ) : (
                'they answer while the guard asks · the plan you pick goes to the device'
              )}
              {/* LE PONT REND `ecrans` EN LISTE, pas en nombre. Mesure faite sur le site publie :
                  `${appareil.ecrans}` recopiait les quarante textes de l'appareil, separes par des
                  virgules — neuf lignes grises sous le resultat, a l'instant ou le jury regarde. */}
              {nombreDEcrans(appareil) !== null ? ` · ${nombreDEcrans(appareil)} screens` : ''}
            </span>
            {partRestante !== null && (
              <span
                aria-hidden="true"
                style={{ flex: '1 1 100%', height: 3, background: 'var(--bg-2)', minWidth: 80 }}
              >
                <span
                  style={{
                    display: 'block',
                    height: 3,
                    width: `${partRestante * 100}%`,
                    background: partRestante < 0.1 ? 'var(--m-3)' : 'var(--m-4)',
                    transition: 'width 1s linear',
                  }}
                />
              </span>
            )}
          </div>
        </div>
      )}

      {paire && vue === 'parcours' && issue === null && !demande && (
        <PanneauPaires
          choisie={paireChoisie || cleExecutee}
          setChoisie={setPaireChoisie}
          clePaireExecutee={cleExecutee}
        />
      )}

      {/* ------------------------------------------------------------ les quatre temps */}
      {/* PHASE 3 — LE PLAN EST SUR L'APPAREIL. L'ecran du Ledger devient l'objet central : c'est
          lui que le jury fixe pendant vingt secondes, et il etait relegue dans une colonne
          etroite. Les deux premiers temps se replient en une ligne ; ils ne disparaissent pas. */}
      {acteAffiche && lecture && phase === 'appareil' && (
        <div className="demo-appareil">
          <div
            className="flex flex-col"
            style={{ border: '1px solid var(--m-4)', background: 'var(--bg-1)', minWidth: 0 }}
          >
            <div className="px-[11px] pt-[6px] t-label" style={{ color: 'var(--m-4)' }}>
              the plan is on the device — read it there, then Reject or Approve
            </div>
            <EcranAppareil onBouton={bouton} texte={ecranTexte} lireEcran={lireEcran} grand sousLEcran={badgeEnvoi} />
          </div>

          <div className="flex flex-col" style={{ border: '1px solid var(--line)', background: 'var(--bg-1)', minWidth: 0 }}>
            <div className="px-[11px] pt-[6px] pb-[4px] t-label" style={{ color: 'var(--ink-2)' }}>
              the plan it is showing
            </div>
            <div className="px-[11px] pb-[6px]">
              <RouteSwap
                entree={acteAffiche.actuelle.entree}
                sortie={acteAffiche.actuelle.sortie}
                symboleEntree={sym(acteAffiche.actuelle.entree)}
                symboleSortie={sym(acteAffiche.actuelle.sortie)}
                montant={null}
                courante={
                  (basculee && acteAffiche.proposee
                    ? porteChoisie(acteAffiche.proposee)
                    : porteChoisie(acteAffiche.actuelle))!
                }
                remplacante={null}
                basculee={false}
                ecartBps={null}
                compact
              />
            </div>
            {/* LE CHAMP EN COURS, EN TOUTES LETTRES ET EN GROS : c'est la version du pixel de
                l'appareil qui survit a une video compressee. */}
            <L
              src="corpus"
              k="field now"
              fort
              v={
                ecranTexte ? (
                  <span className="t-title hex" style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>
                    {ecranTexte}
                  </span>
                ) : (
                  <Inconnu quoi="the device screen text, read back by the bridge" />
                )
              }
            />
            <L
              k="prompt digest"
              v={
                preparationOk?.prompt_digest ? (
                  <>
                    <span className="hex" style={{ color: 'var(--ink)' }}>
                      {shortAddr(preparationOk.prompt_digest, 12, 8)}
                    </span>{' '}
                    <Copy text={preparationOk.prompt_digest} label="copy" />
                  </>
                ) : (
                  <Inconnu quoi="prompt digest" />
                )
              }
            />
            <L src="calldata" k="hook" v={<span className="hex">{lecture.leg?.poolKey.hooks ?? '—'}</span>} />
            <div className="px-[11px] py-[6px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)', lineHeight: 1.35 }}>
              The device signs the <strong style={{ color: 'var(--ink)' }}>report</strong>, not the swap.
              <em> Reject</em> leaves nothing, <em>Approve</em> approves <em>that</em> plan.
              {restantS !== null ? ` · ${restantS} s left of ${DELAI_APPAREIL_S}` : ''}
            </div>
            {/* L'ECHAPPATOIRE DE SCENE, dans la colonne qui avait la place. Sous l'ecran elle
                poussait la carte de l'appareil sous le pli. */}
            <div
              className="px-[11px] py-[6px] flex flex-wrap items-center gap-[6px]"
              style={{ borderTop: '1px solid var(--line)' }}
            >
              <BoutonRole
                role="contour"
                onClick={() => trancher.current?.({ approved: false, by: 'the page', reason: 'rejected here' })}
                titre="the stage escape: decide here when the device or the bridge is not answering"
              >
                Reject (here)
              </BoutonRole>
              <BoutonRole
                role="plein"
                onClick={() => trancher.current?.({ approved: true, by: 'the page', reason: 'approved here' })}
              >
                Approve (here)
              </BoutonRole>
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                when the device or the bridge does not answer
              </span>
            </div>
          </div>
        </div>
      )}

      {acteAffiche && lecture && phase !== 'appareil' && (
        <div className={phase === 'fini' ? 'demo-etapes demo-etapes-3 demo-recule' : 'demo-etapes demo-etapes-3'}>
          {/* ---------------------------------------------------------------- 01 */}
          <Etape n={1} titre={vue === 'queue' ? `the tail: ${libelleSwap}` : libelleSwap}>
            <L
              src="calldata"
              k="spends"
              fort
              v={
                <>
                  {montantLisibleActe ?? groupDigits(acteAffiche.actuelle.amountIn)}{' '}
                  {nomMonnaie(acteAffiche.actuelle.entree)} → {nomMonnaie(acteAffiche.actuelle.sortie)}
                  <span style={{ color: 'var(--ink-3)' }}>
                    {' '}
                    · {groupDigits(acteAffiche.actuelle.amountIn)}{' '}
                    {montantLisibleActe ? 'wei, the unit measured' : 'unit(s), the unit measured'}
                  </span>
                </>
              }
            />
            <L
              k="router"
              v={
                <>
                  <span className="hex">{shortAddr(preparationOk?.transaction.to ?? acteAffiche.routeur, 12, 4)}</span>{' '}
                  · {preparationOk ? 'built by the bridge' : 'Universal Router, rebuilt from the corpus'}
                </>
              }
            />
            <L k="value" v={preparationOk?.transaction.value ?? acteAffiche.value} />
            <div
              className="px-[11px] py-[6px] flex flex-wrap items-center gap-[7px]"
              style={{ borderTop: '1px solid var(--line)' }}
            >
              <Copy text={calldata ?? ''} label="copy the calldata" />
              <span className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.35 }}>
                Nobody asked for a report. This is a swap you were about to make — three seconds
                before the signature. The exchange site builds this transaction; here the bridge does,
                on the fork.
              </span>
            </div>
          </Etape>

          {/* ---------------------------------------------------------------- 02 */}
          <Etape n={2} titre="the guard got there first">
            <L
              src="chaine"
              k="wallet opened"
              fort
              gros
              v={
                <>
                  <span style={{ color: ouvertures === 0 ? 'var(--ink)' : 'var(--m-5)' }}>{ouvertures}</span> time(s)
                  <span style={{ color: 'var(--ink-2)' }}> · counted, not asserted</span>
                </>
              }
            />
            <CeQuiEstLu l={lecture} attendu={acteAffiche.actuelle.poolId} />
            <L
              src="corpus"
              k="take"
              fort
              gros
              v={
                prise === null ? (
                  <Inconnu quoi="take at this size" />
                ) : (
                  <>
                    {bpsTexte(prise)} bps · {(prise / POURCENT_EN_BPS).toFixed(3)} % of what you send
                  </>
                )
              }
            />
            {prise !== null &&
              (() => {
                const p = dist.auDessusDe(prise)
                return <Situation part={p.part} n={p.n} total={dist.n} />
              })()}
            <L
              src="corpus"
              k="verdict"
              v={
                <span
                  title="this page asks on ok, warn and block; the package default asks on warn and block, and would let this one through"
                >
                  <span style={{ color: lecture.verdict ? TON_VERDICT[lecture.verdict] : undefined }}>
                    {lecture.verdict ?? 'unknown'}
                  </span>{' '}
                  · warn {bpsTexte(seuils.warnBps)}, block {bpsTexte(seuils.blockBps)} bps — 90th and 99th
                  percentiles, not round numbers. Asks on every verdict here.
                </span>
              }
            />
            {leRejeu(acteAffiche)}
          </Etape>

          {/* ---------------------------------------------------------------- 03 */}
          {vue === 'queue' ? (
            <Etape titre="what this gate takes">
              {lecture.alternative && (
                <EtatNomme
                  etat={lecture.alternative.etat}
                  suite={AFFICHAGE[lecture.alternative.etat]?.titre}
                  raison={
                    <>
                      One row out of {groupDigits(String(dist.nLignes))}, on a token nobody holds. It is
                      published because it exists — not because it is the norm. The norm is the band above.
                    </>
                  }
                  encadre={false}
                />
              )}
              {leRejeu(acteAffiche)}
            </Etape>
          ) : (
            <Etape n={4} titre="the device confirms the plan">
              <div className="px-[11px] pt-[3px] pb-[2px] t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.35 }}>
                The device signs the <strong style={{ color: 'var(--ink)' }}>report</strong>, not the
                swap: a typed message, every field named — hook, pool, take, size, direction, block.
              </div>
              {/* LA ROUTE reste sous les yeux : elle est dans la bande pleine largeur juste
                  au-dessus, a cote de cette colonne. On ne la redessine pas ici — ce serait la
                  meme image deux fois, et la hauteur de la scene est comptee.

                  L'ECRAN A GAUCHE, LE CONTEXTE A DROITE. « Ethereum app is ready · screens 1 ·
                  presses 0 » se lisait comme une panne alors que c'est l'etat normal : le badge
                  le dit juste sous l'ecran, la phrase le dit a cote.

                  L'echappatoire de scene (Reject / Approve here) n'est plus ici : dans cette
                  carte elle etait TOUJOURS desactivee — la garde n'attend l'appareil qu'en phase
                  3, qui a sa propre carte. Deux boutons morts coutaient une ligne a la scene. */}
              <EcranAppareil
                onBouton={bouton}
                texte={ecranTexte}
                lireEcran={lireEcran}
                sousLEcran={badgeSeul}
                aCote={
                  <div className="flex flex-col gap-[5px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    <div>
                      on the device:{' '}
                      {ecranTexte ? (
                        <span className="hex" style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>
                          {ecranTexte}
                        </span>
                      ) : (
                        <Inconnu quoi="the device screen text, read back by the bridge" />
                      )}
                    </div>
                    <div className="flex flex-wrap items-baseline gap-x-[6px] gap-y-[2px]">
                      <span>prompt digest</span>
                      {preparationOk?.prompt_digest ? (
                        <>
                          <span className="hex" style={{ color: 'var(--ink)' }}>
                            {shortAddr(preparationOk.prompt_digest, 12, 8)}
                          </span>
                          <Copy text={preparationOk.prompt_digest} label="copy" />
                        </>
                      ) : (
                        <Inconnu quoi="prompt digest: the bridge has not built the message yet" />
                      )}
                      <span>— keccak256 of the text sent to the device, shown there too</span>
                    </div>
                    {phraseEnvoi}
                  </div>
                }
              />
            </Etape>
          )}
        </div>
      )}

      {/* ------------------------------------------------ LE FIL : six etapes, en bas */}
      <nav className="demo-fil" aria-label="where the demonstration is">
        <ol className="demo-fil-etapes">
          {ETAPES.map((e) => {
            const etat =
              e.n < etapeCourante ? 'faite' : e.n === etapeCourante ? (arrete ? 'arretee' : 'courante') : 'a-venir'
            return (
              <li
                key={e.n}
                className={`demo-fil-etape demo-fil-${etat}`}
                aria-current={e.n === etapeCourante ? 'step' : undefined}
              >
                <span className="demo-fil-n">{String(e.n).padStart(2, '0')}</span>
                <span>{e.quoi}</span>
                {etat === 'arretee' && <span className="demo-fil-mot">stopped here</span>}
              </li>
            )
          })}
        </ol>
        <span className="demo-fil-touches" aria-label="keyboard shortcuts">
          <span>
            next <kbd className="demo-touche">→</kbd> (<kbd className="demo-touche">space</kbd>)
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <kbd className="demo-touche">enter</kbd> confirm
          </span>
          <span aria-hidden="true">·</span>
          <span>
            <kbd className="demo-touche">1</kbd> / <kbd className="demo-touche">2</kbd> /{' '}
            <kbd className="demo-touche">3</kbd> choose
          </span>
        </span>
      </nav>
    </div>
  )
}
