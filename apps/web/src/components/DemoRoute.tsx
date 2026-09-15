/**
 * LA ROUTE — un itineraire qui se REECRIT, pas un tableau qui se remplit.
 *
 * C'est l'image que la demonstration doit laisser. Un swap n'est pas une ligne de journal :
 * c'est un chemin, `ETH -> [ gate ] -> USDC`, et le seul element qu'un utilisateur ne voit
 * jamais avant de signer est justement celui du milieu. La garde le nomme, dit ce qu'il prend,
 * et — quand le corpus en connait un moins cher — la route BASCULE : l'ancienne porte reste
 * barree a cote de la nouvelle, avec l'ecart entre les deux.
 *
 * SOBRIETE. La charte du site est une plaque gravee : la bascule dure 240 ms, en opacite et en
 * translation de quelques pixels, sans rebond et sans couleur qui clignote. Et
 * `prefers-reduced-motion` la supprime entierement (index.css) : la bascule reste, l'animation
 * part. Une transition qu'on ne peut pas couper est une transition qu'on subit.
 *
 * AUCUN CHIFFRE N'EST ECRIT ICI. Le prelevement, l'ecart, les frais du pool et le montant
 * viennent tous du corpus, par ../demo/scenario.ts et ../demo/paires.ts.
 */
import type { ReactNode } from 'react'
import { groupDigits, shortAddr } from '../lib/format'
import { rampVar } from '../lib/ramp'
import { bpsTexte } from './DemoDistribution'
import { POURCENT_EN_BPS } from '../demo/distribution'

/**
 * UN JETON, AVEC SON NOM QUAND ON L'A LU.
 *
 * `symbole` est nul quand `symbol()` n'a pas ete lu sur la chaine pour cette adresse : on
 * affiche alors l'adresse SEULE. Ecrire un nom parce que l'adresse y ressemble serait la faute
 * meme que ce depot reproche au reste, et un joli nom faux vaut moins qu'une adresse nue.
 */
export function Jeton({
  adresse,
  symbole,
  titre,
}: {
  adresse: string
  symbole: string | null
  titre?: string
}) {
  return (
    <span
      className="inline-flex items-baseline gap-[6px] px-[8px] py-[4px]"
      style={{ border: '1px solid var(--line)', background: 'var(--bg-2)', minWidth: 0 }}
      title={titre ?? adresse}
    >
      {symbole && (
        <span className="t-data" style={{ color: 'var(--ink)' }}>
          {symbole}
        </span>
      )}
      <span className="t-data-xs hex" style={{ color: 'var(--ink-2)' }}>
        {shortAddr(adresse, 6, 4)}
      </span>
    </span>
  )
}

const Fleche = () => (
  <span className="t-data" style={{ color: 'var(--ink-2)', flex: 'none' }} aria-hidden="true">
    →
  </span>
)

export interface PorteRoute {
  poolId: string
  hook: string
  /** le prelevement mesure. null = pas mesure a cette taille : « unknown », jamais zero. */
  bps: number | null
  /** les frais que le pool prend deja, lus dans slot0. null = non lu. */
  lpBps: number | null
}

/** La carte d'une porte : ce que personne ne voit avant de signer. */
function Porte({
  p,
  etat,
  legende,
}: {
  p: PorteRoute
  etat: 'courante' | 'remplacee' | 'nouvelle'
  legende: ReactNode
}) {
  const barre = etat === 'remplacee'
  return (
    <span
      className={`demo-porte ${etat === 'nouvelle' ? 'demo-porte-neuve' : ''}`}
      style={{
        border: `1px solid ${etat === 'nouvelle' ? 'var(--m-4)' : 'var(--line-strong)'}`,
        background: etat === 'nouvelle' ? 'var(--bg-3)' : 'var(--bg-2)',
        opacity: barre ? 0.45 : 1,
        minWidth: 0,
      }}
    >
      <span className="flex items-baseline gap-[7px]" style={{ minWidth: 0 }}>
        <span
          aria-hidden="true"
          style={{
            width: 7,
            height: 7,
            flex: 'none',
            background: p.bps === null ? 'var(--ink-4)' : rampVar(p.bps),
          }}
        />
        <span
          className="t-data-xs hex"
          style={{
            color: 'var(--ink)',
            textDecoration: barre ? 'line-through' : undefined,
            overflowWrap: 'anywhere',
          }}
          title={`pool ${p.poolId} · hook ${p.hook}`}
        >
          gate {shortAddr(p.poolId, 10, 4)}
        </span>
      </span>
      <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
        {legende}
      </span>
    </span>
  )
}

