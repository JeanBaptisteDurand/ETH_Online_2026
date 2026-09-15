/**
 * LA PAGE DE DEMONSTRATION (#/demo) — a lancer avec :
 *
 *     cd apps/web && npx tsx --test src/lib/demo.test.ts
 *
 * Une demonstration en direct devant un jury est l'endroit du projet ou un chiffre faux
 * passerait le mieux : personne n'ira verifier pendant qu'on parle. Ces tests tiennent donc
 * la meme regle que src/lib/facts.test.ts, appliquee a un ecran qui, lui, BOUGE.
 *
 *   1. AUCUN NOMBRE N'EST ECRIT DANS L'ECRAN. Les deux actes sont CHERCHES dans le corpus
 *      embarque par un critere relisible ; si le corpus changeait, la scene changerait avec
 *      lui. Un exemple epingle dans le JSX cesserait d'etre vrai sans prevenir.
 *   2. UNE ABSENCE DE MESURE SE DIT « unknown ». Jamais un blanc, jamais un zero.
 *   3. RIEN N'EST REJOUE. L'ecran de l'appareil est servi en direct ; s'il ne charge pas, la
 *      page le dit. Une capture enregistree ferait passer un enregistrement pour un direct.
 *   4. LA GARDE EST APPELEE, PAS RECOPIEE. Le decodage, la consultation, le verdict, la
 *      comparaison et la construction viennent tous de packages/guard.
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { dataset } from './dataset.ts'
import {
  ETH_NATIF,
  USDC_BASE,
  acteStop,
  acteSubstitution,
  pirePorte,
  plusGrandEcart,
} from '../demo/scenario.ts'
import { ETIQUETTE, tableDuCorpus } from '../demo/table.ts'
import { MOITIE_EN_BPS, distribution, lpFeeBps, POURCENT_EN_BPS } from '../demo/distribution.ts'
import {
  chercherAlternative,
  consult,
  decodeUniversalRouterCalldata,
  gradeConsultation,
  thresholdsFor,
  transactionDeRemplacement,
} from '../demo/garde.mjs'

const ICI = import.meta.dirname
const lire = (p: string) => readFileSync(resolve(ICI, p), 'utf8')

const ECRAN = lire('../components/Demo.tsx')
const BANDE = lire('../components/DemoDistribution.tsx')
const SCENARIO = lire('../demo/scenario.ts')
const PONT = lire('../demo/pont.ts')
const TABLE_TS = lire('../demo/table.ts')
const APP = lire('../App.tsx')

/** Le JSX seul : les commentaires d'en-tete ont le droit de citer un chiffre, pas l'ecran. */
const jsxSeul = (src: string) =>
  src
    .split('\n')
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')

/* ------------------------------------------- 1. la route existe et ne casse rien */

test('la route #/demo est branchee a cote des autres, et la barre y mene', () => {
  assert.ok(APP.includes("hash.startsWith('#/demo')"), 'le routeur doit reconnaitre #/demo')
  assert.ok(APP.includes("{ quoi: 'demo' }"), 'la vue doit exister dans le type')
  assert.ok(APP.includes("vue.quoi === 'demo'"), 'la vue doit etre rendue')
  assert.ok(APP.includes("h: '/demo'"), 'une page sans aucun lien n existe pas')
  // Les routes deja publiees ne bougent pas.
  for (const r of ['#/instrument', '#/deck', '#/reglages', '#/developpeurs']) {
    assert.ok(APP.includes(`hash.startsWith('${r}')`), `la route ${r} doit rester`)
  }
})

/* ----------------------------------- 2. les deux actes sont DERIVES, pas ecrits */

test('la queue est le plus gros prelevement MESURE du corpus, et rien d autre', () => {
  const a = acteStop()
  assert.ok(a, 'le corpus porte des mesures chiffrees')
  const pire = pirePorte()!
  assert.equal(a.actuelle.poolId, pire.pool_id.toLowerCase())
  assert.equal(a.actuelle.bps, pire.bps)
  // C'est bien un MAXIMUM : aucune ligne mesuree ne prend davantage.
  for (const r of dataset.rows) {
    if (r.label !== 'MESURE' || typeof r.bps !== 'number') continue
    assert.ok(r.bps <= a.actuelle.bps!, `${r.pool_id} prend ${r.bps}, plus que la queue`)
  }
})

test('la paire des deux actes est le plus grand ecart ETH -> USDC, a taille et monnaies egales', () => {
  const a = acteSubstitution()
  assert.ok(a, 'le corpus porte au moins un echange ETH -> USDC a deux portes mesurees')
  assert.ok(a.proposee, 'un acte de substitution a une porte de remplacement')
  assert.equal(a.actuelle.entree, ETH_NATIF)
  assert.equal(a.actuelle.sortie, USDC_BASE)
  // MEME taille, MEMES monnaies, MEME sens : les trois regles de alternative.ts.
  assert.equal(a.actuelle.amountIn, a.proposee.amountIn)
  assert.equal(a.actuelle.entree, a.proposee.entree)
  assert.equal(a.actuelle.sortie, a.proposee.sortie)
  assert.equal(a.actuelle.direction, a.proposee.direction)
  // Deux POOLS differents : substituer un pool par lui-meme ne substitue rien.
  assert.notEqual(a.actuelle.poolId, a.proposee.poolId)
  assert.ok(a.ecartBps !== null && a.ecartBps > 0, 'un ecart nul ne serait pas une substitution')
  assert.equal(a.ecartBps, Number((a.actuelle.bps! - a.proposee.bps!).toFixed(4)))
})

