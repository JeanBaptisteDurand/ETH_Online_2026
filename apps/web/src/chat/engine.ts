// L'EXECUTION DES ACTIONS, DANS LE NAVIGATEUR.
//
// Le serveur execute les memes actions sur son modele de lecture pour pouvoir DIRE ce qui
// revient ; ici on les execute sur le tableau pour qu'il BOUGE. Les deux lectures sont
// comparees a chaque reponse (voir sameFilter / crossCheck) : si elles divergent, le chat
// l'affiche au lieu de choisir laquelle croire.
//
// Deux refus explicites, portes tels quels depuis apps/api/src/assistant/execute.ts :
//   - un hook SANS mesure n'est jamais "sous le seuil" : il sort de la selection dans une
//     liste a part, avec sa raison et son etiquette ;
//   - rien n'est complete, rien n'est interpole : une absence reste une absence.

import type {
  Action,
  ActionResult,
  ChatView,
  ColumnName,
  Filter,
  SortDir,
  Withheld,
} from './types.ts'
import { EMPTY_VIEW, FLAG_NAMES, LABEL_FR } from './types.ts'
import type { HookNode, Model } from './model.ts'

export interface FilterOutcome {
  kept: HookNode[]
  withheld: Withheld[]
}

/** Portage exact de applyFilter() — apps/api/src/assistant/execute.ts. */
export function applyFilter(hooks: HookNode[], f: Filter): FilterOutcome {
  const kept: HookNode[] = []
  const withheld: Withheld[] = []
  const drop = (h: HookNode, reason: string) =>
    withheld.push({ hook: h.address, name: h.name, reason, label: h.answerLabel })

  for (const h of hooks) {
    if (f.hook && h.address !== f.hook) continue
    if (f.pool && !h.pools.includes(f.pool)) continue
    if (f.chain && (h.chain ?? '').toLowerCase() !== f.chain.toLowerCase()) continue
    if (f.flag) {
      const i = FLAG_NAMES.indexOf(f.flag)
      if (i < 0 || !h.flagBits[i]) continue
    }
    if (f.label && h.counts[LABEL_FR[f.label]] === 0) continue
    if (f.nonFlat === true && h.nonFlatProfiles === 0) continue
    if (f.nonFlat === false && h.nonFlatProfiles > 0) continue
    if (f.search) {
      const needle = f.search.toLowerCase()
      if (!`${h.address} ${h.name ?? ''}`.toLowerCase().includes(needle)) continue
    }
    if (f.allowlisted !== undefined && h.inRegistry !== f.allowlisted) continue
    if (f.registryDisagrees !== undefined) {
      if (h.disagreement.is === null) {
        drop(h, h.disagreement.note)
        continue
      }
      if (h.disagreement.is !== f.registryDisagrees) continue
    }
    if (f.measuredOnly === true && h.measured === 0) {
      drop(h, 'aucune mesure MESURE sur ce hook')
      continue
    }
    // Un hook sans mesure n'est PAS "sous le seuil" : c'est une absence de mesure.
    if (f.minBps !== undefined || f.maxBps !== undefined) {
      if (h.bpsMax === null) {
        drop(h, 'pas de valeur mesuree : ce hook ne peut etre ni au-dessus ni en dessous d’un seuil')
        continue
      }
      if (f.minBps !== undefined && h.bpsMax < f.minBps) continue
      if (f.maxBps !== undefined && h.bpsMax > f.maxBps) continue
    }
    kept.push(h)
  }
  return { kept, withheld }
}

/** Portage exact de SORT_KEY — apps/api/src/assistant/execute.ts. */
const SORT_KEY: Record<ColumnName, (h: HookNode) => number | string> = {
  hook: (h) => h.address,
  registre: (h) => (h.inRegistry ? (h.name ?? 'zzz') : '￿'),
  mesure: (h) => (h.bpsMax === null ? -1 : h.bpsMax),
  pools: (h) => h.poolCount,
  mesures: (h) => h.rowCount,
  etiquette: (h) => h.answerLabel,
  audit: (h) => (h.auditUrl ? 0 : 1),
}

