// LE RECENSEMENT DES DONNÉES — à lancer avec le runner de Node :
//
//     cd apps/web && node --test src/lib/outils.test.ts
//
// POURQUOI CE FICHIER EXISTE.
//
// La question posée était simple et n'avait aucune réponse écrite : « on a oublié aucune donnée
// dans les outils à montrer ? ». Tant que la liste des jeux de données vivait dans la tête de
// celui qui l'avait tapée, la réponse était « je crois ». Ces tests la rendent vérifiable :
//
//   1. tout fichier SUIVI PAR GIT sous docs/dataset/ ou packages/guard/data/ a une entrée dans
//      `donnees.ts`. Ajouter un artefact au dépôt sans le rattacher à un outil fait tomber ce
//      test — c'est exactement l'oubli qu'on veut rendre impossible ;
//   2. toute entrée de `donnees.ts` est lue ou écrite par au moins un outil, et par un outil
//      qui existe. Une donnée que rien ne consomme est une donnée qu'on croit montrer ;
//   3. tout fichier de code cité par un outil EXISTE. Trois chemins inventés ont déjà été
//      publiés dans ce dépôt aujourd'hui ; ce test est le garde-fou ;
//   4. chaque outil dit ce qui entre, ce qu'il fait, et ce qui sort. Six des quatorze pages
//      n'avaient aucune sortie nommée avant ce travail.
//
// Les volumes ne sont PAS testés ici : ils sont stattés au build par `scripts/build-facts.mjs`.
// Ce test vérifie seulement que chaque jeu déclaré a bien été statté — si le fichier manquait
// au build, il est dans `facts.manquants` et l'écran affiche « non lu ».

import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

import { OUTILS, outil, ACCES } from './outils.ts'
import { DONNEES } from './donnees.ts'
import facts from '../data/facts.json' with { type: 'json' }

const ICI = dirname(fileURLToPath(import.meta.url))
const DEPOT = resolve(ICI, '../../../..')

/** Les fichiers de données réellement suivis par git — la source de vérité, pas une liste. */
const suivis = (prefixe: string): string[] =>
  execFileSync('git', ['ls-files', prefixe], { cwd: DEPOT, encoding: 'utf8' })
    .split('\n')
    .filter((l) => l.trim())

const inventaire = (facts as { inventaire: Record<string, { fichier: string }> }).inventaire

test('aucun fichier de donnees du depot n\'est orphelin : tout est rattache a un outil', () => {
  const declares = new Set(Object.values(inventaire).map((v) => v.fichier))
  const oublies: string[] = []
  for (const prefixe of ['docs/dataset', 'packages/guard/data']) {
    for (const f of suivis(prefixe)) {
      if (!declares.has(f)) oublies.push(f)
    }
  }
  // Les jeux qui ne vivent pas sous docs/dataset/ sont nommes un par un : `docs/hooks-source/`
  // contient des milliers de fichiers Solidity, on ne peut pas exiger le prefixe entier. La
  // concordance source, elle, est la donnee n° 5 du tableau jury — et elle avait ete oubliee.
  for (const f of [
    'docs/hooks-source/analysis.json',
    'docs/x402-settlements.jsonl',
    'docs/ledger/guard-speculos.json',
    'docs/hooklist-live-20260905.json',
    'apps/web/public/data/hooklist.snapshot.json',
    'engine/tare/graph/data/chain-cache.json',
  ]) {
    if (!declares.has(f)) oublies.push(f)
  }
  assert.deepEqual(
    oublies,
    [],
    `ces fichiers sont dans le depot et aucun outil ne les reclame — ` +
      `ajoutez-les a apps/web/src/lib/donnees.ts et a JEUX dans scripts/build-facts.mjs : ${oublies.join(', ')}`,
  )
})

test('les deux listes coincident : donnees.ts et l\'inventaire statte au build', () => {
  const aGauche = DONNEES.map((j) => j.cle).sort()
  const aDroite = Object.keys(inventaire).sort()
  assert.deepEqual(aGauche, aDroite, 'une cle existe d\'un cote et pas de l\'autre')
})

