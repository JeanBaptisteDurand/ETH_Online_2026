/**
 * LA PAGE #/demo, DE BOUT EN BOUT.
 *
 * Ce que ces tests tiennent :
 *
 *   1. le BANDEAU DE DISTRIBUTION — la mediane, les parts, la queue — affiche exactement ce
 *      que le corpus mesure ; c'est lui qui porte la these, pas l'extreme ;
 *   2. acte 1 « you read what you sign » — la porte ETH -> USDC, ce qu'elle prend, AUCUNE
 *      proposition d'alternative, et un refus qui rend 4001 sans qu'aucune transaction ne
 *      parte (verifie sur le fournisseur injecte) ;
 *   3. acte 2 « there is better » — la porte a 0 bps, le remplacement construit, et
 *      `eth_sendTransaction` appele au CLIC seulement, avec le `to` et le `data` du pont ;
 *   4. la QUEUE — accessible en un clic depuis le bandeau, jamais en ouverture ;
 *   5. pont injoignable — refus motive, page vivante, pas d'exception ;
 *   6. /screenshot en echec — « device screen unavailable », et jamais une image rejouee ;
 *   7. aucun debordement horizontal a 390 px, et la page tient dans 1440x900 ;
 *   8. zero erreur console sur tout le parcours.
 *
 * AUCUN SERVICE DISTANT N'EST APPELE. `demo.tare-hooks.tech` et `speculos.tare-hooks.tech` sont
 * interceptes ; leurs reponses ET les chiffres attendus viennent de fixtures.json, genere
 * depuis le corpus embarque. Un test qui ecrirait « 100.00 bps » a la main ne verifierait plus
 * que la page dit ce que le corpus mesure — il verifierait qu'elle dit ce que le test croit.
 */