export function applySort(hooks: HookNode[], col: ColumnName, dir: SortDir): HookNode[] {
  const key = SORT_KEY[col]
  const sign = dir === 'asc' ? 1 : -1
  return hooks.slice().sort((a, b) => {
    const ka = key(a)
    const kb = key(b)
    if (typeof ka === 'number' && typeof kb === 'number') return (ka - kb) * sign
    return String(ka).localeCompare(String(kb)) * sign
  })
}

/** La selection courante du tableau : le filtre applique, puis le tri. */
export function select(model: Model, view: ChatView): { rows: HookNode[]; withheld: Withheld[] } {
  const out = view.filter ? applyFilter(model.hooks, view.filter) : { kept: model.hooks.slice(), withheld: [] }
  const rows = view.sort ? applySort(out.kept, view.sort.col, view.sort.dir) : out.kept
  return { rows, withheld: out.withheld }
}

/* --------------------------------------------------------------- structure */

/** Les hooks qui declarent EXACTEMENT les memes 14 permissions. Aucun RPC : c'est l'adresse. */
export function twins(model: Model, hook: string): HookNode[] {
  const h = model.byHook.get(hook)
  if (!h) return []
  return model.hooks.filter((o) => o.address !== hook && o.mask === h.mask)
}

export interface Contradictions {
  confirmed: HookNode[]
  unknowable: { hook: HookNode; note: string }[]
}

/** Registre contre mesure. `null` reste `null` : on ne le compte pas comme un accord. */
export function contradictions(model: Model): Contradictions {
  const confirmed: HookNode[] = []
  const unknowable: { hook: HookNode; note: string }[] = []
  for (const h of model.hooks) {
    if (h.disagreement.is === true) confirmed.push(h)
    else if (h.disagreement.is === null) unknowable.push({ hook: h, note: h.disagreement.note })
  }
  return { confirmed, unknowable }
}

export interface Orphans {
  measuredNotInRegistry: HookNode[]
  poolsWithoutMeasurement: { hook: string; poolId: string }[]
}

export function orphans(model: Model): Orphans {
  const pools: { hook: string; poolId: string }[] = []
  for (const h of model.hooks)
    for (const p of h.profiles) if (p.measured === 0) pools.push({ hook: h.address, poolId: p.poolId })
  return {
    measuredNotInRegistry: model.hooks.filter((h) => !h.inRegistry),
    poolsWithoutMeasurement: pools,
  }
}

/* -------------------------------------------------------------- comparaison */

function sameNum(a: number | undefined, b: number | undefined): boolean {
  return (a ?? null) === (b ?? null)
}

/** Deux criteres sont-ils le meme critere ? Sert a savoir si les selections sont comparables. */
export function sameFilter(a: Filter | null, b: Filter | null): boolean {
  if (a === null || b === null) return a === b
  const keys: (keyof Filter)[] = [
    'minBps',
    'maxBps',
    'chain',
    'flag',
    'label',
    'allowlisted',
    'registryDisagrees',
    'hook',
    'pool',
    'nonFlat',
    'measuredOnly',
    'search',
  ]
  for (const k of keys) {
    const va = a[k]
    const vb = b[k]
    if (typeof va === 'number' || typeof vb === 'number') {
      if (!sameNum(va as number | undefined, vb as number | undefined)) return false
    } else if ((va ?? null) !== (vb ?? null)) return false
  }
  return true
}

/**
 * La lecture locale et la lecture du serveur doivent tomber sur la meme selection quand elles
 * appliquent le MEME critere. Sinon on ne tranche pas : on l'ecrit.
 */
