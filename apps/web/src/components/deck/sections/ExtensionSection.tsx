/**
 * TEMPS 6 — TROIS SECONDES AVANT LA SIGNATURE.
 *
 * Mise en scène reprise de `finale/sections/AtGuardsSection.tsx` : une colonne d'étapes qui
 * s'allument l'une après l'autre à gauche, un panneau de verdict qui entre à droite quand la
 * séquence est finie.
 *
 * DEUX ISSUES, ET LES DEUX COMPTENT. La première est celle qu'on vend : une porte moins chère
 * existe, on construit la transaction de remplacement et on la fait signer par Permit2. La
 * seconde est celle qui arrive VRAIMENT dans 99,71 % des lignes du corpus : il n'y a qu'une
 * porte, et l'extension le dit au lieu d'inventer une alternative. Montrer la première sans la
 * seconde serait vendre un produit qui ment neuf fois sur dix.
 *
 * L'utilisateur bascule entre les deux. C'est volontaire : un présentateur choisit laquelle
 * montrer, et un juge qui explore seul découvre la seconde.
 */
import { useState } from 'react'
import { Carte, Eyebrow, Sous, Titre, useSequence } from '../atoms'

interface ExtensionSectionProps {
  actif: boolean
  /** combien de transactions Base réelles la garde a déjà décodées — lu dans facts.garde */
  transactionsReelles: number | null
}

export function ExtensionSection({ actif, transactionsReelles }: ExtensionSectionProps) {
  const [issue, setIssue] = useState<'cheaper' | 'only'>('cheaper')
  const cheaper = issue === 'cheaper'

  const etapes = [
    'an exchange front-end prepares the transaction and calls the wallet',
    'the guard intercepts it BEFORE the signature and reads the PoolKey back out of the Universal Router calldata',
    'it queries its embedded table — no request: the service worker carries it',
    cheaper
      ? 'this hook takes, and a cheaper door exists on the same pair'
      : 'this hook takes, and no other measured door exists on this pair',
  ]
  const { etape, rejouer } = useSequence(etapes.length, [700, 900, 800, 900], actif)

  return (
    <>
      <Eyebrow tone="m-4">the browser extension · 12 kB · works with the server off</Eyebrow>
      <Titre petit>
        The right moment is not when you search.{' '}
        <span style={{ color: 'var(--m-4)' }}>It is three seconds before you sign.</span>
      </Titre>
      <Sous>
        It sits between the exchange front-end and the wallet, and returns its verdict before the
        signature.
      </Sous>

      <div className="dk-grille dk-g11 dk-fill">
        <Carte titre="what it does, step by step">
          {etapes.map((t, i) => (
            <div
              key={t}
              className="dk-etape"
              style={{ opacity: i < etape ? 1 : 0.2, transition: 'opacity 240ms linear' }}
            >
              <span
                className="dk-label"
                style={{
                  color: i === 3 ? (cheaper ? 'var(--m-4)' : 'var(--m-5)') : 'var(--ink-2)',
                  minWidth: 'max(1.6cqi, 14px)',
                }}
              >
                {i + 1}
              </span>
              <span style={{ color: i === 3 ? 'var(--ink)' : 'var(--ink-2)' }}>{t}</span>
            </div>
          ))}

          <div style={{ marginTop: 'auto', display: 'flex', gap: 'max(0.6cqi, 6px)', flexWrap: 'wrap' }}>
            {(['cheaper', 'only'] as const).map((k) => (
              <button
                key={k}
                type="button"
                className="dk-onglet"
                aria-pressed={issue === k}
                onClick={() => {
                  setIssue(k)
                  rejouer()
                }}
              >
                {k === 'cheaper' ? 'there is a better one' : 'there is only one door'}
              </button>
            ))}
          </div>

          {transactionsReelles !== null && (
            <div className="dk-source">
              decoded on {transactionsReelles} real Base transactions · the measurement table
              lives in the service worker, so it answers even with our server off
            </div>
          )}
        </Carte>

        <div
          className="dk-verdict"
          style={{
            borderColor: cheaper ? 'var(--m-4)' : 'var(--line-strong)',
            opacity: etape >= etapes.length ? 1 : 0,
            transform: etape >= etapes.length ? 'none' : 'translateY(max(0.6cqi, 6px))',
            transition: 'opacity 280ms ease-out, transform 280ms ease-out',
          }}
        >
          <div className="dk-label" style={{ color: cheaper ? 'var(--m-4)' : 'var(--m-5)' }}>
            {cheaper ? 'a cheaper door exists' : 'there is only one door'}
          </div>

          <div style={{ color: 'var(--ink)', lineHeight: 1.55 }}>
            {cheaper ? (
              <>
                The same swap goes through another pool. The replacement transaction is{' '}
                <strong>built and signed through Permit2</strong> — one off-chain signature
                instead of an approval transaction, in the same transaction as the swap — and{' '}
                <strong>we never send it</strong>. It goes back to the wallet, which decides.
              </>
            ) : (
              <>
                On <strong>99.71%</strong> of the corpus rows, the answer is “there is only one
                door”. So the extension proposes nothing: it shows what the hook takes and asks
                for a confirmation. <strong>Inventing an alternative would be worse than saying
                nothing.</strong>
              </>
            )}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'max(0.7cqi, 6px)' }}>
            {(cheaper
              ? ['PRET — substitute', 'sign as is', 'cancel']
              : ['confirm knowingly', 'cancel']
            ).map((b, i) => (
              <span key={b} className="dk-bouton" data-fort={i === 0 ? 'oui' : undefined}>
                {b}
              </span>
            ))}
          </div>

          {cheaper && (
            <div className="dk-source" style={{ marginTop: 'auto' }}>
              command list <code>0x0a10</code> — PERMIT2_PERMIT then V4_SWAP, in that order. A
              swap presented before its permit would fail for lack of authorization.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
