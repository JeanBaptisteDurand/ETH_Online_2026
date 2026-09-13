/**
 * TEMPS 7 — ON LIT CE QU'ON SIGNE.
 *
 * Mise en scène reprise de `finale/sections/TeeProofSection.tsx` : une cascade de cellules qui
 * s'allument l'une après l'autre, au rythme de `MOTION.cascadeStepMs` divisé par deux — huit
 * écrans, ça doit tenir dans le temps qu'on regarde une planche.
 *
 * CE QUE LA SCÈNE PROUVE. Un portefeuille matériel qui affiche un haché opaque ne protège de
 * rien : on signe ce qu'on ne peut pas lire. Le rapport est donc encodé en EIP-712 et rendu
 * CHAMP PAR CHAMP. Et l'annulation n'est pas décorative : elle rend le code 4001 et aucun appel
 * ne part — c'est vérifié par un test de `packages/guard`.
 */
import { Carte, Eyebrow, Sous, Titre, useSequence } from '../atoms'

interface SpeculosSectionProps {
  actif: boolean
  /** combien d'écrans l'appareil a réellement rendus — lu dans facts.ledger */
  ecransRendus: number | null
  type712: string | null
}

const ECRANS: ReadonlyArray<[string, string]> = [
  ['Review', 'TareGuardApproval'],
  ['verdict', 'MEASURED TAKE'],
  ['hook', '0xb429d62f…ba28cc'],
  ['pool', '0x010d0023…6c538'],
  ['take', '9 999.53 bps'],
  ['size', '1 000 000 000 000'],
  ['block', '50 614 000'],
  ['Approve?', 'Approve / Reject'],
]

export function SpeculosSection({ actif, ecransRendus, type712 }: SpeculosSectionProps) {
  const { etape, rejouer } = useSequence(ECRANS.length, ECRANS.map(() => 420), actif)

  return (
    <>
      <Eyebrow tone="m-4">the hardware leg · EIP-712 · field by field</Eyebrow>
      <Titre petit>
        You do not sign an opaque digest.{' '}
        <span style={{ color: 'var(--m-4)' }}>You read what you sign.</span>
      </Titre>
      <Sous>Eight screens, one after another, exactly as the device renders them.</Sous>

      <div className="dk-grille dk-g11 dk-fill">
        <div className="dk-ecrans">
          {ECRANS.map(([k, v], i) => (
            <div
              key={k}
              className="dk-ecran"
              style={{
                opacity: i < etape ? 1 : 0.1,
                transform: i < etape ? 'none' : 'translateY(max(0.5cqi, 4px))',
                borderColor: i === ECRANS.length - 1 && i < etape ? 'var(--m-4)' : 'var(--line)',
                transition: 'opacity 220ms linear, transform 220ms ease-out, border-color 220ms linear',
              }}
            >
              <span className="dk-label">{k}</span>
              <b>{v}</b>
            </div>
          ))}
        </div>

        <Carte titre="why it matters">
          <div style={{ color: 'var(--ink-2)', lineHeight: 1.55 }}>
            A hardware wallet that shows an opaque digest protects nothing: you sign what you
            cannot read. The report is encoded in <strong style={{ color: 'var(--ink)' }}>EIP-712</strong>{' '}
            and rendered <strong style={{ color: 'var(--ink)' }}>field by field</strong>.
          </div>
          <div style={{ color: 'var(--ink-2)', lineHeight: 1.55 }}>
            Cancelling is not decorative: it returns code{' '}
            <strong style={{ color: 'var(--ink)' }}>4001</strong>, and{' '}
            <strong style={{ color: 'var(--ink)' }}>no call goes out</strong>. A test in{' '}
            <code>packages/guard</code> holds that.
          </div>
          {ecransRendus !== null && (
            <div className="dk-source">
              {ecransRendus} screens rendered{type712 ? `, type ${type712}` : ''} — the repository
              publishes their trace. The device is not plugged into this page: this is a{' '}
              <strong style={{ color: 'var(--m-5)' }}>replay</strong> of what Speculos returned.
            </div>
          )}
          <button
            type="button"
            className="dk-onglet"
            style={{ marginTop: 'auto', alignSelf: 'flex-start' }}
            onClick={rejouer}
          >
            replay
          </button>
        </Carte>
      </div>
    </>
  )
}
