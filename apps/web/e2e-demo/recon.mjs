import { chromium } from 'playwright'
const SITE='https://tare-hooks.tech', RPC=SITE+'/rpc'
const COMPTE='0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'
const W=`(()=>{const C='${COMPTE}';const R='${RPC}';let i=0
const etat={ouvertures:0,hashes:[],refuser:false}
Object.defineProperty(window,'__audit',{value:etat,writable:false,configurable:true})
const f={isMetaMask:true,on(){return this},addListener(){return this},removeListener(){return this},removeAllListeners(){return this},
async request(a){const m=a&&a.method,p=(a&&a.params)||[]
if(m==='eth_requestAccounts'||m==='eth_accounts')return [C]
if(m==='eth_chainId')return '0x2105'
if(m==='net_version')return '8453'
if(m==='wallet_addEthereumChain'||m==='wallet_switchEthereumChain')return null
if(m==='wallet_requestPermissions'||m==='wallet_getPermissions')return [{parentCapability:'eth_accounts'}]
if(m==='eth_sendTransaction'){etat.ouvertures++; if(etat.refuser){const e=new Error('User denied transaction signature.');e.code=4001;throw e}}
const r=await fetch(R,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:++i,method:m,params:p})})
const j=await r.json(); if(j.error)throw Object.assign(new Error(j.error.message),{code:j.error.code})
if(m==='eth_sendTransaction')etat.hashes.push(j.result); return j.result}}
Object.defineProperty(window,'ethereum',{value:f,writable:true,configurable:true})
const info={uuid:'u1',name:'MetaMask',icon:'data:,',rdns:'io.metamask'}
const an=()=>window.dispatchEvent(new CustomEvent('eip6963:announceProvider',{detail:Object.freeze({info,provider:f})}))
window.addEventListener('eip6963:requestProvider',an);an()})()`
const b=await chromium.launch(); const c=await b.newContext({viewport:{width:1440,height:900}})
await c.addInitScript(W); const p=await c.newPage()
const errs=[]; p.on('pageerror',e=>errs.push('PAGEERROR '+e.message)); p.on('console',m=>{if(m.type()==='error')errs.push('CONSOLE '+m.text().slice(0,140))})
await p.goto(`${SITE}/#/demo`,{waitUntil:'domcontentloaded'})
await p.waitForTimeout(6000)
console.log('--- TITRE ---'); console.log((await p.locator('h1').first().innerText()).replace(/\n/g,' '))
console.log('--- BOUTONS ---')
for(const t of await p.locator('button').allInnerTexts()) console.log('  ['+t.replace(/\n/g,' ').trim()+']')
console.log('--- SELECTS ---')
for(const t of await p.locator('select').allInnerTexts()) console.log('  ',t.replace(/\n/g,' | ').slice(0,300))
console.log('--- CORPS ---')
console.log((await p.locator('body').innerText()).replace(/ /g,' ').replace(/\n+/g,'\n').slice(0,4200))
console.log('--- ERREURS ---', errs.length, errs.slice(0,5))
await p.screenshot({path:'captures/recon.png',fullPage:true})
await b.close()
