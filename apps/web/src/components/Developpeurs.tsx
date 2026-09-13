/**
 * LA PAGE DES DÉVELOPPEURS — les surfaces qu’on branche, pas celles qu’on lit.
 *
 * Le site montre le corpus ; cette page montre les DEUX pièces qu’on installe chez soi (le
 * serveur MCP, l’extension) et les DEUX portes réseau (l’API du compte, le péage x402).
 *
 * RÈGLE DE CETTE PAGE : chaque chiffre vient d’un fichier lu, et il est nommé à côté.
 *   - les quatre outils, l’installation et les variables : apps/mcp/README.md
 *   - l’extension : packages/guard/extension/README.md + manifest.json
 *   - les douze routes et les deux authentifications : apps/api/src/compte/router.ts
 *   - le péage : apps/api/src/x402.ts, et src/data/facts.json pour ce qui a été réglé
 *   - les quatorze outils et les cinq accès : src/lib/outils.ts
 * Ce qui n’a pas de source ne s’écrit pas.
 */
import type { ReactNode } from 'react'
import { Panel, Copy, Replay, Lien, Chip } from './Prim'
import { ACCES, outil } from '../lib/outils'
import facts from '../data/facts.json'

const nb = (x: number) => x.toLocaleString('fr')

const MESURES = facts.inventaire.corpus.n
const CORPUS = facts.inventaire.corpus.fichier
const BLOC = 50614000
const X = facts.x402
const G = facts.garde

/* ------------------------------------------------------------------ le grain */

function P({ children }: { children: ReactNode }) {
  return (
    <p
      className="m-0"
      style={{
        fontFamily: 'var(--prose)',
        fontSize: 14,
        lineHeight: 1.6,
        color: 'var(--ink-2)',
        maxWidth: '76ch',
      }}
    >
      {children}
    </p>
  )
}

function F({ children }: { children: ReactNode }) {
  return <strong style={{ color: 'var(--ink)', fontWeight: 600 }}>{children}</strong>
}

function C({ children }: { children: ReactNode }) {
  return (
    <code className="hex t-data-sm" style={{ color: 'var(--ink)' }}>
      {children}
    </code>
  )
}

function Corps({ children }: { children: ReactNode }) {
  return (
    <div
      className="px-[16px] py-[12px] flex flex-col gap-[12px]"
      style={{ borderTop: '1px solid var(--line)' }}
    >
      {children}
    </div>
  )
}

/**
 * UN BLOC À COLLER. Le cadre de `Replay` dit « rejouer cette valeur » — vrai pour une mesure,
 * faux pour une ligne d’installation. Celui-ci porte son propre titre et le même bouton de
 * copie, et il défile tout seul : une ligne de 90 caractères ne doit pas élargir la page.
 */
function Bloc({ titre, code, note }: { titre: string; code: string; note?: ReactNode }) {
  return (
    <div
      style={{
        border: '1px solid var(--line)',
        background: 'var(--bg-2)',
        minWidth: 0,
        maxWidth: '100%',
      }}
    >
      <div
        className="t-label flex items-center justify-between gap-[10px] px-[10px] py-[6px]"
        style={{ borderBottom: '1px solid var(--line)', color: 'var(--ink-2)' }}
      >
        <span>{titre}</span>
        <Copy text={code} />
      </div>
      <pre
        tabIndex={0}
        role="region"
        aria-label={titre}
        className="t-data-sm hex px-[10px] py-[8px] m-0 overflow-x-auto whitespace-pre"
        style={{ color: 'var(--ink-2)' }}
      >
        {code}
      </pre>
      {note && (
        <div className="t-data-xs px-[10px] pb-[8px]" style={{ color: 'var(--ink-2)' }}>
          {note}
        </div>
      )}
    </div>
  )
}

