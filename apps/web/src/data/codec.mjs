// LE CODEC DU JEU EMBARQUE.
//
// Le jeu de mesures pese 87 Mo en JSON naif, et il part dans le bundle du navigateur : la
// page mettait 10,3 s avant d'afficher son premier texte et tenait 1,18 Go de tas. Le
// probleme n'est pas le nombre de lignes (125 072), c'est leur REDONDANCE — la meme
// empreinte de stub recopiee 125 072 fois, le meme pool_id recopie une fois par taille et
// par sens, la meme version de moteur partout.
//
// Ce fichier encode les lignes par COLONNE au lieu de par objet, et rend au decodage des
// objets IDENTIQUES a l'octet pres — memes cles, meme ordre, memes valeurs. Rien n'est
// arrondi, rien n'est jete : ce serait perdre une mesure pour gagner un megaoctet.
//
// Quatre encodages, choisis par MESURE de la colonne et jamais par supposition :
//
//   const  une seule valeur distincte dans tout le jeu        -> elle est ecrite une fois
//   pool   constante a l'interieur de chaque pool             -> une valeur par pool
//   dict   peu de valeurs distinctes                          -> un dictionnaire + des index
//   raw    tout le reste                                      -> le tableau tel quel
//
// `id` a son propre cas : il vaut l'indice de la ligne, donc il ne s'ecrit pas du tout.
//
// L'encodeur VERIFIE son propre travail avant de rendre : il decode ce qu'il vient
// d'encoder et compare ligne a ligne. Un codec qui se trompe en silence transformerait une
// mesure en une autre, et l'instrument entier repose sur ces lignes.

/** Au-dela de cette part de valeurs distinctes, un dictionnaire ne fait plus gagner. */
const SEUIL_DICT = 0.5

const cle = (v) => (typeof v === 'string' ? 's' + v : JSON.stringify(v))

function encodeColonne(nom, valeurs, groupes) {
  const distinctes = new Map()
  for (const v of valeurs) {
    const k = cle(v)
    if (!distinctes.has(k)) distinctes.set(k, v)
  }

  if (distinctes.size === 1) return { k: 'const', v: valeurs[0] }

  // Constante a l'interieur de chaque pool ? On ne le suppose pas — on le verifie. Une
  // colonne qui varierait au sein d'un pool (un frais dynamique relu a chaque taille, par
  // exemple) doit retomber sur dict ou raw, pas etre aplatie sur sa premiere valeur.
  if (groupes) {
    const parGroupe = new Array(groupes.nb).fill(undefined)
    let constante = true
    for (let i = 0; i < valeurs.length; i++) {
      const g = groupes.of[i]
      if (parGroupe[g] === undefined) parGroupe[g] = valeurs[i]
      else if (cle(parGroupe[g]) !== cle(valeurs[i])) {
        constante = false
        break
      }
    }
    if (constante) return { k: 'pool', v: parGroupe }
  }

  if (distinctes.size <= valeurs.length * SEUIL_DICT) {
    const d = [...distinctes.values()]
    const rang = new Map([...distinctes.keys()].map((k, i) => [k, i]))
    return { k: 'dict', d, i: valeurs.map((v) => rang.get(cle(v))) }
  }

  return { k: 'raw', v: valeurs }
}

function decodeColonne(col, n, groupes) {
  switch (col.k) {
    case 'const':
      return new Array(n).fill(col.v)
    case 'pool':
      return groupes.of.map((g) => col.v[g])
    case 'dict':
      return col.i.map((i) => col.d[i])
    case 'raw':
      return col.v
    default:
      throw new Error(`encodage inconnu : ${col.k}`)
  }
}

/**
 * Encode les lignes. `groupePar` nomme la colonne qui definit les pools ; les colonnes
 * constantes a l'interieur d'un pool ne sont alors ecrites qu'une fois par pool.
 */
export function encodeRows(rows, groupePar = 'pool_id') {
  const n = rows.length
  if (n === 0) return { n: 0, fields: [], enc: {}, groupes: null }

  // L'ordre des cles est celui de la premiere ligne, et il est RENDU tel quel : deux lignes
  // qui ne differeraient que par l'ordre de leurs cles ne sont pas egales pour JSON.stringify,
  // et plusieurs verifications du depot comparent ainsi.
  const fields = Object.keys(rows[0])

  const groupesIds = []
  const rang = new Map()
  const of = new Array(n)
  for (let i = 0; i < n; i++) {
    const v = rows[i][groupePar]
    let g = rang.get(v)
    if (g === undefined) {
      g = groupesIds.length
      rang.set(v, g)
      groupesIds.push(v)
    }
    of[i] = g
  }
  const groupes = { nb: groupesIds.length, ids: groupesIds, of }

  const idEstIndice = fields.includes('id') && rows.every((r, i) => r.id === i)

  const enc = {}
  for (const f of fields) {
    if (f === 'id' && idEstIndice) {
      enc[f] = { k: 'seq' }
      continue
    }
    if (f === groupePar) {
      enc[f] = { k: 'groupe' }
      continue
    }
    enc[f] = encodeColonne(f, rows.map((r) => r[f]), groupes)
  }

  const out = { n, fields, groupePar, groupes: { ids: groupesIds, of }, enc }

  // La verification. Elle coute quelques secondes au build et elle est la raison pour
  // laquelle ce fichier est utilisable : sans elle, une colonne mal classee remplacerait
  // silencieusement une mesure par celle d'a cote.
  const relu = decodeRows(out)
  if (relu.length !== n) throw new Error(`codec : ${relu.length} lignes relues pour ${n}`)
  for (let i = 0; i < n; i++) {
    if (JSON.stringify(relu[i]) !== JSON.stringify(rows[i])) {
      throw new Error(
        `codec : la ligne ${i} ne se relit pas identique\n  ecrite : ${JSON.stringify(rows[i])}\n  relue  : ${JSON.stringify(relu[i])}`,
      )
    }
  }
  return out
}

/** Reconstruit les lignes. Les chaines repetees sont PARTAGEES : c'est la ou le tas fond. */
export function decodeRows(enc) {
  const { n, fields, groupes } = enc
  if (!n) return []
  const g = { nb: groupes.ids.length, ids: groupes.ids, of: groupes.of }

  const colonnes = {}
  for (const f of fields) {
    const c = enc.enc[f]
    if (c.k === 'seq') continue
    if (c.k === 'groupe') {
      colonnes[f] = null // resolu ligne par ligne : g.ids[g.of[i]]
      continue
    }
    colonnes[f] = decodeColonne(c, n, g)
  }

  const rows = new Array(n)
  for (let i = 0; i < n; i++) {
    const r = {}
    for (const f of fields) {
      const c = enc.enc[f]
      if (c.k === 'seq') r[f] = i
      else if (c.k === 'groupe') r[f] = g.ids[g.of[i]]
      else r[f] = colonnes[f][i]
    }
    rows[i] = r
  }
  return rows
}
