/**
 * LA PAGE #/demo, DE BOUT EN BOUT.
 *
 * Ce que ces tests tiennent, dans l'ordre du cahier des charges :
 *
 *   1. acte 1 — le hook, le pool et les 9 999.53 bps sont a l'ecran ; AUCUNE alternative n'est
 *      proposee ; un refus met la page en « 4001, rien n'est parti » et RIEN n'a ete envoye au
 *      fournisseur injecte ;
 *   2. acte 2 — la porte actuelle a 4.0933 bps, la porte proposee a 0, le remplacement est
 *      construit, et `eth_sendTransaction` n'est appele qu'au clic, avec le `to` et le `data`
 *      rendus par le pont ;
 *   3. pont injoignable — refus motive, page vivante, pas d'exception ;
 *   4. /screenshot en echec — « device screen unavailable », et jamais une image rejouee ;
 *   5. aucun debordement horizontal a 390 px, et la page tient dans 1440x900 ;
 *   6. zero erreur console sur tout le parcours.
 *
 * AUCUN SERVICE DISTANT N'EST APPELE. `demo.tare-hooks.tech` et `speculos.tare-hooks.tech` sont
 * interceptes ; leurs reponses viennent de fixtures.json, genere depuis le corpus embarque.
 */
import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const F = JSON.parse(readFileSync(resolve(ICI, 'fixtures.json'), 'utf8')) as {
  corpus: Record<string, unknown>
  stop: { porte: Porte; transaction: Tx }
  substitution: {
    porte: Porte
    meilleure_porte: Porte
    economie_bps: number
    transaction: Tx
    transaction_remplacement: Tx
  }
}
type Tx = { to: string; data: string; value: string }
type Porte = { pool_id: string; hook: string; bps: number | null; taille_wei: string; sens: string }

const CAPTURES = resolve(ICI, 'captures')
mkdirSync(CAPTURES, { recursive: true })

/** Un vrai PNG, le plus petit possible : 1x1 transparent. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
)

const ADRESSE = '0x1111111111111111111111111111111111111111'
const HASH = '0x' + 'ab'.repeat(32)

const ETAT = {
  fork: { chain_id: 8453, block_number: 50614001, rpc: 'http://127.0.0.1:8545' },
  speculos: { joignable: true, ecran: 'Review TareGuardApproval', api: 'http://127.0.0.1:5000', chemin: "44'/60'/0'/0/0" },
  snapshot: '0x1',
  corpus: F.corpus,
  divergences: [
    {
      acte: 'stop',
      champ: 'pool_id',
      annonce: '0x010d0023c9e072f62720b6627a13973b9505a3d80dccd59acdb2ca803826c538',
      corpus: F.stop.porte.pool_id,
      consequence: 'le pool servi est celui qui porte le hook et le prelevement annonces',
    },
  ],
}

const SOLDES_AVANT = { eth_wei: '10000000000000000000', usdc: '0' }
const SOLDES_APRES = { eth_wei: '9999998000000000000', usdc: '1592' }

/**
 * LE FOURNISSEUR INJECTE. Il note chaque appel dans `window.__appels` pour que le test puisse
 * affirmer qu'AUCUN `eth_sendTransaction` n'est parti — c'est la seule facon de verifier une
 * promesse de non-envoi.
 */
async function injecterPortefeuille(page: Page) {
  await page.addInitScript(
    ({ adresse, hash }) => {
      const appels: { method: string; params: unknown }[] = []
      ;(window as unknown as { __appels: typeof appels }).__appels = appels
      let recuPret = 0
      const provider = {
        isMetaMask: true,
        async request({ method, params }: { method: string; params?: unknown[] }) {
          appels.push({ method, params: params ?? null })
          switch (method) {
            case 'eth_requestAccounts':
            case 'eth_accounts':
              return [adresse]
            case 'wallet_addEthereumChain':
            case 'wallet_switchEthereumChain':
              return null
            case 'eth_sendTransaction':
              return hash
            case 'eth_getTransactionReceipt':
              // Le premier appel rend null : le recu se RELIT, il n'est pas instantane.
              recuPret += 1
              return recuPret < 2
                ? null
                : { transactionHash: hash, blockNumber: '0x304aed1', status: '0x1', gasUsed: '0x1d4c0' }
            default:
              return null
          }
        },
        on() {},
        removeListener() {},
      }
      ;(window as unknown as { ethereum: unknown }).ethereum = provider
    },
    { adresse: ADRESSE, hash: HASH },
  )
}

