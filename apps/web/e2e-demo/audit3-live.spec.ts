/**
 * TROISIEME AUDIT — la page refondue, contre le site publie.
 *
 * Services REELS (pont, ecran Speculos, fork). Seul le portefeuille est simule : un
 * window.ethereum minimal, annonce en EIP-6963, qui COMPTE lui-meme les eth_sendTransaction
 * qui lui parviennent. C'est ce compte-la qu'on oppose au « wallet opened N time(s) » affiche.
 *
 * Assertions souples, rembobinage dans un `finally`.
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
const DOSSIER = resolve(ICI, 'captures/audit3')
mkdirSync(DOSSIER, { recursive: true })

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
  console.log(`  T  ${etape} : ${(ms / 1000).toFixed(2)} s`)
}
const plat = (s: string) => s.replace(/ | | /g, ' ').replace(/[ \t]+/g, ' ').trim()
const platL = (s: string) => plat(s).replace(/\s*\n\s*/g, ' ').replace(/ +/g, ' ')

let n = 0
async function shot(page: Page, nom: string) {
  n += 1
  const c = resolve(DOSSIER, `${String(n).padStart(2, '0')}-${nom}.png`)
  await page.screenshot({ path: c, fullPage: true }).catch(() => undefined)
  console.log(`  IMG ${c}`)
}

const FAUX = `(() => {
  const C = '${COMPTE}'
  const R = '${RPC}'
  const etat = { ouvertures: 0, hashes: [], refuser: false, txs: [] }
  Object.defineProperty(window, '__audit', { value: etat, writable: false, configurable: true })
  let i = 0
  const f = {
    isMetaMask: true,
    on() { return this }, addListener() { return this },
    removeListener() { return this }, removeAllListeners() { return this },
    async request(a) {
      const m = a && a.method, p = (a && a.params) || []
      if (m === 'eth_requestAccounts' || m === 'eth_accounts') return [C]
      if (m === 'eth_chainId') return '0x2105'
      if (m === 'net_version') return '8453'
      if (m === 'wallet_addEthereumChain' || m === 'wallet_switchEthereumChain') return null
      if (m === 'wallet_requestPermissions' || m === 'wallet_getPermissions')
        return [{ parentCapability: 'eth_accounts' }]
      if (m === 'eth_sendTransaction') {
        etat.ouvertures += 1
        etat.txs.push(p[0] || null)
        if (etat.refuser) { const e = new Error('User denied transaction signature.'); e.code = 4001; throw e }
      }
      const r = await fetch(R, { method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: ++i, method: m, params: p }) })
      const j = await r.json()
      if (j.error) throw Object.assign(new Error(j.error.message), { code: j.error.code })
      if (m === 'eth_sendTransaction') etat.hashes.push(j.result)
      return j.result
    },
  }
  Object.defineProperty(window, 'ethereum', { value: f, writable: true, configurable: true })
  const info = { uuid: 'u1', name: 'MetaMask', icon: 'data:,', rdns: 'io.metamask' }
  const an = () => window.dispatchEvent(new CustomEvent('eip6963:announceProvider',
    { detail: Object.freeze({ info, provider: f }) }))
  window.addEventListener('eip6963:requestProvider', an)
  an()
})()`

async function ecranCourant(): Promise<string> {
  try {
    const r = await fetch(`${ECRAN}/events?currentscreenonly=true`)
    const j = (await r.json()) as { events?: { text?: string }[] }
    return (j.events ?? []).map((e) => e.text ?? '').join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}
async function evenements(): Promise<string[]> {
  try {
    const r = await fetch(`${ECRAN}/events`)
    const j = (await r.json()) as { events?: { text?: string }[] }
    return (j.events ?? []).map((e) => e.text ?? '')
  } catch {
    return []
  }
}
async function rpc(m: string, p: unknown[] = []): Promise<any> {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }),
  })
  return r.json()
}
const bloc = async () => parseInt((await rpc('eth_blockNumber')).result, 16)
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms))

