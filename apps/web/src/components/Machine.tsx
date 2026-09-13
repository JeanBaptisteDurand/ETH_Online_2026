// LA MACHINE — CE QUE LE SITE NE MONTRAIT PAS.
//
// L'instrument affichait le corpus de mesures, et rien d'autre. Sur les 57 904 caracteres
// rendus par la page, « x402 », « Hedera », « HCS », « attestation », « Ledger » et « MCP »
// apparaissaient exactement ZERO fois, et la page entiere ne portait qu'un seul lien. Tout
// le peage regle sur Hedera, le journal d'audit, l'identite d'agent, les attestations
// on-chain et la validation independante par The Graph n'existaient que dans le depot :
// invisibles pour qui ouvre l'adresse du site.
//
// Ces panneaux les rendent. Chaque nombre vient de src/data/facts.json, assemble au build par
// scripts/build-facts.mjs depuis les fichiers du depot — aucun n'est recopie a la main. Et
// chaque fait porte le lien qui permet de le verifier ailleurs qu'ici : c'est le minimum
// pour un instrument dont l'argument est « verifie plutot que de me croire ».
import facts from '../data/facts.json'
import { Panel, Copy, Lien, NonLu, Chip, Absence } from './Prim'
import { dataset } from '../lib/dataset'

type Facts = typeof facts

const F = facts as Facts

/** Un couple libelle / valeur, aligne. `null` s'affiche « non lu », jamais vide. */
function Ligne({
  quoi,
  children,
  valeur,
}: {
  quoi: string
  children?: React.ReactNode
  valeur?: string | number | null
}) {
  const vide = valeur === null || valeur === undefined
  return (
    <div className="flex flex-wrap items-baseline gap-[10px]">
      <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 138 }}>
        {quoi}
      </span>
      <span className="t-data-sm" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>
        {children ?? (vide ? <NonLu quoi={quoi} /> : String(valeur))}
      </span>
    </div>
  )
}

const usd = (n: number | null | undefined) =>
  n === null || n === undefined
    ? null
    : n.toLocaleString('fr-FR', { maximumFractionDigits: 0 }) + ' $'

const nb = (n: number | null | undefined) =>
  n === null || n === undefined ? null : n.toLocaleString('fr-FR')

/* ------------------------------------------------------------------ 08 · x402 */

