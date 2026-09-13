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
import { dataset } from '../lib/dataset'
import { ACCES, OUTILS, outil } from '../lib/outils'
import { DONNEES, taille } from '../lib/donnees'
import type { Volume } from '../lib/donnees'
import facts from '../data/facts.json'

/* ------------------------------------------------- pourquoi ce produit existe */

/**
 * POURQUOI TARE EXISTE — et la réponse est faite de chiffres, pas d'intentions.
 *
 * Trois faits, dans l'ordre où ils se sont imposés : le registre officiel ne peut pas dire
 * combien, presque personne ne le déclare, et comparer est impossible par construction. Le
 * quatrième bloc est ce qu'on en a fait.
 *
 * AUCUN NOMBRE N'EST ÉCRIT ICI. Le recensement des champs vient de `dataset.provenance`, les
 * comptes de hooks de `totals` et de `facts.registre`. Si le corpus change, cette section
 * change avec lui — et si une source manque, elle le dit au lieu d'afficher un chiffre mort.
 */
export function Pourquoi() {
  const p = dataset.provenance.registry
  const T = dataset.totals
  const reg = (facts as { registre?: { epingle?: { adresses?: number } } }).registre

  const points: { titre: string; texte: React.ReactNode }[] = [
    {
      titre: 'The registry cannot say how much',
      texte: (
        <>
          The official list of hooks describes {p.entries.toLocaleString('fr')} entries with{' '}
          {p.field_census.leaf_fields} fields, {p.field_census.boolean_fields} of them booleans.{' '}
          <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>
            {p.field_census.quantitative_fields.length === 0
              ? 'None is a quantity'
              : `${p.field_census.quantitative_fields.length} are quantities`}
          </strong>{' '}
          : the only numeric field is <code className="t-data-sm">chainId</code>, which names a
          network. A boolean says a hook changes your swap, never by how much.
        </>
      ),
    },
    {
      titre: 'And almost nobody declares it',
      texte: (
        <>
          Uniswap offers hooks a way to announce what they take, through two events its own guide
          recommends. Of the hooks seen across two hundred thousand Base blocks,{' '}
          <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>nine</strong> emit one. And an
          amount emitted on a past swap is not the rate you would pay at your size.
        </>
      ),
    },
    {
      titre: 'Comparing was impossible by construction',
      texte: (
        <>
          A v4 pool’s identity — its <code className="t-data-sm">PoolKey</code> — contains the
          hook’s address. “The same pool without its hook” therefore does not exist, and there is
          nothing to compare against.{' '}
          {reg?.epingle?.adresses ? (
            <>
              Of the {T.hooks} hooks measured here, {T.hooksAbsentFromRegistry} are absent from the
              pinned registry.
            </>
          ) : null}
        </>
      ),
    },
    {
      titre: 'So we do not change the pool, we change the hook',
      texte: (
        <>
          On a fork pinned to a block, we replace the hook’s bytecode with an 89-byte inert stub.
          The poolId, the liquidity and the reserves stay identical to the byte: the only thing
          that changed is the code that runs during the swap. We quote the same swap twice, and{' '}
          <strong style={{ color: 'var(--ink)', fontWeight: 500 }}>the gap is the take</strong>.
          {' '}
          {T.rows.toLocaleString('fr')} measurements later, every row replays in one command.
        </>
      ),
    },
  ]

  return (
    <section aria-labelledby="pourquoi-t" className="flex flex-col" style={{ gap: 28 }}>
      <header className="flex flex-col" style={{ gap: 10, maxWidth: '46ch' }}>
        <h2 id="pourquoi-t" className="t-headline m-0">
          Why TARE exists
        </h2>
        <p className="t-body t-body-muted m-0">
          Because nobody publishes how much a hook takes, and the question was not merely
          unanswered: it was without a method.
        </p>
      </header>

      <ol className="pourquoi-grille m-0 p-0" style={{ listStyle: 'none' }}>
        {points.map((x, i) => (
          <li key={x.titre} className="flex flex-col" style={{ gap: 10, borderTop: '1px solid var(--line)', paddingTop: 16 }}>
            {/* Un ordinal EST legitime ici : les quatre points sont une sequence, chacun ne se
                comprend qu'apres le precedent. */}
            <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
              {String(i + 1).padStart(2, '0')}
            </span>
            <h3 className="t-title m-0" style={{ fontSize: '1.0625rem' }}>
              {x.titre}
            </h3>
            <p className="t-body t-body-muted m-0" style={{ fontSize: 14.5 }}>
              {x.texte}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

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
            How you reach this product
          </h2>
          <p className="t-body t-body-muted m-0">
            The same corpus, five ways to reach it. They do not replace one another: each exists
            because there is a moment when the others do not work.
          </p>
        </div>
        <span className="flex flex-wrap items-baseline t-data-sm" style={{ gap: 14, color: 'var(--ink-2)' }}>
          <span>{ACCES.length} ways in</span>
          <span className="meta-filet">{OUTILS.length} tools</span>
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
                for {a.pour}
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
                <span className="t-data-sm" style={{ color: 'var(--ink-2)', minWidth: 52 }}>
                  requires
                </span>
                <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                  {a.prerequis}
                </span>
              </div>
              <div className="flex flex-wrap items-center" style={{ gap: 6 }}>
                <span className="t-data-sm" style={{ color: 'var(--ink-2)', minWidth: 52 }}>
                  opens
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
          {lectures} reads
        </span>
        <span className="t-body flex items-center gap-[8px]" style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
          <span style={{ width: 11, height: 11, border: '1px solid var(--ink)', display: 'inline-block' }} />
          {ecritures} writes
        </span>
        <span className="t-body" style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
          a cell’s colour is that of its tool’s family
        </span>
      </div>

      <div
        className="matrice-cadre"
        tabIndex={0}
        role="region"
        aria-label={`matrix of ${DONNEES.length} datasets by ${OUTILS.length} tools, horizontal scrolling`}
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
                        ? `${j.nom} — ${ecrit ? 'written' : 'read'} by ${o.n}. ${o.nom}`
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
            Which data serves which tool
          </h2>
          <p className="t-body t-body-muted m-0">
            {DONNEES.length} datasets, {OUTILS.length} tools,{' '}
            {DONNEES.length * OUTILS.length} cells: filled when the tool reads the dataset,
            outlined when it writes it. A test refuses to let a git-tracked file go missing from
            this matrix.
          </p>
        </div>
        <span className="flex flex-wrap items-baseline t-data-sm" style={{ gap: 14, color: 'var(--ink-2)' }}>
          <span>{DONNEES.length} datasets</span>
          <span className="meta-filet">{taille(total)}</span>
        </span>
      </header>

      <Matrice surOutil={surOutil} />

      <details open={detail} onToggle={(e) => setDetail((e.target as HTMLDetailsElement).open)}>
        <summary
          className="t-body cursor-pointer list-none depliant"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}
        >
          {detail ? 'collapse' : 'expand'} the detail of each dataset: what it contains, its
          size, the command that produced it
        </summary>

        <div
          tabIndex={0}
          role="region"
          aria-label="table of datasets, horizontal scrolling"
          style={{ overflowX: 'auto' }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 720 }}>
            <caption className="sr-only">
              the {DONNEES.length} datasets of the repository, their size, the tools that read or
              write them, and the command that produced them
            </caption>
            <thead>
              <tr style={{ borderTop: '1px solid var(--line)' }}>
                {['dataset', 'size', 'read by', 'written by', 'file'].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="t-data-sm px-[10px] py-[8px]"
                    style={{ color: 'var(--ink-2)', textAlign: 'left', whiteSpace: 'nowrap', fontWeight: 400 }}
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
                      {v ? taille(v.octets) : 'not read'}
                      {v && v.n !== null && v.unite ? (
                        <div style={{ color: 'var(--ink-2)' }}>
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
                      <code className="t-data-sm mt-[3px] block" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>
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
      <span className="t-data-sm" style={{ color: 'var(--ink-2)', paddingRight: 6 }}>
        {o.n}
      </span>
      <span className="t-body" style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>
        {o.nom}
      </span>
    </a>
  )
}
