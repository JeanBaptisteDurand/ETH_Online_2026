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
import { montantLisible, DECIMALES_NATIF } from '../demo/jetons.ts'
import { classer, cleDe, pairesAMontrer, pairesMesurees } from '../demo/paires.ts'
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
const ROUTE = lire('../components/DemoRoute.tsx')
const PAIRES = lire('../components/DemoPaires.tsx')
const INTERCEPTION = lire('../demo/interception.ts')
const SYMBOLES = JSON.parse(lire('../data/symboles.json')) as {
  jetons: Record<string, { symbole: string | null }>
}
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
  assert.ok(ECRAN.includes("vue === 'queue' ? queue : paire"), 'l extreme n ouvre pas la demonstration')
  // Il reste accessible en un clic, depuis la bande.
  assert.ok(BANDE.includes('see the tail'))
  assert.ok(BANDE.includes('We publish those too'))
  // Et la part qu il represente est calculee, jamais affirmee. Le seuil qui la nomme est une
  // UNITE — la moitie de ce qu'on echange — et non un chiffre rond deguise en frontiere.
  const au = d.auDessusDe(MOITIE_EN_BPS)
  assert.equal(MOITIE_EN_BPS, 50 * POURCENT_EN_BPS)
  assert.ok(au.n > 0 && au.part < 0.01, `la queue vaut ${(au.part * 100).toFixed(2)} %`)
  assert.ok(BANDE.includes('take more than half of\n            what you swap') || BANDE.includes('take more than half of'), 'la queue est nommee par une unite')
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
  // On ne regarde que le JSX RENDU : les commentaires de bloc et les unions de types citent
  // le code EIP-1193, et c'est leur role. Ce qui est interdit, c'est de l'ECRIRE a l'ecran.
  const jsx = jsxSeul(ECRAN)
    .split('\n')
    .filter((l) => !/^\s*(\/\*|\*|\/\/|\|)/.test(l))
    .join('\n')
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
  for (const garde of ['prise === null', 's.usdc === null ?']) {
    assert.ok(ECRAN.includes(garde), `l ecran doit gerer l absence : ${garde}`)
  }
  assert.ok(ROUTE.includes('p.bps === null'), 'la route dit « unknown » plutot qu une porte gratuite')
  assert.ok(PAIRES.includes('p.bps === null'), 'et le classement sort les non mesurees')
  assert.ok(PAIRES.includes('out of the ranking'), 'une porte non mesuree sort du classement')
  // Et le corpus ne laisse jamais un nombre sur une etiquette qui ne peut pas le porter.
  assert.ok(TABLE_TS.includes("NUMERIQUES.has(label) && typeof r.bps === 'number' ? r.bps : null"))
})

test('le pont ne rend jamais une panne comme un chargement', () => {
  assert.match(PONT, /const DELAI_MS = \d+/, 'l attente doit etre bornee')
  assert.ok(PONT.includes('AbortSignal.timeout(DELAI_MS)'))
  assert.ok(PONT.includes("refus: 'expire'"), 'un delai expire se dit')
  assert.ok(PONT.includes("refus: 'injoignable'"), 'un service absent se dit')
  assert.ok(ECRAN.includes('the demo bridge'), 'l ecran doit nommer le pont quand il manque')
  assert.ok(ECRAN.includes('the corpus and the interception still answer'), 'et rester utilisable en lecture')
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
  assert.ok(ECRAN.includes('screens {texte ?'), 'le compteur est rendu')
  assert.ok(ECRAN.includes('setEcrans((n) => n + 1)'), 'il avance quand le texte de l ecran change')
  assert.ok(!/46\s*(screens|presses)/.test(ECRAN), 'aucun total ecrit')
  // Et quand le texte n est pas lisible, le compteur dit « unknown », jamais zero.
  assert.ok(ECRAN.includes('quoi="the device screen text"'))
  // Une rafale existe : quarante-six appuis a la main devant un jury, c est trop long.
  assert.ok(ECRAN.includes('const APPUIS_PAR_RAFALE'))
  assert.ok(ECRAN.includes('×{APPUIS_PAR_RAFALE}'), 'la rafale est cablee sur sa constante')
})

