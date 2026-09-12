/**
 * UNE PAGE PAR OUTIL — et elle montre ce que l'outil PRODUIT, pas ce qu'il est.
 *
 * Chaque page porte quatre choses, dans cet ordre :
 *
 *   1. LA QUESTION, dans les mots de quelqu'un qui l'a. Pas la signature d'une fonction.
 *   2. LA SORTIE RÉELLE. Des lignes du corpus, des règlements relus, des écrans de Ledger —
 *      ce que l'outil a vraiment rendu, avec de quoi le rejouer. Une page qui décrirait sans
 *      montrer serait une brochure.
 *   3. LA DONNÉE qu'il consomme, nommée par son fichier ou sa route.
 *   4. SON ÉTAT, et quand il n'est pas prêt, POURQUOI.
 *
 * LA SIGNATURE VISUELLE. Chaque outil a son accent, pris sur la rampe de la charte, et sa
 * sortie a une forme différente : des cotations appariées pour la mesure, un journal pour le
 * péage, des écrans pour l'appareil. C'est voulu — quatorze pages identiques se lisent comme
 * une seule, et le lecteur cesse de regarder à la troisième.
 */
import { useMemo, useRef } from 'react'
import { Panel, Copy, NonLu, Replay } from './Prim'
import { FigureAppariee } from './Figure'
import { COULEUR } from './familles'
import { SUITE } from '../compte/substitution'
import { dataset } from '../lib/dataset'
import facts from '../data/facts.json'
import { OUTILS, outil, FAMILLES } from '../lib/outils'
import type { Famille } from '../lib/outils'
import { luPar, ecritPar, taille } from '../lib/donnees'
import type { Jeu as JeuT, Volume } from '../lib/donnees'

/**
 * L'accent d'un outil, pris sur sa FAMILLE et non sur son numéro.
 *
 * Bleu quand il va chercher une donnée, jaune quand il l'interprète, orange quand il change
 * quelque chose. La couleur porte donc une information — et l'orange, la seule famille qui
 * touche à l'argent de quelqu'un, se repère sans lire.
 */
const accent = (n: number): string => COULEUR[outil(n)!.famille]

const court = (a: string) => `${a.slice(0, 10)}…`
const nb = (x: number) => x.toLocaleString('fr')

/* ------------------------------------------------------ les sorties réelles */

/** 1 · MESURER — les deux cotations d'un même swap, et leur écart. */
function SortieMesurer() {
  const runs = useMemo(() => {
    return dataset.rows
      .filter((r) => r.label === 'MESURE' && r.bps !== null && r.out_with && r.out_without && r.bps > 1)
      .sort((a, b) => (b.bps ?? 0) - (a.bps ?? 0))
      .slice(0, 6)
  }, [])
  return (
    <>
      <div className="px-[16px] py-[9px] t-data-sm" style={{ color: 'var(--ink-2)', borderTop: '1px solid var(--line)' }}>
        Six exécutions du contrefactuel, les plus fortes du corpus. À chaque ligne : le même swap
        coté <strong style={{ color: 'var(--ink)' }}>avec</strong> le hook, puis avec un talon
        inerte de 89 octets à son adresse. L'écart <strong style={{ color: 'var(--ink)' }}>est</strong> le
        prélèvement.
      </div>
      {runs.map((r) => {
        const sens = r.zero_for_one ? '0→1' : '1→0'
        return (
          <div key={r.pool_id + r.amount_in + sens} className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
            <div className="flex flex-wrap items-baseline gap-[10px]">
              <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>hook {court(r.hook)}</span>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>{sens} · {r.amount_in} · bloc {nb(r.block_number)}</span>
              <span className="ml-auto t-data" style={{ color: 'var(--ink)' }}>{r.bps!.toFixed(4)} bps</span>
            </div>
            <div className="mt-[6px] grid gap-[3px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>avec le hook</span>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>{r.out_with}</span>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>avec le talon</span>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>{r.out_without}</span>
            </div>
            <Replay cmd={[
              'python3 apps/api/scripts/measure_one.py --rpc $RPC',
              `--block ${r.block_number} --hooks ${r.hook}`,
              `--currency0 ${r.currency0} --currency1 ${r.currency1}`,
              `--fee ${r.key_fee} --tick-spacing ${r.tick_spacing}`,
              `--zero-for-one ${r.zero_for_one} --amount-in ${r.amount_in}`,
            ].join(' ')} />
          </div>
        )
      })}
    </>
  )
}

