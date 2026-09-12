/**
 * L'INDEX DES DIX-SEPT PANNEAUX — le sommaire d'un rapport technique, collant a gauche.
 *
 * Dix-sept panneaux sans repere, c'est une page sans navigation : on descend, on perd le fil,
 * et rien ne dit combien il en reste. L'ordinal de chaque panneau, qui etait un eyebrow en
 * capitales espacees sur ce qui n'est pas une sequence, redevient ce qu'il aurait toujours du
 * etre : une ANCRE. `#p-08` ouvre le graphe, l'adresse se copie, et le bouton « precedent »
 * marche.
 *
 * Ce que la colonne de droite porte n'est jamais decoratif : soit un compte reel, pris sur le
 * corpus ou sur `facts.json`, soit ce que le panneau exige pour repondre. Aucun nombre n'est
 * ecrit ici a la main.
 */
import { useEffect, useState } from 'react'
import { dataset } from '../lib/dataset'
import { OUTILS } from '../lib/outils'
import { DONNEES } from '../lib/donnees'
import facts from '../data/facts.json'

const T = dataset.totals
const nb = (x: number) => x.toLocaleString('fr')

/** Les dix-sept panneaux, dans l'ordre ou la page les pose. */
export const PANNEAUX: { id: string; titre: string; compte: string }[] = [
  { id: '00', titre: 'Le test de sortie', compte: `${nb(T.hooks)} hooks` },
  { id: '01', titre: 'Le même swap, coté deux fois', compte: `${nb(T.measured)} MESURE` },
  { id: '02', titre: 'Le registre contre la mesure', compte: `${nb(T.hooks)} lignes` },
  { id: '03', titre: 'Par quelle porte passer', compte: 'API requise' },
  { id: '04', titre: 'Les permissions, lues sur la chaîne', compte: '14 bits' },
  { id: '05', titre: 'La fiche du hook choisi', compte: `${nb(T.pools)} pools` },
  { id: '06', titre: 'Le profil taille vers bps', compte: 'par taille' },
  { id: '07', titre: 'Les lignes brutes de ce hook', compte: `${nb(T.rows)} au total` },
  { id: '08', titre: 'Le graphe autour du hook', compte: 'API requise' },
  { id: '09', titre: 'Le péage, relu sur le mirror node', compte: facts.x402 ? `${nb(Number(facts.x402.regles))} réglés` : 'non lu' },
  { id: '10', titre: 'Qui mesure : l’identité d’agent', compte: facts.agent ? String(facts.agent.etat).toLowerCase() : 'non lu' },
  { id: '11', titre: 'Ce qui est écrit on-chain', compte: facts.attestations ? `${nb(Number(facts.attestations.ecrits))} écrits` : 'non lu' },
  { id: '12', titre: 'Une source indépendante, confrontée', compte: facts.graph ? String(facts.graph.part) : 'non lu' },
  { id: '13', titre: 'La preuve d’exécution sur l’appareil', compte: facts.ledger ? `${nb(Number(facts.ledger.ecrans))} écrans` : 'non lu' },
  { id: '14', titre: 'Les autres surfaces', compte: `${OUTILS.length} outils` },
  { id: '15', titre: 'Le compte', compte: 'API requise' },
  { id: '16', titre: 'Et ailleurs ? La porte de remplacement', compte: `${DONNEES.length} jeux lus` },
]

export function IndexPanneaux() {
  const [actif, setActif] = useState<string | null>(null)

  // Un lien du sommaire ne fait pas sauter le navigateur tout seul : le fragment porte la
  // route, pas l'ancre. On amene donc le panneau nous-memes, au chargement comme au clic.
  useEffect(() => {
    const aller = () => {
      const m = /^#\/instrument\/(p-\d+)/.exec(window.location.hash)
      if (!m) return
      const el = document.getElementById(m[1]!)
      if (el) el.scrollIntoView({ block: 'start' })
    }
    aller()
    window.addEventListener('hashchange', aller)
    return () => window.removeEventListener('hashchange', aller)
  }, [])

  // Le sommaire dit OU ON EST. Sans ca, il ne fait que lister — et l'index d'un rapport
  // technique qui ne suit pas la lecture ne sert qu'une fois.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const vus = new Set<string>()
    const io = new IntersectionObserver(
      (entrees) => {
        for (const e of entrees) {
          const id = e.target.id.replace('p-', '')
          if (e.isIntersecting) vus.add(id)
          else vus.delete(id)
        }
        const premier = PANNEAUX.map((p) => p.id).find((id) => vus.has(id))
        if (premier) setActif(premier)
      },
      { rootMargin: '-60px 0px -60% 0px' },
    )
    for (const p of PANNEAUX) {
      const el = document.getElementById(`p-${p.id}`)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [])

  return (
    <nav className="index-panneaux" aria-label="les dix-sept panneaux de l’instrument">
      <p className="t-data-sm m-0 px-[10px] pb-[10px]" style={{ color: 'var(--ink-2)' }}>
        {PANNEAUX.length} panneaux
      </p>
      <ol className="m-0 p-0" style={{ listStyle: 'none' }}>
        {PANNEAUX.map((p) => {
          const ici = actif === p.id
          return (
            <li key={p.id} style={{ borderTop: '1px solid var(--line)' }}>
              <a
                // Le fragment porte DEJA la route : `#p-08` serait lu par le routeur comme
                // « pas une route connue », donc comme l'accueil, et le lien sortirait de la
                // page qu'il pretend parcourir. `#/instrument/p-08` se copie, se partage et
                // revient au meme endroit.
                href={`#/instrument/p-${p.id}`}
                aria-current={ici ? 'location' : undefined}
                className="index-ligne no-underline grid items-baseline gap-[8px] px-[10px] py-[7px]"
                style={{
                  gridTemplateColumns: 'auto minmax(0,1fr) auto',
                  color: ici ? 'var(--ink)' : 'var(--ink-2)',
                  background: ici ? 'var(--surface-1)' : 'transparent',
                  boxShadow: ici ? 'inset 2px 0 0 var(--ink)' : undefined,
                  minHeight: 34,
                }}
              >
                <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
                  {p.id}
                </span>
                <span className="t-body" style={{ fontSize: 13.5, lineHeight: 1.35 }}>{p.titre}</span>
                <span className="t-data-sm text-right" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                  {p.compte}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
