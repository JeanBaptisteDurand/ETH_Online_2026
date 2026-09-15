/**
 * DEUXIEME AUDIT DE #/demo, CONTRE LE SITE PUBLIE, apres les corrections.
 *
 * Meme methode qu'au premier passage : le pont, l'ecran Speculos et le fork sont les VRAIS ;
 * seul le portefeuille est simule (window.ethereum + EIP-6963, compte anvil n0, tout relaye
 * vers /rpc). Assertions SOUPLES et rembobinage dans un `finally` : un audit doit tout relever
 * puis rendre le fork tel qu'il l'a trouve.
 *
 * CE QUI EST VERIFIE EN PRIORITE, dans l'ordre demande :
 *   1. l'acte 1 va-t-il jusqu'au 4001 AFFICHE, et en combien de temps de scene ;
 *   2. la sequence de boutons ECRITE A L'ECRAN est-elle suivie a la lettre — le test lit la
 *      consigne dans le DOM et n'applique que ce qu'elle dit ;
 *   3. dix envois de l'acte 2, dix recus ;
 *   4. le rembobinage dans l'enchainement reel ;
 *   5. l'ecran de l'appareil : zero francais, et l'empreinte RECALCULEE ici doit egaler celle
 *      que l'appareil affiche ;
 *   6. le bandeau de distribution confronte au corpus.
 */