/** Ce qu'une porte prend, dit trois fois : en bps, en pour cent, et contre les frais du pool. */
export function priseLisible(p: PorteRoute): ReactNode {
  if (p.bps === null) return <span title="not measured at this size">unknown</span>
  const pct = (p.bps / POURCENT_EN_BPS).toFixed(3)
  return (
    <>
      {bpsTexte(p.bps)} bps · {pct} %
      {p.lpBps !== null && (
        <>
          {' '}
          · on top of the pool’s {bpsTexte(p.lpBps)} bps
        </>
      )}
    </>
  )
}

/**
 * LA ROUTE. `remplacante` non nulle et `basculee` vraie : l'itineraire se reecrit sous les yeux.
 */
export function RouteSwap({
  entree,
  sortie,
  symboleEntree,
  symboleSortie,
  montant,
  courante,
  remplacante,
  basculee,
  ecartBps,
  compact = false,
}: {
  entree: string
  sortie: string
  symboleEntree: string | null
  symboleSortie: string | null
  /** ce qu'on depense, deja mis en forme par l'appelant */
  montant: ReactNode
  courante: PorteRoute
  remplacante: PorteRoute | null
  basculee: boolean
  ecartBps: number | null
  compact?: boolean
}) {
  const active = basculee && remplacante ? remplacante : courante
  return (
    <div
      className="flex flex-wrap items-center gap-x-[10px] gap-y-[6px]"
      style={{ minWidth: 0 }}
      aria-live="polite"
    >
      {!compact && (
        <span className="t-label" style={{ color: 'var(--ink-2)', flex: 'none' }}>
          route
        </span>
      )}
      <Jeton adresse={entree} symbole={symboleEntree} />
      {!compact && (
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {montant}
        </span>
      )}
      <Fleche />
      {basculee && remplacante && (
        <>
          <Porte p={courante} etat="remplacee" legende={priseLisible(courante)} />
          <Fleche />
        </>
      )}
      <Porte
        p={active}
        etat={basculee && remplacante ? 'nouvelle' : 'courante'}
        legende={priseLisible(active)}
      />
      <Fleche />
      <Jeton adresse={sortie} symbole={symboleSortie} />
      {basculee && ecartBps !== null && (
        <span className="t-data" style={{ color: 'var(--m-4)' }}>
          −{bpsTexte(ecartBps)} bps
        </span>
      )}
    </div>
  )
}

/* ============================================================ LES DEUX ROUTES */

export interface RouteCandidate {
  poolId: string
  hook: string
  bps: number | null
  lpBps: number | null
  /** ce que le swap REND par cette porte, mesure. null = non mesure : « unknown », jamais zero. */
  recu: string | null
}

/**
 * LES DEUX ROUTES, COTE A COTE — le visuel central de la demonstration.
 *
 * Il est gros, et c'est une contrainte, pas un gout : l'ecran part en visio devant un jury, et
 * ce qui n'est pas lisible sur une video compressee n'existe pas. Les chiffres qui portent la
 * demonstration — les deux couts et les deux montants recus — sont donc en corps metrique, en
 * encre pleine, et aucune information n'est portee par une seule nuance de couleur : la porte
 * choisie est designee par son LIBELLE et par son filet, pas par sa teinte seule.
 *
 * Les montants recus viennent de la colonne `out_with` du corpus : ce sont des mesures, pas des
 * estimations. Et rien n'est extrapole a une autre taille — un taux mesure a une taille est
 * faux a toutes les autres, et c'est ecrit partout dans ce depot.
 */
