/**
 * TEMPS 2 — LA MÉTHODE.
 *
 * Même mise en scène que `AtlasSection` de la source : filet + capitale, gros titre à deux
 * lignes, puis une grille `1.1fr / 0.9fr` — la carte narrative à gauche, la colonne de chiffres
 * à droite. Les étapes s'allument une par une quand la planche entre à l'écran (`useSequence`,
 * comme la cascade de la source).
 *
 * Le fond : la PoolKey d'un pool v4 contient l'adresse du hook. « Le même pool sans son hook »
 * n'existe donc pas — changer le hook change le poolId. On ne retire pas le hook : on remplace
 * son BYTECODE par un talon inerte de 89 octets, à la même adresse, sur un fork épinglé.
 */
import { Carte, Chiffre, Eyebrow, Mono, Titre, nb, useSequence } from '../atoms'

const ETAPES: ReadonlyArray<[string, string]> = [
  ['on épingle un fork', 'au bloc 50 614 000, pour que deux cotations prises à dix minutes d’écart restent comparables'],
  ['on cote le swap', 'tel qu’il est, hook en place — c’est ce que l’utilisateur reçoit vraiment'],
  ['anvil_setCode', 'remplace le bytecode DU HOOK par 89 octets inertes. Même adresse, donc même poolId, même liquidité, même slot0'],
  ['on cote le MÊME swap', 'contre le talon. L’écart entre les deux cotations est le prélèvement, en points de base'],
]

interface MethodeSectionProps {
  actif: boolean
  mesures: number
  pools: number
  hooks: number
  stubHash: string
}

export function MethodeSection({ actif, mesures, pools, hooks, stubHash }: MethodeSectionProps) {
  const { etape, rejouer } = useSequence(ETAPES.length, [520, 760, 900, 900], actif)

  return (
    <>
      <Eyebrow tone="m-5">la méthode · contrefactuel · fork épinglé</Eyebrow>
      <Titre petit>
        On ne peut pas retirer le hook d’un pool.{' '}
        <span style={{ color: 'var(--m-5)' }}>Alors on change son code.</span>
      </Titre>
      <p className="dk-sous">
        La clé d’un pool v4 contient l’adresse du hook : changer le hook change le{' '}
        <code>poolId</code>. « Le même pool sans son hook » n’existe pas — il faut donc le
        fabriquer, à l’adresse même du hook.
      </p>

      <div className="dk-grille dk-g11 dk-fill">
        <Carte titre="le contrefactuel, en quatre gestes">
          {ETAPES.map(([quoi, pourquoi], i) => (
            <div key={quoi} className="dk-etape" style={{ opacity: i < etape ? 1 : 0.18 }}>
              <span className="dk-num" style={{ color: i === 2 ? 'var(--m-4)' : 'var(--m-6)' }}>
                {i + 1}
              </span>
              <span className="dk-prose">
                <strong style={{ fontFamily: i === 2 ? 'var(--mono)' : undefined }}>{quoi}</strong> — {pourquoi}
              </span>
            </div>
          ))}
          <div className="dk-prose" style={{ marginTop: 'auto', color: 'var(--ink)' }}>
            La seule chose qui change entre les deux cotations est le code qui s’exécute pendant
            le swap.{' '}
            <button type="button" className="dk-ghost" onClick={rejouer} style={{ marginLeft: '0.6cqi' }}>
              rejouer
            </button>
          </div>
        </Carte>

        <div className="dk-grille dk-g2" style={{ margin: 0, gridTemplateRows: 'auto auto auto' }}>
          <Chiffre v={nb(mesures)} k="mesures publiées" source="docs/dataset/measurements.jsonl" />
          <Chiffre v="89" k="octets de talon inerte" ton="m-4" source="engine/tare/stub.py" />
          <Chiffre v={nb(pools)} k="pools balayés" ton="focus" />
          <Chiffre v={nb(hooks)} k="hooks mesurés" ton="m-6" />
          <div style={{ gridColumn: '1 / -1' }}>
            <Carte titre="le talon, par son empreinte">
              <Mono
                style={{
                  color: 'var(--ink)',
                  fontSize: 'max(1.0cqi, 10.5px)',
                  overflowWrap: 'anywhere',
                  lineHeight: 1.5,
                }}
              >
                {stubHash}
              </Mono>
              <span className="dk-prose">
                Le même talon pour les {nb(mesures)} lignes : une mesure qui ne porte pas cette
                empreinte n’a pas été prise contre ce code-là.
              </span>
            </Carte>
          </div>
        </div>
      </div>
    </>
  )
}
