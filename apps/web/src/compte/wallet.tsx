/**
 * LA CONNEXION DE PORTEFEUILLE — RainbowKit par-dessus wagmi.
 *
 * CE QUI EXISTAIT AVANT, ET POURQUOI ON LE GARDE DESSOUS.
 *
 * `compte/api.ts` découvre les portefeuilles par **EIP-6963**, écrit à la main. Ça marche, et
 * ça résout le vrai problème du standard précédent : avec deux portefeuilles installés,
 * `window.ethereum` n'en montre qu'un et cache l'autre. RainbowKit ne remplace pas ça — il
 * l'emballe : wagmi lit les mêmes annonces EIP-6963, et y ajoute **WalletConnect**, c'est-à-dire
 * le QR code, c'est-à-dire le téléphone. C'est la seule chose que l'implémentation maison ne
 * pouvait pas faire.
 *
 * LE `projectId`. WalletConnect en exige un, et il est PUBLIC par conception — il identifie
 * l'application, il n'autorise rien. Sans lui, on n'invente pas un identifiant bidon qui ferait
 * échouer les connexions en silence : on garde les connecteurs injectés, qui n'en ont pas
 * besoin, et l'écran DIT que le QR est indisponible. Un bouton qui ne marche pas est pire
 * qu'un bouton absent.
 *
 * CE QUE CE FICHIER NE FAIT PAS. Il ne signe rien et n'ouvre aucune session. La signature reste
 * dans `compte/api.ts`, contre un message que **le serveur rend en entier** — le client ne le
 * reconstruit jamais. Cette règle a coûté cher une fois : une version portait un horodatage
 * rebâti à la vérification, et aucune signature n'aurait jamais pu vérifier.
 */
import { useMemo, type ReactNode } from 'react'
import { WagmiProvider, createConfig, http, useAccount, useSignMessage, useDisconnect } from 'wagmi'
import { base, mainnet } from 'wagmi/chains'
import { injected, walletConnect, coinbaseWallet } from 'wagmi/connectors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, ConnectButton, darkTheme, lightTheme } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'

/** `VITE_WALLETCONNECT_ID` au build. Absent : les portefeuilles injectés seulement. */
const PROJECT_ID = (import.meta.env?.['VITE_WALLETCONNECT_ID'] as string | undefined)?.trim()

/** Vrai quand le QR WalletConnect est réellement disponible. L'écran le dit. */
export const QR_DISPONIBLE = Boolean(PROJECT_ID)

const client = new QueryClient()

const config = createConfig({
  chains: [base, mainnet],
  connectors: [
    // `injected` couvre tout ce qui s'annonce en EIP-6963 : MetaMask, Rainbow, Brave, Frame…
    injected({ shimDisconnect: true }),
    coinbaseWallet({ appName: 'TARE' }),
    ...(PROJECT_ID ? [walletConnect({ projectId: PROJECT_ID, showQrModal: true })] : []),
  ],
  transports: {
    // Aucune clé ici. Ces transports ne servent qu'à wagmi pour connaître la chaîne ; toutes
    // les lectures du produit passent par l'API ou par le corpus embarqué.
    [base.id]: http(),
    [mainnet.id]: http(),
  },
  ssr: false,
})

/**
 * Le fournisseur, posé une fois à la racine.
 *
 * Il ne coûte rien tant que personne ne clique : wagmi n'ouvre aucune connexion de lui-même,
 * et le reste de l'instrument — le verdict, la table, la courbe — continue de vivre sans
 * portefeuille, sans compte et sans une requête.
 */
export function Portefeuilles({ theme, children }: { theme: string; children: ReactNode }) {
  const t = useMemo(
    () =>
      theme === 'light'
        ? lightTheme({ accentColor: '#eb6628', borderRadius: 'none', fontStack: 'system' })
        : darkTheme({ accentColor: '#f6d746', accentColorForeground: '#0b0b0c', borderRadius: 'none', fontStack: 'system' }),
    [theme],
  )
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={client}>
        <RainbowKitProvider theme={t} modalSize="compact" appInfo={{ appName: 'TARE' }}>
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

/** Le bouton officiel de RainbowKit — celui qu'un juge reconnaît au premier coup d'œil. */
export { ConnectButton }

/** Ce que le panneau du compte a besoin de savoir du portefeuille connecté. */
export function usePortefeuille(): {
  adresse: `0x${string}` | undefined
  connecte: boolean
  signer: (message: string) => Promise<string>
  deconnecter: () => void
} {
  const { address, isConnected } = useAccount()
  const { signMessageAsync } = useSignMessage()
  const { disconnect } = useDisconnect()
  return {
    adresse: address,
    connecte: isConnected,
    // Le message vient du serveur, en entier. On ne le reconstruit pas, on le signe.
    signer: (message: string) => signMessageAsync({ message }),
    deconnecter: () => disconnect(),
  }
}
