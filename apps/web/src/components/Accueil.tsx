/**
 * LES DEUX SECTIONS BASSES DE L'ACCUEIL : les cinq accès, et la matrice des données.
 *
 * L'OPERATION N'EST PLUS ICI. Elle vivait dans une section sous la carte — on collait une
 * adresse, on lisait par où acheter. Elle est remontée dans la barre du hero, qui calcule et
 * répond dans le premier écran : garder les deux aurait fait deux champs pour une question.
 * Le détail par porte reste accessible par les pages des outils 3 et 6.
 *
 * Ce qui reste ici : les cinq accès au produit et **pourquoi chacun existe** — le site pour
 * qui veut une réponse maintenant, l'extension pour qui échange ailleurs, le MCP pour un
 * agent, x402 pour un agent sans compte, le compte pour qui revient — puis quelle donnée sert
 * quel outil.
 */
import { Fragment, useEffect, useState } from 'react'
import { Panel } from './Prim'
import { COULEUR } from './familles'
import { ACCES, OUTILS, outil } from '../lib/outils'
import { DONNEES, taille } from '../lib/donnees'
import type { Volume } from '../lib/donnees'
import facts from '../data/facts.json'

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