test('chaque jeu de donnees est lu ou ecrit par au moins un outil qui existe', () => {
  for (const j of DONNEES) {
    const tous = [...j.lu_par, ...j.ecrit_par]
    assert.ok(tous.length > 0, `${j.cle} : aucun outil ne le lit ni ne l'ecrit`)
    for (const n of tous) {
      assert.ok(outil(n), `${j.cle} renvoie a l'outil ${n}, qui n'existe pas`)
    }
    assert.ok(j.quoi.length > 40, `${j.cle} : « ${j.quoi} » ne dit pas ce que le fichier contient`)
    assert.ok(j.produit.length > 5, `${j.cle} : on ne dit pas comment il a ete produit`)
  }
})

test('chaque fichier de code cite par un outil existe vraiment', () => {
  const absents: string[] = []
  for (const o of OUTILS) {
    for (const c of o.code) {
      if (!existsSync(resolve(DEPOT, c))) absents.push(`outil ${o.n} -> ${c}`)
    }
  }
  assert.deepEqual(absents, [], `chemins cites qui n'existent pas : ${absents.join(', ')}`)
})

test('chaque outil dit ce qui entre, ce qu\'il fait, et ce qui sort', () => {
  for (const o of OUTILS) {
    assert.ok(o.entree.length >= 1, `outil ${o.n} (${o.nom}) : rien en entree`)
    assert.ok(o.execute.length >= 3, `outil ${o.n} (${o.nom}) : moins de trois etapes — « il analyse » ne dit rien`)
    assert.ok(o.sortie.length >= 2, `outil ${o.n} (${o.nom}) : moins de deux champs en sortie`)
    for (const c of o.sortie) {
      assert.ok(c.champ.length > 0 && c.quoi.length > 15, `outil ${o.n} : le champ ${c.champ} ne dit pas ce qu'il vaut`)
    }
  }
})

test('un outil qui n\'est pas pret dit pourquoi, et un outil pret ne s\'excuse pas', () => {
  for (const o of OUTILS) {
    if (o.etat === 'pret') {
      assert.equal(o.pourquoi, undefined, `outil ${o.n} est pret : il n'a pas a se justifier`)
    } else {
      assert.ok(
        (o.pourquoi ?? '').length > 60,
        `outil ${o.n} n'est pas pret et ne dit pas pourquoi — « a construire » sans raison est une case vide`,
      )
    }
  }
})

test('les outils d\'action nomment ce qui change, pas seulement ce qu\'ils rendent', () => {
  // La famille `action` est la seule qui touche a l'argent de quelqu'un. Sa derniere etape doit
  // dire ce qui se passe vraiment : une signature demandee, une transaction rendue, un refus.
  const verbes = /sign|transaction|refus|session|ecri|écri|rend|ouvre|ancre|activ/i
  for (const o of OUTILS.filter((x) => x.famille === 'action')) {
    const derniere = o.execute[o.execute.length - 1] ?? ''
    assert.match(derniere, verbes, `outil ${o.n} (${o.nom}) : la derniere etape ne nomme pas ce qui change`)
  }
})

test('chaque outil d\'analyse lit au moins un jeu de donnees nomme', () => {
  // Un outil d'analyse qui ne lirait aucun fichier lirait donc quoi ? C'est la question que
  // ce test pose. Les familles `action` et `collecte` en sont dispensees : elles lisent la
  // chaine, ou un calldata, qui n'est pas un fichier du depot.
  for (const o of OUTILS.filter((x) => x.famille === 'analyse')) {
    const lus = DONNEES.filter((j) => j.lu_par.includes(o.n))
    assert.ok(lus.length >= 1, `outil ${o.n} (${o.nom}) est d'analyse et ne lit aucun jeu declare`)
  }
})

