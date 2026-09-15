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
import { CeQuOnAGarde, DeuxRoutes, type RouteCandidate } from './DemoRoute'
import { PanneauPaires, nomJeton } from './DemoPaires'
import { montantLisible } from '../demo/jetons'
import { cleDe } from '../demo/paires'
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
  DELAI_ETAPE_S,
  PONT,
  abandonnerChoix,
  ajouterEtBasculer,
  appuyer,
  choisirSurAppareil,
  comptes,
  estRefus,
  lireEtat,
  lireSoldes,
  preparer,
  recu,
  revenir,
  urlEcran,
  type Bouton as BoutonAppareil,
  type EtatDemo,
  type Fournisseur,
  type OptionChoix,
  type Preparation,
  type ProgresChoix,
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
 * LE BOUTON SWAP — le seul plein orange de la page, aux coins biseautes de la maquette.
 *
 * Son libelle visible est « swap », comme sur n'importe quel site d'echange ; son nom accessible
 * dit le geste entier (« swap 0.000001 ETH → USDC »), pour qu'un lecteur d'ecran — et un test —
 * sache ce qui part.
 */
function BoutonSwap({
  onClick,
  actif,
  etiquette,
  titre,
}: {
  onClick: () => void
  actif: boolean
  etiquette: string
  titre: string
}) {
  return (
    <button type="button" className="demo-swap" onClick={onClick} disabled={!actif} aria-label={etiquette} title={titre}>
      swap
    </button>
  )
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
 * LA FORME EST CELLE DE LA MAQUETTE v2. Au repos, la plaque noire de l'appareil et un badge qui
 * dit ce qui est parti. Quand le plan y est, un boitier avec ses deux boutons physiques, l'ecran
 * en grand et, dessous, le champ RELU en toutes lettres — la version du pixel qui survit a une
 * video compressee.
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
 * Le compteur d'ecrans est MESURE (il compte les changements du texte relu sur l'appareil),
 * jamais estime.
 */
const PERIODE_MS = 400

/** A quelle cadence on relit le texte de l'ecran de l'appareil, par le pont. */
const PERIODE_ECRAN_MS = 900

/** Combien d'appuis « next » une rafale envoie. Quarante-six appuis a la main, c'est trop. */
const APPUIS_PAR_RAFALE = 10
/** L'espacement entre deux appuis d'une rafale : l'appareil doit avoir le temps de rendre. */
const ENTRE_APPUIS_MS = 140

/** Le badge sous la plaque : un ETAT, ecrit en capitales parce que la capitale y est la donnee. */
interface Badge {
  texte: string
  ton: 'neutre' | 'accent' | 'refus'
}