/** 10 · PAYER À L'UNITÉ — les règlements, relus sur le mirror node. */
function SortiePayer() {
  const x = facts.x402
  if (!x) return <NonLu quoi="facts.x402" />
  return (
    <>
      <L k="réglés et relus" v={<>{String(x.regles)} <span style={{ color: 'var(--ink-2)' }}>sur {String(x.vus)} tentés · {String(x.par_keyring)} signés depuis le trousseau</span></>} />
      <L k="réseau" v={String(x.reseau)} />
      <L k="facilitateur" v={String(x.facilitateur)} />
      <L k="jeton" v={String(x.jeton)} />
      <L k="prix unitaire" v={`${String(x.prix_unite_usd)} USDC par mesure`} />
      <L k="payeur → encaisseur" v={`${String(x.payeur)} → ${String(x.encaisseur)}`} />
      <div className="px-[16px] py-[9px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
        Un règlement n'est compté que si le <strong style={{ color: 'var(--ink)' }}>mirror node</strong> le
        rend. Le serveur qui dit « payé » ne suffit pas : c'est lui qu'on vérifie.
      </div>
    </>
  )
}

/** 13 · PROUVER — l'identité d'agent, recalculable. */
function SortieProuver() {
  const a = facts.agent
  if (!a) return <NonLu quoi="facts.agent" />
  return (
    <>
      <L k="UAID" v={<span style={{ wordBreak: 'break-all' }}>{String(a.uaid)}</span>} />
      <L k="standard" v={`${String(a.standard)} · ${String(a.spec)}`} />
      <L k="topic Hedera" v={`${String(a.topic)} · message #${String(a.sequence)}`} />
      <L k="état" v={String(a.etat)} />
      <div className="px-[16px] py-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-data-sm mb-[5px]" style={{ color: 'var(--ink-2)' }}>les six champs canoniques, hachés en SHA-384 puis encodés en base58</div>
        <div className="t-data-sm" style={{ color: 'var(--ink-2)', wordBreak: 'break-all', fontFamily: 'var(--mono)' }}>
          {String(a.canonical_json)}
        </div>
        <div className="mt-[6px]"><Copy text={String(a.canonical_json)} label="copier le JSON canonique" /></div>
      </div>
    </>
  )
}

/** 14 · ATTESTER — ce qui est écrit on-chain. */
function SortieAttester() {
  const t = facts.attestations
  if (!t) return <NonLu quoi="facts.attestations" />
  return (
    <>
      <L k="contrat" v={String(t.contrat)} />
      <L k="écrits" v={<>{String(t.ecrits)} <span style={{ color: 'var(--ink-2)' }}>· {String(t.ecartes)} écartés faute de mesure — pas écrits à zéro</span></>} />
      <L k="empreinte du corpus" v={<span style={{ wordBreak: 'break-all' }}>{String(t.corpus_digest)}</span>} />
      <div className="px-[16px] py-[9px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
        Un autre contrat peut lire ces valeurs. C'est la seule surface du produit qu'une machine
        consomme sans nous demander la permission.
      </div>
    </>
  )
}

/** 9 · APPROUVER — les écrans rendus sur l'appareil. */
function SortieApprouver() {
  const l = facts.ledger
  if (!l) return <NonLu quoi="facts.ledger" />
  return (
    <>
      <L k="appareil" v={`${String(l.appareil)}${l.physique ? '' : ' (émulé — et on le dit)'}`} />
      <L k="verdict rendu" v={String(l.verdict)} />
      <L k="écrans" v={`${String(l.ecrans)} · type EIP-712 ${String(l.type_712)} · ${String(l.champs_712)} champs`} />
      <div className="px-[16px] py-[9px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
        Le rapport est encodé en EIP-712 et rendu <strong style={{ color: 'var(--ink)' }}>champ par
        champ</strong> sur l'appareil : on ne signe pas un hash opaque, on lit ce qu'on signe.
      </div>
    </>
  )
}

/** 6 et 7 · LA PORTE DE REMPLACEMENT — les six états, et leur poids réel. */
function SortiePorte() {
  const s = facts.sens_unique
  return (
    <>
      <div className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-data-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '78ch' }}>
          Sur les <strong style={{ color: 'var(--ink)' }}>125 072</strong> lignes du corpus,
          <strong style={{ color: 'var(--ink)' }}> 124 704</strong> répondent « il n'y a qu'une
          porte » — <strong>99,71 %</strong>. Quinze passent le seuil d'un point de base, sur
          quatre couples de pools ; la meilleure fait passer de <strong>295,59 à 216,92 bps</strong>.
          Aucune ne dépasse 100 bps.
        </div>
      </div>
      {s && (
        <L k="pools à sens unique" v={<>{String(s.pools)} sur {String(s.hooks)} hooks <span style={{ color: 'var(--ink-2)' }}>— gratuit à l'entrée, fermé à la sortie</span></>} />
      )}
      <div className="px-[16px] py-[9px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
        « Il n'y a qu'une porte » est une <strong style={{ color: 'var(--ink)' }}>réponse</strong>, pas
        un échec de recherche. C'est la phrase qu'aucun agrégateur ne dit.
      </div>
    </>
  )
}

