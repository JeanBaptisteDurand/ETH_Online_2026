/**
 * LES DEUX ROUTES — deux itineraires qui se lisent, pas un tableau qui se remplit.
 *
 * C'est l'image que la demonstration doit laisser. Un swap n'est pas une ligne de journal :
 * c'est un chemin, `ETH —— [ gate ] —— USDC`, et le seul element qu'un utilisateur ne voit jamais
 * avant de signer est justement celui du milieu. La garde le nomme, dit ce qu'il prend, et quand
 * le corpus en connait un moins cher a la meme taille, les deux chemins sont poses l'un sous
 * l'autre.
 *
 * LA FORME EST CELLE DE LA MAQUETTE v2 (demo-v2-le-choix). Au repos les chiffres sont ceux du
 * corpus, en encre retenue, la porte en pointilles : la garde ne les a pas encore lus. Des qu'elle
 * lit, ils passent a l'encre pleine, en corps metrique, et un flux parcourt les deux traits. Quand
 * un plan est choisi, sa route s'allume (filet d'accent, halo) et l'autre recule en ROUGE, avec le
 * mot « not taken » : un choix se dit par un mot, jamais par une teinte seule.
 *
 * AUCUN CHIFFRE N'EST ECRIT ICI. Le prelevement, l'ecart, les montants recus viennent tous du
 * corpus, par ../demo/scenario.ts. Un prelevement absent se dit « unknown », jamais zero.
 */
import type { ReactNode } from 'react'
import { groupDigits, shortAddr } from '../lib/format'
import { rampVar } from '../lib/ramp'
import { bpsTexte } from './DemoDistribution'

/**
 * UN JETON, AVEC SON NOM QUAND ON L'A LU.
 *
 * `symbole` est nul quand `symbol()` n'a pas ete lu sur la chaine pour cette adresse : on affiche
 * alors l'adresse SEULE. Ecrire un nom parce que l'adresse y ressemble serait la faute meme que ce
 * depot reproche au reste, et un joli nom faux vaut moins qu'une adresse nue.
 */
export function Jeton({ adresse, symbole }: { adresse: string; symbole: string | null }) {
  return (
    <span className="demo-jeton" title={adresse}>
      {symbole && (
        <span className="demo-jeton-symbole">{symbole}</span>
      )}
      <span className="demo-jeton-adresse hex">{shortAddr(adresse, 6, 4)}</span>
    </span>
  )
}

export interface RouteCandidate {
  poolId: string
  hook: string
  /** le prelevement mesure. null = pas mesure a cette taille : « unknown », jamais zero. */
  bps: number | null
  /** ce que le swap REND par cette porte, mesure. null = non mesure : « unknown », jamais zero. */
  recu: string | null
}

/** Ou en est une route dans le parcours. */
type EtatRoute = 'repos' | 'lue' | 'choisie' | 'ecartee'

function Route({
  p,
  nom,
  etiquette,
  etat,
  rang,
  entree,
  sortie,
  symboleEntree,
  symboleSortie,
  petite,
}: {
  p: RouteCandidate
  nom: string
  etiquette: string
  etat: EtatRoute
  /** 0 ou 1 : decale le flux de la seconde route */
  rang: number
  entree: string
  sortie: string
  symboleEntree: string | null
  symboleSortie: string | null
  /** le plan est parti a l'appareil : les chiffres cedent la place */
  petite: boolean
}) {
  const flux = etat === 'lue' || etat === 'choisie'
  return (
    <div
      className={`demo-route demo-route-${etat}${petite ? ' demo-route-petite' : ''}`}
      style={{ ['--rang' as string]: `${rang * 0.4}s` }}
    >
      <span className="demo-route-nom">
        <span>{nom}</span>
        <span className="demo-route-etiquette">{etiquette}</span>
      </span>
      <span className="demo-route-chemin">
        <Jeton adresse={entree} symbole={symboleEntree} />
        <span className="demo-route-trait" aria-hidden="true">
          {flux && <span />}
        </span>
        <span className="demo-route-porte" title={`pool ${p.poolId} · hook ${p.hook}`}>
          <span
            className="demo-route-rampe"
            aria-hidden="true"
            style={{ background: p.bps === null ? 'var(--ink-3)' : rampVar(p.bps) }}
          />
          <span className="demo-route-gate hex">gate {shortAddr(p.poolId, 10, 4)}</span>
          <span className="demo-route-chiffre">
            {p.bps === null ? 'unknown' : bpsTexte(p.bps)} <span className="demo-route-unite">bps</span>
          </span>
        </span>
        <span className="demo-route-trait" aria-hidden="true">
          {flux && <span />}
        </span>
        <Jeton adresse={sortie} symbole={symboleSortie} />
      </span>
      <span className="demo-route-recoit">
        <span className="demo-route-petit">receives</span>
        <span className="demo-route-chiffre">{p.recu === null ? 'unknown' : groupDigits(p.recu)}</span>
        {symboleSortie && <span className="demo-route-petit">{symboleSortie}</span>}
      </span>
    </div>
  )
}

