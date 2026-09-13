/**
 * TEMPS 9 — ESSAYEZ.
 *
 * Reprise de `finale/sections/CloseSection.tsx` : trois agrégats, la liste de ce qui existe,
 * et une sortie. Les quatorze pastilles sont cliquables — un juge qui explore seul doit pouvoir
 * ouvrir la page d'un outil depuis le deck, sans revenir à l'accueil.
 */
import { Carte, Chiffre, Eyebrow, Sous, Titre } from '../atoms'
import { OUTILS, FAMILLES } from '../../../lib/outils'
import { DONNEES } from '../../../lib/donnees'
import { Copy } from '../../Prim'

export function CloseSection({ surOutil }: { surOutil?: (n: number) => void }) {
  return (
    <>
      <Eyebrow tone="m-6">everything is published</Eyebrow>
      <Titre petit>
        The corpus, the replay commands,{' '}
        <span style={{ color: 'var(--m-6)' }}>and what we do not know.</span>
      </Titre>
      <Sous>Five ways in. The corpus itself ships inside the page.</Sous>

      <div className="dk-grille dk-g11 dk-fill">
        <Carte titre="the fourteen tools">
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'max(0.6cqi, 5px)', minHeight: 0, overflowY: 'auto' }}>
            {OUTILS.map((o) => (
              <button
                key={o.n}
                type="button"
                className="dk-puce"
                style={{ color: FAMILLES[o.famille].couleur }}
                title={o.question}
                onClick={() => surOutil?.(o.n)}
              >
                {o.n}. {o.nom}
              </button>
            ))}
          </div>
          <div className="dk-source" style={{ marginTop: 'auto' }}>
            the site · the browser extension · the MCP server · x402 on Hedera · the account
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'max(1cqi, 10px)' }}>
            <Copy text="https://github.com/JeanBaptisteDurand/ETH_Online_2026" label="copy the repository" />
            <a href="#/" style={{ color: 'var(--ink)' }}>open the instrument →</a>
          </div>
        </Carte>

        <div className="dk-grille" style={{ margin: 0, gridTemplateRows: 'repeat(3, minmax(0, 1fr))' }}>
          <Chiffre v={String(OUTILS.length)} k="named tools" ton="m-6" />
          <Chiffre v={String(DONNEES.length)} k="published datasets" ton="focus" />
          <Chiffre v="5" k="ways in" ton="m-4" />
        </div>
      </div>
    </>
  )
}
