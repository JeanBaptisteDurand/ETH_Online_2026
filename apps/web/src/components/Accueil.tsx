/**
 * LA PAGE D'ACCUEIL — elle FAIT l'opération, elle ne la décrit pas.
 *
 * On colle l'adresse d'un jeton, on lit par où l'acheter le moins cher. Tout se calcule dans
 * le navigateur, sur les 125 072 mesures embarquées : aucune requête, aucun portefeuille,
 * aucun compte. C'est la porte qu'on pousse en cinq secondes.
 *
 * CE QU'ELLE DIT QUAND IL N'Y A RIEN À CHOISIR, et c'est presque toujours : 97,2 % des 8 583
 * jetons du corpus n'existent que dans un seul pool. « Il n'y a qu'une porte » est une
 * réponse — pas un écran vide, pas un classement à un élément déguisé en recommandation.
 *
 * En bas, les cinq accès au produit et **pourquoi chacun existe** : le site pour qui veut une
 * réponse maintenant, l'extension pour qui échange ailleurs, le MCP pour un agent, x402 pour
 * un agent sans compte, le compte pour qui revient.
 */
import { Fragment, useEffect, useMemo, useState } from 'react'
import { Panel, Copy, NonLu, Replay } from './Prim'
import { FigureAppariee } from './Figure'
import { COULEUR } from './familles'
import { dataset } from '../lib/dataset'
import { MONNAIES_DE_COTATION } from '../lib/exit'
import { ouAcheter, aMontrer, sur100, taillesPour, lpFeeBps, type Porte } from '../lib/portes'
import { ACCES, OUTILS, outil } from '../lib/outils'
import { rampVar } from '../lib/ramp'
import { DONNEES, taille } from '../lib/donnees'
import type { Volume } from '../lib/donnees'
import facts from '../data/facts.json'

const EST_ADRESSE = /^0x[0-9a-fA-F]{40}$/

/**
 * LES JETONS QU'ON PROPOSE — ceux sur lesquels la question SE POSE.
 *
 * Proposer le jeton le plus present du corpus ne sert a rien : 97,2 % des jetons n'ont qu'une
 * porte, et la reponse est alors « il n'y a qu'une porte ». On ne propose donc que des jetons
 * pour lesquels DEUX portes au moins sont mesurees dans la meme monnaie et a la meme taille —
 * les seuls ou la figure appariee existe. Le tri se fait en UNE passe sur le corpus : une
 * recherche complete par candidat couterait une seconde de fil principal.
 */
function jetonsProposes(max = 6): { adresse: string; portes: number; ecart: number }[] {
  /** jeton|monnaie|taille -> le cout total mesure de chaque pool du groupe */
  const groupes = new Map<string, Map<string, number>>()
  const toutesPortes = new Map<string, Set<string>>()
  for (const r of dataset.rows) {
    const mesuree = r.label === 'MESURE' && r.bps !== null && r.stored_lp_fee !== null
    for (const [t, autre] of [
      [r.currency0, r.currency1],
      [r.currency1, r.currency0],
    ] as [string, string][]) {
      const jeton = t.toLowerCase()
      if (jeton in MONNAIES_DE_COTATION) continue
      const p = toutesPortes.get(jeton) ?? new Set<string>()
      p.add(r.pool_id)
      toutesPortes.set(jeton, p)
      if (!mesuree) continue
      const cle = `${jeton}|${autre.toLowerCase()}|${r.amount_in}`
      const m = groupes.get(cle) ?? new Map<string, number>()
      // le cout total : frais LP lus PLUS prelevement mesure. Les deux, ou rien.
      m.set(r.pool_id, lpFeeBps(r.stored_lp_fee!) + r.bps!)
      groupes.set(cle, m)
    }
  }
  /** l'ecart le plus large qu'un jeton donne, toutes monnaies et toutes tailles confondues */
  const ecarts = new Map<string, number>()
  for (const [cle, pools] of groupes) {
    if (pools.size < 2) continue
    const v = [...pools.values()]
    const ecart = Math.max(...v) - Math.min(...v)
    const jeton = cle.slice(0, cle.indexOf('|'))
    ecarts.set(jeton, Math.max(ecarts.get(jeton) ?? 0, ecart))
  }
  // Les plus instructifs d'abord : ceux ou le choix de la porte change le plus de choses.
  return [...ecarts.entries()]
    .sort((x, y) => y[1] - x[1])
    .slice(0, max)
    .map(([adresse, ecart]) => ({ adresse, portes: toutesPortes.get(adresse)?.size ?? 0, ecart }))
}

