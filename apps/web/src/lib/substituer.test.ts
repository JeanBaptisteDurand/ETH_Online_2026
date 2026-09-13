/**
 * LE PANNEAU DE SUBSTITUTION, et la seule chose qui peut y couter de l'argent : un bouton
 * actif quand il ne devrait pas l'etre.
 *
 * `POST /alternative` rend dix etats d'envoi. UN SEUL autorise a envoyer : `PRET`. Les neuf
 * autres disent ce qui manque — un plancher de sortie, une approbation, une signature, un
 * nonce non lu. Envoyer sur l'un d'eux revert au mieux, part sans protection de prix au
 * pire.
 *
 * Ces tests lisent la source parce que c'est la seule facon de verifier une garde d'interface
 * sans monter React et un faux portefeuille pour chacun des dix etats.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { AFFICHAGE, SUITE } from '../compte/substitution.ts'

const lire = (p: string) => readFileSync(resolve(import.meta.dirname, p), 'utf8')
const PANNEAU = lire('../components/Substituer.tsx')
const CLIENT = lire('../compte/substitution.ts')

test('le bouton d_envoi n_est actif que sur PRET', () => {
  // La garde exacte. Un `env.etat !== 'PAS_DE_PROPOSITION'` par exemple laisserait passer
  // SANS_PLANCHER — une transaction signable a n'importe quel prix.
  assert.match(PANNEAU, /actif=\{env\.etat === 'PRET' && Boolean\(fournisseur\) && !occupe\}/)
})

test('les dix etats d_envoi ont chacun leur texte, et aucun n_est oublie', () => {
  const attendus = [
    'PRET',
    'PAS_DE_PROPOSITION',
    'NON_DEMANDE',
    'SANS_PLANCHER',
    'APPROBATION_REQUISE',
    'SIGNATURE_REQUISE',
    'NONCE_NON_LU',
    'ETAT_PERMIT2_INCONNU',
    'PERMIT_SUR_MONNAIE_NATIVE',
    'RELECTURE_DIVERGENTE',
  ]
  assert.deepEqual(Object.keys(SUITE).sort(), [...attendus].sort())
  // Et seuls ceux qui MENENT quelque part portent une action.
  const avecAction = Object.entries(SUITE).filter(([, v]) => v !== null).map(([k]) => k)
  assert.deepEqual(avecAction.sort(), ['APPROBATION_REQUISE', 'NON_DEMANDE', 'PRET', 'SIGNATURE_REQUISE'])
})

test('les six etats de comparaison ont chacun leur texte', () => {
  assert.deepEqual(Object.keys(AFFICHAGE).sort(), [
    'ACTUELLE_NON_MESUREE',
    'AUTRES_NON_MESUREES',
    'DEJA_LA_MEILLEURE',
    'MEILLEURE_PORTE',
    'POOL_INCONNU',
    'PORTE_UNIQUE',
  ])
  // UN SEUL propose de construire. « il n'y a qu'une porte » est une reponse, pas un echec.
  const proposent = Object.entries(AFFICHAGE).filter(([, v]) => v.action !== null).map(([k]) => k)
  assert.deepEqual(proposent, ['MEILLEURE_PORTE'])
  // et PORTE_UNIQUE n'est pas presente comme un probleme
  assert.equal(AFFICHAGE.PORTE_UNIQUE.ton, 'neutre')
  assert.match(AFFICHAGE.PORTE_UNIQUE.titre, /qu'une porte/)
})

test('le panneau n_envoie jamais tout seul : chaque envoi part d_un clic', () => {
  // eth_sendTransaction ne doit apparaitre que dans des gestionnaires de clic, jamais dans
  // un useEffect qui partirait au chargement.
  const envois = [...PANNEAU.matchAll(/eth_sendTransaction/g)].length
  assert.equal(envois, 2, 'deux envois attendus : le swap et l\'approbation')
  const effets = PANNEAU.slice(PANNEAU.indexOf('useEffect'), PANNEAU.indexOf('const demander'))
  assert.equal(effets.includes('eth_sendTransaction'), false)
})

test('« comparer » ne demande AUCUNE adresse : la comparaison ne depend de personne', () => {
  const bloc = PANNEAU.slice(PANNEAU.indexOf('const demander'), PANNEAU.indexOf('const envoyer'))
  // eth_requestAccounts n'est appele que si `construire` est vrai.
  assert.match(bloc, /if \(construire && fournisseur\)/)
})

test('le panneau n_invente aucune phrase : les raisons du serveur sont affichees telles quelles', () => {
  assert.match(PANNEAU, /\{alt\.raison\}/)
  assert.match(PANNEAU, /\{env\.raison\}/)
  // et il ne reecrit pas un etat en message maison
  assert.equal(/raison\.replace\(/.test(PANNEAU), false)
})

test('un refus de signature est presente comme une reponse, pas comme une panne', () => {
  // L ecran est en anglais : « That is an answer, not a failure. »
  assert.match(PANNEAU, /an answer, not a failure/)
  assert.match(PANNEAU, /err\.code === 4001/)
})

test('« envoyee » n_est jamais presente comme « incluse »', () => {
  assert.match(PANNEAU, /Sent is not included/)
  // et le panneau ne pretend pas suivre le sort de la transaction
  assert.match(PANNEAU, /will not follow its fate/)
})

test('le compte des appels RPC est AFFICHE : la promesse doit etre verifiable', () => {
  // « la comparaison ne coute aucune requete » n'est credible que si le compte est a l'ecran.
  assert.match(PANNEAU, /RPC call\(s\)/)
  assert.match(CLIENT, /appels_rpc: number/)
})

test('le client ne rejuge rien : aucun seuil, aucun calcul de bps', () => {
  // Les deux jugements — « meilleure porte » et « envoyable » — viennent du serveur, qui les
  // prend sur la table des 125 072 mesures. Une seconde version divergerait.
  for (const interdit of ['ECONOMIE_MIN', 'out_without', 'Math.abs', '10000n']) {
    assert.equal(CLIENT.includes(interdit), false, `« ${interdit} » : le client rejuge`)
  }
})

test('les couples proposes sont CALCULES depuis le corpus, jamais ecrits', () => {
  // Une liste ecrite deviendrait fausse au prochain balayage, en silence.
  assert.match(PANNEAU, /function couplesInteressants/)
  assert.match(PANNEAU, /dataset\.rows/)
  // et le calcul compare le meme echange : memes deux monnaies, meme sens, meme taille
  assert.match(PANNEAU, /\$\{entree\}\|\$\{sortie\}\|\$\{r\.amount_in\}/)
  // avec l'etiquette FRANCAISE du corpus du front, pas celle de l'API
  assert.match(PANNEAU, /r\.label !== 'MESURE'/)
})