import { expect, test, type Page, type Route } from '@playwright/test'
import { readFileSync, mkdirSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICI = dirname(fileURLToPath(import.meta.url))
const F = JSON.parse(readFileSync(resolve(ICI, 'fixtures.json'), 'utf8')) as {
  distribution: Record<string, string>
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
const DIGEST = '0x' + 'a7c8c2d1'.repeat(8)
const CODE_REFUS = 4001
/** Le fork est PUBLIC : c'est lui que la commande de rejeu doit viser, pas un anvil local. */
const RPC_PUBLIC = 'https://tare-hooks.tech/rpc'

const ETAT = {
  fork: { chain_id: 8453, block_number: 50614001, rpc: RPC_PUBLIC },
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

/**
 * Le pont, tel que le contrat le decrit.
 *
 * `compter` note chaque appel a /demo/preparer — c'est ce qui permet d'affirmer qu'un double
 * clic n'en declenche qu'UN. `lent` retarde la reponse, pour ouvrir la fenetre pendant laquelle
 * le second clic partait.
 */
async function brancherPont(
  page: Page,
  opts: { approuver?: unknown; ecranOk?: boolean; compter?: () => void; lent?: number; ecran?: string } = {},
) {
  await page.route('**/demo.tare-hooks.tech/demo/etat', (r) =>
    json(r, opts.ecran ? { ...ETAT, speculos: { ...ETAT.speculos, ecran: opts.ecran } } : ETAT),
  )
  await page.route('**/demo.tare-hooks.tech/demo/preparer', async (r) => {
    opts.compter?.()
    if (opts.lent) await new Promise((res) => setTimeout(res, opts.lent))
    const corps = JSON.parse(r.request().postData() ?? '{}') as { acte?: string }
    if (corps.acte === 'stop') {
      return json(r, {
        snapshot: '0x1',
        transaction: F.stop.transaction,
        porte: F.stop.porte,
        soldes: SOLDES_AVANT,
        prompt_digest: DIGEST,
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
      prompt_digest: DIGEST,
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
  // L'APPROBATION TARDE EXPRES. Sur scene, c'est un humain qui appuie sur l'appareil : la
  // question reste en vol pendant des dizaines de secondes. Les tests decident donc depuis la
  // page, par les deux boutons d'echappement — ce qui est aussi le chemin qu'un presentateur
  // prend quand l'appareil ne repond pas.
  await page.route('**/demo.tare-hooks.tech/demo/approuver', async (r) => {
    if (opts.approuver) return json(r, opts.approuver)
    await new Promise((res) => setTimeout(res, 20000))
    return json(r, { refus: CODE_REFUS, raison: 'rejected on the device', ecrans: 9, source: 'corpus' })
  })
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

/* ------------------------------------------------- 1. le bandeau de distribution */

test('le bandeau porte la these : la mediane du corpus, pas l extreme', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')

  const D = F.distribution
  const bande = page.locator('section[aria-label="what the measured hooks take, across the whole corpus"]')
  await expect(bande).toBeVisible()
  await expect(bande).toContainText(`${D.medianeBps} bps`)
  await expect(bande).toContainText('median')
  await expect(bande).toContainText(`${D.medianePct} % of what you swap`)
  await expect(bande).toContainText(`${D.n} rows carry a number`)
  await expect(bande).toContainText(`${D.nSansNombre} carry`)
  await expect(bande).toContainText(D.partAuDessusDesFrais)
  await expect(bande).toContainText(`take more than ${D.fraisDuPoolBps} bps`)
  await expect(bande).toContainText(D.partAuDessusDunPourCent)
  await expect(bande).toContainText(D.partZero)
  await expect(bande).toContainText(`${D.nNegatives} below`)
  await expect(bande).toContainText(`${D.nQueue} rows`)
  await expect(bande).toContainText('take more than half of')
  await expect(bande).toContainText(`${D.maxBps} bps, is one row of ${D.nLignes}`)
  await expect(page.getByRole('button', { name: 'see the tail' })).toBeVisible()

  const titre = await page.getByRole('heading', { level: 1 }).textContent()
  expect(titre).not.toContain(D.maxBps)
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* --------------------------- 2. on voit ce qu on echange, et d ou vient chaque valeur */

test('les jetons portent leur symbole, et un jeton sans symbole reste sans nom', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')

  // Le swap est dit en clair, montant en unites du jeton, wei garde a cote.
  await expect(page.getByRole('button', { name: /^swap 0\.000001 ETH → USDC$/ })).toBeVisible()
  const premiere = page.locator('section', { hasText: 'swap 0.000001 ETH → USDC' }).first()
  await expect(premiere).toContainText('0.000001 ETH · 0x0000…0000 → USDC · 0x8335…2913')
  await expect(premiere).toContainText('1 000 000 000 000 wei, the unit measured')

  // Et la provenance de chaque valeur est marquee.
  const lu = page.locator('section', { hasText: 'the guard got there first' }).first()
  await expect(lu).toContainText('read from the calldata')
  await expect(lu).toContainText('re-derived')
  await expect(lu).toContainText('from the corpus')
  await expect(lu).toContainText(F.substitution.porte.hook)
  await expect(premiere).toContainText('This is a swap you were about to make')

  // Aucun nom invente : le jeton de la queue n a pas de symbole lu, il reste une adresse.
  await page.getByRole('button', { name: 'see the tail' }).click()
  const queue = page.locator('section', { hasText: 'the tail:' }).first()
  await expect(queue).not.toContainText('undefined')
  await expect(queue).not.toContainText('null')
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ------------------------------- 3. l interception, et ses deux fins */

test('le clic swap est intercepte : le portefeuille ne s ouvre pas, 4001 revient', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')

  await page.getByRole('button', { name: /^swap 0\.000001 ETH → USDC$/ }).click()

  // La garde a demande : on refuse, sur la page (le pont rend deja 4001, l un ou l autre gagne).
  await page.getByRole('button', { name: /^refuse$/ }).click()

  const bande = page.locator('div').filter({ hasText: /^two routes, same swap/ }).first()
  await expect(page.getByText('REFUSEE')).toBeVisible()
  await expect(page.getByText(`code ${CODE_REFUS} · wallet opened 0 time(s) · nothing left`)).toBeVisible()
  expect(await bande.count()).toBeGreaterThan(0)

  const lu = page.locator('section', { hasText: 'the guard got there first' }).first()
  await expect(lu).toContainText('wallet opened')

  // LA PREUVE : rien n a atteint le portefeuille.
  const vus = await appels(page)
  expect(vus.map((a) => a.method)).not.toContain('eth_sendTransaction')
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

test('accepter la substitution ouvre le portefeuille, avec la transaction de REMPLACEMENT', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')

  await page.getByRole('button', { name: /^swap 0\.000001 ETH → USDC$/ }).click()
  // Les TROIS reponses sont visibles, et elles disent ce qu'elles envoient.
  await expect(page.getByRole('button', { name: /^refuse$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^go anyway · 4\.0933 bps$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^substitute · 0 bps$/ })).toBeVisible()
  // La main passe a l'humain, et l'ecran le DIT : une consigne, pas un etat.
  await expect(page.getByText('Pick one —')).toBeVisible()
  await expect(page.getByText('the plan you choose goes to the device — nothing has been sent yet')).toBeVisible()
  await expect(
    page.locator('section', { hasText: 'the device confirms the plan' }).first(),
  ).toContainText('nothing has been sent yet: the device receives the plan you pick')

  await page.getByRole('button', { name: /^substitute · 0 bps$/ }).click()
  // Le plan choisi part a l appareil, qui confirme.
  await page.getByRole('button', { name: /^Approve \(here\)$/ }).click()
  await expect(page.getByText('REMPLACEMENT')).toBeVisible()
  const fin = page.locator('div').filter({ hasText: /^received/ }).first()
  const envois = (await appels(page)).filter((a) => a.method === 'eth_sendTransaction')
  expect(envois).toHaveLength(1)
  const params = (envois[0]!.params as { to: string; data: string; from: string }[])[0]!
  expect(params.data).toBe(F.substitution.transaction_remplacement.data)
  expect(params.data).not.toBe(F.substitution.transaction.data)
  expect(params.from.toLowerCase()).toBe(ADRESSE)
  await expect(page.getByText(/status 0x1/)).toBeVisible()
  // CE QU'ON A GARDE : trois nombres mesures, et aucune extrapolation.
  await expect(fin).toContainText('received')
  await expect(fin).toContainText('would have received')
  await expect(fin).toContainText('kept')
  await expect(page.getByText(/Nothing is extrapolated/)).toBeVisible()
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ----------------------------------------- 4. la route se reecrit */

test('la route se reecrit : l ancienne porte barree, la nouvelle en place, l ecart dit', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')

  // LES DEUX ROUTES, cote a cote, avec ce que chacune rend — mesure, pas estime.
  await expect(page.getByText('two routes, same swap')).toBeVisible()
  await expect(page.getByText(`${F.substitution.economie_bps} bps apart`)).toBeVisible()
  await expect(page.getByText('your route', { exact: false })).toBeVisible()
  await expect(page.getByText('cheaper gate', { exact: false }).first()).toBeVisible()
  await expect(page.getByText('2 442')).toBeVisible()
  await expect(page.getByText('2 444')).toBeVisible()

  // Choisir la substitution designe la route retenue : la bascule se voit.
  await page.getByRole('button', { name: /^swap / }).click()
  await page.getByRole('button', { name: /^substitute · 0 bps$/ }).click()
  await expect(page.getByText(/cheaper gate · chosen/)).toBeVisible()
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ------------------------- 5. l appareil : le champ relu, l empreinte, la trace */

test('le champ montre a l exterieur est celui relu de l appareil, et l empreinte est la', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page, { ecran: 'take 4.09 bps' })
  await page.goto('/#/demo')

  const appareil = page.locator('section', { hasText: 'the device confirms the plan' }).first()
  await expect(appareil).toContainText('on the device:')
  await expect(appareil).toContainText('take 4.09 bps')
  await expect(appareil).toContainText('prompt digest')
  await expect(appareil).toContainText(DIGEST.slice(0, 12))
  await expect(appareil).toContainText('keccak256 of the text sent to the device')

  // Le texte vient du pont : si le pont en rend un autre, l ecran suit.
  await page.unroute('**/demo.tare-hooks.tech/demo/etat')
  await page.route('**/demo.tare-hooks.tech/demo/etat', (r) =>
    json(r, { ...ETAT, speculos: { ...ETAT.speculos, ecran: 'Reject message' } }),
  )
  await expect(appareil).toContainText('Reject message')
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ------------------------------------------- 6. le selecteur de paire */

test('le selecteur liste les paires nommees, classe leurs portes, et n execute rien', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')

  const panneau = page.locator('details.demo-paires')
  await expect(panneau).toContainText('every pair the corpus measures')
  await panneau.locator('summary').click()

  const menu = panneau.locator('select#demo-paire')
  await expect(menu).toBeVisible()
  const options = await menu.locator('option').count()
  expect(options).toBeGreaterThan(1)
  await expect(panneau).toContainText('the corpus answers for every pair')
  await expect(panneau).toContainText('more pairs are measured and not listed')

  // Les portes sont classees, la moins chere en tete, avec leur barre et leur etiquette —
  // en anglais, pas dans le vocabulaire francais du corpus.
  await expect(panneau).toContainText('bar length is proportional to the take')
  await expect(panneau).toContainText('MEASURED')
  await expect(panneau).not.toContainText('MESURE\u00a0')
  const rangs = await panneau.locator('div', { hasText: /^0\d0x/ }).count()
  expect(rangs).toBeGreaterThan(1)

  // A la taille de la demonstration, la porte de l acte est la plus chere du classement.
  await panneau.locator('button', { hasText: /^0\.000001$/ }).first().click()
  await expect(panneau).toContainText(`${F.substitution.porte.bps} bps`)
  await expect(panneau).toContainText(`${F.substitution.meilleure_porte.bps} bps`)

  // Choisir une autre paire desarme le swap, AVEC la raison.
  const valeurs = await menu.locator('option').evaluateAll((o) => o.map((x) => (x as HTMLOptionElement).value))
  const autre = valeurs.find((v) => v !== `${F.substitution.porte.monnaie_entree}>${F.substitution.porte.monnaie_sortie}`)
  if (autre) {
    await menu.selectOption(autre)
    await expect(page.getByText('the bridge only prepares the executed one')).toBeVisible()
    await expect(page.getByRole('button', { name: /^swap / })).toBeDisabled()
  }
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ------------------------------------------- 7. la queue, la commande de rejeu */

test('la queue s ouvre en un clic, et la commande de rejeu vise le fork public', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.goto('/#/demo')

  await expect(page.locator('.demo-etapes')).not.toContainText(F.stop.porte.hook)
  await page.getByRole('button', { name: 'see the tail' }).click()
  await expect(page.locator('section', { hasText: 'what this gate takes' }).first()).toContainText(
    'PORTE_UNIQUE',
  )
  await expect(page.locator('section', { hasText: 'the guard got there first' }).first()).toContainText(
    F.stop.porte.hook,
  )

  await page.getByText('replay this number yourself').first().click()
  const rejeu = page.locator('pre', { hasText: 'measure(' }).first()
  await expect(rejeu).toContainText(RPC_PUBLIC)
  await expect(rejeu).not.toContainText('127.0.0.1')
  await expect(page.getByText('it needs the repository and Python 3').first()).toBeVisible()
  await expect(page.getByText(/it is shared/).first()).toBeVisible()
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* -------------------------------------------------------- 8. le pont injoignable */

test('pont injoignable — refus motive, page vivante, aucune exception', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await page.route('**/demo.tare-hooks.tech/**', (r) => r.abort('connectionrefused'))
  await page.route('**/speculos.tare-hooks.tech/screenshot**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  )
  await page.goto('/#/demo')

  await expect(page.getByRole('heading', { name: 'One click, and the guard gets there first' })).toBeVisible()
  await expect(page.getByText('the demo bridge is unreachable')).toBeVisible()
  await expect(
    page.locator('section[aria-label="what the measured hooks take, across the whole corpus"]'),
  ).toContainText(`${F.distribution.medianeBps} bps`)
  await expect(page.locator('section', { hasText: 'the guard got there first' }).first()).toContainText(
    `${F.substitution.porte.bps} bps`,
  )
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ------------------------------------------------------- 9. l ecran de l appareil */

test('screenshot en echec — « device screen unavailable », et aucune image rejouee', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page, { ecranOk: false })
  await page.goto('/#/demo')

  await expect(page.getByText('device screen unavailable')).toBeVisible()
  await expect(page.locator('img[alt="the device screen, live"]')).toBeHidden()
  await expect(page.getByText(/nothing is replayed/)).toBeVisible()

  await page.unroute('**/speculos.tare-hooks.tech/screenshot**')
  await page.route('**/speculos.tare-hooks.tech/screenshot**', (r) =>
    r.fulfill({ status: 200, contentType: 'image/png', body: PNG }),
  )
  await expect(page.locator('img[alt="the device screen, live"]')).toBeVisible()
  expect(erreurs.filter((e) => e.startsWith('pageerror')), erreurs.join('\n')).toEqual([])
})

/* ------------------------------------------------------------- 10. la mise en page */

test('aucun debordement horizontal a 390 px', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/#/demo')
  await expect(page.locator('section', { hasText: 'the guard got there first' }).first()).toBeVisible()

  for (const [nom, aller] of [
    ['the flow', async () => undefined],
    ['the pairs panel', async () => void (await page.locator('details.demo-paires summary').click())],
    ['the tail', async () => void (await page.getByRole('button', { name: 'see the tail' }).click())],
  ] as [string, () => Promise<void>][]) {
    await aller()
    await page.waitForTimeout(200)
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }))
    expect(m.scroll, `${nom} deborde de ${m.scroll - m.client} px`).toBeLessThanOrEqual(m.client)
  }
  expect(erreurs, erreurs.join('\n')).toEqual([])
})

test('la page tient dans 1440x900 sans defiler, et les captures sont ecrites', async ({ page }) => {
  const erreurs = surveiller(page)
  await injecterPortefeuille(page)
  await brancherPont(page)
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/#/demo')
  await expect(page.locator('section', { hasText: 'the guard got there first' }).first()).toBeVisible()
  await page.waitForTimeout(400)

  const mesurer = async (nom: string) => {
    await page.waitForTimeout(250)
    if (process.env.DEMO_HAUTEURS) {
      const d = await page.evaluate(() => {
        const m = document.getElementById('contenu')!
        return Array.from(m.firstElementChild!.children).map(
          (el) => `${Math.round(el.getBoundingClientRect().height)} :: ${(el.textContent || '').slice(0, 28)}`,
        )
      })
      console.log(`[${nom}] ` + d.join(' | '))
    }
    await page.screenshot({ path: resolve(CAPTURES, `${nom}-1440x900.png`) })
    const h = await page.evaluate(() => ({
      scroll: document.documentElement.scrollHeight,
      client: document.documentElement.clientHeight,
    }))
    expect(h.scroll, `${nom} depasse de ${h.scroll - h.client} px`).toBeLessThanOrEqual(h.client)
  }

  await mesurer('parcours')
  await page.getByRole('button', { name: /^swap / }).click()
  await page.getByRole('button', { name: /^refuse$/ }).click()
  await expect(page.getByText('REFUSEE')).toBeVisible()
  await mesurer('refus')
  await page.getByRole('button', { name: 'see the tail' }).click()
  await mesurer('queue')

  expect(erreurs, erreurs.join('\n')).toEqual([])
})

/* ------------------------------------------------ 11. les routes voisines tiennent */

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