test("chaque question de l'appareil a son PROPRE delai, et les lectures gardent le court", () => {
  // Les trois choix se font sur l'appareil, en deux questions au plus. Mesure faite sur Speculos
  // (Nano X, Ethereum 1.22.3) : 15 appuis pour signer une question, 16 pour la refuser, et une
  // main lit plus lentement qu'une machine. Le delai vaut donc PAR QUESTION.
  const court = Number(/const DELAI_MS = (\d+)/.exec(PONT)![1])
  const etape = Number(/export const DELAI_ETAPE_S = (\d+)/.exec(PONT)![1])
  assert.ok(etape >= 240, `le delai d une question vaut ${etape} s, trop court pour une main`)
  assert.ok(court <= 15000, "les lectures doivent rester courtes : un silence long s'y lit comme un chargement")
  // AUCUNE REQUETE NE RESTE OUVERTE PENDANT QU'UN HUMAIN LIT : un proxy la couperait. /demo/choisir
  // rend la main, et /demo/choix se sonde avec le delai COURT.
  assert.match(PONT, /'\/demo\/choisir',[\s\S]{0,40}DELAI_MS,/)
  assert.match(PONT, /'\/demo\/choix', undefined, DELAI_MS/)
  // Un sondage rate n'abandonne pas une question ouverte sur l'appareil.
  assert.ok(PONT.includes('SONDES_RATEES_MAX'))
  // /demo/approuver garde son long delai, et lui seul.
  assert.match(PONT, /'\/demo\/approuver',[\s\S]{0,120}DELAI_APPAREIL_MS/)
  for (const route of ['/demo/etat', '/demo/revenir', '/demo/choix']) {
    assert.ok(!new RegExp(`'${route}'[^)]*DELAI_APPAREIL_MS`).test(PONT), `${route} doit rester court`)
  }
  // L'ecran dit combien de temps il accepte d'attendre la question affichee, et le montre.
  assert.ok(ECRAN.includes('DELAI_ETAPE_S'))
  assert.ok(ECRAN.includes('s left of'), 'et il est dit en toutes lettres')
  assert.ok(ECRAN.includes('partRestante'), 'une jauge se vide a cote du nombre')
})

test('un double clic ne part jamais deux fois : le verrou ferme avant le premier await', () => {
  // Le defaut mesure : « prepare » ne se desarmait qu'apres l'aller-retour vers le
  // portefeuille — 60 a 120 ms — et le second clic declenchait une SECONDE preparation, donc
  // un second snapshot, et le fork derivait sous la demonstration.
  assert.ok(ECRAN.includes('const enVol = useRef(false)'))
  for (const geste of ['lancerLeSwap', 'remettre']) {
    const i = ECRAN.indexOf(`const ${geste} = async`)
    assert.ok(i > 0, `${geste} doit exister`)
    const tete = ECRAN.slice(i, i + 220)
    assert.ok(tete.includes('if (enVol.current) return'), `${geste} doit poser le verrou`)
  }
  // Et il est pose AVANT le premier await, sinon il ne ferme rien.
  const i = ECRAN.indexOf('const lancerLeSwap = async')
  const tete = ECRAN.slice(i, ECRAN.indexOf('await', i))
  assert.ok(tete.includes('enVol.current = true'), 'le verrou se ferme avant le premier await')
})

