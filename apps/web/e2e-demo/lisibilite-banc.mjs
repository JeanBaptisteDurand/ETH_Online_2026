/**
 * LE BANC HORS LIGNE — les etats de la page, captures a 1440x900 sans toucher a l'appareil partage.
 *
 * Il sert a comparer la page a la maquette du designer, etat par etat, et a verifier qu'aucun etat
 * ne defile. Les services sont simules, mais au plus pres du pont publie :
 *   - l'ecran de l'appareil est un VRAI PNG 128x64 capture sur Speculos, pas un 1x1 ;
 *   - /demo/choisir rend 202, et /demo/choix rend la suite d'avancements que le banc fait avancer
 *     question par question, comme l'humain le ferait sur le Ledger ;
 *   - le portefeuille peut RETENIR sa reponse, pour capturer l'instant ou il s'ouvre.
 *
 *   node lisibilite-banc.mjs <url> <dossier>        ex. node lisibilite-banc.mjs http://localhost:4181 /tmp/captures
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const BASE = process.argv[2] ?? 'http://localhost:4181'
const DOSSIER = resolve(process.argv[3] ?? resolve(ICI, 'captures/lisibilite/banc'))
mkdirSync(DOSSIER, { recursive: true })
const F = JSON.parse(readFileSync(resolve(ICI, 'fixtures.json'), 'utf8'))
const PNG = readFileSync(process.env.ECRAN_PNG ?? resolve(ICI, 'captures/lisibilite/ecran-128x64.png'))
const HASH = '0x' + '9b'.repeat(32)
const DIGEST_1 = '0x1a2b3c4d5e' + '0'.repeat(46) + '6f7a8b9c'
const DIGEST_2 = '0xe02b34caeb' + '1'.repeat(46) + '65f903f3'

const OPTIONS = [
  { rang: 1, option: 'actuelle', libelle: `keep your route · take ${F.substitution.porte.bps} bps` },
  { rang: 2, option: 'optimisee', libelle: `take the cheaper gate · take ${F.substitution.meilleure_porte.bps} bps` },
  { rang: 3, option: 'annuler', libelle: 'cancel · nothing is sent' },
]

/** L'etat que le banc fait avancer ; les routes simulees le rendent tel quel. */
const scene = {
  ecran: 'Ethereum app is ready',
  choisir503: false,
  progres: null,
}
const question = (rang, option, digest, etapes = [], depuis = 4000) => ({
  id: 't1',
  en_cours: true,
  rang,
  option,
  depuis_ms: depuis,
  digest_en_cours: digest,
  options: OPTIONS,
  etapes,
  resultat: null,
  erreur: null,
})
const rejetee = (rang, option, digest) => ({ rang, option, issue: 'rejetee', prompt_digest: digest, ecrans: 16 })
const fin = (choix, raison, digest, etapes) => ({
  id: 't1',
  en_cours: false,
  rang: null,
  option: null,
  depuis_ms: null,
  digest_en_cours: null,
  options: OPTIONS,
  etapes,
  resultat: { choix, raison, signature: choix === 'annuler' ? null : '0x' + '11'.repeat(65), prompt_digest: digest },
  erreur: null,
})

