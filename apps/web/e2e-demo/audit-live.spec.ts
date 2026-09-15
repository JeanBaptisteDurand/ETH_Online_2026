/**
 * AUDIT DE LA DEMONSTRATION EN DIRECT, CONTRE LE SITE PUBLIE.
 *
 * Rien n'est double : le pont (https://tare-hooks.tech/pont), l'ecran Speculos
 * (https://tare-hooks.tech/ecran) et le fork (https://tare-hooks.tech/rpc) sont les vrais.
 * Le seul element simule est le PORTEFEUILLE : un window.ethereum minimal qui rend le compte
 * anvil n0 (deverrouille sur le fork, donc eth_sendTransaction part sans signature) et relaie
 * tout le reste au fork par fetch. Il est annonce en EIP-6963 ET pose sur window.ethereum.
 *
 * UN SEUL TEST, et des assertions SOUPLES (expect.soft). Un audit doit tout relever puis
 * REMBOBINER le fork ; un echec dur au milieu laisserait le fork sale, ce qui serait pire que
 * le defaut qu'il vient de trouver.
 *
 * Le test compte lui-meme les eth_sendTransaction : l'acte 1 doit en emettre ZERO.
 */
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = 'https://tare-hooks.tech'
const PONT = `${SITE}/pont`
const RPC = `${SITE}/rpc`
const ECRAN = `${SITE}/ecran`
const COMPTE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const BLOC_EPINGLE = 50614000

const ICI = dirname(fileURLToPath(import.meta.url))
const DOSSIER = resolve(ICI, 'captures/audit')
mkdirSync(DOSSIER, { recursive: true })

/* -------------------------------------------------------------- les releves */

const chrono: { etape: string; ms: number }[] = []
const consoleErreurs: string[] = []
const reseauEchecs: string[] = []
const pageErreurs: string[] = []
const notes: string[] = []

const note = (s: string) => {
  notes.push(s)
  console.log(`  · ${s}`)
}

function tic(etape: string, ms: number) {
  chrono.push({ etape, ms })
  console.log(`  T  ${etape} : ${(ms / 1000).toFixed(2)} s${ms > 10_000 ? '   <<<< PLUS DE 10 s' : ''}`)
}

async function mesurer<T>(etape: string, f: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  try {
    return await f()
  } finally {
    tic(etape, Date.now() - t0)
  }
}

/** groupDigits() du site insere U+202F (espace fine insecable). On normalise pour comparer. */
const plat = (s: string) => s.replace(/[   ]/g, ' ').replace(/[ \t]+/g, ' ').trim()
const platL = (s: string) => plat(s).replace(/\s*\n\s*/g, ' ').replace(/ +/g, ' ')

let n = 0
async function shot(page: Page, nom: string) {
  n += 1
  const chemin = resolve(DOSSIER, `${String(n).padStart(2, '0')}-${nom}.png`)
  await page.screenshot({ path: chemin, fullPage: true }).catch(() => undefined)
  console.log(`  IMG ${chemin}`)
  return chemin
}

/* --------------------------------------------------------- le faux portefeuille */

const FAUX_PORTEFEUILLE = `(() => {
  const COMPTE = '${COMPTE}'
  const RPC = '${RPC}'
  const etat = { appels: [], envois: 0, refuserEnvoi: false, hashes: [] }
  Object.defineProperty(window, '__audit', { value: etat, writable: false, configurable: true })
  let id = 0
  const abonnes = {}
  const fournisseur = {
    isMetaMask: true,
    _metamask: { isUnlocked: () => Promise.resolve(true) },
    selectedAddress: COMPTE,
    chainId: '0x2105',
    networkVersion: '8453',
    on(ev, cb) { (abonnes[ev] = abonnes[ev] || []).push(cb); return this },
    addListener(ev, cb) { return this.on(ev, cb) },
    removeListener() { return this },
    removeAllListeners() { return this },
    async enable() { return [COMPTE] },
    async request(args) {
      const method = args && args.method
      const params = (args && args.params) || []
      etat.appels.push({ method, at: Date.now() })
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [COMPTE]
      if (method === 'eth_chainId') return '0x2105'
      if (method === 'net_version') return '8453'
      if (method === 'wallet_addEthereumChain') return null
      if (method === 'wallet_switchEthereumChain') return null
      if (method === 'wallet_requestPermissions') return [{ parentCapability: 'eth_accounts' }]
      if (method === 'wallet_getPermissions') return [{ parentCapability: 'eth_accounts' }]
      if (method === 'eth_sendTransaction') {
        etat.envois += 1
        if (etat.refuserEnvoi) {
          const e = new Error('MetaMask Tx Signature: User denied transaction signature.')
          e.code = 4001
          throw e
        }
      }
      const res = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
      })
      if (!res.ok) { const e = new Error('rpc http ' + res.status); e.code = -32603; throw e }
      const j = await res.json()
      if (j && j.error) { const e = new Error(j.error.message || 'rpc error'); e.code = j.error.code; throw e }
      if (method === 'eth_sendTransaction') etat.hashes.push(j.result)
      return j.result
    },
    send(a, b) { return typeof a === 'string' ? this.request({ method: a, params: b }) : this.request(a) },
    sendAsync(payload, cb) {
      this.request(payload).then(
        (r) => cb(null, { id: payload.id, jsonrpc: '2.0', result: r }),
        (e) => cb(e, null),
      )
    },
  }
  Object.defineProperty(window, 'ethereum', { value: fournisseur, writable: true, configurable: true })
  const info = {
    uuid: '5d1f2e8a-6c31-4d6b-9f77-6e3a1c0b2d44',
    name: 'MetaMask',
    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=',
    rdns: 'io.metamask',
  }
  const annoncer = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({ info, provider: fournisseur }),
  }))
  window.addEventListener('eip6963:requestProvider', annoncer)
  annoncer()
})()`