export function crossCheck(
  local: string[],
  server: string[] | null,
  localFilter: Filter | null,
  serverCriteria: Filter | null,
): string | null {
  if (server === null) return null
  if (!sameFilter(localFilter, serverCriteria)) return null
  const a = [...local].sort().join(',')
  const b = [...server].sort().join(',')
  if (a === b) return null
  return (
    `lecture locale et lecture serveur divergent sur le meme critere : ` +
    `${local.length} ligne(s) ici, ${server.length} la-bas. Rien n'est conclu tant que les deux ne disent pas la meme chose.`
  )
}

/* --------------------------------------------------------------- execution */

export interface ApplyOut {
  view: ChatView
  results: ActionResult[]
  withheld: Withheld[]
  selection: string[]
  /** ce que le front doit avouer sur sa propre execution, quand elle differe du serveur */
  notes: string[]
}

const nf = (n: number | null, digits = 4): string => (n === null ? '—' : n.toFixed(digits))

function res(
  action: Action,
  ok: boolean,
  note: string,
  lines: { k: string; v: string }[] = [],
  hooks: string[] = [],
  payload: string | null = null,
): ActionResult {
  return { action, ok, note, lines, hooks, payload }
}

/**
 * Execute la liste d'actions sur la vue courante et rend la nouvelle vue.
 *
 * `base` est la vue AVANT la question : une question qui ne parle pas de filtre ne defait pas
 * le filtre precedent. Un `reset` ou un `filter` repart, lui, du jeu complet — exactement comme
 * le serveur, ce qui permet de comparer les deux selections.
 */
