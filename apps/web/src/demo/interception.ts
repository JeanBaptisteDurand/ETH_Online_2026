/**
 * LA GARDE POSEE SUR LE FOURNISSEUR — la vraie, pas une mise en scene.
 *
 * C'est la piece qui fait tout le produit, et c'est celle qu'une demonstration ne peut pas se
 * permettre de simuler : montrer une interception simulee dans une demonstration dont le sujet
 * EST l'interception serait la faute la plus chere possible. Ce module appelle donc
 * `envelopperProvider` de packages/guard/src/injection.ts, telle quelle, sur le fournisseur
 * reellement injecte par le portefeuille.
 *
 * CE QUE L'ENVELOPPE FAIT, et rien d'autre : elle arrete `eth_sendTransaction`. `eth_call`,
 * `eth_accounts`, `personal_sign`, `wallet_switchEthereumChain` passent sans etre touches. Une
 * garde qui se met en travers de tout finit desinstallee.
 *
 * LE COMPTEUR EXISTE POUR QU'ON PUISSE LE VERIFIER. Entre la garde et le portefeuille, on
 * glisse une coquille qui COMPTE les `eth_sendTransaction` reellement parvenus au portefeuille.
 * C'est ce compte, affiche a l'ecran, qui prouve la promesse centrale : sur un refus, la
 * fenetre du portefeuille ne s'est jamais ouverte. Une promesse invisible n'est pas une preuve.
 *
 * ET LA GARDE NE REECRIT RIEN. Sur approbation, c'est la transaction D'ORIGINE qui part. La
 * porte de remplacement est un SECOND appel, delibere — c'est la regle dure n.4 de
 * packages/guard/src/alternative.ts, tenue jusqu'a l'ecran.
 */
import { envelopperProvider, tareGuard } from './garde.mjs'
import type { Approver, Eip1193Provider, GuardReport, GuardTable, TxRequest } from './garde.mjs'

/** Ce qui a REELLEMENT atteint le portefeuille. Lu par l'ecran, jamais suppose. */
export interface Surveillance {
  /** combien de fois `eth_sendTransaction` est parvenu au portefeuille */
  ouvertures: number
  /** la derniere transaction parvenue, pour qu'on puisse la comparer a ce qu'on croit envoyer */
  derniere: TxRequest | null
}

export interface Poste {
  /** le fournisseur A UTILISER : la garde est dessus */
  fournisseur: Eip1193Provider
  surveillance: Surveillance
}

/**
 * Pose la garde sur un fournisseur.
 *
 * `askOn` est laisse a l'appelant parce que c'est un CHOIX qui se declare a l'ecran : le defaut
 * du paquet ne demande que sur `warn` et `block`, et le prelevement de la demonstration tombe
 * sous le seuil `warn`. Une page qui demanderait sur tout sans le dire laisserait croire que
 * l'extension arrete ce swap-la par defaut, ce qui est faux.
 */
export function poserLaGarde(
  brut: Eip1193Provider,
  args: {
    table: GuardTable
    routeur: string
    atBlock?: number | null
    approver: Approver
    askOn: ('ok' | 'warn' | 'block')[]
    onReport: (r: GuardReport, tx: TxRequest) => void
  },
): Poste {
  const surveillance: Surveillance = { ouvertures: 0, derniere: null }

  // LA COQUILLE QUI COMPTE. Elle est posee SOUS la garde : ce qu'elle voit est ce que le
  // portefeuille voit, et rien de plus. On n'ecrit pas dans l'objet du portefeuille — on en
  // enveloppe une copie, pour ne pas laisser de trace dans MetaMask apres la demonstration.
  const compte: Eip1193Provider = {
    request(a: { method: string; params?: unknown[] | object }) {
      if (a?.method === 'eth_sendTransaction') {
        surveillance.ouvertures += 1
        surveillance.derniere = Array.isArray(a.params) ? ((a.params[0] ?? null) as TxRequest | null) : null
      }
      return brut.request(a)
    },
    on: brut.on ? (e, cb) => brut.on!(e, cb) : undefined,
    removeListener: brut.removeListener ? (e, cb) => brut.removeListener!(e, cb) : undefined,
  }

  const fournisseur = envelopperProvider(compte, {
    // La table vient du corpus deja embarque (voir ./table.ts) : data/table.json pese 21 Mo et
    // n'entre jamais dans ce bundle.
    consulter: (tx: TxRequest) =>
      Promise.resolve(
        tareGuard(tx, { table: args.table, routers: [args.routeur], atBlock: args.atBlock ?? null }),
      ),
    approver: args.approver,
    askOn: args.askOn,
    onReport: args.onReport,
  })

  return { fournisseur, surveillance }
}
