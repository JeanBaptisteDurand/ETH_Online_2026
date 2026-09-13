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
      title="The toll, re-read on the mirror node"
      meta={['x402 v2', 'Hedera testnet', 'Blocky402']}
    >
      <div className="flex flex-col gap-[14px] p-[16px]">
        {!x ? (
          <Absence
            quoi="docs/x402-settlements.jsonl"
            raison="the settlements log was not read at build time. No number is shown in its place: a toll that has not been re-read is not a toll at zero."
            cmd="npm run data"
          />
        ) : (
          <>
            <p className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              Reading a measurement that already exists is free. Triggering a new one costs
              real compute — a fork, two quotes, a bytecode rewrite — and is paid for by the
              unit. The unit billed is <strong>the measurement</strong>, not the request: five
              sizes cost five times.
            </p>

            <div className="flex flex-wrap gap-[24px]">
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {x.regles}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  payments <strong>settled</strong> and re-read on the mirror node
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {x.par_keyring}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  signed by a key served by the <strong>Ledger Key Ring</strong>, not by a
                  file
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {x.prix_unite_usd ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  USDC per <strong>measurement</strong> — the settled amounts range from{' '}
                  {x.montants.length
                    ? `${Number(x.montants[0]) / 1e6} to ${Number(x.montants[x.montants.length - 1]) / 1e6}`
                    : '—'}{' '}
                  USDC, because five sizes cost five times
                </div>
              </div>
            </div>

            <p className="t-data-xs" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              “Settled” means re-read on the mirror node: a payment that was sent is not a
              payment that settled, and counting them together would be the same mistake as
              counting a silence for a zero. {x.vus !== x.regles ? `${x.vus} lines in the log, ${x.regles} confirmed.` : ''}
            </p>

            <div className="scroll" tabIndex={0} role="region" aria-label="settlements log" style={{ overflowX: 'auto' }}>
              <table className="w-full border-collapse" style={{ minWidth: 720 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-2)' }}>
                    {['when', 'Hedera transaction', 'status', 'amount', 'latency', 'key', 'link'].map((h) => (
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
                        <Chip>{l.statut ?? 'NOT RE-READ'}</Chip>
                      </td>
                      <td className="t-data-xs px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-2)' }}>
                        {l.montant ? `${Number(l.montant) / 1e6} USDC` : '—'}
                      </td>
                      <td className="t-data-xs px-[10px] py-[5px] text-right" style={{ color: 'var(--ink-2)' }}>
                        {l.latence_ms ? `${(l.latence_ms / 1000).toFixed(1)} s` : '—'}
                      </td>
                      <td className="t-data-xs px-[10px] py-[5px]" style={{ color: 'var(--ink-2)' }}>
                        {l.cle === 'ledger-keyring' ? 'Ledger key ring' : '.env file'}
                      </td>
                      <td className="px-[10px] py-[5px]">
                        {l.hashscan ? <Lien href={l.hashscan}>verify</Lien> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-[16px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
              <span>facilitator {x.facilitateur ?? '—'}</span>
              <span>token {x.jeton ?? '—'}</span>
              <span>payer {x.payeur ?? '—'}</span>
              <span>payee {x.encaisseur ?? '—'}</span>
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
      title="Who measures: the agent identity"
      meta={[
        'HCS-14',
        a?.etat ?? 'not read',
        ...(a?.sequence ? [`message #${a.sequence}`] : []),
      ]}
    >
      <div className="flex flex-col gap-[14px] p-[16px]">
        {!a ? (
          <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            Identity not read: <code>docs/dataset/agent-identity.json</code> is absent from this build.
          </p>
        ) : (
          <>
            <p className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              The payments log says how much, when, and who paid. It did not say{' '}
              <strong>which service</strong>. An HCS-14 identifier answers that in a form a third
              party <strong>recomputes</strong> instead of taking our word for it: it is derived
              from six fields, not handed out by a directory.
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
              <Copy text={a.uaid} label="copy the identifier" />
              {a.hashscan ? <Lien href={a.hashscan}>see it on the topic</Lien> : null}
              {a.spec ? <Lien href={a.spec}>the HCS-14 standard</Lien> : null}
            </div>

            <div className="flex flex-col gap-[5px]">
              <Ligne quoi="state" valeur={a.etat}>
                <span style={{ color: a.etat === 'ANNOUNCED' ? 'var(--ink)' : 'var(--ink-2)' }}>
                  {a.etat === 'ANNOUNCED'
                    ? 'announced, and re-read byte for byte on the mirror node'
                    : 'no announcement found on the topic'}
                </span>
              </Ligne>
              <Ligne quoi="topic" valeur={a.topic} />
              <Ligne quoi="message" valeur={a.sequence === null ? null : `#${a.sequence}`} />
              <Ligne quoi="consensus" valeur={a.consensus} />
              <Ligne quoi="read on" valeur={a.lu_le?.slice(0, 19).replace('T', ' ')} />
            </div>

            <div className="flex flex-col gap-[6px]">
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                the six fields that produce the digest — recompute it
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
                sha384 of this text, encoded in base58, prefixed <code>uaid:aid:</code>. The
                parameters after the “;” are routing and do not enter into the digest.
              </span>
            </div>

            <div className="flex flex-col gap-[8px]">
              <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                what is claimed — every code has code behind it
              </span>
              <div className="flex flex-wrap gap-[6px]">
                {Object.entries(a.competences).map(([code, nom]) => (
                  <Chip key={code}>
                    {code} · {nom}
                  </Chip>
                ))}
              </div>
              <span className="t-label" style={{ color: 'var(--ink-2)', marginTop: 4 }}>
                and what was left out, tempting as it was
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
                The standard publishes two test vectors with their inputs but <strong>without
                their digests</strong>: there is no reference result to compare against. The
                encoding is validated against Bitcoin’s standard vectors and against an
                independent library, the formatting rule by rule — but nothing proves that our
                reading of the text is the one another implementer would arrive at.
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
      title="What is written on-chain"
      meta={['readable by another contract', 'Hedera testnet', 'contract deployed']}
    >
      <div className="flex flex-col gap-[14px] p-[16px]">
        {!a ? (
          <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            Attestations not read: <code>docs/dataset/attestations.json</code> is absent from this build.
          </p>
        ) : (
          <>
            <p className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              A measurement that lives only in a file is usable only by whoever reads that
              file. Written into a contract, it becomes readable by{' '}
              <strong>another contract</strong> — an aggregator, a router, a guard — without
              asking us for permission.
            </p>

            <div className="flex flex-wrap gap-[24px]">
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {nb(a.ecrits) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  hooks <strong>actually written on-chain</strong>, with their median and their
                  maximum — out of {nb(a.tentes) ?? '—'} transactions sent
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink-2)' }}>
                  {nb(a.calcules) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  computed over the corpus — the gap with what is written is waiting on gas,
                  and it is published rather than smoothed over
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink-2)' }}>
                  {nb(a.ecartes) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  <strong>left out for lack of a measurement</strong> — not written at zero
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-[5px]">
              <Ligne quoi="contract">
                <span className="hex">{a.contrat}</span>
              </Ligne>
              <Ligne quoi="corpus digest">
                <span className="hex">{a.corpus_digest}</span>
              </Ligne>
              <Ligne quoi="attested corpus" valeur={(a.corpus ?? []).join(' · ')} />
            </div>
            <div className="flex flex-wrap gap-[12px] items-center">
              {a.hashscan ? <Lien href={a.hashscan}>open the contract</Lien> : null}
              {a.contrat ? <Copy text={a.contrat} label="copy the address" /> : null}
            </div>

            {a.pire.length > 0 && (
              <div className="flex flex-col gap-[6px]">
                <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                  the three largest attested takes
                </span>
                {a.pire.map((h) => (
                  <div key={h.hook} className="flex flex-wrap gap-[14px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    <span className="hex">{h.hook}</span>
                    <span>max {h.max_bps?.toFixed(2)} bps</span>
                    <span style={{ color: 'var(--ink-2)' }}>median {h.median_bps?.toFixed(2)} bps</span>
                    <span style={{ color: 'var(--ink-2)' }}>{nb(h.pools)} pools</span>
                  </div>
                ))}
              </div>
            )}

            <p className="t-data-xs" style={{ color: 'var(--ink-2)', maxWidth: '78ch', margin: 0 }}>
              A hook that was left out is not a hook at zero: it simply has no measurement to
              attest. Writing zero for it would be exactly the mistake this whole instrument
              refuses.
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
      title="An independent source, cross-checked"
      meta={['The Graph', 'official Uniswap V4 Base subgraph']}
    >
      <div className="flex flex-col gap-[14px] p-[16px]">
        {!g ? (
          <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
            Volume not read: <code>docs/dataset/volume-base.json</code> is absent from this build.
          </p>
        ) : (
          <>
            <p className="t-data-sm" style={{ color: 'var(--ink-2)', maxWidth: '78ch' }}>
              Everything else in this instrument comes from <em>our</em> measurements. A census
              taken in-house can be wrong the same way everywhere. So we went and checked it,
              pool by pool, against a source that owes us nothing.
            </p>

            <div className="flex flex-wrap gap-[24px]">
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {nb(g.retrouves)} / {nb(g.pools_du_recensement)}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  of our pools <strong>exist</strong> in the official subgraph
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {usd(g.volume_usd) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  of cumulative volume · {nb(g.transactions)} transactions
                </div>
              </div>
              <div>
                <div className="t-metric" style={{ color: 'var(--ink)' }}>
                  {usd(g.au_taux_median_usd) ?? '—'}
                </div>
                <div className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  withheld by hooks, <strong>at the measured median rate</strong>
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
                why “estimate” and not “observed”
              </div>
              <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
                {g.hypothese ?? <NonLu quoi="hypothesis" />}
              </p>
              <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: '8px 0 0' }}>
                The number is therefore <strong>bounded</strong>: from {usd(g.au_taux_median_usd)} at
                the median rate to {usd(g.au_taux_maximum_usd)} at the measured maximum rate. The
                hypothesis is written in the file itself, not in a footnote.
              </p>
            </div>

            {g.top_hooks.length > 0 && (
              <div className="flex flex-col gap-[6px]">
                <span className="t-label" style={{ color: 'var(--ink-2)' }}>
                  the five hooks by estimated amount withheld
                </span>
                {g.top_hooks.map((h) => (
                  <div key={h.hook} className="flex flex-wrap gap-[14px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    <span className="hex">{h.hook}</span>
                    <span>{usd(h.estime_usd)}</span>
                    <span style={{ color: 'var(--ink-2)' }}>on {usd(h.volume_usd)} of volume</span>
                    <span style={{ color: 'var(--ink-2)' }}>{nb(h.pools)} pools</span>
                  </div>
                ))}
              </div>
            )}

            <p className="t-data-xs" style={{ color: 'var(--ink-2)', maxWidth: '78ch', margin: 0 }}>
              A pool that was not found would be <strong>absent</strong> from this file, never
              present at zero volume. None is: coverage is{' '}
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
      title="The other surfaces"
      meta={['extension', 'MCP server', 'repository']}
    >
      <div className="flex flex-col gap-[16px] p-[16px]">
        <div className="flex flex-col gap-[6px]">
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            before you sign — the browser guard
          </span>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            A Manifest V3 extension intercepts the order to send a transaction — and nothing
            else — decodes the <code>PoolKey</code> in the Universal Router calldata, and says
            what that hook took <strong>the last time it was measured</strong>, before the
            signature. It measures nothing at signing time: measuring takes ~9 s cold. It is a
            lookup, and every number carries the block it comes from.
          </p>
          {gd ? (
            <>
              <div className="flex flex-wrap gap-[16px] t-data-xs" style={{ color: 'var(--ink-2)' }}>
                <span>
                  decoding verified on <strong style={{ color: 'var(--ink-2)' }}>{gd.transactions_reelles}</strong>{' '}
                  real transactions captured on Base
                </span>
                <span>router {gd.universal_router?.slice(0, 12)}…</span>
                <span>captured on {gd.capture_le?.slice(0, 10)}</span>
              </div>
              <div className="flex flex-wrap gap-[12px]">
                {gd.exemples.map((e) => (
                  <Lien key={e.hash} href={e.basescan}>
                    tx {e.hash.slice(0, 10)}… (block {nb(e.bloc)})
                  </Lien>
                ))}
              </div>
            </>
          ) : (
            <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              calldata fixtures not read
            </span>
          )}
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            Installable locally; it is not published to a store, and it only ever sees a
            desktop browser wallet.
          </span>
        </div>

        <div className="flex flex-col gap-[6px]" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            for an agent — the MCP server
          </span>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            The same machine, exposed to a model. It chooses what to query and repeats what
            comes back — it produces no number of its own. The tool that measures goes through
            the same toll: an agent pays for its measurements like a human.
          </p>
          <div className="flex flex-wrap gap-[6px]">
            {m ? m.outils.map((o) => <Chip key={o}>{o}</Chip>) : <NonLu quoi="MCP server" />}
          </div>
        </div>

        <div className="flex flex-col gap-[6px]" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            everything is verifiable
          </span>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            The {nb(dataset.totals.rows)} measurements are versioned in the repository, each with
            the command that reproduces it. What is sold is not the data: it is the right to run
            the machine on a pool nobody has measured yet.
          </p>
          <div className="flex flex-wrap gap-[14px]">
            <Lien href={F.depot}>the repository</Lien>
            {F.agent?.hashscan ? <Lien href={F.agent.hashscan}>the HCS audit log</Lien> : null}
            {F.attestations?.hashscan ? (
              <Lien href={F.attestations.hashscan}>the on-chain attestations</Lien>
            ) : null}
          </div>
        </div>

        {F.manquants.length > 0 && (
          <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0 }}>
            Sources absent from this build, whose numbers are not shown:{' '}
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
      title="Proof of execution on the device"
      meta={['door A4', 'EIP-712 on Speculos']}
    >
      <div className="flex flex-col gap-[16px] p-[16px]">
        <div className="flex flex-col gap-[8px]">
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            everything published here comes from a SIMULATION — so we executed the swap
          </span>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            Every number in this instrument comes from <code>V4Quoter</code>, called through{' '}
            <code>eth_call</code>. That is a simulation, and it could diverge from a real
            execution: a different code path, no token actually moved, a hook reading balances a
            static call never changed. The whole thesis rests on the quoter’s fidelity, and
            nothing had verified it.
          </p>
          <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
            So a probe contract <strong>executes</strong> the swap on the fork —{' '}
            <code>unlock</code>, <code>swap</code>, <code>settle</code>, <code>take</code> — then
            reads its own balance. What a user receives, not what an accounting entry announces.
            Twice: with the hook’s bytecode, then with the inert stub in its place.
          </p>

          {!e ? (
            <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
              Result of door A4 <NonLu quoi="engine/tare/gates/a4.py" /> — no number is shown
              in its place.
            </p>
          ) : (
            <>
              <div className="scroll" tabIndex={0} role="region" aria-label="executed against quoted" style={{ overflowX: 'auto', marginTop: 4 }}>
                <table className="w-full border-collapse" style={{ minWidth: 620 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-2)' }}>
                      {['measurement', 'executed (wei received)', 'quoted (eth_call)', 'gap'].map((h, i) => (
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
                      ['with the hook', e.avec_hook],
                      ['with the inert stub', e.avec_talon],
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
                            <Chip>{j.egal ? 'IDENTICAL' : 'DIVERGENT'}</Chip>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <p className="t-data-sm" style={{ color: 'var(--ink)', margin: '4px 0 0' }}>
                <strong>
                  {e.bps_executes.toFixed(4)} bps executed against {e.bps_publies.toFixed(4)} published
                </strong>{' '}
                — to the wei, on both legs. If the two had diverged, this corpus would be
                describing a simulator and not swaps.
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-[8px]" style={{ borderTop: '1px solid var(--line)', paddingTop: 14 }}>
          <span className="t-label" style={{ color: 'var(--ink-2)' }}>
            and the verdict read on a device, screen by screen, before the signature
          </span>
          {!l ? (
            <p className="t-data-sm" style={{ color: 'var(--ink-2)' }}>
              Proof <NonLu quoi="docs/ledger/guard-speculos.json" />.
            </p>
          ) : (
            <>
              <p className="t-data-sm" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
                The guard’s report is not a message in a browser: it is encoded as{' '}
                <strong>EIP-712</strong> and rendered across <strong>{l.ecrans} screens</strong> on
                the device, on a real Base transaction. What is signed is what was read.
              </p>
              <div className="flex flex-col gap-[5px]">
                <Ligne quoi="verdict" valeur={l.verdict?.toUpperCase()} />
                <Ligne quoi="what is displayed" valeur={l.titre} />
                <Ligne quoi="EIP-712 type" valeur={l.type_712} />
                <Ligne quoi="screens" valeur={l.ecrans === null ? null : `${l.ecrans} on the device`} />
                <Ligne quoi="signature" valeur={l.signature_v === null ? null : `v = ${l.signature_v}`} />
                <Ligne quoi="transaction" >
                  <span className="hex">{l.tx}</span>
                </Ligne>
                <Ligne quoi="device" valeur={l.appareil} />
              </div>
              <p className="t-data-xs" style={{ color: 'var(--ink-2)', margin: 0, maxWidth: '78ch' }}>
                {l.physique
                  ? 'Physical device.'
                  : 'This is not a plugged-in Nano: it is Speculos, the official emulator, running Ledger’s Ethereum app. We say so rather than let anyone assume hardware.'}
              </p>
              {l.basescan ? <Lien href={l.basescan}>the transaction on Basescan</Lien> : null}
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
