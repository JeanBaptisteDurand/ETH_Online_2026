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
import { useMemo, useState } from 'react'
import { Panel, Copy, NonLu, Replay } from './Prim'
import { dataset } from '../lib/dataset'
import { MONNAIES_DE_COTATION } from '../lib/exit'
import { ouAcheter, aMontrer, sur100, taillesPour, type Porte } from '../lib/portes'
import { ACCES, OUTILS, outil, FAMILLES } from '../lib/outils'
import { rampVar } from '../lib/ramp'
import { DONNEES, taille } from '../lib/donnees'
import type { Volume } from '../lib/donnees'
import facts from '../data/facts.json'

const EST_ADRESSE = /^0x[0-9a-fA-F]{40}$/

/** Les jetons les plus mesurés, pour que l'écran propose au lieu d'attendre. */
function jetonsProposes(max = 6): { adresse: string; n: number; portes: number }[] {
  const par = new Map<string, { n: number; pools: Set<string> }>()
  for (const r of dataset.rows) {
    for (const c of [r.currency0, r.currency1]) {
      const t = c.toLowerCase()
      if (t in MONNAIES_DE_COTATION) continue
      const e = par.get(t) ?? { n: 0, pools: new Set<string>() }
      e.n += 1
      e.pools.add(r.pool_id)
      par.set(t, e)
    }
  }
  return [...par.entries()]
    .map(([adresse, e]) => ({ adresse, n: e.n, portes: e.pools.size }))
    // Ceux qui ont PLUSIEURS portes d'abord : ce sont les seuls où le choix se pose.
    .sort((a, b) => b.portes - a.portes || b.n - a.n)
    .slice(0, max)
}

