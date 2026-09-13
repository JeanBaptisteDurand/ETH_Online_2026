/**
 * LES REGLAGES — la route qui rassemble ce qui demande un portefeuille.
 *
 * Le panneau du compte vivait uniquement au fond de l'instrument, après les panneaux
 * d'analyse : la seule surface qui demande une signature était aussi la plus loin de la barre
 * du haut. Elle a maintenant sa propre route, et le panneau n'est pas dupliqué — c'est le
 * MEME composant, monté ici tel quel.
 */
import { ComptePanel } from './Compte'

export function ReglagesPage() {
  return (
    <>
      {/* LE TITRE DE ROUTE, et une phrase qui dit ce qu'on trouve dessous. Aucun chiffre :
          les nombres de cette page viennent du serveur et de la chaîne, pas d'ici. */}
      <header className="px-[16px] pt-[8px] pb-[14px] flex flex-col" style={{ gap: 12 }}>
        <h1 className="t-display m-0" style={{ color: 'var(--ink)' }}>
          Settings
        </h1>
        <p
          className="t-body t-body-muted m-0"
          style={{ maxWidth: '74ch', fontFamily: 'var(--prose)' }}
        >
          Everything that needs a wallet lives here: the connection and the signature that opens
          a session, the API keys — one for the browser extension, one for the MCP server —, the
          downloads for those two clients, the subscription as it is read on-chain, and the
          history of the account’s events. The rest of the instrument reads without any of it.
        </p>
      </header>

      <ComptePanel />
    </>
  )
}