/* ------------------------------------------------------------- l'appareil, en direct */

async function evenements(): Promise<string[]> {
  try {
    const r = await fetch(`${ECRAN}/events`)
    const j = (await r.json()) as { events?: { text?: string }[] }
    return (j.events ?? []).map((e) => e.text ?? '')
  } catch {
    return []
  }
}

async function ecranCourant(): Promise<string> {
  try {
    const r = await fetch(`${ECRAN}/events?currentscreenonly=true`)
    const j = (await r.json()) as { events?: { text?: string }[] }
    return (j.events ?? []).map((e) => e.text ?? '').join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

async function rpc(method: string, params: unknown[] = []): Promise<any> {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  return (await r.json()) as any
}

const bloc = async () => parseInt((await rpc('eth_blockNumber')).result, 16)

/** Le journal garde 5 lignes : « transaction prepared » d'un acte precedent y traine. On lit
 *  donc l'indicateur d'occupation, qui dit « waiting on the bridge… » puis revient au repos. */
async function attendrePreparation(p: Page, msMax = 60_000) {
  await expect(p.locator('text=both acts are searched in the corpus, not written down')).toBeVisible({
    timeout: msMax,
  })
}
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/* ---------------------------------------------------------------------- le test */

test('audit complet de #/demo contre le site en ligne', async ({ browser }) => {
  test.setTimeout(900_000)

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(FAUX_PORTEFEUILLE)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErreurs.push(`[console.error] ${m.text().slice(0, 400)}`)
    if (m.type() === 'warning' && /error|fail|refus|deprecat/i.test(m.text()))
      consoleErreurs.push(`[console.warn] ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', (e) => pageErreurs.push(`[pageerror] ${e.message.slice(0, 400)}`))
  page.on('requestfailed', (r) => {
    const u = r.url()
    const t = r.failure()?.errorText ?? ''
    if (u.includes('/ecran/screenshot')) return // rafraichi toutes les 400 ms : une annulation est normale
    if (t === 'net::ERR_ABORTED' && r.resourceType() === 'document') return
    reseauEchecs.push(`[requestfailed] ${t} ${r.resourceType()} ${u.slice(0, 160)}`)
  })

  const etatPont = (await (await fetch(`${PONT}/demo/etat`)).json()) as any
  // FILET : une sauvegarde prise au bloc epingle. Si le rembobinage du pont ne suffit pas
  // (il ne revient qu'au DERNIER snapshot, qui peut avoir ete pris apres la transaction),
  // on restaure celle-ci. Un audit ne laisse pas le fork ailleurs qu'ou il l'a trouve.
  const blocDepart = await bloc()
  const sauvegarde = (await rpc('evm_snapshot')).result as string
  note(`FILET . sauvegarde ${sauvegarde} prise au bloc ${blocDepart}`)

  try {
    /* ================================================================ 0. arrivee */
    await mesurer('00 chargement de #/demo (jusqu au titre)', async () => {
      await page.goto(`${SITE}/#/demo`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('heading', { name: 'Two acts, on a pinned fork' })).toBeVisible()
    })
    await mesurer('00 la reponse du pont s affiche', async () => {
      await expect(page.locator('text=/snapshot 0x/').first()).toBeVisible({ timeout: 30_000 })
    })

    const bandeau = platL(
      await page.locator('div').filter({ hasText: /^fork .*snapshot/ }).last().innerText(),
    )
    note(`bandeau du pont : ${bandeau}`)
    expect.soft(bandeau, 'le bloc epingle est affiche').toContain('50 614 000')
    expect.soft(bandeau, 'l appareil est annonce joignable').toContain('device reachable')

    const btnConnect = page.getByRole('button', { name: /connect the wallet|0xf3/i })
    await expect.soft(btnConnect, 'le portefeuille est vu par la page').toBeEnabled({ timeout: 10_000 })
    await shot(page, 'arrivee')

    /* ---- LE BANDEAU DES DIVERGENCES ---- */
    const titreDiv = page.locator('text=what the script announces, and what the corpus measures')
    const bandeauDivVisible = await titreDiv.isVisible().catch(() => false)
    note(`bandeau « divergences » visible : ${bandeauDivVisible}`)
    expect.soft(bandeauDivVisible, 'le bandeau des divergences s affiche').toBe(true)

    const lignesDiv = (await page.locator('div[title]').filter({ hasText: /^act «/ }).allInnerTexts()).map(platL)
    note(`divergences affichees : ${lignesDiv.length} / publiees par le pont : ${(etatPont.divergences ?? []).length}`)
    for (const l of lignesDiv) note(`   DIV visible : ${l}`)
    const bulles = await page
      .locator('div[title]')
      .filter({ hasText: /^act «/ })
      .evaluateAll((els) => els.map((e) => e.getAttribute('title') ?? ''))
    for (const b of bulles) note(`   DIV infobulle : ${b}`)
    expect.soft(lignesDiv.length, 'toutes les divergences du pont sont affichees').toBe(
      (etatPont.divergences ?? []).length,
    )
    for (const d of etatPont.divergences ?? []) {
      const trouve = lignesDiv.some((l) => l.includes(d.annonce) && l.includes(d.corpus))
      expect.soft(trouve, `divergence ${d.acte}.${d.champ} citee mot pour mot`).toBe(true)
    }
    note(`pool servi en acte 1 (corpus, pont) : ${etatPont.actes.stop.porte.pool_id}`)
    note(`pool « annonce » par la divergence : ${etatPont.divergences?.[0]?.annonce}`)

    await mesurer('00 connexion du portefeuille', async () => {
      await btnConnect.click()
      await expect(page.getByRole('button', { name: /0xf39F/i })).toBeVisible({ timeout: 20_000 })
    })
    await mesurer('00 add the fork network', async () => {
      await page.getByRole('button', { name: 'add the fork network' }).click()
      await expect(page.locator('text=/switched to/')).toBeVisible({ timeout: 20_000 })
    })

    /* ================================================================ 1. ACTE 1 */
    await page.getByRole('button', { name: 'act 1 — do not sign' }).click()
    await mesurer('ACTE 1 . prepare on the fork', async () => {
      await page.getByRole('button', { name: 'prepare on the fork' }).click()
      await expect(page.locator('text=waiting on the bridge…')).toBeVisible({ timeout: 10_000 })
      await attendrePreparation(page)
    })

    const c1 = platL(await page.locator('body').innerText())
    expect.soft(c1, 'le 9 999.53 bps est a l ecran').toContain('9 999.53 bps')
    note(`acte 1, chiffre exact : ${(c1.match(/exact [0-9.]+ . [0-9.]+ % of what you send/) ?? ['(absent)'])[0]}`)
    const hook1 = String(etatPont.actes.stop.porte.hook).toLowerCase()
    const pool1 = String(etatPont.actes.stop.porte.pool_id).toLowerCase()
    expect.soft(c1.toLowerCase(), 'le hook du corpus est a l ecran').toContain(hook1)
    note(`acte 1, hook du corpus : ${hook1}`)
    note(`acte 1, ligne pool id : ${(c1.match(/pool id [^\n]{0,120}/) ?? ['(absent)'])[0]}`)
    note(`acte 1, pool servi par le pont : ${pool1}`)
    note(`acte 1, verdict : ${(c1.match(/verdict [^\n]{0,120}/i) ?? ['(absent)'])[0]}`)
    note(`acte 1, router : ${(c1.match(/router [^\n]{0,70}/) ?? ['(absent)'])[0]}`)
    expect.soft(c1.toLowerCase(), 'l etat PORTE_UNIQUE est dit en anglais').toContain('there is only one door for this swap')
    await shot(page, 'acte1-prepare')

    /* ---------------- l'appareil ---------------- */
    const avantEvts = (await evenements()).length
    note(`acte 1, ecran de l appareil avant envoi : « ${await ecranCourant()} »`)

    const t0 = Date.now()
    await page.getByRole('button', { name: 'send the report to the device' }).click()
    let bouge = false
    let premier = ''
    for (let i = 0; i < 100 && !bouge; i++) {
      await dormir(200)
      const e = await ecranCourant()
      if (e && !/app is ready|App settings|App info|Quit app/i.test(e)) {
        bouge = true
        premier = e
      }
    }
    tic('ACTE 1 . le rapport atteint l appareil', Date.now() - t0)
    note(`acte 1, premier ecran de signature : « ${premier || '(rien)'} »`)
    expect.soft(bouge, 'l appareil quitte son menu quand on lui envoie le rapport').toBe(true)
    await shot(page, 'acte1-appareil-premier-ecran')

    /* LE VRAI GESTE. « Reject (left) » ne fait RIEN sur l'ecran « Blind signing ahead » : il
       faut « next (right) » jusqu'a « Reject message », puis « Approve (both) ». On deroule donc
       avec les boutons DE LA PAGE, on compte les appuis, et on chronometre. */
    /* L'ecran « Blind signing ahead » est une GARDE a deux choix : « both » pour accepter le
       risque et entrer dans les champs, « right » pour aller sur « Reject transaction ».
       C'est donc « Approve (both) » qu'il faut presser pour COMMENCER A LIRE — et le bouton
       « Reject (left) » de la page n'y fait rien du tout (verifie separement). */
    const tNav = Date.now()
    if (/blind signing/i.test(premier)) {
      note('acte 1, garde « Blind signing ahead » : il faut « Approve (both) » pour entrer dans les champs')
      await page.getByRole('button', { name: 'Approve (both)' }).click()
      await dormir(600)
    }
    let appuis = 0
    let vuTake = false
    let vuChiffre = false
    let msTake: number | null = null
    let msReject: number | null = null
    const suivant = page.getByRole('button', { name: 'next (right)' })
    const vus: string[] = []
    for (let i = 0; i < 70; i++) {
      const e = await ecranCourant()
      if (e && e !== vus[vus.length - 1]) vus.push(e)
      if (/\btake\b/i.test(e)) vuTake = true
      if (/9999\.53/.test(e)) vuChiffre = true
      if (vuTake && vuChiffre && msTake === null) {
        msTake = Date.now() - t0
        tic(`ACTE 1 . « take 9999.53 bps » visible sur l appareil (${appuis} appuis)`, msTake)
      }
      if (/^Reject/i.test(e)) {
        msReject = Date.now() - t0
        tic(`ACTE 1 . ecran « Reject » atteint (${appuis} appuis)`, msReject)
        break
      }
      await suivant.click().catch(() => undefined)
      appuis += 1
      await dormir(170)
    }
    tic(`ACTE 1 . derouler l appareil (${appuis} appuis sur « next »)`, Date.now() - tNav)
    note(`acte 1, ecrans distincts traverses : ${vus.length}`)
    for (const v of vus) note(`   ECRAN : « ${v} »`)

    const nouveaux = (await evenements()).slice(avantEvts)
    const tous = nouveaux.join(' ').replace(/\s+/g, ' ')
    note(`acte 1, nouveaux evenements /ecran/events : ${nouveaux.length}`)
    expect.soft(tous, '« take » apparait bien sur l ecran de l appareil').toMatch(/\btake\b/i)
    expect.soft(tous, '« 9999.53 » apparait bien sur l ecran de l appareil').toContain('9999.53')
    await shot(page, 'acte1-appareil-champs')

    /* ---------------- le refus, par le geste qui marche ---------------- */
    const tRefus = Date.now()
    await page.getByRole('button', { name: 'Approve (both)' }).click()
    const reponse = page.locator(
      'text=/code 4001|did not answer in|unreachable|reglage_manquant|speculos_injoignable/i',
    )
    let ditRefus = '(rien)'
    try {
      await expect(reponse.first()).toBeVisible({ timeout: 60_000 })
      ditRefus = platL(await reponse.first().innerText())
    } catch {
      ditRefus = '(la page n a rien dit en 60 s)'
    }
    tic('ACTE 1 . du refus sur l appareil a la reponse de la page', Date.now() - tRefus)
    tic('ACTE 1 . TOTAL du bouton « send the report » a la reponse', Date.now() - t0)
    note(`acte 1, la page repond : « ${ditRefus} »`)

    const c1b = platL(await page.locator('body').innerText())
    await shot(page, 'acte1-refus')
    const envois1 = await page.evaluate(() => (window as any).__audit.envois as number)
    note(`acte 1, eth_sendTransaction emis : ${envois1}`)
    expect.soft(envois1, 'ZERO transaction pendant l acte 1').toBe(0)
    expect.soft(c1b, 'la page affiche « code 4001 »').toContain('code 4001')
    note(`acte 1, ecrans rendus dits par la page : ${(c1b.match(/\d+ screens rendered[^\n]{0,40}/) ?? ['(absent)'])[0]}`)
    note(`acte 1, ligne « answer » : ${(c1b.match(/answer code \d+[^\n]{0,70}/) ?? ['(absent)'])[0]}`)
    note(`acte 1, journal : ${(c1b.match(/device [^\n]{0,170}/) ?? ['(absent)'])[0]}`)

    // On remet l'appareil au repos si le refus l'a laisse sur un ecran d'erreur.
    for (let i = 0; i < 10; i++) {
      const e = await ecranCourant()
      if (/app is ready/i.test(e)) break
      await fetch(`${ECRAN}/button/right`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'press-and-release' }),
      }).catch(() => undefined)
      await dormir(250)
    }
    note(`acte 1, ecran de l appareil apres coup : « ${await ecranCourant()} »`)

    /* ================================================================ 2. ACTE 2 */
    await page.getByRole('button', { name: 'act 2 — there is better' }).click()
    await shot(page, 'acte2-avant-prepare')

    await mesurer('ACTE 2 . prepare on the fork', async () => {
      await page.getByRole('button', { name: 'prepare on the fork' }).click()
      await expect(page.locator('text=waiting on the bridge…')).toBeVisible({ timeout: 10_000 })
      await attendrePreparation(page)
    })

    const c2 = platL(await page.locator('body').innerText())
    expect.soft(c2, 'la porte actuelle 4.0933 bps').toContain('4.0933 bps')
    note(`acte 2, current door : ${(c2.match(/current door [^\n]{0,130}/) ?? ['(absent)'])[0]}`)
    note(`acte 2, cheaper door : ${(c2.match(/cheaper door [^\n]{0,130}/) ?? ['(absent)'])[0]}`)
    note(`acte 2, measured gap : ${(c2.match(/measured gap [^\n]{0,130}/) ?? ['(absent)'])[0]}`)
    note(`acte 2, output floor : ${(c2.match(/output floor [^\n]{0,150}/) ?? ['(absent)'])[0]}`)
    note(`acte 2, examined : ${(c2.match(/examined [^\n]{0,220}/) ?? ['(absent)'])[0]}`)
    expect.soft(c2, 'la porte a 0 bps est bien citee').toMatch(/cheaper door[\s\S]{0,150}0 bps/)
    expect.soft(c2.toLowerCase(), 'l etat MEILLEURE_PORTE est dit').toContain('another door is measured cheaper, at the same size')
    const avantSoldes = c2.match(/before: ([0-9 ]+) wei . ([0-9 ]+) USDC/)
    note(`acte 2, soldes avant : ${avantSoldes?.[1] ?? '?'} wei | ${avantSoldes?.[2] ?? '?'} USDC`)
    await shot(page, 'acte2-prepare')

    note(`acte 2, bloc du fork avant envoi : ${await bloc()}`)

    const tEnvoi = Date.now()
    await page.getByRole('button', { name: 'sign and send' }).click()
    let hashVu = false
    try {
      await expect(page.locator('text=/^sent/').first()).toBeVisible({ timeout: 60_000 })
      hashVu = true
    } catch {
      note('acte 2 : AUCUN hash affiche en 60 s')
    }
    tic('ACTE 2 . sign and send (hash affiche)', Date.now() - tEnvoi)

    const tRecu = Date.now()
    let recuVu = false
    try {
      await expect(page.locator('text=/^receipt/').first()).toBeVisible({ timeout: 90_000 })
      recuVu = true
    } catch {
      note('acte 2 : AUCUN recu affiche en 90 s')
    }
    tic('ACTE 2 . le recu revient et s affiche', Date.now() - tRecu)
    tic('ACTE 2 . TOTAL du clic au recu', Date.now() - tEnvoi)
    expect.soft(hashVu, 'le hash s affiche').toBe(true)
    expect.soft(recuVu, 'le recu s affiche').toBe(true)

    const c2b = platL(await page.locator('body').innerText())
    const ligneRecu = c2b.match(/receipt block ([0-9 ]+) . status (0x[0-9a-f]+) . gas ([0-9 ]+)/)
    note(`acte 2, recu affiche : ${ligneRecu?.[0] ?? '(absent)'}`)
    expect.soft(ligneRecu?.[2], 'le recu affiche porte status 0x1').toBe('0x1')

    const hash = (await page.evaluate(() => (window as any).__audit.hashes[0] ?? null)) as string | null
    note(`acte 2, hash envoye : ${hash}`)
    if (hash) {
      const r = await rpc('eth_getTransactionReceipt', [hash])
      note(
        `acte 2, status RELU par RPC direct : ${r.result?.status} | bloc ${parseInt(r.result?.blockNumber ?? '0x0', 16)} | gas ${parseInt(r.result?.gasUsed ?? '0x0', 16)}`,
      )
      expect.soft(r.result?.status, 'status relu sur le fork').toBe('0x1')
    }

    const apres = c2b.match(/after: ([0-9 ]+) wei . ([0-9 ]+) USDC/)
    const avant2 = c2b.match(/before: ([0-9 ]+) wei . ([0-9 ]+) USDC/)
    note(`acte 2, soldes : ${avant2?.[1]} wei / ${avant2?.[2]} USDC  ->  ${apres?.[1]} wei / ${apres?.[2]} USDC`)
    expect.soft(apres, 'la ligne « after: » apparait').not.toBeNull()
    if (apres && avant2) expect.soft(apres[2], 'le solde USDC a bouge').not.toBe(avant2[2])

    const envois2 = await page.evaluate(() => (window as any).__audit.envois as number)
    note(`acte 2, eth_sendTransaction cumules : ${envois2}`)
    expect.soft(envois2, 'une seule transaction envoyee en tout').toBe(1)
    await shot(page, 'acte2-recu')

    /* ================================================== 3. francais + mise en page */
    const texte = await page.evaluate(() => document.body.innerText)
    const titres: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[title]')).map((e) => e.getAttribute('title') ?? ''),
    )
    const alts: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('img[alt]')).map((e) => e.getAttribute('alt') ?? ''),
    )
    const MOTS =
      /\b(le|la|les|des|une|aucun|aucune|nulle|prend|mesure|mesures|mesuree|chaine|entree|taille|bloc|moteur|epingle|retard|signer|envoyer|mais|pour|avec|dans|par|qui|pas|plus|est|sont|reponse|annonce|porte|seule|ailleurs|continuer|depot|ecran|appareil)\b/gi

    const lignes = texte.split('\n').map((l) => l.trim()).filter(Boolean)
    const suspectes = lignes.filter((l) => (l.match(MOTS) ?? []).length >= 2)
    note(`=== FRANCAIS . texte VISIBLE : ${suspectes.length} ligne(s) suspecte(s) ===`)
    for (const s of suspectes.slice(0, 25)) note(`   FR-VISIBLE « ${s.slice(0, 220)} »`)
    const guillemets = lignes.filter((l) => l.includes('«') || l.includes('»'))
    note(`=== FRANCAIS . guillemets visibles : ${guillemets.length} ligne(s) ===`)
    for (const g of guillemets.slice(0, 15)) note(`   FR-GUILLEMETS « ${g.slice(0, 180)} »`)
    const bullesFr = titres.filter((t) => (t.match(MOTS) ?? []).length >= 2)
    note(`=== FRANCAIS . infobulles : ${bullesFr.length} ===`)
    for (const t of bullesFr.slice(0, 12)) note(`   FR-TITLE « ${t.slice(0, 260)} »`)
    for (const a of alts) note(`   alt image : « ${a} »`)

    await page.setViewportSize({ width: 1440, height: 900 })
    await dormir(500)
    const m1440 = await page.evaluate(() => {
      let sh = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
      let quoi = 'document'
      document.querySelectorAll('*').forEach((el) => {
        const e = el as HTMLElement
        if (e.scrollHeight > e.clientHeight + 4 && e.scrollHeight > sh) {
          sh = e.scrollHeight
          quoi = `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}`
        }
      })
      return {
        sw: document.documentElement.scrollWidth,
        iw: window.innerWidth,
        sh,
        ih: window.innerHeight,
        quoi,
      }
    })
    note(
      `1440x900 : largeur ${m1440.sw}/${m1440.iw} | hauteur ${m1440.sh}/${m1440.ih} sur ${m1440.quoi} (${(m1440.sh / m1440.ih).toFixed(2)} ecran(s) de defilement)`,
    )
    expect.soft(m1440.sw, 'aucun debordement horizontal a 1440 px').toBeLessThanOrEqual(m1440.iw + 1)
    await shot(page, 'mise-en-page-1440x900')

    await page.setViewportSize({ width: 390, height: 844 })
    await dormir(700)
    const m390 = await page.evaluate(() => {
      const coupables: string[] = []
      const w = window.innerWidth
      document.querySelectorAll('*').forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && (r.right > w + 1 || r.left < -1)) {
          const t = ((el as HTMLElement).innerText ?? '').slice(0, 70).replace(/\n/g, ' ')
          coupables.push(
            `<${el.tagName.toLowerCase()} class="${String((el as HTMLElement).className).slice(0, 46)}"> right=${Math.round(r.right)} w=${Math.round(r.width)} « ${t} »`,
          )
        }
      })
      return { sw: document.documentElement.scrollWidth, iw: w, coupables: coupables.slice(0, 15), total: coupables.length }
    })
    note(`390 px : scrollWidth ${m390.sw} pour innerWidth ${m390.iw} | ${m390.total} element(s) hors cadre`)
    for (const c of m390.coupables) note(`   HORS CADRE : ${c}`)
    expect.soft(m390.sw, 'aucun debordement horizontal a 390 px').toBeLessThanOrEqual(m390.iw + 1)
    await shot(page, 'mise-en-page-390')
    await page.setViewportSize({ width: 1440, height: 900 })
    await dormir(300)

    /* ================================================== 4. hors scenario */
    /* (a) « prepare » deux fois de suite */
    const btnPrep = page.getByRole('button', { name: 'prepare on the fork' })
    const tD = Date.now()
    await btnPrep.click()
    const echantillons: string[] = []
    for (let i = 0; i < 6; i++) {
      echantillons.push(`${i * 60}ms:${await btnPrep.isDisabled().catch(() => 'err')}`)
      await dormir(60)
    }
    note(`HORS . etat du bouton juste apres le clic : ${echantillons.join(' ')}`)
    const desarme = echantillons.some((e) => e.endsWith(':true'))
    note(`HORS . double « prepare » : le bouton est desarme pendant l appel = ${desarme}`)
    const second = await btnPrep.click({ timeout: 2500 }).then(() => true).catch(() => false)
    note(`HORS . le 2e clic a-t-il pu partir ? ${second}`)
    await attendrePreparation(page)
    tic('HORS . double « prepare »', Date.now() - tD)
    const cD = platL(await page.locator('body').innerText())
    note(`HORS . apres double prepare, gap affiche = ${(cD.match(/measured gap [^\n]{0,70}/) ?? ['(absent)'])[0]}`)
    await shot(page, 'hors-double-prepare')

    /* (b) l'acte 2 AVANT toute preparation, sur une page fraiche */
    const p2 = await ctx.newPage()
    const err2: string[] = []
    p2.on('pageerror', (e) => err2.push(e.message.slice(0, 200)))
    p2.on('console', (m) => {
      if (m.type() === 'error') consoleErreurs.push(`[p2 console.error] ${m.text().slice(0, 300)}`)
    })
    await p2.goto(`${SITE}/#/demo`, { waitUntil: 'domcontentloaded' })
    await expect(p2.locator('text=/snapshot 0x/').first()).toBeVisible({ timeout: 30_000 })
    await p2.getByRole('button', { name: 'act 2 — there is better' }).click()
    await dormir(400)
    const cB = platL(await p2.locator('body').innerText())
    const signable = await p2.getByRole('button', { name: 'sign and send' }).isEnabled()
    note(`HORS . acte 2 sans preparation : « sign and send » actif = ${signable}`)
    note(`HORS . acte 2 sans preparation, message : ${(cB.match(/nothing to sign until[^\n]{0,80}/) ?? ['(absent)'])[0]}`)
    note(`HORS . acte 2 sans preparation, etat envoi : ${(cB.match(/SANS_PLANCHER|PAS_DE_PROPOSITION|PRET|NON_DEMANDE/) ?? ['(absent)'])[0]}`)
    note(`HORS . acte 2 sans preparation, remplacement : ${(cB.match(/the bridge has not returned one[^\n]{0,110}/) ?? ['(absent)'])[0]}`)
    expect.soft(signable, 'rien n est signable sans preparation').toBe(false)
    n += 1
    await p2.screenshot({ path: resolve(DOSSIER, `${String(n).padStart(2, '0')}-hors-acte2-sans-acte1.png`), fullPage: true })
    console.log(`  IMG ${resolve(DOSSIER, `${String(n).padStart(2, '0')}-hors-acte2-sans-acte1.png`)}`)

    /* (c) changer d'acte au milieu */
    await p2.getByRole('button', { name: 'act 1 — do not sign' }).click()
    await p2.getByRole('button', { name: 'prepare on the fork' }).click()
    await attendrePreparation(p2)
    await p2.getByRole('button', { name: 'act 2 — there is better' }).click()
    await dormir(500)
    const cC = platL(await p2.locator('body').innerText())
    const signable2 = await p2.getByRole('button', { name: 'sign and send' }).isEnabled()
    note(`HORS . bascule acte1 -> acte2 sans preparer l acte 2 : « sign and send » actif = ${signable2}`)
    note(`HORS . le journal dit encore : ${(cC.match(/transaction prepared for act «[^»]*»/) ?? ['(absent)'])[0]}`)
    note(`HORS . la ligne balances dit : ${(cC.match(/balances [^\n]{0,110}/) ?? ['(absent)'])[0]}`)
    note(`HORS . le comparatif dit : ${(cC.match(/measured gap [^\n]{0,80}/) ?? ['(absent)'])[0]}`)
    note(`HORS . pageerror sur la page fraiche : ${err2.length} ${err2.join(' | ')}`)
    n += 1
    await p2.screenshot({ path: resolve(DOSSIER, `${String(n).padStart(2, '0')}-hors-bascule-acte.png`), fullPage: true })
    console.log(`  IMG ${resolve(DOSSIER, `${String(n).padStart(2, '0')}-hors-bascule-acte.png`)}`)
    await p2.close()

    /* (d) le portefeuille refuse (4001) sur eth_sendTransaction */
    await page.getByRole('button', { name: 'act 2 — there is better' }).click()
    await page.getByRole('button', { name: 'prepare on the fork' }).click()
    await attendrePreparation(page)
    await page.evaluate(() => ((window as any).__audit.refuserEnvoi = true))
    await page.getByRole('button', { name: 'sign and send' }).click()
    let ditWallet = '(rien)'
    try {
      await expect(page.locator('text=/declined in the wallet/i').first()).toBeVisible({ timeout: 25_000 })
      ditWallet = platL(await page.locator('text=/declined in the wallet/i').first().innerText())
    } catch {
      ditWallet = '(la page n a rien dit en 25 s)'
    }
    note(`HORS . refus du portefeuille, la page dit : « ${ditWallet} »`)
    expect.soft(ditWallet, 'la page nomme le refus du portefeuille').toContain('declined in the wallet')
    await page.evaluate(() => ((window as any).__audit.refuserEnvoi = false))
    const envois3 = await page.evaluate(() => (window as any).__audit.envois as number)
    note(`HORS . eth_sendTransaction cumules apres le refus : ${envois3} (dont 1 seul reellement parti)`)
    await shot(page, 'hors-refus-portefeuille')
  } finally {
    /* ================================================== 5. REMBOBINAGE, quoi qu il arrive */
    const avantRev = await bloc().catch(() => -1)
    note(`REMBOBINAGE . bloc avant : ${avantRev}`)
    const tRev = Date.now()
    try {
      await page.getByRole('button', { name: 'reset the fork' }).click({ timeout: 10_000 })
      await expect(
        page.locator('text=/back to block|back to the snapshot|snapshot_refuse|aucun_snapshot/i').first(),
      ).toBeVisible({ timeout: 40_000 })
      note(
        `REMBOBINAGE . la page dit : « ${platL(
          await page
            .locator('text=/back to block|back to the snapshot|snapshot_refuse|aucun_snapshot/i')
            .first()
            .innerText(),
        )} »`,
      )
    } catch (e) {
      note(`REMBOBINAGE . le bouton de la page n a pas abouti : ${(e as Error).message.slice(0, 160)}`)
    }
    tic('REMBOBINAGE . « reset the fork » depuis la page', Date.now() - tRev)

    // Et en direct, pour ne rien laisser de sale.
    const rev = await (
      await fetch(`${PONT}/demo/revenir`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
    ).json()
    note(`REMBOBINAGE . POST /pont/demo/revenir : ${JSON.stringify(rev)}`)
    let apresRev = await bloc().catch(() => -1)
    note(`REMBOBINAGE . bloc apres le pont : ${apresRev}`)
    if (apresRev !== BLOC_EPINGLE) {
      note(`REMBOBINAGE . le pont N A PAS suffi : on restaure la sauvegarde ${sauvegarde}`)
      await rpc('evm_revert', [sauvegarde])
      apresRev = await bloc().catch(() => -1)
      note(`REMBOBINAGE . bloc apres le filet : ${apresRev}`)
      // Le pont tient un snapshot devenu invalide : on lui en fait reprendre un valide.
      const rattrapage = await (
        await fetch(`${PONT}/demo/preparer`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ adresse: COMPTE, acte: 'stop' }),
        })
      ).json()
      note(`REMBOBINAGE . le pont reprend un snapshot valide : ${rattrapage.snapshot} (bloc ${await bloc()})`)
    }
    await shot(page, 'rembobinage')
    expect.soft(apresRev, 'le fork est revenu au bloc epingle').toBe(BLOC_EPINGLE)

    await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => undefined)
    await expect(page.locator('text=/snapshot 0x/').first())
      .toBeVisible({ timeout: 30_000 })
      .catch(() => undefined)
    const fin = await page
      .locator('div')
      .filter({ hasText: /^fork .*snapshot/ })
      .last()
      .innerText()
      .catch(() => '(illisible)')
    note(`REMBOBINAGE . bandeau final : ${platL(fin)}`)
    await shot(page, 'etat-final')

    note(`TOTAL erreurs console : ${consoleErreurs.length}`)
    for (const e of consoleErreurs) note(`   CONSOLE ${e}`)
    note(`TOTAL pageerror : ${pageErreurs.length}`)
    for (const e of pageErreurs) note(`   PAGEERROR ${e}`)
    note(`TOTAL requetes reseau echouees : ${reseauEchecs.length}`)
    for (const e of reseauEchecs) note(`   RESEAU ${e}`)
    expect.soft(consoleErreurs.length, 'zero erreur console').toBe(0)
    expect.soft(pageErreurs.length, 'zero pageerror').toBe(0)

    writeFileSync(
      resolve(DOSSIER, 'releve.json'),
      JSON.stringify(
        { chrono, lents: chrono.filter((c) => c.ms > 10_000), consoleErreurs, pageErreurs, reseauEchecs, notes },
        null,
        2,
      ),
    )
    console.log('\n================ CHRONO ================')
    for (const c of chrono)
      console.log(`  ${(c.ms / 1000).toFixed(2).padStart(8)} s  ${c.etape}${c.ms > 10_000 ? '   <<<< > 10 s' : ''}`)
    await ctx.close()
  }
})