const json = (r: Route, body: unknown, status = 200) =>
  r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })

/** Le pont, tel que le contrat le decrit. `preparerRefus` sert au test du pont injoignable. */
async function brancherPont(page: Page, opts: { approuver?: unknown; ecranOk?: boolean } = {}) {
  await page.route('**/demo.tare-hooks.tech/demo/etat', (r) => json(r, ETAT))
  await page.route('**/demo.tare-hooks.tech/demo/preparer', async (r) => {
    const corps = JSON.parse(r.request().postData() ?? '{}') as { acte?: string }
    if (corps.acte === 'stop') {
      return json(r, {
        snapshot: '0x1',
        transaction: F.stop.transaction,
        porte: F.stop.porte,
        soldes: SOLDES_AVANT,
        acte: 'stop',
        etat_transaction: 'PRETE',
        etat_alternative: 'PORTE_UNIQUE',
        meilleure_porte: null,
        economie_bps: null,
        transaction_remplacement: null,
        cotation: null,
        plancher: null,
        tolerance_bps: 50,
      })
    }
    return json(r, {
      snapshot: '0x1',
      transaction: F.substitution.transaction,
      porte: F.substitution.porte,
      soldes: SOLDES_AVANT,
      acte: 'substitution',
      etat_transaction: 'PRETE',
      etat_alternative: 'MEILLEURE_PORTE',
      meilleure_porte: F.substitution.meilleure_porte,
      economie_bps: F.substitution.economie_bps,
      transaction_remplacement: F.substitution.transaction_remplacement,
      cotation: '1600000',
      plancher: '1592000',
      tolerance_bps: 50,
      echeance: '1789999999',
    })
  })
  await page.route('**/demo.tare-hooks.tech/demo/approuver', (r) =>
    json(r, opts.approuver ?? { refus: 4001, raison: 'rejected on the device', ecrans: 9, source: 'corpus' }),
  )
  await page.route('**/demo.tare-hooks.tech/demo/revenir', (r) =>
    json(r, { ok: true, block_number: 50614001, snapshot: '0x2' }),
  )
  await page.route('**/demo.tare-hooks.tech/demo/soldes**', (r) => json(r, SOLDES_APRES))
  await page.route('**/speculos.tare-hooks.tech/screenshot**', (r) =>
    opts.ecranOk === false
      ? r.fulfill({ status: 503, contentType: 'text/plain', body: 'no device' })
      : r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  )
  await page.route('**/speculos.tare-hooks.tech/button/**', (r) => json(r, { ok: true }))
}

/**
 * Les erreurs de console et les exceptions non attrapees, collectees pour chaque test.
 *
 * On ecarte UNE seule chose : « Failed to load resource », que le navigateur ecrit lui-meme
 * quand une requete echoue. Dans les tests ou l'on COUPE volontairement le pont ou l'ecran de
 * l'appareil, ce message est la preuve que la coupure a eu lieu, pas un defaut de la page —
 * et c'est justement ce que la page doit savoir encaisser. Tout le reste compte, y compris la
 * moindre exception non attrapee.
 */
function surveiller(page: Page): string[] {
  const erreurs: string[] = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    if (/Failed to load resource/.test(m.text())) return
    erreurs.push(`console: ${m.text()}`)
  })
  page.on('pageerror', (e) => erreurs.push(`pageerror: ${e.message}`))
  return erreurs
}

const appels = (page: Page) =>
  page.evaluate(() => (window as unknown as { __appels: { method: string; params: unknown }[] }).__appels)

/* ------------------------------------------------------------------ 1. acte 1 */

