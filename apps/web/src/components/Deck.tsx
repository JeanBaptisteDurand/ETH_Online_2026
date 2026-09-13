/**
 * LE DECK — la page de vente, et la seule du site qui se pilote au clavier.
 *
 * POURQUOI UNE PAGE À PART, ET PAS UN PDF.
 *
 * Trois des surfaces de TARE ne peuvent pas tourner dans un onglet : le serveur MCP vit dans
 * Claude Desktop, l'extension vit dans le portefeuille de quelqu'un d'autre, et le Ledger est
 * un objet posé sur une table. Un PDF les décrirait ; ce deck les REJOUE — le déroulé est
 * simulé, les valeurs viennent du corpus, et chaque scène le dit au-dessus d'elle-même.
 *
 * CE QUI EST REPRIS D'AILLEURS, ET CE QUI EST CORRIGÉ.
 *
 * Le patron « conteneur de défilement dédié + scroll-snap + mode présentateur » vient d'un deck
 * qu'on a étudié. Deux de ses défauts sont évités ici, parce qu'ils sont réels et vérifiés :
 *   - il écoutait `scroll` sur `window` et appelait `window.scrollTo` alors que l'élément qui
 *     défile est le conteneur : la navigation clavier ne bougeait rien et le compteur restait
 *     figé sur « 01 ». Ici tout passe par `scrollIntoView` sur les sections et par un
 *     `IntersectionObserver`, pas par la position de la fenêtre ;
 *   - sa frappe faisait un `setState` par caractère sur la liste ENTIÈRE des messages : ~550
 *     rendus React pour une réponse. Ici la frappe vit dans le composant de la bulle, et lui
 *     seul se redessine.
 *
 * LA VITESSE DE FRAPPE EST HONNÊTE : 18 ms par caractère. En dessous du plafond du navigateur
 * (~4 ms) une valeur ne veut plus rien dire — elle promet une vitesse que la machine ne tient
 * pas, et elle varie d'un ordinateur à l'autre.
 *
 * `prefers-reduced-motion` : tout se donne d'un coup, dans l'état final. Pas d'écran vide.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Copy, Replay } from './Prim'
import { dataset } from '../lib/dataset'
import facts from '../data/facts.json'
import { OUTILS, FAMILLES } from '../lib/outils'
import { DONNEES } from '../lib/donnees'

const nb = (x: number) => x.toLocaleString('fr')
const court = (a: string) => `${a.slice(0, 10)}…${a.slice(-4)}`

const reduit = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/* ============================================================== les outils communs */

/**
 * LA FRAPPE, isolée dans son propre composant.
 *
 * C'est ce qui évite de redessiner tout un transcript à chaque caractère : seul ce nœud-ci se
 * redessine, et il s'arrête net quand il est démonté. `onFini` sert à rendre la main — sans
 * lui, l'appelant ne saurait pas quand réactiver ses boutons.
 */
function Frappe({ texte, vitesse = 18, onFini }: { texte: string; vitesse?: number; onFini?: () => void }) {
  const [n, setN] = useState(() => (reduit() ? texte.length : 0))
  const fini = useRef(false)

  useEffect(() => {
    setN(reduit() ? texte.length : 0)
    fini.current = false
  }, [texte])

  useEffect(() => {
    if (n >= texte.length) {
      if (!fini.current) {
        fini.current = true
        onFini?.()
      }
      return
    }
    const t = window.setTimeout(() => setN((x) => x + 1), vitesse)
    return () => window.clearTimeout(t)
  }, [n, texte, vitesse, onFini])

  return (
    <span style={{ whiteSpace: 'pre-wrap' }}>
      {texte.slice(0, n)}
      {n < texte.length && <span className="deck-curseur">▌</span>}
    </span>
  )
}

/** Une séquence d'étapes, jouée quand la scène entre à l'écran. */
function useSequence(n: number, delais: number[], actif: boolean): { etape: number; rejouer: () => void } {
  const [etape, setEtape] = useState(() => (reduit() ? n : 0))
  const [tour, setTour] = useState(0)

  useEffect(() => {
    if (!actif || reduit() || etape >= n) return
    const t = window.setTimeout(() => setEtape((e) => e + 1), delais[etape] ?? 700)
    return () => window.clearTimeout(t)
  }, [actif, etape, n, delais, tour])

  return { etape, rejouer: () => { setEtape(0); setTour((t) => t + 1) } }
}


