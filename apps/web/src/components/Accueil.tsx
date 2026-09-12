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
import { COULEUR } from './familles'
import { ACCES, OUTILS, outil } from '../lib/outils'
import { DONNEES, taille } from '../lib/donnees'
import type { Volume } from '../lib/donnees'
import facts from '../data/facts.json'

/* ------------------------------------------------- les accès, en bas de page */

/**
 * LES CINQ ACCÈS. Une liste à filets, pas cinq cartes : au-dessus de la densité 7, le
 * groupement se fait par filet et par espace, et cinq boîtes identiques en rang sont le kit de
 * cartes que la direction interdit. Chaque entrée est une ligne de glossaire technique : à
 * gauche le nom et pour qui, à droite pourquoi cet accès existe, ce qu'il exige, et les outils
 * qu'il ouvre.
 *
 * PAS D'ORDINAL sur cette section : ce n'est pas une séquence. Les dix-sept panneaux de
 * l'instrument en gardent un, parce que leur numéro est une ancre.
 */
export function AccesPanel({ surOutil }: { surOutil?: (n: number) => void }) {
  return (
    <section aria-labelledby="acces-t" className="flex flex-col" style={{ gap: 28 }}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-[32px] gap-y-[8px]">
        <div className="flex flex-col" style={{ gap: 10, maxWidth: '46ch' }}>
          <h2 id="acces-t" className="t-headline m-0">
            Par où on atteint ce produit
          </h2>
          <p className="t-body t-body-muted m-0">
            Le même corpus, cinq façons de l’atteindre. Elles ne se remplacent pas&nbsp;: chacune
            existe parce qu’il y a un moment où les autres ne marchent pas.
          </p>
        </div>
        <span className="flex flex-wrap items-baseline t-data-sm" style={{ gap: 14, color: 'var(--ink-2)' }}>
          <span>{ACCES.length} accès</span>
          <span className="meta-filet">{OUTILS.length} outils</span>
        </span>
      </header>

      <ul className="m-0 p-0" style={{ listStyle: 'none' }}>
        {ACCES.map((a) => (
          <li key={a.cle} className="acces-ligne" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex flex-col" style={{ gap: 4 }}>
              <span className="t-title" style={{ color: 'var(--ink)', fontSize: '1.125rem' }}>
                {a.nom}
              </span>
              <span className="t-body t-body-muted" style={{ fontSize: 14 }}>
                pour {a.pour}
              </span>
            </div>
            <div className="flex flex-col" style={{ gap: 12, minWidth: 0 }}>
              <p
                className="t-body t-body-muted m-0"
                style={{ maxWidth: '68ch' }}
                dangerouslySetInnerHTML={{
                  __html: a.pourquoi.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink);font-weight:500">$1</strong>'),
                }}
              />
              <div className="flex flex-wrap items-baseline" style={{ gap: 10 }}>
                <span className="t-data-sm" style={{ color: 'var(--ink-3)', minWidth: 52 }}>
                  il faut
                </span>
                <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                  {a.prerequis}
                </span>
              </div>
              <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
                <span className="t-data-sm" style={{ color: 'var(--ink-3)', minWidth: 52 }}>
                  ouvre
                </span>
                {a.outils.map((n) => (
                  <PuceOutil key={n} n={n} surOutil={surOutil} />
                ))}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
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
      <div className="flex flex-wrap items-center gap-x-[20px] gap-y-[8px] pb-[14px]" aria-hidden="true">
        <span className="t-body flex items-center gap-[8px]" style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
          <span style={{ width: 11, height: 11, background: 'var(--ink)', display: 'inline-block' }} />
          {lectures} lectures
        </span>
        <span className="t-body flex items-center gap-[8px]" style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
          <span style={{ width: 11, height: 11, border: '1px solid var(--ink)', display: 'inline-block' }} />
          {ecritures} écritures
        </span>
        <span className="t-body" style={{ fontSize: 13.5, color: 'var(--ink-3)' }}>
          la couleur d’une case est celle de la famille de son outil
        </span>
      </div>

      <div
        className="matrice-cadre"
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
                background: survol.outil === o.n ? 'var(--surface-1)' : 'var(--bg)',
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
                onFocus={() => setSurvol({ jeu: j.cle, outil: null })}
                onBlur={() => setSurvol({ jeu: null, outil: null })}
                className="matrice-nom t-data-sm no-underline"
                style={{
                  background: survol.jeu === j.cle ? 'var(--surface-1)' : 'var(--bg)',
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
                    style={{ background: allume ? 'var(--surface-1)' : 'var(--bg)' }}
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
  // detail sans ouvrir a l'arrivee casserait l'etape du parcours de demo.
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
    <section aria-labelledby="donnees-t" className="flex flex-col" style={{ gap: 24 }}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-[32px] gap-y-[8px]">
        <div className="flex flex-col" style={{ gap: 10, maxWidth: '52ch' }}>
          <h2 id="donnees-t" className="t-headline m-0">
            Quelle donnée sert quel outil
          </h2>
          <p className="t-body t-body-muted m-0">
            {DONNEES.length} jeux de données, {OUTILS.length} outils,{' '}
            {DONNEES.length * OUTILS.length} cases&nbsp;: pleine quand l’outil lit le jeu, en
            contour quand il l’écrit. Un test refuse qu’un fichier suivi par git manque à cette
            matrice.
          </p>
        </div>
        <span className="flex flex-wrap items-baseline t-data-sm" style={{ gap: 14, color: 'var(--ink-2)' }}>
          <span>{DONNEES.length} jeux</span>
          <span className="meta-filet">{taille(total)}</span>
        </span>
      </header>

      <Matrice surOutil={surOutil} />

      <details open={detail} onToggle={(e) => setDetail((e.target as HTMLDetailsElement).open)}>
        <summary
          className="t-body cursor-pointer list-none depliant"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}
        >
          {detail ? 'replier' : 'déplier'} le détail de chaque jeu&nbsp;: ce qu’il contient, son
          volume, la commande qui l’a produit
        </summary>

        <div
          tabIndex={0}
          role="region"
          aria-label="tableau des jeux de données, défilement horizontal"
          style={{ overflowX: 'auto' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <caption className="sr-only">
              les {DONNEES.length} jeux de données du dépôt, leur volume, les outils qui les
              lisent ou les écrivent, et la commande qui les a produits
            </caption>
            <thead>
              <tr style={{ borderTop: '1px solid var(--line)' }}>
                {['jeu de données', 'volume', 'lu par', 'écrit par', 'fichier'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="t-data-sm px-[10px] py-[8px]"
                    style={{ color: 'var(--ink-3)', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 400 }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DONNEES.map((j) => {
                const v = inv[j.cle]
                return (
                  // L'ancre que vise la ligne du rail de la carte : on arrive SUR le jeu
                  // cliqué, pas en haut d'un tableau de vingt-sept lignes.
                  <tr key={j.cle} id={`donnees-${j.cle}`} className="ligne-table" style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="px-[10px] py-[9px]" style={{ minWidth: 220, verticalAlign: 'top' }}>
                      <div className="t-body" style={{ fontSize: 14, color: 'var(--ink)' }}>{j.nom}</div>
                      <div className="t-body t-body-muted" style={{ fontSize: 13, lineHeight: 1.45, maxWidth: '58ch' }}>
                        {j.quoi}
                      </div>
                    </td>
                    <td className="t-data-sm px-[10px] py-[9px]" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap', verticalAlign: 'top' }}>
                      {v ? taille(v.octets) : 'non lu'}
                      {v && v.n !== null && v.unite ? (
                        <div style={{ color: 'var(--ink-3)' }}>
                          {v.n.toLocaleString('fr')} {v.unite}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-[10px] py-[9px]" style={{ verticalAlign: 'top' }}>
                      <Puces ns={j.lu_par} surOutil={surOutil} />
                    </td>
                    <td className="px-[10px] py-[9px]" style={{ verticalAlign: 'top' }}>
                      <Puces ns={j.ecrit_par} surOutil={surOutil} />
                    </td>
                    <td className="px-[10px] py-[9px]" style={{ verticalAlign: 'top' }}>
                      <code className="t-data-sm" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>
                        {v?.fichier ?? j.cle}
                      </code>
                      {/* UNE COMMANDE, pas une etiquette : elle est sensible a la casse. */}
                      <code className="t-data-sm mt-[3px] block" style={{ color: 'var(--ink-3)', wordBreak: 'break-all' }}>
                        {j.produit}
                      </code>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </section>
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
      className="puce-outil no-underline inline-flex items-baseline"
      style={{ borderLeft: `2px solid ${COULEUR[o.famille]}` }}
      title={`${o.n}. ${o.nom} — ${o.question}`}
    >
      <span className="t-data-sm" style={{ color: 'var(--ink-3)', paddingRight: 6 }}>
        {o.n}
      </span>
      <span className="t-body" style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
        {o.nom}
      </span>
    </a>
  )
}
