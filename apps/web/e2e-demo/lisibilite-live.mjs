/**
 * LES QUATRE PHASES DE LA PAGE REELLE, AVEC LES VRAIS SERVICES.
 *
 * Aucune interception : pont, fork et ecran Speculos sont ceux du site publie. Seul
 * window.ethereum est faux — il relaie vers /rpc avec le compte anvil n0, deverrouille.
 *
 *   node lisibilite-live.mjs avant|apres
 *
 * UN SEUL PARCOURS. L'appareil est partage : on verifie qu'il est libre, on fait une passe,
 * on rembobine le fork dans le `finally`.
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SITE = 'https://tare-hooks.tech'
const PONT = `${SITE}/pont`
const RPC = `${SITE}/rpc`
const ECRAN = `${SITE}/ecran`
const COMPTE = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const BLOC_EPINGLE = 50614000

const PASSE = process.argv[2] === 'apres' ? 'apres' : 'avant'
const ICI = dirname(fileURLToPath(import.meta.url))
const DOSSIER = resolve(ICI, 'captures/lisibilite', PASSE)
mkdirSync(DOSSIER, { recursive: true })

const notes = []
const note = (s) => {
  notes.push(s)
  console.log(`  · ${s}`)
}
const dormir = (ms) => new Promise((r) => setTimeout(r, ms))
const plat = (s) => s.replace(/ | | /g, ' ').replace(/[ \t]+/g, ' ').trim()

const FAUX = `(() => {
  const C = '${COMPTE}'
  const R = '${RPC}'
  const etat = { ouvertures: 0, hashes: [], txs: [] }
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
      if (m === 'eth_sendTransaction') { etat.ouvertures += 1; etat.txs.push(p[0] || null) }
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

async function rpc(m, p = []) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: m, params: p }),
  })
  return r.json()
}
const bloc = async () => parseInt((await rpc('eth_blockNumber')).result, 16)
async function etatPont() {
  const r = await fetch(`${PONT}/demo/etat`)
  return r.json()
}
async function ecranCourant() {
  try {
    const r = await fetch(`${ECRAN}/events?currentscreenonly=true`)
    const j = await r.json()
    return (j.events ?? []).map((e) => e.text ?? '').join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

/* ---------------------------------------------------- ce qu'on mesure sur la page */

/** La page tient-elle dans le cadre ? scrollHeight compris, et conteneurs internes compris. */
const mesurerCadre = (page) =>
  page.evaluate(() => {
    let sh = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
    document.querySelectorAll('*').forEach((el) => {
      if (el.scrollHeight > el.clientHeight + 4 && el.scrollHeight > sh) sh = el.scrollHeight
    })
    return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, sh, ih: window.innerHeight }
  })

/** Tout texte VISIBLE sous 13 px, et tout texte dont le contraste est faible. */
const auditTexte = (page) =>
  page.evaluate(() => {
    const lum = (c) => {
      const m = c.match(/[\d.]+/g)
      if (!m) return null
      const [r, g, b] = m.slice(0, 3).map(Number)
      const f = (v) => {
        const s = v / 255
        return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
      }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const fond = (el) => {
      let e = el
      while (e) {
        const c = getComputedStyle(e).backgroundColor
        if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) return c
        e = e.parentElement
      }
      return 'rgb(10,11,12)'
    }
    const petits = []
    const faibles = []
    document.querySelectorAll('*').forEach((el) => {
      const direct = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim()
      if (!direct) return
      const r = el.getBoundingClientRect()
      if (r.width <= 0 || r.height <= 0) return
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) < 0.2) return
      const px = parseFloat(s.fontSize)
      const l1 = lum(s.color)
      const l2 = lum(fond(el))
      const ratio = l1 === null || l2 === null ? null : (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)
      const ligne = {
        px: Math.round(px * 10) / 10,
        ratio: ratio === null ? null : Math.round(ratio * 100) / 100,
        couleur: s.color,
        texte: direct.slice(0, 70),
        classe: String(el.className).slice(0, 40),
      }
      if (px < 13) petits.push(ligne)
      if (ratio !== null && ratio < 4.5) faibles.push(ligne)
    })
    return { petits, faibles }
  })

/** Ou sont les quatre chiffres qui portent la demonstration, et en quel corps. */
const reperer = (page, quoi) =>
  page.evaluate((cibles) => {
    const vu = []
    document.querySelectorAll('*').forEach((el) => {
      const direct = [...el.childNodes]
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent)
        .join('')
        .replace(/ | | /g, ' ')
        .trim()
      if (!direct) return
      for (const c of cibles) {
        if (direct === c || direct.replace(/\s+/g, ' ') === c) {
          const r = el.getBoundingClientRect()
          if (r.width <= 0) continue
          const s = getComputedStyle(el)
          vu.push({
            cible: c,
            px: Math.round(parseFloat(s.fontSize) * 10) / 10,
            poids: s.fontWeight,
            couleur: s.color,
            y: Math.round(r.top + window.scrollY),
            h: Math.round(r.height),
            surLePli: r.top + window.scrollY < window.innerHeight,
          })
        }
      }
    })
    return vu
  }, quoi)

