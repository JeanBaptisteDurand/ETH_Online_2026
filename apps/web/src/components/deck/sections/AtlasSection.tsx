/**
 * TEMPS 4 — L'INSTRUMENT, EN VRAI.
 *
 * Mise en scène reprise de `finale/sections/AtlasSection.tsx` : filet + capitale, gros titre à
 * deux lignes avec un nombre en couleur, puis la grille `1.1fr / 0.9fr` — la « carte héros » à
 * gauche, trois cellules d'agrégat empilées à droite.
 *
 * La carte héros de la source était un bouton. Ici c'est une `<iframe>` de NOTRE PROPRE
 * instrument, qui tourne pour de vrai dans la planche. On peut se le permettre sans réserve :
 * le site est statique et porte son corpus, donc l'iframe ne demande RIEN au réseau — aucun
 * serveur à tenir pendant la démo.
 */
import { Eyebrow, Titre, Vitre, nb } from '../atoms'

interface AtlasSectionProps {
  mesures: number
  pools: number
  hooks: number
  octetsCorpus: number
}

export function AtlasSection({ mesures, pools, hooks, octetsCorpus }: AtlasSectionProps) {
  const mo = (octetsCorpus / 1_000_000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })
  return (
    <>
      <Eyebrow tone="m-6">l’instrument · statique · zéro requête</Eyebrow>
      <Titre petit>
        Le cadre ci-dessous n’est pas une capture.{' '}
        <span style={{ color: 'var(--m-6)' }}>C’est le produit.</span>
      </Titre>

      <div className="dk-grille dk-g11 dk-fill">
        <Vitre route="/" titre="l’instrument TARE — coller un jeton, lire par où l’acheter" />

        <div className="dk-grille" style={{ margin: 0, gridTemplateRows: 'repeat(3, minmax(0, 1fr))' }}>
          <AggCell
            label="MESURES DANS LA PAGE"
            value={nb(mesures)}
            sub={`${nb(pools)} pools · ${nb(hooks)} hooks · un seul bloc`}
          />
          <AggCell
            label="POIDS DU CORPUS EMBARQUÉ"
            value={`${mo} Mo`}
            sub="apps/web/src/data/dataset.json, encodé par colonne"
            ton="m-6"
          />
          <AggCell
            label="REQUÊTES RÉSEAU"
            value="0"
            sub="rien à joindre, rien à tenir pendant la démo"
            ton="focus"
          />
        </div>
      </div>
    </>
  )
}

function AggCell({
  label,
  value,
  sub,
  ton = 'm-5',
}: {
  label: string
  value: string
  sub: string
  ton?: 'm-4' | 'm-5' | 'm-6' | 'focus'
}) {
  return (
    <div className="dk-agg">
      <span className="dk-label">{label}</span>
      <b style={{ color: `var(--${ton})` }}>{value}</b>
      <i>{sub}</i>
    </div>
  )
}