export function applyActions(actions: Action[], model: Model, base: ChatView = EMPTY_VIEW): ApplyOut {
  let view: ChatView = { ...base, highlight: [...base.highlight] }
  const results: ActionResult[] = []
  let withheld: Withheld[] = []
  // Le critere ACCUMULE PENDANT CETTE LISTE, remis a plat comme le fait le serveur a chaque
  // requete. Sans ca, le front melangerait le critere d'hier avec celui d'aujourd'hui et sa
  // selection ne serait plus comparable a celle du serveur.
  let runCriteria: Filter | null = null
  let touchedFilter = false

  for (const action of actions) {
    switch (action.type) {
      case 'reset': {
        view = { ...EMPTY_VIEW }
        withheld = []
        runCriteria = null
        touchedFilter = true
        results.push(res(action, true, 'tableau remis a plat'))
        break
      }
      case 'filter': {
        const merged: Filter = { ...(runCriteria ?? {}), ...action.filter }
        runCriteria = merged
        touchedFilter = true
        const out = applyFilter(model.hooks, merged)
        withheld = out.withheld
        view = { ...view, filter: merged }
        results.push(
          res(
            action,
            true,
            `${out.kept.length} hook(s) retenu(s), ${out.withheld.length} ecarte(s) faute de mesure`,
            Object.entries(merged).map(([k, v]) => ({ k, v: String(v) })),
            out.kept.map((h) => h.address),
          ),
        )
        break
      }
      case 'sort': {
        view = { ...view, sort: { col: action.col, dir: action.dir } }
        results.push(res(action, true, `tri sur ${action.col}, ${action.dir}`))
        break
      }
      case 'columns': {
        view = { ...view, columns: action.columns }
        results.push(res(action, true, `colonnes : ${action.columns.join(', ')}`))
        break
      }
      case 'highlight': {
        const known = action.hooks.filter((h) => model.byHook.has(h))
        const unknown = action.hooks.filter((h) => !model.byHook.has(h))
        view = { ...view, highlight: known }
        results.push(
          res(
            action,
            true,
            unknown.length === 0
              ? `${known.length} ligne(s) surlignee(s)`
              : `${known.length} ligne(s) surlignee(s), ${unknown.length} adresse(s) absente(s) du jeu charge`,
            unknown.map((h) => ({ k: 'absent du jeu', v: h })),
            known,
          ),
        )
        break
      }
      case 'open': {
        const h = model.byHook.get(action.hook)
        if (!h) {
          results.push(
            res(action, false, "aucune mesure publiee pour ce hook : c'est une absence, pas un zero", [
              { k: 'hook', v: action.hook },
            ]),
          )
          break
        }
        const pool = action.pool && h.pools.includes(action.pool) ? action.pool : null
        view = { ...view, open: { hook: h.address, pool }, highlight: [h.address] }
        results.push(
          res(
            action,
            true,
            action.pool && pool === null ? "ce pool n'est pas dans le jeu pour ce hook" : 'fiche ouverte',
            [
              { k: 'etiquette', v: h.answerLabel },
              { k: 'maximum mesure', v: h.bpsMax === null ? '—' : `${nf(h.bpsMax)} bps` },
              { k: 'bloc', v: h.blocks.join(', ') },
              { k: 'pools', v: `${h.poolCount} dont ${h.poolCountMeasured} cotes` },
            ],
            [h.address],
          ),
        )
        break
      }
      case 'plotCurve': {
        const h = model.byHook.get(action.hook)
        const p = h?.profiles.find((x) => x.poolId === action.pool)
        if (!h || !p) {
          results.push(res(action, false, "ce couple hook/pool n'existe pas dans le jeu"))
          break
        }
        view = {
          ...view,
          open: { hook: h.address, pool: p.poolId },
          curve: { hook: h.address, pool: p.poolId, direction: action.direction },
          highlight: [h.address],
        }
        results.push(
          res(
            action,
            p.measured > 0,
            p.measured === 0 ? 'aucun point cotable sur ce profil' : `${p.measured} point(s) cotes`,
            [
              { k: 'pool', v: p.poolId },
              { k: 'sens', v: action.direction ?? 'les deux' },
              { k: 'max / min', v: `${nf(p.maxBps)} / ${nf(p.minBps)} bps` },
              { k: 'ecart a sens constant', v: p.spreadBps === null ? '—' : `${nf(p.spreadBps)} bps` },
              { k: 'lp fee on-chain', v: String(p.storedLpFee) },
              { k: 'bloc', v: p.blocks.join(', ') },
            ],
            [h.address],
          ),
        )
        break
      }
      case 'compare': {
        const a = model.byHook.get(action.a)
        const b = model.byHook.get(action.b)
        if (!a || !b) {
          results.push(res(action, false, "au moins un des deux hooks n'a aucune mesure publiee"))
          break
        }
        view = { ...view, compare: [a.address, b.address], highlight: [a.address, b.address] }
        results.push(
          res(action, true, 'deux hooks cote a cote', [
            { k: a.name ?? a.address, v: `${a.bpsMax === null ? '—' : nf(a.bpsMax)} bps · ${a.answerLabel}` },
            { k: b.name ?? b.address, v: `${b.bpsMax === null ? '—' : nf(b.bpsMax)} bps · ${b.answerLabel}` },
          ], [a.address, b.address]),
        )
        break
      }
      case 'measure': {
        // On ne mesure PAS ici. Un seul mesureur par anvil : le stub est un etat global.
        results.push(
          res(
            action,
            false,
            'demande de mesure : le navigateur ne mesure pas. Un seul mesureur par anvil.',
            [
              { k: 'hook', v: action.hook },
              { k: 'pool', v: action.pool ?? 'non precise' },
              { k: 'tailles', v: action.sizes.join(', ') },
              { k: 'sens', v: action.directions.join(', ') },
              { k: 'bloc', v: action.block === null ? 'au choix du moteur' : String(action.block) },
              { k: 'route', v: 'POST /measure — peage x402, une unite = une mesure' },
            ],
            [action.hook],
          ),
        )
        break
      }
      case 'showTwins': {
        const t = twins(model, action.hook)
        results.push(
          res(
            action,
            model.byHook.has(action.hook),
            model.byHook.has(action.hook)
              ? `${t.length} hook(s) declarent exactement les memes 14 permissions`
              : 'ce hook n’est pas dans le jeu charge',
            t.map((o) => ({ k: o.name ?? o.address, v: `${o.address} · ${o.answerLabel}` })),
            t.map((o) => o.address),
          ),
        )
        if (t.length) view = { ...view, highlight: [action.hook, ...t.map((o) => o.address)] }
        break
      }
      case 'showBlastRadius': {
        const h = model.byHook.get(action.hook)
        if (!h) {
          results.push(res(action, false, "ce hook n'apparait dans aucune mesure du jeu"))
          break
        }
        view = { ...view, highlight: [h.address] }
        results.push(
          res(action, true, 'pools et jetons atteints par ce hook, dans le jeu charge', [
            { k: 'pools', v: `${h.poolCount} dont ${h.poolCountMeasured} cotes` },
            { k: 'jetons distincts', v: String(h.tokens.length) },
            { k: 'mesures', v: `${h.rowCount} lignes, ${h.measured} etiquetees MESURE` },
            { k: 'profils non plats', v: `${h.nonFlatProfiles} / ${h.profiles.length}` },
          ], [h.address]),
        )
        break
      }
      case 'showDeployer': {
        const h = model.byHook.get(action.hook)
        if (!h) {
          results.push(res(action, false, 'ce hook n’est pas dans le jeu charge'))
          break
        }
        results.push(
          res(action, true, h.inRegistry ? 'ce que le registre dit du deployeur' : 'hook absent du registre officiel', [
            { k: 'deployeur', v: h.deployer ?? 'le registre ne le dit pas' },
            { k: 'source verifiee', v: h.verifiedSource === null ? 'inconnu' : h.verifiedSource ? 'oui' : 'non' },
            { k: 'audit', v: h.auditUrl ?? 'aucun' },
          ], [h.address]),
        )
        break
      }
      case 'showContradictions': {
        const c = contradictions(model)
        runCriteria = { registryDisagrees: true, measuredOnly: true }
        touchedFilter = true
        view = { ...view, filter: runCriteria, highlight: c.confirmed.map((h) => h.address) }
        withheld = applyFilter(model.hooks, runCriteria).withheld
        results.push(
          res(
            action,
            true,
            `${c.confirmed.length} desaccord(s) etabli(s), ${c.unknowable.length} cas non tranchables`,
            [
              ...c.confirmed.map((h) => ({ k: h.name ?? h.address, v: h.disagreement.note })),
              ...c.unknowable.map((u) => ({ k: u.hook.name ?? u.hook.address, v: `non tranchable — ${u.note}` })),
            ],
            c.confirmed.map((h) => h.address),
          ),
        )
        break
      }
      case 'showOrphans': {
        const o = orphans(model)
        runCriteria = { allowlisted: false }
        touchedFilter = true
        view = { ...view, filter: runCriteria, highlight: o.measuredNotInRegistry.map((h) => h.address) }
        results.push(
          res(
            action,
            true,
            `${o.measuredNotInRegistry.length} hook(s) mesures absents du registre, ${o.poolsWithoutMeasurement.length} pool(s) sans mesure cotable`,
            o.measuredNotInRegistry.map((h) => ({
              k: h.address,
              v: `${h.rowCount} lignes · ${h.bpsMax === null ? '—' : `${nf(h.bpsMax)} bps`} · ${h.answerLabel}`,
            })),
            o.measuredNotInRegistry.map((h) => h.address),
          ),
        )
        break
      }
      case 'showEvidence': {
        // Les ids m_xxxx appartiennent au modele du serveur : le jeu local numerote ses lignes
        // autrement. On ne fabrique pas de correspondance — le serveur publie la ligne brute.
        results.push(
          res(action, false, 'la ligne brute et sa commande de rejeu sont publiees par le serveur', [
            { k: 'id de mesure', v: action.measurementId },
          ]),
        )
        break
      }
      case 'export': {
        const rows = select(model, view).rows
        results.push(
          res(action, true, `${rows.length} ligne(s) a exporter en ${action.format}`, [], rows.map((h) => h.address), exportRows(rows, action.format)),
        )
        break
      }
      case 'permalink': {
        const rows = select(model, view).rows
        results.push(res(action, true, `${rows.length} ligne(s) figees dans l'URL`, [], rows.map((h) => h.address), encodeView(view)))
        break
      }
      case 'clarify': {
        results.push(res(action, true, action.question))
        break
      }
    }
  }

  const sel = select(model, view)
  const notes: string[] = []
  if (!touchedFilter && view.filter !== null)
    notes.push(
      "cette reponse ne touche pas au filtre : le tableau garde celui de la question precedente, alors que le serveur, lui, a relu le jeu complet.",
    )
  return {
    view,
    results,
    withheld: withheld.length ? withheld : sel.withheld,
    selection: sel.rows.map((h) => h.address),
    notes,
  }
}