const ouverturesPage = async (page: Page): Promise<number | null> => {
  const t = await page.locator('text=/time\\(s\\) · counted, not asserted/').first().innerText().catch(() => '')
  const m = plat(t).match(/(\d+)\s*time\(s\)/)
  return m ? Number(m[1]) : null
}
const ouverturesVraies = (page: Page) => page.evaluate(() => (window as any).__audit.ouvertures as number)

/** Conduit l'appareil jusqu'a l'ecran voulu, avec les boutons DE LA PAGE. */
async function conduireAppareil(
  page: Page,
  jusqua: 'Sign' | 'Reject',
  opts: { rafale: boolean } = { rafale: true },
): Promise<{ appuis: number; vus: string[]; take: string | null; msTake: number | null }> {
  const t0 = Date.now()
  const vus: string[] = []
  let appuis = 0
  let take: string | null = null
  let msTake: number | null = null
  const next = page.getByRole('button', { name: 'next (right)' })
  const raf = page.getByRole('button', { name: /^×10$/ })
  const confirm = page.getByRole('button', { name: 'confirm (both)' })

  // 1. la garde de signature aveugle
  for (let i = 0; i < 80; i++) {
    const e = await ecranCourant()
    if (/blind signing/i.test(e)) {
      await confirm.click().catch(() => undefined)
      appuis += 1
      await dormir(700)
      break
    }
    await dormir(200)
  }
  // 2. les champs
  for (let tour = 0; tour < 70; tour++) {
    const e = await ecranCourant()
    if (e && e !== vus[vus.length - 1]) vus.push(e)
    if (/\btake\b/i.test(e) && take === null) {
      take = e
      msTake = Date.now() - t0
    }
    if (jusqua === 'Sign' && /^Sign message/i.test(e)) break
    if (jusqua === 'Reject' && /^Reject message/i.test(e)) break
    if (opts.rafale) {
      await raf.click().catch(() => undefined)
      appuis += 10
      await page
        .waitForFunction(
          () => {
            const b = [...document.querySelectorAll('button')].find((x) => /next \(right\)/.test(x.textContent || ''))
            return b && !(b as HTMLButtonElement).disabled
          },
          null,
          { timeout: 60_000 },
        )
        .catch(() => undefined)
      await dormir(350)
    } else {
      await next.click().catch(() => undefined)
      appuis += 1
      await dormir(230)
    }
  }
  return { appuis, vus, take, msTake }
}

/* --------------------------------------------------------------------- le test */

