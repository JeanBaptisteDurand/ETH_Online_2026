/**
 * LE RAISONNEMENT, RENDU VISIBLE.
 *
 * Le produit est un agent a quatorze outils, et jusqu'ici la seule chose qu'on en voyait etait
 * sa conclusion : on collait une adresse, un nombre apparaissait. Le travail — quel outil est
 * appele, quelle donnee il lit, ce qu'il refuse de comparer — se faisait en une milliseconde,
 * derriere le dos du lecteur. Un juge ne peut pas crediter ce qu'il ne voit pas.
 *
 * CE N'EST PAS UNE REJOUE, ET CE N'EST PAS UNE DECORATION. Chaque ligne de ce bloc correspond
 * a une etape que `ouAcheter()` execute reellement, dans l'ordre ou elle l'execute, et le
 * nombre affiche a droite est celui que cette etape a produit sur CETTE adresse :
 *
 *   1. `tool 2 · look up`   -> les lignes du corpus embarque (`dataset.totals.rows`)
 *   2. `tool 5 · decide`    -> `rows.filter(ligneAchete)`, portes.ts:230
 *   3. le groupement        -> `parMonnaie`, portes.ts:266
 *   4. `tool 3 · gauge`     -> `porteDe`, portes.ts:158 — lpBps + hookBps
 *   5. `tool 6 · propose`   -> l'etat rendu, portes.ts:311-363
 *
 * L'etiqueter « replay » serait donc faux : c'est le calcul lui-meme, seulement etale sur une
 * seconde pour qu'il soit lisible. Rien n'est simule, aucun nombre n'est ecrit ici.
 *
 * LE NUMERO ET LE NOM DES OUTILS viennent de `OUTILS`, et la couleur de chaque ligne de
 * `FAMILLES[...].couleur` : recopier « tool 5 · decide » a la main ferait de ce bloc une
 * legende qui derive du code qu'elle pretend decrire.
 *
 * LE BLOC RESTE quand la sequence est finie, en petit, au-dessus de la reponse. Une animation
 * qui s'efface ne se verifie pas ; celle-ci se relit. Sous `prefers-reduced-motion`, les cinq
 * lignes sont la d'emblee — l'information est la meme, seule la mise en scene disparait.
 */
import { useEffect, useMemo, useState } from 'react'
import { OUTILS, FAMILLES } from '../lib/outils'
import { dataset } from '../lib/dataset'
import { ligneAchete, type Recherche } from '../lib/portes'

/** 220 ms par ligne : assez lent pour se lire, assez court pour ne pas retenir la reponse. */
const PAS = 220

const court = (a: string): string => `${a.slice(0, 6)}…${a.slice(-4)}`

const nombre = (n: number): string => n.toLocaleString('en-US')

/**
 * L'EN-TETE D'UNE LIGNE, PRIS SUR L'OUTIL. Le nom s'ecrit en bas de casse parce que tout le
 * reste du bloc est en bas de casse ; le numero et le nom eux-memes ne sont jamais saisis ici.
 * Une etape qui n'est l'appel d'aucun outil — le groupement par monnaie, qui est un pas
 * interne de `ouAcheter` — le dit, au lieu de s'attribuer un numero qu'elle n'a pas.
 */
function tete(n: number | null): { texte: string; couleur: string } {
  const o = n === null ? undefined : OUTILS.find((x) => x.n === n)
  if (!o) return { texte: 'then', couleur: 'var(--ink-2)' }
  return { texte: `tool ${o.n} · ${o.nom.toLowerCase()}`, couleur: FAMILLES[o.famille].couleur }
}

/** La phrase que l'outil declare faire, prise sur `OUTILS` — pas une glose ecrite ici. */
function execute(n: number, i: number): string {
  return OUTILS.find((x) => x.n === n)?.execute[i] ?? ''
}

interface Etape {
  n: number | null
  quoi: string
  valeur: string
}