test('les deux portes de la paire sont MESUREES : une porte inconnue n est pas moins chere', () => {
  const a = acteSubstitution()!
  assert.equal(a.actuelle.row.label, 'MESURE')
  assert.equal(a.proposee!.row.label, 'MESURE')
  assert.equal(typeof a.actuelle.bps, 'number')
  assert.equal(typeof a.proposee!.bps, 'number')
})

test('une porte non mesuree rend null, jamais zero', () => {
  const nonMesuree = dataset.rows.find((r) => r.label !== 'MESURE')
  assert.ok(nonMesuree, 'le corpus porte des lignes non mesurees')
  const t = plusGrandEcart(ETH_NATIF, USDC_BASE, [nonMesuree])
  assert.equal(t, null, 'une seule ligne non mesuree ne fabrique aucune comparaison')
})

/* ---------------- 2 bis. la distribution porte la these, et elle vient du corpus */

test('la mediane affichee vient du corpus, et de nulle part ailleurs', () => {
  const d = distribution()
  // On la recalcule ici A LA MAIN, depuis les lignes brutes, avec le meme estimateur que
  // packages/guard/scripts/build-table.mjs. Si les deux divergeaient, le chiffre de la page
  // et le seuil que la garde applique ne parleraient plus du meme corpus.
  const v = dataset.rows
    .filter((r) => r.label === 'MESURE' && typeof r.bps === 'number')
    .map((r) => r.bps as number)
    .sort((a, b) => a - b)
  assert.equal(d.n, v.length, 'le denominateur est le nombre de lignes qui portent un nombre')
  assert.equal(d.mediane, v[Math.floor((v.length * 50) / 100)])
  assert.equal(d.p90, v[Math.floor((v.length * 90) / 100)])
  assert.equal(d.p99, v[Math.floor((v.length * 99) / 100)])
  assert.equal(d.max, v[v.length - 1])

  // Et c'est EXACTEMENT le meme estimateur que celui des seuils de la garde.
  const t = tableDuCorpus()
  assert.equal(d.p90, t.seuils!.warn_bps, 'le 90e centile affiche est le seuil warn applique')
  assert.equal(d.p99, t.seuils!.block_bps, 'le 99e centile affiche est le seuil block applique')

  // L'ecran ne l'ecrit nulle part : il la lit.
  assert.ok(BANDE.includes('d.mediane'), 'la bande doit rendre la mediane, pas la recopier')
  assert.ok(!jsxSeul(BANDE).includes(String(d.mediane)))
  assert.ok(!jsxSeul(BANDE).includes(d.mediane.toFixed(2)))
})

test('les lignes sans nombre ne sont ni comptees, ni appelees zero', () => {
  const d = distribution()
  assert.equal(d.n + d.nSansNombre, d.nLignes)
  assert.ok(d.nSansNombre > 0, 'le corpus porte des lignes etiquetees sans valeur')
  // Une ligne NON_COTABLE compterait comme 0 si on la laissait entrer : la part a zero
  // serait alors gonflee, et c'est exactement le mensonge que ce projet refuse.
  const zeros = dataset.rows.filter((r) => r.label === 'MESURE' && r.bps === 0).length
  assert.equal(d.zero.n, zeros)
  assert.ok(d.zero.n < d.nSansNombre, 'sinon on aurait melange « rien » et « inconnu »')
  // Et le denominateur est affiche a cote de chaque part.
  assert.ok(BANDE.includes('d.n'), 'le denominateur doit etre a l ecran')
  assert.ok(BANDE.includes('d.nSansNombre'))
})

test('les valeurs NEGATIVES sont comptees a part, pas noyees dans les zeros', () => {
  const d = distribution()
  const negs = dataset.rows.filter((r) => r.label === 'MESURE' && (r.bps as number) < 0).length
  assert.equal(d.negatives.n, negs)
  assert.ok(negs > 0, 'le corpus porte des hooks qui rendent')
  // `palierOf` les range avec les zeros (la rampe n a pas de palier sous zero) : les taire
  // aurait ete le meme geste que de taire la queue.
  assert.ok(BANDE.includes('d.negatives'), 'elles doivent etre dites')
  assert.ok(BANDE.includes('a hook can give back'))
})