const court = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`

function LignePorte({ p, rang, meilleur }: { p: Porte; rang: number; meilleur: number }) {
  const ecart = p.totalBps! - meilleur
  return (
    <tr style={{ borderTop: '1px solid var(--line)' }}>
      <td className="t-label px-[10px] py-[7px]" style={{ color: 'var(--ink-4)' }}>{rang}</td>
      <td className="t-data-xs px-[10px] py-[7px]" style={{ color: 'var(--ink-2)' }}>
        {court(p.poolId)}
        <span style={{ color: 'var(--ink-4)' }}> · hook {court(p.hook)}</span>
      </td>
      <td className="t-data-xs px-[10px] py-[7px] text-right" style={{ color: 'var(--ink-3)' }}>
        {p.lpBps === null ? <NonLu quoi="frais LP" /> : `${p.lpBps.toFixed(2)}`}
      </td>
      <td className="t-data-xs px-[10px] py-[7px] text-right" style={{ color: 'var(--ink-3)' }}>
        {p.hookBps === null ? <NonLu quoi="prélèvement" /> : p.hookBps.toFixed(4)}
      </td>
      <td
        className="t-data px-[10px] py-[7px] text-right"
        style={{ color: 'var(--ink)', boxShadow: `inset 3px 0 0 ${rampVar(p.totalBps!)}` }}
      >
        {p.totalBps!.toFixed(4)}
      </td>
      <td className="t-data-xs px-[10px] py-[7px] text-right" style={{ color: 'var(--ink-2)' }}>
        {sur100(p.totalBps!).toFixed(2)}
      </td>
      <td className="t-data-xs px-[10px] py-[7px] text-right" style={{ color: 'var(--ink-4)' }}>
        {rang === 1 ? '—' : `+${ecart.toFixed(4)}`}
      </td>
    </tr>
  )
}

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

  return (
    <Panel
      index="00"
      title="par où acheter ce jeton, et ce que ça coûte"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          {dataset.totals.rows.toLocaleString('fr')} mesures embarquées · aucune requête
        </span>
      }
    >
      <p
        className="m-0 px-[16px] py-[12px]"
        style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '78ch', color: 'var(--ink-2)' }}
      >
        Colle l'adresse d'un jeton. On te dit <strong style={{ color: 'var(--ink)' }}>par quel pool
        l'acheter</strong>, ce que ce pool prend — frais LP <em>plus</em> prélèvement du hook,
        mesuré — et ce qu'il te reste sur 100. Tout est calculé ici, dans la page.
      </p>

      <div className="px-[16px] py-[10px] flex flex-wrap items-center gap-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
        <input
          value={saisie}
          onChange={(e) => { setSaisie(e.target.value); setTaille(undefined) }}
          spellCheck={false}
          placeholder="0x… l'adresse du jeton que tu veux obtenir"
          className="t-data-xs"
          style={{
            flex: '1 1 420px', padding: '8px 11px', border: '1px solid var(--line)',
            background: 'var(--bg-2)', color: 'var(--ink)', fontFamily: 'var(--mono)',
          }}
        />
        {tailles.length > 1 && (
          <select
            value={taille ?? r?.taille ?? ''}
            onChange={(e) => setTaille(e.target.value)}
            className="t-data-xs"
            style={{ padding: '8px 10px', border: '1px solid var(--line)', background: 'var(--bg-2)', color: 'var(--ink)', fontFamily: 'var(--mono)' }}
          >
            {tailles.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}
      </div>

      {!saisie && (
        <div className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
          <div className="t-label mb-[7px]" style={{ color: 'var(--ink-4)' }}>
            ou prends-en un du corpus — ceux-là ont plusieurs portes
          </div>
          <div className="flex flex-wrap gap-[6px]">
            {proposes.map((j) => (
              <button
                key={j.adresse}
                type="button"
                onClick={() => setSaisie(j.adresse)}
                className="t-data-xs"
                style={{ padding: '5px 9px', border: '1px solid var(--line)', background: 'transparent', color: 'var(--ink-2)', cursor: 'pointer', fontFamily: 'var(--mono)' }}
                title={`${j.portes} portes · ${j.n} mesures`}
              >
                {court(j.adresse)} <span style={{ color: 'var(--ink-4)' }}>· {j.portes} portes</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {saisie && !valide && (
        <div className="px-[16px] py-[11px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--m-5)' }}>
          Colle une adresse de contrat : <code style={{ fontFamily: 'var(--mono)' }}>0x</code> suivi de 40 caractères.
        </div>
      )}

      {r && (
        <>
          <div className="px-[16px] pt-[12px] pb-[8px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
            <div className="t-label" style={{ color: r.etat === 'PLUSIEURS_PORTES' ? 'var(--ink)' : 'var(--ink-3)' }}>
              {r.etat.replace(/_/g, ' ').toLowerCase()}
            </div>
            <div className="t-data-xs mt-[6px]" style={{ color: 'var(--ink-2)', maxWidth: '80ch', lineHeight: 1.55 }}>
              {r.raison}
            </div>
          </div>

          {vue?.montres.map((g) => (
            <div key={g.paieAvec}>
              <div className="px-[16px] py-[8px] flex flex-wrap items-baseline gap-[8px]" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                <span className="t-label" style={{ color: 'var(--ink-3)' }}>en payant avec</span>
                <span className="t-data-xs" style={{ color: 'var(--ink)' }}>
                  {g.paieAvecNom ?? court(g.paieAvec)}
                </span>
                <span className="t-data-xs" style={{ color: 'var(--ink-4)' }}>
                  {g.classees.length} porte(s) mesurée(s)
                  {g.non_mesurees.length > 0 && ` · ${g.non_mesurees.length} non mesurée(s)`}
                  {g.ecart_bps !== null && ` · écart ${g.ecart_bps.toFixed(4)} bps`}
                </span>
              </div>
              {g.classees.length === 0 ? (
                <div className="px-[16px] py-[9px] t-data-xs" style={{ color: 'var(--ink-3)' }}>
                  aucune porte mesurée à cette taille dans cette monnaie
                </div>
              ) : (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead>
                      <tr>
                        {['', 'pool · hook', 'frais LP', 'hook', 'total bps', 'sur 100', 'écart'].map((h, i) => (
                          <th key={h + i} className="t-label px-[10px] py-[6px]"
                            style={{ color: 'var(--ink-4)', textAlign: i > 1 ? 'right' : 'left', whiteSpace: 'nowrap' }}>
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
              {g.classees[0] && (
                <div className="px-[16px] py-[8px] flex flex-wrap items-center gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
                  <Replay cmd={g.classees[0].rejeu} note="rejoue la ligne de la meilleure porte" />
                  <Copy text={g.classees[0].poolId} label="copier le poolId" />
                </div>
              )}
            </div>
          ))}

          {vue && vue.restants > 0 && (
            <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-4)' }}>
              {vue.restants} autre(s) monnaie(s) permettent aussi d'acheter ce jeton, avec une seule
              porte chacune — elles ne sont pas montrées, et ce compte est là pour que la
              troncature se voie.
            </div>
          )}

          {r.bloc !== null && (
            <div className="px-[16px] py-[8px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-4)' }}>
              mesuré au bloc {r.bloc.toLocaleString('fr')} sur Base · {r.n_portes} porte(s) portent ce
              jeton dans le corpus · frais LP lus dans <code style={{ fontFamily: 'var(--mono)' }}>slot0</code>,
              prélèvement du hook mesuré par contrefactuel
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
      title="par où on atteint ce produit — et pourquoi chaque porte existe"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          {ACCES.length} accès · {OUTILS.length} outils
        </span>
      }
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
            <span className="t-label" style={{ color: 'var(--ink)' }}>{a.nom}</span>
            <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>pour {a.pour}</span>
          </div>
          <p
            className="m-0 mt-[7px]"
            style={{ fontFamily: 'var(--prose)', fontSize: 14.5, lineHeight: 1.6, maxWidth: '80ch', color: 'var(--ink-2)' }}
            dangerouslySetInnerHTML={{ __html: a.pourquoi.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink)">$1</strong>') }}
          />
          <div className="mt-[8px] flex flex-wrap items-center gap-[6px]">
            <span className="t-label" style={{ color: 'var(--ink-4)' }}>il faut</span>
            <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>{a.prerequis}</span>
          </div>
          <div className="mt-[8px] flex flex-wrap items-center gap-[6px]">
            <span className="t-label" style={{ color: 'var(--ink-4)' }}>outils</span>
            {a.outils.map((n) => {
              const o = outil(n)
              if (!o) return null
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => surOutil?.(n)}
                  className="t-data-xs"
                  style={{
                    padding: '3px 8px',
                    border: '1px solid var(--line)',
                    background: 'transparent',
                    color: FAMILLES[o.famille].couleur,
                    cursor: surOutil ? 'pointer' : 'default',
                    opacity: o.etat === 'pret' ? 1 : 0.65,
                  }}
                  title={o.question}
                >
                  {o.n}. {o.nom}
                </button>
              )
            })}
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
export function DonneesPanel({ surOutil }: { surOutil?: (n: number) => void }) {
  const inv = (facts as { inventaire?: Record<string, Volume> }).inventaire ?? {}
  const total = DONNEES.reduce((s, j) => s + (inv[j.cle]?.octets ?? 0), 0)
  return (
    <Panel
      index="18"
      title="quelle donnée sert quel outil"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-3)' }}>
          {DONNEES.length} jeux · {taille(total)}
        </span>
      }
    >
      <p
        className="m-0 px-[16px] py-[12px]"
        style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '80ch', color: 'var(--ink-2)' }}
      >
        Chaque fichier de données du dépôt est ici, avec ce qu'il contient, la commande qui l'a
        produit, et les outils qui le lisent ou l'écrivent. Un test refuse qu'un fichier suivi
        par git manque à cette liste : une donnée qu'aucun outil ne réclame ferait tomber la
        suite, au lieu de dormir dans un coin du dépôt.
      </p>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
          <thead>
            <tr style={{ borderTop: '1px solid var(--line-strong)' }}>
              {['jeu de données', 'volume', 'lu par', 'écrit par', 'fichier'].map((h) => (
                <th key={h} className="t-label px-[10px] py-[6px]"
                  style={{ color: 'var(--ink-4)', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DONNEES.map((j) => {
              const v = inv[j.cle]
              return (
                <tr key={j.cle} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="px-[10px] py-[7px]" style={{ minWidth: 220 }}>
                    <div className="t-data-xs" style={{ color: 'var(--ink)' }}>{j.nom}</div>
                    <div className="t-data-xs mt-[3px]" style={{ color: 'var(--ink-3)', lineHeight: 1.45, maxWidth: '58ch' }}>{j.quoi}</div>
                  </td>
                  <td className="t-label px-[10px] py-[7px]" style={{ color: v ? 'var(--ink-2)' : 'var(--m-5)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                    {v ? taille(v.octets) : 'non lu'}
                    {v && v.n !== null && v.unite ? <div style={{ color: 'var(--ink-4)' }}>{v.n.toLocaleString('fr')} {v.unite}</div> : null}
                  </td>
                  <td className="px-[10px] py-[7px]" style={{ verticalAlign: 'top' }}><Puces ns={j.lu_par} surOutil={surOutil} /></td>
                  <td className="px-[10px] py-[7px]" style={{ verticalAlign: 'top' }}><Puces ns={j.ecrit_par} surOutil={surOutil} /></td>
                  <td className="px-[10px] py-[7px]" style={{ verticalAlign: 'top' }}>
                    <code style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', wordBreak: 'break-all' }}>{v?.fichier ?? j.cle}</code>
                    <div className="t-label mt-[3px]" style={{ color: 'var(--ink-4)' }}>{j.produit}</div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Panel>
  )
}

/** Les numéros d'outils, colorés par famille — cliquables vers leur page. */
function Puces({ ns, surOutil }: { ns: number[]; surOutil?: (n: number) => void }) {
  if (ns.length === 0) return <span className="t-label" style={{ color: 'var(--ink-4)' }}>—</span>
  return (
    <span className="flex flex-wrap gap-[4px]">
      {ns.map((n) => {
        const o = outil(n)
        if (!o) return null
        return (
          <button
            key={n}
            type="button"
            onClick={() => surOutil?.(n)}
            className="t-label"
            style={{
              padding: '2px 6px',
              border: '1px solid var(--line)',
              background: 'transparent',
              color: FAMILLES[o.famille].couleur,
              cursor: surOutil ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
            }}
            title={`${o.n}. ${o.nom} — ${o.question}`}
          >
            {o.n}. {o.nom}
          </button>
        )
      })}
    </span>
  )
}
