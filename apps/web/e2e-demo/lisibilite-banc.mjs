/**
 * LE BANC HORS LIGNE — mesurer les quatre phases sans toucher a l'appareil partage.
 *
 * Il ne remplace PAS le parcours reel (lisibilite-live.mjs) : il sert a iterer sur la mise en
 * page. Trois choses le rendent plus fidele que demo.spec.ts :
 *   - l'ecran de l'appareil est un VRAI PNG 128x64 capture sur Speculos, pas un 1x1 ;
 *   - /demo/approuver rend `ecrans` en LISTE, comme le pont publie (le contrat dit un nombre) ;
 *   - le texte relu de l'appareil change en phase 3, comme en vrai.
 *
 *   node lisibilite-banc.mjs http://localhost:5191 nom [largeur hauteur]
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const BASE = process.argv[2] ?? 'http://localhost:5191'
const NOM = process.argv[3] ?? 'banc'
const W = Number(process.argv[4] ?? 1440)
const H = Number(process.argv[5] ?? 900)
const DOSSIER = resolve(ICI, 'captures/lisibilite', NOM)
mkdirSync(DOSSIER, { recursive: true })
const F = JSON.parse(readFileSync(resolve(ICI, 'fixtures.json'), 'utf8'))
const PNG = readFileSync(process.env.ECRAN_PNG ?? resolve(ICI, 'captures/lisibilite/ecran-128x64.png'))
const HASH = '0x' + '9b'.repeat(32)
const DIGEST = '0xe02b34caeb' + '0'.repeat(46) + '65f903f3'

let ecranTexte = 'Ethereum app is ready'
let libererApprobation = null

const ETAT = () => ({
  fork: { chain_id: 8453, block_number: 50614000, rpc: 'https://tare-hooks.tech/rpc' },
  speculos: { joignable: true, ecran: ecranTexte, api: 'http://127.0.0.1:5010', chemin: "44'/60'/0'/0/0", occupe: null },
  snapshot: '0x1',
  corpus: F.corpus,
  divergences: [
    { acte: 'stop', champ: 'pool_id', annonce: '0x010d', corpus: F.stop.porte.pool_id, consequence: 'x' },
  ],
})

const json = (r, body, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

async function brancher(page) {
  await page.addInitScript(({ hash }) => {
    let recuPret = 0
    const provider = {
      isMetaMask: true,
      async request({ method }) {
        switch (method) {
          case 'eth_requestAccounts':
          case 'eth_accounts':
            return ['0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266']
          case 'wallet_addEthereumChain':
          case 'wallet_switchEthereumChain':
            return null
          case 'eth_sendTransaction':
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
    window.ethereum = provider
  }, { hash: HASH })
  await page.route('**/demo.tare-hooks.tech/demo/etat', (r) => json(r, ETAT()))
  await page.route('**/demo.tare-hooks.tech/demo/preparer', async (r) => {
    const corps = JSON.parse(r.request().postData() ?? '{}')
    const base = { snapshot: '0x1', soldes: { eth_wei: '100000000000000000000', usdc: '0' }, prompt_digest: DIGEST, tolerance_bps: 50 }
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
  // L'APPROBATION ATTEND LE BANC, puis rend `ecrans` EN LISTE — la forme du pont publie.
  await page.route('**/demo.tare-hooks.tech/demo/approuver', async (r) => {
    await new Promise((res) => {
      libererApprobation = res
    })
    return json(r, {
      signature: '0x' + '11'.repeat(65),
      ecrans: Array.from({ length: 40 }, (_, i) => `Press right button to continue message ${i}`),
      source: 'corpus',
      primaryType: 'TareGuardBrief',
    })
  })
  await page.route('**/demo.tare-hooks.tech/demo/revenir', (r) => json(r, { ok: true, block_number: 50614000, snapshot: '0x2' }))
  await page.route('**/demo.tare-hooks.tech/demo/soldes**', (r) => json(r, { eth_wei: '99999999000000000000', usdc: '2444' }))
  await page.route('**/speculos.tare-hooks.tech/screenshot**', (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  await page.route('**/speculos.tare-hooks.tech/button/**', (r) => json(r, { ok: true }))
}

async function mesurer(page, nom) {
  await page.waitForTimeout(700)
  const m = await page.evaluate(() => {
    const scene = document.querySelector('.demo-scene')
    const blocs = scene
      ? Array.from(scene.children).map((el) => {
          const r = el.getBoundingClientRect()
          return `${Math.round(r.top)}+${Math.round(r.height)} ${(el.className || el.tagName).toString().slice(0, 28)}`
        })
      : []
    let petits = 0
    let importantsPetits = []
    document.querySelectorAll('.demo-scene *').forEach((el) => {
      const direct = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('')
      if (!direct) return
      const r = el.getBoundingClientRect()
      if (r.width === 0) return
      const px = parseFloat(getComputedStyle(el).fontSize)
      if (px < 12) {
        petits += 1
        importantsPetits.push(`${px}px « ${direct.slice(0, 40)} »`)
      }
    })
    return {
      scroll: document.documentElement.scrollHeight,
      sw: document.documentElement.scrollWidth,
      iw: window.innerWidth,
      ih: window.innerHeight,
      blocs,
      sous12: petits,
      exemples: importantsPetits.slice(0, 8),
    }
  })
  const deborde = m.scroll > m.ih
  console.log(`[${nom}] hauteur ${m.scroll}/${m.ih} ${deborde ? `DEPASSE DE ${m.scroll - m.ih}` : 'OK'} · largeur ${m.sw}/${m.iw} · sous 12px: ${m.sous12}`)
  for (const b of m.blocs) console.log(`     ${b}`)
  for (const e of m.exemples) console.log(`     <12 ${e}`)
  await page.screenshot({ path: resolve(DOSSIER, `${nom}.png`), fullPage: true })
  return m
}

const nav = await chromium.launch()
const ctx = await nav.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const erreurs = []
page.on('pageerror', (e) => erreurs.push(`pageerror ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) erreurs.push(`console ${m.text().slice(0, 160)}`)
})
await brancher(page)
await page.goto(`${BASE}/#/demo`)
await page.getByRole('button', { name: /^swap / }).waitFor({ timeout: 30_000 })
await page.waitForTimeout(1200)
const res = {}
res.p1 = await mesurer(page, '1-repos')

await page.getByRole('button', { name: /^swap / }).click()
await page.getByRole('button', { name: /take the other gate/ }).waitFor()
await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => /take the other gate/.test(b.textContent || '') && !b.disabled))
res.p2 = await mesurer(page, '2-choix')

// le choix au CLAVIER : la touche 3
await page.keyboard.press('3')
await page.locator('text=/the plan is on the device/').first().waitFor({ timeout: 10_000 })
ecranTexte = 'summary Takes 4.0933 bps. Best gate: 0.0000.'
await page.waitForTimeout(1500)
// espace = next : on verifie qu'il appuie sur l'appareil
let appuis = 0
page.on('request', (r) => {
  if (r.url().includes('/button/right')) appuis += 1
})
await page.keyboard.press(' ')
await page.waitForTimeout(600)
console.log(`[clavier] espace en phase 3 -> ${appuis} appui(s) droit(s) envoye(s)`)
res.p3 = await mesurer(page, '3-appareil')

libererApprobation?.()
await page.locator('text=/received/').first().waitFor({ timeout: 20_000 })
await page.waitForTimeout(2500)
res.p4 = await mesurer(page, '4-fini')
console.log(`erreurs: ${erreurs.length}`)
for (const e of erreurs) console.log(`   ${e}`)
writeFileSync(resolve(DOSSIER, 'mesures.json'), JSON.stringify(res, null, 2))
await nav.close()