const json = (r, body, status = 200) => r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function brancher(page) {
  await page.addInitScript(({ hash }) => {
    let recuPret = 0
    let lacher = null
    window.__retenir = false
    window.__lacher = () => lacher?.()
    window.__envois = []
    window.ethereum = {
      isMetaMask: true,
      async request({ method, params }) {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return ['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266']
          case 'wallet_addEthereumChain':
          case 'wallet_switchEthereumChain':
            return null
          case 'eth_sendTransaction':
            window.__envois.push(params?.[0] ?? null)
            if (window.__retenir) await new Promise((r) => (lacher = r))
            return hash
          case 'eth_getTransactionReceipt':
            recuPret += 1
            return recuPret < 2 ? null : { transactionHash: hash, blockNumber: '0x3044ef1', status: '0x1' }
          default:
            return null
        }
      },
      on() {},
      removeListener() {},
    }
  }, { hash: HASH })
  await page.route('**/demo.tare-hooks.tech/demo/etat', (r) =>
    json(r, {
      fork: { chain_id: 8453, block_number: 50614000, rpc: 'https://tare-hooks.tech/rpc' },
      speculos: { joignable: true, ecran: scene.ecran, api: 'http://127.0.0.1:5010', chemin: "44'/60'/0'/0/0", occupe: null },
      snapshot: '0x1',
      corpus: F.corpus,
      divergences: [{ acte: 'stop', champ: 'pool_id', annonce: '0x010d', corpus: F.stop.porte.pool_id, consequence: 'x' }],
    }),
  )
  await page.route('**/demo.tare-hooks.tech/demo/preparer', (r) => {
    const corps = JSON.parse(r.request().postData() ?? '{}')
    const base = { snapshot: '0x1', soldes: { eth_wei: '100000000000000000000', usdc: '0' }, prompt_digest: DIGEST_1, tolerance_bps: 50 }
    if (corps.acte === 'stop')
      return json(r, { ...base, transaction: F.stop.transaction, porte: F.stop.porte, acte: 'stop', etat_transaction: 'PRETE', etat_alternative: 'PORTE_UNIQUE', meilleure_porte: null, economie_bps: null, transaction_remplacement: null, cotation: null, plancher: null })
    return json(r, {
      ...base,
      transaction: F.substitution.transaction,
      porte: F.substitution.porte,
      acte: 'substitution',
      etat_transaction: 'PRETE',
      etat_alternative: 'MEILLEURE_PORTE',
      meilleure_porte: F.substitution.meilleure_porte,
      economie_bps: F.substitution.economie_bps,
      transaction_remplacement: F.substitution.transaction_remplacement,
      cotation: '2444',
      plancher: '2431',
      echeance: '1789999999',
    })
  })
  await page.route('**/demo.tare-hooks.tech/demo/choisir', (r) =>
    scene.choisir503
      ? json(r, { erreur: 'speculos_injoignable', motif: 'The device does not answer. Nothing was sent.' }, 503)
      : json(r, { ok: true, id: 't1', options: OPTIONS }, 202),
  )
  await page.route('**/demo.tare-hooks.tech/demo/choix', (r) => json(r, scene.progres ?? question(1, 'actuelle', DIGEST_1)))
  await page.route('**/demo.tare-hooks.tech/demo/choix/abandonner', (r) => json(r, { ok: true, abandonne: true }))
  await page.route('**/demo.tare-hooks.tech/demo/revenir', (r) => json(r, { ok: true, block_number: 50614000, snapshot: '0x2' }))
  await page.route('**/demo.tare-hooks.tech/demo/soldes**', (r) => json(r, { eth_wei: '99999999000000000000', usdc: '2444' }))
  await page.route('**/speculos.tare-hooks.tech/screenshot**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  await page.route('**/speculos.tare-hooks.tech/button/**', (r) => json(r, { ok: true }))
}

async function capturer(page, nom) {
  await page.waitForTimeout(900)
  const m = await page.evaluate(() => ({
    hauteur: document.documentElement.scrollHeight,
    largeur: document.documentElement.scrollWidth,
    vh: window.innerHeight,
    vw: window.innerWidth,
  }))
  const deborde = m.hauteur > m.vh || m.largeur > m.vw
  console.log(`[${nom}] ${m.largeur}x${m.hauteur} pour ${m.vw}x${m.vh} ${deborde ? '>>> DEBORDE' : 'OK'}`)
  await page.screenshot({ path: resolve(DOSSIER, `${nom}.png`) })
}

const nav = await chromium.launch()
const erreurs = []
async function nouvellePage() {
  const ctx = await nav.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => erreurs.push(`pageerror ${e.message}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(`console ${m.text().slice(0, 160)}`)
  })
  await brancher(page)
  await page.goto(`${BASE}/#/demo`)
  await page.getByRole('button', { name: /^swap / }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(1600)
  return { ctx, page }
}

/* 1. au repos */
{
  const { ctx, page } = await nouvellePage()
  await capturer(page, 'nous-1-repos')

  /* 2. l'appareil pose la question 1 */
  scene.ecran = 'choice 1 of 3'
  scene.progres = question(1, 'actuelle', DIGEST_1, [], 9000)
  await page.getByRole('button', { name: /^swap / }).click()
  await page.waitForTimeout(1800)
  await capturer(page, 'nous-2-question-1')

  /* 3. question 1 refusee, l'appareil pose la question 2 */
  scene.ecran = 'take 0 bps'
  scene.progres = question(2, 'optimisee', DIGEST_2, [rejetee(1, 'actuelle', DIGEST_1)], 3000)
  await page.waitForTimeout(1200)
  await capturer(page, 'nous-3-question-2')

  /* 4a. signee sur l'appareil : le portefeuille s'ouvre, et le banc le retient */
  await page.evaluate(() => (window.__retenir = true))
  scene.ecran = 'Ethereum app is ready'
  scene.progres = fin('optimisee', 'signed on the device', DIGEST_2, [rejetee(1, 'actuelle', DIGEST_1), { rang: 2, option: 'optimisee', issue: 'approuvee', prompt_digest: DIGEST_2, ecrans: 15 }])
  await page.waitForTimeout(1500)
  await capturer(page, 'nous-4a-portefeuille')

  /* 4b. le portefeuille signe : le remplacement part, le recu revient */
  await page.evaluate(() => window.__lacher())
  await page.locator('text=/status 0x1/').first().waitFor({ timeout: 20_000 })
  await capturer(page, 'nous-4b-recu')
  const envois = await page.evaluate(() => window.__envois)
  console.log(`[4b] envois au portefeuille : ${envois.length} · data = remplacement ? ${envois[envois.length - 1]?.data === F.substitution.transaction_remplacement.data}`)
  await ctx.close()
}

/* 4c. deux refus sur l'appareil : rien ne part */
{
  scene.progres = null
  scene.ecran = 'Ethereum app is ready'
  const { ctx, page } = await nouvellePage()
  scene.progres = question(1, 'actuelle', DIGEST_1)
  await page.getByRole('button', { name: /^swap / }).click()
  await page.waitForTimeout(1200)
  scene.progres = fin('annuler', 'rejected twice on the device', DIGEST_2, [rejetee(1, 'actuelle', DIGEST_1), rejetee(2, 'optimisee', DIGEST_2)])
  await page.locator('text=/nothing leaves/').first().waitFor({ timeout: 20_000 })
  await capturer(page, 'nous-4c-refus')
  const envois = await page.evaluate(() => window.__envois)
  console.log(`[4c] envois au portefeuille : ${envois.length}`)
  await ctx.close()
}

/* 5. l'appareil ne repond pas : le secours */
{
  scene.progres = null
  scene.choisir503 = true
  const { ctx, page } = await nouvellePage()
  await page.getByRole('button', { name: /^swap / }).click()
  await page.getByText(/device unavailable — deciding on the page/).waitFor({ timeout: 20_000 })
  await page.waitForTimeout(1500)
  await capturer(page, 'nous-5-secours')
  await ctx.close()
}

console.log(`erreurs : ${erreurs.length}`)
for (const e of erreurs) console.log(`   ${e}`)
await nav.close()