test('les tranches de la bande sont celles de la rampe du site, et elles somment a tout', () => {
  const d = distribution()
  assert.equal(d.tranches.length, 7, 'sept paliers, ceux de src/lib/ramp.ts')
  assert.equal(
    d.tranches.reduce((a, t) => a + t.n, 0),
    d.n,
    'aucune ligne chiffree ne tombe hors des tranches',
  )
  assert.ok(Math.abs(d.tranches[d.tranches.length - 1]!.cumul - 1) < 1e-12)
  // Les largeurs sont PROPORTIONNELLES : une bande a segments egaux mentirait sur la forme.
  assert.ok(BANDE.includes('t.part * 1000'))
  assert.ok(BANDE.includes('`var(--m-${t.palier})`'), 'la couleur est celle de la rampe du site')
})

test('le seuil de comparaison est les frais que le pool de l acte 1 prend DEJA', () => {
  const a = acteSubstitution()!
  assert.notEqual(a.actuelle.row.stored_lp_fee, null, 'sinon aucune comparaison n est tiree')
  assert.equal(lpFeeBps(a.actuelle.row.stored_lp_fee!), a.actuelle.row.stored_lp_fee! / 100)
  // L'ecran passe CE chiffre a la bande : il ne l'ecrit pas, et il ne le devine pas.
  assert.ok(ECRAN.includes('lpFeeBps(paire.actuelle.row.stored_lp_fee)'))
  assert.ok(BANDE.includes('bpsTexte(fraisDuPool!)'))
  // Et quand il n'est pas lu, la comparaison DISPARAIT au lieu de prendre une valeur par defaut.
  assert.ok(BANDE.includes('fraisDuPool === null'))
  assert.ok(BANDE.includes('no comparison is drawn'))
})

test('la queue est montree comme une queue, jamais comme le titre', () => {
  const d = distribution()
  const q = acteStop()!
  assert.equal(d.maxLigne.pool_id.toLowerCase(), q.actuelle.poolId)
  assert.equal(d.max, q.actuelle.bps)
  // Les DEUX actes portent la paire, pas l extreme.
  assert.ok(ECRAN.includes("vue === 'queue' ? queue : paire"), 'l extreme n ouvre plus la demonstration')
  assert.ok(ECRAN.includes('act 1 — you read what you sign'))
  assert.ok(ECRAN.includes('act 2 — there is better'))
  // Il reste accessible en un clic, depuis la bande.
  assert.ok(BANDE.includes('see the tail'))
  assert.ok(BANDE.includes('We publish those too'))
  // Et la part qu il represente est calculee, jamais affirmee. Le seuil qui la nomme est une
  // UNITE — la moitie de ce qu'on echange — et non un chiffre rond deguise en frontiere.
  const au = d.auDessusDe(MOITIE_EN_BPS)
  assert.equal(MOITIE_EN_BPS, 50 * POURCENT_EN_BPS)
  assert.ok(au.n > 0 && au.part < 0.01, `la queue vaut ${(au.part * 100).toFixed(2)} %`)
  assert.ok(BANDE.includes('take more than half of what you swap'))
  assert.ok(!jsxSeul(BANDE).includes('5000') && !jsxSeul(BANDE).includes('5 000'))
})

test('le bandeau ne porte aucun chiffre en dur : tout vient de distribution()', () => {
  const d = distribution()
  const jsx = jsxSeul(BANDE)
  const interdits = [
    String(d.n),
    String(d.nLignes),
    String(d.nSansNombre),
    String(d.zero.n),
    d.mediane.toFixed(2),
    d.max.toFixed(2),
    String(d.p90),
    String(d.p99),
    (d.zero.part * 100).toFixed(2),
    (d.auDessusDe(POURCENT_EN_BPS).part * 100).toFixed(2),
  ]
  for (const mot of interdits) {
    if (mot.length < 4) continue
    assert.ok(!jsx.includes(mot), `« ${mot} » est ecrit en dur dans DemoDistribution.tsx`)
  }
})

/* ------------------------------ 3. rien n est recopie a la main dans l ecran */

test('l ecran ne porte aucune grandeur du projet en dur — elles viendraient a mentir', () => {
  const a1 = acteStop()!
  const a2 = acteSubstitution()!
  const table = tableDuCorpus()
  const interdits = [
    // les chiffres des deux actes, sous leurs formes affichables
    String(a1.actuelle.bps),
    String(a2.actuelle.bps),
    String(a2.proposee!.bps),
    a1.actuelle.amountIn,
    // les identifiants des portes : ecrits ici, la scene ne suivrait plus le corpus
    a1.actuelle.poolId,
    a1.actuelle.hook,
    a2.actuelle.poolId,
    a2.actuelle.hook,
    a2.proposee!.poolId,
    a2.proposee!.hook,
    // les grandeurs du corpus et les seuils
    String(table.n_measurements),
    String(table.block_number),
    String(table.chain_id),
    String(table.seuils!.warn_bps),
    String(table.seuils!.block_bps),
    // le code de refus EIP-1193 : il vient de pont.ts, jamais du JSX
    '4001',
    // et les grandeurs de la distribution, qui portent desormais la these
    distribution().mediane.toFixed(2),
    String(distribution().n),
    (distribution().zero.part * 100).toFixed(2),
  ]
  const jsx = jsxSeul(ECRAN)
  for (const mot of interdits) {
    // Une valeur de moins de quatre caracteres — un prelevement mesure a 0, par exemple — ne
    // se distingue pas d'un chiffre de mise en page : la chercher rendrait le test faux plutot
    // que strict. Les grandeurs qui comptent en font toutes plus.
    if (mot.length < 4) continue
    assert.ok(!jsx.includes(mot), `« ${mot} » est ecrit en dur dans Demo.tsx : il doit venir du corpus`)
  }
  // Et le scenario lui-meme ne designe aucune porte par son adresse.
  for (const mot of [a1.actuelle.poolId, a1.actuelle.hook, a2.actuelle.poolId, a2.proposee!.poolId]) {
    assert.ok(!SCENARIO.includes(mot), `« ${mot} » est epingle dans scenario.ts : l acte doit etre cherche`)
  }
})