/** 7 · SUBSTITUER — l'actionnable, et ce que Permit2 change vraiment. */
function SortieSubstituer() {
  return (
    <>
      <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-data-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.65, maxWidth: '80ch' }}>
          C'est la pièce qui transforme un verdict en <strong style={{ color: 'var(--ink)' }}>décision</strong>.
          Le site a déjà tout : l'adresse du jeton, le montant, la porte visée. Il construit la
          transaction de remplacement et la fait signer — <strong style={{ color: 'var(--ink)' }}>il
          ne l'envoie jamais</strong>.
        </div>
      </div>

      <L k="ce qu'il rend" v={<code style={{ fontFamily: 'var(--mono)' }}>{'{ to, data, value }'}</code>} />
      <L k="plancher de sortie" v={<>tiré d'une <strong style={{ color: 'var(--ink)' }}>cotation vivante</strong>, moins 50 bps de tolérance <span style={{ color: 'var(--ink-2)' }}>— jamais du corpus, qui est épinglé à un bloc</span></>} />
      <L k="échéance" v={<>maintenant + 20 minutes <span style={{ color: 'var(--ink-2)' }}>— le défaut valait 0xffffffff, soit le 7 février 2106</span></>} />

      <div className="px-[16px] pt-[12px] pb-[8px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
        <div className="t-data-sm" style={{ color: 'var(--ink)' }}>Permit2 — une signature au lieu de deux transactions</div>
        <div className="t-data-sm mt-[6px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65, maxWidth: '80ch' }}>
          Sans lui, remplacer une transaction en demande <strong style={{ color: 'var(--ink)' }}>deux</strong> :
          un <code style={{ fontFamily: 'var(--mono)' }}>approve</code> du jeton vers le routeur,
          puis le swap. Avec, on <strong style={{ color: 'var(--ink)' }}>signe hors chaîne</strong> —
          gratuit, et une signature ne peut pas échouer — et le routeur présente cette signature
          lui-même, dans la même transaction que le swap. Un envoi, une signature.
        </div>
      </div>

      <L k="liste de commandes" v={<><code style={{ fontFamily: 'var(--mono)' }}>0x0a10</code> <span style={{ color: 'var(--ink-2)' }}>— PERMIT2_PERMIT puis V4_SWAP. L'ordre compte : un swap présenté avant son permit échouerait faute d'autorisation.</span></>} />
      <L k="domaine EIP-712" v={<><code style={{ fontFamily: 'var(--mono)' }}>EIP712Domain(string name,uint256 chainId,address verifyingContract)</code></>} />

      <div className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <div className="t-data" style={{ color: 'var(--ink)' }}>ce que Permit2 ne dispense pas de faire</div>
        <div className="t-data-sm mt-[5px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '80ch' }}>
          Le jeton doit avoir été approuvé <strong style={{ color: 'var(--ink)' }}>vers le contrat
          Permit2</strong>, une fois pour toutes. Celle-là est une vraie transaction, et
          l'utilisateur peut ne l'avoir jamais faite. On ne la devine pas : les deux lectures
          on-chain la nomment, et l'écran la demande AVANT de proposer une signature qui
          échouerait. Promettre « une seule signature » à quelqu'un qui n'a pas approuvé Permit2
          serait faux.
        </div>
      </div>

    </>
  )
}

/** 4 · COMPRENDRE — ce que la confrontation à une source indépendante donne. */
function SortieComprendre() {
  const g = facts.graph
  if (!g) return <NonLu quoi="facts.graph" />
  return (
    <>
      <L k="source confrontée" v={`${String(g.nom)} · ${String(g.subgraph)}`} />
      <L k="pools du recensement" v={<>{nb(Number(g.pools_du_recensement))} <span style={{ color: 'var(--ink-2)' }}>dont {nb(Number(g.retrouves))} retrouvés — {String(g.part)}</span></>} />
      <L k="volume observé" v={`${String(g.volume_usd)} USD`} />
      <L k="TVL" v={`${String(g.tvl_usd)} USD`} />
    </>
  )
}

/**
 * UNE LIGNE « clé : valeur ».
 *
 * `flex-wrap` et `minWidth: 0` ne sont pas de la décoration : sans eux, une valeur qui
 * contient un mot insécable — un chemin de fichier, une URL, un identifiant de subgraph —
 * pousse la LIGNE au-delà de la page, et c'est la PAGE ENTIÈRE qui défile de côté. Onze des
 * quatorze pages outil débordaient à 400 px pour cette seule raison.
 */
