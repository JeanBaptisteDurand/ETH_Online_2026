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
          Les réglages
        </h1>
        <p
          className="t-body t-body-muted m-0"
          style={{ maxWidth: '74ch', fontFamily: 'var(--prose)' }}
        >
          Tout ce qui demande un portefeuille tient ici&nbsp;: la connexion et la signature qui
          ouvre une session, les clés d’API — une pour l’extension de navigateur, une pour le
          serveur MCP —, les téléchargements de ces deux clients, l’abonnement tel qu’il est lu
          sur la chaîne, et l’historique des évènements du compte. Le reste de l’instrument se
          lit sans rien de tout cela.
        </p>
      </header>

      <ComptePanel />
    </>
  )
}
