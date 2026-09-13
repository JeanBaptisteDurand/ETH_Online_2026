/**
 * LA FEUILLE DE ROUTE — et la règle du projet s’y applique d’abord.
 *
 * Une feuille de route est l’endroit où un projet ment le plus facilement : il suffit d’écrire
 * « bientôt » devant ce qui n’existe pas. Celle-ci ne promet aucune date, et elle range les
 * quatorze outils par leur état RÉEL, lu dans `src/lib/outils.ts` — pas recopié ici :
 *
 *   colonne 1  etat === 'pret'        ce qui tourne aujourd’hui
 *   colonne 2  etat === 'en_attente'  écrit, testé, pas encore déployé — avec son POURQUOI
 *   colonne 3  ce qui n’existe pas encore, et qui n’a donc ni date ni promesse
 *
 * Le mot « bientôt » n’apparaît nulle part. « Pas encore » se vérifie ; « bientôt » non.
 */
import type { ReactNode } from 'react'
import { Panel, Chip, Lien } from './Prim'
import { OUTILS, type Outil } from '../lib/outils'
import facts from '../data/facts.json'

const nb = (x: number) => x.toLocaleString('fr')

const PRETS = OUTILS.filter((o) => o.etat === 'pret')
const ATTENTE = OUTILS.filter((o) => o.etat === 'en_attente')
const HORS_LIGNE = OUTILS.filter((o) => o.etat === 'hors_ligne')

const BLOC = 50614000
const AT = facts.attestations

/** Ce qui reste devant. Chaque entrée dit ce qui EST aujourd’hui, avant de dire ce qui manque. */
const SUITE: { titre: string; etat: ReactNode; texte: ReactNode }[] = [
  {
    titre: 'D’autres chaînes que Base',
    etat: 'rien de mesuré ailleurs',
    texte: (
      <>
        Les {nb(facts.inventaire.corpus.n)} mesures sont prises sur <F>Base</F> et sur elle seule
        (<C>chain_id 8453</C> sur chaque ligne du corpus). Le moteur ne connaît rien d’autre
        aujourd’hui : aucun hook d’une autre chaîne n’a été coté, donc aucune réponse ne peut en
        parler. <F>Pas encore.</F>
      </>
    ),
  },
  {
    titre: 'Un balayage continu, au lieu d’un bloc épinglé',
    etat: <>tout est pris au bloc {nb(BLOC)}</>,
    texte: (
      <>
        Un chiffre n’est rejouable que parce qu’il porte son bloc : le corpus entier est épinglé
        au bloc {nb(BLOC)}, et une mesure demandée à un autre bloc rend{' '}
        <C>NOT_MEASURABLE / fork_block_mismatch</C> plutôt qu’un nombre estampillé d’un bloc où il
        n’a pas été pris. Un balayage qui suivrait la tête de chaîne et re-mesurerait en continu
        n’est pas écrit. <F>Pas encore.</F>
      </>
    ),
  },
  {
    titre: 'L’attestation des hooks calculés mais pas écrits',
    etat: (
      <>
        {nb(AT.calcules)} calculées, {nb(AT.ecrits)} écrites
      </>
    ),
    texte: (
      <>
        {nb(AT.calcules)} attestations sont calculées depuis le corpus ; <F>{nb(AT.ecrits)}</F>{' '}
        seulement sont réellement écrites on-chain ({nb(AT.tentes)} tentées, {nb(AT.ecartes)}{' '}
        écartées). Le reste attend du gaz, et l’écart est publié plutôt que lissé. Le contrat se
        lit ici :{' '}
        <Lien href={AT.hashscan}>
          {AT.contrat.slice(0, 10)}…{AT.contrat.slice(-6)}
        </Lien>
        . <F>Pas encore.</F>
      </>
    ),
  },
  {
    titre: 'Le déploiement du contrat d’abonnement',
    etat: 'écrit, testé, jamais déployé',
    texte: (
      <>
        182 lignes de Solidity et 20 tests forge, vérifiés contre un fork local où 1,5 × le prix
        achète exactement 45,00 jours — mais le contrat n’est <F>déployé sur aucun réseau
        public</F>. Tant qu’il ne l’est pas, le compte répond « abonnement non vérifié, donc pas
        actif », et il le dit au lieu de faire semblant. <F>Pas encore.</F>
      </>
    ),
  },
]