/**
 * LE COMPTE DES ETATS D'ENVOI, derive de `SUITE` et de rien d'autre.
 *
 * L'ecran se contredisait : la section disait « 10 etats » et le champ `etat`, declare dans
 * `lib/outils.ts:307`, disait « PRET, ou l'un des huit ». d008 tranche en faveur de ce qui est
 * declare dans l'implementation, et l'implementation en porte dix, verifies par
 * `lib/substituer.test.ts`. `lib/` appartient a l'equipier : la reecriture se fait donc ici,
 * au rendu, a partir de la meme source que la liste affichee — un seul compte, tenu deux fois.
 */
const N_ETATS = Object.keys(SUITE).length

const CHAMP_REECRIT: Record<string, string> = {
  etat: `PRÊT, ou l'un des ${N_ETATS - 1} autres états qui disent ce qui manque`,
}

/** Un titre de section commence par une majuscule et rien d'autre : ni capitales espacees,
    ni ordinal sur ce qui n'est pas une sequence. */
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1)

const L = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[3px] px-[16px] py-[6px]" style={{ borderTop: '1px solid var(--line)' }}>
    <span className="t-data-sm" style={{ color: 'var(--ink-2)', minWidth: 120, flexShrink: 0 }}>{k}</span>
    <span className="t-data-sm" style={{ color: 'var(--ink-2)', flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
  </div>
)

/** Les outils qui ont une sortie REELLE a montrer, et non seulement des champs declares. */
const aSortie = (n: number): boolean => [1, 4, 6, 7, 9, 10, 13, 14].includes(n)

/** La sortie propre à chaque outil, quand elle existe. */
function Sortie({ n }: { n: number }) {
  switch (n) {
    case 1: return <SortieMesurer />
    case 4: return <SortieComprendre />
    case 6: return <SortiePorte />
    case 7: return <SortieSubstituer />
    case 9: return <SortieApprouver />
    case 10: return <SortiePayer />
    case 13: return <SortieProuver />
    case 14: return <SortieAttester />
    default: return null
  }
}

/* --------------------------------- les trois temps d'une page outil */

/**
 * ENTRÉE → EXÉCUTION → SORTIE, mais pas avec les mêmes mots selon la famille.
 *
 * « Donnée d'entrée » convient à un outil d'analyse, qui lit un fichier. Il ne convient pas à
 * un outil de collecte, qui va chercher ce qui n'existait pas, ni à un outil d'action, dont
 * le point n'est pas ce qu'il rend mais CE QU'IL CHANGE. Trois vocabulaires, donc, pour que
 * la page dise vraiment ce que l'outil fait.
 */
const TEMPS: Record<Famille, { entree: string; milieu: string; sortie: string }> = {
  collecte: { entree: 'ce qu\'il va chercher', milieu: 'il s\'exécute', sortie: 'ce qu\'il ramène' },
  analyse: { entree: 'donnée d\'entrée', milieu: 'il s\'exécute', sortie: 'donnée de sortie' },
  action: { entree: 'ce qu\'il lit avant d\'agir', milieu: 'l\'action', sortie: 'ce qui change' },
}

const INV = (facts as { inventaire?: Record<string, Volume> }).inventaire ?? {}

/** Un jeu de données, avec son volume statté au build — « non lu » quand le fichier manque. */
function Jeu({ j, sens }: { j: JeuT; sens: 'lit' | 'écrit' }) {
  const v = INV[j.cle]
  return (
    <div className="px-[16px] py-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="flex flex-wrap items-baseline gap-[8px]">
        <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>{sens}</span>
        <span className="t-data-sm" style={{ color: 'var(--ink)' }}>{j.nom}</span>
        {v ? (
          <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            {taille(v.octets)}{v.n !== null && v.unite ? ` · ${nb(v.n)} ${v.unite}` : ''}
          </span>
        ) : (
          <span className="t-data-sm" style={{ color: 'var(--ink-2)' }}>non lu</span>
        )}
        <code className="ml-auto" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-2)', wordBreak: 'break-all' }}>{v?.fichier ?? j.cle}</code>
      </div>
      <div className="t-data-sm mt-[4px]" style={{ color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: '82ch' }}>{j.quoi}</div>
      <div className="t-data-sm mt-[4px]" style={{ color: 'var(--ink-2)' }}>produit par <code style={{ fontFamily: 'var(--mono)' }}>{j.produit}</code></div>
    </div>
  )
}

/* ------------------------------------------------- ce que l'outil INGÈRE */

/**
 * L'ENTRÉE : ce qui n'est pas un fichier d'abord, les fichiers ensuite, avec leur volume.
 *
 * Une page qui montrerait seulement la sortie laisserait croire que le nombre sort de nulle
 * part. Le lecteur doit voir les deux bouts : ces lignes-là entrent, ce résultat-là sort.
 */
