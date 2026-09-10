/**
 * LE CLIENT DU COMPTE.
 *
 * C'est la seule partie du front qui parle a un serveur et touche a un portefeuille. Deux
 * familles de fautes y coutent quelque chose de reel, et ce sont les deux qu'on teste :
 *
 *   1. AFFIRMER CE QU'ON N'A PAS LU. « pas abonne » quand la lecture a echoue ferait payer
 *      deux fois ; « abonne » parce qu'une transaction est partie ferait croire un service
 *      ouvert qui est ferme. Chaque refus porte donc un GENRE, et l'ecran s'en sert pour
 *      savoir quoi montrer sans lire un message.
 *
 *   2. RECONSTRUIRE LE MESSAGE A SIGNER. Le serveur le rend en entier ; le client le passe
 *      tel quel. Deux reconstructions divergent un jour, et alors aucune signature ne
 *      verifie plus sans qu'un seul message ne le dise — c'est arrive ici, avec un
 *      horodatage.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * LE CODE SEUL, commentaires dechires.
 *
 * Sans ca, ces tests matchent sur les COMMENTAIRES et ne testent rien : le fichier explique
 * pourquoi il n'utilise pas `localStorage`, donc le mot y apparait, donc un test qui cherche
 * `localStorage` dans le fichier entier passe ou echoue pour la mauvaise raison. Trois de
 * ces tests l'ont fait avant cette fonction.
 */