function Peage() {
  const x = F.x402
  return (
    <Panel
      index="09"
      title="Le péage, relu sur le mirror node"
      meta={['x402 v2', 'Hedera testnet', 'Blocky402']}
    >
      <div className="flex flex-col gap-[14px] p-[16px]">
        {!x ? (
          <Absence
            quoi="docs/x402-settlements.jsonl"
            raison="le journal des règlements n’a pas été lu au build. Aucun chiffre n’est affiché à la place : un péage non relu n’est pas un péage à zéro."
            cmd="npm run data"
          />
        ) : (
          <>
            <p className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              Lire une mesure deja faite est gratuit. En declencher une neuve coute du calcul
              reel — un fork, deux cotations, une reecriture de bytecode — et se paie a
              l'unite. L'unite facturee est <strong>la mesure</strong>, pas la requete : cinq
              tailles coutent cinq fois.
            </p>

            <div className="flex flex-wrap gap-[24px]">
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {x.regles}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  paiements <strong>regles</strong> et relus sur le mirror node
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {x.par_keyring}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  signes par une cle servie par le <strong>Ledger Key Ring</strong>, pas par un
                  fichier
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {x.prix_unite_usd ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  USDC par <strong>mesure</strong> — les montants regles vont de{' '}
                  {x.montants.length
                    ? `${Number(x.montants[0]) / 1e6} a ${Number(x.montants[x.montants.length - 1]) / 1e6}`
                    : '—'}{' '}
                  USDC, parce que cinq tailles coutent cinq fois
                </div>
              </div>
            </div>

            <p className="t-data-xs" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              « Regle » veut dire relu sur le mirror node : un paiement envoye n'est pas un
              paiement regle, et les compter ensemble serait la meme faute que compter un
              silence pour un zero. {x.vus !== x.regles ? `${x.vus} lignes au journal, ${x.regles} confirmees.` : ''}
            </p>

            <div className="scroll" tabIndex={0} role="region" aria-label="journal des règlements" style={{ overflowX: 'auto' }}>
              <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)' }}>
                    {['quand', 'transaction Hedera', 'statut', 'montant', 'latence', 'clé', 'lien'].map((h) => (
                      <th
                        key={h}
                        className="t-data-sm px-[10px] py-[6px] text-left"
                        style={{
                          color: 'var(--ink-2)',
                          borderBottom: '1px solid var(--line-strong)',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {x.lignes.map((l, i) => (
                    <tr key={l.transaction ?? i} style={{ borderBottom: '1px solid var(--line)' }}>
                      <td className="t-data-xs px-[10px] py-[5px]" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                        {l.ts?.slice(0, 16).replace('T', ' ')}
                      </td>
                      <td className="t-data-xs hex px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>
                        {l.transaction}
                      </td>
                      <td className="px-[10px] py-[5px]">
                        <Chip>{l.statut ?? 'NON RELU'}</Chip>
                      </td>
                      <td className="t-data-xs px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-2)' }}>
                        {l.montant ? `${Number(l.montant) / 1e6} USDC` : '—'}
                      </td>
                      <td className="t-data-xs px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-2)' }}>
                        {l.latence_ms ? `${(l.latence_ms / 1000).toFixed(1)} s` : '—'}
                      </td>
                      <td className="t-data-xs px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>
                        {l.cle === 'ledger-keyring' ? 'anneau Ledger' : 'fichier .env'}
                      </td>
                      <td className="px-[10px] py-[5px]">
                        {l.hashscan ? <Lien href={l.hashscan}>verifier</Lien> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-[16px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
              <span>facilitateur {x.facilitateur ?? '—'}</span>
              <span>jeton {x.jeton ?? '—'}</span>
              <span>payeur {x.payeur ?? '—'}</span>
              <span>encaisseur {x.encaisseur ?? '—'}</span>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

/* ------------------------------------------------------- 09 · identite d'agent */

function Identite() {
  const a = F.agent
  return (
    <Panel
      index="10"
      title="Qui mesure : l’identité d’agent"
      meta={[
        'HCS-14',
        a?.etat ?? 'non lu',
        ...(a?.sequence ? [`message #${a.sequence}`] : []),
      ]}
    >
      <div className="flex flex-col gap-[14px] p-[16px]">
        {!a ? (
          <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            Identite non lue : <code>docs/dataset/agent-identity.json</code> est absent du build.
          </p>
        ) : (
          <>
            <p className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              Le journal des paiements dit combien, quand, et par qui paye. Il ne disait pas{' '}
              <strong>quel service</strong>. Un identifiant HCS-14 repond a ca sous une forme
              qu'un tiers <strong>recalcule</strong> au lieu de nous croire : il est derive de
              six champs, pas attribue par un annuaire.
            </p>

            <div
              className="t-data-sm hex"
              style={{
                padding: '10px 12px',
                border: '1px solid var(--line)',
                background: 'var(--bg-0, var(--bg))',
                color: 'var(--ink)',
                wordBreak: 'break-all',
              }}
            >
              {a.uaid}
            </div>
            <div className="flex flex-wrap gap-[12px] items-center">
              <Copy text={a.uaid} label="copier l'identifiant" />
              {a.hashscan ? <Lien href={a.hashscan}>le voir sur le topic</Lien> : null}
              {a.spec ? <Lien href={a.spec}>la norme HCS-14</Lien> : null}
            </div>

            <div className="flex flex-col gap-[5px]">
              <Ligne quoi="etat" valeur={a.etat}>
                <span style={{ color: a.etat === 'ANNOUNCED' ? 'var(--ink)' : 'var(--ink-2)' }}>
                  {a.etat === 'ANNOUNCED'
                    ? 'annonce, et relu octet pour octet sur le mirror node'
                    : "pas d'annonce trouvee sur le topic"}
                </span>
              </Ligne>
              <Ligne quoi="topic" valeur={a.topic} />
              <Ligne quoi="message" valeur={a.sequence === null ? null : `#${a.sequence}`} />
              <Ligne quoi="consensus" valeur={a.consensus} />
              <Ligne quoi="lu le" valeur={a.lu_le?.slice(0, 19).replace('T', ' ')} />
            </div>

            <div className="flex flex-col gap-[6px]">
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                les six champs qui produisent l'empreinte — recalcule-la
              </span>
              <div
                className="t-data-xs hex"
                style={{
                  padding: '8px 10px',
                  border: '1px solid var(--line)',
                  background: 'var(--bg-2)',
                  color: 'var(--ink-2)',
                  wordBreak: 'break-all',
                }}
              >
                {a.canonical_json}
              </div>
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                sha384 de ce texte, encode en base58, prefixe <code>uaid:aid:</code>. Les
                parametres apres le « ; » sont du routage et n'entrent pas dans l'empreinte.
              </span>
            </div>

            <div className="flex flex-col gap-[8px]">
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                ce qui est revendique — chaque code a du code en face
              </span>
              <div className="flex flex-wrap gap-[6px]">
                {Object.entries(a.competences).map(([code, nom]) => (
                  <Chip key={code}>
                    {code} · {nom}
                  </Chip>
                ))}
              </div>
              <span className="t-label" style={{ color: 'var(--ink-2)', marginTop: 4 }}>
                et ce qui a ete ecarte, alors que c'etait tentant
              </span>
              <ul
                className="t-data-xs"
                style={{ color: 'var(--ink-2)', margin: 0, paddingLeft: 18, maxWidth: '78ch' }}
              >
                {a.ecartees.map((e) => (
                  <li key={e.code}>
                    <strong>
                      {e.code} {e.nom}
                    </strong>{' '}
                    — {e.pourquoi}
                  </li>
                ))}
              </ul>
              <p className="t-data-xs" style={{ color: 'var(--ink-2)', maxWidth: '78ch', margin: 0 }}>
                La norme publie deux vecteurs de test avec leurs entrees mais <strong>sans leurs
                empreintes</strong> : il n'existe aucun resultat de reference contre lequel se
                comparer. L'encodage est valide contre les vecteurs standard de Bitcoin et contre
                une bibliotheque independante, la mise en forme regle par regle — mais rien ne
                prouve que notre lecture du texte est celle qu'un autre implementeur ferait.
              </p>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}

/* --------------------------------------------------- 10 · attestations on-chain */

function Attestations() {
  const a = F.attestations
  return (
    <Panel
      index="11"
      title="Ce qui est écrit on-chain"
      meta={['lisible par un autre contrat', 'Hedera testnet', 'contrat deploye']}
    >
      <div className="flex flex-col gap-[14px] p-[16px]">
        {!a ? (
          <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            Attestations non lues : <code>docs/dataset/attestations.json</code> est absent du build.
          </p>
        ) : (
          <>
            <p className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              Une mesure qui ne vit que dans un fichier n'est utilisable que par qui lit ce
              fichier. Ecrite dans un contrat, elle devient lisible par{' '}
              <strong>un autre contrat</strong> — un agregateur, un routeur, une garde — sans
              nous demander la permission.
            </p>

            <div className="flex flex-wrap gap-[24px]">
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {nb(a.ecrits) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  hooks <strong>reellement ecrits on-chain</strong>, avec leur mediane et leur
                  maximum — sur {nb(a.tentes) ?? '—'} transactions envoyees
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink-2)' }}>
                  {nb(a.calcules) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  calcules sur le corpus — l'ecart avec ce qui est ecrit attend du gaz, et il
                  est publie plutot que lisse
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink-2)' }}>
                  {nb(a.ecartes) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  <strong>ecartes faute de mesure</strong> — pas ecrits a zero
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-[5px]">
              <Ligne quoi="contrat">
                <span className="hex">{a.contrat}</span>
              </Ligne>
              <Ligne quoi="empreinte du corpus">
                <span className="hex">{a.corpus_digest}</span>
              </Ligne>
              <Ligne quoi="corpus atteste" valeur={(a.corpus ?? []).join(' · ')} />
            </div>
            <div className="flex flex-wrap gap-[12px] items-center">
              {a.hashscan ? <Lien href={a.hashscan}>ouvrir le contrat</Lien> : null}
              {a.contrat ? <Copy text={a.contrat} label="copier l'adresse" /> : null}
            </div>

            {a.pire.length > 0 && (
              <div className="flex flex-col gap-[6px]">
                <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                  les trois plus gros prelevements attestes
                </span>
                {a.pire.map((h) => (
                  <div key={h.hook} className="flex flex-wrap gap-[14px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    <span className="hex">{h.hook}</span>
                    <span>max {h.max_bps?.toFixed(2)} bps</span>
                    <span style={{ color: 'var(--ink-2)' }}>mediane {h.median_bps?.toFixed(2)} bps</span>
                    <span style={{ color: 'var(--ink-2)' }}>{nb(h.pools)} pools</span>
                  </div>
                ))}
              </div>
            )}

            <p className="t-data-xs" style={{ color: 'var(--ink-2)', maxWidth: '78ch', margin: 0 }}>
              Un hook ecarte n'est pas un hook a zero : il n'a simplement aucune mesure a
              attester. Ecrire zero pour lui serait exactement la faute que tout cet instrument
              refuse.
            </p>
          </>
        )}
      </div>
    </Panel>
  )
}

/* ----------------------------------------------------- 11 · The Graph, le volume */

function Independante() {
  const g = F.graph
  return (
    <Panel
      index="12"
      title="Une source indépendante, confrontée"
      meta={['The Graph', 'subgraph officiel Uniswap V4 Base']}
    >
      <div className="flex flex-col gap-[14px] p-[16px]">
        {!g ? (
          <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            Volume non lu : <code>docs/dataset/volume-base.json</code> est absent du build.
          </p>
        ) : (
          <>
            <p className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              Tout le reste de cet instrument vient de <em>nos</em> mesures. Un recensement fait
              soi-meme peut etre faux de la meme facon partout. On est donc alle le confronter,
              pool par pool, a une source qui ne nous doit rien.
            </p>

            <div className="flex flex-wrap gap-[24px]">
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {nb(g.retrouves)} / {nb(g.pools_du_recensement)}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  de nos pools <strong>existent</strong> dans le subgraph officiel
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {usd(g.volume_usd) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  de volume cumule · {nb(g.transactions)} transactions
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {usd(g.au_taux_median_usd) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  retenus par les hooks, <strong>au taux median mesure</strong>
                </div>
              </div>
            </div>

            <div
              style={{
                border: '1px solid var(--line)',
                background: 'var(--bg-2)',
                padding: '12px 14px',
              }}
            >
              <div className="t-label" style={{ color: 'var(--ink-2)', marginBottom: 6 }}>
                pourquoi « estimation » et pas « constate »
              </div>
              <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
                {g.hypothese ?? <NonLu quoi="hypothese" />}
              </p>
              <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: '8px 0 0' }}>
                Le chiffre est donc <strong>borne</strong> : de {usd(g.au_taux_median_usd)} au taux
                median a {usd(g.au_taux_maximum_usd)} au taux maximum mesure. L'hypothese est
                ecrite dans le fichier lui-meme, pas en note de bas de page.
              </p>
            </div>

            {g.top_hooks.length > 0 && (
              <div className="flex flex-col gap-[6px]">
                <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                  les cinq hooks par montant estime retenu
                </span>
                {g.top_hooks.map((h) => (
                  <div key={h.hook} className="flex flex-wrap gap-[14px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    <span className="hex">{h.hook}</span>
                    <span>{usd(h.estime_usd)}</span>
                    <span style={{ color: 'var(--ink-2)' }}>sur {usd(h.volume_usd)} de volume</span>
                    <span style={{ color: 'var(--ink-2)' }}>{nb(h.pools)} pools</span>
                  </div>
                ))}
              </div>
            )}

            <p className="t-data-xs" style={{ color: 'var(--ink-2)', maxWidth: '78ch', margin: 0 }}>
              Un pool non retrouve serait <strong>absent</strong> de ce fichier, jamais present a
              volume zero. Aucun ne l'est : la couverture est de{' '}
              {g.part === null ? '—' : `${(g.part * 100).toFixed(1)} %`}.
            </p>
          </>
        )}
      </div>
    </Panel>
  )
}

/* --------------------------------------------- 12 · les surfaces qu'on ne voit pas */

function Surfaces() {
  const gd = F.garde
  const m = F.mcp
  return (
    <Panel
      index="14"
      title="Les autres surfaces"
      meta={['extension', 'serveur MCP', 'depot']}
    >
      <div className="flex flex-col gap-[16px] p-[16px]">
        <div className="flex flex-col gap-[6px]">
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            avant que tu signes — la garde de navigateur
          </span>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            Une extension Manifest V3 intercepte l'ordre d'envoyer une transaction — et rien
            d'autre — decode la <code>PoolKey</code> dans le calldata de l'Universal Router, et
            dit ce que ce hook a pris <strong>la derniere fois qu'il a ete mesure</strong>, avant
            la signature. Elle ne mesure rien au moment de signer : mesurer prend ~9 s a froid.
            C'est une consultation, et chaque nombre porte le bloc d'ou il vient.
          </p>
          {gd ? (
            <>
              <div className="flex flex-wrap gap-[16px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
                <span>
                  decodage verifie sur <strong style={{ color: 'var(--ink-2)' }}>{gd.transactions_reelles}</strong>{' '}
                  transactions reelles capturees sur Base
                </span>
                <span>routeur {gd.universal_router?.slice(0, 12)}…</span>
                <span>capture le {gd.capture_le?.slice(0, 10)}</span>
              </div>
              <div className="flex flex-wrap gap-[12px]">
                {gd.exemples.map((e) => (
                  <Lien key={e.hash} href={e.basescan}>
                    tx {e.hash.slice(0, 10)}… (bloc {nb(e.bloc)})
                  </Lien>
                ))}
              </div>
            </>
          ) : (
            <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              fixtures de calldata non lues
            </span>
          )}
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            Installable en local ; elle n'est pas publiee sur un store, et elle ne voit que le
            portefeuille d'un navigateur de bureau.
          </span>
        </div>

        <div className="flex flex-col gap-[6px]" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            pour un agent — le serveur MCP
          </span>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            La meme machine, exposee a un modele. Il choisit quoi interroger et repete ce qui
            revient — il ne produit aucun nombre. L'outil qui mesure passe par le meme peage :
            un agent paie ses mesures comme un humain.
          </p>
          <div className="flex flex-wrap gap-[6px]">
            {m ? m.outils.map((o) => <Chip key={o}>{o}</Chip>) : <NonLu quoi="serveur MCP" />}
          </div>
        </div>

        <div className="flex flex-col gap-[6px]" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            tout est verifiable
          </span>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            Les {nb(dataset.totals.rows)} mesures sont versionnees dans le depot, chacune avec la
            commande qui la reproduit. Ce n'est pas la donnee qui est vendue : c'est le droit de
            faire tourner la machine sur un pool que personne n'a encore mesure.
          </p>
          <div className="flex flex-wrap gap-[14px]">
            <Lien href={F.depot}>le depot</Lien>
            {F.agent?.hashscan ? <Lien href={F.agent.hashscan}>le journal d'audit HCS</Lien> : null}
            {F.attestations?.hashscan ? (
              <Lien href={F.attestations.hashscan}>les attestations on-chain</Lien>
            ) : null}
          </div>
        </div>

        {F.manquants.length > 0 && (
          <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0 }}>
            Sources absentes de ce build, dont les chiffres ne sont pas affiches :{' '}
            {F.manquants.join(', ')}.
          </p>
        )}
      </div>
    </Panel>
  )
}


/* ------------------------- 13 · la cotation tient quand le swap a vraiment lieu */

function Execution() {
  const e = F.execution
  const l = F.ledger
  return (
    <Panel
      index="13"
      title="La preuve d’exécution sur l’appareil"
      meta={['porte A4', 'EIP-712 sur Speculos']}
    >
      <div className="flex flex-col gap-[16px] p-[16px]">
        <div className="flex flex-col gap-[8px]">
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            tout ce qui est publie ici vient d'une SIMULATION — alors on a execute le swap
          </span>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            Chaque nombre de cet instrument vient de <code>V4Quoter</code>, appele en{' '}
            <code>eth_call</code>. C'est une simulation, et elle pourrait diverger d'une
            execution reelle : autre chemin de code, aucun jeton reellement deplace, un hook qui
            lit des soldes qu'un appel statique n'a jamais changes. Toute la these repose sur la
            fidelite du cotateur, et rien ne l'avait verifiee.
          </p>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            Alors un contrat sonde <strong>execute</strong> le swap sur le fork —{' '}
            <code>unlock</code>, <code>swap</code>, <code>settle</code>, <code>take</code> — puis
            lit son propre solde. Ce qu'un utilisateur recoit, pas ce qu'une comptabilite annonce.
            Deux fois : avec le bytecode du hook, puis avec le talon inerte a sa place.
          </p>

          {!e ? (
            <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
              Resultat de la porte A4 <NonLu quoi="engine/tare/gates/a4.py" /> — aucun chiffre
              n'est affiche a la place.
            </p>
          ) : (
            <>
              <div className="scroll" tabIndex={0} role="region" aria-label="exécuté contre coté" style={{ overflowX: 'auto', marginTop: 4 }}>
                <table className="w-full border-collapse" style={{ minWidth: 620 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-2)' }}>
                      {['mesure', 'exécuté (wei reçus)', 'coté (eth_call)', 'écart'].map((h, i) => (
                        <th
                          key={h + i}
                          className="t-data-sm px-[10px] py-[6px] text-left"
                          style={{ color: 'var(--ink-2)', borderBottom: '1px solid var(--line-strong)' }}
                        >
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      ['avec le hook', e.avec_hook],
                      ['avec le talon inerte', e.avec_talon],
                    ].map(([nom, v]) => {
                      const j = v as { execute: string; cote: string; egal: boolean }
                      return (
                        <tr key={nom as string} style={{ borderBottom: '1px solid var(--line)' }}>
                          <td className="t-data-xs px-[10px] py-[5px]" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
                            {nom as string}
                          </td>
                          <td className="t-data-xs hex px-[10px] py-[5px]" style={{ color: 'var(--ink)' }}>
                            {j.execute}
                          </td>
                          <td className="t-data-xs hex px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>
                            {j.cote}
                          </td>
                          <td className="px-[10px] py-[5px]">
                            <Chip>{j.egal ? 'IDENTIQUE' : 'DIVERGENT'}</Chip>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="t-data-sm" style={{ color: 'var(--ink)', margin: '4px 0 0' }}>
                <strong>
                  {e.bps_executes.toFixed(4)} bps executes contre {e.bps_publies.toFixed(4)} publies
                </strong>{' '}
                — au wei pres, sur les deux jambes. Si les deux avaient diverge, ce corpus
                decrirait un simulateur et non des echanges.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-[8px]" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            et le verdict lu sur un appareil, ecran par ecran, avant la signature
          </span>
          {!l ? (
            <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
              Preuve <NonLu quoi="docs/ledger/guard-speculos.json" />.
            </p>
          ) : (
            <>
              <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
                Le rapport de la garde n'est pas un message dans un navigateur : il est encode en{' '}
                <strong>EIP-712</strong> et rendu <strong>{l.ecrans} ecrans</strong> sur
                l'appareil, sur une vraie transaction Base. Ce qui est signe est ce qui a ete lu.
              </p>
              <div className="flex flex-col gap-[5px]">
                <Ligne quoi="verdict" valeur={l.verdict?.toUpperCase()} />
                <Ligne quoi="ce qui est affiche" valeur={l.titre} />
                <Ligne quoi="type EIP-712" valeur={l.type_712} />
                <Ligne quoi="ecrans" valeur={l.ecrans === null ? null : `${l.ecrans} sur l'appareil`} />
                <Ligne quoi="signature" valeur={l.signature_v === null ? null : `v = ${l.signature_v}`} />
                <Ligne quoi="transaction" >
                  <span className="hex">{l.tx}</span>
                </Ligne>
                <Ligne quoi="appareil" valeur={l.appareil} />
              </div>
              <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
                {l.physique
                  ? "Appareil physique."
                  : "Ce n'est pas un Nano branche : c'est Speculos, l'emulateur officiel, servant l'application Ethereum de Ledger. On le dit plutot que de laisser croire au materiel."}
              </p>
              {l.basescan ? <Lien href={l.basescan}>la transaction sur Basescan</Lien> : null}
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

export function MachinePanels() {
  return (
    <>
      <Peage />
      <Identite />
      <Attestations />
      <Independante />
      <Execution />
      <Surfaces />
    </>
  )
}