function Ingere({ n }: { n: number }) {
  const o = outil(n)!
  const jeux = luPar(n)
  const echantillon = useMemo(() => {
    // Les outils qui lisent le corpus montrent des lignes du corpus. Les autres montrent le
    // fichier qu'ils lisent, et son volume — jamais une ligne inventée pour faire joli.
    if ([1, 2, 3, 5, 6, 7].includes(n)) {
      return dataset.rows
        .filter((r) => r.label === 'MESURE' && r.bps !== null)
        .slice(0, 5)
    }
    return []
  }, [n])

  return (
    <>
      {o.entree.map((e) => (
        <div key={e} className="px-[16px] py-[6px] flex gap-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--ink-2)' }}>→</span>
          <span className="t-data-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: '82ch' }}>{e}</span>
        </div>
      ))}
      {jeux.map((j) => <Jeu key={j.cle} j={j} sens="lit" />)}
      {jeux.length === 0 && (
        <div className="px-[16px] py-[7px] t-data-sm" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
          aucun fichier du dépôt : tout ce qu'il lit est lu <strong style={{ color: 'var(--ink-2)' }}>sur la
          chaîne</strong>, au moment où on le lui demande
        </div>
      )}
      {echantillon.length > 0 && (
        // IMPORTANCE 3 : la rubrique 5 la veut « derriere une interaction : se deplie, et le
        // compte total reste affiche pour que la troncature se voie ». Le compte est donc dans
        // le resume, ferme comme ouvert.
        <details>
        <summary
          className="t-data px-[16px] py-[12px] cursor-pointer list-none"
          style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}
        >
          déplier cinq lignes du corpus — sur {nb(dataset.totals.rows)} au total
        </summary>
        <div tabIndex={0} role="region" aria-label="échantillon du corpus" style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['hook', 'pool', 'taille', 'sens', 'frais LP', 'bps', 'étiquette'].map((h, i) => (
                  <th key={h} scope="col" className="t-data-sm px-[10px] py-[5px]"
                    style={{ color: 'var(--ink-2)', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {echantillon.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="t-data-sm px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>{court(r.hook)}</td>
                  <td className="t-data-sm px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>{court(r.pool_id)}</td>
                  <td className="t-data-sm px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>{r.amount_in}</td>
                  <td className="t-data-sm px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>{r.zero_for_one ? '0→1' : '1→0'}</td>
                  <td className="t-data-sm px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-2)' }}>
                    {r.stored_lp_fee === null ? '—' : (r.stored_lp_fee / 100).toFixed(2)}
                  </td>
                  <td className="t-data-sm px-[10px] py-[5px] text-right" style={{ color: 'var(--ink)' }}>{r.bps!.toFixed(4)}</td>
                  <td className="t-data-sm px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-2)' }}>{r.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-[16px] py-[6px] t-data-sm" style={{ color: 'var(--ink-2)' }}>
            cinq lignes sur {nb(dataset.totals.rows)} — un échantillon, et le compte est dit pour
            que la troncature se voie
          </div>
        </div>
        </details>
      )}
    </>
  )
}

/* ----------------------------------------------- ce que l'outil EXÉCUTE */

/** Les étapes, numérotées, dans l'ordre où elles arrivent — et ce que ça coûte. */
function Execute({ n }: { n: number }) {
  const o = outil(n)!
  const c = COULEUR[o.famille]
  return (
    <>
      {o.execute.map((e, i) => (
        <div key={e} className="px-[16px] py-[7px] flex gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="t-data-sm" style={{ color: c, minWidth: 16 }}>{i + 1}</span>
          <span className="t-data-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: '82ch' }}
            dangerouslySetInnerHTML={{ __html: e.replace(/\b([A-ZÉÈÊÀÇ]{4,}(?:_[A-Z0-9]+)*)\b/g, '<strong style="color:var(--ink)">$1</strong>') }} />
        </div>
      ))}
    </>
  )
}

/* --------------------------------------------------- ce que l'outil REND */

/** Les champs rendus, nommés, puis la sortie réelle quand l'outil en a une à montrer. */
function Rend({ n }: { n: number }) {
  const o = outil(n)!
  const ecrits = ecritPar(n)
  return (
    <>
      {o.sortie.map((c) => (
        <div key={c.champ} className="px-[16px] py-[6px] flex flex-wrap items-baseline gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
          <code style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)', minWidth: 120, wordBreak: 'break-all' }}>{c.champ}</code>
          <span className="t-data-sm" style={{ color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: '78ch', flex: '1 1 200px', minWidth: 0 }}>
            {n === 7 && CHAMP_REECRIT[c.champ] ? CHAMP_REECRIT[c.champ] : c.quoi}
          </span>
        </div>
      ))}
      {ecrits.map((j) => <Jeu key={j.cle} j={j} sens="écrit" />)}
    </>
  )
}
/* ---------------------------------------------- le bandeau d'onglets, un par outil */

/**
 * LES QUATORZE ONGLETS — la « redirection » de d002 : l'orchestrateur passe d'un outil a
 * l'autre, et le bandeau reste sous la main pendant tout le defilement.
 *
 * Ce sont des LIENS : un onglet s'ouvre dans un nouvel onglet de navigateur, son adresse se
 * copie, et le bouton « precedent » marche. Le clavier les parcourt aux fleches, comme un
 * vrai jeu d'onglets, et l'onglet actif porte le soulignement de SA famille — la couleur
 * redit ce que la carte a deja dit.
 */
function Onglets({ n, surOutil }: { n: number; surOutil?: (x: number) => void }) {
  const bande = useRef<HTMLDivElement | null>(null)

  const auClavier = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const cles = ['ArrowRight', 'ArrowLeft', 'Home', 'End']
    if (!cles.includes(e.key)) return
    e.preventDefault()
    const i = OUTILS.findIndex((o) => o.n === n)
    const suivant =
      e.key === 'Home'
        ? 0
        : e.key === 'End'
          ? OUTILS.length - 1
          : (i + (e.key === 'ArrowRight' ? 1 : OUTILS.length - 1)) % OUTILS.length
    const cible = OUTILS[suivant]!
    if (surOutil) surOutil(cible.n)
    else window.location.hash = `/outil/${cible.n}`
    // Le focus suit la selection : sans ca, la fleche suivante repartirait de l'ancien onglet.
    window.requestAnimationFrame(() => {
      bande.current?.querySelector<HTMLAnchorElement>(`[data-outil="${cible.n}"]`)?.focus()
    })
  }

  return (
    <div
      ref={bande}
      role="tablist"
      aria-label="les quatorze outils"
      onKeyDown={auClavier}
      className="onglets flex"
    >
      {OUTILS.map((x) => {
        const actif = x.n === n
        return (
          <a
            key={x.n}
            data-outil={x.n}
            role="tab"
            aria-selected={actif}
            aria-current={actif ? 'page' : undefined}
            tabIndex={actif ? 0 : -1}
            href={`#/outil/${x.n}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
              if (!surOutil) return
              e.preventDefault()
              surOutil(x.n)
            }}
            className="onglet t-data no-underline flex items-center gap-[7px] px-[12px]"
            style={{
              minHeight: 44,
              whiteSpace: 'nowrap',
              color: actif ? 'var(--ink)' : 'var(--ink-2)',
              borderBottomColor: actif ? COULEUR[x.famille] : 'transparent',
              background: actif ? 'var(--bg-1)' : 'transparent',
            }}
            title={x.question}
          >
            <span style={{ color: actif ? COULEUR[x.famille] : 'var(--ink-2)' }}>{x.n}</span>
            {x.nom}
          </a>
        )
      })}
    </div>
  )
}

/* --------------------------------- 1 · la figure appariee, en grand */

/**
 * LA PAGE DE L'OUTIL 1 porte l'idee du projet en une image : le meme swap, cote deux fois.
 *
 * On prend la mesure la plus forte du corpus — celle ou le hook prend le plus — et on ramene
 * les deux sorties sur une base de 100 recus SANS le hook. Les deux montants bruts restent
 * ecrits dessous, en wei : rien n'est arrondi en silence. C'est le seul `display` de cet
 * ecran, et il n'y a pas de hero au-dessus pour le lui disputer.
 */
function FigureMesure() {
  const paire = useMemo(() => {
    // LA MEDIANE, pas le maximum. Le maximum du corpus est un pool ou il ne sort presque
    // rien : 76 wei contre 1 609 989, soit 0,00 sur 100 — vrai, et illisible comme figure.
    // La mediane des mesures qui prelevent plus d'un point de base montre ce que l'outil
    // rend d'ordinaire, et le libelle de l'axe dit lequel des 125 072 releves c'est.
    const mesures = dataset.rows
      .filter((x) => x.label === 'MESURE' && x.bps !== null && x.bps > 1 && x.out_with && x.out_without)
      .sort((a, b) => (a.bps ?? 0) - (b.bps ?? 0))
    const r = mesures[Math.floor(mesures.length / 2)]
    if (!r) return null
    const avec = BigInt(r.out_with!)
    const sans = BigInt(r.out_without!)
    if (sans === 0n) return null
    return { r, sur100: Number((avec * 1000000n) / sans) / 10000 }
  }, [])
  if (!paire) return <NonLu quoi="une mesure du corpus avec ses deux sorties" />
  const { r, sur100 } = paire
  return (
    <>
      <FigureAppariee
        taille="display"
        axe={`sur 100 reçus sans le hook, ce que le même swap rend avec lui — la mesure médiane du corpus au-dessus d’un point de base, pool ${court(r.pool_id)}, taille ${r.amount_in}, bloc ${nb(r.block_number)}`}
        series={[
          {
            libelle: 'coté avec le hook en place',
            valeur: sur100,
            texte: sur100.toLocaleString('fr', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
            provenance: <span>out_with {r.out_with}</span>,
          },
          {
            libelle: 'coté contre un talon inerte de 89 octets',
            valeur: 100,
            texte: '100,00',
            reference: true,
            provenance: <span>out_without {r.out_without}</span>,
          },
        ]}
        ecart={r.bps!.toFixed(2)}
        unite="bps, ce que le hook a pris"
        glose={
          <>
            La PoolKey contient l’adresse du hook&nbsp;: le même pool sans son hook n’existe pas.
            On ne change donc pas le pool, on remplace le bytecode du hook par un talon inerte,
            et on cote deux fois. L’écart <em>est</em> le prélèvement.
          </>
        }
      />
      <div className="px-[16px] pb-[16px]">
        <Replay cmd={[
          'python3 apps/api/scripts/measure_one.py --rpc $RPC',
          `--block ${r.block_number} --hooks ${r.hook}`,
          `--currency0 ${r.currency0} --currency1 ${r.currency1}`,
          `--fee ${r.key_fee} --tick-spacing ${r.tick_spacing}`,
          `--zero-for-one ${r.zero_for_one} --amount-in ${r.amount_in}`,
        ].join(' ')} note="la mesure ci-dessus, rejouable telle quelle" />
      </div>
    </>
  )
}

/* --------------------------------- 7 · les dix etats d'envoi, tous visibles */

/**
 * LES ETATS DE LA SUBSTITUTION, tous a l'ecran, et un seul qui laisse envoyer.
 *
 * `SUITE` (compte/substitution.ts) est la source : dix etats, dont quatre menent quelque part.
 * Un etat masque ferait croire a une etape ratee ; un bouton actif sur un autre que `PRET`
 * signerait au mieux une transaction qui revert, au pire une transaction sans plancher de
 * prix. Le bouton est donc ici DESACTIVE avec sa raison — cette page decrit l'outil, elle ne
 * tient pas de portefeuille : la vraie commande vit dans le panneau 16.
 */
function EtatsEnvoi() {
  const etats = Object.entries(SUITE) as [string, string | null][]
  return (
    <div style={{ borderTop: '1px solid var(--line)' }}>
      <p className="m-0 px-[16px] pt-[12px] pb-[10px] t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '76ch' }}>
        {N_ETATS} états d’envoi, et un seul autorise à signer&nbsp;: <strong style={{ color: 'var(--ink)' }}>PRÊT</strong>.
        Les {N_ETATS - 1} autres restent visibles avec ce qu’il leur manque — un état caché ferait
        croire à une étape ratée.
      </p>
      <ul className="m-0 p-0" style={{ listStyle: 'none' }}>
        {etats.map(([e, suite]) => {
          const pret = e === 'PRET'
          return (
            <li
              key={e}
              className="px-[16px] py-[10px] flex flex-wrap items-center gap-x-[16px] gap-y-[8px]"
              style={{ borderTop: '1px solid var(--line)', background: pret ? 'var(--bg-1)' : 'transparent' }}
            >
              <span
                className="t-data"
                style={{ color: pret ? 'var(--ink)' : 'var(--ink-2)', minWidth: 220 }}
              >
                {e}
              </span>
              <span className="t-data-sm" style={{ color: 'var(--ink-2)', flex: '1 1 260px', minWidth: 0 }}>
                {suite ?? 'rien à cliquer — une lecture manque, et l’état la nomme'}
              </span>
              <button
                type="button"
                disabled
                aria-label={pret ? `${e} — signer, sans envoyer` : `${e} — inactif`}
                className="t-data"
                style={{
                  padding: '8px 12px',
                  minHeight: 44,
                  border: `1px solid ${pret ? 'var(--line-strong)' : 'var(--line)'}`,
                  background: 'transparent',
                  color: 'var(--ink-2)',
                  cursor: 'not-allowed',
                }}
              >
                {pret ? 'signer, sans envoyer' : 'inactif'}
              </button>
            </li>
          )
        })}
      </ul>
      <p className="m-0 px-[16px] py-[12px] t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '76ch', borderTop: '1px solid var(--line)' }}>
        Sur cette page les {N_ETATS} boutons sont inactifs, et la raison est la même pour tous&nbsp;:
        aucune proposition n’a été construite ici. La commande réelle vit dans le panneau 16 de
        l’instrument, où un portefeuille est branché — et là encore, la transaction est
        construite et signée, <strong style={{ color: 'var(--ink)' }}>jamais envoyée</strong> par
        nous.
      </p>
    </div>
  )
}

/* --------------------------------------------------------------- la page */

export function OutilPanel({ n, surOutil }: { n: number; surOutil?: (n: number) => void }) {
  const o = outil(n)
  if (!o) return null
  const c = accent(o.n)
  const etat = o.etat === 'pret' ? 'prêt' : o.etat === 'en_attente' ? 'en attente' : 'hors ligne'
  return (
    <>
      {/* LE NOM ET LA QUESTION — le titre de page, une fois, en tete de route. */}
      <header className="px-[16px] pt-[8px] pb-[14px]">
        <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[6px] pb-[10px]">
          <span className="t-data flex items-center gap-[8px]" style={{ color: 'var(--ink-2)' }}>
            <span aria-hidden="true" style={{ width: 24, height: 8, background: c, display: 'inline-block' }} />
            {FAMILLES[o.famille].nom}
          </span>
          <span className="t-data" style={{ color: 'var(--ink-2)', borderLeft: '1px solid var(--line)', paddingLeft: 16 }}>
            {etat}
          </span>
          <span className="t-data" style={{ color: 'var(--ink-2)', borderLeft: '1px solid var(--line)', paddingLeft: 16 }}>
            {o.cout}
          </span>
        </div>
        <h1 className="t-hero m-0" style={{ color: 'var(--ink)' }}>
          <span style={{ color: 'var(--ink-2)', paddingRight: 16 }}>{o.n}</span>
          {o.nom}
        </h1>
        <p
          className="m-0 pt-[12px]"
          style={{ fontFamily: 'var(--prose)', fontSize: 20, lineHeight: 1.45, color: 'var(--ink)', maxWidth: '54ch' }}
        >
          « {o.question} »
        </p>
        <p
          className="m-0 pt-[10px]"
          style={{ fontFamily: 'var(--prose)', fontSize: 16, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: '68ch' }}
        >
          {o.rend}
        </p>
        <p
          className="m-0 pt-[8px] t-data-sm"
          style={{ color: 'var(--ink-2)', maxWidth: '68ch' }}
        >
          famille {FAMILLES[o.famille].nom}&nbsp;— {FAMILLES[o.famille].quoi}.
        </p>
      </header>

      <Onglets n={o.n} surOutil={surOutil} />

      {/* LA SORTIE REELLE D'ABORD, sur les quatorze pages et pas seulement sur la premiere.
          La rubrique 5 la classe importance 1 ; l'outil 7 la posait a y = 2 215, derriere deux
          ecrans d'importance 2 — l'ordre exact contraire de ce que le document demande. */}
      {aSortie(o.n) && (
        <Panel index={`outil-${o.n}-sortie`} title={cap(TEMPS[o.famille].sortie)}>
          {/* Pour l'outil 7, LES ETATS d'abord : c'est eux la sortie reelle, et ce que le
              document classe importance 1. La prose sur Permit2 explique, elle ne montre pas. */}
          {o.n === 7 && <EtatsEnvoi />}
          {o.n === 1 ? <FigureMesure /> : <Sortie n={o.n} />}
        </Panel>
      )}

      <Panel index={`outil-${o.n}-entree`} title={cap(TEMPS[o.famille].entree)}>
        <Ingere n={o.n} />
      </Panel>
      <Panel index={`outil-${o.n}-execution`} title={cap(TEMPS[o.famille].milieu)} meta={[o.cout]}>
        <Execute n={o.n} />
      </Panel>
      <Panel index={`outil-${o.n}-champs`} title="Les champs qu’il rend">
        <Rend n={o.n} />
      </Panel>

      <Panel index={`outil-${o.n}-reperes`} title="Où ça vit, dans le dépôt">
        {o.routes.length > 0 && (
          <L k="routes" v={<span className="flex flex-wrap gap-[12px]">{o.routes.map((r) => (
            <code key={r} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', wordBreak: 'break-all' }}>{r}</code>
          ))}</span>} />
        )}
        <L k="le code" v={<span className="flex flex-wrap gap-[12px]">{o.code.map((d) => (
          <code key={d} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', wordBreak: 'break-all' }}>{d}</code>
        ))}</span>} />
        <L k="accès" v={<span className="flex flex-wrap gap-[12px]">{o.acces.map((a) => <span key={a}>{a}</span>)}</span>} />
        {o.panneaux.length > 0 && (
          <L k="déjà affiché en" v={`panneau ${o.panneaux.join(', ')}`} />
        )}
      </Panel>

      {o.pourquoi && (
        <div className="px-[16px] py-[14px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
          <div className="t-data" style={{ color: 'var(--ink)' }}>pourquoi il n’est pas prêt</div>
          <div className="t-data-sm mt-[6px]" style={{ color: 'var(--ink-2)', maxWidth: '76ch', lineHeight: 1.55 }}
            dangerouslySetInnerHTML={{ __html: o.pourquoi.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink)">$1</strong>') }} />
        </div>
      )}
    </>
  )
}