function codeSeul(chemin: string): string {
  return readFileSync(resolve(import.meta.dirname, chemin), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
}

const SRC = codeSeul('../compte/api.ts')
const PANNEAU = codeSeul('../components/Compte.tsx')

test('le message signe vient du serveur, il n_est jamais reconstruit', () => {
  // On lit la source : le seul argument de personal_sign doit etre `n.message`, la valeur
  // rendue par POST /compte/nonce. Toute construction locale d'un texte a signer — un
  // template literal, une concatenation, un horodatage — serait la faute deja commise ici.
  assert.match(SRC, /method:\s*'personal_sign'/)
  assert.match(SRC, /params:\s*\[n\.message,\s*adresse\]/)
  // et l'ordre compte : [message, adresse]. Inverse, MetaMask signe l'adresse comme message.
  assert.equal(SRC.includes('params: [adresse, n.message]'), false)
})

test('aucun texte a signer n_est fabrique dans le client', () => {
  // Les trois signatures d'une reconstruction locale. `nonce:` ne compte PAS : c'est un nom
  // de champ dans le corps JSON envoye au serveur, pas un texte donne a signer — le premier
  // jet de ce test l'interdisait et rougissait sur du code correct.
  for (const interdit of ['Ethereum Signed Message', 'Sign in to', '\\x19', 'toISOString()']) {
    assert.equal(SRC.includes(interdit), false, `« ${interdit} » apparait dans le client`)
  }
  // Et le seul argument de personal_sign reste la valeur rendue par le serveur.
  assert.equal(/params:\s*\[`/.test(SRC), false, 'un template literal alimente personal_sign')
})

test('le paiement d_abonnement ne porte AUCUN calldata', () => {
  // Un selecteur ecrit a la main a ete faux du premier coup : `abonner()` vaut 0x30ff4dce,
  // pas ce qui etait ecrit. Et un mauvais selecteur ne tombe pas sur `receive()` — qui n'est
  // appele que sur un calldata VIDE — il revert. L'utilisateur aurait perdu son gaz.
  assert.match(SRC, /eth_sendTransaction/)
  const bloc = SRC.slice(SRC.indexOf('payerAbonnement'))
  assert.equal(/data:\s*SELECTEUR/.test(bloc), false)
  assert.equal(bloc.includes("'0xd0dcd9e6'"), false)
})

test('les selecteurs de lecture sont les vrais, et ils sont nommes comme verifies', () => {
  // cast sig "prix()" -> 0xc65e9c79 ; cast sig "duree()" -> 0x541a629d. Verifies contre le
  // contrat deploye sur un anvil local : un mauvais selecteur rend `0x`, que le code lirait
  // comme « le contrat n'est pas deploye la ».
  assert.match(SRC, /prix:\s*'0xc65e9c79'/)
  assert.match(SRC, /duree:\s*'0x541a629d'/)
})

test('le jeton ne va PAS dans localStorage', () => {
  // sessionStorage s'efface a la fermeture de l'onglet. Un jeton de session qui survit des
  // semaines dans un navigateur partage est une porte ouverte que personne ne se rappelle.
  assert.equal(SRC.includes('localStorage'), false)
  assert.match(SRC, /sessionStorage/)
})

test('la cle d_API n_est jamais envoyee par le site', () => {
  // Deux authentifications, jamais melangees : le site utilise le jeton de session, la cle
  // appartient a une machine. Un site qui enverrait `x-tare-cle` melangerait les deux.
  assert.equal(SRC.includes("'x-tare-cle'"), false)
  assert.match(SRC, /authorization.*Bearer/)
})

test('chaque statut HTTP a un GENRE de refus, et aucun ne devient une valeur', () => {
  for (const [statut, genre] of [
    ['401', 'non_authentifie'],
    ['402', 'abonnement_inactif'],
    ['503', 'indisponible'],
  ] as const) {
    assert.match(SRC, new RegExp(`res\\.status === ${statut}`), statut)
    assert.match(SRC, new RegExp(`'${genre}'`), genre)
  }
  // et un genre pour « il n'y a pas d'API », qui n'est pas une panne
  assert.match(SRC, /'api_absente'/)
})

test('la detection des portefeuilles passe par EIP-6963, window.ethereum n_est qu_un repli', () => {
  // Avec deux portefeuilles installes, window.ethereum n'en montre qu'un et cache l'autre.
  const i6963 = SRC.indexOf('eip6963:announceProvider')
  const iWin = SRC.indexOf('window as unknown as { ethereum')
  assert.ok(i6963 > 0, 'EIP-6963 absent')
  assert.ok(iWin > i6963, 'window.ethereum doit etre le repli, apres les annonces')
  // La chaine porte une apostrophe echappee dans la source : n\'annonce.
  assert.match(SRC, /annonce pas EIP-6963/)
})

test('un appel borne son attente : un ecran qui tourne pour toujours est un silence', () => {
  assert.match(SRC, /AbortSignal\.timeout\(DELAI_MS\)/)
  assert.match(SRC, /TimeoutError/)
})

test('le panneau ne dit jamais « abonne » parce qu_une transaction est partie', () => {
  // Apres payerAbonnement, l'ecran doit renvoyer a la RELECTURE, pas conclure. On lit ici
  // le fichier ENTIER : la phrase rendue a l'utilisateur est une chaine, pas un commentaire.
  const panneau = readFileSync(resolve(import.meta.dirname, '../components/Compte.tsx'), 'utf8')
  const apres = panneau.slice(panneau.indexOf('const payer ='), panneau.indexOf('const relire ='))
  assert.match(apres, /n'est pas encore incluse/)
  assert.match(apres, /relire l'abonnement/)
  // et il ne pose pas l'abonnement a actif de sa propre initiative
  assert.equal(/setCompte\([^)]*actif:\s*true/.test(PANNEAU), false)
})

test('un 402 sur la relecture n_est pas traite comme une panne', () => {
  // « toujours pas abonne » est une REPONSE du contrat, pas une erreur du service.
  assert.match(PANNEAU, /e\.genre === 'abonnement_inactif'/)
})

test('un prelevement absent s_affiche « non lu », jamais 0', () => {
  assert.match(PANNEAU, /bps === null \? <NonLu/)
  // et un bps de 0 reste 0 : c'est une mesure, pas une absence
  assert.match(PANNEAU, /typeof d\['bps'\] === 'number'/)
})