test('le code de refus du portefeuille est NOMME une seule fois, dans le pont', () => {
  assert.match(PONT, /export const CODE_REFUS_UTILISATEUR = 4001/)
  assert.ok(ECRAN.includes('CODE_REFUS_UTILISATEUR'), 'l ecran doit citer la constante, pas le nombre')
})

/* ---------------------------------- 4. une absence se DIT, elle ne se tait pas */

test('une absence de mesure s affiche « unknown », jamais zero ni un blanc', () => {
  assert.ok(ECRAN.includes('unknown'), 'le mot doit etre a l ecran')
  assert.ok(ECRAN.includes('const Inconnu ='), 'un primitif, pour que toutes les absences se disent pareil')
  // Chaque valeur en bps rendue passe par le test d absence.
  for (const garde of ['p.bps === null ?', 'l.consultation.bps === null ?', 'economie_bps === null ?']) {
    assert.ok(ECRAN.includes(garde), `l ecran doit gerer l absence : ${garde}`)
  }
  // Et le corpus ne laisse jamais un nombre sur une etiquette qui ne peut pas le porter.
  assert.ok(TABLE_TS.includes("NUMERIQUES.has(label) && typeof r.bps === 'number' ? r.bps : null"))
})

test('le pont ne rend jamais une panne comme un chargement', () => {
  assert.match(PONT, /const DELAI_MS = \d+/, 'l attente doit etre bornee')
  assert.ok(PONT.includes('AbortSignal.timeout(DELAI_MS)'))
  assert.ok(PONT.includes("refus: 'expire'"), 'un delai expire se dit')
  assert.ok(PONT.includes("refus: 'injoignable'"), 'un service absent se dit')
  assert.ok(ECRAN.includes('the demo bridge'), 'l ecran doit nommer le pont quand il manque')
  assert.ok(ECRAN.includes('The page stays readable'), 'et rester utilisable en lecture')
})

/* ------------------------------ 5. l appareil est en DIRECT, jamais un rejeu */

test('l ecran de l appareil est servi en direct et le dit quand il ne l est pas', () => {
  assert.ok(PONT.includes('/screenshot?t=$'), 'le jeton coupe le cache : sans lui l image se fige')
  assert.ok(ECRAN.includes('device screen unavailable'), 'une image absente se dit')
  assert.ok(ECRAN.includes('nothing is replayed'))
  // Aucune image locale : un fichier du depot ferait passer un enregistrement pour un direct.
  assert.ok(!/from '.*\.(png|jpg|jpeg|gif|webp)'/.test(ECRAN), 'aucune capture embarquee')
  assert.match(ECRAN, /const PERIODE_MS = (\d+)/)
  const periode = Number(/const PERIODE_MS = (\d+)/.exec(ECRAN)![1])
  assert.ok(periode > 0 && periode <= 1000, `rafraichissement a ${periode} ms`)
})

test('les trois boutons de l appareil sont cables sur les trois routes de Speculos', () => {
  assert.ok(PONT.includes('`${SPECULOS}/button/${bouton}`'))
  assert.ok(PONT.includes("'press-and-release'"), 'sans action, le bouton reste enfonce')
  for (const b of ['left', 'right', 'both']) {
    assert.ok(ECRAN.includes(`appuyerUne('${b}')`), `le bouton ${b} doit etre cable`)
  }
})

