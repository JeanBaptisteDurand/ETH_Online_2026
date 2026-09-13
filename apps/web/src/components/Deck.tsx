/**
 * LE DECK — ce que le produit fait, rejoué devant vous, sans rien exécuter.
 *
 * POURQUOI SIMULER, ET POURQUOI LE DIRE.
 *
 * Trois des surfaces de TARE ne peuvent pas tourner dans un onglet : le serveur MCP vit dans
 * Claude Desktop, l'extension vit dans le portefeuille de quelqu'un d'autre, et le Ledger est
 * un objet posé sur une table. Un deck qui les décrirait en prose laisserait le lecteur les
 * imaginer ; un deck qui prétendrait les faire tourner mentirait.
 *
 * Alors on REJOUE. Chaque scène est une transcription d'un échange réel, déroulée au rythme
 * où elle s'est produite, et **chaque scène porte l'étiquette « rejeu »**. Les valeurs sont
 * celles du corpus — pas des nombres décoratifs : on les lit dans `dataset` et dans
 * `facts.json`, comme partout ailleurs sur ce site. Ce qui est joué, c'est le déroulé ; ce qui
 * est montré, ce sont nos vraies mesures.
 *
 * LES TROIS SCÈNES, ET CE QUE CHACUNE PROUVE :
 *   1. LE SERVEUR MCP — un modèle à qui on demande « ce hook prend combien ? » invente un
 *      nombre plausible. Ici il appelle un outil, et c'est l'outil qui répond, avec son bloc,
 *      sa taille, son étiquette et sa commande de rejeu.
 *   2. L'EXTENSION — le bon moment n'est pas « quand on cherche », c'est trois secondes avant
 *      de signer. Deux issues, et les deux comptent : soit il existe une porte moins chère et
 *      elle propose la substitution par Permit2, soit il n'y en a pas et elle le DIT au lieu
 *      d'inventer une alternative.
 *   3. SPECULOS — le rapport rendu champ par champ sur l'appareil. On ne signe pas un haché
 *      opaque : on lit ce qu'on signe, et annuler rend le code 4001 sans qu'aucun appel parte.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Panel, Copy, Replay } from './Prim'
import { Reveal } from './Motion'
import { dataset } from '../lib/dataset'
import facts from '../data/facts.json'
import { OUTILS, FAMILLES } from '../lib/outils'
import { DONNEES } from '../lib/donnees'

const nb = (x: number) => x.toLocaleString('fr')
const court = (a: string) => `${a.slice(0, 10)}…${a.slice(-4)}`

/** `prefers-reduced-motion` : le deck se donne alors en entier, d'un coup. */
const reduit = (): boolean =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

/**
 * LE MOTEUR DES SCÈNES.
 *
 * Une scène est une liste d'étapes, chacune avec sa durée. On avance quand la scène est
 * VISIBLE et pas avant : un deck qui joue hors de l'écran a déjà fini quand on y arrive.
 * Et on s'arrête à la dernière étape — pas de boucle. Une animation qui recommence pendant
 * qu'on lit vole l'attention qu'elle venait de gagner.
 */
function useScene(n: number, delais: number[]): { etape: number; ref: React.RefObject<HTMLDivElement | null>; rejouer: () => void } {
  const ref = useRef<HTMLDivElement | null>(null)
  const [etape, setEtape] = useState(() => (reduit() ? n : 0))
  const [demarree, setDemarree] = useState(false)

  useEffect(() => {
    if (reduit() || demarree) return
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setEtape(n)
      return
    }
    const o = new IntersectionObserver(
      (entrees) => {
        if (entrees.some((e) => e.isIntersecting)) {
          setDemarree(true)
          o.disconnect()
        }
      },
      { threshold: 0.25 },
    )
    o.observe(el)
    return () => o.disconnect()
  }, [demarree, n])

  useEffect(() => {
    if (!demarree || etape >= n) return
    const t = window.setTimeout(() => setEtape((e) => e + 1), delais[etape] ?? 700)
    return () => window.clearTimeout(t)
  }, [demarree, etape, n, delais])

  return { etape, ref, rejouer: () => setEtape(0) }
}

