/**
 * PANNEAU 16 — SUBSTITUER.
 *
 * La question qui vient juste apres « ce que cette porte prend » : et ailleurs ? Ce panneau
 * la pose a `POST /alternative`, montre la reponse telle qu'elle vient, et — seulement
 * lorsqu'une porte mesuree moins chere existe — propose de construire la transaction de
 * remplacement.
 *
 * TROIS CHOSES QU'IL NE FAIT JAMAIS :
 *
 *   1. IL N'ENVOIE PAS. Il rend un `{to, data, value}` et un bouton qui le passe au
 *      portefeuille. La derniere main sur la transaction est celle de l'utilisateur — c'est
 *      la regle dure n.4 de packages/guard/src/alternative.ts, tenue jusqu'a l'ecran.
 *
 *   2. IL NE JUGE PAS. Ni « cette porte est meilleure », ni « la transaction est envoyable ».
 *      Les deux jugements viennent du serveur, qui les prend sur la table des 125 072
 *      mesures. Les refaire ici en produirait une seconde version, et deux versions
 *      divergent.
 *
 *   3. IL N'INVENTE AUCUNE PHRASE. Chaque etat a son texte dans ../compte/substitution.ts,
 *      et la RAISON rendue par le serveur est affichee telle quelle. Un ecran qui reformule
 *      un refus finit par le reformuler faux.
 *
 * ET IL AFFICHE LE COMPTE DES APPELS RPC. Sur 125 072 lignes du corpus, 124 704 rendent « il
 * n'y a qu'une porte » et coutent ZERO requete : la route ne touche au reseau qu'apres avoir
 * verifie qu'il y a quelque chose a proposer. Ce compte a l'ecran est ce qui rend cette
 * promesse verifiable au lieu d'etre a croire.
 */
import { useMemo, useState } from 'react'
import { Panel, Copy, NonLu, Replay, Chip, Absence } from './Prim'
import { dataset } from '../lib/dataset'
import { Refus, ecouterPortefeuilles, type Fournisseur, type PortefeuilleAnnonce } from '../compte/api'
import {
  AFFICHAGE,
  SUITE,
  demanderAlternative,
  type ReponseAlternative,
} from '../compte/substitution'
import { useEffect } from 'react'

/* ------------------------------------------------ les couples proposes a l'ecran */

/**
 * Les quatre couples du corpus ou une porte mesuree est moins chere, a la meme taille et
 * dans le meme sens.
 *
 * On les CALCULE depuis le corpus embarque au lieu de les ecrire : la liste change a chaque
 * balayage, et une liste ecrite deviendrait fausse en silence. C'est la meme logique que
 * `chercherAlternative` — memes deux monnaies, meme sens, meme taille — et le serveur
 * refera le calcul de toute facon : ceci ne sert qu'a proposer des exemples cliquables.
 */
function couplesInteressants(limite = 8) {
  const parEchange = new Map<string, { pool: string; dir: '0->1' | '1->0'; taille: string; bps: number }[]>()
  for (const r of dataset.rows) {
    // Le corpus du front porte les etiquettes en francais : MESURE, INTERPOLE,
    // NON_MESURABLE, NON_COTABLE. `MEASURED` est la forme de l'API et du paquet guard, et
    // tsc a attrape la confusion — sans lui, ce filtre n'aurait retenu AUCUNE ligne et la
    // liste d'exemples serait restee vide sans que rien ne le dise.
    if (r.label !== 'MESURE' || r.bps === null) continue
    const dir: '0->1' | '1->0' = r.zero_for_one ? '0->1' : '1->0'
    const entree = (r.zero_for_one ? r.currency0 : r.currency1).toLowerCase()
    const sortie = (r.zero_for_one ? r.currency1 : r.currency0).toLowerCase()
    const k = `${entree}|${sortie}|${r.amount_in}`
    const l = parEchange.get(k) ?? []
    l.push({ pool: r.pool_id, dir, taille: r.amount_in, bps: r.bps })
    parEchange.set(k, l)
  }
  const out: { pool: string; dir: '0->1' | '1->0'; taille: string; ecart: number }[] = []
  for (const l of parEchange.values()) {
    if (new Set(l.map((x) => x.pool)).size < 2) continue
    const pire = l.reduce((a, b) => (b.bps > a.bps ? b : a))
    const meilleur = l.reduce((a, b) => (b.bps < a.bps ? b : a))
    const ecart = pire.bps - meilleur.bps
    if (ecart < 1) continue
    out.push({ pool: pire.pool, dir: pire.dir, taille: pire.taille, ecart })
  }
  return out.sort((a, b) => b.ecart - a.ecart).slice(0, limite)
}

