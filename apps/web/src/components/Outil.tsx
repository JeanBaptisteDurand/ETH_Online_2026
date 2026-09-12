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
import { useMemo } from 'react'
import { Panel, Copy, NonLu, Replay } from './Prim'
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
const accent = (n: number): string => FAMILLES[outil(n)!.famille].couleur

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
      <div className="px-[16px] py-[9px] t-data-xs" style={{ color: 'var(--ink-3)', borderTop: '1px solid var(--line)' }}>
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
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>hook {court(r.hook)}</span>
              <span className="t-label" style={{ color: 'var(--ink-4)' }}>{sens} · {r.amount_in} · bloc {nb(r.block_number)}</span>
              <span className="ml-auto t-data" style={{ color: 'var(--ink)' }}>{r.bps!.toFixed(4)} bps</span>
            </div>
            <div className="mt-[6px] grid gap-[3px]" style={{ gridTemplateColumns: 'auto 1fr' }}>
              <span className="t-label" style={{ color: 'var(--ink-4)' }}>avec le hook</span>
              <span className="t-data-xs" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>{r.out_with}</span>
              <span className="t-label" style={{ color: 'var(--ink-4)' }}>avec le talon</span>
              <span className="t-data-xs" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>{r.out_without}</span>
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
      <L k="réglés et relus" v={<>{String(x.regles)} <span style={{ color: 'var(--ink-4)' }}>sur {String(x.vus)} tentés · {String(x.par_keyring)} signés depuis le trousseau</span></>} />
      <L k="réseau" v={String(x.reseau)} />
      <L k="facilitateur" v={String(x.facilitateur)} />
      <L k="jeton" v={String(x.jeton)} />
      <L k="prix unitaire" v={`${String(x.prix_unite_usd)} USDC par mesure`} />
      <L k="payeur → encaisseur" v={`${String(x.payeur)} → ${String(x.encaisseur)}`} />
      <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}>
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
        <div className="t-label mb-[5px]" style={{ color: 'var(--ink-4)' }}>les six champs canoniques, hachés en SHA-384 puis encodés en base58</div>
        <div className="t-data-xs" style={{ color: 'var(--ink-2)', wordBreak: 'break-all', fontFamily: 'var(--mono)' }}>
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
      <L k="écrits on-chain" v={<><strong style={{ color: 'var(--ink)' }}>{String(t.ecrits)}</strong> <span style={{ color: 'var(--ink-4)' }}>sur {String(t.tentes)} transactions envoyées</span></>} />
      <L k="calculés" v={<>{String(t.calcules)} <span style={{ color: 'var(--ink-4)' }}>· {String(t.ecartes)} écartés faute de mesure — pas écrits à zéro. L'écart entre {String(t.calcules)} et {String(t.ecrits)} attend du gaz, et il est publié.</span></>} />
      <L k="empreinte du corpus" v={<span style={{ wordBreak: 'break-all' }}>{String(t.corpus_digest)}</span>} />
      <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}>
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
      <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}>
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
        <div className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '78ch' }}>
          Sur les <strong style={{ color: 'var(--ink)' }}>125 072</strong> lignes du corpus,
          <strong style={{ color: 'var(--ink)' }}> 124 704</strong> répondent « il n'y a qu'une
          porte » — <strong>99,71 %</strong>. Quinze passent le seuil d'un point de base, sur
          quatre couples de pools ; la meilleure fait passer de <strong>295,59 à 216,92 bps</strong>.
          Aucune ne dépasse 100 bps.
        </div>
      </div>
      {s && (
        <L k="pools à sens unique" v={<>{String(s.pools)} sur {String(s.hooks)} hooks <span style={{ color: 'var(--ink-4)' }}>— gratuit à l'entrée, fermé à la sortie</span></>} />
      )}
      <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-3)' }}>
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
        <div className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.65, maxWidth: '80ch' }}>
          C'est la pièce qui transforme un verdict en <strong style={{ color: 'var(--ink)' }}>décision</strong>.
          Le site a déjà tout : l'adresse du jeton, le montant, la porte visée. Il construit la
          transaction de remplacement et la fait signer — <strong style={{ color: 'var(--ink)' }}>il
          ne l'envoie jamais</strong>.
        </div>
      </div>

      <L k="ce qu'il rend" v={<code style={{ fontFamily: 'var(--mono)' }}>{'{ to, data, value }'}</code>} />
      <L k="plancher de sortie" v={<>tiré d'une <strong style={{ color: 'var(--ink)' }}>cotation vivante</strong>, moins 50 bps de tolérance <span style={{ color: 'var(--ink-4)' }}>— jamais du corpus, qui est épinglé à un bloc</span></>} />
      <L k="échéance" v={<>maintenant + 20 minutes <span style={{ color: 'var(--ink-4)' }}>— le défaut valait 0xffffffff, soit le 7 février 2106</span></>} />

      <div className="px-[16px] pt-[12px] pb-[8px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
        <div className="t-label" style={{ color: 'var(--ink)' }}>Permit2 — une signature au lieu de deux transactions</div>
        <div className="t-data-xs mt-[6px]" style={{ color: 'var(--ink-2)', lineHeight: 1.65, maxWidth: '80ch' }}>
          Sans lui, remplacer une transaction en demande <strong style={{ color: 'var(--ink)' }}>deux</strong> :
          un <code style={{ fontFamily: 'var(--mono)' }}>approve</code> du jeton vers le routeur,
          puis le swap. Avec, on <strong style={{ color: 'var(--ink)' }}>signe hors chaîne</strong> —
          gratuit, et une signature ne peut pas échouer — et le routeur présente cette signature
          lui-même, dans la même transaction que le swap. Un envoi, une signature.
        </div>
      </div>

      <L k="liste de commandes" v={<><code style={{ fontFamily: 'var(--mono)' }}>0x0a10</code> <span style={{ color: 'var(--ink-4)' }}>— PERMIT2_PERMIT puis V4_SWAP. L'ordre compte : un swap présenté avant son permit échouerait faute d'autorisation.</span></>} />
      <L k="domaine EIP-712" v={<><code style={{ fontFamily: 'var(--mono)' }}>EIP712Domain(string name,uint256 chainId,address verifyingContract)</code></>} />

      <div className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
        <div className="t-label" style={{ color: 'var(--m-5)' }}>ce que Permit2 ne dispense PAS de faire</div>
        <div className="t-data-xs mt-[5px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '80ch' }}>
          Le jeton doit avoir été approuvé <strong style={{ color: 'var(--ink)' }}>vers le contrat
          Permit2</strong>, une fois pour toutes. Celle-là est une vraie transaction, et
          l'utilisateur peut ne l'avoir jamais faite. On ne la devine pas : les deux lectures
          on-chain la nomment, et l'écran la demande AVANT de proposer une signature qui
          échouerait. Promettre « une seule signature » à quelqu'un qui n'a pas approuvé Permit2
          serait faux.
        </div>
      </div>

      <div className="px-[16px] py-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-label mb-[6px]" style={{ color: 'var(--ink-4)' }}>les neuf états, dont un seul autorise l'envoi</div>
        <div className="flex flex-wrap gap-[5px]">
          {['PRÊT', 'PAS_DE_PROPOSITION', 'SANS_PLANCHER', 'APPROBATION_REQUISE', 'SIGNATURE_REQUISE',
            'NONCE_NON_LU', 'ÉTAT_PERMIT2_INCONNU', 'PERMIT_SUR_MONNAIE_NATIVE', 'RELECTURE_DIVERGENTE',
          ].map((e) => (
            <span key={e} className="t-label" style={{
              padding: '3px 7px', border: '1px solid var(--line)',
              color: e === 'PRÊT' ? 'var(--ink)' : 'var(--ink-4)',
              background: e === 'PRÊT' ? 'var(--bg-3)' : 'transparent',
            }}>{e}</span>
          ))}
        </div>
        <div className="t-data-xs mt-[7px]" style={{ color: 'var(--ink-3)', maxWidth: '80ch' }}>
          Le bouton n'est actif que sur <strong style={{ color: 'var(--ink)' }}>PRÊT</strong>. Les
          huit autres restent visibles et grisés, avec leur raison à côté : un bouton absent
          ferait croire qu'on a raté une étape.
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
      <L k="pools du recensement" v={<>{nb(Number(g.pools_du_recensement))} <span style={{ color: 'var(--ink-4)' }}>dont {nb(Number(g.retrouves))} retrouvés — {String(g.part)}</span></>} />
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
const L = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex flex-wrap items-baseline gap-x-[10px] gap-y-[3px] px-[16px] py-[6px]" style={{ borderTop: '1px solid var(--line)' }}>
    <span className="t-label" style={{ color: 'var(--ink-4)', minWidth: 120, flexShrink: 0 }}>{k}</span>
    <span className="t-data-xs" style={{ color: 'var(--ink-2)', flex: '1 1 200px', minWidth: 0, overflowWrap: 'anywhere' }}>{v}</span>
  </div>
)

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
        <span className="t-label" style={{ color: 'var(--ink-4)' }}>{sens}</span>
        <span className="t-data-xs" style={{ color: 'var(--ink)' }}>{j.nom}</span>
        {v ? (
          <span className="t-label" style={{ color: 'var(--ink-3)' }}>
            {taille(v.octets)}{v.n !== null && v.unite ? ` · ${nb(v.n)} ${v.unite}` : ''}
          </span>
        ) : (
          <span className="t-label" style={{ color: 'var(--m-5)' }}>non lu</span>
        )}
        <code className="ml-auto" style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--ink-4)', wordBreak: 'break-all' }}>{v?.fichier ?? j.cle}</code>
      </div>
      <div className="t-data-xs mt-[4px]" style={{ color: 'var(--ink-3)', lineHeight: 1.5, maxWidth: '82ch' }}>{j.quoi}</div>
      <div className="t-label mt-[4px]" style={{ color: 'var(--ink-4)' }}>produit par <code style={{ fontFamily: 'var(--mono)' }}>{j.produit}</code></div>
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
  const t = TEMPS[o.famille]
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
      <div className="px-[16px] py-[9px]" style={{ borderTop: '1px solid var(--line-strong)', background: 'var(--bg-2)' }}>
        <span className="t-label" style={{ color: 'var(--ink-3)' }}>{t.entree}</span>
      </div>
      {o.entree.map((e) => (
        <div key={e} className="px-[16px] py-[6px] flex gap-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
          <span style={{ color: 'var(--ink-4)' }}>→</span>
          <span className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: '82ch' }}>{e}</span>
        </div>
      ))}
      {jeux.map((j) => <Jeu key={j.cle} j={j} sens="lit" />)}
      {jeux.length === 0 && (
        <div className="px-[16px] py-[7px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-4)' }}>
          aucun fichier du dépôt : tout ce qu'il lit est lu <strong style={{ color: 'var(--ink-3)' }}>sur la
          chaîne</strong>, au moment où on le lui demande
        </div>
      )}
      {echantillon.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['hook', 'pool', 'taille', 'sens', 'frais LP', 'bps', 'étiquette'].map((h, i) => (
                  <th key={h} className="t-label px-[10px] py-[5px]"
                    style={{ color: 'var(--ink-4)', textAlign: i >= 4 ? 'right' : 'left', whiteSpace: 'nowrap' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {echantillon.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="t-data-xs px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>{court(r.hook)}</td>
                  <td className="t-data-xs px-[10px] py-[5px]" style={{ color: 'var(--ink-3)' }}>{court(r.pool_id)}</td>
                  <td className="t-data-xs px-[10px] py-[5px]" style={{ color: 'var(--ink-3)' }}>{r.amount_in}</td>
                  <td className="t-label px-[10px] py-[5px]" style={{ color: 'var(--ink-4)' }}>{r.zero_for_one ? '0→1' : '1→0'}</td>
                  <td className="t-data-xs px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-3)' }}>
                    {r.stored_lp_fee === null ? '—' : (r.stored_lp_fee / 100).toFixed(2)}
                  </td>
                  <td className="t-data-xs px-[10px] py-[5px] text-right" style={{ color: 'var(--ink)' }}>{r.bps!.toFixed(4)}</td>
                  <td className="t-label px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-4)' }}>{r.label}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-[16px] py-[6px] t-data-xs" style={{ color: 'var(--ink-4)' }}>
            cinq lignes sur {nb(dataset.totals.rows)} — un échantillon, et le compte est dit pour
            que la troncature se voie
          </div>
        </div>
      )}
    </>
  )
}

/* ----------------------------------------------- ce que l'outil EXÉCUTE */

/** Les étapes, numérotées, dans l'ordre où elles arrivent — et ce que ça coûte. */
function Execute({ n }: { n: number }) {
  const o = outil(n)!
  const t = TEMPS[o.famille]
  const c = FAMILLES[o.famille].couleur
  return (
    <>
      <div className="px-[16px] py-[9px] flex flex-wrap items-baseline gap-[10px]" style={{ borderTop: '1px solid var(--line-strong)', background: 'var(--bg-2)' }}>
        <span className="t-label" style={{ color: 'var(--ink-3)' }}>{t.milieu}</span>
        <span className="t-data-xs" style={{ color: 'var(--ink-4)' }}>{o.cout}</span>
      </div>
      {o.execute.map((e, i) => (
        <div key={e} className="px-[16px] py-[7px] flex gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
          <span className="t-label" style={{ color: c, minWidth: 16 }}>{i + 1}</span>
          <span className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: '82ch' }}
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
  const t = TEMPS[o.famille]
  const ecrits = ecritPar(n)
  return (
    <>
      <div className="px-[16px] py-[9px]" style={{ borderTop: '1px solid var(--line-strong)', background: 'var(--bg-2)' }}>
        <span className="t-label" style={{ color: 'var(--ink-3)' }}>{t.sortie}</span>
      </div>
      {o.sortie.map((c) => (
        <div key={c.champ} className="px-[16px] py-[6px] flex flex-wrap items-baseline gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
          <code style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink)', minWidth: 120, wordBreak: 'break-all' }}>{c.champ}</code>
          <span className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: '78ch', flex: '1 1 200px', minWidth: 0 }}>{c.quoi}</span>
        </div>
      ))}
      {ecrits.map((j) => <Jeu key={j.cle} j={j} sens="écrit" />)}
      <Sortie n={n} />
    </>
  )
}

/* --------------------------------------------------------------- la page */

export function OutilPanel({ n, surOutil }: { n: number; surOutil?: (n: number) => void }) {
  const o = outil(n)
  if (!o) return null
  const c = accent(o.n)
  return (
    <Panel
      index={String(o.n).padStart(2, '0')}
      title={o.nom.toLowerCase()}
      right={
        <span className="flex items-center gap-[8px]">
          <span className="t-label" style={{ color: c }}>{FAMILLES[o.famille].nom}</span>
          <span className="t-label" style={{ color: o.etat === 'pret' ? 'var(--ink-3)' : 'var(--m-5)' }}>
            {o.etat === 'pret' ? 'prêt' : o.etat === 'en_attente' ? 'en attente' : 'hors ligne'}
          </span>
        </span>
      }
    >
      <div className="px-[16px] py-[14px]" style={{ boxShadow: `inset 4px 0 0 ${c}` }}>
        <p className="m-0" style={{ fontFamily: 'var(--prose)', fontSize: 17, lineHeight: 1.5, color: 'var(--ink)', maxWidth: '70ch' }}>
          « {o.question} »
        </p>
        <p className="m-0 mt-[8px]" style={{ fontFamily: 'var(--prose)', fontSize: 14.5, lineHeight: 1.6, color: 'var(--ink-2)', maxWidth: '78ch' }}>
          {o.rend}
        </p>
        <p className="m-0 mt-[8px] t-data-xs" style={{ color: 'var(--ink-4)' }}>
          <span style={{ color: c }}>{FAMILLES[o.famille].nom}</span> — {FAMILLES[o.famille].quoi}
        </p>
      </div>

      <Ingere n={o.n} />
      <Execute n={o.n} />
      <Rend n={o.n} />

      {o.routes.length > 0 && (
        <L k="routes" v={<span className="flex flex-wrap gap-[8px]">{o.routes.map((r) => (
          <code key={r} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)', wordBreak: 'break-all' }}>{r}</code>
        ))}</span>} />
      )}
      <L k="le code" v={<span className="flex flex-wrap gap-[6px]">{o.code.map((d) => (
        <code key={d} style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-3)', wordBreak: 'break-all' }}>{d}</code>
      ))}</span>} />
      <L k="accès" v={o.acces.join(' · ')} />
      {o.panneaux.length > 0 && <L k="déjà affiché en" v={`panneau ${o.panneaux.join(', ')}`} />}

      {o.pourquoi && (
        <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
          <div className="t-label" style={{ color: 'var(--m-5)' }}>pourquoi il n'est pas prêt</div>
          <div className="t-data-xs mt-[5px]" style={{ color: 'var(--ink-2)', maxWidth: '78ch', lineHeight: 1.55 }}
            dangerouslySetInnerHTML={{ __html: o.pourquoi.replace(/\*\*(.+?)\*\*/g, '<strong style="color:var(--ink)">$1</strong>') }} />
        </div>
      )}

      <div className="px-[16px] py-[10px] flex flex-wrap gap-[6px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
        {OUTILS.map((x) => (
          <button
            key={x.n}
            type="button"
            onClick={() => surOutil?.(x.n)}
            className="t-label"
            style={{
              padding: '4px 8px',
              border: `1px solid ${x.n === o.n ? FAMILLES[x.famille].couleur : 'var(--line)'}`,
              background: x.n === o.n ? 'var(--bg-3)' : 'transparent',
              color: FAMILLES[x.famille].couleur,
              cursor: 'pointer',
            }}
            title={x.question}
          >
            {x.n}
          </button>
        ))}
      </div>
    </Panel>
  )
}