test('les cinq acces et les quatorze outils disent la meme chose, dans les deux sens', () => {
  // La table se lit dans les deux sens : un acces liste ses outils, un outil liste ses acces.
  // Rien ne garantissait qu'elles coincident — et elles ne coincidaient pas : l'acces « site »
  // ne listait pas l'outil 4, qui se disait pourtant accessible par le site.
  const ecarts: string[] = []
  for (const a of ACCES) {
    for (const n of a.outils) {
      const o = outil(n)
      if (!o) { ecarts.push(`acces ${a.cle} renvoie a l'outil ${n}, qui n'existe pas`); continue }
      if (!o.acces.includes(a.cle)) ecarts.push(`acces ${a.cle} revendique l'outil ${n} (${o.nom}), qui ne le liste pas`)
    }
  }
  for (const o of OUTILS) {
    for (const c of o.acces) {
      const a = ACCES.find((x) => x.cle === c)
      if (!a) { ecarts.push(`outil ${o.n} cite l'acces ${c}, qui n'existe pas`); continue }
      if (!a.outils.includes(o.n)) ecarts.push(`outil ${o.n} (${o.nom}) dit passer par ${c}, qui ne le liste pas`)
    }
  }
  assert.deepEqual(ecarts, [], ecarts.join(' | '))
})

test('chaque acces dit a qui il s\'adresse, pourquoi lui, et ce qu\'il faut', () => {
  for (const a of ACCES) {
    assert.ok(a.pour.length > 15, `acces ${a.cle} : on ne dit pas a qui il s'adresse`)
    assert.ok(a.pourquoi.length > 150, `acces ${a.cle} : « pourquoi celui-la et pas un autre » n'est pas repondu`)
    assert.ok(a.prerequis.length > 3, `acces ${a.cle} : on ne dit pas ce qu'il faut pour s'en servir`)
    assert.ok(a.outils.length >= 1, `acces ${a.cle} : il n'ouvre aucun outil`)
  }
})

test('chaque outil est atteignable par au moins un acces', () => {
  for (const o of OUTILS) {
    assert.ok(o.acces.length >= 1, `outil ${o.n} (${o.nom}) n'est atteignable par rien`)
  }
})

test('le repli sans JavaScript ne peut pas annoncer un chiffre faux', () => {
  // `<noscript>` est servi a tout ce qui ne lance pas de JavaScript : un robot d'indexation,
  // un apercu de lien, un lecteur en mode texte. Il annoncait « 128 mesures, 4 hooks,
  // 32 pools » et citait `docs/measurements-v1.json`, un fichier qui n'existe plus — un
  // corpus 977 fois trop petit, servi sur CHAQUE route, et que personne ne relisait parce
  // que personne ne le voit dans un navigateur normal.
  //
  // La regle n'est pas « il doit porter le bon compte » : ne porter AUCUN compte est une
  // reponse valable, et meme la meilleure, puisque les comptes vivent dans le corpus et que
  // le corpus a besoin du script. La regle est : aucun nombre qui ne soit pas vrai.
  const html = readFileSync(resolve(DEPOT, 'apps/web/index.html'), 'utf8')
  // Les COMMENTAIRES sont retires avant de chercher : un commentaire qui explique pourquoi
  // « 128 mesures » a ete supprime n'est pas « 128 mesures » servi au monde. Faire tomber un
  // test sur un commentaire est une facon de ne rien tester du tout.
  const bloc = html
    .slice(html.indexOf('<noscript>'), html.indexOf('</noscript>'))
    .replace(/<!--[\s\S]*?-->/g, '')
  assert.ok(bloc.length > 0, 'le <noscript> a disparu')

  for (const mort of ['128 mesures', '4 hooks', '32 pools', 'measurements-v1.json']) {
    assert.equal(bloc.includes(mort), false, `« ${mort} » est encore annonce au monde sans JavaScript`)
  }

  // Tout nombre d'au moins trois chiffres doit etre un chiffre REEL du depot.
  const inv = (facts as { inventaire: Record<string, { n: number | null }> }).inventaire
  const vrais = new Set(
    Object.values(inv)
      .map((v) => v.n)
      .filter((n): n is number => typeof n === 'number')
      .map(String),
  )
  vrais.add('50614000') // le bloc epingle
  vrais.add('38857') // les mesures au-dessus d'un point de base
  vrais.add('7817') // les pools
  vrais.add('112') // les hooks
  vrais.add('2026') // une annee dans un lien ou un nom de fichier
  for (const nombre of bloc.replace(/&nbsp;/g, '').match(/\d{3,}/g) ?? []) {
    assert.ok(
      vrais.has(nombre),
      `le repli sans JS annonce ${nombre}, qui ne correspond a aucun compte du depot`,
    )
  }
})