export function DeuxRoutes({
  entree,
  sortie,
  symboleEntree,
  symboleSortie,
  montant,
  courante,
  proposee,
  choisie,
  ecartBps,
}: {
  entree: string
  sortie: string
  symboleEntree: string | null
  symboleSortie: string | null
  montant: ReactNode
  courante: RouteCandidate
  proposee: RouteCandidate | null
  /** laquelle la page a retenue. null = aucune encore. */
  choisie: 'courante' | 'proposee' | null
  ecartBps: number | null
}) {
  const ligne = (c: RouteCandidate, quoi: 'courante' | 'proposee') => {
    const active = choisie === quoi
    return (
      <div
        className="demo-route-ligne flex flex-wrap items-center gap-x-[10px] gap-y-[4px] px-[10px] py-[6px]"
        style={{
          border: `1px solid ${active ? 'var(--m-4)' : 'var(--line)'}`,
          background: active ? 'var(--bg-3)' : 'var(--bg-2)',
          minWidth: 0,
        }}
      >
        <span className="t-label" style={{ color: active ? 'var(--m-4)' : 'var(--ink-2)', width: 96, flex: 'none' }}>
          {quoi === 'courante' ? 'your route' : 'cheaper gate'}
          {active ? ' · chosen' : ''}
        </span>
        <Jeton adresse={entree} symbole={symboleEntree} />
        <Fleche />
        <span
          className="inline-flex items-baseline gap-[8px] px-[9px] py-[3px]"
          style={{ border: '1px solid var(--line-strong)', background: 'var(--bg-1)', minWidth: 0 }}
        >
          <span
            aria-hidden="true"
            style={{ width: 8, height: 8, flex: 'none', background: c.bps === null ? 'var(--ink-4)' : rampVar(c.bps) }}
          />
          <span className="t-data-xs hex" style={{ color: 'var(--ink)' }} title={`pool ${c.poolId} · hook ${c.hook}`}>
            gate {shortAddr(c.poolId, 10, 4)}
          </span>
          <span className="t-data-lg" style={{ color: 'var(--ink)' }}>
            {c.bps === null ? 'unknown' : `${bpsTexte(c.bps)} bps`}
          </span>
        </span>
        <Fleche />
        <Jeton adresse={sortie} symbole={symboleSortie} />
        <span className="ml-auto flex items-baseline gap-[7px]" style={{ flex: 'none' }}>
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            receives
          </span>
          <span className="t-data-lg" style={{ color: 'var(--ink)' }}>
            {c.recu === null ? 'unknown' : groupDigits(c.recu)}
          </span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[5px]" aria-live="polite" style={{ minWidth: 0 }}>
      <div className="flex flex-wrap items-baseline gap-[10px]">
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>
          two routes, same swap
        </span>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {montant}
        </span>
        {ecartBps !== null && (
          <span className="ml-auto t-data-lg" style={{ color: 'var(--m-4)' }}>
            {bpsTexte(ecartBps)} bps apart
          </span>
        )}
      </div>
      {ligne(courante, 'courante')}
      {proposee && ligne(proposee, 'proposee')}
    </div>
  )
}

/**
 * CE QU'ON A GARDE — trois nombres, et rien d'autre.
 *
 * Pas d'extrapolation : jamais « sur 10 ETH ca ferait tant ». Un taux mesure a une taille est
 * faux a toutes les autres ; l'ordre de grandeur est porte par le bandeau de distribution, pas
 * par ce panneau. Le montant est petit parce que la taille est petite, et c'est tout.
 */
export function CeQuOnAGarde({
  recu,
  auraitRecu,
  gardeBps,
  sortie,
  symboleSortie,
}: {
  recu: string | null
  auraitRecu: string | null
  gardeBps: number | null
  sortie: string
  symboleSortie: string | null
}) {
  const bloc = (quoi: string, valeur: ReactNode, accent = false) => (
    <div className="flex flex-col" style={{ minWidth: 0 }}>
      <span className="t-label" style={{ color: 'var(--ink-2)' }}>
        {quoi}
      </span>
      <span className="t-metric" style={{ color: accent ? 'var(--m-4)' : 'var(--ink)', lineHeight: 1.05 }}>
        {valeur}
      </span>
    </div>
  )
  return (
    <div
      className="flex flex-wrap items-end gap-x-[36px] gap-y-[8px] px-[12px] py-[8px]"
      style={{ border: '1px solid var(--m-4)', background: 'var(--bg-1)', minWidth: 0 }}
    >
      {bloc(
        `received${symboleSortie ? ` · ${symboleSortie}` : ''}`,
        recu === null ? 'unknown' : groupDigits(recu),
      )}
      {bloc('would have received', auraitRecu === null ? 'unknown' : groupDigits(auraitRecu))}
      {bloc('kept', gardeBps === null ? 'unknown' : `${bpsTexte(gardeBps)} bps`, true)}
      <span className="t-data-xs" style={{ color: 'var(--ink-2)', maxWidth: '54ch', lineHeight: 1.35 }}>
        Measured at this size, on {shortAddr(sortie, 6, 4)}. Nothing is extrapolated: a rate measured
        at one size is wrong at every other one.
      </span>
    </div>
  )
}