/**
 * NOTRE PROPRE APPLICATION, DANS LA PLANCHE.
 *
 * C'est ce qui manquait, et c'est ce que fait le deck voisin : cinq de ses onze temps sont des
 * `<iframe>` de l'app reelle. La difference avec une capture est enorme — ce qui bouge dans le
 * cadre EST le produit, avec ses vraies donnees, et un juge peut le voir repondre.
 *
 * On peut se le permettre sans reserve : l'instrument est statique et porte son corpus, donc
 * l'iframe ne demande RIEN au reseau. Aucun serveur a tenir pendant la demo.
 */
function Vitre({ route, titre }: { route: string; titre: string }) {
  const base = typeof window === 'undefined' ? '/' : window.location.pathname
  return (
    <div className="deck-vitre">
      <div className="deck-vitre-barre">
        <span className="deck-pastille" style={{ background: 'var(--focus)' }} />
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>l’instrument, en vrai — {route}</span>
        <a className="t-label ml-auto" href={`#${route}`} style={{ color: 'var(--ink-2)' }}>ouvrir ↗</a>
      </div>
      <iframe src={`${base}#${route}`} title={titre} loading="lazy" />
    </div>
  )
}

/* ============================================================== 1 · le serveur MCP */

interface Bulle {
  role: 'humain' | 'outil' | 'agent'
  texte: string
  frappe?: boolean
}

/** Les deux questions prêtes à cliquer, et ce que l'outil rend vraiment. */
function useEchanges() {
  return useMemo(() => {
    const rows = dataset.rows.filter((x) => x.label === 'MESURE' && x.bps !== null && x.out_with && x.out_without)
    const pire = [...rows].sort((a, b) => (b.bps ?? 0) - (a.bps ?? 0))[0]
    const nMes = dataset.totals.rows
    const nHooks = dataset.hooks.length
    if (!pire) return []
    return [
      {
        cle: 'outils',
        bouton: 'quels outils exposes-tu ?',
        question: 'Quels outils MCP expose TARE, et lesquels coûtent quelque chose ?',
        appel: null as string | null,
        reponse: [
          'TARE expose 4 outils, tous lisibles hors ligne.',
          '',
          '  • tare_lookup(hook)        tout ce qui est déjà mesuré, étiqueté',
          '  • tare_impact(hook)        quels pools et quels jetons sont exposés',
          '  • tare_twins(hook)         les hooks au bytecode identique',
          '  • tare_measure(...)        une mesure NEUVE — 0,001 USDC en x402',
          '',
          `Les trois premiers lisent ${nb(nMes)} mesures sur disque : aucune requête,`,
          'aucune clé. Le quatrième a besoin du fork, et il le dit.',
          '',
          "Et la règle que je ne peux pas contourner : je n'énonce jamais un",
          "chiffre que l'outil n'a pas rendu.",
        ].join('\n'),
      },
      {
        cle: 'lookup',
        bouton: `ce hook prend combien ? ${court(pire.hook)}`,
        question: `Combien ce hook prend-il vraiment ? ${pire.hook}`,
        appel: `tare_lookup(hook: "${pire.hook}")`,
        reponse: [
          `→ lu dans docs/dataset/measurements.jsonl (${nb(nMes)} lignes, ${nb(nHooks)} hooks)`,
          '',
          `  prélèvement   ${pire.bps!.toFixed(4)} bps`,
          `  étiquette     ${pire.label}`,
          `  taille        ${pire.amount_in}`,
          `  sens          ${pire.zero_for_one ? '0 → 1' : '1 → 0'}`,
          `  bloc          ${nb(pire.block_number)}`,
          `  avec le hook  ${pire.out_with}`,
          `  avec le talon ${pire.out_without}`,
          '',
          "✓ mesuré par contrefactuel : le même swap coté deux fois, une fois",
          "  contre un talon inerte de 89 octets à l'adresse du hook",
          '✓ rejouable en une commande, elle est en dessous',
        ].join('\n'),
        replay: [
          'python3 apps/api/scripts/measure_one.py --rpc $RPC',
          `--block ${pire.block_number} --hooks ${pire.hook}`,
          `--currency0 ${pire.currency0} --currency1 ${pire.currency1}`,
          `--fee ${pire.key_fee} --tick-spacing ${pire.tick_spacing}`,
          `--zero-for-one ${pire.zero_for_one} --amount-in ${pire.amount_in}`,
        ].join(' '),
      },
    ]
  }, [])
}

