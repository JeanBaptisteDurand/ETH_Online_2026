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
      <Eyebrow tone="focus">la preuve · porte A4 · swap réellement exécuté</Eyebrow>
      <Titre petit>
        Et quand on l’exécute vraiment,{' '}
        <span style={{ color: 'var(--focus)' }}>la cotation tient au wei près.</span>
      </Titre>

      <div className="dk-grille dk-g11 dk-fill">
        {/* L'enveloppe : ce que la cotation annonçait, ce que la chaîne a rendu */}
        <Carte titre="le swap exécuté, confronté à sa cotation">
          <Champ
            label="AVEC LE HOOK · EXÉCUTÉ"
            value={avecHook.execute}
            ton={avecHook.egal ? 'focus' : 'm-4'}
          />
          <Champ label="AVEC LE HOOK · COTÉ" value={avecHook.cote} />
          <Champ
            label="AVEC LE TALON · EXÉCUTÉ"
            value={avecTalon.execute}
            ton={avecTalon.egal ? 'focus' : 'm-4'}
          />
          <Champ label="AVEC LE TALON · COTÉ" value={avecTalon.cote} />
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
                ✓ {avecHook.egal && avecTalon.egal ? 'les deux cotations tiennent, au wei près' : 'écart publié'}
              </span>
              <br />
              <span style={{ color: 'var(--ink-3)' }}>engine/tare/gates/a4.py</span>
            </Mono>
          </div>
        </Carte>

        {/* La colonne de droite : les deux bps, puis la chaîne complète */}
        <div className="dk-grille dk-g2" style={{ margin: 0, gridAutoRows: 'min-content' }}>
          <Chiffre v={bpsExecutes.toFixed(2)} k="bps réellement exécutés" ton="m-4" />
          <Chiffre v={bpsPublies.toFixed(2)} k="bps annoncés par la cotation" ton="m-6" />
          <div style={{ gridColumn: '1 / -1', minHeight: 0 }}>
            <Carte
              titre={`la chaîne complète · ${chaine.n_ok}/${chaine.n_total} · ${nb(chaine.duree_ms)} ms`}
              style={{ minHeight: 0 }}
            >
              <div style={{ minHeight: 0, overflowY: 'auto' }}>
                {chaine.etapes.map((e, i) => (
                  <div key={e.n} className="dk-etape" style={{ opacity: i < etape ? 1 : 0.18 }}>
                    <span className="dk-num" style={{ color: 'var(--focus)' }}>
                      {e.etat === 'OK' ? '✓' : '·'}
                    </span>
                    <span className="dk-prose" style={{ flex: 1, minWidth: 0 }}>
                      {e.quoi}
                    </span>
                    <Mono style={{ color: 'var(--ink-2)', fontSize: 'max(0.96cqi, 10px)', whiteSpace: 'nowrap' }}>
                      {nb(e.a_ms)} ms
                    </Mono>
                  </div>
                ))}
              </div>
              <span className="dk-prose">
                Transaction réelle, verdict, recherche de porte, mesure payée en x402, ancrage HCS,
                signature sur l’appareil. <strong>Et on publie aussi le pool où ça ne concorde pas.</strong>
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