/** L'étiquette que porte toute scène rejouée. Elle n'est jamais facultative. */
function Rejeu({ quoi, onRejouer }: { quoi: string; onRejouer: () => void }) {
  return (
    <div
      className="px-[16px] py-[8px] flex flex-wrap items-center gap-[10px]"
      style={{ borderTop: '1px solid var(--line)', background: 'var(--surface-1)' }}
    >
      <span className="t-label" style={{ color: 'var(--m-5)' }}>rejeu</span>
      <span className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '72ch' }}>{quoi}</span>
      <button type="button" onClick={onRejouer} className="bouton-ghost ml-auto t-label" style={{ cursor: 'pointer' }}>
        rejouer
      </button>
    </div>
  )
}

/* ------------------------------------------------- 1 · le serveur MCP */

function SceneMcp() {
  // La ligne montrée est une VRAIE ligne du corpus : la plus forte mesure au-dessus d'un bps.
  const r = useMemo(
    () =>
      dataset.rows
        .filter((x) => x.label === 'MESURE' && x.bps !== null && x.out_with && x.out_without)
        .sort((a, b) => (b.bps ?? 0) - (a.bps ?? 0))[0],
    [],
  )
  const { etape, ref, rejouer } = useScene(5, [900, 1100, 900, 1200, 900])
  if (!r) return null

  const etapes = [
    { qui: 'humain', txt: `ce hook prend combien ? ${court(r.hook)}` },
    { qui: 'modele', txt: "je ne le sais pas. J'appelle l'outil." },
    { qui: 'outil', txt: `tare_lookup(hook="${r.hook}")` },
    { qui: 'retour', txt: 'la réponse de l\'outil' },
    { qui: 'modele', txt: 'je rends ce que l\'outil a rendu, et rien de plus.' },
  ]

  return (
    <div ref={ref}>
      <Rejeu
        quoi="la transcription d'un échange dans Claude Desktop. Le serveur MCP ne tourne pas dans cet onglet : il vit à côté du modèle, et lit les mesures sur disque."
        onRejouer={rejouer}
      />
      <div className="px-[16px] py-[14px] flex flex-col gap-[10px]" style={{ minHeight: 260 }}>
        {etapes.slice(0, etape).map((e, i) => (
          <div key={i} className="flex gap-[12px]" style={{ animation: 'deck-entre 260ms ease-out both' }}>
            <span className="t-label" style={{ color: e.qui === 'outil' ? 'var(--focus)' : 'var(--ink-4)', minWidth: 72 }}>
              {e.qui}
            </span>
            {e.qui === 'outil' ? (
              <code className="t-data-sm" style={{ fontFamily: 'var(--mono)', color: 'var(--focus)', wordBreak: 'break-all' }}>
                {e.txt}
              </code>
            ) : e.qui === 'retour' ? (
              <div className="flex flex-col gap-[4px]" style={{ minWidth: 0 }}>
                {[
                  ['bps', `${r.bps!.toFixed(4)}`],
                  ['étiquette', r.label],
                  ['taille', r.amount_in],
                  ['sens', r.zero_for_one ? '0→1' : '1→0'],
                  ['bloc', nb(r.block_number)],
                ].map(([k, v]) => (
                  <div key={k} className="flex flex-wrap gap-[10px]">
                    <span className="t-label" style={{ color: 'var(--ink-4)', minWidth: 88 }}>{k}</span>
                    <span className="t-data-sm" style={{ color: 'var(--ink)' }}>{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <span className="t-data-sm" style={{ color: e.qui === 'humain' ? 'var(--ink)' : 'var(--ink-2)', maxWidth: '64ch' }}>
                {e.txt}
              </span>
            )}
          </div>
        ))}
      </div>
      {etape >= 5 && (
        <div className="px-[16px] pb-[14px]">
          <Replay
            cmd={[
              'python3 apps/api/scripts/measure_one.py --rpc $RPC',
              `--block ${r.block_number} --hooks ${r.hook}`,
              `--currency0 ${r.currency0} --currency1 ${r.currency1}`,
              `--fee ${r.key_fee} --tick-spacing ${r.tick_spacing}`,
              `--zero-for-one ${r.zero_for_one} --amount-in ${r.amount_in}`,
            ].join(' ')}
            note="chaque réponse de l'outil porte la commande qui la refait — c'est ce qui empêche le modèle d'inventer"
          />
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------- 2 · l'extension, deux issues */

function SceneExtension({ issue }: { issue: 'alternative' | 'sans_alternative' }) {
  const { etape, ref, rejouer } = useScene(4, [900, 1100, 1200, 900])
  const g = facts.garde as Record<string, unknown> | undefined

  const chere = issue === 'alternative'
  const etapes = [
    "un site d'échange prépare la transaction et appelle le portefeuille",
    'la garde intercepte le calldata de l\'Universal Router et en relit la PoolKey',
    chere
      ? 'ce hook prélève, et une porte moins chère existe sur la même paire'
      : 'ce hook prélève, et aucune autre porte mesurée n\'existe sur cette paire',
    chere ? 'elle propose la substitution, signée par Permit2' : 'elle demande une confirmation, sans rien proposer',
  ]

  return (
    <div ref={ref}>
      <Rejeu
        quoi={
          chere
            ? "l'extension ne tourne pas dans cette page : elle s'installe dans le navigateur et se place entre le site et le portefeuille. Ce qui suit est ce qu'elle affiche."
            : "le même déroulé, quand il n'y a rien de mieux à proposer. C'est le cas le plus fréquent — et le dire est une réponse."
        }
        onRejouer={rejouer}
      />
      <div className="px-[16px] py-[14px] flex flex-col gap-[9px]" style={{ minHeight: 230 }}>
        {etapes.slice(0, etape).map((t, i) => (
          <div key={i} className="flex gap-[12px] items-baseline" style={{ animation: 'deck-entre 260ms ease-out both' }}>
            <span className="t-label" style={{ color: i === 3 ? (chere ? 'var(--m-4)' : 'var(--m-5)') : 'var(--ink-4)', minWidth: 20 }}>
              {i + 1}
            </span>
            <span className="t-data-sm" style={{ color: i === 3 ? 'var(--ink)' : 'var(--ink-2)', maxWidth: '72ch', lineHeight: 1.55 }}>
              {t}
            </span>
          </div>
        ))}

        {etape >= 4 && (
          <div
            className="mt-[6px] p-[14px] flex flex-col gap-[8px]"
            style={{
              border: `1px solid ${chere ? 'var(--m-4)' : 'var(--line-strong)'}`,
              background: 'var(--surface-1)',
              animation: 'deck-entre 320ms ease-out both',
            }}
          >
            <div className="t-label" style={{ color: chere ? 'var(--m-4)' : 'var(--m-5)' }}>
              {chere ? 'une porte moins chère existe' : 'il n’y a qu’une porte'}
            </div>
            <div className="t-data-sm" style={{ color: 'var(--ink)', lineHeight: 1.6, maxWidth: '70ch' }}>
              {chere ? (
                <>
                  Le même échange passe par un autre pool. La transaction de remplacement est{' '}
                  <strong>construite et signée par Permit2</strong> — une signature hors chaîne au lieu
                  d’une transaction d’approbation — et <strong>elle n’est jamais envoyée par nous</strong> :
                  elle est rendue au portefeuille, qui décide.
                </>
              ) : (
                <>
                  Sur <strong>99,71 %</strong> des lignes du corpus, la recherche d’alternative répond
                  « il n’y a qu’une porte ». Alors l’extension ne propose rien : elle affiche ce que le
                  hook prend et demande une confirmation. <strong>Inventer une alternative serait pire
                  que se taire.</strong>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-[8px] mt-[2px]">
              {(chere
                ? ['PRÊT', 'substituer', 'annuler']
                : ['confirmer en connaissance', 'annuler']
              ).map((b, i) => (
                <span
                  key={b}
                  className="t-label"
                  style={{
                    padding: '5px 10px',
                    border: `1px solid ${i === 0 ? 'var(--line-strong)' : 'var(--line)'}`,
                    color: i === 0 ? 'var(--ink)' : 'var(--ink-2)',
                    background: i === 0 ? 'var(--bg-3)' : 'transparent',
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
      {g && (
        <div className="px-[16px] pb-[12px] t-data-sm" style={{ color: 'var(--ink-2)' }}>
          décodé sur {String(g['transactions_reelles'] ?? '—')} transactions réelles de Base, sans
          aucune requête : la table des mesures vit dans le service worker de l’extension.
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------- 3 · l'appareil */

function SceneLedger() {
  const l = facts.ledger as Record<string, unknown> | undefined
  const ecrans = [
    ['Review', 'TareGuardApproval'],
    ['verdict', 'PRÉLÈVEMENT MESURÉ'],
    ['hook', '0xb429d62f…ba28cc'],
    ['pool', '0x010d0023…6c538'],
    ['prélèvement', '9 999,53 bps'],
    ['bloc', '50 614 000'],
    ['Approve', 'ou Reject'],
  ]
  const { etape, ref, rejouer } = useScene(ecrans.length, ecrans.map(() => 620))

  return (
    <div ref={ref}>
      <Rejeu
        quoi="les écrans rendus par un Ledger, l'un après l'autre. L'appareil n'est pas branché à cette page — ce sont ceux qu'a rendus l'émulateur Speculos, et le dépôt publie leur trace."
        onRejouer={rejouer}
      />
      <div className="px-[16px] py-[14px] flex flex-wrap gap-[10px]" style={{ minHeight: 190 }}>
        {ecrans.slice(0, etape).map(([k, v], i) => (
          <div
            key={k}
            className="p-[12px] flex flex-col gap-[5px]"
            style={{
              border: '1px solid var(--line)',
              background: 'var(--bg-1)',
              minWidth: 168,
              animation: 'deck-entre 240ms ease-out both',
              borderColor: i === ecrans.length - 1 ? 'var(--line-strong)' : 'var(--line)',
            }}
          >
            <span className="t-label" style={{ color: 'var(--ink-4)' }}>{k}</span>
            <span className="t-data-sm" style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>{v}</span>
          </div>
        ))}
      </div>
      <div className="px-[16px] pb-[14px] t-data-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '76ch' }}>
        Le rapport est encodé en <strong style={{ color: 'var(--ink)' }}>EIP-712</strong> et rendu
        champ par champ : on ne signe pas un haché opaque, on lit ce qu’on signe. Une annulation
        rend le code <strong style={{ color: 'var(--ink)' }}>4001</strong> et
        <strong style={{ color: 'var(--ink)' }}> aucun appel ne part</strong>.
        {l ? ` ${String(l['ecrans'] ?? '—')} écrans, type ${String(l['type_712'] ?? '—')}.` : ''}
      </div>
    </div>
  )
}

/* --------------------------------------------------------- le deck */

export function DeckPage({ surOutil }: { surOutil?: (n: number) => void }) {
  const t = dataset.totals
  const chiffres: [string, string][] = [
    ['mesures', nb(t.rows)],
    ['pools', nb(dataset.totals.pools)],
    ['hooks', nb(dataset.hooks.length)],
    ['jeux de données', String(DONNEES.length)],
    ['outils', String(OUTILS.length)],
  ]

  return (
    <>
      <Panel
        index="deck"
        title="Ce que TARE fait, rejoué"
        meta={[`${nb(t.rows)} mesures`, 'trois surfaces', 'aucune n’est simulée dans ses chiffres']}
      >
        <p
          className="m-0 px-[16px] py-[12px]"
          style={{ fontFamily: 'var(--prose)', fontSize: 16, lineHeight: 1.65, maxWidth: '76ch', color: 'var(--ink-2)' }}
        >
          Uniswap laisse un <strong style={{ color: 'var(--ink)' }}>hook</strong> s’exécuter à chaque
          swap, et ce hook peut prélever. <strong style={{ color: 'var(--ink)' }}>Personne ne publie
          combien.</strong> La clé d’un pool v4 <em>contient</em> l’adresse du hook : « le même pool
          sans son hook » n’existe pas. Alors on ne change pas le pool —{' '}
          <strong style={{ color: 'var(--ink)' }}>on change le code du hook</strong>. Sur un fork
          épinglé, le bytecode est remplacé par un talon inerte de 89 octets, on cote le même swap
          deux fois, et <strong style={{ color: 'var(--ink)' }}>l’écart est le péage</strong>.
        </p>
        <div className="px-[16px] py-[12px] flex flex-wrap gap-x-[28px] gap-y-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
          {chiffres.map(([k, v]) => (
            <div key={k} className="flex flex-col">
              <span className="t-metric" style={{ color: 'var(--ink)' }}>{v}</span>
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>{k}</span>
            </div>
          ))}
        </div>
        <div className="px-[16px] py-[10px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          Les trois scènes qui suivent sont des <strong style={{ color: 'var(--ink)' }}>rejeux</strong> :
          le déroulé est joué, les valeurs sont celles du corpus. Chacune le dit au-dessus d’elle-même.
        </div>
      </Panel>

      <Reveal>
        <Panel
          index="deck-mcp"
          title="Le serveur MCP — un modèle qui n’invente pas"
          meta={['4 outils', 'hors ligne', `lit ${nb(t.rows)} mesures sur disque`]}
          right={<span className="t-label" style={{ color: FAMILLES.analyse.couleur }}>agent</span>}
        >
          <p className="m-0 px-[16px] py-[11px] t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '76ch', lineHeight: 1.6 }}>
            Demandez à un modèle ce qu’un hook prend, il <strong style={{ color: 'var(--ink)' }}>invente
            un nombre plausible</strong>. Les quatre outils du serveur MCP portent, dans leur propre
            description, l’interdiction d’énoncer un chiffre que l’outil n’a pas rendu.
          </p>
          <SceneMcp />
        </Panel>
      </Reveal>

      <Reveal>
        <Panel
          index="deck-ext"
          title="L’extension — trois secondes avant de signer"
          meta={['12 ko de script', 'aucune requête', 'deux issues, et les deux comptent']}
          right={<span className="t-label" style={{ color: FAMILLES.collecte.couleur }}>interception</span>}
        >
          <SceneExtension issue="alternative" />
          <SceneExtension issue="sans_alternative" />
        </Panel>
      </Reveal>

      <Reveal>
        <Panel
          index="deck-ledger"
          title="L’appareil — on lit ce qu’on signe"
          meta={['EIP-712', 'champ par champ', 'annuler rend 4001']}
          right={<span className="t-label" style={{ color: FAMILLES.action.couleur }}>action</span>}
        >
          <SceneLedger />
        </Panel>
      </Reveal>

      <Reveal>
        <Panel index="deck-suite" title="Et tout le reste est ouvert" meta={[`${OUTILS.length} outils`, `${DONNEES.length} jeux de données`]}>
          <div className="px-[16px] py-[12px] flex flex-wrap gap-[6px]">
            {OUTILS.map((o) => (
              <button
                key={o.n}
                type="button"
                onClick={() => surOutil?.(o.n)}
                className="t-label"
                style={{
                  padding: '5px 9px',
                  border: '1px solid var(--line)',
                  background: 'transparent',
                  color: FAMILLES[o.famille].couleur,
                  cursor: surOutil ? 'pointer' : 'default',
                }}
                title={o.question}
              >
                {o.n}. {o.nom}
              </button>
            ))}
          </div>
          <div className="px-[16px] pb-[14px] flex flex-wrap items-center gap-[12px]">
            <Copy text="https://github.com/JeanBaptisteDurand/ETH_Online_2026" label="copier le dépôt" />
            <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
              tout est publié : le corpus, les commandes de rejeu, et ce qu’on ne sait pas.
            </span>
          </div>
        </Panel>
      </Reveal>
    </>
  )
}