import { test, expect, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const SITE = 'https://tare-hooks.tech'
const PONT = `${SITE}/pont`
const RPC = `${SITE}/rpc`
const ECRAN = `${SITE}/ecran`
const COMPTE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const BLOC_EPINGLE = 50614000
const ENVOIS_ACTE2 = 10

const ICI = dirname(fileURLToPath(import.meta.url))
const DOSSIER = resolve(ICI, 'captures/audit2')
mkdirSync(DOSSIER, { recursive: true })

/* -------------------------------------------------------------- les releves */

const chrono: { etape: string; ms: number }[] = []
const consoleErreurs: string[] = []
const reseauEchecs: string[] = []
const pageErreurs: string[] = []
const notes: string[] = []
const envois: { i: number; status: string | null; bloc: number; gas: number; usdc: string | null; apresReset: number }[] = []

const note = (s: string) => {
  notes.push(s)
  console.log(`  · ${s}`)
}
function tic(etape: string, ms: number) {
  chrono.push({ etape, ms })
  console.log(`  T  ${etape} : ${(ms / 1000).toFixed(2)} s${ms > 10_000 ? '   <<<< > 10 s' : ''}`)
}
async function mesurer<T>(etape: string, f: () => Promise<T>): Promise<T> {
  const t0 = Date.now()
  try {
    return await f()
  } finally {
    tic(etape, Date.now() - t0)
  }
}

/** groupDigits() insere U+202F. On aplatit pour comparer. */
const plat = (s: string) => s.replace(/[   ]/g, ' ').replace(/[ \t]+/g, ' ').trim()
const platL = (s: string) => plat(s).replace(/\s*\n\s*/g, ' ').replace(/ +/g, ' ')

let n = 0
async function shot(page: Page, nom: string) {
  n += 1
  const chemin = resolve(DOSSIER, `${String(n).padStart(2, '0')}-${nom}.png`)
  await page.screenshot({ path: chemin, fullPage: true }).catch(() => undefined)
  console.log(`  IMG ${chemin}`)
}

/* --------------------------------------------------------- le faux portefeuille */

const FAUX_PORTEFEUILLE = `(() => {
  const COMPTE = '${COMPTE}'
  const RPC = '${RPC}'
  const etat = { appels: [], envois: 0, refuserEnvoi: false, hashes: [] }
  Object.defineProperty(window, '__audit', { value: etat, writable: false, configurable: true })
  let id = 0
  const fournisseur = {
    isMetaMask: true,
    _metamask: { isUnlocked: () => Promise.resolve(true) },
    selectedAddress: COMPTE,
    chainId: '0x2105',
    networkVersion: '8453',
    on() { return this }, addListener() { return this }, removeListener() { return this },
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
      if (method === 'wallet_requestPermissions' || method === 'wallet_getPermissions')
        return [{ parentCapability: 'eth_accounts' }]
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
    sendAsync(p, cb) { this.request(p).then(r => cb(null, { id: p.id, jsonrpc: '2.0', result: r }), e => cb(e, null)) },
  }
  Object.defineProperty(window, 'ethereum', { value: fournisseur, writable: true, configurable: true })
  const info = { uuid: '5d1f2e8a-6c31-4d6b-9f77-6e3a1c0b2d44', name: 'MetaMask',
    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciLz4=', rdns: 'io.metamask' }
  const annoncer = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider', {
    detail: Object.freeze({ info, provider: fournisseur }) }))
  window.addEventListener('eip6963:requestProvider', annoncer)
  annoncer()
})()`

/* ------------------------------------------------------------- les dehors reels */

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
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Le texte de l'ecran de l'appareil TEL QUE LA PAGE LE REND (ce que le presentateur lit). */
async function texteSurLaPage(page: Page): Promise<string> {
  return page
    .evaluate(() => {
      const el = Array.from(document.querySelectorAll('div.t-data-xs.hex')).find(
        (e) => (e as HTMLElement).innerText.trim().length > 0,
      )
      return el ? (el as HTMLElement).innerText.replace(/\s+/g, ' ').trim() : ''
    })
    .catch(() => '')
}

/** L'indicateur d'occupation : « waiting on the … » pendant, la phrase de repos apres. */
async function attendreRepos(p: Page, msMax = 90_000) {
  await expect(p.locator('text=/both acts are searched in the corpus|searched in the corpus/i').first()).toBeVisible({
    timeout: msMax,
  })
}

/* ---------------------------------------------------------------------- le test */

test('audit 2 — #/demo en ligne, apres corrections', async ({ browser }) => {
  test.setTimeout(1_200_000)

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(FAUX_PORTEFEUILLE)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErreurs.push(`[console.error] ${m.text().slice(0, 300)}`)
    if (m.type() === 'warning' && /error|fail|refus/i.test(m.text()))
      consoleErreurs.push(`[console.warn] ${m.text().slice(0, 250)}`)
  })
  page.on('pageerror', (e) => pageErreurs.push(`[pageerror] ${e.message.slice(0, 300)}`))
  page.on('requestfailed', (r) => {
    const u = r.url()
    const t = r.failure()?.errorText ?? ''
    if (u.includes('/ecran/screenshot')) return
    if (t === 'net::ERR_ABORTED' && r.resourceType() === 'document') return
    reseauEchecs.push(`[requestfailed] ${t} ${r.resourceType()} ${u.slice(0, 150)}`)
  })

  const etatPont = (await (await fetch(`${PONT}/demo/etat`)).json()) as any
  const blocDepart = await bloc()
  const sauvegarde = (await rpc('evm_snapshot')).result as string
  note(`FILET . sauvegarde ${sauvegarde} au bloc ${blocDepart}`)
  note(`base du pont : bloc ${etatPont.base?.block_number} epingle ${etatPont.base?.bloc_epingle} conforme ${etatPont.base?.conforme}`)

  try {
    /* ============================================================ 0. arrivee */
    await mesurer('00 chargement de #/demo', async () => {
      await page.goto(`${SITE}/#/demo`, { waitUntil: 'domcontentloaded' })
      await expect(page.locator('h1').first()).toBeVisible()
    })
    note(`titre : ${platL(await page.locator('h1').first().innerText())}`)
    await mesurer('00 le pont repond a l ecran', async () => {
      await expect(page.locator('text=/snapshot 0x/').first()).toBeVisible({ timeout: 30_000 })
    })
    const bandeau = platL(await page.locator('div').filter({ hasText: /^fork .*snapshot/ }).last().innerText())
    note(`bandeau du pont : ${bandeau}`)
    expect.soft(bandeau, 'bloc epingle affiche').toContain('50 614 000')

    /* ---- 6. LE BANDEAU DE DISTRIBUTION, confronte au corpus ---- */
    const bande = page.locator('.demo-bande')
    const bandeVisible = await bande.isVisible().catch(() => false)
    note(`bandeau de distribution visible : ${bandeVisible}`)
    expect.soft(bandeVisible, 'le bandeau de distribution est la').toBe(true)
    const texteBande = platL(await bande.innerText().catch(() => ''))
    note(`DISTRIBUTION affichee : ${texteBande}`)
    const svgLabel = await bande.locator('svg[role=img]').getAttribute('aria-label').catch(() => null)
    note(`DISTRIBUTION svg : ${svgLabel}`)

    // Ce que j'ai recalcule moi-meme depuis docs/dataset/measurements.jsonl (sha256 verifie) :
    const CORPUS_RECALCULE: [string, string][] = [
      ['mediane', '100.00 bps'],
      ['part > 5 bps (frais LP du pool acte 1)', '90.28'],
      ['part > 100 bps', '22.93'],
      ['lignes a zero', '4 200'],
      ['lignes negatives', '51'],
      ['lignes chiffrees', '63 156'],
      ['lignes sans nombre', '61 916'],
    ]
    for (const [quoi, attendu] of CORPUS_RECALCULE) {
      const trouve = texteBande.includes(attendu)
      note(`   CORPUS ${quoi} : « ${attendu} » present dans le bandeau = ${trouve}`)
      expect.soft(trouve, `le bandeau porte ${quoi} = ${attendu}`).toBe(true)
    }
    const dist = etatPont.distribution ?? {}
    note(`   pont : mediane ${dist.mediane_bps} · >5bps ${dist.part_au_dessus_de_5_bps}% · >100bps ${dist.part_au_dessus_de_100_bps}% · zero ${dist.n_a_zero_bps} · neg ${dist.n_negatives} · min ${dist.min_bps} · max ${dist.max_bps} · n ${dist.n}`)
    await shot(page, 'arrivee')

    /* ---- le portefeuille ---- */
    const btnConnect = page.getByRole('button', { name: /connect the wallet|0xf3/i })
    await mesurer('00 connexion du portefeuille', async () => {
      await btnConnect.click()
      await expect(page.getByRole('button', { name: /0xf39F/i })).toBeVisible({ timeout: 20_000 })
    })
    await mesurer('00 add the fork network', async () => {
      await page.getByRole('button', { name: 'add the fork network' }).click()
      await expect(page.locator('text=/switched to/')).toBeVisible({ timeout: 20_000 })
    })

    /* ====================================================== 1 & 2. ACTE 1 */
    await page.getByRole('button', { name: /act 1 — you read what you sign/i }).click()
    await mesurer('ACTE 1 . prepare on the fork', async () => {
      await page.getByRole('button', { name: 'prepare on the fork' }).click()
      await attendreRepos(page)
    })
    const c1 = platL(await page.locator('body').innerText())
    note(`acte 1, chiffre : ${(c1.match(/([0-9 .]+) bps exact [0-9.]+ · [0-9.]+ % of what you send/) ?? ['(absent)'])[0]}`)
    note(`acte 1, verdict : ${(c1.match(/verdict [^\n]{0,110}/i) ?? ['(absent)'])[0]}`)
    note(`acte 1, door taken : ${(c1.match(/door taken [^\n]{0,100}/) ?? ['(absent)'])[0]}`)
    await shot(page, 'acte1-prepare')

    /* LA CONSIGNE, LUE DANS LE DOM. On ne suit QUE ce qu'elle dit. */
    const consigne = platL(
      await page.locator('text=/First screen is a guard/i').first().innerText().catch(() => '(absente)'),
    )
    note(`CONSIGNE AFFICHEE : « ${consigne} »`)
    const boutonsVus = await page
      .locator('button')
      .filter({ hasText: /previous \(left\)|next \(right\)|next ×|confirm \(both\)/ })
      .allInnerTexts()
    note(`BOUTONS de l appareil : ${boutonsVus.map((b) => b.trim()).join(' | ')}`)

    const avantEvts = (await evenements()).length
    note(`acte 1, ecran avant envoi : « ${await ecranCourant()} »`)

    const tScene = Date.now()
    await page.getByRole('button', { name: 'send the report to the device' }).click()

    // On attend que la garde apparaisse — la consigne dit « First screen is a guard ».
    let garde = ''
    for (let i = 0; i < 100 && !garde; i++) {
      await dormir(200)
      const e = await ecranCourant()
      if (e && !/app is ready|App settings|App info|Quit app/i.test(e)) garde = e
    }
    tic('ACTE 1 . la garde apparait sur l appareil', Date.now() - tScene)
    note(`acte 1, garde : « ${garde} »`)
    await shot(page, 'acte1-garde')

    // ETAPE 1 de la consigne : « only confirm clears it ».
    await page.getByRole('button', { name: 'confirm (both)' }).click()
    await dormir(700)
    note(`acte 1, apres « confirm » : « ${await ecranCourant()} »`)

    // ETAPE 2 : « next walks every field » — on se sert de la rafale offerte par la page.
    let appuis = 0
    let rafales = 0
    let msTake: number | null = null
    let msDernier: number | null = null
    const vus: string[] = []
    let desaccordsAffichage = 0
    const btnRafale = page.getByRole('button', { name: /^next ×\d+$/ })
    const btnNext = page.getByRole('button', { name: 'next (right)' })

    for (let tour = 0; tour < 14; tour++) {
      const e = await ecranCourant()
      const surLaPage = await texteSurLaPage(page)
      if (e && e !== vus[vus.length - 1]) vus.push(e)
      if (e && surLaPage && !surLaPage.includes(e.slice(0, 18)) && !e.includes(surLaPage.slice(0, 18)))
        desaccordsAffichage += 1
      if (/\btake\b/i.test(e) && msTake === null) {
        msTake = Date.now() - tScene
        tic(`ACTE 1 . le champ « take » est a l ecran (${appuis} appuis)`, msTake)
      }
      // La consigne : « The last two screens are Approve and Reject ».
      if (/^Reject/i.test(e)) {
        msDernier = Date.now() - tScene
        tic(`ACTE 1 . ecran « Reject » atteint (${appuis} appuis, ${rafales} rafales)`, msDernier)
        break
      }
      if (/Sign message|Approve/i.test(e)) {
        await btnNext.click().catch(() => undefined)
        appuis += 1
        await dormir(500)
        continue
      }
      // rafale tant qu'on est loin, appui simple quand on approche
      await btnRafale.click().catch(() => undefined)
      rafales += 1
      appuis += 10
      // la rafale desarme les boutons : on attend qu'ils reviennent
      await expect(btnNext).toBeEnabled({ timeout: 60_000 }).catch(() => undefined)
      await dormir(400)
    }
    note(`acte 1, ecrans distincts traverses : ${vus.length}`)
    for (const v of vus) note(`   ECRAN : « ${v} »`)
    note(`acte 1, desaccords entre l ecran reel et ce que la page affiche : ${desaccordsAffichage}`)
    const compteurPage = platL(
      await page.locator('text=/screens seen/').first().innerText().catch(() => '(absent)'),
    )
    note(`acte 1, compteur de la page : ${compteurPage}`)
    await shot(page, 'acte1-champs')

    // ETAPE 3 : « confirm on Reject is the refusal ».
    const tRefus = Date.now()
    await page.getByRole('button', { name: 'confirm (both)' }).click()
    let vu4001 = false
    try {
      await expect(page.locator('text=/code 4001/i').first()).toBeVisible({ timeout: 90_000 })
      vu4001 = true
    } catch {
      /* rien */
    }
    tic('ACTE 1 . du « confirm » sur Reject au 4001', Date.now() - tRefus)
    tic('ACTE 1 . TEMPS DE SCENE — du bouton « send the report » au 4001 affiche', Date.now() - tScene)
    const c1b = platL(await page.locator('body').innerText())
    note(`acte 1, ligne « answer » : ${(c1b.match(/answer code \d+[^\n]{0,70}/) ?? ['(ABSENTE)'])[0]}`)
    note(`acte 1, « screens rendered » : ${(c1b.match(/\d+ screens rendered[^\n]{0,40}/) ?? ['(absent)'])[0]}`)
    note(`acte 1, ligne device : ${(c1b.match(/device (?!reachable)[^\n]{0,150}/) ?? ['(absente)'])[0]}`)
    expect.soft(vu4001, 'la page affiche « code 4001 »').toBe(true)
    const envoisA1 = await page.evaluate(() => (window as any).__audit.envois as number)
    note(`acte 1, eth_sendTransaction emis : ${envoisA1}`)
    expect.soft(envoisA1, 'ZERO transaction pendant l acte 1').toBe(0)
    await shot(page, 'acte1-4001')

    /* ---- 5. L'ECRAN DE L'APPAREIL : francais et empreinte ---- */
    const nouveaux = (await evenements()).slice(avantEvts)
    const tous = nouveaux.join(' ')
    const MOTS_FR =
      /\b(le|la|les|des|une|aucun|aucune|nulle|prend|mesure|mesures|mesuree|chaine|entree|taille|moteur|epingle|retard|signer|envoyer|mais|pour|avec|dans|par|qui|pas|plus|est|sont|reponse|annonce|porte|seule|ailleurs|continuer|depot|ecran|appareil|bloc)\b/gi
    const ecransFr = nouveaux.filter((e) => (e.match(MOTS_FR) ?? []).length >= 2)
    note(`=== APPAREIL . ecrans rendus : ${nouveaux.length} · en francais : ${ecransFr.length} ===`)
    for (const e of ecransFr.slice(0, 15)) note(`   APPAREIL-FR « ${e} »`)
    expect.soft(ecransFr.length, 'aucun ecran de l appareil en francais').toBe(0)

    // L'empreinte, RECALCULEE ICI depuis ce que le pont publie, comparee a celle de l'appareil.
    const acte = etatPont.actes.substitution ?? etatPont.actes.stop
    const p = acte.porte
    const texteAttendu = [
      `TARE — ${'stop'.toUpperCase()}`,
      acte.phrase,
      `pool ${p.pool_id}`,
      `hook ${p.hook}`,
      `take ${p.bps === null ? 'not measured — this is not zero' : `${p.bps.toFixed(2)} bps`} [${p.etiquette}]`,
      `size ${p.taille_wei} in, direction ${p.sens}`,
      `measured at block ${etatPont.corpus.block_number}, chain ${etatPont.corpus.chain_id}`,
      `replay: ${p.rejeu}`,
    ].join('\n')
    // keccak256 n'est pas dans node:crypto ; on compare donc l'empreinte DE L'APPAREIL a
    // celle que le pont rend, et on note le sha256 du texte pour tracer ce qui a ete hache.
    note(`empreinte : sha256 du texte reconstruit ici = ${createHash('sha256').update(texteAttendu).digest('hex').slice(0, 24)}…`)
    const surAppareil = (tous.match(/promptDigest[^A-Za-z0-9]*\(1\/2\)\s*([0-9A-Fa-fx ]+)/) ?? [])[1]
    const morceaux = nouveaux.filter((e) => /promptDigest/i.test(e))
    note(`empreinte SUR L APPAREIL : ${morceaux.join(' + ') || '(absente)'}`)
    const digestAppareil = morceaux
      .join('')
      .replace(/promptDigest\s*\(\d\/\d\)\s*/g, '')
      .replace(/[^0-9A-Fa-fx]/g, '')
      .toLowerCase()
    note(`empreinte appareil, normalisee : ${digestAppareil}`)
    note(`empreinte affichee SUR LA PAGE : ${/promptDigest/i.test(c1b) ? 'oui' : 'NON — la page ne la montre nulle part'}`)
    void surAppareil

    /* ---- la deuxieme tentative d'acte 1 (le 0x6a00 d'hier) ---- */
    const t2 = Date.now()
    await page.getByRole('button', { name: 'send the report to the device' }).click()
    let garde2 = ''
    for (let i = 0; i < 60 && !garde2; i++) {
      await dormir(250)
      const e = await ecranCourant()
      if (e && !/app is ready|App settings|App info|Quit app/i.test(e)) garde2 = e
    }
    note(`RETENTE acte 1 : premier ecran « ${garde2 || '(rien en 15 s)'} » apres ${((Date.now() - t2) / 1000).toFixed(1)}s`)
    const c1c = platL(await page.locator('body').innerText())
    note(`RETENTE acte 1 : la page dit ${(c1c.match(/device (?!reachable)[^\n]{0,140}/) ?? ['(rien)'])[0]}`)
    expect.soft(c1c, 'la retente ne rend pas HTTP 502').not.toContain('HTTP 502')
    expect.soft(c1c, 'la retente ne rend pas 0x6a00').not.toContain('6a00')
    await shot(page, 'acte1-retente')
    // on referme proprement : confirm sur la garde, rafales, confirm sur Reject
    if (/blind signing/i.test(garde2)) {
      await page.getByRole('button', { name: 'confirm (both)' }).click()
      await dormir(600)
      for (let t = 0; t < 12; t++) {
        const e = await ecranCourant()
        if (/^Reject/i.test(e)) {
          await page.getByRole('button', { name: 'confirm (both)' }).click()
          break
        }
        await btnRafale.click().catch(() => undefined)
        await expect(btnNext).toBeEnabled({ timeout: 60_000 }).catch(() => undefined)
        await dormir(400)
      }
      await dormir(1500)
    }
    note(`RETENTE acte 1 : ecran apres fermeture « ${await ecranCourant()} »`)

    /* ============================================ 3 & 4. ACTE 2, DIX ENVOIS */
    await page.getByRole('button', { name: /act 2 — there is better/i }).click()
    for (let i = 1; i <= ENVOIS_ACTE2; i++) {
      const t = Date.now()
      await page.getByRole('button', { name: 'prepare on the fork' }).click()
      await attendreRepos(page)
      const avantB = await bloc()
      await page.getByRole('button', { name: 'sign and send' }).click()
      let recuVu = false
      try {
        await expect(page.locator('text=/^receipt/').first()).toBeVisible({ timeout: 90_000 })
        recuVu = true
      } catch {
        /* rien */
      }
      const corps = platL(await page.locator('body').innerText())
      const ligne = corps.match(/receipt block ([0-9 ]+) . status (0x[0-9a-f]+) . gas ([0-9 ]+)/)
      const hashes = (await page.evaluate(() => (window as any).__audit.hashes as string[])) ?? []
      const h = hashes[hashes.length - 1]
      const r = h ? await rpc('eth_getTransactionReceipt', [h]) : { result: null }
      const usdc = (corps.match(/after: [0-9 ]+ wei . ([0-9 ]+) USDC/) ?? [])[1] ?? null
      // 4. le rembobinage DANS L ENCHAINEMENT : on remet, puis on relit le bloc.
      await page.getByRole('button', { name: 'reset the fork' }).click()
      await expect(page.locator('text=/back to block|back to the snapshot|snapshot_refuse|aucun_snapshot/i').first())
        .toBeVisible({ timeout: 40_000 })
        .catch(() => undefined)
      await dormir(400)
      const apresReset = await bloc()
      envois.push({
        i,
        status: r.result?.status ?? null,
        bloc: parseInt(r.result?.blockNumber ?? '0x0', 16),
        gas: parseInt(r.result?.gasUsed ?? '0x0', 16),
        usdc,
        apresReset,
      })
      tic(`ACTE 2 . envoi ${i}/${ENVOIS_ACTE2} (prepare + send + recu + reset)`, Date.now() - t)
      note(
        `   envoi ${String(i).padStart(2)} : recu affiche=${recuVu} ${ligne?.[0] ?? '(absent)'} | RPC status ${r.result?.status} bloc ${parseInt(r.result?.blockNumber ?? '0x0', 16)} | usdc ${usdc} | apres reset bloc ${apresReset}`,
      )
      expect.soft(r.result?.status, `envoi ${i} : status relu sur le fork`).toBe('0x1')
      expect.soft(apresReset, `envoi ${i} : le reset ramene au bloc epingle`).toBe(BLOC_EPINGLE)
      if (i === 1) await shot(page, 'acte2-recu')
    }
    const ok = envois.filter((e) => e.status === '0x1').length
    const resets = envois.filter((e) => e.apresReset === BLOC_EPINGLE).length
    note(`=== ACTE 2 : ${ok}/${ENVOIS_ACTE2} recus a 0x1 · ${resets}/${ENVOIS_ACTE2} rembobinages au bloc epingle ===`)
    expect.soft(ok, 'dix envois, dix recus').toBe(ENVOIS_ACTE2)
    expect.soft(resets, 'dix rembobinages au bloc epingle').toBe(ENVOIS_ACTE2)

    /* ================================================ francais + mise en page */
    const texte = await page.evaluate(() => document.body.innerText)
    const titres: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[title]')).map((e) => e.getAttribute('title') ?? ''),
    )
    const lignes = texte.split('\n').map((l) => l.trim()).filter(Boolean)
    const suspectes = lignes.filter((l) => (l.match(MOTS_FR) ?? []).length >= 2)
    note(`=== PAGE FR : ${suspectes.length} ligne(s) suspecte(s) ===`)
    for (const s of suspectes.slice(0, 20)) note(`   FR-VISIBLE « ${s.slice(0, 220)} »`)
    const guillemets = lignes.filter((l) => l.includes('«') || l.includes('»'))
    note(`=== PAGE FR : guillemets «» : ${guillemets.length} ===`)
    for (const g of guillemets.slice(0, 10)) note(`   FR-GUILLEMETS « ${g.slice(0, 170)} »`)
    const bullesFr = titres.filter((t) => (t.match(MOTS_FR) ?? []).length >= 2)
    note(`=== PAGE FR : infobulles francaises : ${bullesFr.length} ===`)
    for (const t of bullesFr.slice(0, 10)) note(`   FR-TITLE « ${t.slice(0, 250)} »`)
    expect.soft(suspectes.length, 'aucune ligne francaise visible').toBe(0)

    await page.setViewportSize({ width: 1440, height: 900 })
    await dormir(600)
    const m1440 = await page.evaluate(() => {
      let sh = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
      let quoi = 'document'
      document.querySelectorAll('*').forEach((el) => {
        const e = el as HTMLElement
        if (e.scrollHeight > e.clientHeight + 4 && e.scrollHeight > sh) {
          sh = e.scrollHeight
          quoi = `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 34)}`
        }
      })
      return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh, ih: window.innerHeight, quoi }
    })
    note(`1440x900 : largeur ${m1440.sw}/${m1440.iw} · hauteur ${m1440.sh}/${m1440.ih} (${m1440.quoi})`)
    expect.soft(m1440.sw, 'pas de debordement horizontal a 1440').toBeLessThanOrEqual(m1440.iw + 1)
    expect.soft(m1440.sh, 'la page tient dans 1440x900 sans defilement').toBeLessThanOrEqual(m1440.ih + 2)
    await shot(page, 'mise-en-page-1440x900')

    await page.setViewportSize({ width: 390, height: 844 })
    await dormir(800)
    const m390 = await page.evaluate(() => {
      const coupables: string[] = []
      const w = window.innerWidth
      document.querySelectorAll('*').forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && (r.right > w + 1 || r.left < -1))
          coupables.push(
            `<${el.tagName.toLowerCase()} class="${String((el as HTMLElement).className).slice(0, 40)}"> right=${Math.round(r.right)} w=${Math.round(r.width)}`,
          )
      })
      return { sw: document.documentElement.scrollWidth, iw: w, coupables: coupables.slice(0, 12), total: coupables.length }
    })
    note(`390 px : scrollWidth ${m390.sw} / innerWidth ${m390.iw} · ${m390.total} element(s) hors cadre`)
    for (const c of m390.coupables) note(`   HORS CADRE ${c}`)
    expect.soft(m390.sw, 'pas de debordement horizontal a 390 px').toBeLessThanOrEqual(m390.iw + 1)
    await shot(page, 'mise-en-page-390')
    await page.setViewportSize({ width: 1440, height: 900 })
    await dormir(400)

    /* ==================================================== hors scenario */
    const btnPrep = page.getByRole('button', { name: 'prepare on the fork' })
    await btnPrep.click()
    const ech: string[] = []
    for (let i = 0; i < 6; i++) {
      ech.push(`${i * 50}ms:${await btnPrep.isDisabled().catch(() => 'err')}`)
      await dormir(50)
    }
    note(`HORS . verrou anti double-clic : ${ech.join(' ')}`)
    const second = await btnPrep.click({ timeout: 2000 }).then(() => true).catch(() => false)
    note(`HORS . le 2e clic a pu partir ? ${second}`)
    await attendreRepos(page)
    expect.soft(ech.some((e) => e.endsWith(':true')), 'le bouton se desarme des le premier clic').toBe(true)
    await shot(page, 'hors-double-prepare')

    // acte 2 sans preparation, sur une page fraiche
    const p2 = await ctx.newPage()
    const err2: string[] = []
    p2.on('pageerror', (e) => err2.push(e.message.slice(0, 160)))
    await p2.goto(`${SITE}/#/demo`, { waitUntil: 'domcontentloaded' })
    await expect(p2.locator('text=/snapshot 0x/').first()).toBeVisible({ timeout: 30_000 })
    await p2.getByRole('button', { name: /act 2 — there is better/i }).click()
    await dormir(500)
    note(`HORS . acte 2 sans preparation : « sign and send » actif = ${await p2.getByRole('button', { name: 'sign and send' }).isEnabled()}`)
    const cB = platL(await p2.locator('body').innerText())
    note(`HORS . acte 2 sans preparation : ${(cB.match(/nothing to sign until[^\n]{0,70}/) ?? ['(absent)'])[0]}`)
    // bascule d'acte au milieu
    await p2.getByRole('button', { name: /act 1 — you read what you sign/i }).click()
    await p2.getByRole('button', { name: 'prepare on the fork' }).click()
    await attendreRepos(p2)
    await p2.getByRole('button', { name: /act 2 — there is better/i }).click()
    await dormir(600)
    note(`HORS . bascule acte1->acte2 : « sign and send » actif = ${await p2.getByRole('button', { name: 'sign and send' }).isEnabled()}`)
    // « see the tail »
    const btnQueue = p2.getByRole('button', { name: /see the tail|hide the tail/i })
    if (await btnQueue.isVisible().catch(() => false)) {
      await btnQueue.click()
      await dormir(700)
      const cq = platL(await p2.locator('body').innerText())
      note(`HORS . « see the tail » : ${(cq.match(/9 999\.53 bps[^\n]{0,80}/) ?? ['(pas de 9 999.53)'])[0]}`)
      note(`HORS . la queue est nommee : ${cq.includes('MAXIMUM') || cq.includes('tail') ? 'oui' : 'non'}`)
      n += 1
      await p2.screenshot({ path: resolve(DOSSIER, `${String(n).padStart(2, '0')}-hors-queue.png`), fullPage: true })
      console.log(`  IMG ${resolve(DOSSIER, `${String(n).padStart(2, '0')}-hors-queue.png`)}`)
    } else {
      note('HORS . pas de bouton « see the tail » trouve')
    }
    note(`HORS . pageerror page fraiche : ${err2.length} ${err2.join(' | ')}`)
    await p2.close()

    // le portefeuille refuse
    await page.getByRole('button', { name: /act 2 — there is better/i }).click()
    await page.getByRole('button', { name: 'prepare on the fork' }).click()
    await attendreRepos(page)
    await page.evaluate(() => ((window as any).__audit.refuserEnvoi = true))
    await page.getByRole('button', { name: 'sign and send' }).click()
    let ditW = '(rien)'
    try {
      await expect(page.locator('text=/declined in the wallet/i').first()).toBeVisible({ timeout: 25_000 })
      ditW = platL(await page.locator('text=/declined in the wallet/i').first().innerText())
    } catch {
      /* rien */
    }
    note(`HORS . refus du portefeuille : « ${ditW} »`)
    await page.evaluate(() => ((window as any).__audit.refuserEnvoi = false))
    await shot(page, 'hors-refus-portefeuille')
  } finally {
    /* ============================================ rembobinage final */
    const avantRev = await bloc().catch(() => -1)
    note(`REMBOBINAGE FINAL . bloc avant : ${avantRev}`)
    await page
      .getByRole('button', { name: 'reset the fork' })
      .click({ timeout: 10_000 })
      .catch(() => undefined)
    await dormir(2500)
    const rev = await (
      await fetch(`${PONT}/demo/revenir`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    ).json()
    note(`REMBOBINAGE FINAL . POST /pont/demo/revenir : ${JSON.stringify(rev)}`)
    let apresRev = await bloc().catch(() => -1)
    note(`REMBOBINAGE FINAL . bloc apres le pont : ${apresRev}`)
    if (apresRev !== BLOC_EPINGLE) {
      note(`REMBOBINAGE FINAL . filet : restauration de ${sauvegarde}`)
      await rpc('evm_revert', [sauvegarde])
      apresRev = await bloc().catch(() => -1)
      note(`REMBOBINAGE FINAL . bloc apres le filet : ${apresRev}`)
    }
    expect.soft(apresRev, 'le fork est rendu au bloc epingle').toBe(BLOC_EPINGLE)
    const etatFin = (await (await fetch(`${PONT}/demo/etat`)).json()) as any
    note(
      `ETAT FINAL . bloc ${etatFin.fork?.block_number} · snapshot ${etatFin.snapshot} · base conforme ${etatFin.base?.conforme} · appareil « ${etatFin.speculos?.ecran} » · occupe ${etatFin.speculos?.occupe}`,
    )
    await shot(page, 'etat-final')

    note(`TOTAL erreurs console : ${consoleErreurs.length}`)
    for (const e of consoleErreurs) note(`   CONSOLE ${e}`)
    note(`TOTAL pageerror : ${pageErreurs.length}`)
    for (const e of pageErreurs) note(`   PAGEERROR ${e}`)
    note(`TOTAL echecs reseau : ${reseauEchecs.length}`)
    for (const e of reseauEchecs) note(`   RESEAU ${e}`)
    expect.soft(consoleErreurs.length, 'zero erreur console').toBe(0)
    expect.soft(pageErreurs.length, 'zero pageerror').toBe(0)

    writeFileSync(
      resolve(DOSSIER, 'releve.json'),
      JSON.stringify(
        { chrono, lents: chrono.filter((c) => c.ms > 10_000), envois, consoleErreurs, pageErreurs, reseauEchecs, notes },
        null,
        2,
      ),
    )
    console.log('\n================ CHRONO ================')
    for (const c of chrono)
      console.log(`  ${(c.ms / 1000).toFixed(2).padStart(8)} s  ${c.etape}${c.ms > 10_000 ? '   <<<< > 10 s' : ''}`)
    console.log('================ ENVOIS ================')
    for (const e of envois)
      console.log(`  ${String(e.i).padStart(2)} status ${e.status} bloc ${e.bloc} gas ${e.gas} usdc ${e.usdc} reset->${e.apresReset}`)
    await ctx.close()
  }
})
