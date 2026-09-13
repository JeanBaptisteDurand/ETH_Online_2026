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
  ['we pin a fork', 'at block 50 614 000, so two quotes taken ten minutes apart stay comparable'],
  ['we quote the swap', 'as it is, hook in place — this is what the user really receives'],
  ['anvil_setCode', 'replaces THE HOOK’s bytecode with 89 inert bytes. Same address, so same poolId, same liquidity, same slot0'],
  ['we quote the SAME swap', 'against the stub. The gap between the two quotes is the take, in basis points'],
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
      <Eyebrow tone="m-5">the method · counterfactual · pinned fork</Eyebrow>
      <Titre petit>
        You cannot remove a pool’s hook.{' '}
        <span style={{ color: 'var(--m-5)' }}>So we change its code.</span>
      </Titre>
      <p className="dk-sous">
        A v4 pool’s key contains the hook’s address: change the hook and you change the{' '}
        <code>poolId</code>. “The same pool without its hook” does not exist — so it has to be
        built, at the hook’s own address.
      </p>

      <div className="dk-grille dk-g11 dk-fill">
        <Carte titre="the counterfactual, in four moves">
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
            The only thing that changes between the two quotes is the code that runs during the
            swap.{' '}
            <button type="button" className="dk-ghost" onClick={rejouer} style={{ marginLeft: '0.6cqi' }}>
              replay
            </button>
          </div>
        </Carte>

        <div className="dk-grille dk-g2" style={{ margin: 0, gridTemplateRows: 'auto auto auto' }}>
          <Chiffre v={nb(mesures)} k="published measurements" source="docs/dataset/measurements.jsonl" />
          <Chiffre v="89" k="bytes of inert stub" ton="m-4" source="engine/tare/stub.py" />
          <Chiffre v={nb(pools)} k="pools swept" ton="focus" />
          <Chiffre v={nb(hooks)} k="hooks measured" ton="m-6" />
          <div style={{ gridColumn: '1 / -1' }}>
            <Carte titre="the stub, by its hash">
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
                The same stub for all {nb(mesures)} rows: a measurement that does not carry this
                hash was not taken against that code.
              </span>
            </Carte>
          </div>
        </div>
      </div>
    </>
  )
}