let n = 0
async function cliche(page, nom) {
  n += 1
  const base = `${String(n).padStart(2, '0')}-${nom}`
  await page.screenshot({ path: resolve(DOSSIER, `${base}.png`), fullPage: true })
  await page.screenshot({ path: resolve(DOSSIER, `${base}-pli.png`) })
  console.log(`  IMG ${resolve(DOSSIER, `${base}.png`)}`)
}

const CIBLES = ['4.0933 bps', '0 bps', '2 442', '2 444', '2 442', '2 444']

async function phase(page, nom) {
  const cadre = await mesurerCadre(page)
  const texte = await auditTexte(page)
  const chiffres = await reperer(page, CIBLES)
  note(`${nom} : cadre ${cadre.sw}x${cadre.sh} pour ${cadre.iw}x${cadre.ih} ${cadre.sh > cadre.ih + 2 ? '>>> DEFILEMENT' : 'OK'}`)
  for (const c of chiffres)
    note(`${nom} : « ${c.cible} » ${c.px} px poids ${c.poids} ${c.couleur} y=${c.y} ${c.surLePli ? '' : 'SOUS LE PLI'}`)
  const absents = ['4.0933 bps', '0 bps'].filter((c) => !chiffres.some((x) => x.cible === c))
  if (absents.length) note(`${nom} : ABSENTS de la page — ${absents.join(', ')}`)
  note(`${nom} : ${texte.petits.length} noeud(s) de texte sous 13 px · ${texte.faibles.length} sous 4.5:1`)
  await cliche(page, nom)
  return { nom, cadre, texte, chiffres }
}

/* ------------------------------------------------------------------- le parcours */

const releve = { passe: PASSE, quand: new Date().toISOString(), phases: [], notes, erreurs: [] }