const court = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

function LignePorte({ p, rang, meilleur }: { p: Porte; rang: number; meilleur: number }) {
  const ecart = p.totalBps! - meilleur
  return (
    <tr style={{ borderTop: '1px solid var(--line)' }}>
      <td className="t-data-sm px-[10px] py-[7px]" style={{ color: 'var(--ink-2)' }}>{rang}</td>
      <td className="t-data-sm px-[10px] py-[7px]" style={{ color: 'var(--ink-2)' }}>
        <span className="flex flex-wrap gap-x-[14px]">
          <span>pool {court(p.poolId)}</span>
          <span>hook {court(p.hook)}</span>
        </span>
      </td>
      <td className="t-data-sm px-[10px] py-[7px] text-right" style={{ color: 'var(--ink-2)' }}>
        {p.lpBps === null ? <NonLu quoi="frais LP" /> : `${p.lpBps.toFixed(2)}`}
      </td>
      <td className="t-data-sm px-[10px] py-[7px] text-right" style={{ color: 'var(--ink-2)' }}>
        {p.hookBps === null ? <NonLu quoi="prélèvement" /> : p.hookBps.toFixed(4)}
      </td>
      <td
        className="t-data px-[10px] py-[7px] text-right"
        style={{ color: 'var(--ink)', boxShadow: `inset 3px 0 0 ${rampVar(p.totalBps!)}` }}
      >
        {p.totalBps!.toFixed(4)}
      </td>
      <td className="t-data-sm px-[10px] py-[7px] text-right" style={{ color: 'var(--ink-2)' }}>
        {sur100(p.totalBps!).toFixed(2)}
      </td>
      <td className="t-data-sm px-[10px] py-[7px] text-right" style={{ color: 'var(--ink-2)' }}>
        {rang === 1 ? '—' : `+${ecart.toFixed(4)}`}
      </td>
    </tr>
  )
}

/**
 * L'USAGE ET LA PREUVE, dans une seule section — d003, cite : « on ne pourrait pas avoir un
 * entre-deux ? A la fois la preuve et l'usage ».
 *
 * On colle une adresse, et la reponse EST la figure appariee : les deux portes du jeton,
 * cotees a la meme taille, et l'ecart entre elles. L'usage produit la preuve.
 *
 * CE QUE CETTE FIGURE N'EST PAS. La carte, plus haut, en porte une autre : la porte A4, un
 * swap reellement execute, cote avec son hook puis contre un talon inerte de 89 octets. Elle
 * est fixe, c'est la demonstration du principe. Celle d'ici porte LE JETON QUE TU AS COLLE,
 * ses deux portes nommees, sa taille, son bloc, et la commande qui la rejoue. Deux objets, et
 * la difference se voit : l'ecart de la hero est un `display`, celui-ci un `metric`, comme la
 * charte le demande — un seul `display` par ecran.
 */