function SceneMcp() {
  const echanges = useEchanges()
  const depart: Bulle[] = [
    { role: 'agent', texte: 'Serveur MCP « tare » connecté en stdio. Choisis une question à droite →' },
  ]
  const [bulles, setBulles] = useState<Bulle[]>(depart)
  const [occupe, setOccupe] = useState(false)
  const [replay, setReplay] = useState<string | null>(null)
  const zone = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (zone.current) zone.current.scrollTop = zone.current.scrollHeight
  }, [bulles])

  const jouer = useCallback(
    async (i: number) => {
      const e = echanges[i]
      if (!e || occupe) return
      setOccupe(true)
      setReplay(null)
      setBulles((b) => [...b, { role: 'humain', texte: e.question }])
      await new Promise((r) => setTimeout(r, reduit() ? 0 : 140))
      if (e.appel) {
        setBulles((b) => [...b, { role: 'outil', texte: e.appel! }])
        await new Promise((r) => setTimeout(r, reduit() ? 0 : 320))
      }
      setBulles((b) => [...b, { role: 'agent', texte: e.reponse, frappe: true }])
      if ('replay' in e && e.replay) setReplay(e.replay as string)
    },
    [echanges, occupe],
  )

  const couleur = { humain: 'var(--ink-2)', outil: 'var(--focus)', agent: 'var(--m-6)' } as const
  const etiquette = { humain: 'utilisateur', outil: 'appel d’outil · mcp', agent: 'tare · mcp' } as const

  return (
    <div className="deck-grille deck-grille-12">
      <div className="deck-carte" style={{ padding: 0 }}>
        <div
          className="flex items-center gap-[1cqi] px-[1.4cqi] py-[1cqi]"
          style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg-2)' }}
        >
          <span className="deck-pastille" />
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>claude desktop · mcp · tare</span>
          <button
            type="button"
            className="bouton-ghost ml-auto t-label"
            style={{ cursor: 'pointer' }}
            onClick={() => { setBulles(depart); setReplay(null); setOccupe(false) }}
          >
            ↻ reprendre
          </button>
        </div>
        <div ref={zone} className="deck-mcp-zone" style={{ padding: '1.4cqi' }}>
          {bulles.map((b, i) => (
            <div key={i} className="flex flex-col gap-[0.5cqi]" style={{ animation: 'deck-entre 240ms ease-out both' }}>
              <span className="t-label" style={{ color: couleur[b.role] }}>{etiquette[b.role]}</span>
              <div className="deck-bulle" data-role={b.role}>
                {b.frappe ? <Frappe texte={b.texte} onFini={() => setOccupe(false)} /> : b.texte}
              </div>
            </div>
          ))}
          {occupe && (
            <div className="flex items-center gap-[0.8cqi]">
              <span className="deck-pastille" />
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>tare répond…</span>
            </div>
          )}
        </div>
      </div>

      <div className="deck-carte">
        <div className="deck-carte-titre">questions prêtes — clique</div>
        {echanges.map((e, i) => (
          <button key={e.cle} type="button" disabled={occupe} onClick={() => void jouer(i)} className="deck-prompt">
            ▶ {e.bouton}
          </button>
        ))}
        <div className="deck-carte-titre" style={{ marginTop: '0.6cqi' }}>4 outils · 3 gratuits · 1 payant</div>
        {[
          ['tare_lookup', 'gratuit'],
          ['tare_impact', 'gratuit'],
          ['tare_twins', 'gratuit'],
          ['tare_measure', '0,001 USDC'],
        ].map(([o, p]) => (
          <div key={o} className="flex items-baseline gap-[0.8cqi]">
            <code style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{o}</code>
            <span className="t-label ml-auto" style={{ color: p === 'gratuit' ? 'var(--ink-2)' : 'var(--m-4)' }}>{p}</span>
          </div>
        ))}
        <div className="deck-prose" style={{ marginTop: 'auto' }}>
          Le serveur ne tourne pas dans cet onglet : il vit à côté du modèle. Le déroulé est
          <strong style={{ color: 'var(--m-5)' }}> rejoué</strong> ; les valeurs sortent du corpus.
        </div>
        {replay && <Replay cmd={replay} />}
      </div>
    </div>
  )
}

/* ======================================================= 2 · l'extension */