test("l'ecran ne rend aucun texte francais du service, ni aucun guillemet francais", () => {
  // Le service ecrit ses `consequence` et ses `phrase` en francais ; cet ecran-ci est lu par
  // un jury anglophone. On rend les champs STRUCTURES, pas la prose.
  assert.ok(!ECRAN.includes('d.consequence'), 'la consequence du service est en francais')
  assert.ok(ECRAN.includes('announced ${d.annonce}, corpus ${d.corpus}'))
  assert.ok(!ECRAN.includes('.phrase'), 'la phrase du service est en francais')
  // Les commentaires JSX multilignes ({/* … */}) comptent aussi comme des commentaires : leurs
  // lignes de continuation ne commencent ni par // ni par *. On retire donc tout ce qui est
  // entre {/* et */} avant de chercher un guillemet francais.
  const rendu = ECRAN.replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .split('\n')
    .filter((l) => {
      const t = l.trimStart()
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*')
    })
    .join('\n')
  assert.ok(!rendu.includes('«') && !rendu.includes('»'), 'les guillemets du site sont anglais')
})

/* ------------------------------------ 6. le contrat du service, tel qu il est */

test('le pont appelle exactement les routes du contrat, et pas une de plus', () => {
  const routes = [...PONT.matchAll(/['`](\/demo\/[a-z]+(?:\/[a-z]+)?)/g)].map((m) => m[1])
  assert.deepEqual(
    [...new Set(routes)].sort(),
    [
      '/demo/approuver',
      '/demo/choisir',
      '/demo/choix',
      '/demo/choix/abandonner',
      '/demo/etat',
      '/demo/preparer',
      '/demo/revenir',
      '/demo/soldes',
    ],
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
  assert.ok(ECRAN.includes('preparationOk?.transaction_remplacement ?? envoi?.transaction ?? null'))
  assert.ok(ECRAN.includes('parLaGarde(remplacement, de)'), 'le remplacement passe par la garde, lui aussi')
})

test('les divergences entre le scenario et le corpus sont AFFICHEES, pas tues', () => {
  assert.ok(ECRAN.includes('etatOk.divergences'), 'le service les publie : les taire serait choisir en silence')
  assert.ok(ECRAN.includes('divergence(s), corpus wins'), 'et on dit laquelle des deux gagne')
})

test('le refus se demande a l appareil, et son code vient de la reponse', () => {
  // Les trois choix se font SUR L'APPAREIL : la page lance la conversation et la suit, elle ne
  // decide rien. La reponse de l'appareil est traduite une a une, sans valeur par defaut.
  assert.ok(ECRAN.includes('choisirSurAppareil(acteBridge, setProgres, ctrl.signal)'), 'le choix part vers l appareil')
  assert.ok(
    ECRAN.includes("rep.choix === 'actuelle' ? 'passer' : rep.choix === 'optimisee' ? 'substituer' : 'refuser'"),
    'les trois reponses de l appareil sont lues, pas supposees',
  )
  // Et le code du refus est LU dans ce que la garde rend, jamais ecrit.
  assert.ok(ECRAN.includes("setCodeRendu(typeof err.code === 'number' ? err.code : null)"))
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

/* ------------------- 8 bis. l interception est REELLE, pas mise en scene */

test("la page passe par packages/guard/src/injection.ts, elle ne l imite pas", () => {
  const frontiere = lire('../demo/garde.mjs')
  assert.ok(frontiere.includes('injection.ts'), 'envelopperProvider vient du paquet')
  assert.ok(INTERCEPTION.includes('envelopperProvider('), 'et il est REELLEMENT appele')
  // La page se comporte comme un site d echange : elle appelle eth_sendTransaction, et c est
  // la garde posee sur le fournisseur qui l arrete. Aucun « si refus alors ne pas envoyer ».
  assert.ok(ECRAN.includes("method: 'eth_sendTransaction'"))
  assert.ok(ECRAN.includes('poste.fournisseur.request'), 'l appel part par le fournisseur ENVELOPPE')
  // Le mot « simulee » n'apparait que dans l'en-tete, pour dire qu'on ne le fait PAS.
  assert.ok(!/simul|fake|pretend/i.test(jsxSeul(INTERCEPTION)), 'aucune simulation dans le code')
})

test('le compteur d ouvertures du portefeuille est MESURE sous la garde', () => {
  // C est la preuve de la promesse centrale : sur un refus, la fenetre ne s est pas ouverte.
  // La coquille est posee SOUS l enveloppe, donc elle voit ce que le portefeuille voit.
  assert.ok(INTERCEPTION.includes('surveillance.ouvertures += 1'))
  const i = INTERCEPTION.indexOf('const compte')
  const j = INTERCEPTION.indexOf('envelopperProvider(')
  assert.ok(i > 0 && j > i, 'la coquille est construite AVANT d etre enveloppee')
  assert.ok(ECRAN.includes('poste.surveillance.ouvertures'), 'et l ecran le rend')
  assert.ok(ECRAN.includes('counted, not asserted'))
})

test('le refus rend 4001 a l appelant, et la page le lit sans le supposer', () => {
  assert.ok(ECRAN.includes('err.code === CODE_REFUS_UTILISATEUR'))
  assert.ok(ECRAN.includes("setIssue('REFUSEE')"))
  // Une garde qui echouerait en « oui » ne garderait rien. Seule la route gardee est approuvee ;
  // la porte moins chere et l'annulation rendent un refus a l'appelant.
  assert.ok(ECRAN.includes("approved: c === 'passer'"))
  // Quand l'appareil ne repond pas, rien ne part par defaut : la decision revient a la page, qui
  // DIT pourquoi, et attend un clic humain.
  assert.ok(ECRAN.includes('setSecours(rep.raison)'))
  assert.ok(ECRAN.includes('device unavailable — deciding on the page'))
  assert.ok(ECRAN.includes('choisir.current = resoudre'))
})

test("la garde ne reecrit rien : le remplacement est un SECOND appel", () => {
  assert.ok(INTERCEPTION.includes('un SECOND appel'), 'la regle dure n.4, tenue jusqu a l ecran')
  assert.ok(ECRAN.includes('const envoyerLeRemplacement'))
  assert.ok(ECRAN.includes('envoie le remplacement en SECOND appel'), 'la regle dure n.4')
})

/* ------------------- 8 ter. on voit ce qu on echange */

test('un jeton sans symbole lu n en recoit pas un joli', () => {
  const inconnue = '0x' + 'ab'.repeat(20)
  assert.equal(SYMBOLES.jetons[inconnue], undefined, 'ce jeton n est pas dans le fichier')
  // La regle est dans le code : `symbole()` rend null, et l ecran affiche l adresse SEULE.
  const carte = lire('../components/Carte.tsx')
  assert.match(carte, /export const symbole = \(adresse: string\): string \| null =>\s*\n?\s*SYM\[adresse\.toLowerCase\(\)\]\?\.symbole \?\? null/)
  assert.ok(PAIRES.includes('return s ? `${s} · ${shortAddr(adresse, 6, 4)}` : shortAddr(adresse, 8, 6)'))
  // Et la route ne rend le symbole QUE s il existe.
  assert.ok(ROUTE.includes('{symbole && ('), 'sans symbole, pas de place vide ni de nom invente')
})

test('les symboles viennent du fichier lu sur la chaine, jamais d une table ecrite ici', () => {
  assert.equal(
    (JSON.parse(lire('../data/symboles.json')) as { schema: string }).schema,
    'tare-symboles/1',
  )
  assert.equal(SYMBOLES.jetons['0x833589fcd6edb6e08f4c7c32d4f71b54bda02913']?.symbole, 'USDC')
  assert.equal(SYMBOLES.jetons['0x0000000000000000000000000000000000000000']?.symbole, 'ETH')
  assert.ok(!/'USDC'|"USDC"/.test(jsxSeul(ECRAN)), 'aucun symbole ecrit dans l ecran')
})

test('un montant n est converti que pour la monnaie dont on connait les decimales', () => {
  const eth = '0x0000000000000000000000000000000000000000'
  const usdc = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'
  assert.equal(montantLisible('1000000000000', eth), '0.000001')
  assert.equal(montantLisible((10n ** BigInt(DECIMALES_NATIF)).toString(), eth), '1')
  // `symboles.json` ne porte PAS `decimals()` : supposer 18 pour un ERC-20 afficherait un
  // montant faux d un facteur mille milliards sans que rien ne le dise.
  assert.equal(montantLisible('1000000', usdc), null)
  assert.ok(!Object.values(SYMBOLES.jetons).some((j) => 'decimales' in (j as object)))
})

/* ------------------- 8 quater. la route, le champ lu, le selecteur */

test('la route bascule, et la bascule est un GESTE qu on peut couper', () => {
  // Les deux routes coexistent du debut a la fin : celle qui n'est pas prise RECULE, elle ne part pas.
  assert.ok(ROUTE.includes('{proposee && ('), 'la seconde route reste rendue')
  assert.ok(ROUTE.includes("if (choisie !== null) return choisie === quoi ? 'choisie' : 'ecartee'"))
  // Et le choix se dit par un MOT, jamais par une teinte seule.
  assert.ok(ROUTE.includes("if (e === 'ecartee') return 'not taken'"))
  const css = lire('../index.css')
  assert.match(css, /\.demo-route-ecartee \.demo-route-chemin,\n\.demo-route-ecartee \.demo-route-recoit \{\n  opacity: 0\.3;/)
  // Sous prefers-reduced-motion, l'alarme s'arrete et l'etat reste.
  const i = css.lastIndexOf('@media (prefers-reduced-motion: reduce)')
  const bloc = css.slice(i)
  assert.ok(i > 0 && bloc.includes('.demo-route-ecartee,') && bloc.includes('animation: none'))
  assert.match(bloc, /\.demo-route-ecartee \{\n    background: rgba\(202, 64, 74, 0\.16\);/)
})

test("le champ montre a l exterieur est celui RELU de l appareil", () => {
  // Jamais une liste ecrite d avance : montrer une chose et en signer une autre est
  // precisement ce que ce projet combat.
  assert.ok(ECRAN.includes('on the device:'), 'le champ relu est rendu a l exterieur')
  assert.ok(ECRAN.includes('{ecranTexte}'), 'il rend la variable relue, pas une constante')
  assert.ok(ECRAN.includes('const lireEcran = useCallback'))
  assert.ok(ECRAN.includes('e.speculos.ecran ?? null'), 'et elle vient de /demo/etat')
  // La trace des ecrans defiles vient de la MEME lecture, une par appui.
  assert.ok(ECRAN.includes('noter(await lireEcran())'))
  assert.ok(!/const ECRANS\s*=\s*\[/.test(ECRAN), 'aucune liste d ecrans ecrite d avance')
})

test("l empreinte est affichee, pour qu un jury puisse la rapprocher", () => {
  assert.ok(ECRAN.includes('prompt digest'))
  // Celle de la question que l'appareil montre, puis celle de la reponse signee — pas une empreinte
  // calculee d'avance : c'est ce qu'on peut rapprocher de l'ecran du Ledger, caractere par caractere.
  assert.ok(ECRAN.includes('progres?.digest_en_cours ?? progres?.resultat?.prompt_digest'))
  assert.ok(ECRAN.includes('keccak256 of the text sent to the device'))
  assert.ok(PONT.includes('digest_en_cours: string | null'), 'le pont la porte dans son contrat')
})

test('le selecteur liste les paires nommees, et compte celles qu il laisse', () => {
  const nomme = (a: string) => Boolean(SYMBOLES.jetons[a.toLowerCase()]?.symbole)
  const toutes = pairesMesurees()
  const { montrees, restantes, total } = pairesAMontrer(nomme)
  assert.equal(total, toutes.length)
  assert.equal(montrees.length + restantes, total)
  assert.ok(montrees.length > 0 && restantes > 0, 'la troncature existe, et elle se voit')
  for (const p of montrees) assert.ok(nomme(p.entree) && nomme(p.sortie))
  // Elle n est jamais silencieuse.
  assert.ok(PAIRES.includes('{groupDigits(String(restantes))} more pairs are measured and not listed'))
  assert.ok(PAIRES.includes('inventing one is the fault this project'), 'et on dit pourquoi')
})

test('le selecteur ne change PAS la paire executee, et le dit', () => {
  assert.ok(PAIRES.includes('the corpus answers for every pair; the two acts below execute the'))
  assert.ok(ECRAN.includes('const surLaPaireExecutee'))
  assert.ok(ECRAN.includes('actif={!occupe && surLaPaireExecutee && Boolean(fournisseurBrut)}'))
  assert.ok(ECRAN.includes('the bridge only prepares the executed one'), 'la raison est ecrite')
})

test('un classement de portes ne melange ni les tailles ni les sens', () => {
  const p = acteSubstitution()!
  const c = classer(p.actuelle.entree, p.actuelle.sortie)
  assert.ok(c.taille !== null)
  for (const x of [...c.classees, ...c.horsClassement]) assert.equal(x.taille, c.taille)
  // Classees = MESUREES seulement, triees du moins cher au plus cher.
  for (const x of c.classees) assert.equal(typeof x.bps, 'number')
  for (let i = 1; i < c.classees.length; i++)
    assert.ok(c.classees[i]!.bps! >= c.classees[i - 1]!.bps!)
  for (const x of c.horsClassement) assert.equal(x.bps, null)
  assert.equal(cleDe(p.actuelle.entree, p.actuelle.sortie), `${p.actuelle.entree}>${p.actuelle.sortie}`)
})

test('la commande de rejeu vise le noeud rendu par le pont, pas un anvil local ecrit ici', () => {
  const fmt = lire('./format.ts')
  assert.match(fmt, /export const RPC_LOCAL = 'http:\/\/127\.0\.0\.1:8545'/)
  assert.match(fmt, /rpc: string = RPC_LOCAL/)
  assert.ok(ECRAN.includes('const rpcRejeu = fork?.rpc ?? RPC_LOCAL'), "l URL vient de /demo/etat")
  assert.ok(ECRAN.includes('replayCommand(a.actuelle.row, rpcRejeu)'))
  assert.ok(!jsxSeul(ECRAN).includes('tare-hooks.tech/rpc'), "l URL publique n est pas ecrite ici")
  // Les deux limites sont avouees, pas tues.
  assert.ok(ECRAN.includes('it needs the repository and Python 3'))
  assert.ok(ECRAN.includes('it is shared'))
  assert.ok(ECRAN.includes('make up'))
})

test("la provenance de chaque valeur est marquee : rien n est saisi par l utilisateur", () => {
  // C est l argument du produit : l utilisateur ne fournit ni pool id ni hook. Une page qui
  // affiche ces valeurs sans dire d ou elles viennent se confond avec un formulaire.
  for (const s of ['calldata', 'derive', 'corpus']) assert.ok(ECRAN.includes(`'${s}'`))
  assert.ok(ECRAN.includes('read from the calldata — nobody typed it'))
  assert.ok(ECRAN.includes('re-derived here, then matched against the corpus'))
  assert.ok(ECRAN.includes('from the published measurements'))
  assert.ok(ECRAN.includes('src="calldata"') && ECRAN.includes('src="derive"') && ECRAN.includes('src="corpus"'))
  // Et le premier panneau dit que c est un swap qu on etait sur le point de faire.
  assert.ok(ECRAN.includes('This is a swap you were about to make'))
})

/* ------------------- 8 quinquies. la mise en page suit la phase */

test('quatre phases, quatre hierarchies — et rien ne disparait', () => {
  // Tout avait la meme importance tout le temps, donc rien ne guidait l'oeil. La phase se
  // DERIVE de l'etat : aucune bascule manuelle, donc aucune phase impossible a atteindre.
  assert.ok(ECRAN.includes("type Phase = 'repos' | 'choix' | 'appareil' | 'fini'"))
  assert.ok(ECRAN.includes("const phase: Phase ="))
  // L'ecran en tire six images, derivees elles aussi : un refus ne se montre pas comme un recu.
  assert.ok(ECRAN.includes("type Visuel = 'repos' | 'garde' | 'appareil' | 'portefeuille' | 'refus' | 'recu'"))
  assert.ok(ECRAN.includes('const visuel: Visuel ='))
  // 1. au repos la these domine ; pendant le parcours elle se REPLIE et recule, elle ne part pas.
  assert.ok(ECRAN.includes('replie={replie}'))
  assert.ok(ECRAN.includes("const replie = visuel !== 'repos'"))
  assert.ok(BANDE.includes('demo-bande-replie demo-recule'))
  assert.ok(BANDE.includes('see the tail'), 'la queue reste atteignable dans toutes les phases')
  // 2. la scene se reorganise par phase : chaque image a sa grille, rien n'est retire du DOM.
  assert.ok(ECRAN.includes('gridTemplateRows: LIGNES[visuel]'))
  for (const v of ['repos', 'garde', 'appareil', 'portefeuille', 'refus', 'recu']) {
    assert.match(ECRAN, new RegExp(`\\n    ${v}: '[.0-9fr ]+',`), `la grille de l image ${v}`)
  }
  // 3. quand l'appareil pose ses questions, son ecran devient l'objet central, avec le champ relu.
  assert.ok(ECRAN.includes("direct={visuel === 'appareil'}"))
  assert.ok(ECRAN.includes('field now'), 'le champ en cours, en gros, hors de l appareil')
  // 4. a la fin, ce qu'on a garde prend le panneau ; l'en-tete et la these reculent.
  assert.ok(ECRAN.includes("visuel === 'recu' && ("))
  assert.ok(lire('../index.css').includes('.demo-recule'))
})

test('les trois choix sont nommes par ce qu ils FONT, pas par leur jargon', () => {
  // « go anyway » et « substitute » demandaient de reflechir. Un spectateur doit comprendre
  // sans lire deux fois : ce qui part, et ce que ca coute.
  assert.ok(ECRAN.includes('refuse · send nothing'))
  assert.ok(ECRAN.includes('send as is'))
  assert.ok(ECRAN.includes('take the other gate'))
  const jsx = jsxSeul(ECRAN)
  assert.ok(!/>\s*go anyway/.test(jsx) && !/>\s*substitute\s*·/.test(jsx), 'le jargon ne revient pas')
  // Et le cout est DIT sur le bouton, depuis le corpus.
  assert.ok(ECRAN.includes('bpsTexte(acteAffiche.actuelle.bps)'))
  assert.ok(ECRAN.includes('bpsTexte(acteAffiche.proposee.bps!)'))
})

test('la bascule de route se voit, une seule fois, et se coupe', () => {
  assert.ok(ROUTE.includes('demo-route-${etat}'))
  assert.ok(ROUTE.includes("return lue ? 'lue' : 'repos'"))
  const css = lire('../index.css')
  // 250 a 400 ms, franche, sans rebond : pas de cubic-bezier a depassement.
  const m = /\.demo-route \{[\s\S]*?transition: [a-z-]+ (\d{3})ms/.exec(css)
  assert.ok(m, 'la transition doit exister')
  const ms = Number(m[1])
  assert.ok(ms >= 250 && ms <= 400, `la bascule dure ${ms} ms`)
  assert.ok(!/demo-route[\s\S]{0,400}cubic-bezier\([^)]*-/.test(css), 'aucun rebond')
  assert.ok(!/--demo-ease: cubic-bezier\([^)]*-/.test(css), 'la courbe de la scene ne rebondit pas non plus')
  // Et sous prefers-reduced-motion, la bascule RESTE et l animation part.
  const bloc = css.slice(css.lastIndexOf('@media (prefers-reduced-motion: reduce)'))
  assert.ok(bloc.includes('.demo-route,') && bloc.includes('animation: none') && bloc.includes('transition: none'))
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