export function AccueilPanel() {
  const proposes = useMemo(() => jetonsProposes(), [])
  const [saisie, setSaisie] = useState('')
  const [taille, setTaille] = useState<string | undefined>(undefined)

  const jeton = saisie.trim().toLowerCase()
  const valide = EST_ADRESSE.test(jeton)
  const tailles = useMemo(() => (valide ? taillesPour(dataset.rows, jeton) : []), [jeton, valide])
  const r = useMemo(
    () => (valide ? ouAcheter(dataset.rows, jeton, taille) : null),
    [jeton, valide, taille],
  )
  const vue = useMemo(() => (r ? aMontrer(r) : null), [r])

  /** Le groupe qui porte une COMPARAISON : deux portes mesurees au moins, sinon rien. */
  const appariable = useMemo(
    () => vue?.montres.find((g) => g.classees.length >= 2 && g.ecart_bps !== null) ?? null,
    [vue],
  )

  return (
    <Panel
      index="00"
      title="Colle une adresse de jeton, vois ce qu'elle coûte"
      meta={[
        `${dataset.totals.rows.toLocaleString('fr')} mesures embarquées`,
        'aucune requête réseau',
      ]}
    >
      <p
        className="m-0 px-[16px] pb-[14px]"
        style={{ fontFamily: 'var(--prose)', fontSize: 16, lineHeight: 1.6, maxWidth: '68ch', color: 'var(--ink-2)' }}
      >
        Le même jeton n’a pas le même prix selon la porte par laquelle tu passes. Colle son
        adresse&nbsp;: on cote ses portes à la même taille — frais LP lus sur la chaîne{' '}
        <em>plus</em> prélèvement du hook, mesuré par contrefactuel — et on écrit l’écart. Tout
        est calculé ici, dans la page.
      </p>

      <div
        className="px-[16px] py-[12px] flex flex-wrap items-end gap-[12px]"
        style={{ borderTop: '1px solid var(--line)' }}
      >
        <div className="flex flex-col gap-[6px]" style={{ flex: '1 1 420px', minWidth: 0 }}>
          <label className="t-data-sm" htmlFor="jeton" style={{ color: 'var(--ink-2)' }}>
            adresse du jeton que tu veux obtenir
          </label>
          <input
            id="jeton"
            name="jeton"
            value={saisie}
            onChange={(e) => {
              setSaisie(e.target.value)
              setTaille(undefined)
            }}
            spellCheck={false}
            autoComplete="off"
            translate="no"
            inputMode="text"
            aria-describedby="jeton-aide"
            placeholder="0x2eb2… 40 caractères après 0x"
            className="t-data hex"
            style={{
              padding: '11px 12px',
              border: '1px solid var(--line)',
              background: 'var(--bg-1)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
              minHeight: 44,
              minWidth: 0,
            }}
          />
          <span id="jeton-aide" className="t-data-sm" style={{ color: 'var(--ink-2)', minHeight: 16 }}>
            {saisie && !valide
              ? 'une adresse de contrat : 0x suivi de 40 caractères hexadécimaux'
              : 'rien n’est envoyé : la recherche se fait sur le corpus embarqué'}
          </span>
        </div>
        {tailles.length > 1 && (
          <div className="flex flex-col gap-[6px]">
            <label className="t-data-sm" htmlFor="taille" style={{ color: 'var(--ink-2)' }}>
              taille dépensée
            </label>
            <select
              id="taille"
              name="taille"
              value={taille ?? r?.taille ?? ''}
              onChange={(e) => setTaille(e.target.value)}
              className="t-data"
              style={{
                padding: '11px 12px',
                border: '1px solid var(--line)',
                background: 'var(--bg-1)',
                color: 'var(--ink)',
                fontFamily: 'var(--mono)',
                minHeight: 44,
              }}
            >
              {tailles.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {!saisie && (
        <div className="px-[16px] py-[12px]" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="t-data-sm mb-[8px]" style={{ color: 'var(--ink-2)' }}>
            ou prends-en un du corpus — ceux-là ont plusieurs portes, donc un choix à faire
          </div>
          <div className="flex flex-wrap gap-[8px]">
            {proposes.map((j) => (
              <button
                key={j.adresse}
                type="button"
                onClick={() => setSaisie(j.adresse)}
                className="noeud t-data hex flex flex-col justify-center px-[10px]"
                style={{
                  border: '1px solid var(--line)',
                  background: 'var(--bg-1)',
                  color: 'var(--ink-2)',
                  cursor: 'pointer',
                  fontFamily: 'var(--mono)',
                  minHeight: 44,
                  textAlign: 'left',
                }}
              >
                {court(j.adresse)}
                <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                  {j.ecart.toFixed(2)} bps entre ses portes
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {r && (
        <>
          {/* L'ETAT, en toutes lettres. Un refus motive — « il n'y a qu'une porte » — est la
              REPONSE, et il a droit a la meme place que le succes. */}
          <div
            className="px-[16px] pt-[14px] pb-[10px]"
            style={{ borderTop: '1px solid var(--line-strong)' }}
            role="status"
            aria-live="polite"
          >
            <div className="t-data" style={{ color: 'var(--ink)' }}>
              {r.etat.replace(/_/g, ' ').toLowerCase()}
            </div>
            <p
              className="m-0 mt-[6px]"
              style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: '72ch' }}
            >
              {r.raison}
            </p>
          </div>

          {/* LA FIGURE APPARIEE DU JETON COLLE. Elle n'existe que quand DEUX portes sont
              mesurees a la meme taille : sans comparaison, il n'y a pas de paire, et on ne
              fabrique pas une seconde serie pour remplir la figure. */}
          {appariable && (
            <>
              <FigureAppariee
                axe={`coût total mesuré, en points de base, pour ${appariable.taille} ${
                  appariable.paieAvecNom ?? court(appariable.paieAvec)
                } dépensés`}
                series={[
                  {
                    libelle: 'la porte la moins chère',
                    valeur: appariable.classees[0]!.totalBps,
                    texte: `${appariable.classees[0]!.totalBps!.toFixed(4)} bps`,
                    provenance: (
                      <span className="flex flex-wrap gap-x-[14px]">
                        <span>pool {court(appariable.classees[0]!.poolId)}</span>
                        <span>hook {court(appariable.classees[0]!.hook)}</span>
                      </span>
                    ),
                  },
                  {
                    libelle: 'la plus chère des mêmes portes',
                    valeur: appariable.classees[appariable.classees.length - 1]!.totalBps,
                    texte: `${appariable.classees[appariable.classees.length - 1]!.totalBps!.toFixed(4)} bps`,
                    reference: true,
                    provenance: (
                      <span className="flex flex-wrap gap-x-[14px]">
                        <span>pool {court(appariable.classees[appariable.classees.length - 1]!.poolId)}</span>
                        <span>hook {court(appariable.classees[appariable.classees.length - 1]!.hook)}</span>
                      </span>
                    ),
                  },
                ]}
                ecart={appariable.ecart_bps!.toFixed(2)}
                unite="bps entre la meilleure porte et la pire"
                glose={
                  <>
                    C’est ce que le choix de la porte te coûte sur <em>ce</em> jeton, à cette
                    taille, au bloc {appariable.classees[0]!.bloc.toLocaleString('fr')}. La figure
                    de la carte, plus haut, mesure autre chose&nbsp;: un swap déjà exécuté, coté
                    contre un talon inerte.
                  </>
                }
              />
              <div className="px-[16px] pb-[14px]">
                <Replay
                  cmd={appariable.classees[0]!.rejeu}
                  note="la ligne de la porte la moins chère, rejouable telle quelle"
                />
              </div>
            </>
          )}

          {vue?.montres.map((g) => (
            <div key={g.paieAvec}>
              <div
                className="px-[16px] py-[10px] flex flex-wrap items-baseline gap-x-[16px] gap-y-[4px]"
                style={{ borderTop: '1px solid var(--line)' }}
              >
                <span className="t-data" style={{ color: 'var(--ink)' }}>
                  en payant avec {g.paieAvecNom ?? court(g.paieAvec)}
                </span>
                <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                  {g.classees.length} porte(s) mesurée(s)
                </span>
                {g.non_mesurees.length > 0 && (
                  <span
                    className="t-data-sm"
                    style={{ color: 'var(--ink-2)', borderLeft: '1px solid var(--line)', paddingLeft: 14 }}
                  >
                    {g.non_mesurees.length} non mesurée(s) à cette taille
                  </span>
                )}
              </div>
              {g.classees.length === 0 ? (
                <div className="px-[16px] pb-[10px] t-data-sm" style={{ color: 'var(--ink-2)' }}>
                  aucune porte mesurée à cette taille dans cette monnaie — la mesure manque, ce
                  n’est pas un coût nul
                </div>
              ) : (
                <div tabIndex={0} role="region" aria-label="tableau des portes mesurées, défilement horizontal" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <caption className="sr-only">
                      les portes mesurées de ce jeton, de la moins chère à la plus chère
                    </caption>
                    <thead>
                      <tr>
                        {['rang', 'pool et hook', 'frais LP', 'hook', 'total bps', 'sur 100', 'écart'].map((h, i) => (
                          <th
                            key={h}
                            scope="col"
                            className="t-data-sm px-[10px] py-[7px]"
                            style={{
                              color: 'var(--ink-2)',
                              textAlign: i > 1 ? 'right' : 'left',
                              whiteSpace: 'nowrap',
                              fontWeight: 400,
                              borderTop: '1px solid var(--line)',
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {g.classees.map((p, i) => (
                        <LignePorte key={p.poolId + p.sens} p={p} rang={i + 1} meilleur={g.classees[0]!.totalBps!} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {g.classees[0] && !appariable && (
                <div className="px-[16px] py-[10px] flex flex-wrap items-center gap-[10px]">
                  <Replay cmd={g.classees[0].rejeu} note="rejoue la ligne de la meilleure porte" />
                  <Copy text={g.classees[0].poolId} label="copier le poolId" />
                </div>
              )}
            </div>
          ))}

          {vue && vue.restants > 0 && (
            <div className="px-[16px] py-[10px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              {vue.restants} autre(s) monnaie(s) permettent aussi d’acheter ce jeton, avec une
              seule porte chacune — elles ne sont pas montrées, et ce compte est là pour que la
              troncature se voie.
            </div>
          )}

          {r.bloc !== null && (
            <div
              className="px-[16px] py-[10px] flex flex-wrap gap-x-[16px] gap-y-[4px] t-data-sm"
              style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}
            >
              <span>mesuré au bloc {r.bloc.toLocaleString('fr')} sur Base</span>
              <span style={{ borderLeft: '1px solid var(--line)', paddingLeft: 16 }}>
                {r.n_portes} porte(s) portent ce jeton dans le corpus
              </span>
              <span style={{ borderLeft: '1px solid var(--line)', paddingLeft: 16 }}>
                frais LP lus dans <code style={{ fontFamily: 'var(--mono)' }}>slot0</code>, prélèvement
                du hook mesuré par contrefactuel
              </span>
            </div>
          )}
        </>
      )}
    </Panel>
  )
}

/* ------------------------------------------------- les accès, en bas de page */

export function AccesPanel({ surOutil }: { surOutil?: (n: number) => void }) {
  return (
    <Panel
      index="17"
      title="Par où on atteint ce produit, et pourquoi chaque porte existe"
      meta={[`${ACCES.length} accès`, `${OUTILS.length} outils`]}
    >
      <p
        className="m-0 px-[16px] py-[12px]"
        style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '78ch', color: 'var(--ink-2)' }}
      >
        Le même corpus, cinq façons de l'atteindre. Elles ne se remplacent pas : chacune existe
        parce qu'il y a un moment où les autres ne marchent pas.
      </p>

      {ACCES.map((a) => (
        <div key={a.cle} className="px-[16px] py-[12px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
          <div className="flex flex-wrap items-baseline gap-[10px]">
            <span className="t-data" style={{ color: 'var(--ink)' }}>{a.nom}</span>
            <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>pour {a.pour}</span>
          </div>
          <p
            className="m-0 mt-[7px]"
            style={{ fontFamily: 'var(--prose)', fontSize: 14.5, lineHeight: 1.6, maxWidth: '80ch', color: 'var(--ink-2)' }}
            dangerouslySetInnerHTML={{ __html: a.pourquoi.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink)">$1</strong>') }}
          />
          <div className="mt-[8px] flex flex-wrap items-center gap-[6px]">
            <span className="t-label" style={{ color: 'var(--ink-2)' }}>il faut</span>
            <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>{a.prerequis}</span>
          </div>
          <div className="mt-[8px] flex flex-wrap items-center gap-[6px]">
            <span className="t-label" style={{ color: 'var(--ink-2)' }}>outils</span>
            {a.outils.map((n) => (
              <PuceOutil key={n} n={n} surOutil={surOutil} />
            ))}
          </div>
        </div>
      ))}
    </Panel>
  )
}

/* ------------------------------- 18 · quelle donnée sert quel outil */

/**
 * LA CARTE DONNÉES × OUTILS.
 *
 * C'est la réponse écrite à « on n'a oublié aucune donnée ? ». Vingt-cinq jeux de données
 * vivent dans le dépôt ; chacun est ici, avec son volume — statté au build, jamais recopié —
 * et les outils qui le lisent ou l'écrivent. `outils.test.ts` refuse qu'un fichier suivi par
 * git sous `docs/dataset/` ou `packages/guard/data/` manque à cette liste : l'oubli fait
 * tomber un test au lieu de passer inaperçu.
 *
 * La couleur d'un numéro est celle de sa FAMILLE, comme partout ailleurs : bleu pour ce qui
 * va chercher, jaune pour ce qui interprète, orange pour ce qui change quelque chose.
 */
/**
 * LA MATRICE 27 × 14 — d009, cite : « la matrice 27 x 14 descend dans la section qui dit
 * quelle donnee sert quel outil ».
 *
 * Vingt-sept jeux de donnees en lignes, quatorze outils en colonnes, 378 cases. Une case
 * PLEINE quand l'outil LIT le jeu, un CONTOUR quand il l'ECRIT, rien quand il n'y touche pas.
 * La couleur est celle de la famille de l'outil — la meme que sur la carte, et elle n'encode
 * que ca : ce que l'outil fait au monde.
 *
 * LES FILETS NAISSENT DE LA GRILLE. `display: grid; gap: 1px` sur un fond `--line`, cellules
 * sur fond `bg` : aucune bordure n'est declaree, exactement ce que la rubrique 4 prevoit.
 * C'est aussi ce qui tient 378 cases sans une seule ligne de plus dans le DOM.
 *
 * CE QU'ELLE NE REMPLACE PAS. Une case pleine ne dit pas CE QUE contient le jeu ni quelle
 * commande l'a produit : le detail en toutes lettres reste sous elle, depliable, et c'est lui
 * que vise l'ancre `#donnees-<cle>` du rail de la carte — le depliant s'ouvre tout seul quand
 * on arrive par la.
 */
function Matrice({ surOutil }: { surOutil?: (n: number) => void }) {
  const [survol, setSurvol] = useState<{ jeu: string | null; outil: number | null }>({
    jeu: null,
    outil: null,
  })
  const lectures = DONNEES.reduce((s, j) => s + j.lu_par.length, 0)
  const ecritures = DONNEES.reduce((s, j) => s + j.ecrit_par.length, 0)

  return (
    <>
      <div
        className="flex flex-wrap items-center gap-x-[20px] gap-y-[8px] px-[16px] pb-[12px]"
        aria-hidden="true"
      >
        <span className="t-data-sm flex items-center gap-[8px]" style={{ color: 'var(--ink-2)' }}>
          <span style={{ width: 11, height: 11, background: 'var(--ink)', display: 'inline-block' }} />
          {lectures} lectures
        </span>
        <span className="t-data-sm flex items-center gap-[8px]" style={{ color: 'var(--ink-2)' }}>
          <span style={{ width: 11, height: 11, border: '1px solid var(--ink)', display: 'inline-block' }} />
          {ecritures} écritures
        </span>
        <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
          la couleur d’une case est celle de la famille de son outil
        </span>
      </div>

      <div
        className="matrice-cadre px-[16px] pb-[16px]"
        tabIndex={0}
        role="region"
        aria-label={`matrice de ${DONNEES.length} jeux de données par ${OUTILS.length} outils, défilement horizontal`}
        style={{ overflowX: 'auto' }}
      >
        <div className="matrice" style={{ background: 'var(--line)' }}>
          {/* l'angle mort de l'en-tete : il porte le compte, pas un vide */}
          <div className="matrice-coin t-data-sm" style={{ background: 'var(--bg)', color: 'var(--ink-2)' }}>
            {DONNEES.length} × {OUTILS.length}
          </div>
          {OUTILS.map((o) => (
            <a
              key={o.n}
              href={`#/outil/${o.n}`}
              onClick={(e) => {
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
                if (!surOutil) return
                e.preventDefault()
                surOutil(o.n)
              }}
              onMouseEnter={() => setSurvol({ jeu: null, outil: o.n })}
              onMouseLeave={() => setSurvol({ jeu: null, outil: null })}
              onFocus={() => setSurvol({ jeu: null, outil: o.n })}
              onBlur={() => setSurvol({ jeu: null, outil: null })}
              className="matrice-tete t-data-sm no-underline"
              style={{
                background: survol.outil === o.n ? 'var(--bg-2)' : 'var(--bg)',
                color: COULEUR[o.famille],
              }}
              title={`${o.n}. ${o.nom} — ${o.question}`}
            >
              {o.n}
            </a>
          ))}

          {DONNEES.map((j) => (
            <Fragment key={j.cle}>
              <a
                href={`#donnees-${j.cle}`}
                onMouseEnter={() => setSurvol({ jeu: j.cle, outil: null })}
                onMouseLeave={() => setSurvol({ jeu: null, outil: null })}
                className="matrice-nom t-data-sm no-underline"
                style={{
                  background: survol.jeu === j.cle ? 'var(--bg-2)' : 'var(--bg)',
                  color: survol.jeu === j.cle ? 'var(--ink)' : 'var(--ink-2)',
                }}
                title={j.quoi}
              >
                {j.nom}
              </a>
              {OUTILS.map((o) => {
                const lu = j.lu_par.includes(o.n)
                const ecrit = j.ecrit_par.includes(o.n)
                const allume = survol.outil === o.n || survol.jeu === j.cle
                return (
                  <div
                    key={o.n}
                    className="matrice-case"
                    style={{ background: allume ? 'var(--bg-2)' : 'var(--bg)' }}
                    title={
                      lu || ecrit
                        ? `${j.nom} — ${ecrit ? 'écrit' : 'lu'} par ${o.n}. ${o.nom}`
                        : undefined
                    }
                  >
                    {(lu || ecrit) && (
                      <span
                        aria-hidden="true"
                        style={{
                          width: 11,
                          height: 11,
                          display: 'block',
                          background: lu ? COULEUR[o.famille] : 'transparent',
                          border: ecrit ? `1px solid ${COULEUR[o.famille]}` : undefined,
                        }}
                      />
                    )}
                  </div>
                )
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </>
  )
}

export function DonneesPanel({ surOutil }: { surOutil?: (n: number) => void }) {
  const inv = (facts as { inventaire?: Record<string, Volume> }).inventaire ?? {}
  const total = DONNEES.reduce((s, j) => s + (inv[j.cle]?.octets ?? 0), 0)
  const [detail, setDetail] = useState(false)

  // Le rail de la carte pointe sur `#donnees-<cle>`, qui vit DANS le depliant : replier le
  // detail sans ouvrir a l'arrivee casserait l'etape 5 du parcours de demo.
  useEffect(() => {
    const aller = () => {
      const m = /^#donnees-(.+)$/.exec(window.location.hash)
      if (!m) return
      setDetail(true)
      window.requestAnimationFrame(() => {
        document.getElementById(`donnees-${m[1]}`)?.scrollIntoView({ block: 'center' })
      })
    }
    aller()
    window.addEventListener('hashchange', aller)
    return () => window.removeEventListener('hashchange', aller)
  }, [])
  return (
    <Panel
      index="18"
      title="Quelle donnée sert quel outil"
      meta={[`${DONNEES.length} jeux de données`, taille(total)]}
    >
      <p
        className="m-0 px-[16px] pb-[14px]"
        style={{ fontFamily: 'var(--prose)', fontSize: 16, lineHeight: 1.6, maxWidth: '68ch', color: 'var(--ink-2)' }}
      >
        {DONNEES.length} jeux de données, {OUTILS.length} outils, {DONNEES.length * OUTILS.length}{' '}
        cases&nbsp;: une case pleine quand l’outil lit le jeu, un contour quand il l’écrit. Un test
        refuse qu’un fichier suivi par git manque à cette matrice — une donnée qu’aucun outil ne
        réclame fait tomber la suite au lieu de dormir dans un coin du dépôt.
      </p>

      <Matrice surOutil={surOutil} />

      <details open={detail} onToggle={(e) => setDetail((e.target as HTMLDetailsElement).open)}>
        <summary
          className="t-data px-[16px] py-[12px] cursor-pointer list-none"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}
        >
          {detail ? 'replier' : 'déplier'} le détail de chaque jeu — ce qu’il contient, son volume,
          la commande qui l’a produit
        </summary>

      <div tabIndex={0} role="region" aria-label="tableau des jeux de données, défilement horizontal" style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ borderTop: '1px solid var(--line-strong)' }}>
              {['jeu de données', 'volume', 'lu par', 'écrit par', 'fichier'].map((h) => (
                <th key={h} scope="col" className="t-data-sm px-[10px] py-[6px]"
                  style={{ color: 'var(--ink-2)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DONNEES.map((j) => {
              const v = inv[j.cle]
              return (
                // L'ancre que vise la ligne du rail de la carte : on arrive SUR le jeu
                // cliqué, pas en haut d'un tableau de vingt-sept lignes.
                <tr key={j.cle} id={`donnees-${j.cle}`} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="px-[10px] py-[7px]" style={{ minWidth: 220 }}>
                    <div className="t-data-sm" style={{ color: 'var(--ink)' }}>{j.nom}</div>
                    <div className="t-data-sm mt-[3px]" style={{ color: 'var(--ink-2)', lineHeight: 1.45, maxWidth: '58ch' }}>{j.quoi}</div>
                  </td>
                  <td className="t-data-sm px-[10px] py-[7px]" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {v ? taille(v.octets) : 'non lu'}
                    {v && v.n !== null && v.unite ? <div style={{ color: 'var(--ink-2)' }}>{v.n.toLocaleString('fr')} {v.unite}</div> : null}
                  </td>
                  <td className="px-[10px] py-[7px]" style={{ verticalAlign: 'top' }}><Puces ns={j.lu_par} surOutil={surOutil} /></td>
                  <td className="px-[10px] py-[7px]" style={{ verticalAlign: 'top' }}><Puces ns={j.ecrit_par} surOutil={surOutil} /></td>
                  <td className="px-[10px] py-[7px]" style={{ verticalAlign: 'top' }}>
                    <code style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)', wordBreak: 'break-all' }}>{v?.fichier ?? j.cle}</code>
                    {/* UNE COMMANDE, pas une etiquette. `.t-label` la passait en capitales et
                        `python3 -m tare.cli summary` devenait injouable. */}
                    <code className="t-data-sm mt-[3px] block" style={{ color: 'var(--ink-2)', fontFamily: 'var(--mono)', wordBreak: 'break-all' }}>{j.produit}</code>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      </details>
    </Panel>
  )
}

/** Les numéros d'outils, colorés par famille — cliquables vers leur page. */
function Puces({ ns, surOutil }: { ns: number[]; surOutil?: (n: number) => void }) {
  if (ns.length === 0) return <span className="t-label" style={{ color: 'var(--ink-2)' }}>—</span>
  return (
    <span className="flex flex-wrap gap-[4px]">
      {ns.map((n) => (
        <PuceOutil key={n} n={n} surOutil={surOutil} />
      ))}
    </span>
  )
}

/**
 * UNE PUCE D'OUTIL — et c'est un LIEN, pas un bouton.
 *
 * d002 dit « cliquer sur un noeud permet d'apercevoir le detail du fonctionnement du tool ».
 * Un bouton ne s'ouvre pas dans un onglet et son adresse ne se copie pas : les quarante et
 * quelques puces de cette page etaient autant d'impasses pour un Cmd-clic.
 */
function PuceOutil({ n, surOutil }: { n: number; surOutil?: (n: number) => void }) {
  const o = outil(n)
  if (!o) return null
  return (
    <a
      href={`#/outil/${o.n}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        if (!surOutil) return
        e.preventDefault()
        surOutil(o.n)
      }}
      className="noeud t-data-sm no-underline inline-flex items-center"
      style={{
        padding: '4px 8px',
        border: '1px solid var(--line)',
        background: 'var(--bg-1)',
        color: COULEUR[o.famille],
        whiteSpace: 'nowrap',
      }}
      title={`${o.n}. ${o.nom} — ${o.question}`}
    >
      {o.n}. {o.nom}
    </a>
  )
}