/* ---------------------------------------------------------------- presentation */

const L = ({ k, v }: { k: string; v: React.ReactNode }) => (
  <div className="flex items-baseline gap-[10px] px-[16px] py-[6px]" style={{ borderTop: '1px solid var(--line)' }}>
    <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 138 }}>{k}</span>
    <span className="t-data-xs" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>{v}</span>
  </div>
)

function Bouton({
  children,
  onClick,
  actif = true,
  fort = false,
  titre,
}: {
  children: React.ReactNode
  onClick: () => void
  actif?: boolean
  fort?: boolean
  titre?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!actif}
      title={titre}
      className="t-label"
      style={{
        padding: '7px 13px',
        border: `1px solid ${fort && actif ? 'var(--line-strong)' : 'var(--line)'}`,
        background: fort && actif ? 'var(--bg-3)' : 'transparent',
        color: actif ? 'var(--ink)' : 'var(--ink-4)',
        cursor: actif ? 'pointer' : 'not-allowed',
      }}
    >
      {children}
    </button>
  )
}

const TON: Record<'neutre' | 'bon' | 'attention', string> = {
  neutre: 'var(--ink-2)',
  bon: 'var(--ink)',
  attention: 'var(--m-5)',
}

/* --------------------------------------------------------------------- l'ecran */