/* ------------------------------------------------------------------ le grain */

function F({ children }: { children: ReactNode }) {
  return <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{children}</strong>
}

function C({ children }: { children: ReactNode }) {
  return (
    <code className="hex t-data-sm" style={{ color: 'var(--ink)' }}>
      {children}
    </code>
  )
}

function P({ children }: { children: ReactNode }) {
  return (
    <p
      className="m-0"
      style={{
        fontFamily: 'var(--prose)',
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--ink-2)',
        maxWidth: '76ch',
      }}
    >
      {children}
    </p>
  )
}

/**
 * Le `pourquoi` des outils porte des `**gras**` : il est écrit une fois, dans outils.ts, et lu
 * par plusieurs surfaces. On le rend sans jamais passer par du HTML brut.
 */
function Gras({ texte }: { texte: string }) {
  return (
    <>
      {texte.split(/\*\*(.+?)\*\*/g).map((part, i) =>
        i % 2 === 1 ? <F key={i}>{part}</F> : <span key={i}>{part}</span>,
      )}
    </>
  )
}

/** Une ligne de colonne : le nom, la question, et ce qu’il faut savoir de plus. */
function Ligne({
  titre,
  sous,
  corps,
  etiquette,
}: {
  titre: ReactNode
  sous?: ReactNode
  corps?: ReactNode
  etiquette?: ReactNode
}) {
  return (
    <li
      className="px-[16px] py-[11px] flex flex-col gap-[6px]"
      style={{ borderTop: '1px solid var(--line)', listStyle: 'none' }}
    >
      <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[4px]">
        <span className="t-data-sm" style={{ color: 'var(--ink)', fontSize: 13 }}>
          {titre}
        </span>
        {etiquette && <Chip>{etiquette}</Chip>}
      </div>
      {sous && (
        <div className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.5 }}>
          {sous}
        </div>
      )}
      {corps && (
        <div
          className="t-data-sm"
          style={{ color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: '60ch' }}
        >
          {corps}
        </div>
      )}
    </li>
  )
}

function Compte({ n, quoi }: { n: number; quoi: string }) {
  return (
    <div className="px-[16px] pt-[4px] pb-[10px] flex items-baseline gap-[10px]">
      <span className="t-metric" style={{ fontFamily: 'var(--mono)', color: 'var(--ink)' }}>
        {n}
      </span>
      <span className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '22ch' }}>
        {quoi}
      </span>
    </div>
  )
}

const question = (o: Outil) => `« ${o.question} »`

/* ----------------------------------------------------------------- la page */