test("les boutons disent ce qu'ils FONT, et la sequence reelle est ecrite", () => {
  // Le defaut mesure en direct : le premier ecran de l'appareil est une garde de signature
  // aveugle ou l'appui GAUCHE n'a aucun effet. Un bouton libelle « Reject (left) » y
  // enseignait donc un geste qui ne refuse rien, pendant que l'operateur le repetait.
  for (const libelle of ['previous (left)', 'next (right)', 'confirm (both)']) {
    assert.ok(ECRAN.includes(libelle), `le libelle « ${libelle} » doit etre a l ecran`)
  }
  // Les anciens libelles ont le droit d'etre CITES dans l'en-tete du fichier — c'est meme la
  // seule facon qu'on ne les remette pas dans six mois. Ils n'ont plus le droit d'etre rendus.
  const rendu = jsxSeul(ECRAN)
  assert.ok(!rendu.includes('Reject (left)'), 'ce libelle enseignait le mauvais geste')
  assert.ok(!rendu.includes('Approve (both)'), 'idem : « confirm » dit ce que le bouton fait')
  // La sequence, dans l'ordre, et la ou se trouve vraiment le refus.
  assert.ok(ECRAN.includes('blind signing ahead'))
  assert.ok(ECRAN.includes('the left button'), 'on dit que la gauche ne fait rien sur la garde')
  assert.ok(ECRAN.includes('walks every field'), 'on dit ce que « next » parcourt')
  assert.ok(ECRAN.includes('is the\n        refusal') || ECRAN.includes('is the refusal'))
})

test('le compteur d ecrans est MESURE, jamais un total annonce d avance', () => {
  // Un total ecrit (« 46 ecrans ») deviendrait faux au premier champ ajoute au rapport.
  assert.ok(ECRAN.includes('screens seen'))
  assert.ok(ECRAN.includes('setEcrans((n) => n + 1)'), 'il avance quand le texte de l ecran change')
  assert.ok(!/46\s*(screens|presses)/.test(ECRAN), 'aucun total ecrit')
  // Et quand le texte n est pas lisible, le compteur dit « unknown », jamais zero.
  assert.ok(ECRAN.includes('quoi="the device screen text"'))
  // Une rafale existe : quarante-six appuis a la main devant un jury, c est trop long.
  assert.ok(ECRAN.includes('const APPUIS_PAR_RAFALE'))
  assert.ok(ECRAN.includes('next ×{APPUIS_PAR_RAFALE}'))
})

test("l'attente de l'appareil a son PROPRE delai, et les lectures gardent le court", () => {
  // Mesure faite : parcourir les champs demande 46 appuis, 19,7 a 36,4 s pour une machine et
  // trois a cinq fois plus pour une main. Sous les 12 s des autres routes, la page abandonnait
  // TOUJOURS — un ERR_ABORTED, puis « did not answer in 12 s » pendant que l'appareil attendait.
  assert.match(PONT, /const DELAI_MS = (\d+)/)
  assert.match(PONT, /const DELAI_APPAREIL_MS = (\d+)/)
  const court = Number(/const DELAI_MS = (\d+)/.exec(PONT)![1])
  const long = Number(/const DELAI_APPAREIL_MS = (\d+)/.exec(PONT)![1])
  assert.ok(long >= 240000, `le delai de l appareil vaut ${long} ms, trop court pour une main`)
  assert.ok(court <= 15000, "les lectures doivent rester courtes : un silence long s'y lit comme un chargement")
  // Et il ne s'applique QU'A /demo/approuver.
  assert.match(PONT, /'\/demo\/approuver',[\s\S]{0,120}DELAI_APPAREIL_MS/)
  for (const route of ['/demo/etat', '/demo/revenir']) {
    assert.ok(!new RegExp(`'${route}'[^)]*DELAI_APPAREIL_MS`).test(PONT), `${route} doit rester court`)
  }
  // L'ecran dit combien de temps il accepte d'attendre, et depuis combien il attend.
  assert.ok(ECRAN.includes('DELAI_APPAREIL_S'))
  assert.ok(ECRAN.includes('${attente} s'))
})

test('un double clic ne part jamais deux fois : le verrou ferme avant le premier await', () => {
  // Le defaut mesure : « prepare » ne se desarmait qu'apres l'aller-retour vers le
  // portefeuille — 60 a 120 ms — et le second clic declenchait une SECONDE preparation, donc
  // un second snapshot, et le fork derivait sous la demonstration.
  assert.ok(ECRAN.includes('const enVol = useRef(false)'))
  for (const geste of ['demanderPreparation', 'demanderAppareil', 'signerEtEnvoyer', 'remettre']) {
    const i = ECRAN.indexOf(`const ${geste} = async`)
    assert.ok(i > 0, `${geste} doit exister`)
    const tete = ECRAN.slice(i, i + 220)
    assert.ok(tete.includes('if (enVol.current) return'), `${geste} doit poser le verrou`)
  }
  // Et il est pose AVANT le premier await, sinon il ne ferme rien.
  const i = ECRAN.indexOf('const demanderPreparation = async')
  const tete = ECRAN.slice(i, ECRAN.indexOf('await', i))
  assert.ok(tete.includes('enVol.current = true') && tete.includes("setOccupe('bridge')"))
})

test("l'ecran ne rend aucun texte francais du service, ni aucun guillemet francais", () => {
  // Le service ecrit ses `consequence` et ses `phrase` en francais ; cet ecran-ci est lu par
  // un jury anglophone. On rend les champs STRUCTURES, pas la prose.
  assert.ok(!ECRAN.includes('d.consequence'), 'la consequence du service est en francais')
  assert.ok(ECRAN.includes('announced ${d.annonce}, corpus ${d.corpus}'))
  assert.ok(!ECRAN.includes('.phrase'), 'la phrase du service est en francais')
  const rendu = ECRAN.split('\n')
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
  assert.ok(!rendu.includes('«') && !rendu.includes('»'), 'les guillemets du site sont anglais')
})