export function SubstituerPanel() {
  const exemples = useMemo(() => couplesInteressants(), [])
  const [pool, setPool] = useState(() => exemples[0]?.pool ?? '')
  const [dir, setDir] = useState<'0->1' | '1->0'>(() => exemples[0]?.dir ?? '0->1')
  const [taille, setTaille] = useState(() => exemples[0]?.taille ?? '')
  const [r, setR] = useState<ReponseAlternative | null>(null)
  const [refus, setRefus] = useState<Refus | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  const [envoye, setEnvoye] = useState<string | null>(null)
  const [portefeuilles, setPortefeuilles] = useState<PortefeuilleAnnonce[]>([])

  useEffect(() => ecouterPortefeuilles(setPortefeuilles), [])
  const fournisseur: Fournisseur | null = portefeuilles[0]?.provider ?? null

  const demander = async (construire: boolean) => {
    setOccupe(construire ? 'lecture de la chaine' : 'comparaison, sans reseau')
    setRefus(null)
    setEnvoye(null)
    try {
      // L'adresse n'est demandee que pour CONSTRUIRE : l'etat Permit2 d'un ERC-20 depend de
      // qui signe. La comparaison, elle, ne depend de personne.
      let proprietaire: string | undefined
      if (construire && fournisseur) {
        const c = (await fournisseur.request({ method: 'eth_requestAccounts' })) as string[]
        proprietaire = c?.[0]
      }
      setR(
        await demanderAlternative({
          pool_id: pool,
          direction: dir,
          amount_in: taille || undefined,
          construire,
          proprietaire,
        }),
      )
    } catch (e) {
      setRefus(e instanceof Refus ? e : new Refus('erreur', (e as Error).message))
      setR(null)
    } finally {
      setOccupe(null)
    }
  }

  const envoyer = async () => {
    const tx = r?.envoi.transaction
    if (!tx || !fournisseur) return
    setOccupe('signature dans le portefeuille')
    try {
      const c = (await fournisseur.request({ method: 'eth_requestAccounts' })) as string[]
      const hash = (await fournisseur.request({
        method: 'eth_sendTransaction',
        params: [{ from: c?.[0], to: tx.to, data: tx.data, value: tx.value }],
      })) as string
      setEnvoye(hash)
    } catch (e) {
      const err = e as { code?: number; message?: string }
      setRefus(
        new Refus(
          'erreur',
          err.code === 4001
            ? 'refuse dans le portefeuille. C\'est une reponse, pas une panne.'
            : `envoi impossible : ${err.message ?? 'sans message'}`,
        ),
      )
    } finally {
      setOccupe(null)
    }
  }

  const approuver = async () => {
    const a = r?.envoi.permit2?.approbation
    if (!a || !fournisseur) return
    setOccupe('approbation dans le portefeuille')
    try {
      const c = (await fournisseur.request({ method: 'eth_requestAccounts' })) as string[]
      const hash = (await fournisseur.request({
        method: 'eth_sendTransaction',
        params: [{ from: c?.[0], to: a.to, data: a.data }],
      })) as string
      setEnvoye(hash)
    } catch (e) {
      setRefus(new Refus('erreur', `approbation impossible : ${(e as Error).message}`))
    } finally {
      setOccupe(null)
    }
  }

  const alt = r?.alternative
  const env = r?.envoi
  const aff = alt ? AFFICHAGE[alt.etat] : null
  const suite = env ? SUITE[env.etat] : null

  return (
    <Panel
      index="16"
      title="Et ailleurs ? La porte de remplacement"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {r ? `${r.appels_rpc} appel(s) RPC` : 'la comparaison ne coute aucune requete'}
        </span>
      }
    >
      <p
        className="m-0 px-[16px] py-[12px]"
        style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '78ch', color: 'var(--ink-2)' }}
      >
        Sur les <strong style={{ color: 'var(--ink)' }}>125 072</strong> lignes du corpus,{' '}
        <strong style={{ color: 'var(--ink)' }}>124 704</strong> repondent « il n'y a qu'une porte »
        — et c'est une reponse, pas un echec de recherche. <strong style={{ color: 'var(--ink)' }}>Quinze</strong> passent
        le seuil d'un point de base, sur <strong>quatre</strong> couples de pools ; la meilleure fait
        passer de 295,59 a 216,92 bps, deux pools de memes monnaies, memes frais et meme{' '}
        <code style={{ fontFamily: 'var(--mono)' }}>tickSpacing</code>, qui ne different que par leur
        hook. Aucune ne depasse 100 bps. La vraie variable actionnable reste la taille.
      </p>

      {exemples.length > 0 && (
        <L
          k="couples du corpus"
          v={
            <span className="flex flex-wrap gap-[6px]">
              {exemples.map((e) => (
                <button
                  key={`${e.pool}${e.dir}${e.taille}`}
                  type="button"
                  onClick={() => {
                    setPool(e.pool)
                    setDir(e.dir)
                    setTaille(e.taille)
                    setR(null)
                    setRefus(null)
                  }}
                  className="t-label"
                  style={{
                    padding: '4px 8px',
                    border: `1px solid ${pool === e.pool && dir === e.dir && taille === e.taille ? 'var(--line-strong)' : 'var(--line)'}`,
                    background: 'transparent',
                    color: 'var(--ink-2)',
                    cursor: 'pointer',
                  }}
                  title={`${e.pool} · ${e.dir} · ${e.taille}`}
                >
                  {e.pool.slice(0, 8)}… {e.dir} · {e.ecart.toFixed(1)} bps
                </button>
              ))}
            </span>
          }
        />
      )}

      <L
        k="pool"
        v={
          <input
            value={pool}
            onChange={(ev) => setPool(ev.target.value.trim())}
            spellCheck={false}
            aria-label="identifiant du pool actuel"
            name="pool"
            autoComplete="off"
            translate="no"
            className="t-data-sm"
            style={{
              width: '100%',
              maxWidth: 560,
              padding: '5px 8px',
              border: '1px solid var(--line)',
              background: 'var(--bg-2)',
              color: 'var(--ink)',
              fontFamily: 'var(--mono)',
            }}
            placeholder="0x… (64 hex)"
          />
        }
      />
      <L
        k="sens · taille"
        v={
          <span className="flex flex-wrap items-center gap-[8px]">
            {(['0->1', '1->0'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDir(d)}
                className="t-label"
                style={{
                  padding: '4px 9px',
                  border: `1px solid ${dir === d ? 'var(--line-strong)' : 'var(--line)'}`,
                  background: dir === d ? 'var(--bg-3)' : 'transparent',
                  color: 'var(--ink)',
                  cursor: 'pointer',
                }}
              >
                {d}
              </button>
            ))}
            <input
              value={taille}
              onChange={(ev) => setTaille(ev.target.value.replace(/[^0-9]/g, ''))}
              spellCheck={false}
              aria-label="taille dépensée, en unités du jeton d'entrée"
              name="taille"
              autoComplete="off"
              inputMode="numeric"
              className="t-data-sm"
              style={{
                // `width: 230` fixe debordait a 400 px : une largeur fixe dans une ligne qui
                // se replie n'est pas une largeur, c'est un plancher.
                flex: '1 1 200px',
                minWidth: 0,
                maxWidth: 230,
                padding: '5px 8px',
                border: '1px solid var(--line)',
                background: 'var(--bg-2)',
                color: 'var(--ink)',
                fontFamily: 'var(--mono)',
              }}
              placeholder="1000000000000000000… en unités du jeton d'entrée"
            />
          </span>
        }
      />

      <div className="px-[16px] py-[11px] flex flex-wrap items-center gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
        <Bouton onClick={() => demander(false)} actif={Boolean(pool) && !occupe}>
          comparer
        </Bouton>
        <Bouton
          onClick={() => demander(true)}
          actif={Boolean(pool) && !occupe}
          titre="lit la cotation vivante et l'etat Permit2 : jusqu'a trois eth_call factures"
        >
          comparer et construire
        </Bouton>
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {occupe ?? "« comparer » ne touche a aucun noeud. « construire » en lit un, et le dit."}
        </span>
      </div>

      {refus && (
        <Absence
          quoi={refus.genre === 'api_absente' ? 'l’API de substitution' : refus.genre.replace(/_/g, ' ')}
          etat={refus.genre === 'api_absente' ? undefined : 'refus'}
          panne={refus.genre !== 'api_absente'}
          raison={refus.message}
          cmd={refus.genre === 'api_absente' ? 'cd apps/api && npm start' : undefined}
        />
      )}

      {alt && aff && (
        <>
          <div className="px-[16px] pt-[13px] pb-[8px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
            <div className="t-label" style={{ color: TON[aff.ton] }}>
              {alt.etat} — {aff.titre}
            </div>
            <div className="t-data-xs mt-[6px]" style={{ color: 'var(--ink-2)', maxWidth: '78ch', lineHeight: 1.55 }}>
              {alt.raison}
            </div>
          </div>

          <L
            k="porte actuelle"
            v={
              <>
                {alt.actuelle.poolId.slice(0, 14)}… · hook {alt.actuelle.hook.slice(0, 12) || '—'}… ·{' '}
                {alt.actuelle.bps === null ? <NonLu quoi="mesure a cette taille" /> : `${alt.actuelle.bps.toFixed(4)} bps`}
              </>
            }
          />
          {alt.proposee && (
            <>
              <L
                k="porte proposee"
                v={
                  <>
                    {alt.proposee.poolId.slice(0, 14)}… · hook {alt.proposee.hook.slice(0, 12)}… ·{' '}
                    {alt.proposee.bps === null ? <NonLu quoi="mesure" /> : `${alt.proposee.bps.toFixed(4)} bps`} ·{' '}
                    frais {alt.proposee.poolKey.fee} · tickSpacing {alt.proposee.poolKey.tickSpacing}
                  </>
                }
              />
              <L
                k="economie mesuree"
                v={
                  <>
                    {alt.economie_bps === null ? <NonLu quoi="ecart" /> : `${alt.economie_bps.toFixed(4)} bps`}
                    <span style={{ color: 'var(--ink-2)' }}> · seuil de publication {alt.seuil_bps} bps</span>
                  </>
                }
              />
            </>
          )}
          <L
            k="portes examinees"
            v={
              alt.examinees.length === 0 ? (
                'aucune : rien d\'autre ne fait cet echange dans le corpus'
              ) : (
                <span className="flex flex-wrap gap-[6px]">
                  {alt.examinees.map((p) => (
                    <Chip key={p.poolId} title={`${p.poolId} · ${p.label ?? 'non mesure'}`}>
                      {p.poolId.slice(0, 8)}… {p.bps === null ? 'non mesuree' : `${p.bps.toFixed(2)} bps`}
                    </Chip>
                  ))}
                </span>
              )
            }
          />
          <L k="bloc du corpus" v={`${alt.block_number} · chaine ${alt.chain_id}`} />

          {/* --------------------------------------------------------- l'envoi */}
          {env && (
            <>
              <div className="px-[16px] pt-[13px] pb-[8px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
                <div className="t-valeur" style={{ color: env.etat === 'PRET' ? 'var(--ink)' : 'var(--ink)' }}>
                  {env.etat}
                  {suite && <span style={{ color: 'var(--ink-2)' }}> — {suite}</span>}
                </div>
                <div className="t-data-xs mt-[6px]" style={{ color: 'var(--ink-2)', maxWidth: '78ch', lineHeight: 1.55 }}>
                  {env.raison}
                </div>
              </div>

              {env.monnaieEntree && (
                <L
                  k="monnaie depensee"
                  v={
                    <>
                      {env.monnaieEntree}
                      <span style={{ color: 'var(--ink-2)' }}>
                        {env.native
                          ? " · ETH natif : rien a autoriser, le montant part dans `value`"
                          : ' · ERC-20 : Permit2 est necessaire'}
                      </span>
                    </>
                  }
                />
              )}
              {env.amountOutMinimum && (
                <L
                  k="plancher de sortie"
                  v={
                    <>
                      {env.amountOutMinimum}
                      <span style={{ color: 'var(--ink-2)' }}>
                        {' '}· cotation vivante {env.cotation} moins {env.toleranceBps} bps
                      </span>
                    </>
                  }
                />
              )}
              {env.deadline && (
                <L
                  k="echeance"
                  v={
                    <>
                      {new Date(Number(env.deadline) * 1000).toISOString().slice(0, 19).replace('T', ' ')} UTC
                      <span style={{ color: 'var(--ink-2)' }}> · pas l'an 2106</span>
                    </>
                  }
                />
              )}
              {env.commandes && (
                <L
                  k="commandes du routeur"
                  v={
                    <>
                      {env.commandes}
                      <span style={{ color: 'var(--ink-2)' }}>
                        {env.commandes === '0x0a10' ? ' · le permit AVANT le swap' : ' · swap seul'}
                      </span>
                    </>
                  }
                />
              )}

              {r.lectures.length > 0 && (
                <div className="px-[16px] py-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
                  <div className="t-label mb-[6px]" style={{ color: 'var(--ink-2)' }}>
                    les {r.appels_rpc} lecture(s) on-chain, chacune rejouable
                  </div>
                  {r.lectures.map((l) => (
                    <div key={l.quoi} className="mb-[6px]">
                      <div className="t-data-xs" style={{ color: l.raison ? 'var(--m-3)' : 'var(--ink-2)' }}>
                        {l.quoi}
                        {l.raison && ` — ${l.raison}`}
                      </div>
                      <Replay cmd={l.rejeu} />
                    </div>
                  ))}
                </div>
              )}

              <div className="px-[16px] py-[11px] flex flex-wrap items-center gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
                {/* Le bouton n'est ACTIF que sur PRET. Sur les autres etats il reste visible
                    et grise, avec la raison a cote : un bouton absent ferait croire a
                    l'utilisateur qu'il a rate une etape. */}
                <Bouton
                  onClick={envoyer}
                  actif={env.etat === 'PRET' && Boolean(fournisseur) && !occupe}
                  fort
                  titre={
                    env.etat !== 'PRET'
                      ? `indisponible : ${env.etat}`
                      : !fournisseur
                        ? 'aucun portefeuille annonce'
                        : 'la transaction part de TON portefeuille, apres TA signature'
                  }
                >
                  signer et envoyer
                </Bouton>
                {env.etat === 'APPROBATION_REQUISE' && env.permit2?.approbation && (
                  <Bouton onClick={approuver} actif={Boolean(fournisseur) && !occupe}>
                    approuver le jeton vers Permit2
                  </Bouton>
                )}
                {env.transaction && (
                  <>
                    <Copy text={env.transaction.data} label="copier le calldata" />
                    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                      vers {env.transaction.to.slice(0, 12)}… · value {env.transaction.value}
                    </span>
                  </>
                )}
                {!fournisseur && (
                  <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    aucun portefeuille annonce : le calldata reste copiable, et verifiable
                  </span>
                )}
              </div>

              {envoye && (
                <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
                  <div className="t-label" style={{ color: 'var(--ink)' }}>transaction envoyee</div>
                  <div className="t-data-xs mt-[5px]" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>
                    {envoye}
                  </div>
                  <div className="t-data-xs mt-[6px]" style={{ color: 'var(--ink-2)', maxWidth: '76ch' }}>
                    Envoyee n'est pas incluse. Ce panneau ne suivra pas son sort : il n'a pas de
                    quoi le faire honnetement sans lire la chaine en boucle, et une roue qui
                    tourne indefiniment serait un silence deguise.
                  </div>
                </div>
              )}
            </>
          )}

          {r.note && (
            <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              {r.note}
            </div>
          )}
        </>
      )}
    </Panel>
  )
}