/**
 * LES DEUX ROUTES, L'UNE SOUS L'AUTRE.
 *
 * `choisie` dit quel plan est parti a l'appareil ; `abandon` que le parcours s'est arrete sur un
 * refus, et alors aucune route n'est prise. La route retenue gagne de la hauteur (la grille
 * `1.2fr .8fr` se reorganise en 480 ms) : on voit le chemin qui sera signe.
 */
export function DeuxRoutes({
  entree,
  sortie,
  symboleEntree,
  symboleSortie,
  courante,
  proposee,
  lue,
  choisie,
  abandon,
  apresAppareil,
  entete,
}: {
  entree: string
  sortie: string
  symboleEntree: string | null
  symboleSortie: string | null
  courante: RouteCandidate
  proposee: RouteCandidate | null
  /** la garde a lu le calldata intercepte : les chiffres passent a l'encre pleine */
  lue: boolean
  /** le plan qui est parti a l'appareil. null = aucun encore. */
  choisie: 'courante' | 'proposee' | null
  /** le parcours s'est arrete sur un refus : aucune route n'est prise */
  abandon: boolean
  /** l'appareil a le plan, ou l'a rendu : le mot « on the device » tombe */
  apresAppareil: boolean
  /** l'en-tete du panneau : titre, montant, ecart, selecteur de paire */
  entete: ReactNode
}) {
  const etat = (quoi: 'courante' | 'proposee'): EtatRoute => {
    if (abandon) return 'ecartee'
    if (choisie !== null) return choisie === quoi ? 'choisie' : 'ecartee'
    return lue ? 'lue' : 'repos'
  }
  const etiquette = (quoi: 'courante' | 'proposee'): string => {
    const e = etat(quoi)
    if (e === 'ecartee') return 'not taken'
    if (e === 'choisie') return apresAppareil ? 'chosen · the device answered' : 'chosen · on the device'
    if (e === 'repos') return 'measured in the corpus · read when you swap'
    return quoi === 'courante' ? 'the gate the site picked' : 'same block, same size'
  }
  const petite = choisie !== null || abandon
  const lignes = choisie === 'courante' ? '1.2fr .8fr' : choisie === 'proposee' ? '.8fr 1.2fr' : '1fr 1fr'
  const commun = { entree, sortie, symboleEntree, symboleSortie, petite }

  return (
    <div className="demo-routes" aria-live="polite">
      {entete}
      <div className="demo-routes-lignes" style={{ gridTemplateRows: proposee ? lignes : '1fr' }}>
        <Route p={courante} nom="your route" etiquette={etiquette('courante')} etat={etat('courante')} rang={0} {...commun} />
        {proposee && (
          <Route
            p={proposee}
            nom="cheaper gate"
            etiquette={etiquette('proposee')}
            etat={etat('proposee')}
            rang={1}
            {...commun}
          />
        )}
      </div>
    </div>
  )
}

/**
 * CE QU'ON A GARDE — le recu, ce qu'on aurait recu, et l'ecart. Rien d'autre.
 *
 * Pas d'extrapolation : jamais « sur 10 ETH ca ferait tant ». Un taux mesure a une taille est faux
 * a toutes les autres ; l'ordre de grandeur est porte par le bandeau de distribution, pas par ce
 * panneau. Le montant est petit parce que la taille est petite, et c'est tout.
 */
export function CeQuOnAGarde({
  recu,
  auraitRecu,
  parOu,
  bilan,
  symboleSortie,
}: {
  recu: string | null
  auraitRecu: string | null
  /** par quelle porte on AURAIT recu l'autre montant */
  parOu: string
  /** « kept 4.0933 bps » ou « paid 4.0933 bps — told first » : deja mis en forme par l'appelant */
  bilan: ReactNode
  symboleSortie: string | null
}) {
  return (
    <div className="demo-garde">
      <span className="demo-garde-bloc">
        <span className="demo-fin-petit">received</span>
        <span className="demo-garde-recu">
          {recu === null ? 'unknown' : groupDigits(recu)}
          {symboleSortie && <span className="demo-garde-unite"> {symboleSortie}</span>}
        </span>
      </span>
      <span className="demo-garde-bloc">
        <span className="demo-fin-petit">would have received</span>
        <span className="demo-garde-aurait">
          {auraitRecu === null ? 'unknown' : groupDigits(auraitRecu)} {parOu}
        </span>
      </span>
      <span className="demo-garde-bilan">{bilan}</span>
      <span className="demo-fin-petit">
        Measured at this size. Nothing is extrapolated: a rate measured at one size is wrong at every other one.
      </span>
    </div>
  )
}