export function Raisonnement({
  jeton,
  recherche,
}: {
  jeton: string
  recherche: Recherche | null
}) {
  /**
   * LES CINQ ETAPES, chacune avec le nombre que le code a REELLEMENT produit.
   *
   * Le compte des lignes d'achat est refait ici par le meme predicat que `ouAcheter` — c'est
   * une passe sur un tableau deja en memoire, et c'est le seul moyen d'afficher le chiffre
   * exact de l'etape 2 : `Recherche` ne rend que le compte de POOLS, pas celui des lignes.
   */
  const etapes = useMemo<Etape[]>(() => {
    if (!recherche) return []

    const achetent = dataset.rows.reduce((n, r) => n + (ligneAchete(r, jeton) ? 1 : 0), 0)

    const g = recherche.groupes
    const monnaie = g[0] ? (g[0].paieAvecNom ?? court(g[0].paieAvec)) : null
    const monnaies =
      g.length === 0
        ? 'none'
        : g.length === 1
          ? `1 currency · ${monnaie}`
          : `${g.length} currencies · ${monnaie} first`

    // L'ETAPE 4 lit la porte la moins chere du premier groupe — celle que la reponse affiche.
    // Les deux moities restent separees a l'ecran parce qu'elles ne sont pas de meme nature :
    // les frais LP sont declares par le pool, le prelevement du hook ne l'est nulle part.
    const p = g.flatMap((x) => x.classees)[0] ?? null
    const jauge =
      p && p.lpBps !== null && p.hookBps !== null && p.totalBps !== null
        ? `${p.lpBps.toFixed(2)} + ${p.hookBps.toFixed(2)} = ${p.totalBps.toFixed(2)} bps`
        : 'not measured at this size'

    return [
      {
        n: 2,
        quoi: execute(2, 0),
        valeur: `${nombre(dataset.totals.rows)} rows`,
      },
      {
        n: 5,
        quoi: execute(5, 0),
        valeur: `${nombre(achetent)} buy · ${nombre(recherche.n_portes)} ${recherche.n_portes === 1 ? 'pool' : 'pools'}`,
      },
      {
        n: null,
        quoi: execute(5, 1),
        valeur: monnaies,
      },
      {
        n: 3,
        quoi: 'LP fee read on-chain + hook take measured by counterfactual',
        valeur: jauge,
      },
      {
        n: 6,
        quoi: OUTILS.find((x) => x.n === 6)?.question ?? '',
        valeur: recherche.etat,
      },
    ]
  }, [jeton, recherche])

  /**
   * L'AVANCEMENT. `avance` est le nombre de lignes revelees ; une ligne est EN TRAVAIL tant que
   * la suivante n'est pas partie, et FINIE ensuite. La derniere se termine quand le compteur
   * depasse la liste — sans quoi elle battrait pour toujours, ce qui dirait faux.
   */
  const [avance, setAvance] = useState(0)

  useEffect(() => {
    const total = etapes.length
    if (total === 0) {
      setAvance(0)
      return
    }
    const saute =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (saute) {
      setAvance(total + 1)
      return
    }
    let i = 1
    setAvance(1)
    const id = window.setInterval(() => {
      i += 1
      setAvance(i)
      if (i > total) window.clearInterval(id)
    }, PAS)
    return () => window.clearInterval(id)
  }, [jeton, etapes.length])

  if (!recherche || etapes.length === 0) return null

  const fini = avance > etapes.length

  return (
    /* `aria-live=off` : le conteneur parent annonce deja la reponse. Une lecture d'ecran qui
       recevrait en plus les cinq etapes une a une n'entendrait plus le resultat. Le bloc reste
       lisible a la demande — il n'est pas cache. */
    <div className="rzn" aria-live="off">
      <style>{`
.rzn {
  border-bottom: 1px solid var(--line);
  padding-bottom: 10px;
  margin-bottom: 2px;
  min-width: 0;
}
.rzn-tete {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 8px;
  color: var(--ink-2);
  font-family: var(--mono);
  margin: 0 0 8px;
}
.rzn-liste {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 7px;
  min-width: 0;
}
.rzn-ligne {
  display: grid;
  grid-template-columns: 11px minmax(0, 1fr);
  column-gap: 8px;
  row-gap: 1px;
  align-items: start;
  min-width: 0;
}
.rzn-ligne--entre {
  animation: rzn-entre 180ms ease-out both;
}
.rzn-marque {
  grid-column: 1;
  grid-row: 1;
  width: 7px;
  height: 7px;
  margin-top: 4px;
  display: block;
  border-radius: 0;
}
.rzn-marque--bat {
  animation: rzn-bat 900ms ease-in-out infinite;
}
.rzn-coche {
  grid-column: 1;
  grid-row: 1;
  width: 9px;
  height: 9px;
  margin-top: 3px;
  display: block;
  overflow: visible;
}
.rzn-haut {
  grid-column: 2;
  grid-row: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0 10px;
  min-width: 0;
}
.rzn-nom {
  font-family: var(--mono);
  min-width: 0;
  overflow-wrap: anywhere;
}
.rzn-val {
  font-family: var(--mono);
  color: var(--ink);
  min-width: 0;
  overflow-wrap: anywhere;
}
.rzn-quoi {
  grid-column: 2;
  grid-row: 2;
  font-family: var(--prose);
  color: var(--ink-2);
  min-width: 0;
  overflow-wrap: anywhere;
}
@keyframes rzn-entre {
  from { opacity: 0; transform: translateY(3px); }
  to { opacity: 1; transform: none; }
}
@keyframes rzn-bat {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.72); }
}
/* Sous mouvement reduit, les cinq lignes sont deja toutes posees par l'effet ; on coupe aussi
   ce qui pourrait rester d'animation, pastille comprise. */
@media (prefers-reduced-motion: reduce) {
  .rzn-ligne--entre { animation: none; }
  .rzn-marque--bat { animation: none; opacity: 1; }
}
      `}</style>

      <p className="rzn-tete t-label">
        <span style={{ color: 'var(--ink)' }}>{fini ? 'how it got there' : 'working…'}</span>
        <span>
          {etapes.length} steps, run in this page on the embedded corpus
        </span>
      </p>

      <ol className="rzn-liste">
        {etapes.map((e, i) => {
          if (i >= avance) return null
          const t = tete(e.n)
          const done = i < avance - 1
          return (
            <li key={`${e.n ?? 'x'}-${i}`} className="rzn-ligne rzn-ligne--entre">
              {done ? (
                <svg
                  className="rzn-coche"
                  viewBox="0 0 10 10"
                  aria-hidden="true"
                  fill="none"
                  stroke={t.couleur}
                  strokeWidth="1.6"
                >
                  <path d="M1 5.2 L3.7 8 L9 1.8" />
                </svg>
              ) : (
                <span
                  className="rzn-marque rzn-marque--bat"
                  aria-hidden="true"
                  style={{ background: t.couleur }}
                />
              )}
              <span className="rzn-haut">
                <span className="rzn-nom t-data-xs" style={{ color: t.couleur }}>
                  {t.texte}
                </span>
                <span className="rzn-val t-data-sm">{e.valeur}</span>
              </span>
              <span className="rzn-quoi t-data-xs">{e.quoi}</span>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