/* ------------------------------------ 6. le contrat du service, tel qu il est */

test('le pont appelle exactement les cinq routes du contrat, et pas une de plus', () => {
  const routes = [...PONT.matchAll(/['`](\/demo\/[a-z]+)/g)].map((m) => m[1])
  assert.deepEqual(
    [...new Set(routes)].sort(),
    ['/demo/approuver', '/demo/etat', '/demo/preparer', '/demo/revenir', '/demo/soldes'],
  )
  assert.ok(PONT.includes('adresse, acte'), 'preparer prend une adresse et un acte')
  assert.ok(PONT.includes("acte: 'stop' | 'substitution'"))
})

test('le reseau du fork s ajoute depuis la page : on n ouvre pas les reglages devant un jury', () => {
  assert.ok(PONT.includes('wallet_addEthereumChain'))
  assert.ok(PONT.includes('wallet_switchEthereumChain'))
  assert.ok(PONT.includes('eth_sendTransaction'))
  // Le chainId vient du service, jamais d un nombre ecrit.
  assert.ok(ECRAN.includes('etat.fork.chain_id') || ECRAN.includes('fork.chain_id'))
  assert.ok(!/chainId: '0x[0-9a-f]+'/.test(PONT), 'le chainId se derive du fork rendu')
})

/* --------------------------- 7. la garde est APPELEE, pas recopiee */

test('l ecran importe la garde, et ne rejuge rien lui-meme', () => {
  for (const f of [
    'decodeUniversalRouterCalldata',
    'consult',
    'gradeConsultation',
    'thresholdsFor',
    'chercherAlternative',
    'transactionDeRemplacement',
  ]) {
    assert.ok(ECRAN.includes(f), `${f} doit venir de packages/guard`)
  }
  // Aucun seuil, aucune conversion de bps, aucun classement de portes dans l ecran.
  assert.ok(!/bps\s*[<>]=?\s*\d/.test(jsxSeul(ECRAN)), 'aucun seuil ecrit dans l ecran')
})

test('la frontiere .mjs ne touche jamais data/table.json (21 Mo)', () => {
  // On lit le CODE, pas les commentaires qui l'expliquent : l'en-tete du fichier a le droit
  // de nommer le piege, c'est meme la seule facon qu'on ne le retende pas dans six mois.
  const code = jsxSeul(lire('../demo/garde.mjs'))
  const chemins = [...code.matchAll(/from '([^']+)'/g)].map((m) => m[1]!)
  assert.ok(chemins.length > 0, 'la frontiere doit reexporter quelque chose')
  for (const c of chemins) {
    assert.ok(c.startsWith('../../../../packages/guard/src/'), `${c} sort du paquet`)
    assert.ok(!c.includes('table.json'), 'la table de 21 Mo ne doit pas entrer dans le bundle')
    assert.ok(!c.endsWith('/guard.ts'), 'guard.ts inline data/table.json : on passe a cote')
    assert.ok(!c.endsWith('/index.ts'), 'index.ts reexporte guard.ts, donc la table')
    // Vite ne rejoue « .js -> .ts » que depuis un importateur TypeScript : depuis un .mjs, un
    // chemin en .js ne resoudrait rien, et le bundle casserait au build.
    assert.ok(c.endsWith('.ts'), `${c} doit porter son extension reelle`)
  }
})

/* ------------------- 8. la garde rend bien ce que l ecran raconte */

test('acte 1 : le calldata se decode, le poolId se rederive, le hook est celui du corpus', () => {
  const a = acteStop()!
  const d = decodeUniversalRouterCalldata(a.calldata)
  assert.equal(d.router, 'universal-router')
  assert.ok(d.complete, 'un calldata a moitie lu ne devient jamais « aucun hook detecte »')
  assert.equal(d.legs.length, 1)
  const leg = d.legs[0]!
  // Le poolId n est pas recopie du corpus : il est RECALCULE depuis la PoolKey du calldata.
  assert.equal(leg.poolId, a.actuelle.poolId)
  assert.equal(leg.poolKey.hooks, a.actuelle.hook)
  assert.equal(leg.direction, a.actuelle.direction)
  assert.equal(leg.amountIn, a.actuelle.amountIn)
})

test('acte 1 : la table rend la mesure exacte, et le verdict bloque', () => {
  const a = acteStop()!
  const table = tableDuCorpus()
  const d = decodeUniversalRouterCalldata(a.calldata)
  const leg = d.legs[0]!
  const c = consult(table, leg.poolId, leg.poolKey.hooks, leg.direction, leg.amountIn)
  assert.equal(c.label, 'MEASURED')
  assert.equal(c.basis, 'exact')
  assert.equal(c.bps, a.actuelle.bps)
  assert.equal(c.citations.length, 1)
  const g = gradeConsultation(c, thresholdsFor(table), true)
  assert.equal(g.verdict, 'block')
  assert.equal(g.decidedBy?.from, 'stated')
})

test('acte 1 : aucune autre porte n existe pour cette paire — l ecran ne propose rien', () => {
  const a = acteStop()!
  const table = tableDuCorpus()
  const alt = chercherAlternative(table, a.actuelle.poolId, a.actuelle.direction, a.actuelle.amountIn)
  assert.ok(alt)
  assert.equal(alt.etat, 'PORTE_UNIQUE')
  assert.equal(alt.examinees.length, 0)
  assert.equal(alt.proposee, null)
})

test('acte 2 : la garde propose la porte que le corpus donne, et construit son calldata', () => {
  const a = acteSubstitution()!
  const table = tableDuCorpus()
  const alt = chercherAlternative(table, a.actuelle.poolId, a.actuelle.direction, a.actuelle.amountIn)!
  assert.equal(alt.etat, 'MEILLEURE_PORTE')
  assert.equal(alt.proposee?.poolId, a.proposee!.poolId)
  assert.equal(alt.economie_bps, a.ecartBps)
  assert.ok(alt.economie_bps! >= alt.seuil_bps, 'sous le seuil, re-signer ferait PERDRE de l argent')
  assert.ok(alt.calldata, 'la porte de remplacement porte son calldata')
  // Et ce calldata se relit sur la porte PROPOSEE, jamais sur l ancienne.
  const relu = decodeUniversalRouterCalldata(alt.calldata!)
  assert.equal(relu.legs[0]!.poolId, a.proposee!.poolId)
})

test('acte 2 : sans cotation vivante, envoi.ts refuse et DIT ce qui manque', () => {
  const a = acteSubstitution()!
  const table = tableDuCorpus()
  const alt = chercherAlternative(table, a.actuelle.poolId, a.actuelle.direction, a.actuelle.amountIn)!
  const sans = transactionDeRemplacement(alt, { cotation: null, maintenant: 1n })
  assert.equal(sans.etat, 'SANS_PLANCHER')
  assert.equal(sans.transaction, null)
  // Avec une cotation, la transaction est complete et porte un plancher non nul.
  const avec = transactionDeRemplacement(alt, { cotation: 1_000_000n, maintenant: 1n })
  assert.equal(avec.etat, 'PRET')
  assert.ok(avec.transaction)
  assert.ok(BigInt(avec.amountOutMinimum!) > 0n, 'un plancher a zero est une protection desactivee')
  // La liste de commandes est LUE, jamais ecrite : ici l entree est de l ETH natif, donc
  // Permit2 n a rien a autoriser et la liste ne porte que le swap.
  assert.equal(avec.commandes, decodeUniversalRouterCalldata(avec.transaction!.data).commands)
})

test("l ecran nomme les commandes en les DECODANT, il ne les affirme pas", () => {
  assert.ok(ECRAN.includes('function nomsDeCommandes'))
  assert.ok(ECRAN.includes('COMMAND_PERMIT2_PERMIT'))
  assert.ok(ECRAN.includes('COMMAND_V4_SWAP'))
  assert.ok(!jsxSeul(ECRAN).includes('0x0a10'), 'la liste de commandes se lit dans le calldata')
})

test('l acte 2 ne signe QUE la transaction de remplacement, jamais celle d origine', () => {
  // La transaction rendue par `/demo/preparer` sous `transaction` est celle du swap D ORIGINE,
  // par la porte chere. La signer serait exactement le contraire de ce que la scene raconte.
  assert.ok(ECRAN.includes('preparationOk?.transaction_remplacement ?? null'))
  assert.ok(ECRAN.includes('envoyer(fournisseur, de, aSigner)'), 'on n envoie que ce qui est a signer')
  assert.ok(!ECRAN.includes('envoyer(fournisseur, de, preparationOk.transaction)'))
})

test('les divergences entre le scenario et le corpus sont AFFICHEES, pas tues', () => {
  assert.ok(ECRAN.includes('etatOk.divergences'), 'le service les publie : les taire serait choisir en silence')
  assert.ok(ECRAN.includes('divergence(s) between the script and the corpus'))
  assert.ok(ECRAN.includes('the corpus wins'), 'et on dit laquelle des deux gagne')
})

test('le refus se demande a l appareil, et son code vient de la reponse', () => {
  assert.ok(ECRAN.includes('approuver(acteBridge)'), 'le rapport EIP-712 part vers l appareil')
  assert.ok(ECRAN.includes("typeof appareil.refus === 'number'"), 'le code rendu est lu, pas suppose')
})

test('un solde illisible se dit « unknown », et un fork muet aussi', () => {
  assert.ok(ECRAN.includes('s.usdc === null ?'), 'le service peut ne pas lire l USDC')
  assert.ok(ECRAN.includes('etatOk.fork.chain_id === null ?'), 'un fork muet ne rend pas un chain id')
  assert.ok(
    PONT.includes("raison: 'the bridge has not published a chain id"),
    'et on ne devine pas un chain id pour MetaMask',
  )
})

test('l ecran est en anglais : aucune phrase du site en francais ne s y invite', () => {
  // SUITE, dans ../compte/substitution.ts, libelle encore l'etat PRET en francais (« signer et
  // envoyer »). Cet ecran-la est lu par un jury anglophone : il ne l'importe pas.
  assert.ok(!/\bSUITE\s*\[/.test(ECRAN), 'SUITE porte un libelle francais sur PRET : ne pas le rendre')
  assert.ok(
    !/import \{[^}]*\bSUITE\b[^}]*\} from '\.\.\/compte\/substitution'/.test(ECRAN),
    'et ne pas meme l importer, pour qu on ne le reintroduise pas',
  )
  // AFFICHAGE, lui, est deja entierement en anglais : il est reutilise tel quel.
  assert.ok(ECRAN.includes('AFFICHAGE['), "les titres d'etat viennent du vocabulaire commun")
})

/* ------------------- 9. la table du site est bien celle du paquet */

test('les quatre etiquettes du corpus se traduisent une a une, sans en promouvoir aucune', () => {
  assert.deepEqual(ETIQUETTE, {
    MESURE: 'MEASURED',
    INTERPOLE: 'INTERPOLATED',
    NON_MESURABLE: 'NOT_MEASURABLE',
    NON_COTABLE: 'NOT_QUOTABLE',
  })
})

test('la table batie depuis le corpus porte le meme bloc et les memes comptes que le jeu', () => {
  const t = tableDuCorpus()
  assert.equal(t.schema, 'tare-guard-table/1')
  assert.equal(t.n_measurements, dataset.rows.length)
  assert.equal(t.n_pools, dataset.totals.pools)
  assert.equal(t.n_hooks, dataset.totals.hooks)
  assert.equal(t.block_number, dataset.provenance.measurements.blocks[0])
  assert.equal(t.chain_id, dataset.provenance.measurements.chain_ids[0])
  // Les seuils sont des CENTILES, derives du corpus — jamais des chiffres ronds ecrits.
  assert.ok(t.seuils!.derives_de > 0)
  assert.ok(t.seuils!.warn_bps! < t.seuils!.block_bps!)
  assert.ok(TABLE_TS.includes('Math.floor((tous.length * q) / 100)'))
})

test('les tailles sont triees : sans ce tri, l interpolation encadrerait n importe quoi', () => {
  const t = tableDuCorpus()
  for (const p of Object.values(t.pools)) {
    for (const pts of Object.values(p.dirs)) {
      for (let i = 1; i < pts.length; i++) {
        assert.ok(BigInt(pts[i]!.amount_in) >= BigInt(pts[i - 1]!.amount_in))
      }
    }
  }
})

test('la table batie ici est celle du paquet, pool par pool — quand le paquet l a construite', () => {
  // packages/guard/data/table.json est ignore par git (21 Mo) : il peut manquer sur la machine
  // de build. Son absence n est pas un echec — c est justement pour ca que la page ne s appuie
  // pas dessus. Quand il est la, on compare, parce que deux versions divergeraient un jour.
  const chemin = resolve(ICI, '../../../../packages/guard/data/table.json')
  if (!existsSync(chemin)) {
    assert.ok(true, 'table du paquet absente de cette machine : rien a comparer')
    return
  }
  const paquet = JSON.parse(readFileSync(chemin, 'utf8')) as {
    block_number: number
    n_pools: number
    seuils: { warn_bps: number; block_bps: number }
    pools: Record<string, unknown>
  }
  const t = tableDuCorpus()
  assert.equal(t.block_number, paquet.block_number)
  assert.equal(t.n_pools, paquet.n_pools)
  assert.equal(t.seuils!.warn_bps, paquet.seuils.warn_bps)
  assert.equal(t.seuils!.block_bps, paquet.seuils.block_bps)
  for (const a of [acteStop()!, acteSubstitution()!]) {
    for (const p of [a.actuelle, a.proposee].filter(Boolean)) {
      assert.deepEqual(t.pools[p!.poolId], paquet.pools[p!.poolId], `pool ${p!.poolId} diverge`)
    }
  }
})

/* --------------------------- 10. la mise en page tient a 390 px */

test('aucune largeur fixe ne depasse la plus petite fenetre visee', () => {
  // Le defaut mesure ailleurs dans ce depot : une `width: 230` dans une rangee qui se replie
  // n est pas une largeur, c est un plancher — et la page entiere defilait de cote.
  for (const [, n] of ECRAN.matchAll(/\b(?:width|minWidth)\s*:\s*(\d{3,})/g)) {
    assert.ok(Number(n) < 360, `une largeur de ${n} px deborderait a 390 px`)
  }
  assert.ok(ECRAN.includes("maxWidth: '100%'"), 'l image de l appareil ne doit pas pousser la page')
  assert.ok(lire('../index.css').includes('.demo-etapes'), 'la grille des etapes vit dans la charte')
})
