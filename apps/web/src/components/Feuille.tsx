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
    titre: 'Chains other than Base',
    etat: 'nothing measured elsewhere',
    texte: (
      <>
        The {nb(facts.inventaire.corpus.n)} measurements are taken on <F>Base</F> and on it alone
        (<C>chain_id 8453</C> on every row of the corpus). The engine knows nothing else
        today: no hook from another chain has been quoted, so no answer can speak about
        one. <F>Not yet.</F>
      </>
    ),
  },
  {
    titre: 'A continuous sweep, instead of a pinned block',
    etat: <>everything is taken at block {nb(BLOC)}</>,
    texte: (
      <>
        A number is replayable only because it carries its block: the whole corpus is pinned
        at block {nb(BLOC)}, and a measurement requested at another block returns{' '}
        <C>NOT_MEASURABLE / fork_block_mismatch</C> rather than a number stamped with a block it
        was not taken at. A sweep that would follow the chain head and re-measure continuously
        is not written. <F>Not yet.</F>
      </>
    ),
  },
  {
    titre: 'Attestation of the hooks computed but not written',
    etat: (
      <>
        {nb(AT.calcules)} computed, {nb(AT.ecrits)} written
      </>
    ),
    texte: (
      <>
        {nb(AT.calcules)} attestations are computed from the corpus; only <F>{nb(AT.ecrits)}</F>{' '}
        are actually written on-chain ({nb(AT.tentes)} attempted, {nb(AT.ecartes)}{' '}
        discarded). The rest is waiting on gas, and the gap is published rather than smoothed
        over. The contract can be read here:{' '}
        <Lien href={AT.hashscan}>
          {AT.contrat.slice(0, 10)}…{AT.contrat.slice(-6)}
        </Lien>
        . <F>Not yet.</F>
      </>
    ),
  },
  {
    titre: 'The deployment of the subscription contract',
    etat: 'written, tested, never deployed',
    texte: (
      <>
        182 lines of Solidity and 20 forge tests, verified against a local fork where 1.5 × the
        price buys exactly 45.00 days — but the contract is <F>deployed on no public
        network</F>. As long as it is not, the account answers « subscription not verified, so
        not active », and it says so instead of pretending. <F>Not yet.</F>
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
          <span>{OUTILS.length} tools</span>
          <span className="meta-filet">{PRETS.length} running</span>
          <span className="meta-filet">{ATTENTE.length} waiting on a human action</span>
          <span className="meta-filet">no date</span>
        </div>
        <h1 className="t-headline m-0" style={{ color: 'var(--ink)', maxWidth: '24ch' }}>
          What runs, what waits, what does not exist
        </h1>
        <div className="pt-[14px] flex flex-col gap-[10px]">
          <P>
            This page carries <F>no date</F>, and the word « soon » does not appear on it: a
            date you do not keep is one more false number. The first two columns are read from
            <C>src/lib/outils.ts</C>, where every tool carries its state — and the rule of that
            file is that a tool which is not ready <F>must say why</F>. The third column is what
            is still ahead: for each one, what exists today first, what is missing next, and no
            date.
          </P>
        </div>
      </header>

      <div
        className="grid"
        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}
      >
        {/* --------------------------------------- 1. ce qui tourne aujourd’hui */}
        <Panel index="feuille-pret" title="What runs today" meta={['state: ready']}>
          <Compte n={PRETS.length} quoi="tools out of fourteen, usable right now" />
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
                <Chip>offline by construction</Chip>
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
          title="Written, not yet deployed"
          meta={['state: pending']}
        >
          <Compte n={ATTENTE.length} quoi="tools whose code exists and whose action is missing" />
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
              These three are not intentions: the code is written and it passes its tests. What
              is missing is <F>an action that no test performs</F> — a deployment transaction,
              gas, a 198 MB file rebuilt. The text above is the one from the repository, copied
              over without being softened.
            </P>
          </div>
        </Panel>

        {/* ------------------------------------------------------- 3. la suite */}
        <Panel index="feuille-suite" title="What comes next" meta={['no date']}>
          <Compte n={SUITE.length} quoi="pieces of work ahead of us, and no date for any" />
          <ul className="m-0 p-0">
            {SUITE.map((s) => (
              <Ligne key={s.titre} titre={s.titre} etiquette={s.etat} corps={s.texte} />
            ))}
          </ul>
          <div className="px-[16px] py-[12px]" style={{ borderTop: '1px solid var(--line)' }}>
            <P>
              Nothing in this column has a date, and nothing will have one until it is written.
              A project that promises four dated pieces of work has three of them late the week
              after; this one would rather say <F>not yet</F>, which stays true until the day the
              line changes column.
            </P>
          </div>
        </Panel>
      </div>
    </>
  )
}