test('acte 1 — le hook, le pool et 9 999.53 bps sont a l ecran, et rien n est propose', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')

  const etape3 = page.locator('section', { hasText: 'what this door takes' }).first()
  await expect(etape3).toContainText('9 999.53 bps')
  await expect(etape3).toContainText(`exact ${F.stop.porte.bps}`)
  await expect(etape3).toContainText('MEASURED')
  await expect(etape3).toContainText('block')

  // le hook COMPLET, celui que la PoolKey du calldata porte
  const etape2 = page.locator('section', { hasText: 'the guard reads it, before the wallet' }).first()
  await expect(etape2).toContainText(F.stop.porte.hook)
  await expect(etape2).toContainText(F.stop.porte.pool_id.slice(0, 12))

  // AUCUNE proposition : l'etat nomme est PORTE_UNIQUE et aucune « cheaper door » n'apparait.
  await expect(page.getByText('PORTE_UNIQUE').first()).toBeVisible()
  await expect(page.getByText('cheaper door')).toHaveCount(0)
  await expect(page.getByText('MEILLEURE_PORTE')).toHaveCount(0)

  expect(erreurs, erreurs.join('\n')).toEqual([])
})

test('acte 1 — un refus rend 4001, et aucune transaction n a ete envoyee', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')

  await page.getByRole('button', { name: 'prepare on the fork' }).click()
  await expect(page.getByText('transaction prepared for act « stop »')).toBeVisible()

  await page.getByRole('button', { name: 'send the report to the device' }).click()
  await expect(page.getByText('code 4001 — nothing left. Not an outage: an answer.')).toBeVisible()
  await expect(page.getByText('9 screens rendered')).toBeVisible()

  const vus = await appels(page)
  expect(vus.map((a) => a.method)).not.toContain('eth_sendTransaction')
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ------------------------------------------------------------------ 2. acte 2 */

test('acte 2 — 4.0933 bps contre 0, le remplacement est construit, et rien ne part sans clic', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')
  await page.getByRole('button', { name: 'act 2 — there is better' }).click()

  const comparaison = page.locator('section', { hasText: 'the doors, at the same size' }).first()
  await expect(comparaison).toContainText(`${F.substitution.porte.bps} bps`)
  await expect(comparaison).toContainText('0 bps')
  await expect(comparaison).toContainText('MEILLEURE_PORTE')
  await expect(comparaison).toContainText(`${F.substitution.economie_bps} bps`)

  await page.getByRole('button', { name: 'prepare on the fork' }).click()
  await expect(page.getByText('transaction prepared for act « substitution »')).toBeVisible()

  // Le remplacement est LU sur la porte proposee, pas sur l'ancienne.
  const remplacement = page.locator('section', { hasText: 'the replacement, built and not sent' }).first()
  await expect(remplacement).toContainText(F.substitution.meilleure_porte.hook)
  await expect(remplacement).toContainText('PRET')

  // Rien n'est parti tant que personne n'a clique.
  expect((await appels(page)).map((a) => a.method)).not.toContain('eth_sendTransaction')

  await page.getByRole('button', { name: 'sign and send' }).click()
  await expect(page.locator('section', { hasText: 'your wallet signs' }).first()).toContainText('included')

  const envois = (await appels(page)).filter((a) => a.method === 'eth_sendTransaction')
  expect(envois).toHaveLength(1)
  const params = (envois[0]!.params as { to: string; data: string; value: string; from: string }[])[0]!
  expect(params.to).toBe(F.substitution.transaction_remplacement.to)
  expect(params.data).toBe(F.substitution.transaction_remplacement.data)
  expect(params.data).not.toBe(F.substitution.transaction.data)
  expect(params.from.toLowerCase()).toBe(ADRESSE)

  // Les soldes bougent, et le recu est affiche.
  const derniere = page.locator('section', { hasText: 'your wallet signs' }).first()
  await expect(derniere).toContainText('before:')
  await expect(derniere).toContainText('after:')
  await expect(derniere).toContainText('status 0x1')

  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* -------------------------------------------------------- 3. le pont injoignable */

test('pont injoignable — refus motive, page vivante, aucune exception', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await page.route('**/demo.tare-hooks.tech/**', (r) => r.abort('connectionrefused'))
  await page.route('**/speculos.tare-hooks.tech/screenshot**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  )
  await page.goto('/#/demo')

  await expect(page.getByRole('heading', { name: 'Two acts, on a pinned fork' })).toBeVisible()
  await expect(page.getByText('the demo bridge').first()).toBeVisible()
  await expect(page.getByText('unreachable').first()).toBeVisible()
  await expect(page.getByText('The page stays readable')).toBeVisible()

  // La page reste utilisable EN LECTURE : le corpus repond seul.
  await expect(page.locator('section', { hasText: 'what this door takes' }).first()).toContainText('9 999.53 bps')
  await page.getByRole('button', { name: 'act 2 — there is better' }).click()
  await expect(page.locator('section', { hasText: 'the doors, at the same size' }).first()).toContainText(
    `${F.substitution.porte.bps} bps`,
  )
  // Sans cotation vivante, envoi.ts refuse et le DIT.
  await expect(page.locator('section', { hasText: 'the replacement, built and not sent' }).first()).toContainText(
    'SANS_PLANCHER',
  )
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ------------------------------------------------------- 4. l ecran de l appareil */

test('screenshot en echec — « device screen unavailable », et aucune image rejouee', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page, { ecranOk: false })
  await page.goto('/#/demo')

  await expect(page.getByText('device screen unavailable')).toBeVisible()
  // L'image existe dans le DOM (elle continue de sonder) mais elle n'est JAMAIS affichee.
  await expect(page.locator('img[alt="the device screen, live"]')).toBeHidden()
  await expect(page.getByText('nothing is replayed')).toBeVisible()

  // Une image qui charge s'affiche : la difference se voit.
  await page.unroute('**/speculos.tare-hooks.tech/screenshot**')
  await page.route('**/speculos.tare-hooks.tech/screenshot**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  )
  await expect(page.locator('img[alt="the device screen, live"]')).toBeVisible()
  await expect(page.getByText('device screen unavailable')).toHaveCount(0)

  // `pageerror` reste vide ; le 503 de l'image n'est pas une erreur de console de la page.
  expect(erreurs.filter((e) => e.startsWith('pageerror')), erreurs.join('\n')).toEqual([])
})

/* ------------------------------------------------------------- 5. la mise en page */

test('aucun debordement horizontal a 390 px', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/demo')
  await expect(page.locator('section', { hasText: 'what this door takes' }).first()).toBeVisible()

  for (const acte of ['act 1 — do not sign', 'act 2 — there is better']) {
    await page.getByRole('button', { name: acte }).click()
    await page.waitForTimeout(150)
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(m.scroll, `${acte} deborde de ${m.scroll - m.client} px`).toBeLessThanOrEqual(m.client)
  }
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

test('la page tient dans 1440x900 sans defiler, et les captures sont ecrites', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/demo')
  await expect(page.locator('section', { hasText: 'what this door takes' }).first()).toBeVisible()

  await page.getByRole('button', { name: 'prepare on the fork' }).click()
  await expect(page.getByText('transaction prepared for act « stop »')).toBeVisible()
  await page.waitForTimeout(250)
  await page.screenshot({ path: resolve(CAPTURES, 'acte-1-1440x900.png') })
  const h1 = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    client: document.documentElement.clientHeight,
  }))
  expect(h1.scroll, `acte 1 depasse de ${h1.scroll - h1.client} px`).toBeLessThanOrEqual(h1.client)

  await page.getByRole('button', { name: 'act 2 — there is better' }).click()
  await page.getByRole('button', { name: 'prepare on the fork' }).click()
  await expect(page.getByText('transaction prepared for act « substitution »')).toBeVisible()
  await page.waitForTimeout(250)
  await page.screenshot({ path: resolve(CAPTURES, 'acte-2-1440x900.png') })
  const h2 = await page.evaluate(() => ({
    scroll: document.documentElement.scrollHeight,
    client: document.documentElement.clientHeight,
  }))
  expect(h2.scroll, `acte 2 depasse de ${h2.scroll - h2.client} px`).toBeLessThanOrEqual(h2.client)

  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ------------------------------------------------ 6. les routes voisines tiennent */

test('les routes deja publiees ne sont pas cassees', async ({ page }) => {
  const erreurs = surveiller(page)
  await brancherPont(page)
  for (const [route, attendu] of [
    ['/#/', 'TARE'],
    ['/#/instrument', 'The evidence'],
    ['/#/reglages', 'TARE'],
  ] as const) {
    await page.goto(route)
    await expect(page.locator('body')).toContainText(attendu)
  }
  expect(erreurs.filter((e) => e.startsWith('pageerror')), erreurs.join('\n')).toEqual([])
})