export function FeuillePage() {
  return (
    <>
      <header className="px-[16px] pt-[8px] pb-[18px]">
        <div
          className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px] pb-[12px] t-data-sm"
          style={{ color: 'var(--ink-2)' }}
        >
          <span>{OUTILS.length} outils</span>
          <span className="meta-filet">{PRETS.length} tournent</span>
          <span className="meta-filet">{ATTENTE.length} attendent une action humaine</span>
          <span className="meta-filet">aucune date</span>
        </div>
        <h1 className="t-headline m-0" style={{ color: 'var(--ink)', maxWidth: '24ch' }}>
          Ce qui tourne, ce qui attend, ce qui n’existe pas
        </h1>
        <div className="pt-[14px] flex flex-col gap-[10px]">
          <P>
            Cette page ne porte <F>aucune date</F>, et le mot « bientôt » n’y apparaît pas : une
            date qu’on ne tient pas est un chiffre faux de plus. Les deux premières colonnes sont
            lues dans <C>src/lib/outils.ts</C>, où chaque outil porte son état — et la règle du
            fichier est qu’un outil qui n’est pas prêt <F>doit dire pourquoi</F>. La troisième
            colonne est ce qui reste devant : pour chacun, ce qui existe aujourd’hui d’abord, ce
            qui manque ensuite, et aucune date.
          </P>
        </div>
      </header>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
      >
        {/* --------------------------------------- 1. ce qui tourne aujourd’hui */}
        <Panel index="feuille-pret" title="Ce qui tourne aujourd’hui" meta={['état : prêt']}>
          <Compte n={PRETS.length} quoi="outils sur quatorze, utilisables maintenant" />
          <ul className="m-0 p-0">
            {PRETS.map((o) => (
              <Ligne
                key={o.n}
                titre={`${o.n} · ${o.nom}`}
                etiquette={o.acces.join(' · ')}
                sous={question(o)}
                corps={o.cout}
              />
            ))}
          </ul>
          {HORS_LIGNE.map((o) => (
            <div
              key={o.n}
              className="px-[16px] py-[12px] flex flex-col gap-[6px]"
              style={{ borderTop: '1px solid var(--line)' }}
            >
              <div className="flex flex-wrap items-baseline gap-[10px]">
                <span className="t-data-sm" style={{ color: 'var(--ink)', fontSize: 13 }}>
                  {o.n} · {o.nom}
                </span>
                <Chip>hors ligne par construction</Chip>
              </div>
              <div className="t-data-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.55 }}>
                {o.pourquoi ? <Gras texte={o.pourquoi} /> : null}
              </div>
            </div>
          ))}
        </Panel>

        {/* ------------------------------------- 2. écrit, pas encore déployé */}
        <Panel
          index="feuille-attente"
          title="Écrit, pas encore déployé"
          meta={['état : en attente']}
        >
          <Compte n={ATTENTE.length} quoi="outils dont le code existe et dont l’action manque" />
          <ul className="m-0 p-0">
            {ATTENTE.map((o) => (
              <Ligne
                key={o.n}
                titre={`${o.n} · ${o.nom}`}
                etiquette={o.acces.join(' · ')}
                sous={question(o)}
                corps={o.pourquoi ? <Gras texte={o.pourquoi} /> : null}
              />
            ))}
          </ul>
          <div className="px-[16px] py-[12px]" style={{ borderTop: '1px solid var(--line)' }}>
            <P>
              Ces trois-là ne sont pas des intentions : le code est écrit et il passe ses tests.
              Ce qui manque est <F>une action qu’aucun test ne fait</F> — une transaction de
              déploiement, du gaz, un fichier de 198 Mo reconstruit. Le texte ci-dessus est celui
              du dépôt, recopié sans être adouci.
            </P>
          </div>
        </Panel>

        {/* ------------------------------------------------------- 3. la suite */}
        <Panel index="feuille-suite" title="La suite" meta={['aucune date']}>
          <Compte n={SUITE.length} quoi="chantiers devant nous, et aucune date pour aucun" />
          <ul className="m-0 p-0">
            {SUITE.map((s) => (
              <Ligne key={s.titre} titre={s.titre} etiquette={s.etat} corps={s.texte} />
            ))}
          </ul>
          <div className="px-[16px] py-[12px]" style={{ borderTop: '1px solid var(--line)' }}>
            <P>
              Rien de cette colonne n’a de date, et rien n’en aura tant que ce ne sera pas écrit.
              Un projet qui promet quatre chantiers datés en a trois en retard la semaine
              suivante ; celui-ci préfère dire <F>pas encore</F>, qui reste vrai jusqu’au jour où
              la ligne change de colonne.
            </P>
          </div>
        </Panel>
      </div>
    </>
  )
}