/** Un tableau dense, dans SON propre cadre de défilement : la page, elle, ne défile jamais de côté. */
function Tableau({
  gabarit,
  entetes,
  lignes,
  min = 640,
}: {
  gabarit: string
  entetes: string[]
  lignes: ReactNode[][]
  min?: number
}) {
  return (
    <div className="overflow-x-auto" style={{ borderTop: '1px solid var(--line)' }}>
      <div style={{ minWidth: min }}>
        <div
          className="grid gap-x-[14px] px-[16px] py-[6px]"
          style={{ gridTemplateColumns: gabarit, borderBottom: '1px solid var(--line)' }}
        >
          {entetes.map((e, i) => (
            <span key={i} className="t-label" style={{ color: 'var(--ink-2)' }}>
              {e}
            </span>
          ))}
        </div>
        {lignes.map((l, i) => (
          <div
            key={i}
            className="grid gap-x-[14px] px-[16px] py-[8px] items-baseline"
            style={{
              gridTemplateColumns: gabarit,
              borderTop: i === 0 ? undefined : '1px solid var(--line)',
            }}
          >
            {l.map((c, j) => (
              <div
                key={j}
                className="t-data-sm"
                style={{ color: j === 0 ? 'var(--ink)' : 'var(--ink-2)', lineHeight: 1.5 }}
              >
                {c}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ------------------------------------------------- ce qu’on colle, tel quel */

const CONFIG_CLAUDE = `{
  "mcpServers": {
    "tare": {
      "command": "node",
      "args": ["$TARE/apps/mcp/dist/src/index.js"]
    }
  }
}`

const BUILD_MCP = `cd $TARE/apps/mcp && npm install && npm run build`
const AJOUT_CLAUDE_CODE = `claude mcp add tare -- node $TARE/apps/mcp/dist/src/index.js`
const FORK = `docker compose up -d anvil`
const BUILD_EXT = `cd $TARE/packages/guard && npm run build:extension`

/** La forme exacte que `apps/mcp/src/replay.ts` produit, ici sur la première ligne du corpus. */
const REJEU =
  `cd $TARE && jq 'select(.hook=="0x0469a4bd3724dc86c9542f4694c976da13c450c0" and ` +
  `.pool_id=="0x010d0023c9e072f62720b6627a13973b9505a3d80dccd59acdb2ca803826c538" and ` +
  `.amount_in=="100000000000000" and .zero_for_one==true and .block_number==50614000)' ` +
  `docs/dataset/measurements.jsonl`

/* ----------------------------------------------------------------- la page */

export function DeveloppeursPage() {
  const mcp = ACCES.find((a) => a.cle === 'mcp')
  const ext = ACCES.find((a) => a.cle === 'extension')
  const couverts = (ns: number[]) =>
    ns
      .map((n) => outil(n))
      .filter((o): o is NonNullable<ReturnType<typeof outil>> => Boolean(o))

  return (
    <>
      <header className="px-[16px] pt-[8px] pb-[18px]">
        <div
          className="flex flex-wrap items-center gap-x-[14px] gap-y-[6px] pb-[12px] t-data-sm"
          style={{ color: 'var(--ink-2)' }}
        >
          <span>4 MCP tools</span>
          <span className="meta-filet">1 Manifest V3 extension</span>
          <span className="meta-filet">12 account routes</span>
          <span className="meta-filet">1 paid route</span>
        </div>
        <h1 className="t-headline m-0" style={{ color: 'var(--ink)', maxWidth: '22ch' }}>
          Plugging TARE in somewhere other than this site
        </h1>
        <div className="pt-[14px] flex flex-col gap-[10px]">
          <P>
            Two pieces install on your own machine — <F>the MCP server</F>, for a model, and{' '}
            <F>the extension</F>, for the second that comes before a signature. Both answer{' '}
            <F>offline</F>, from the {nb(MESURES)} committed measurements in <C>{CORPUS}</C>:
            neither one needs a key, an account or our server to return a verdict. Two network
            doors remain, and that is all they are for:{' '}
            <C>/compte</C> for the keys, the packages and the history, <C>POST /measure</C> for
            a fresh measurement paid for by the unit.
          </P>
          <P>
            The repository:{' '}
            <Lien href={facts.depot}>{facts.depot.replace('https://', '')}</Lien>. In every
            command on this page, <C>$TARE</C> is wherever you cloned it —{' '}
            <C>export TARE=$(pwd)</C> once, at the root, and everything pastes as is.
          </P>
        </div>
      </header>

      {/* ------------------------------------------------------------ 1. le MCP */}
      <Panel
        index="dev-mcp"
        title="The MCP server"
        meta={['4 tools', 'stdio', 'optional key']}
      >
        <Corps>
          <P>
            A model asked “how much does this hook take?” <F>invents a plausible
            number</F>. The server gives it four tools whose descriptions say, in so many
            words, never to state a number the tool did not return. The model chooses what to
            ask; it produces no value of its own. Every answer publishes the file actually
            read, its sha256 and its line count under <C>provenance</C>, and the
            command that replays it cites <F>that same file</F>.
          </P>
        </Corps>

        <Tableau
          gabarit="minmax(150px,190px) minmax(220px,1fr) minmax(150px,190px)"
          entetes={['tool', 'the question it answers', 'does it need the fork?']}
          lignes={[
            [
              <C>tare_measure</C>,
              <>
                this hook, on <F>that</F> swap, at this size — how much does it take? Arguments:{' '}
                <C>hook, pool, size, direction, block?</C>
              </>,
              'only for a swap missing from the corpus',
            ],
            [
              <C>tare_lookup</C>,
              'everything already recorded on this hook, row by row, with its label',
              'no',
            ],
            [
              <C>tare_impact</C>,
              'the reach: which pools, which tokens, and what share is actually measured',
              'no',
            ],
            [
              <C>tare_twins</C>,
              'same bytecode, same declared permissions, same hand',
              'only for bytecode twins',
            ],
          ]}
        />

        <Corps>
          <P>
            <F>The four labels are never raised</F> — an answer that has no number does not
            get one later:
          </P>
          <div className="flex flex-wrap gap-[8px]">
            <Chip title="the value was measured">MEASURED</Chip>
            <Chip title="interpolated between two measured sizes, with both bounds cited">
              INTERPOLATED
            </Chip>
            <Chip title="nothing to cite, and the reason is stated">NOT_MEASURABLE</Chip>
            <Chip title="the pool could not be quoted">NOT_QUOTABLE</Chip>
          </div>
          <P>
            The resolution order of <C>tare_measure</C>: the exact row in the corpus, then the
            API if it answers, then <F>the live counterfactual against the pinned fork</F> —{' '}
            <C>anvil_setCode</C> replaces the hook’s bytecode with an 89-byte inert stub,
            the address does not move, so <C>poolId</C>, liquidity and <C>slot0</C> stay
            identical to the bit, and the same swap is quoted twice. The gap <F>is</F>{' '}
            what the hook took. If the fork’s head is not the requested block, the answer is{' '}
            <C>NOT_MEASURABLE</C> with <C>fork_block_mismatch</C> — never a number stamped
            with a block where it was not taken.
          </P>
        </Corps>

        <Corps>
          <Bloc titre="1. build the server" code={BUILD_MCP} />
          <Bloc
            titre="2. Claude Desktop — claude_desktop_config.json"
            code={CONFIG_CLAUDE}
            note={
              <>
                macOS:{' '}
                <C>~/Library/Application Support/Claude/claude_desktop_config.json</C> · Windows:{' '}
                <C>%APPDATA%\Claude\claude_desktop_config.json</C>. Restart Claude Desktop
                afterwards.
              </>
            }
          />
          <Bloc
            titre="2b. Claude Code — the same thing in one line"
            code={AJOUT_CLAUDE_CODE}
          />
          <Bloc
            titre="optional — to measure swaps missing from the corpus"
            code={FORK}
            note={<>the fork pinned at block {nb(BLOC)}; without it, everything else still answers</>}
          />
        </Corps>

        <Corps>
          <P>
            <F>
              <C>TARE_CLE_API</C> is optional.
            </F>{' '}
            Without it, the server sends <F>nothing at all</F>: the tools read the committed
            corpus and the local fork, they need no one. With a key scoped to{' '}
            <C>mcp</C>, generated from your account, every call is logged to your
            history — the logging never delays an answer and never makes a call
            fail.
          </P>
        </Corps>

        <Tableau
          min={560}
          gabarit="minmax(170px,220px) minmax(120px,170px) minmax(200px,1fr)"
          entetes={['variable', 'default', 'what it does']}
          lignes={[
            [<C>TARE_RPC_URL</C>, <C>http://127.0.0.1:8545</C>, 'the pinned fork'],
            [
              <C>TARE_API_URL</C>,
              <C>http://127.0.0.1:8787</C>,
              'the API; its absence is reported, never hidden',
            ],
            [<C>TARE_BLOCK</C>, <C>{String(BLOC)}</C>, 'the block where the corpus was taken'],
            [<C>TARE_LIVE</C>, <C>1</C>, <><C>0</C> forbids the server from touching the fork</>],
            [
              <C>TARE_HOOK_UNIVERSE</C>,
              <C>docs/hooks-universe.json</C>,
              'the extra addresses tare_twins will probe',
            ],
            [
              <C>TARE_CLE_API</C>,
              'none',
              'the only one that talks to the network, and only for the history',
            ],
          ]}
        />

        <Corps>
          <Replay
            cmd={REJEU}
            note={`the exact shape apps/mcp/src/replay.ts produces, here on the first row of ${CORPUS}; the server itself puts the absolute path of your own copy in it.`}
          />
          {mcp && (
            <P>
              This access covers {mcp.outils.length} of the fourteen tools in the catalog:{' '}
              {couverts(mcp.outils).map((o, i) => (
                <span key={o.n}>
                  {i > 0 ? ', ' : ''}
                  {o.n} · {o.nom}
                </span>
              ))}
              . Requires: {mcp.prerequis}.
            </P>
          )}
        </Corps>
      </Panel>

      {/* ------------------------------------------------------ 2. l’extension */}
      <Panel
        index="dev-extension"
        title="The browser extension"
        meta={['Manifest V3', 'no network request', 'no key']}
      >
        <Corps>
          <P>
            The right moment to know what a hook takes is not while you are searching: it is{' '}
            <F>three seconds before signing</F>, on the site where you swap. The extension
            installs at <C>document_start</C>, in the page’s world (<C>world: "MAIN"</C>),{' '}
            <F>before any wallet has published <C>window.ethereum</C></F> — in the isolated
            world it would see nothing, and at <C>document_idle</C> it would arrive too late. It
            covers three doors: a provider already present, a provider assigned later
            (through an accessor that <F>preserves the setter</F>, so no wallet breaks), and
            EIP-6963 announcements.
          </P>
          <P>
            It intercepts <C>eth_sendTransaction</C> <F>and nothing else</F>: signature
            requests and chain switches pass through untouched — a guard that diverts more
            than it should is a guard nobody keeps. On a transaction, it reads the{' '}
            <C>PoolKey</C> from the Universal Router calldata (<C>{G.universal_router}</C>,
            chain {G.chain_id}), and shows what that hook took at that size, the block where it
            was measured, and the replay command. {G.transactions_reelles} real Base transactions
            serve as templates for its tests (<C>{facts.sources.garde}</C>).
          </P>
          <P>
            <F>It does not invent:</F> a pool that has not been measured returns <C>unknown</C>, and{' '}
            <C>unknown</C> never becomes <C>ok</C>.
          </P>
        </Corps>

        <Corps>
          <Bloc
            titre="1. build the injected script"
            code={BUILD_EXT}
            note={
              <>
                bundles <C>src/browser.ts</C> into <C>extension/inject.js</C>
              </>
            }
          />
          <P>
            <F>2. Load it:</F> <C>chrome://extensions</C> → <F>developer mode</F> →{' '}
            <F>Load unpacked</F> → the <C>packages/guard/extension</C> folder.
          </P>
          <P>
            The <C>icons</C> entry in the manifest is not decorative: Chrome{' '}
            <F>refuses to load</F> an extension whose declared icon is missing (“Could not load
            icon 'icon128.png' specified in 'icons'”). The folder shipped without it until
            September 9, 2026 — so the extension was not installable, and that is the kind of
            defect no green test suite catches, since no test loads a browser
            extension.
          </P>
        </Corps>

        <Tableau
          min={520}
          gabarit="minmax(150px,200px) minmax(220px,1fr)"
          entetes={['manifest', 'what it declares']}
          lignes={[
            [<C>manifest_version</C>, '3'],
            [<C>permissions</C>, <C>storage</C>],
            [
              <C>content_scripts</C>,
              <>
                <C>inject.js</C> at <C>document_start</C> in the <C>MAIN</C> world, <C>pont.js</C> at{' '}
                <C>document_start</C> in the <C>ISOLATED</C> world, in every frame
              </>,
            ],
            [
              <C>web_accessible_resources</C>,
              <>
                <C>table.json</C> — the measurement table, read from the page, with no request
              </>,
            ],
            [<C>options_ui</C>, <><C>options.html</C>, opened in a tab</>],
            [<C>background</C>, <><C>worker.js</C>, module</>],
          ]}
        />

        <Corps>
          <P>
            <F>It works without a key.</F> The analysis is local: the table lives in its service
            worker and answers with no request at all — so the extension returns its verdict even
            when our server is off. The <C>extension</C>-scoped API key only serves to log its
            verdicts to the account history, and if the subscription has expired, the API returns{' '}
            <C>402</C> telling it to <F>carry on without logging</F> — not to stop.
          </P>
          {ext && <P>Requires: {ext.prerequis}.</P>}
        </Corps>
      </Panel>

      {/* ------------------------------------------------------------- 3. l’API */}
      <Panel
        index="dev-api"
        title="The account API"
        meta={['12 routes', 'two authentications', 'never mixed']}
      >
        <Corps>
          <P>
            Two authentications, and they never cross. The{' '}
            <F>session token</F> (<C>authorization: Bearer</C>) belongs to a human in front of a
            browser: it opens reading the account and managing the keys. The{' '}
            <F>API key</F> (<C>x-tare-cle</C>) belongs to a machine: it opens writing
            to the log, <F>and nothing else</F>.{' '}
            <F>A key can never create another key</F> — no route allows it,
            and no route reads a key back in clear: a secret you
            can read back is no longer a secret.
          </P>
        </Corps>

        <Tableau
          min={700}
          gabarit="minmax(190px,240px) minmax(130px,170px) minmax(220px,1fr)"
          entetes={['route', 'authentication', 'what it returns']}
          lignes={[
            [
              <C>POST /compte/nonce</C>,
              <Chip>none</Chip>,
              'a nonce and the exact TEXT to sign — the client does not rebuild it. Expires in 300 s',
            ],
            [
              <C>POST /compte/session</C>,
              <Chip>none</Chip>,
              <>
                <C>{'{adresse, nonce, signature}'}</C> verified → a session token, returned only
                once (the database keeps only its sha256), 7 days
              </>,
            ],
            [<C>DELETE /compte/session</C>, <Chip>Bearer</Chip>, 'signing out'],
            [
              <C>GET /compte</C>,
              <Chip>Bearer</Chip>,
              'the account, its subscription, its keys (never in clear) and its counters',
            ],
            [
              <C>POST /compte/cle</C>,
              <Chip>Bearer</Chip>,
              <>
                a key scoped to <C>extension</C> or <C>mcp</C>. The secret is returned{' '}
                <F>once</F>. <C>402</C> if the subscription is not active
              </>,
            ],
            [<C>DELETE /compte/cle/:id</C>, <Chip>Bearer</Chip>, 'the key, revoked'],
            [
              <C>POST /compte/abonnement</C>,
              <Chip>Bearer</Chip>,
              'the expiry READ on-chain, never taken on trust; 402 as long as it is not active',
            ],
            [
              <C>GET /compte/paquets</C>,
              <Chip>Bearer</Chip>,
              'what the two packages contain — size, version, sha256 — without downloading them',
            ],
            [
              <C>GET /compte/extension.zip</C>,
              <>
                <Chip>Bearer</Chip> <Chip>active subscription</Chip>
              </>,
              <>
                the packaged extension, with its sha256 in a header (<C>x-tare-sha256</C>) so you
                can check it without trusting us again
              </>,
            ],
            [
              <C>GET /compte/mcp.tgz</C>,
              <>
                <Chip>Bearer</Chip> <Chip>active subscription</Chip>
              </>,
              <>
                the MCP server, packaged by <C>npm pack</C>
              </>,
            ],
            [
              <C>GET /compte/journal</C>,
              <Chip>Bearer</Chip>,
              'the history: analyses, verdicts, replacements. Limit between 1 and 500, 50 by default',
            ],
            [
              <C>POST /compte/journal</C>,
              <Chip>x-tare-cle</Chip>,
              'the extension and the MCP write here. The declared source must match the scope of the key',
            ],
          ]}
        />

        <Corps>
          <P>
            The rule sits in the last row: an extension key that declared itself{' '}
            <C>source: "mcp"</C> is refused, otherwise the history would lie about the origin of
            what it shows. And the subscription is re-read <F>from the database on every call</F>,
            never inferred from the fact that a session exists: without that, a session opened
            during the subscription would outlive it, and the downloads with it.
          </P>
          <P>
            <F>A refusal always states its reason.</F> With no database configured (<C>TARE_PG_DSN</C> or{' '}
            <C>DATABASE_URL</C>), all these routes return <C>503</C> and say so — the rest of
            the API works without it. A package that has not been built returns <C>503</C> carrying
            the exact command, because it is a fault on our side, not a mistake by the caller: a{' '}
            <C>404</C> would send them looking on theirs.
          </P>
        </Corps>
      </Panel>

      {/* -------------------------------------------------------------- 4. x402 */}
      <Panel
        index="dev-x402"
        title="x402 — paying for a measurement without an account"
        meta={['POST /measure', `${X.prix_unite_usd} USDC per measurement`, X.reseau]}
      >
        <Corps>
          <P>
            An agent does not fill in a sign-up form. <C>POST /measure</C> is{' '}
            <F>the only paid route</F>: without payment it returns a <C>402</C> that{' '}
            <F>announces its price before any payment</F>, in a body that names the unit (
            <C>measurement</C>), the model (<C>per-measurement</C>), the unit price, the number
            of units <F>in that particular request</F> and the total. The price is not flat: it is
            computed from the request body, so a request asking for five measurements pays
            five times the unit price.
          </P>
          <P>
            The toll collects <F>before</F> the engine runs: the price is frozen at the{' '}
            <C>402</C>, the money moves at settlement, the label only exists afterwards. A
            non-billable unit already paid for is therefore not free — it becomes a <F>credit</F>:{' '}
            <C>amount_usd</C> says what is owed, <C>amount_settled_usd</C> what was actually
            taken on-chain, <C>credit_usd</C> the gap the service owes. On the header side, x402 v2
            sends <C>PAYMENT-SIGNATURE</C> and v1 <C>X-PAYMENT</C>: both are read.
          </P>
          <P>
            The settlement is not taken on trust: it is <F>re-read on the Hedera mirror node</F>.
            Network <C>{X.reseau}</C>, facilitator <Lien href={X.facilitateur}>{X.facilitateur}</Lien>
            , token <C>{X.jeton}</C>, payee <C>{X.encaisseur}</C>.{' '}
            <C>GET /usage</C> and <C>GET /usage/hcs</C> return what was counted and what was
            anchored.
          </P>
        </Corps>

        <Tableau
          min={620}
          gabarit="minmax(100px,120px) minmax(110px,140px) minmax(110px,150px) minmax(90px,110px) minmax(120px,1fr)"
          entetes={['settled on', 'amount', 'key that signed', 'latency', 'on the mirror node']}
          lignes={X.lignes.map((l) => [
            l.ts.slice(0, 10),
            `${(Number(l.montant) / 1e6).toFixed(6)} USDC`,
            l.cle === 'ledger-keyring' ? 'sealed inside a Ledger' : 'environment variable',
            `${nb(l.latence_ms)} ms`,
            <>
              <Lien href={l.hashscan}>{l.transaction}</Lien> · {l.statut}
            </>,
          ])}
        />

        <Corps>
          <P>
            {nb(X.regles)} payments settled, {nb(X.vus)} re-read on the mirror node,{' '}
            {nb(X.par_keyring)} of them signed by a key <F>sealed inside a Ledger</F>. Source:{' '}
            <C>{facts.sources.x402}</C>. And the agent that answers has an{' '}
            <F>{facts.agent.standard}</F> identity published on a topic —{' '}
            <Lien href={facts.agent.hashscan}>{facts.agent.topic}</Lien> — recomputable from six
            fields: the caller can check <F>who</F> it is calling before paying.
          </P>
        </Corps>
      </Panel>
    </>
  )
}
