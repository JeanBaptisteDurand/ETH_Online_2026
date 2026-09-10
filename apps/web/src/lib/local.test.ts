/**
 * « Y a-t-il quelque chose a joindre ? »
 *
 * Ce que ce test protege : sur l'URL publique, un visiteur ne doit pas lire
 * « 127.0.0.1:8787 injoignable ». Ce message-la se lit comme « ce site est casse », alors
 * que la verite est « aucune API n'est publiee pour cette version » — et tout le reste de
 * l'ecran, verdict compris, vient du paquet et ne demande aucun serveur.
 *
 * Et le cas inverse, aussi important : sur un poste de developpeur, la garde ne doit PAS se
 * declencher, sinon les encarts refuseraient de lire un serveur qui tourne juste a cote.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estAdresseLocale, estHoteLocal, rienAJoindre } from './local.ts'

const REPLI = 'http://127.0.0.1:8787'

test('les hotes ou 127.0.0.1 a une chance de repondre', () => {
  for (const h of ['localhost', '127.0.0.1', '::1', '[::1]', '', 'macbook.local'])
    assert.equal(estHoteLocal(h), true, h)
  for (const h of ['jeanbaptistedurand.github.io', 'tare.exemple.fr', '1.2.3.4', 'localhost.evil.com'])
    assert.equal(estHoteLocal(h), false, h)
})

test('une adresse locale est reconnue quel que soit son port ou son chemin', () => {
  assert.equal(estAdresseLocale('http://127.0.0.1:8787'), true)
  assert.equal(estAdresseLocale('http://localhost:8788/assistant'), true)
  assert.equal(estAdresseLocale('https://api.exemple.fr'), false)
  assert.equal(estAdresseLocale('pas une url'), false)
})

test('page PUBLIQUE + repli local + rien au build : il n_y a rien a joindre', () => {
  assert.equal(
    rienAJoindre({ base: REPLI, donneeAuBuild: false, hostname: 'jeanbaptistedurand.github.io' }),
    true,
  )
})

test('page LOCALE : la garde ne se declenche pas, le serveur d_a-cote doit etre lu', () => {
  for (const h of ['localhost', '127.0.0.1', '', 'macbook.local'])
    assert.equal(rienAJoindre({ base: REPLI, donneeAuBuild: false, hostname: h }), false, h)
})

test('une API DONNEE au build est toujours essayee, meme locale', () => {
  // C'est le choix de l'exploitant, pas un oubli : un tunnel, un proxy local, une machine
  // de demonstration derriere un nom qui resout en 127.0.0.1.
  assert.equal(
    rienAJoindre({ base: REPLI, donneeAuBuild: true, hostname: 'tare.exemple.fr' }),
    false,
  )
})

test('une API publique sur une page publique est evidemment essayee', () => {
  assert.equal(
    rienAJoindre({ base: 'https://api.exemple.fr', donneeAuBuild: true, hostname: 'exemple.fr' }),
    false,
  )
  // et meme si personne ne l'a donnee au build : elle n'est pas locale, donc joignable
  assert.equal(
    rienAJoindre({ base: 'https://api.exemple.fr', donneeAuBuild: false, hostname: 'exemple.fr' }),
    false,
  )
})

test('le workflow de publication passe bien les deux variables', async () => {
  // Sans elles, le paquet publie porte 127.0.0.1 en dur et la garde ci-dessus se declenche
  // partout : le site serait honnete mais muet. Ce test lit le workflow pour que retirer les
  // deux lignes ne passe pas inapercu.
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const wf = readFileSync(resolve(import.meta.dirname, '../../../../.github/workflows/pages.yml'), 'utf8')
  assert.match(wf, /VITE_TARE_API:\s*\$\{\{\s*env\.VITE_TARE_API\s*\}\}/)
  assert.match(wf, /VITE_ASSISTANT_URL:\s*\$\{\{\s*env\.VITE_ASSISTANT_URL\s*\}\}/)
  assert.match(wf, /vars\.TARE_API/)
  assert.match(wf, /vars\.ASSISTANT_URL/)
})