function EcranAppareil({
  onBouton,
  texte,
  lireEcran,
  direct,
  titre,
  badge,
  phrase,
  mainRef,
  decider,
}: {
  onBouton: (b: BoutonAppareil) => Promise<boolean>
  texte?: string | null
  /** relit le texte de l'ecran, une fois. La rafale s'en sert pour ne rien sauter. */
  lireEcran: () => Promise<string | null>
  /** vrai quand le plan est sur l'appareil : le boitier, ses boutons, l'ecran en grand */
  direct: boolean
  titre: string
  badge: Badge
  /** ce qui se lit sous le badge, au repos */
  phrase: React.ReactNode
  /** la main posee sur l'appareil : la barre du bas s'en sert, comme la touche espace */
  mainRef: React.MutableRefObject<((b: BoutonAppareil) => void) | null>
  /** l'echappatoire de scene, rendue par la page : Reject / Approve (here) */
  decider: React.ReactNode
}) {
  const [jeton, setJeton] = useState(0)
  const [dispo, setDispo] = useState<boolean | null>(null)
  const [appuis, setAppuis] = useState(0)
  const [ecrans, setEcrans] = useState(0)
  const [rafale, setRafale] = useState(false)
  const rafaleRef = useRef(false)
  rafaleRef.current = rafale
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
  }, [])

  useEffect(() => noter(texte ?? null), [texte, noter])

  const appuyerUne = async (b: BoutonAppareil) => {
    const ok = await onBouton(b)
    if (ok) setAppuis((n) => n + 1)
    return ok
  }

  /**
   * ESPACE (ou fleche droite) = « next (right) », fleche gauche = « previous (left) », ENTREE =
   * « confirm (both) », et SEULEMENT quand
   * le plan est sur l'appareil. Devant un jury, viser un bouton a la souris coute un regard ; une
   * touche ne coute rien. Au repos l'appareil affiche son menu : les touches s'y taisent.
   *
   * Trois precautions. La repetition automatique est ignoree — tenir la barre enverrait trente
   * appuis par seconde a Speculos. Le defilement de la page est empeche. Et le bouton qui a le
   * focus le perd : sans ca, espace « cliquerait » aussi le dernier bouton clique a la souris —
   * typiquement confirm (both) — et confirmerait deux fois.
   */
  const appuyerRef = useRef(appuyerUne)
  appuyerRef.current = appuyerUne
  useEffect(() => {
    if (!direct) return
    const surTouche = (e: KeyboardEvent) => {
      const touche = e.key === 'Enter' ? 'both' : e.key === 'ArrowLeft' ? 'left' : e.key === ' ' || e.key === 'ArrowRight' ? 'right' : null
      if (touche === null || e.metaKey || e.ctrlKey || e.altKey) return
      const cible = e.target as HTMLElement | null
      if (cible && (cible.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(cible.tagName))) return
      e.preventDefault()
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
      if (e.repeat || rafaleRef.current) return
      // Entree confirme (les deux boutons), espace et fleche droite avancent, fleche gauche
      // recule. Sans Entree, il fallait lacher le clavier pour viser « confirm » a la souris.
      void appuyerRef.current(touche)
    }
    window.addEventListener('keydown', surTouche)
    return () => window.removeEventListener('keydown', surTouche)
  }, [direct])

  // La barre du bas appuie par la MEME main, avec les memes garde-fous que la touche.
  useEffect(() => {
    mainRef.current = direct
      ? (b: BoutonAppareil) => {
          if (!rafaleRef.current) void appuyerRef.current(b)
        }
      : null
    return () => {
      mainRef.current = null
    }
  }, [direct, mainRef])

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

  const image = (
    <>
      <img
        src={urlEcran(jeton)}
        alt="the device screen, live"
        onLoad={() => setDispo(true)}
        onError={() => setDispo(false)}
        style={{ display: dispo === true ? 'block' : 'none', maxWidth: '100%' }}
      />
      {dispo !== true && (
        <span className="demo-appareil-absent">
          {dispo === null ? 'reading the device screen…' : 'device screen unavailable'}
        </span>
      )}
    </>
  )

  return (
    <div className="demo-appareil">
      <div className="demo-tete">
        <span>{titre}</span>
        <span className="demo-tete-meta">
          {direct || appuis > 0 ? (
            <>
              screens {texte ? ecrans : <Inconnu quoi="the device screen text" />} · presses {appuis}
              {rafale ? ' · burst' : ''} · live every {PERIODE_MS} ms, nothing is replayed
            </>
          ) : (
            <>
              on the device:{' '}
              {texte ? (
                <span className="hex demo-encre">{texte}</span>
              ) : (
                <Inconnu quoi="the device screen text, read back by the bridge" />
              )}{' '}
              · live, nothing is replayed
            </>
          )}
        </span>
      </div>

      {direct ? (
        <div className="demo-appareil-direct">
          <div className="demo-boitier">
            <button
              type="button"
              className="demo-bouton-physique"
              onClick={() => void appuyerUne('left')}
              disabled={rafale}
              aria-label="left button"
              title="previous (left) — does nothing on the guard screen"
            />
            <div className="demo-boitier-ecran">
              <span className="demo-boitier-sur">field now · read back from the device</span>
              <span className="demo-boitier-image">{image}</span>
              <span className="demo-boitier-texte hex">
                {texte ?? <Inconnu quoi="the device screen text, read back by the bridge" />}
              </span>
            </div>
            <button
              type="button"
              className="demo-bouton-physique"
              onClick={() => void appuyerUne('right')}
              disabled={rafale}
              aria-label="right button"
              title="next (right)"
            />
          </div>
          <div className="demo-appareil-commandes">
            <button type="button" className="demo-commande" onClick={() => void appuyerUne('right')} disabled={rafale} title="next field — space or → does it too">
              next (right)
            </button>
            <button
              type="button"
              className="demo-commande"
              onClick={() => void enchainer()}
              disabled={rafale}
              title={`${APPUIS_PAR_RAFALE} next presses, reading the screen between each`}
            >
              walk ×{APPUIS_PAR_RAFALE}
            </button>
            <button type="button" className="demo-commande" onClick={() => void appuyerUne('both')} disabled={rafale} title="confirm the screen — Enter does it too">
              confirm (both)
            </button>
            <details className="demo-geste">
              <summary>the gesture, in order</summary>
              <div>
                First screen is a guard — <em>blind signing ahead</em> — only <strong>confirm</strong> clears
                it, the left button does nothing there. Then <strong>next</strong> walks every field. The last
                two screens are <em>Approve</em> and <em>Reject</em>: <strong>confirm</strong> on{' '}
                <em>Reject</em> is the refusal, and it answers code {CODE_REFUS_UTILISATEUR}.
              </div>
            </details>
            <span className="demo-appareil-decider">{decider}</span>
          </div>
        </div>
      ) : (
        <div className="demo-appareil-repos">
          <div className="demo-plaque">{image}</div>
          <span className={`demo-badge demo-badge-${badge.ton}`}>{badge.texte}</span>
          <span className="demo-appareil-phrase">{phrase}</span>
        </div>
      )}
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
  const [paireChoisie, setPaireChoisie] = useState<string>('')
  /** La reponse que l'humain a donnee a la garde — ce que les cartes et les routes montrent. */
  const [reponse, setReponse] = useState<Choix | null>(null)
  /** Le reseau du fork a ete ajoute au portefeuille, et le portefeuille y a bascule. */
  const [reseauActif, setReseauActif] = useState(false)

  /* ---------------------------------------------------- l'etat du parcours */
  /** Ce que la garde a lu du calldata interceptE. Null tant qu'on n'a pas clique. */
  const [rapport, setRapport] = useState<GuardReport | null>(null)
  /** Vrai pendant que l'appareil affiche le rapport et qu'on attend la main humaine. */
  const [demande, setDemande] = useState(false)
  const [issue, setIssue] = useState<Issue | null>(null)
  const [codeRendu, setCodeRendu] = useState<number | null>(null)
  const [ouvertures, setOuvertures] = useState(0)
  /**
   * OU EN EST L'APPAREIL — la question affichee, celles deja passees, et la reponse. C'est lui qui
   * allume les cartes : la page ne devine jamais quelle question l'humain a sous les yeux.
   */
  const [progres, setProgres] = useState<ProgresChoix | null>(null)
  /** Non nul : l'appareil ne repond pas, et la decision revient a la page. La raison est dite. */
  const [secours, setSecours] = useState<string | null>(null)
  /** Qui a decide, et pourquoi — repris du `ApprovalDecision` de la garde. */
  const [decision, setDecision] = useState<{ by: string; reason: string; attestation?: string | null } | null>(null)

  const fournisseurBrut: Fournisseur | null = (portefeuilles[0]?.provider as Fournisseur | undefined) ?? null
  const minuteur = useRef<number | null>(null)
  const enVol = useRef(false)
  /** Coupe la conversation avec l'appareil quand le presentateur reprend la decision sur la page. */
  const abandon = useRef<AbortController | null>(null)
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

  /**
   * LE TEMPS QUI RESTE A L'APPAREIL, et il doit se VOIR arriver.
   *
   * Lire un nombre qui monte ne previent de rien : la jauge se vide, et elle passe a l'encre
   * d'alerte sur la fin. Le delai court PAR QUESTION — chaque question posee sur l'appareil a le
   * sien — et il se lit dans l'avancement que rend le pont, pas dans une horloge de la page.
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
  const restantS =
    occupe === 'device' && progres?.depuis_ms != null
      ? Math.max(0, Math.round(DELAI_ETAPE_S - progres.depuis_ms / 1000))
      : null
  const partRestante = restantS === null ? null : restantS / DELAI_ETAPE_S

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

  /** Une route candidate : la porte, ce qu'elle prend, et ce que le swap REND par elle. */
  const candidate = (p: Porte | null | undefined): RouteCandidate | null =>
    p
      ? {
          poolId: p.poolId,
          hook: p.hook,
          bps: p.bps,
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
      // 1. L'APPAREIL POSE LES TROIS CHOIX. L'app Ethereum ne finit un message que par Approve ou
      //    Reject : le pont pose donc deux questions signees d'affilee — garder sa route, sinon
      //    prendre la porte moins chere, sinon annuler. La page SUIT l'avancement ; elle ne
      //    choisit rien.
      setDemande(true)
      setOccupe('device')
      setProgres(null)
      setSecours(null)
      const ctrl = new AbortController()
      abandon.current = ctrl
      const rep = await choisirSurAppareil(acteBridge, setProgres, ctrl.signal)
      abandon.current = null
      if (!estRefus(rep)) {
        const c: Choix = rep.choix === 'actuelle' ? 'passer' : rep.choix === 'optimisee' ? 'substituer' : 'refuser'
        choix.current = c
        setReponse(c)
        setDemande(false)
        setOccupe(null)
        setDecision({ by: 'the device', reason: rep.raison, attestation: rep.signature })
        // « take the cheaper gate » refuse la transaction d'origine : lancerLeSwap
        // envoie le remplacement en SECOND appel — la garde ne reecrit jamais ce qu'on lui a donne.
        if (c === 'substituer') planApprouve.current = paire?.proposee?.poolId ?? null
        return { approved: c === 'passer', by: 'the device', reason: rep.raison, attestation: rep.signature }
      }
      // 2. LE MODE SECOURS. L'appareil est injoignable, occupe ou en panne — ou le presentateur a
      //    repris la main. Une garde qui echouerait en « oui » ne garderait rien : la decision
      //    revient a la page, et l'ecran DIT pourquoi. Tant que personne n'a clique, rien ne part.
      setSecours(rep.raison)
      setOccupe('choice')
      const c = await new Promise<Choix>((resoudre) => {
        choisir.current = resoudre
      })
      choisir.current = null
      choix.current = c
      setDemande(false)
      setOccupe(null)
      const raison =
        c === 'refuser'
          ? 'refused on the page — the device did not answer'
          : c === 'substituer'
            ? 'the cheaper gate, taken on the page — the device did not answer'
            : 'the route kept, on the page — the device did not answer'
      setDecision({ by: 'the page', reason: raison })
      if (c === 'substituer') planApprouve.current = paire?.proposee?.poolId ?? null
      return { approved: c === 'passer', by: 'the page', reason: raison, attestation: null }
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
    if (!estRefus(r)) setReseauActif(true)
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
    setReponse(null)
    setCodeRendu(null)
    setDecision(null)
    setProgres(null)
    setSecours(null)
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
    setReponse(null)
    setRapport(null)
    setDecision(null)
    setProgres(null)
    setSecours(null)
    setCodeRendu(null)
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
    <details className="demo-rejeu">
      <summary>replay this number yourself</summary>
      <div className="demo-rejeu-corps">
        <Replay cmd={replayCommand(a.actuelle.row, rpcRejeu)} />
        <div>
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
   * CE QUE L'ECRAN MONTRE, derive de l'etat — jamais bascule a la main.
   *
   * Les quatre phases de la page (`phase`) disent ou en est la garde ; l'ecran en distingue six,
   * parce qu'une fin n'en vaut pas une autre : un refus ne se montre pas comme un recu, et le
   * moment ou le portefeuille s'ouvre — l'appareil a approuve, rien n'est encore signe — a sa
   * propre image. Un refus garde son image jusqu'au prochain clic : la phase retombe a « repos »
   * des que la garde a rendu 4001, l'ecran, lui, ne doit pas oublier ce qui vient d'arriver.
   */
  type Visuel = 'repos' | 'garde' | 'appareil' | 'portefeuille' | 'refus' | 'recu'
  const visuel: Visuel =
    vue === 'queue'
      ? 'repos'
      : issue === 'REFUSEE'
        ? 'refus'
        : issue !== null
          ? 'recu'
          : phase === 'appareil'
            ? 'appareil'
            : phase === 'choix'
              ? 'garde'
              : decision !== null
                ? choix.current === 'refuser'
                  ? 'refus'
                  : 'portefeuille'
                : 'repos'
  const replie = visuel !== 'repos'

  /**
   * LA DERNIERE PHASE VUE. Un refus arrive quand la phase est deja retombee : c'est elle qui dit
   * s'il a eu lieu sur la page (au choix) ou sur l'appareil.
   */
  const phaseVue = useRef<'choix' | 'appareil' | null>(null)
  if (phase === 'choix' || phase === 'appareil') phaseVue.current = phase
  else if (issue === null && decision === null && occupe === null) phaseVue.current = null

  /**
   * LA REPONSE DONNEE SUR LA PAGE — en MODE SECOURS seulement, quand l'appareil ne repond pas. Un
   * clic et une touche passent par ICI et font exactement la meme chose. Elle se tait hors de ce
   * mode, et pour la porte moins chere tant qu'aucun remplacement n'a ete construit.
   */
  const repondre = (c: Choix): boolean => {
    if (!demande || occupe !== 'choice' || secours === null) return false
    if (c === 'substituer' && !remplacement) return false
    setReponse(c)
    choisir.current?.(c)
    return true
  }

  /** Reprendre la decision sur la page : l'appareil refuse la question ouverte, et le secours s'ouvre. */
  const deciderSurLaPage = async () => {
    await abandonnerChoix()
    abandon.current?.abort()
  }

  /**
   * LES TROIS REPONSES AU CLAVIER, en mode secours : 1, 2, 3, dans l'ordre de l'appareil — garder sa
   * route, prendre la porte moins chere, annuler. Jamais pendant une saisie, jamais en repetition
   * automatique. (Espace, fleches et Entree vivent dans l'ecran de l'appareil.)
   */
  const clavierRef = useRef<(k: string) => boolean>(() => false)
  clavierRef.current = (k: string) =>
    k === '1' ? repondre('passer') : k === '2' ? repondre('substituer') : k === '3' ? repondre('refuser') : false
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

  /** La grille de la scene : [le geste] · les routes · [le choix] · l'appareil. 560 ms. */
  const LIGNES: Record<Visuel, string> = {
    repos: '.42fr 1.6fr 0fr 1.3fr',
    garde: '0fr 1.7fr .7fr .9fr',
    appareil: '0fr .9fr .32fr 2fr',
    portefeuille: '0fr .9fr .32fr 2fr',
    refus: '0fr .9fr .32fr 2fr',
    recu: '0fr .9fr .32fr 2fr',
  }
  /** Le champ orange derriere la scene : il monte avec l'enjeu, il retombe sur un refus. */
  const CHAMP: Record<Visuel, number> = { repos: 0.1, garde: 0.3, appareil: 0.4, portefeuille: 0.4, refus: 0.05, recu: 0.5 }

  /**
   * LES TROIS REPONSES APPARAISSENT UNE PAR UNE, une fois la rangee ouverte — 700, 1 000 et
   * 1 300 ms. C'est un geste, pas un delai : l'appareil pose deja sa premiere question, et en mode
   * secours les touches 1/2/3 repondent tout de suite. Ensuite, elles restent toutes visibles.
   */
  const [revele, setRevele] = useState(0)
  const rangeeOuverte = visuel !== 'repos'
  useEffect(() => {
    if (!rangeeOuverte) {
      setRevele(0)
      return
    }
    const t = [700, 1000, 1300].map((ms, i) => window.setTimeout(() => setRevele((r) => Math.max(r, i + 1)), ms))
    return () => t.forEach((x) => window.clearTimeout(x))
  }, [rangeeOuverte])

  /** La main posee sur l'appareil par la barre du bas : « next », comme la touche espace. */
  const mainAppareil = useRef<((b: BoutonAppareil) => void) | null>(null)

  /**
   * CE QUI EST PARTI — dit juste sous l'ecran de l'appareil. Deux mots qui different par leur
   * texte, jamais par une seule nuance.
   */
  const refuseSurLAppareil = visuel === 'refus' && phaseVue.current === 'appareil'
  const badgeAppareil: { texte: string; ton: 'neutre' | 'accent' | 'refus' } =
    visuel === 'garde'
      ? { texte: 'DEVICE UNAVAILABLE', ton: 'refus' }
      : visuel === 'refus'
        ? {
            texte: `${refuseSurLAppareil ? 'REJECTED' : 'REFUSED ON THE PAGE'} · ${codeRendu ?? CODE_REFUS_UTILISATEUR}`,
            ton: 'refus',
          }
        : visuel === 'portefeuille' || visuel === 'recu'
          ? { texte: hash ? 'APPROVED · SENT' : 'APPROVED', ton: 'neutre' }
          : { texte: 'NOTHING SENT', ton: 'neutre' }
  const phraseAppareil =
    visuel === 'recu' && hash ? (
      <>
        the wallet signed · <span className="hex">{shortAddr(hash, 10, 6)}</span>
      </>
    ) : visuel === 'refus' ? (
      'refused — the wallet never opened'
    ) : visuel === 'portefeuille' ? (
      decision?.by === 'the device' ? 'approved on the device — the wallet opens with that plan' : 'decided on the page — the wallet opens with that plan'
    ) : visuel === 'garde' ? (
      <>nothing has been sent: the decision comes back to the page</>
    ) : (
      'nothing has been sent yet: the device receives the plan you pick.'
    )
  const titreAppareil =
    visuel === 'appareil'
      ? 'the device asks'
      : visuel === 'portefeuille' || visuel === 'recu' || refuseSurLAppareil
        ? 'the device answered'
        : 'the device'

  /**
   * LE FIL — cinq etapes, en bas, et le bouton « next » qui fait ce que fait la touche espace.
   * L'etape se DERIVE de l'ecran : aucune case allumee a tort. Un refus remplace « the wallet
   * opens » par ce qui s'est passe a sa place, avec le code rendu.
   */
  const etapeCourante =
    visuel === 'garde' || visuel === 'appareil'
      ? 2
      : visuel === 'portefeuille' || visuel === 'refus'
        ? 3
        : visuel === 'recu'
          ? recuTx
            ? 4
            : 3
          : occupe === 'bridge' && vue === 'parcours'
            ? 1
            : 0
  const ETAPES = [
    'swap',
    'the guard intercepts',
    'the device asks: keep · cheaper · cancel',
    visuel === 'refus' ? `${codeRendu ?? CODE_REFUS_UTILISATEUR} · nothing leaves` : 'the wallet opens · sign',
    'received · kept',
  ]

  /**
   * OU EN EST CHAQUE CARTE, lu dans l'avancement que rend le pont. La carte allumee est la question
   * que l'appareil affiche LA, MAINTENANT ; une question refusee est « passee » ; la reponse est
   * « chosen ». En mode secours, c'est le clic qui fait la reponse.
   */
  const etapeDe = (o: 'actuelle' | 'optimisee') => progres?.etapes.find((e) => e.option === o) ?? null
  const etatCarte = (o: OptionChoix): 'maintenant' | 'passee' | 'choisie' | null => {
    const choisi = progres?.resultat?.choix ?? (secours !== null ? null : undefined)
    if (choisi === o) return 'choisie'
    if (secours !== null) {
      const c: Choix = o === 'actuelle' ? 'passer' : o === 'optimisee' ? 'substituer' : 'refuser'
      return reponse === c ? 'choisie' : null
    }
    if (progres?.resultat) return o !== 'annuler' && etapeDe(o)?.issue === 'rejetee' ? 'passee' : null
    if (o === 'annuler') {
      const derniere = acteAffiche?.proposee ? etapeDe('optimisee') : etapeDe('actuelle')
      return derniere?.issue === 'rejetee' ? 'maintenant' : null
    }
    if (etapeDe(o)?.issue === 'rejetee') return 'passee'
    return progres?.en_cours && progres.option === o ? 'maintenant' : null
  }
  const MOT_CARTE = { maintenant: 'on the device now', passee: 'passed on the device', choisie: 'chosen on the device' } as const

  /**
   * UNE DES TROIS REPONSES, telle que la maquette la dessine : la touche, le geste, ce qu'il coute.
   *
   * EN MODE NORMAL CE N'EST PAS UN BOUTON. La decision se prend sur l'appareil ; une carte
   * cliquable a cote laisserait croire que la page decide. Ni curseur main, ni survol : un
   * affichage, qui s'allume sur la question que l'appareil pose. En mode secours seulement, les
   * cartes deviennent des boutons, et les touches 1/2/3 repondent.
   */
  const carte = (touche: 1 | 2 | 3, o: OptionChoix, ton: 'refus' | 'neutre' | 'vert', titre: string, sous: React.ReactNode) => {
    const c: Choix = o === 'actuelle' ? 'passer' : o === 'optimisee' ? 'substituer' : 'refuser'
    const etatC = etatCarte(o)
    const repondue = secours !== null ? reponse !== null : Boolean(progres?.resultat)
    const vivante = secours !== null ? reponse === null : etatC === 'maintenant'
    const classe = `demo-carte demo-carte-${ton}${vivante ? ' demo-carte-vivante' : ''}${etatC === 'choisie' ? ' demo-carte-choisie' : ''}${etatC === 'passee' || (repondue && etatC !== 'choisie') ? ' demo-carte-eteinte' : ''}${revele >= touche ? ' demo-carte-apparue' : ''}`
    const contenu = (
      <>
        <span className="demo-carte-touche" aria-hidden="true">
          {touche}
        </span>
        <span className="demo-carte-corps">
          <span className="demo-carte-titre">{titre}</span>
          <span className="demo-carte-sous" aria-hidden="true">
            {etatC && secours === null ? <b className="demo-carte-etat">{MOT_CARTE[etatC]} · </b> : null}
            {sous}
          </span>
        </span>
        <span className="demo-carte-marque" aria-hidden="true">
          {etatC === 'choisie' ? '✓' : vivante ? '→' : ''}
        </span>
      </>
    )
    return secours !== null ? (
      <button
        type="button"
        onClick={() => repondre(c)}
        disabled={!(demande && occupe === 'choice') || (c === 'substituer' && !remplacement)}
        title={titre}
        className={`${classe} demo-carte-bouton`}
        style={{ ['--delai' as string]: `${touche * 0.25}s` }}
      >
        {contenu}
      </button>
    ) : (
      <div className={classe} title={titre} style={{ ['--delai' as string]: `${touche * 0.25}s` }}>
        {contenu}
      </div>
    )
  }

  const symSortie = acteAffiche ? sym(acteAffiche.actuelle.sortie) : null
  /**
   * L'EMPREINTE AFFICHEE est celle de la question que l'appareil montre, puis celle de la reponse
   * signee : c'est ce qu'un jury peut rapprocher de l'ecran du Ledger, caractere par caractere.
   */
  const digestAffiche = progres?.digest_en_cours ?? progres?.resultat?.prompt_digest ?? null
  const blocFork = fork?.block_number ?? null

  return (
    <div className="demo-scene">
      <div className="demo-champ" aria-hidden="true" style={{ opacity: CHAMP[visuel] }} />

      {/* ------------------------------------------------------------- l'en-tete */}
      {/* LE TITRE RESTE CELUI-CI. La maquette ecrivait « Execute the best possible swap » : une
          promesse de meilleur prix que le produit ne tient pas — sur l'immense majorite des lignes
          du corpus il n'existe qu'une porte, donc aucun « meilleur swap ». Ce titre-ci dit ce que
          la page montre : la garde arrive avant le portefeuille. */}
      <div className={`demo-titre${replie ? ' demo-recule' : ''}`}>
        <h1>One click, and the guard gets there first</h1>
        <span className="demo-titre-meta">
          corpus block {fmtBlock(table.block_number)} · {groupDigits(String(table.n_measurements))} measurements ·
          chain {table.chain_id}
        </span>
      </div>

      <BandeDistribution
        d={dist}
        fraisDuPool={fraisDuPool}
        queueOuverte={vue === 'queue'}
        surQueue={() => setVue(vue === 'queue' ? 'parcours' : 'queue')}
        replie={replie}
        porte={replie && prise !== null ? { bps: prise } : null}
      />

      {/* ------------------------------------------------ le pont, et ce qu'il a compte */}
      <div className="demo-pont">
        {etat === null && <span>reading {PONT}/demo/etat…</span>}
        {etat !== null && estRefus(etat) && (
          <span
            className="demo-pont-panne"
            title={`${etat.raison}. The corpus, the interception and the gate comparison need nobody; the fork, the live quote and the receipt do.`}
          >
            the demo bridge is unreachable — the corpus and the interception still answer
          </span>
        )}
        {etatOk && (
          <>
            <span title={`rpc ${etatOk.fork.rpc}`}>
              fork{' '}
              {etatOk.fork.chain_id === null ? <Inconnu quoi="chain id" /> : chainName(etatOk.fork.chain_id)}{' '}
              {etatOk.fork.block_number === null ? <Inconnu quoi="block number" /> : fmtBlock(etatOk.fork.block_number)}
            </span>
            <span className={`demo-pont-sep demo-pont-appareil${etatOk.speculos.joignable ? '' : ' demo-pont-appareil-off'}`}>
              <span className="demo-pont-diode" aria-hidden="true" />
              device {etatOk.speculos.joignable ? 'ok' : 'off'}
            </span>
            {etatOk.divergences && etatOk.divergences.length > 0 && (
              <span
                className="demo-pont-sep demo-pont-divergence"
                title={etatOk.divergences
                  .map((d) => `act ${d.acte} · ${d.champ}: announced ${d.annonce}, corpus ${d.corpus}`)
                  .join('\n')}
              >
                {etatOk.divergences.length} divergence(s), corpus wins
              </span>
            )}
          </>
        )}
        {/* LE COMPTEUR EST LA PREUVE : il est lu sous l'enveloppe de la garde, pas affirme. */}
        <span className="demo-pont-sep demo-pont-ouvertures">
          wallet opened <b className={ouvertures > 0 ? 'demo-pont-compte-ouvert' : undefined}>{ouvertures}</b> time(s) ·
          counted, not asserted
        </span>
        {alerte && (
          <span className="demo-pont-sep demo-pont-panne" title={alerte.texte}>
            {alerte.quoi} — {alerte.texte}
          </span>
        )}
        <span className="demo-pont-boutons">
          <button
            type="button"
            className={`demo-pont-reseau${reseauActif ? ' demo-pont-reseau-actif' : ''}`}
            onClick={brancherReseau}
            disabled={!fournisseurBrut || Boolean(occupe)}
            title="add the fork network to the wallet, and switch to it"
          >
            {reseauActif ? 'fork network · active' : 'add the fork network'}
          </button>
          <button
            type="button"
            className="demo-pont-reset"
            onClick={remettre}
            disabled={Boolean(occupe)}
            title="rewinds the fork to its snapshot: what was executed is undone"
          >
            reset the fork
          </button>
          <button
            type="button"
            className="demo-pont-portefeuille"
            onClick={connecter}
            disabled={!fournisseurBrut || Boolean(occupe)}
          >
            {adresse ? shortAddr(adresse) : 'connect the wallet'}
          </button>
        </span>
      </div>

      {/* ------------------------------------------------------------------ la scene */}
      {vue === 'queue' && acteAffiche && lecture ? (
        /* LA QUEUE : l'extreme du corpus, publie a sa place — un point de la queue, pas l'ouverture. */
        <div className="demo-queue">
          <div className="demo-tete">
            <span>the tail · one row of {groupDigits(String(dist.nLignes))}, on a token nobody holds</span>
            <button type="button" className="demo-queue-retour" onClick={() => setVue('parcours')}>
              back to the swap
            </button>
          </div>
          <div className="demo-etapes demo-etapes-3">
            <Etape titre={`the tail: ${libelleSwap}`}>
              <L
                src="calldata"
                k="spends"
                fort
                v={
                  <>
                    {montantLisibleActe ?? groupDigits(acteAffiche.actuelle.amountIn)}{' '}
                    {nomMonnaie(acteAffiche.actuelle.entree)} → {nomMonnaie(acteAffiche.actuelle.sortie)}
                    <span className="demo-attenue">
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
                    <span className="hex">{shortAddr(preparationOk?.transaction.to ?? acteAffiche.routeur, 12, 4)}</span> ·{' '}
                    {preparationOk ? 'built by the bridge' : 'Universal Router, rebuilt from the corpus'}
                  </>
                }
              />
              <L k="value" v={preparationOk?.transaction.value ?? acteAffiche.value} />
              <div className="demo-etape-pied">
                <Copy text={calldata ?? ''} label="copy the calldata" />
              </div>
            </Etape>
            <Etape titre="the guard got there first">
              <CeQuiEstLu l={lecture} attendu={acteAffiche.actuelle.poolId} />
              <L
                src="corpus"
                k="take"
                fort
                v={prise === null ? <Inconnu quoi="take at this size" /> : <>{bpsTexte(prise)} bps · {(prise / POURCENT_EN_BPS).toFixed(3)} % of what you send</>}
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
                  <span title="this page asks on ok, warn and block; the package default asks on warn and block, and would let this one through">
                    <span style={{ color: lecture.verdict ? TON_VERDICT[lecture.verdict] : undefined }}>
                      {lecture.verdict ?? 'unknown'}
                    </span>{' '}
                    · warn {bpsTexte(seuils.warnBps)}, block {bpsTexte(seuils.blockBps)} bps — 90th and 99th percentiles,
                    not round numbers. Asks on every verdict here.
                  </span>
                }
              />
            </Etape>
            <Etape titre="what this gate takes">
              {lecture.alternative && (
                <EtatNomme
                  etat={lecture.alternative.etat}
                  suite={AFFICHAGE[lecture.alternative.etat]?.titre}
                  raison={
                    <>
                      One row out of {groupDigits(String(dist.nLignes))}, on a token nobody holds. It is published
                      because it exists — not because it is the norm. The norm is the band above.
                    </>
                  }
                  encadre={false}
                />
              )}
              {leRejeu(acteAffiche)}
            </Etape>
          </div>
        </div>
      ) : acteAffiche && lecture ? (
        <div
          className={`demo-grille${visuel === 'repos' ? '' : ' demo-grille-sans-depart'}`}
          style={{ gridTemplateRows: LIGNES[visuel] }}
        >
          {/* 0 · LE GESTE ORDINAIRE — c'est par la qu'on commence. Le montant n'est pas editable :
              la garde ne sait dire ce qu'une porte prend qu'aux tailles REELLEMENT mesurees, et le
              pont ne prepare que celle-ci. */}
          <section aria-label="the ordinary gesture" className="demo-rangee" style={{ opacity: visuel === 'repos' ? 1 : 0 }}>
            <div className="demo-depart">
              <span className="demo-depart-libelle">
                <span className="demo-depart-ici">START HERE</span>
                <span>the ordinary gesture</span>
              </span>
              <span className="demo-depart-milieu">
                <span className="demo-depart-montants">
                  <span className="demo-depart-boite hex">
                    {montantLisibleActe ?? groupDigits(acteAffiche.actuelle.amountIn)}{' '}
                    <span className="demo-depart-unite">
                      {sym(acteAffiche.actuelle.entree) ?? shortAddr(acteAffiche.actuelle.entree)}
                    </span>
                  </span>
                  <span className="demo-depart-fleche" aria-hidden="true">
                    →
                  </span>
                  <span className="demo-depart-boite demo-depart-sortie">
                    {symSortie ?? shortAddr(acteAffiche.actuelle.sortie)}
                  </span>
                  {!surLaPaireExecutee && (
                    <span className="demo-depart-avertit">the bridge only prepares the executed one</span>
                  )}
                </span>
                <span className="demo-depart-detail">
                  This is a swap you were about to make —{' '}
                  {montantLisibleActe ?? groupDigits(acteAffiche.actuelle.amountIn)} {nomMonnaie(acteAffiche.actuelle.entree)} →{' '}
                  {nomMonnaie(acteAffiche.actuelle.sortie)} · {groupDigits(acteAffiche.actuelle.amountIn)}{' '}
                  {montantLisibleActe ? 'wei, the unit measured' : 'unit(s), the unit measured'}
                </span>
              </span>
              <BoutonSwap
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
              />
            </div>
          </section>

          {/* 1 · LES DEUX ROUTES */}
          <section
            aria-label="two routes"
            className="demo-rangee"
            style={{ minHeight: visuel === 'repos' || visuel === 'garde' ? 0 : 152 }}
          >
            <DeuxRoutes
              entree={acteAffiche.actuelle.entree}
              sortie={acteAffiche.actuelle.sortie}
              symboleEntree={sym(acteAffiche.actuelle.entree)}
              symboleSortie={symSortie}
              courante={candidate(acteAffiche.actuelle)!}
              proposee={candidate(acteAffiche.proposee)}
              lue={visuel !== 'repos'}
              choisie={
                visuel === 'refus'
                  ? null
                  : reponse === 'substituer'
                    ? 'proposee'
                    : reponse === 'passer'
                      ? 'courante'
                      : null
              }
              abandon={visuel === 'refus'}
              apresAppareil={visuel === 'portefeuille' || visuel === 'recu'}
              entete={
                <div className="demo-tete demo-routes-tete">
                  <span>two routes, same swap{visuel === 'repos' ? '' : ' · read by the guard before the wallet'}</span>
                  <span className="demo-tete-meta">
                    {montantLisibleActe ?? groupDigits(acteAffiche.actuelle.amountIn)}{' '}
                    {sym(acteAffiche.actuelle.entree) ?? shortAddr(acteAffiche.actuelle.entree)} · block{' '}
                    {visuel === 'repos' || blocFork === null ? fmtBlock(table.block_number) : fmtBlock(blocFork)}
                    {visuel === 'repos' ? ' · measured in the corpus' : ''}
                  </span>
                  {paire && vue === 'parcours' && issue === null && !demande && (
                    <span className="demo-routes-paires">
                      <PanneauPaires
                        choisie={paireChoisie || cleExecutee}
                        setChoisie={setPaireChoisie}
                        clePaireExecutee={cleExecutee}
                      />
                    </span>
                  )}
                  {acteAffiche.ecartBps !== null && (
                    <span className="demo-routes-ecart">{bpsTexte(acteAffiche.ecartBps)} bps apart</span>
                  )}
                </div>
              }
            />
          </section>

          {/* 2 · VOTRE CHOIX — trois reponses, dans l'ordre ou l'appareil les pose. */}
          <section aria-label="your choice" className="demo-rangee">
            {visuel !== 'repos' && (
              <div className="demo-choix">
                <span className={`demo-choix-libelle${visuel === 'garde' ? ' demo-choix-libelle-demande' : ''}`}>
                  <span className="demo-choix-titre">YOUR CHOICE</span>
                  {secours !== null ? (
                    <>
                      <span className="demo-choix-secours">device unavailable — deciding on the page: {secours}</span>
                      <span>click one, or press 1 · 2 · 3</span>
                    </>
                  ) : (
                    visuel === 'appareil' && <span>the device asks — approve to pick, reject for the next</span>
                  )}
                </span>
                {carte(
                  1,
                  'actuelle',
                  'neutre',
                  `pay ${acteAffiche.actuelle.bps === null ? 'unknown' : `${bpsTexte(acteAffiche.actuelle.bps)} bps`} · send as is`,
                  <>
                    keep your route · receive{' '}
                    {acteAffiche.actuelle.row.out_with === null ? 'unknown' : groupDigits(acteAffiche.actuelle.row.out_with)}{' '}
                    {symSortie}
                  </>,
                )}
                {acteAffiche.proposee &&
                  carte(
                    2,
                    'optimisee',
                    'vert',
                    `pay ${acteAffiche.proposee.bps === null ? 'unknown' : `${bpsTexte(acteAffiche.proposee.bps!)} bps`} · take the other gate`,
                    <>
                      same block, same size · receive{' '}
                      {acteAffiche.proposee.row.out_with === null ? 'unknown' : groupDigits(acteAffiche.proposee.row.out_with)}{' '}
                      {symSortie}
                    </>,
                  )}
                {carte(
                  acteAffiche.proposee ? 3 : 2,
                  'annuler',
                  'refus',
                  'refuse · send nothing',
                  <>cancel · nothing leaves · code {CODE_REFUS_UTILISATEUR}</>,
                )}
              </div>
            )}
          </section>

          {/* 3 · L'APPAREIL, puis LE PORTEFEUILLE, puis LE RESULTAT */}
          <section
            aria-label="the device"
            className={`demo-rangee demo-poste${visuel === 'appareil' ? ' demo-poste-direct' : ''}${visuel === 'refus' ? ' demo-poste-refus' : ''}`}
          >
            <EcranAppareil
              onBouton={bouton}
              texte={ecranTexte}
              lireEcran={lireEcran}
              direct={visuel === 'appareil'}
              titre={titreAppareil}
              badge={badgeAppareil}
              phrase={phraseAppareil}
              mainRef={mainAppareil}
              decider={
                <>
                  {/* LE TEMPS QUI RESTE A CETTE QUESTION se voit arriver : la jauge se vide, et passe
                      a l'encre d'alerte sur la fin. */}
                  {restantS !== null && partRestante !== null && (
                    <span className="demo-delai">
                      <span>
                        {restantS} s left of {DELAI_ETAPE_S}
                      </span>
                      <span className="demo-delai-jauge" aria-hidden="true">
                        <span
                          style={{
                            width: `${partRestante * 100}%`,
                            background: partRestante < 0.1 ? 'var(--m-3)' : 'var(--m-4)',
                          }}
                        />
                      </span>
                    </span>
                  )}
                  <button
                    type="button"
                    className="demo-decider-page"
                    onClick={() => void deciderSurLaPage()}
                    title="the stage escape: the device rejects the open question, and the decision comes back to this page"
                  >
                    decide on the page instead
                  </button>
                </>
              }
            />

            <section aria-label="what the guard read" className={`demo-fin${visuel === 'refus' ? ' demo-fin-refus' : ''}`}>
              <div className="demo-fin-tete">
                <span>
                  {visuel === 'recu'
                    ? 'what it gave'
                    : visuel === 'portefeuille'
                      ? 'the wallet'
                      : visuel === 'refus'
                        ? 'the answer'
                        : visuel === 'repos'
                          ? 'what the guard will read'
                          : 'what the guard read'}
                </span>
                {issue && <span className={`demo-fin-issue demo-fin-issue-${issue === 'REFUSEE' ? 'refus' : 'passe'}`}>{LIBELLE_ISSUE[issue]}</span>}
              </div>

              {visuel === 'refus' && (
                <div className="demo-fin-corps demo-fin-milieu">
                  <span className="demo-fin-code">{codeRendu ?? CODE_REFUS_UTILISATEUR}</span>
                  <span className="demo-fin-grand">nothing leaves</span>
                  <span className="demo-fin-ligne">
                    code {codeRendu ?? CODE_REFUS_UTILISATEUR} · wallet opened {ouvertures} time(s) · nothing left
                  </span>
                  {decision && (
                    <span className="demo-fin-petit">
                      decided by {decision.by} — {decision.reason}
                    </span>
                  )}
                  {rapport && (
                    <span className="demo-fin-petit">
                      report: {rapport.findings.length} finding(s) ·{' '}
                      {rapport.decode.complete ? 'calldata read whole' : 'calldata not read whole'}
                    </span>
                  )}
                  <button type="button" className="demo-fin-rejouer" onClick={rejouer}>
                    replay
                  </button>
                </div>
              )}

              {visuel === 'portefeuille' && (
                <div className="demo-fin-corps demo-fin-milieu">
                  <span className="demo-fin-maintenant">ONLY NOW</span>
                  <span className="demo-fin-grand">the wallet opens with the plan you chose</span>
                  <span className="demo-fin-ligne">
                    {reponse === 'substituer' && acteAffiche.proposee
                      ? `built by the guard, never sent by it · gate ${shortAddr(acteAffiche.proposee.poolId, 10, 4)} · ${acteAffiche.proposee.bps === null ? 'unknown' : `${bpsTexte(acteAffiche.proposee.bps)} bps`}`
                      : `your original transaction · gate ${shortAddr(acteAffiche.actuelle.poolId, 10, 4)} · ${acteAffiche.actuelle.bps === null ? 'unknown' : `${bpsTexte(acteAffiche.actuelle.bps)} bps`}`}
                  </span>
                  <span className="demo-fin-attente">sign in your wallet — this page never signs</span>
                </div>
              )}

              {visuel === 'recu' && (
                <div className="demo-fin-corps demo-fin-milieu">
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
                    parOu={issue === 'REMPLACEMENT' ? 'through your gate' : 'through the cheaper gate'}
                    bilan={
                      issue === 'REMPLACEMENT' ? (
                        <>kept {acteAffiche.ecartBps === null ? 'unknown' : `${bpsTexte(acteAffiche.ecartBps)} bps`}</>
                      ) : (
                        <>
                          paid {acteAffiche.actuelle.bps === null ? 'unknown' : `${bpsTexte(acteAffiche.actuelle.bps)} bps`} —
                          told first
                        </>
                      )
                    }
                    symboleSortie={symSortie}
                  />
                  <span className="demo-fin-petit">
                    {hash ? (
                      <>
                        tx <span className="hex">{shortAddr(hash, 10, 6)}</span> ·{' '}
                        {recuTx ? `block ${fmtBlock(Number(recuTx.blockNumber))} · status ${recuTx.status}` : 'waiting for the receipt…'}
                      </>
                    ) : (
                      'nothing sent'
                    )}
                  </span>
                  {soldesAvant && (
                    <span className="demo-fin-petit">
                      balances {groupDigits(soldesAvant.eth_wei)} wei / {soldeUsdc(soldesAvant)}
                      {soldesApres && <> → {groupDigits(soldesApres.eth_wei)} wei / {soldeUsdc(soldesApres)}</>}
                    </span>
                  )}
                  {decision && (
                    <span className="demo-fin-petit">
                      decided by {decision.by} — {decision.reason}
                      {progres && progres.etapes.length > 0
                        ? ` · ${progres.etapes.reduce((n, e) => n + e.ecrans, 0)} screens on the device`
                        : ''}
                      {rapport ? ` · report: ${rapport.findings.length} finding(s)` : ''}
                    </span>
                  )}
                  <button type="button" className="demo-fin-rejouer" onClick={rejouer}>
                    replay
                  </button>
                </div>
              )}

              {(visuel === 'repos' || visuel === 'garde' || visuel === 'appareil') && (
                /* D'OU VIENT CHAQUE VALEUR : le lisere de chaque ligne la dit, la legende la nomme.
                   Rien n'est saisi par l'utilisateur — tout est lu dans le calldata intercepte. */
                <div className={`demo-fin-corps demo-fin-bas${visuel === 'repos' ? ' demo-fin-attenue' : ''}`}>
                  <div className="demo-fin-legende">
                    {(['calldata', 'derive', 'corpus'] as const).map((k) => (
                      <span key={k}>
                        <span aria-hidden="true" className="demo-fin-legende-trait" style={{ background: LISERE[k] }} />
                        {k === 'calldata' ? 'read from the calldata' : k === 'derive' ? 're-derived' : 'from the corpus'}
                      </span>
                    ))}
                  </div>
                  {lecture.leg === null ? (
                    <L src="calldata" k="swap" v={<Inconnu quoi="no v4 swap in this calldata" />} />
                  ) : (
                    <>
                      <L src="calldata" k="hook" fort v={<span className="hex">{lecture.leg.poolKey.hooks}</span>} />
                      <L
                        src="derive"
                        k="pool id"
                        v={
                          <>
                            <span className="hex">{shortAddr(lecture.leg.poolId, 12, 6)}</span> ·{' '}
                            {lecture.leg.poolId === acteAffiche.actuelle.poolId ? 'matches the corpus' : 'NOT the pool expected'}
                          </>
                        }
                      />
                    </>
                  )}
                  <L
                    src="corpus"
                    k="take"
                    fort
                    v={
                      prise === null ? (
                        <Inconnu quoi="take at this size" />
                      ) : (
                        <>
                          {bpsTexte(prise)} bps ·{' '}
                          <span className="demo-fin-etiquette">{lecture.consultation?.label ?? 'unknown'}</span>
                        </>
                      )
                    }
                  />
                  <L
                    k="prompt digest"
                    v={
                      digestAffiche ? (
                        <>
                          <span className="hex">{shortAddr(digestAffiche, 12, 8)}</span>{' '}
                          <Copy text={digestAffiche} label="copy" />
                        </>
                      ) : (
                        <span className="demo-attenue">filled in when the device asks</span>
                      )
                    }
                  />
                  {visuel !== 'garde' && (
                    <span className="demo-fin-petit">— keccak256 of the text sent to the device, shown there too</span>
                  )}
                  {leRejeu(acteAffiche)}
                </div>
              )}
            </section>
          </section>
        </div>
      ) : null}

      {/* ------------------------------------------------------------------- le fil */}
      <nav className="demo-rail" aria-label="where the demonstration is">
        <ol>
          {ETAPES.map((t, i) => (
            <li
              key={t}
              className={i < etapeCourante ? 'demo-rail-faite' : i === etapeCourante ? 'demo-rail-courante' : undefined}
              aria-current={i === etapeCourante ? 'step' : undefined}
            >
              <span className="demo-rail-n">{String(i + 1).padStart(2, '0')}</span>
              {t}
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="demo-rail-suivant"
          onClick={() => mainAppareil.current?.('right')}
          disabled={visuel !== 'appareil'}
          title="while the device asks: space or → presses next, ← goes back, Enter presses both buttons — on the separator after ifRejected it skips to Sign message; when the device is unavailable: 1, 2 or 3 answers on the page"
        >
          {secours !== null
            ? 'device unavailable · 1 / 2 / 3 answer on the page'
            : 'next → (space) · ← back · enter: skip to sign / confirm'}
        </button>
      </nav>
    </div>
  )
}