async function main() {
  // 1. L'APPAREIL EST-IL LIBRE ? On ne le prend pas de force.
  let e = await etatPont()
  if (e.speculos?.occupe) {
    note(`appareil OCCUPE (${JSON.stringify(e.speculos.occupe)}) — j'attends 60 s`)
    await dormir(60_000)
    e = await etatPont()
    if (e.speculos?.occupe) {
      note(`appareil TOUJOURS OCCUPE — j'arrete sans rien toucher`)
      writeFileSync(resolve(DOSSIER, 'releve.json'), JSON.stringify(releve, null, 2))
      process.exit(3)
    }
  }
  note(`appareil libre · ecran « ${e.speculos?.ecran} » · fork bloc ${e.fork?.block_number}`)
  const sauvegarde = (await rpc('evm_snapshot')).result

  const navigateur = await chromium.launch()
  const ctx = await navigateur.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })
  await ctx.addInitScript(FAUX)
  const page = await ctx.newPage()
  page.on('pageerror', (x) => releve.erreurs.push(`PAGEERROR ${x.message.slice(0, 200)}`))
  page.on('console', (m) => {
    if (m.type() === 'error') releve.erreurs.push(`CONSOLE ${m.text().slice(0, 200)}`)
  })

  try {
    /* ---------------------------------------------------- PHASE 1 — au repos */
    await page.goto(`${SITE}/#/demo`, { waitUntil: 'domcontentloaded' })
    await page.getByRole('button', { name: /^swap / }).waitFor({ timeout: 45_000 })
    await page.getByRole('button', { name: /connect the wallet|0xf3/i }).click()
    await dormir(1500)
    await page.getByRole('button', { name: /^network$/i }).first().click().catch(() => undefined)
    await dormir(2500)
    releve.phases.push(await phase(page, 'phase1-repos'))

    /* -------------------------------------------- PHASE 2 — la garde demande */
    await page.getByRole('button', { name: /^swap / }).click()
    await page.getByRole('button', { name: /take the other gate/ }).waitFor({ timeout: 60_000 })
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('button')].some(
            (b) => /take the other gate/.test(b.textContent || '') && !b.disabled,
          ),
        null,
        { timeout: 60_000 },
      )
      .catch(() => undefined)
    await dormir(700)
    releve.phases.push(await phase(page, 'phase2-la-garde-demande'))

    /* --------------------------------------- PHASE 3 — le plan sur l'appareil */
    const libelle = plat(await page.getByRole('button', { name: /take the other gate/ }).innerText())
    note(`choix pris : « ${libelle} »`)
    await page.getByRole('button', { name: /take the other gate/ }).click()
    // le plan part a l'appareil : on attend le panneau « the plan is on the device »
    await page.locator('text=/the plan is on the device/').first().waitFor({ timeout: 90_000 })
    await dormir(1500)

    const suivant = page.getByRole('button', { name: 'next (right)' })
    const confirmer = page.getByRole('button', { name: 'confirm (both)' })
    const vus = []
    let porteur = null
    // 1. la garde de signature aveugle
    for (let i = 0; i < 60; i += 1) {
      const t = await ecranCourant()
      if (/blind signing/i.test(t)) {
        await confirmer.click().catch(() => undefined)
        await dormir(900)
        break
      }
      await dormir(400)
    }
    // 2. les champs, un par un, jusqu'a en trouver un qui PORTE un chiffre
    for (let i = 0; i < 24 && porteur === null; i += 1) {
      const t = await ecranCourant()
      if (t && t !== vus[vus.length - 1]) vus.push(t)
      if (/\btakes?\b|bps/i.test(t) && /\d/.test(t)) {
        porteur = t
        break
      }
      await suivant.click().catch(() => undefined)
      await dormir(650)
    }
    if (porteur === null) {
      // pas de champ « take » : on prend le premier champ chiffre qu'on a vu passer
      porteur = vus.find((t) => /\d/.test(t) && !/blind/i.test(t)) ?? null
    }
    note(`appareil : ${vus.length} ecran(s) defiles`)
    for (const v of vus) note(`   ECRAN « ${v} »`)
    note(`appareil : champ porteur a l'ecran = « ${porteur ?? '(AUCUN)'} »`)
    // on laisse a la page le temps de reposter le PNG de l'ecran
    await dormir(1800)
    const ecranPage = plat(await ecranCourant())
    note(`appareil : ecran au moment du cliche = « ${ecranPage} »`)
    releve.ecranPhase3 = ecranPage
    releve.ecransVus = vus
    releve.phases.push(await phase(page, 'phase3-le-plan-sur-lappareil'))

    /* ------------------------------------- PHASE 4 — signature et execution */
    for (let i = 0; i < 90; i += 1) {
      const t = await ecranCourant()
      if (/^Sign message/i.test(t)) break
      await suivant.click().catch(() => undefined)
      await dormir(320)
    }
    const avantSign = await ecranCourant()
    note(`appareil : ecran avant la confirmation finale = « ${avantSign} »`)
    await confirmer.click()
    let recuVu = false
    for (let i = 0; i < 60; i += 1) {
      const corps = await page.locator('body').innerText()
      if (/status 0x1|received/i.test(corps)) {
        recuVu = true
        break
      }
      await dormir(1500)
    }
    note(`recu affiche : ${recuVu}`)
    const hashes = await page.evaluate(() => window.__audit.hashes)
    const r = hashes.length ? await rpc('eth_getTransactionReceipt', [hashes[hashes.length - 1]]) : { result: null }
    note(`RPC : status ${r.result?.status} bloc ${parseInt(r.result?.blockNumber ?? '0x0', 16)} · ${hashes.length} envoi(s)`)
    await dormir(1200)
    releve.phases.push(await phase(page, 'phase4-apres-signature'))

    const corps = plat(await page.locator('body').innerText()).replace(/\s*\n\s*/g, ' | ')
    releve.corpsFinal = corps.slice(0, 6000)
  } catch (x) {
    releve.erreurs.push(`PARCOURS ${x.message}`)
    note(`ECHEC : ${x.message}`)
    await cliche(page, 'echec').catch(() => undefined)
  } finally {
    /* ------------------------------------------------ on rembobine, toujours */
    await page.getByRole('button', { name: /^reset$/ }).first().click({ timeout: 8000 }).catch(() => undefined)
    await dormir(2500)
    const rev = await fetch(`${PONT}/demo/revenir`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
    })
      .then((x) => x.json())
      .catch((x) => ({ erreur: String(x) }))
    note(`/demo/revenir : ${JSON.stringify(rev).slice(0, 180)}`)
    let apres = await bloc().catch(() => -1)
    if (apres !== BLOC_EPINGLE) {
      await rpc('evm_revert', [sauvegarde]).catch(() => undefined)
      apres = await bloc().catch(() => -1)
      note(`filet applique -> bloc ${apres}`)
    }
    note(`bloc final ${apres} (epingle ${BLOC_EPINGLE}) · ${apres === BLOC_EPINGLE ? 'REMBOBINE' : 'PAS REMBOBINE'}`)
    const fin = await etatPont().catch(() => ({}))
    note(`etat final : appareil « ${fin.speculos?.ecran} » occupe ${JSON.stringify(fin.speculos?.occupe)}`)
    note(`erreurs page : ${releve.erreurs.length}`)
    for (const x of releve.erreurs) note(`   ${x}`)
    writeFileSync(resolve(DOSSIER, 'releve.json'), JSON.stringify(releve, null, 2))
    await navigateur.close()
  }
}

await main()