test('audit 3 — le parcours refondu, en ligne', async ({ browser }) => {
  test.setTimeout(1_500_000)

  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  await ctx.addInitScript(FAUX)
  const page = await ctx.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErreurs.push(`[console.error] ${m.text().slice(0, 250)}`)
  })
  page.on('pageerror', (e) => pageErreurs.push(`[pageerror] ${e.message.slice(0, 250)}`))
  page.on('requestfailed', (r) => {
    const t = r.failure()?.errorText ?? ''
    if (r.url().includes('/ecran/screenshot')) return
    if (t === 'net::ERR_ABORTED' && r.resourceType() === 'document') return
    reseauEchecs.push(`${t} ${r.resourceType()} ${r.url().slice(0, 130)}`)
  })

  const etatPont = (await (await fetch(`${PONT}/demo/etat`)).json()) as any
  const sauvegarde = (await rpc('evm_snapshot')).result as string
  note(`FILET . sauvegarde ${sauvegarde} au bloc ${await bloc()}`)
  note(`pont : horloge_figee=${etatPont.base?.horloge_figee} conforme=${etatPont.base?.conforme} bloc=${etatPont.base?.block_number}`)

  const prep = (await (
    await fetch(`${PONT}/demo/preparer`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ adresse: COMPTE, acte: 'substitution' }),
    })
  ).json()) as any
  note(`pont : prompt_digest=${prep.prompt_digest} echeance=${prep.echeance} plancher=${prep.plancher}/cot ${prep.cotation}`)

  try {
    /* ==================================================== A. arrivee */
    await mesurerA()
    async function mesurerA() {
      const t = Date.now()
      await page.goto(`${SITE}/#/demo`, { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('button', { name: /^swap 0\.000001 ETH/ })).toBeVisible({ timeout: 30_000 })
      tic('A . chargement jusqu au bouton de swap', Date.now() - t)
    }
    await page.getByRole('button', { name: /connect the wallet|0xf3/i }).click()
    await dormir(1200)
    await page.getByRole('button', { name: /add the fork network|network/i }).first().click().catch(() => undefined)
    await dormir(800)

    const corps0 = platL(await page.locator('body').innerText())
    note(`ETAT 1 (repos) : ${(corps0.match(/two routes[^]{0,160}/) ?? ['(absent)'])[0]}`)
    note(`routes : your route recoit ${(corps0.match(/your route[^]{0,220}receives ([0-9 ]+)/) ?? [])[1] ?? '?'} · cheaper ${(corps0.match(/cheaper gate[^]{0,220}receives ([0-9 ]+)/) ?? [])[1] ?? '?'}`)
    note(`paires : ${(corps0.match(/\d+ named of [0-9 ]+[^]{0,20}/) ?? ['(absent)'])[0]}`)

    /* 5. L'EMPREINTE affichee sur la page */
    const digestPage = await page
      .locator('text=/^0x[0-9a-f]{10}…[0-9a-f]{8}$/i')
      .first()
      .innerText()
      .catch(() => '')
    const digestComplet = await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find((x) => /^copy$/i.test((x.textContent || '').trim()))
      return b?.getAttribute('data-copie') ?? null
    })
    note(`EMPREINTE page (abregee) : ${plat(digestPage)} | pont : ${prep.prompt_digest}`)
    const abrege = `${prep.prompt_digest.slice(0, 12)}…${prep.prompt_digest.slice(-8)}`
    expect.soft(plat(digestPage), 'l empreinte affichee est celle du pont').toBe(abrege)
    void digestComplet

    /* 6. LE SELECTEUR DE PAIRES, confronte a mon propre calcul du corpus */
    expect.soft(corps0, 'le selecteur annonce 8 151 paires mesurees').toMatch(/of 8[  ]151/)
    note(`CORPUS recalcule par moi : 8 151 paires orientees mesurees ; ETH→USDC a 1e12 : 4 portes mesurees, pire 4.0933 bps (0x2fcc…), meilleure 0 bps (0x0640…)`)
    expect.soft(corps0, 'la porte chere du corpus').toContain('4.0933 bps')
    expect.soft(corps0, 'la porte gratuite du corpus').toContain('0 bps')

    await shot(page, 'etat1-repos')
    const m1 = await mesureMiseEnPage(page)
    note(`ETAT 1 . 1440x900 : largeur ${m1.sw}/${m1.iw} hauteur ${m1.sh}/${m1.ih}`)
    expect.soft(m1.sh, 'ETAT 1 tient dans 1440x900').toBeLessThanOrEqual(m1.ih + 2)

    /* ======================================= B. ISSUE 1 — refuser */
    const tB = Date.now()
    await page.getByRole('button', { name: /^swap 0\.000001 ETH/ }).click()
    await expect(page.getByRole('button', { name: /^refuse$/ })).toBeEnabled({ timeout: 40_000 })
    tic('B . du clic « swap » aux trois boutons', Date.now() - tB)
    await shot(page, 'etat2-la-garde-demande')
    const m2 = await mesureMiseEnPage(page)
    note(`ETAT 2 . 1440x900 : hauteur ${m2.sh}/${m2.ih}`)
    expect.soft(m2.sh, 'ETAT 2 tient dans 1440x900').toBeLessThanOrEqual(m2.ih + 2)

    await page.getByRole('button', { name: /^refuse$/ }).click()
    await expect(page.locator('text=/code 4001/').first()).toBeVisible({ timeout: 30_000 })
    tic('B . ISSUE « refuse » — du clic swap au 4001 affiche', Date.now() - tB)
    const corpsB = platL(await page.locator('body').innerText())
    note(`B . la page dit : ${(corpsB.match(/code 4001[^]{0,70}/) ?? ['(absent)'])[0]}`)
    const pageB = await ouverturesPage(page)
    const vraiB = await ouverturesVraies(page)
    note(`B . COMPTEUR : page dit ${pageB} · mon fournisseur a vu ${vraiB}`)
    expect.soft(pageB, 'refus : le compteur affiche 0').toBe(0)
    expect.soft(vraiB, 'refus : le portefeuille n a jamais ete ouvert').toBe(0)
    expect.soft(pageB, 'le compteur affiche dit la verite').toBe(vraiB)
    await shot(page, 'issue1-refuse')

    /* ======================================= C. ISSUE 2 — go anyway */
    await page.getByRole('button', { name: /^replay|^reset$/ }).first().click().catch(() => undefined)
    await dormir(1500)
    const tC = Date.now()
    await page.getByRole('button', { name: /^swap 0\.000001 ETH/ }).click()
    await expect(page.getByRole('button', { name: /^go anyway/ })).toBeEnabled({ timeout: 40_000 })
    await page.getByRole('button', { name: /^go anyway/ }).click()
    // l'appareil est interroge : on le conduit EN APPUIS SIMPLES pour compter et lire
    const dC = await conduireAppareil(page, 'Sign', { rafale: false })
    note(`C . appuis jusqu a « Sign message » : ${dC.appuis} · ecrans distincts : ${dC.vus.length}`)
    note(`C . champ take vu : ${dC.take ?? '(JAMAIS)'} apres ${dC.msTake === null ? '?' : (dC.msTake / 1000).toFixed(1) + ' s'}`)
    for (const v of dC.vus) note(`   ECRAN ${v}`)
    await page.getByRole('button', { name: 'confirm (both)' }).click()
    let recuC = false
    try {
      await expect(page.locator('text=/status 0x1|received/i').first()).toBeVisible({ timeout: 90_000 })
      recuC = true
    } catch {
      /* rien */
    }
    tic('C . ISSUE « go anyway » — du clic swap au resultat', Date.now() - tC)
    const corpsC = platL(await page.locator('body').innerText())
    const hashesC = (await page.evaluate(() => (window as any).__audit.hashes as string[])) ?? []
    const rC = hashesC.length ? await rpc('eth_getTransactionReceipt', [hashesC[hashesC.length - 1]]) : { result: null }
    note(`C . recu affiche=${recuC} · RPC status ${rC.result?.status} bloc ${parseInt(rC.result?.blockNumber ?? '0x0', 16)}`)
    note(`C . resultat : ${(corpsC.match(/(received|receipt)[^]{0,120}/i) ?? ['(absent)'])[0]}`)
    const pageC = await ouverturesPage(page)
    const vraiC = await ouverturesVraies(page)
    note(`C . COMPTEUR : page ${pageC} · fournisseur ${vraiC}`)
    expect.soft(pageC, 'go anyway : le compteur dit la verite').toBe(vraiC)
    expect.soft(vraiC, 'go anyway : une seule ouverture').toBe(1)
    expect.soft(rC.result?.status, 'go anyway : la transaction d origine passe').toBe('0x1')
    // c'est bien la porte CHERE qui est partie ?
    const txC = (await page.evaluate(() => (window as any).__audit.txs as any[]))?.slice(-1)[0]
    note(`C . transaction partie : to ${txC?.to} value ${txC?.value} data ${String(txC?.data).slice(0, 26)}…`)
    await shot(page, 'issue2-go-anyway')
    const m3 = await mesureMiseEnPage(page)
    note(`ETAT 3 . 1440x900 : hauteur ${m3.sh}/${m3.ih}`)
    expect.soft(m3.sh, 'ETAT 3 tient dans 1440x900').toBeLessThanOrEqual(m3.ih + 2)

    /* ======================================= D. ISSUE 3 — substitute */
    await page.getByRole('button', { name: /^reset$/ }).first().click()
    await dormir(2500)
    note(`D . bloc apres reset : ${await bloc()}`)
    const avantD = await ouverturesVraies(page)
    const tD = Date.now()
    await page.getByRole('button', { name: /^swap 0\.000001 ETH/ }).click()
    await expect(page.getByRole('button', { name: /^substitute/ })).toBeEnabled({ timeout: 40_000 })
    await page.getByRole('button', { name: /^substitute/ }).click()
    const dD = await conduireAppareil(page, 'Sign', { rafale: true })
    note(`D . appuis (rafales) jusqu a « Sign message » : ${dD.appuis}`)
    await page.getByRole('button', { name: 'confirm (both)' }).click()
    let recuD = false
    try {
      await expect(page.locator('text=/status 0x1|received/i').first()).toBeVisible({ timeout: 90_000 })
      recuD = true
    } catch {
      /* rien */
    }
    tic('D . ISSUE « substitute » — du clic swap au resultat', Date.now() - tD)
    const hashesD = (await page.evaluate(() => (window as any).__audit.hashes as string[])) ?? []
    const rD = hashesD.length ? await rpc('eth_getTransactionReceipt', [hashesD[hashesD.length - 1]]) : { result: null }
    note(`D . recu affiche=${recuD} · RPC status ${rD.result?.status} bloc ${parseInt(rD.result?.blockNumber ?? '0x0', 16)}`)
    const pageD = await ouverturesPage(page)
    const vraiD = await ouverturesVraies(page)
    note(`D . COMPTEUR : page ${pageD} · fournisseur ${vraiD} (etait ${avantD} avant)`)
    expect.soft(pageD, 'substitute : le compteur dit la verite').toBe(vraiD)
    expect.soft(rD.result?.status, 'substitute : la transaction de remplacement passe').toBe('0x1')
    const corpsD = platL(await page.locator('body').innerText())
    note(`D . panneau final : ${(corpsD.match(/(received|kept|would have)[^]{0,180}/i) ?? ['(absent)'])[0]}`)
    const txD = (await page.evaluate(() => (window as any).__audit.txs as any[]))?.slice(-1)[0]
    note(`D . transaction partie : to ${txD?.to} value ${txD?.value} data ${String(txD?.data).slice(0, 26)}…`)
    note(`D . la donnee differe de celle de « go anyway » ? ${String(txD?.data) !== String(txC?.data)}`)
    expect.soft(String(txD?.data) !== String(txC?.data), 'la substitution envoie un AUTRE calldata').toBe(true)
    await shot(page, 'issue3-substitute')

    /* ======================================= E. francais / 390 px / console */
    const texte = await page.evaluate(() => document.body.innerText)
    const titres: string[] = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[title]')).map((e) => e.getAttribute('title') ?? ''),
    )
    const MOTS_FR =
      /\b(le|la|les|des|une|aucun|aucune|nulle|prend|mesure|mesures|mesuree|chaine|entree|taille|moteur|epingle|retard|signer|envoyer|mais|pour|avec|dans|par|qui|pas|plus|est|sont|reponse|annonce|porte|seule|ailleurs|continuer|depot|ecran|appareil|bloc|deja)\b/gi
    const lignes = texte.split('\n').map((l) => l.trim()).filter(Boolean)
    const fr = lignes.filter((l) => (l.match(MOTS_FR) ?? []).length >= 2)
    note(`=== FR page : ${fr.length} ligne(s) ===`)
    for (const s of fr.slice(0, 15)) note(`   FR « ${s.slice(0, 200)} »`)
    const guill = lignes.filter((l) => l.includes('«') || l.includes('»'))
    note(`=== FR guillemets : ${guill.length} ===`)
    for (const g of guill.slice(0, 8)) note(`   «» ${g.slice(0, 150)}`)
    const bullesFr = titres.filter((t) => (t.match(MOTS_FR) ?? []).length >= 2)
    note(`=== FR infobulles : ${bullesFr.length} ===`)
    for (const t of bullesFr.slice(0, 8)) note(`   TITLE « ${t.slice(0, 200)} »`)
    expect.soft(fr.length, 'zero francais visible').toBe(0)
    expect.soft(bullesFr.length, 'zero infobulle francaise').toBe(0)

    await page.setViewportSize({ width: 390, height: 844 })
    await dormir(900)
    const m390 = await page.evaluate(() => {
      const c: string[] = []
      const w = window.innerWidth
      document.querySelectorAll('*').forEach((el) => {
        const r = (el as HTMLElement).getBoundingClientRect()
        if (r.width > 0 && (r.right > w + 1 || r.left < -1))
          c.push(`<${el.tagName.toLowerCase()} class="${String((el as HTMLElement).className).slice(0, 36)}"> right=${Math.round(r.right)}`)
      })
      return { sw: document.documentElement.scrollWidth, iw: w, c: c.slice(0, 10), total: c.length }
    })
    note(`390 px : scrollWidth ${m390.sw}/${m390.iw} · ${m390.total} hors cadre`)
    for (const x of m390.c) note(`   HORS CADRE ${x}`)
    expect.soft(m390.sw, 'pas de debordement a 390 px').toBeLessThanOrEqual(m390.iw + 1)
    await shot(page, 'mise-en-page-390')
    await page.setViewportSize({ width: 1440, height: 900 })
    await dormir(400)

    /* ======================================= F. cas tordus */
    await page.getByRole('button', { name: /^reset$/ }).first().click()
    await dormir(2000)
    // deux clics sur « swap »
    const sw = page.getByRole('button', { name: /^swap 0\.000001 ETH/ })
    let preparers = 0
    const compter = (r: any) => {
      if (r.url().includes('/demo/preparer')) preparers++
    }
    page.on('request', compter)
    await sw.click({ noWaitAfter: true }).catch(() => undefined)
    await sw.click({ force: true, noWaitAfter: true, timeout: 1500 }).catch(() => undefined)
    await sw.click({ force: true, noWaitAfter: true, timeout: 1500 }).catch(() => undefined)
    await dormir(5000)
    page.off('request', compter)
    note(`TORDU . trois clics « swap » -> ${preparers} appel(s) /demo/preparer`)
    const trois = await page.getByRole('button', { name: /^refuse$/ }).isEnabled().catch(() => false)
    note(`TORDU . les trois boutons sont la apres les clics multiples : ${trois}`)
    expect.soft(preparers, 'trois clics ne declenchent qu une preparation').toBeLessThanOrEqual(1)

    // changer d'avis : cliquer substitute puis refuser sur l'appareil
    await page.getByRole('button', { name: /^substitute/ }).click().catch(() => undefined)
    await conduireAppareil(page, 'Reject', { rafale: true })
    await page.getByRole('button', { name: 'confirm (both)' }).click()
    await dormir(3000)
    const corpsT = platL(await page.locator('body').innerText())
    note(`TORDU . substitute puis refus sur l appareil : ${(corpsT.match(/code 4001[^]{0,60}|refus[^]{0,60}/i) ?? ['(rien)'])[0]}`)
    const vraiT = await ouverturesVraies(page)
    const pageT = await ouverturesPage(page)
    note(`TORDU . compteur page ${pageT} · fournisseur ${vraiT}`)
    expect.soft(pageT, 'le compteur reste vrai apres un refus sur l appareil').toBe(vraiT)
    await shot(page, 'tordu-changer-davis')

    // rejouer, puis portefeuille qui decline
    await page.getByRole('button', { name: /^reset$/ }).first().click()
    await dormir(2000)
    await page.evaluate(() => ((window as any).__audit.refuser = true))
    const avantW = await ouverturesVraies(page)
    await sw.click()
    await expect(page.getByRole('button', { name: /^go anyway/ })).toBeEnabled({ timeout: 40_000 })
    await page.getByRole('button', { name: /^go anyway/ }).click()
    await conduireAppareil(page, 'Sign', { rafale: true })
    await page.getByRole('button', { name: 'confirm (both)' }).click()
    await dormir(4000)
    const corpsW = platL(await page.locator('body').innerText())
    note(`TORDU . portefeuille qui decline : ${(corpsW.match(/declined|4001[^]{0,60}/i) ?? ['(rien)'])[0]}`)
    const vraiW = await ouverturesVraies(page)
    const pageW = await ouverturesPage(page)
    note(`TORDU . compteur page ${pageW} · fournisseur ${vraiW} (etait ${avantW})`)
    expect.soft(pageW, 'compteur vrai meme quand le portefeuille refuse').toBe(vraiW)
    await page.evaluate(() => ((window as any).__audit.refuser = false))
    await shot(page, 'tordu-portefeuille-decline')

    /* 4. l'ecran de l'appareil : francais ? */
    const evts = await evenements()
    const frEcrans = evts.filter((e) => (e.match(MOTS_FR) ?? []).length >= 2)
    note(`=== APPAREIL : ${evts.length} ecrans au total dans l historique · en francais : ${frEcrans.length} ===`)
    for (const e of frEcrans.slice(0, 10)) note(`   APPAREIL-FR « ${e} »`)
    const digestEcran = (() => {
      const i = evts.map((t, k) => (t === 'promptDigest (1/2)' ? k : -1)).filter((k) => k >= 0).pop()
      if (i === undefined || i < 0) return null
      const fin = evts.findIndex((t, k) => k > i && /^Sign message/.test(t))
      const frag = evts.slice(i, fin < 0 ? i + 8 : fin).filter((t) => /^(0x)?[0-9A-Fa-f ]+$/.test(t) && t.trim())
      return frag.join('').replace(/ /g, '').toLowerCase()
    })()
    note(`EMPREINTE appareil : ${digestEcran}`)
    note(`EMPREINTE pont     : ${prep.prompt_digest}`)
    expect.soft(digestEcran, 'l empreinte de l appareil egale celle du pont/de la page').toBe(prep.prompt_digest)
  } finally {
    const avant = await bloc().catch(() => -1)
    note(`REMBOBINAGE . bloc avant : ${avant}`)
    await page.getByRole('button', { name: /^reset$/ }).first().click({ timeout: 8000 }).catch(() => undefined)
    await dormir(2500)
    const rev = await (
      await fetch(`${PONT}/demo/revenir`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
    ).json()
    note(`REMBOBINAGE . /demo/revenir : ${JSON.stringify(rev).slice(0, 200)}`)
    let apres = await bloc().catch(() => -1)
    if (apres !== BLOC_EPINGLE) {
      await rpc('evm_revert', [sauvegarde])
      apres = await bloc().catch(() => -1)
      note(`REMBOBINAGE . filet applique -> ${apres}`)
    }
    note(`REMBOBINAGE . bloc final : ${apres}`)
    expect.soft(apres, 'fork rendu au bloc epingle').toBe(BLOC_EPINGLE)
    const fin = (await (await fetch(`${PONT}/demo/etat`)).json()) as any
    note(`ETAT FINAL : bloc ${fin.fork?.block_number} snapshot ${fin.snapshot} conforme ${fin.base?.conforme} horloge_figee ${fin.base?.horloge_figee} appareil « ${fin.speculos?.ecran} » occupe ${fin.speculos?.occupe}`)
    note(`TOTAL console ${consoleErreurs.length} · pageerror ${pageErreurs.length} · reseau ${reseauEchecs.length}`)
    for (const e of consoleErreurs) note(`   CONSOLE ${e}`)
    for (const e of pageErreurs) note(`   PAGEERROR ${e}`)
    for (const e of reseauEchecs) note(`   RESEAU ${e}`)
    expect.soft(consoleErreurs.length, 'zero erreur console').toBe(0)
    expect.soft(pageErreurs.length, 'zero pageerror').toBe(0)
    writeFileSync(resolve(DOSSIER, 'releve.json'), JSON.stringify({ chrono, consoleErreurs, pageErreurs, reseauEchecs, notes }, null, 2))
    console.log('\n=========== CHRONO ===========')
    for (const c of chrono) console.log(`  ${(c.ms / 1000).toFixed(2).padStart(8)} s  ${c.etape}`)
    await ctx.close()
  }
})

async function mesureMiseEnPage(page: Page) {
  return page.evaluate(() => {
    let sh = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    document.querySelectorAll('*').forEach((el) => {
      const e = el as HTMLElement
      if (e.scrollHeight > e.clientHeight + 4 && e.scrollHeight > sh) sh = e.scrollHeight
    })
    return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh, ih: window.innerHeight }
  })
}