function SceneExtension({ actif }: { actif: boolean }) {
  const [issue, setIssue] = useState<'alternative' | 'unique'>('alternative')
  const chere = issue === 'alternative'
  const etapes = [
    "un site d’échange prépare la transaction et appelle le portefeuille",
    "la garde l’intercepte AVANT la signature et relit la PoolKey dans le calldata de l’Universal Router",
    "elle interroge sa table embarquée — aucune requête, le service worker la porte",
    chere
      ? "ce hook prélève, et une porte moins chère existe sur la même paire"
      : "ce hook prélève, et aucune autre porte mesurée n’existe sur cette paire",
  ]
  const { etape, rejouer } = useSequence(etapes.length, [700, 900, 800, 900], actif)
  const g = facts.garde as Record<string, unknown> | undefined

  return (
    <div className="deck-grille deck-grille-12">
      <div className="deck-carte">
        <div className="flex flex-wrap items-center gap-[0.8cqi]">
          <span className="deck-carte-titre">ce qu’elle fait, étape par étape</span>
          <span className="ml-auto flex gap-[0.6cqi]">
            {(['alternative', 'unique'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => { setIssue(k); rejouer() }}
                className="t-label deck-onglet"
                aria-pressed={issue === k}
              >
                {k === 'alternative' ? 'il y a mieux' : 'il n’y a qu’une porte'}
              </button>
            ))}
          </span>
        </div>
        {etapes.map((t, i) => (
          <div key={i} className="deck-etape" style={{ opacity: i < etape ? 1 : 0.2 }}>
            <span
              className="t-label"
              style={{ color: i === 3 ? (chere ? 'var(--m-4)' : 'var(--m-5)') : 'var(--ink-2)', minWidth: '1.6cqi' }}
            >
              {i + 1}
            </span>
            <span className="deck-prose" style={{ color: i === 3 ? 'var(--ink)' : 'var(--ink-2)' }}>{t}</span>
          </div>
        ))}
        {g && (
          <div className="deck-prose" style={{ marginTop: 'auto' }}>
            décodé sur {String(g['transactions_reelles'] ?? '—')} transactions réelles de Base ·
            12 ko de script · la table vit dans le service worker, donc elle répond{' '}
            <strong style={{ color: 'var(--ink)' }}>même serveur éteint</strong>.
          </div>
        )}
      </div>

      <div
        className="deck-verdict"
        data-issue={chere ? 'alternative' : 'unique'}
        style={{
          opacity: etape >= etapes.length ? 1 : 0,
          transform: etape >= etapes.length ? 'none' : 'translateY(0.6cqi)',
        }}
      >
        <div className="t-label" style={{ color: chere ? 'var(--m-4)' : 'var(--m-5)' }}>
          {chere ? 'une porte moins chère existe' : 'il n’y a qu’une porte'}
        </div>
        <div className="deck-prose" style={{ color: 'var(--ink)' }}>
          {chere ? (
            <>
              Le même échange passe par un autre pool. La transaction de remplacement est{' '}
              <strong>construite et signée par Permit2</strong> — une signature hors chaîne au lieu
              d’une transaction d’approbation — et <strong>elle n’est jamais envoyée par nous</strong>.
            </>
          ) : (
            <>
              Sur <strong>99,71 %</strong> des lignes du corpus, la réponse est « il n’y a qu’une
              porte ». Alors l’extension ne propose rien : elle affiche ce que le hook prend et
              demande une confirmation. <strong>Inventer une alternative serait pire que se taire.</strong>
            </>
          )}
        </div>
        <div className="flex flex-wrap gap-[0.7cqi]">
          {(chere ? ['PRÊT — substituer', 'signer tel quel', 'annuler'] : ['confirmer en connaissance', 'annuler']).map(
            (b, i) => (
              <span key={b} className="t-label deck-bouton" data-fort={i === 0 ? 'oui' : undefined}>{b}</span>
            ),
          )}
        </div>
        {chere && (
          <div className="t-label" style={{ color: 'var(--ink-2)', marginTop: 'auto' }}>
            liste de commandes <code style={{ fontFamily: 'var(--mono)' }}>0x0a10</code> — PERMIT2_PERMIT
            puis V4_SWAP, dans cet ordre
          </div>
        )}
      </div>
    </div>
  )
}

/* ========================================================= 3 · Speculos */