/* ------------------------------------------------------------------ export */

const EXPORT_COLS = [
  'hook',
  'nom_registre',
  'dans_le_registre',
  'vanillaSwap',
  'bps_max',
  'bps_min',
  'pools',
  'pools_cotes',
  'mesures',
  'mesurees',
  'etiquette',
  'blocs',
] as const

function exportCells(h: HookNode): string[] {
  return [
    h.address,
    h.name ?? '',
    String(h.inRegistry),
    h.vanillaSwap === null ? '' : String(h.vanillaSwap),
    h.bpsMax === null ? '' : h.bpsMax.toFixed(4),
    h.bpsMin === null ? '' : h.bpsMin.toFixed(4),
    String(h.poolCount),
    String(h.poolCountMeasured),
    String(h.rowCount),
    String(h.measured),
    h.answerLabel,
    h.blocks.join(' '),
  ]
}

/** L'export ne cree aucune valeur : il recopie la selection, etiquettes comprises. */
export function exportRows(rows: HookNode[], format: 'csv' | 'json' | 'jsonl' | 'markdown'): string {
  if (format === 'csv')
    return [EXPORT_COLS.join(','), ...rows.map((h) => exportCells(h).map((c) => (c.includes(',') ? `"${c}"` : c)).join(','))].join('\n')
  if (format === 'markdown')
    return [
      `| ${EXPORT_COLS.join(' | ')} |`,
      `| ${EXPORT_COLS.map(() => '---').join(' | ')} |`,
      ...rows.map((h) => `| ${exportCells(h).join(' | ')} |`),
    ].join('\n')
  const objs = rows.map((h) => Object.fromEntries(EXPORT_COLS.map((c, i) => [c, exportCells(h)[i]])))
  if (format === 'jsonl') return objs.map((o) => JSON.stringify(o)).join('\n')
  return JSON.stringify(objs, null, 2)
}

/* --------------------------------------------------------------- permalien */

/** L'etat courant, fige. Il ne contient que des selecteurs : aucune valeur mesuree. */
export function encodeView(view: ChatView): string {
  const payload = JSON.stringify({
    f: view.filter,
    s: view.sort,
    c: view.columns,
    h: view.highlight,
    o: view.open,
    v: view.curve,
  })
  return `#tare=${encodeURIComponent(payload)}`
}

export function decodeView(hash: string): ChatView | null {
  const m = /(?:^|[#&])tare=([^&]+)/.exec(hash)
  if (!m) return null
  try {
    const p = JSON.parse(decodeURIComponent(m[1])) as Record<string, unknown>
    return {
      filter: (p.f ?? null) as ChatView['filter'],
      sort: (p.s ?? null) as ChatView['sort'],
      columns: (p.c ?? null) as ChatView['columns'],
      highlight: Array.isArray(p.h) ? (p.h as string[]) : [],
      open: (p.o ?? null) as ChatView['open'],
      curve: (p.v ?? null) as ChatView['curve'],
      compare: null,
    }
  } catch {
    return null
  }
}
