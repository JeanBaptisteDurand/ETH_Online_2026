/**
 * TEMPS 3 — LA PREUVE.
 *
 * Mise en scène de `TeeProofSection` : grille `1.2fr / 1fr`, une « enveloppe » à gauche qui
 * aligne des champs `LABEL / valeur` en mono, trois cartes d'explication à droite. La source y
 * mettait une attestation TEE ; on y met la porte A4 — le seul endroit du projet où une cotation
 * est confrontée à un swap RÉELLEMENT exécuté.
 *
 * L'objection qu'on prend de face : « une cotation sur un fork, ça vaut quoi ? » On a donc
 * exécuté le swap, et recollé le résultat à ce que la cotation annonçait. Au wei près.
 */
import { Carte, Chiffre, Eyebrow, Mono, Titre, nb, useSequence } from '../atoms'

/**
 * LES SIX ÉTAPES DE LA CHAÎNE VIENNENT DE `facts.json`, ET ELLES Y SONT EN FRANÇAIS.
 *
 * On ne réécrit pas le corpus depuis une planche : on traduit à l'affichage, et une étape qu'on
 * ne reconnaît pas s'affiche telle qu'elle est écrite dans le fait. Le jour où `facts.json`
 * passera à l'anglais, la table ne trouvera plus rien et le texte du fait passera tel quel.
 */
const ETAPE_EN: Readonly<Record<string, string>> = {
  'une vraie transaction Base, rejouable par son hash':
    'a real Base transaction, replayable by its hash',
  'la garde decode le calldata et rend un verdict':
    'the guard decodes the calldata and returns a verdict',
  'y a-t-il une autre porte ?': 'is there another door?',
  'une mesure neuve, payee en x402 sur Hedera et relue sur le mirror node':
    'a new measurement, paid over x402 and read back',
  'le lot est ancre sur le topic HCS, et relu':
    'the batch is anchored on the HCS topic, and read',
  "le rapport encode en EIP-712, rendu ecran par ecran sur l'appareil, et signe":
    'the EIP-712 report, screen by screen, then signed',
}

interface EtapeChaine {
  n: number
  quoi: string
  etat: string
  a_ms: number
}

interface PreuveSectionProps {
  actif: boolean
  bpsExecutes: number
  bpsPublies: number
  avecHook: { execute: string; cote: string; egal: boolean }
  avecTalon: { execute: string; cote: string; egal: boolean }
  chaine: { n_ok: number; n_total: number; duree_ms: number; etapes: EtapeChaine[] }
}

export function PreuveSection({
  actif,
  bpsExecutes,
  bpsPublies,
  avecHook,
  avecTalon,
  chaine,
}: PreuveSectionProps) {
  const { etape } = useSequence(chaine.etapes.length, chaine.etapes.map(() => 360), actif)

  return (
    <>
      <Eyebrow tone="focus">the proof · door A4 · a swap actually executed</Eyebrow>
      <Titre petit>
        And when we actually execute it,{' '}
        <span style={{ color: 'var(--focus)' }}>the quote holds to the wei.</span>
      </Titre>

      <div className="dk-grille dk-g11 dk-fill">
        {/* L'enveloppe : ce que la cotation annonçait, ce que la chaîne a rendu */}
        <Carte titre="the executed swap, against its quote">
          <Champ
            label="WITH THE HOOK · EXECUTED"
            value={avecHook.execute}
            ton={avecHook.egal ? 'focus' : 'm-4'}
          />
          <Champ label="WITH THE HOOK · QUOTED" value={avecHook.cote} />
          <Champ
            label="WITH THE STUB · EXECUTED"
            value={avecTalon.execute}
            ton={avecTalon.egal ? 'focus' : 'm-4'}
          />
          <Champ label="WITH THE STUB · QUOTED" value={avecTalon.cote} />
          <div
            style={{
              marginTop: 'auto',
              padding: '0.9cqi 1.1cqi',
              border: '1px solid var(--line)',
              background: 'var(--bg-2)',
            }}
          >
            <Mono style={{ color: 'var(--ink-2)', fontSize: 'max(1.0cqi, 10.5px)', lineHeight: 1.6 }}>
              executed == quoted
              <br />
              <span style={{ color: 'var(--focus)' }}>
                ✓ {avecHook.egal && avecTalon.egal ? 'both quotes hold, to the wei' : 'gap published'}
              </span>
              <br />
              <span style={{ color: 'var(--ink-3)' }}>engine/tare/gates/a4.py</span>
            </Mono>
          </div>
        </Carte>

        {/* La colonne de droite : les deux bps, puis la chaîne complète */}
        <div className="dk-grille dk-g2" style={{ margin: 0, gridAutoRows: 'min-content' }}>
          <Chiffre v={bpsExecutes.toFixed(2)} k="bps actually executed" ton="m-4" />
          <Chiffre v={bpsPublies.toFixed(2)} k="bps announced by the quote" ton="m-6" />
          <div style={{ gridColumn: '1 / -1', minHeight: 0 }}>
            <Carte
              titre={`the full chain · ${chaine.n_ok}/${chaine.n_total} · ${nb(chaine.duree_ms)} ms`}
              style={{ minHeight: 0 }}
            >
              <div style={{ minHeight: 0, overflowY: 'auto' }}>
                {chaine.etapes.map((e, i) => (
                  <div key={e.n} className="dk-etape" style={{ opacity: i < etape ? 1 : 0.18 }}>
                    <span className="dk-num" style={{ color: 'var(--focus)' }}>
                      {e.etat === 'OK' ? '✓' : '·'}
                    </span>
                    <span className="dk-prose" style={{ flex: 1, minWidth: 0 }}>
                      {ETAPE_EN[e.quoi] ?? e.quoi}
                    </span>
                    <Mono style={{ color: 'var(--ink-2)', fontSize: 'max(0.96cqi, 10px)', whiteSpace: 'nowrap' }}>
                      {nb(e.a_ms)} ms
                    </Mono>
                  </div>
                ))}
              </div>
              <span className="dk-prose">
                Real transaction, verdict, door search, x402, HCS anchor, device signature.{' '}
                <strong>And we publish the pool that does not match.</strong>
              </span>
            </Carte>
          </div>
        </div>
      </div>
    </>
  )
}

function Champ({
  label,
  value,
  ton,
}: {
  label: string
  value: string
  ton?: 'm-4' | 'm-5' | 'm-6' | 'focus'
}) {
  return (
    <div className="dk-champ">
      <span className="dk-label">{label}</span>
      <Mono
        style={{
          color: ton ? `var(--${ton})` : 'var(--ink)',
          fontSize: 'max(1.14cqi, 11px)',
          overflowWrap: 'anywhere',
          lineHeight: 1.4,
        }}
      >
        {value}
      </Mono>
    </div>
  )
}