function SceneLedger({ actif }: { actif: boolean }) {
  const l = facts.ledger as Record<string, unknown> | undefined
  const ecrans: [string, string][] = [
    ['Review', 'TareGuardApproval'],
    ['verdict', 'PRÉLÈVEMENT MESURÉ'],
    ['hook', '0xb429d62f…ba28cc'],
    ['pool', '0x010d0023…6c538'],
    ['prélèvement', '9 999,53 bps'],
    ['taille', '1 000 000 000 000'],
    ['bloc', '50 614 000'],
    ['Approve ?', 'Approve / Reject'],
  ]
  const { etape, rejouer } = useSequence(ecrans.length, ecrans.map(() => 520), actif)

  return (
    <div className="deck-grille deck-grille-12">
      <div className="deck-ecrans" style={{ gridColumn: '1 / -1', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {ecrans.map(([k, v], i) => (
          <div
            key={k}
            className="deck-ecran"
            style={{
              opacity: i < etape ? 1 : 0.1,
              transform: i < etape ? 'none' : 'translateY(0.5cqi)',
              borderColor: i === ecrans.length - 1 && i < etape ? 'var(--m-4)' : 'var(--line)',
            }}
          >
            <span className="t-label" style={{ color: 'var(--ink-2)' }}>{k}</span>
            <b>{v}</b>
          </div>
        ))}
      </div>
      <div className="deck-prose" style={{ gridColumn: '1 / -1', marginTop: '-0.6cqi' }}>
        Le rapport est encodé en <strong style={{ color: 'var(--ink)' }}>EIP-712</strong> et rendu{' '}
        <strong style={{ color: 'var(--ink)' }}>champ par champ</strong> : on ne signe pas un haché
        opaque, on lit ce qu’on signe. Une annulation rend le code{' '}
        <strong style={{ color: 'var(--ink)' }}>4001</strong>, et aucun appel ne part.
        {l ? ` ${String(l['ecrans'] ?? '—')} écrans rendus, type ${String(l['type_712'] ?? '—')}.` : ''}
        {' '}Le déroulé est <strong style={{ color: 'var(--m-5)' }}>rejoué</strong> ; les écrans sont
        ceux qu’a rendus Speculos, et le dépôt publie leur trace.{' '}
        <button type="button" onClick={rejouer} className="bouton-ghost t-label" style={{ cursor: 'pointer' }}>
          rejouer
        </button>
      </div>
    </div>
  )
}

/* ============================================================ les beats */

interface Beat {
  id: string
  marqueur: string
  titre: string
  sous?: string
  rendu: (actif: boolean) => React.ReactNode
}

/**
 * UN CHIFFRE QUI REMPLIT SA CASE.
 *
 * C'est l'objet de base d'une planche : le nombre est enorme parce que c'est LUI le message,
 * et les deux lignes en dessous disent ce qu'il compte et d'ou il sort. Un deck ou le chiffre
 * a la meme taille que la legende ne dit rien de loin — et un jury regarde de loin.
 */
function Chiffre({
  v,
  k,
  source,
  accent,
}: {
  v: string
  k: string
  source?: string
  accent?: 'jaune' | 'orange' | 'bleu'
}) {
  return (
    <div className="deck-stat" data-accent={accent ?? 'jaune'} data-long={v.length > 6 ? 'oui' : undefined}>
      <b>{v}</b>
      <span>{k}</span>
      {source && <i>{source}</i>}
    </div>
  )
}

export function DeckPage({ surOutil }: { surOutil?: (n: number) => void }) {
  const t = dataset.totals
  const conteneur = useRef<HTMLDivElement | null>(null)
  const [actif, setActif] = useState(0)

  const ex = facts.execution as Record<string, unknown> | undefined
  const reg = facts.registre as { epingle?: Record<string, unknown> } | undefined

  const beats: Beat[] = useMemo(
    () => [
      {
        id: 'probleme',
        marqueur: '01 · le problème',
        titre: 'Un hook Uniswap v4 peut prélever sur votre swap. Personne ne publie combien.',
        sous: 'Ni le registre officiel, ni les hooks eux-mêmes.',
        rendu: () => (
          <>
            <div className="deck-grille deck-grille-3">
              <Chiffre
                v="9 / 1 559"
                k="hooks qui déclarent ce qu’ils prennent"
                source="docs/dataset/declarations.json · 200 000 blocs Base"
                accent="orange"
              />
              <Chiffre
                v="0"
                k="champ quantitatif dans le registre officiel, sur 27"
                source="son schéma interdit d’en ajouter un"
              />
              <Chiffre
                v={reg?.epingle ? `${String(reg.epingle['absents'])} / 112` : '—'}
                k="hooks mesurés que le registre ne connaît pas"
                source="docs/dataset/registre-couverture.json"
                accent="bleu"
              />
            </div>
          </>
        ),
      },
      {
        id: 'methode',
        marqueur: '02 · la méthode',
        titre: 'On ne peut pas retirer le hook d’un pool. Alors on change son code.',
        sous: 'La clé d’un pool v4 contient l’adresse du hook : « le même pool sans son hook » n’existe pas.',
        rendu: () => (
          <div className="deck-grille deck-grille-12">
            <div className="deck-carte">
              <div className="deck-carte-titre">le contrefactuel, en quatre gestes</div>
              {[
                'on épingle un fork au bloc 50 614 000',
                'on cote le swap, hook en place',
                'anvil_setCode remplace le bytecode du hook par 89 octets inertes',
                'on cote le MÊME swap contre le talon — l’écart est le prélèvement',
              ].map((l, i) => (
                <div key={l} className="deck-etape" style={{ opacity: 1 }}>
                  <span className="t-label" style={{ color: 'var(--m-6)', minWidth: '1.6cqi' }}>{i + 1}</span>
                  <span className="deck-prose">{l}</span>
                </div>
              ))}
              <div className="deck-prose" style={{ marginTop: 'auto', color: 'var(--ink)' }}>
                Le <code>poolId</code>, la liquidité, <code>slot0</code> et les réserves restent
                identiques au bit près. La seule chose qui change est le code qui s’exécute
                pendant le swap.
              </div>
            </div>
            <div className="deck-grille deck-grille-2" style={{ margin: 0, gridTemplateRows: 'auto 1fr' }}>
              <Chiffre v={nb(t.rows)} k="mesures publiées" />
              <Chiffre v="89" k="octets de talon inerte" accent="orange" />
              <div style={{ gridColumn: '1 / -1', minHeight: 0 }}>
                <Vitre route="/outil/1" titre="la page de l’outil Mesurer, en vrai" />
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'preuve',
        marqueur: '03 · la preuve',
        titre: 'Et quand on l’exécute vraiment, la cotation tient au wei près.',
        sous: 'La porte A4 : un swap réellement passé, reconfronté à ce que la cotation annonçait.',
        rendu: () => (
          <div className="deck-grille deck-grille-12">
            <div className="deck-grille deck-grille-2" style={{ margin: 0 }}>
              <Chiffre
                v={ex ? `${Number(ex['bps_executes']).toFixed(2)}` : '—'}
                k="bps réellement exécutés"
                accent="orange"
              />
              <Chiffre
                v={ex ? `${Number(ex['bps_publies']).toFixed(2)}` : '—'}
                k="bps annoncés par la cotation"
              />
            </div>
            <div className="deck-carte">
              <div className="deck-carte-titre">l’objection, et la réponse</div>
              <div className="deck-prose">
                « Une cotation sur un fork, ça vaut quoi ? » On a donc <strong style={{ color: 'var(--ink)' }}>exécuté
                le swap</strong> et recollé le résultat à ce que la cotation annonçait.{' '}
                <strong style={{ color: 'var(--ink)' }}>Au wei près.</strong>
              </div>
              <div className="deck-prose">
                Et on publie aussi le pool où ça <strong style={{ color: 'var(--ink)' }}>ne</strong>{' '}
                concorde pas — un sur trois.
              </div>
              <div className="deck-prose" style={{ marginTop: 'auto' }}>
                La chaîne complète tourne bout en bout : <strong style={{ color: 'var(--ink)' }}>6 étapes
                sur 6, en 13,7 secondes</strong> — transaction réelle, verdict, recherche de porte,
                mesure payée en x402, ancrage HCS, signature sur l’appareil.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'mcp',
        marqueur: '04 · pour les agents',
        titre: 'Un modèle à qui on demande « ce hook prend combien ? » invente un nombre plausible.',
        sous: 'Les quatre outils MCP portent, dans leur propre description, l’interdiction d’en énoncer un.',
        rendu: () => <SceneMcp />,
      },
      {
        id: 'extension',
        marqueur: '05 · au bon moment',
        titre: 'Le bon moment n’est pas quand on cherche. C’est trois secondes avant de signer.',
        sous: 'L’extension se place entre le site d’échange et le portefeuille.',
        rendu: (a: boolean) => <SceneExtension actif={a} />,
      },
      {
        id: 'ledger',
        marqueur: '06 · on lit ce qu’on signe',
        titre: 'Le verdict est rendu champ par champ sur l’appareil.',
        sous: 'EIP-712, huit écrans, et annuler ne laisse rien partir.',
        rendu: (a: boolean) => <SceneLedger actif={a} />,
      },
      {
        id: 'honnetete',
        marqueur: '07 · ce qu’on ne sait pas',
        titre: 'Sur 125 072 mesures, 61 916 ne sont pas des valeurs. On les garde quand même.',
        sous: 'Une lecture qui échoue est NON_MESURABLE — jamais un zéro, jamais un blanc.',
        rendu: () => (
          <div className="deck-grille deck-grille-12">
            <div className="deck-grille deck-grille-2" style={{ margin: 0 }}>
              <Chiffre v="63 156" k="MESURE — des valeurs" />
              <Chiffre v="61 466" k="NON_COTABLE" accent="orange" />
              <Chiffre v="450" k="NON_MESURABLE" accent="orange" />
              <Chiffre v="0" k="INTERPOLE — l’étiquette existe et ne sert pas" accent="bleu" />
            </div>
            <div className="deck-carte">
              <div className="deck-carte-titre">pourquoi on les garde</div>
              <div className="deck-prose">
                Un blanc se lit « rien », et « rien » se lit « zéro ». Chaque ligne qu’on n’a pas
                pu mesurer garde donc <strong style={{ color: 'var(--ink)' }}>sa raison</strong>.
              </div>
              <div className="deck-prose">
                <strong style={{ color: 'var(--ink)' }}>16 attestations écrites on-chain sur 99
                calculées.</strong> C’est l’écart qu’on publie, pas le chiffre flatteur.
              </div>
              <div className="deck-prose" style={{ marginTop: 'auto' }}>
                Deux erreurs passées du projet sont publiées avec leur correction. C’est ce qui
                rend le reste croyable.
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'surfaces',
        marqueur: '08 · essayez',
        titre: 'Cinq façons d’y accéder. Le corpus, lui, est entier dans la page.',
        rendu: () => (
          <div className="deck-grille deck-grille-12">
            <div className="deck-grille deck-grille-3" style={{ margin: 0 }}>
              <Chiffre v={String(OUTILS.length)} k="outils nommés" />
              <Chiffre v={String(DONNEES.length)} k="jeux de données publiés" accent="bleu" />
              <Chiffre v="5" k="façons d’y accéder" accent="orange" />
            </div>
            <div style={{ minHeight: 0 }}>
              <Vitre route="/" titre="l’opération : coller un jeton, lire par où l’acheter" />
            </div>
            <div className="deck-carte">
              <div className="deck-carte-titre">les quatorze outils</div>
              <div className="flex flex-wrap gap-[0.7cqi]" style={{ overflowY: 'auto', minHeight: 0 }}>
                {OUTILS.map((o) => (
                  <button
                    key={o.n}
                    type="button"
                    onClick={() => surOutil?.(o.n)}
                    className="t-label deck-puce"
                    style={{ color: FAMILLES[o.famille].couleur }}
                    title={o.question}
                  >
                    {o.n}. {o.nom}
                  </button>
                ))}
              </div>
              <div className="deck-prose" style={{ marginTop: 'auto' }}>
                Le site, l’extension, le serveur MCP, le péage x402 sur Hedera, le compte. Tout est
                publié — le corpus, les commandes de rejeu, et ce qu’on ne sait pas.
              </div>
              <div className="flex flex-wrap items-center gap-[1.2cqi]">
                <Copy text="https://github.com/JeanBaptisteDurand/ETH_Online_2026" label="copier le dépôt" />
                <a className="deck-prose" href="#/" style={{ color: 'var(--ink)' }}>ouvrir l’instrument →</a>
              </div>
            </div>
          </div>
        ),
      },
    ],
    [t, reg, ex, surOutil],
  )

  /* LE MODE PRÉSENTATEUR : `?presenter=1`. Il n'existe pas autrement. */
  const presentateur =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('presenter')
  const [restant, setRestant] = useState(240)
  const [court_, setCourt] = useState(false)

  useEffect(() => {
    if (!presentateur || !court_) return
    const i = window.setInterval(() => setRestant((r) => Math.max(0, r - 1)), 1000)
    return () => window.clearInterval(i)
  }, [presentateur, court_])

  /* Qui est à l'écran : l'observateur, pas la position de la fenêtre. */
  useEffect(() => {
    const el = conteneur.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const o = new IntersectionObserver(
      (entrees) => {
        const vu = entrees.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0]
        if (vu) setActif(Number((vu.target as HTMLElement).dataset['beat'] ?? 0))
      },
      { root: el, threshold: [0.35, 0.6] },
    )
    el.querySelectorAll('[data-beat]').forEach((s) => o.observe(s))
    return () => o.disconnect()
  }, [beats.length])

  const aller = useCallback(
    (i: number) => {
      const el = conteneur.current?.querySelector<HTMLElement>(`[data-beat="${Math.max(0, Math.min(beats.length - 1, i))}"]`)
      el?.scrollIntoView({ behavior: reduit() ? 'auto' : 'smooth', block: 'start' })
    },
    [beats.length],
  )

  useEffect(() => {
    const sur = (e: KeyboardEvent) => {
      const c = e.target as HTMLElement | null
      if (c && /^(INPUT|TEXTAREA)$/.test(c.tagName)) return
      if ([' ', 'ArrowDown', 'ArrowRight', 'PageDown'].includes(e.key)) {
        e.preventDefault()
        setCourt(true)
        aller(actif + 1)
      } else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) {
        e.preventDefault()
        aller(actif - 1)
      } else if (e.key === 'r') {
        setRestant(240)
      } else if (e.key === 'f') {
        void document.documentElement.requestFullscreen?.().catch(() => undefined)
      }
    }
    window.addEventListener('keydown', sur)
    return () => window.removeEventListener('keydown', sur)
  }, [actif, aller])

  const mm = String(Math.floor(restant / 60)).padStart(2, '0')
  const ss = String(restant % 60).padStart(2, '0')

  return (
    <div className="deck" ref={conteneur}>
      {beats.map((b, i) => (
        <section key={b.id} data-beat={i} id={`deck-${b.id}`} className="deck-beat" aria-label={b.titre}>
          <div className="deck-cadre">
            <header className="deck-tete">
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>TARE · ETHOnline 2026</span>
              <span className="t-label ml-auto" style={{ color: 'var(--m-5)' }}>{b.marqueur}</span>
            </header>

            <div className="deck-corps">
              <div className="deck-eyebrow">{b.marqueur.replace(/^\d+ · /, '')}</div>
              <h2 className="deck-titre">{b.titre}</h2>
              {b.sous && <p className="deck-sous">{b.sous}</p>}
              {b.rendu(actif === i)}
            </div>

            <footer className="deck-pied">
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                mesuré sur Base, bloc 50 614 000 — chaque nombre se rejoue en une commande
              </span>
              <span className="t-label ml-auto" style={{ color: 'var(--ink-2)' }}>
                {String(i + 1).padStart(2, '0')} / {String(beats.length).padStart(2, '0')}
              </span>
            </footer>
          </div>
        </section>
      ))}

      {presentateur && (
        <>
          <div className="deck-hud deck-hud-gauche">
            <span className="t-label" style={{ color: 'var(--ink)' }}>
              {String(actif + 1).padStart(2, '0')} / {String(beats.length).padStart(2, '0')}
            </span>
            <span className="t-label" style={{ color: 'var(--ink-2)' }}>{beats[actif]?.marqueur}</span>
            <span className="deck-tirets">
              {beats.map((b, i) => (
                <i key={b.id} data-etat={i < actif ? 'passe' : i === actif ? 'courant' : 'a-venir'} />
              ))}
            </span>
            <span className="t-label" style={{ color: 'var(--ink-2)' }}>espace · ← → · f · r</span>
          </div>
          <div className="deck-hud deck-hud-droite" data-fini={restant === 0 ? 'oui' : undefined}>
            {court_ && <span className="deck-pastille" />}
            <span className="t-data-sm" style={{ fontFamily: 'var(--mono)', color: restant === 0 ? 'var(--m-4)' : 'var(--ink)' }}>
              {mm}:{ss}
            </span>
          </div>
        </>
      )}
    </div>
  )
}
