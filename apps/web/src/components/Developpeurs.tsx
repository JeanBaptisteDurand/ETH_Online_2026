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
          <span>4 outils MCP</span>
          <span className="meta-filet">1 extension Manifest V3</span>
          <span className="meta-filet">12 routes de compte</span>
          <span className="meta-filet">1 route payante</span>
        </div>
        <h1 className="t-headline m-0" style={{ color: 'var(--ink)', maxWidth: '22ch' }}>
          Brancher TARE ailleurs que sur ce site
        </h1>
        <div className="pt-[14px] flex flex-col gap-[10px]">
          <P>
            Deux pièces s’installent chez vous — <F>le serveur MCP</F>, pour un modèle, et{' '}
            <F>l’extension</F>, pour la seconde qui précède une signature. Les deux répondent{' '}
            <F>hors ligne</F>, depuis les {nb(MESURES)} mesures commitées de <C>{CORPUS}</C> :
            ni l’une ni l’autre n’a besoin d’une clé, d’un compte ou de notre serveur pour
            rendre un verdict. Deux portes réseau restent, et elles ne servent qu’à ça :{' '}
            <C>/compte</C> pour les clés, les paquets et l’historique, <C>POST /measure</C> pour
            une mesure neuve payée à l’unité.
          </P>
          <P>
            Le dépôt :{' '}
            <Lien href={facts.depot}>{facts.depot.replace('https://', '')}</Lien>. Dans toutes
            les commandes de cette page, <C>$TARE</C> est l’endroit où vous l’avez cloné —{' '}
            <C>export TARE=$(pwd)</C> une fois, à la racine, et tout se colle tel quel.
          </P>
        </div>
      </header>

      {/* ------------------------------------------------------------ 1. le MCP */}
      <Panel
        index="dev-mcp"
        title="Le serveur MCP"
        meta={['4 outils', 'stdio', 'clé facultative']}
      >
        <Corps>
          <P>
            Un modèle à qui on demande « ce hook prend combien ? » <F>invente un nombre
            plausible</F>. Le serveur lui donne quatre outils dont les descriptions disent, en
            toutes lettres, de ne jamais énoncer un chiffre que l’outil n’a pas rendu. Le modèle
            choisit quoi demander ; il ne produit aucune valeur. Chaque réponse publie le fichier
            réellement lu, son sha256 et son nombre de lignes sous <C>provenance</C>, et la
            commande qui la rejoue cite <F>ce même fichier</F>.
          </P>
        </Corps>

        <Tableau
          gabarit="minmax(150px,190px) minmax(220px,1fr) minmax(150px,190px)"
          entetes={['outil', 'la question à laquelle il répond', 'a-t-il besoin du fork ?']}
          lignes={[
            [
              <C>tare_measure</C>,
              <>
                ce hook, sur <F>ce</F> swap-là, à cette taille — combien prend-il ? Arguments :{' '}
                <C>hook, pool, size, direction, block?</C>
              </>,
              'seulement pour un swap absent du corpus',
            ],
            [
              <C>tare_lookup</C>,
              'tout ce qui est déjà enregistré sur ce hook, ligne par ligne, avec son étiquette',
              'non',
            ],
            [
              <C>tare_impact</C>,
              'le rayon d’action : quels pools, quels jetons, et quelle part est réellement mesurée',
              'non',
            ],
            [
              <C>tare_twins</C>,
              'même bytecode, mêmes permissions déclarées, même main',
              'seulement pour les jumeaux de bytecode',
            ],
          ]}
        />

        <Corps>
          <P>
            <F>Les quatre étiquettes ne sont jamais relevées</F> — une réponse qui n’a pas de
            chiffre n’en reçoit pas plus tard :
          </P>
          <div className="flex flex-wrap gap-[8px]">
            <Chip title="la valeur a été mesurée">MEASURED</Chip>
            <Chip title="interpolée entre deux tailles mesurées, les deux bornes étant citées">
              INTERPOLATED
            </Chip>
            <Chip title="rien à citer, et la raison est dite">NOT_MEASURABLE</Chip>
            <Chip title="le pool n’a pas pu être coté">NOT_QUOTABLE</Chip>
          </div>
          <P>
            L’ordre de résolution de <C>tare_measure</C> : la ligne exacte du corpus, puis l’API
            si elle répond, puis <F>la contrefactuelle en direct contre le fork épinglé</F> —{' '}
            <C>anvil_setCode</C> remplace le bytecode du hook par un talon inerte de 89 octets,
            l’adresse ne bouge pas, donc <C>poolId</C>, liquidité et <C>slot0</C> restent
            identiques au bit près, et le même swap est coté deux fois. La différence <F>est</F>{' '}
            ce que le hook a pris. Si la tête du fork n’est pas le bloc demandé, la réponse est{' '}
            <C>NOT_MEASURABLE</C> avec <C>fork_block_mismatch</C> — jamais un nombre estampillé
            d’un bloc où il n’a pas été pris.
          </P>
        </Corps>

        <Corps>
          <Bloc titre="1. construire le serveur" code={BUILD_MCP} />
          <Bloc
            titre="2. Claude Desktop — claude_desktop_config.json"
            code={CONFIG_CLAUDE}
            note={
              <>
                macOS :{' '}
                <C>~/Library/Application Support/Claude/claude_desktop_config.json</C> · Windows :{' '}
                <C>%APPDATA%\Claude\claude_desktop_config.json</C>. Redémarrer Claude Desktop
                ensuite.
              </>
            }
          />
          <Bloc
            titre="2 bis. Claude Code — la même chose en une ligne"
            code={AJOUT_CLAUDE_CODE}
          />
          <Bloc
            titre="facultatif — pour mesurer des swaps absents du corpus"
            code={FORK}
            note={<>le fork épinglé au bloc {nb(BLOC)} ; sans lui, tout le reste répond quand même</>}
          />
        </Corps>

        <Corps>
          <P>
            <F>
              <C>TARE_CLE_API</C> est facultative.
            </F>{' '}
            Sans elle, le serveur n’envoie <F>rien du tout</F> : les outils lisent le corpus
            commité et le fork local, ils n’ont besoin de personne. Avec une clé de portée{' '}
            <C>mcp</C>, générée depuis votre compte, chaque appel est déposé dans votre
            historique — le dépôt ne retarde jamais une réponse et ne fait jamais échouer un
            appel.
          </P>
        </Corps>

        <Tableau
          min={560}
          gabarit="minmax(170px,220px) minmax(120px,170px) minmax(200px,1fr)"
          entetes={['variable', 'défaut', 'ce qu’elle fait']}
          lignes={[
            [<C>TARE_RPC_URL</C>, <C>http://127.0.0.1:8545</C>, 'le fork épinglé'],
            [
              <C>TARE_API_URL</C>,
              <C>http://127.0.0.1:8787</C>,
              'l’API ; son absence est signalée, jamais masquée',
            ],
            [<C>TARE_BLOCK</C>, <C>{String(BLOC)}</C>, 'le bloc où le corpus a été pris'],
            [<C>TARE_LIVE</C>, <C>1</C>, <><C>0</C> interdit au serveur de toucher au fork</>],
            [
              <C>TARE_HOOK_UNIVERSE</C>,
              <C>docs/hooks-universe.json</C>,
              'les adresses supplémentaires que tare_twins va sonder',
            ],
            [
              <C>TARE_CLE_API</C>,
              'aucun',
              'la seule qui parle au réseau, et seulement pour l’historique',
            ],
          ]}
        />

        <Corps>
          <Replay
            cmd={REJEU}
            note={`la forme exacte que produit apps/mcp/src/replay.ts, ici sur la première ligne de ${CORPUS} ; le serveur, lui, y met le chemin absolu de votre copie.`}
          />
          {mcp && (
            <P>
              Cet accès couvre {mcp.outils.length} des quatorze outils du catalogue :{' '}
              {couverts(mcp.outils).map((o, i) => (
                <span key={o.n}>
                  {i > 0 ? ', ' : ''}
                  {o.n} · {o.nom}
                </span>
              ))}
              . Prérequis : {mcp.prerequis}.
            </P>
          )}
        </Corps>
      </Panel>

      {/* ------------------------------------------------------ 2. l’extension */}
      <Panel
        index="dev-extension"
        title="L’extension de navigateur"
        meta={['Manifest V3', 'aucune requête réseau', 'sans clé']}
      >
        <Corps>
          <P>
            Le bon moment pour savoir ce qu’un hook prend n’est pas quand on cherche : c’est{' '}
            <F>trois secondes avant de signer</F>, sur le site où on échange. L’extension
            s’installe au <C>document_start</C>, dans le monde de la page (<C>world: "MAIN"</C>),{' '}
            <F>avant qu’un portefeuille ait publié <C>window.ethereum</C></F> — dans le monde
            isolé elle ne verrait rien, et au <C>document_idle</C> elle arriverait après. Elle
            couvre trois portes : un fournisseur déjà présent, un fournisseur assigné plus tard
            (par un accesseur qui <F>préserve le setter</F>, donc aucun portefeuille ne casse), et
            les annonces EIP-6963.
          </P>
          <P>
            Elle intercepte <C>eth_sendTransaction</C> <F>et rien d’autre</F> : les demandes de
            signature et les changements de chaîne passent intactes — une garde qui détourne plus
            qu’elle ne doit est une garde que personne ne garde. Sur une transaction, elle lit la{' '}
            <C>PoolKey</C> dans le calldata de l’Universal Router (<C>{G.universal_router}</C>,
            chaîne {G.chain_id}), et affiche ce que ce hook a pris à cette taille, le bloc où ça a
            été mesuré, et la commande de rejeu. {G.transactions_reelles} transactions Base réelles
            servent de gabarits à ses tests (<C>{facts.sources.garde}</C>).
          </P>
          <P>
            <F>Elle n’invente pas :</F> un pool qui n’a pas été mesuré rend <C>unknown</C>, et{' '}
            <C>unknown</C> ne devient jamais <C>ok</C>.
          </P>
        </Corps>

        <Corps>
          <Bloc
            titre="1. construire le script injecté"
            code={BUILD_EXT}
            note={
              <>
                empaquette <C>src/browser.ts</C> vers <C>extension/inject.js</C>
              </>
            }
          />
          <P>
            <F>2. Charger :</F> <C>chrome://extensions</C> → <F>mode développeur</F> →{' '}
            <F>Load unpacked</F> → le dossier <C>packages/guard/extension</C>.
          </P>
          <P>
            L’entrée <C>icons</C> du manifeste n’est pas décorative : Chrome{' '}
            <F>refuse de charger</F> une extension dont l’icône déclarée manque (« Could not load
            icon 'icon128.png' specified in 'icons' »). Le dossier a été livré sans elle jusqu’au
            9 septembre 2026 — l’extension était donc non installable, et c’est le défaut qu’aucune
            suite de tests verte n’attrape, puisqu’aucun test ne charge une extension de
            navigateur.
          </P>
        </Corps>

        <Tableau
          min={520}
          gabarit="minmax(150px,200px) minmax(220px,1fr)"
          entetes={['manifeste', 'ce qu’il déclare']}
          lignes={[
            [<C>manifest_version</C>, '3'],
            [<C>permissions</C>, <C>storage</C>],
            [
              <C>content_scripts</C>,
              <>
                <C>inject.js</C> au <C>document_start</C> en monde <C>MAIN</C>, <C>pont.js</C> au{' '}
                <C>document_start</C> en monde <C>ISOLATED</C>, dans tous les cadres
              </>,
            ],
            [
              <C>web_accessible_resources</C>,
              <>
                <C>table.json</C> — la table des mesures, lue depuis la page, sans requête
              </>,
            ],
            [<C>options_ui</C>, <><C>options.html</C>, ouverte dans un onglet</>],
            [<C>background</C>, <><C>worker.js</C>, module</>],
          ]}
        />

        <Corps>
          <P>
            <F>Elle marche sans clé.</F> L’analyse est locale : la table vit dans son service
            worker et répond sans aucune requête — donc l’extension rend son verdict même si notre
            serveur est éteint. La clé d’API de portée <C>extension</C> ne sert qu’à déposer ses
            verdicts dans l’historique du compte, et si l’abonnement a expiré, l’API répond{' '}
            <C>402</C> en disant de <F>continuer sans journaliser</F> — pas de s’arrêter.
          </P>
          {ext && <P>Prérequis : {ext.prerequis}.</P>}
        </Corps>
      </Panel>

      {/* ------------------------------------------------------------- 3. l’API */}
      <Panel
        index="dev-api"
        title="L’API du compte"
        meta={['12 routes', 'deux authentifications', 'jamais mélangées']}
      >
        <Corps>
          <P>
            Deux authentifications, et elles ne se croisent jamais. Le{' '}
            <F>jeton de session</F> (<C>authorization: Bearer</C>) appartient à un humain devant un
            navigateur : il ouvre la lecture du compte et la gestion des clés. La{' '}
            <F>clé d’API</F> (<C>x-tare-cle</C>) appartient à une machine : elle ouvre l’écriture
            au journal, <F>et rien d’autre</F>.{' '}
            <F>Une clé ne peut jamais en créer une autre</F> — il n’existe aucune route qui
            l’autorise, et il n’existe aucune route qui relise une clé en clair : un secret qu’on
            peut relire n’est plus un secret.
          </P>
        </Corps>

        <Tableau
          min={700}
          gabarit="minmax(190px,240px) minmax(130px,170px) minmax(220px,1fr)"
          entetes={['route', 'authentification', 'ce qu’elle rend']}
          lignes={[
            [
              <C>POST /compte/nonce</C>,
              <Chip>aucune</Chip>,
              'un nonce et le TEXTE exact à signer — le client ne le reconstruit pas. Expire en 300 s',
            ],
            [
              <C>POST /compte/session</C>,
              <Chip>aucune</Chip>,
              <>
                <C>{'{adresse, nonce, signature}'}</C> vérifiée → un jeton de session, rendu une
                seule fois (la base n’en garde que le sha256), 7 jours
              </>,
            ],
            [<C>DELETE /compte/session</C>, <Chip>Bearer</Chip>, 'la déconnexion'],
            [
              <C>GET /compte</C>,
              <Chip>Bearer</Chip>,
              'le compte, son abonnement, ses clés (jamais en clair) et ses compteurs',
            ],
            [
              <C>POST /compte/cle</C>,
              <Chip>Bearer</Chip>,
              <>
                une clé de portée <C>extension</C> ou <C>mcp</C>. Le secret est rendu{' '}
                <F>une fois</F>. <C>402</C> si l’abonnement n’est pas actif
              </>,
            ],
            [<C>DELETE /compte/cle/:id</C>, <Chip>Bearer</Chip>, 'la clé, révoquée'],
            [
              <C>POST /compte/abonnement</C>,
              <Chip>Bearer</Chip>,
              'l’échéance LUE sur la chaîne, jamais crue sur parole ; 402 tant qu’elle n’est pas active',
            ],
            [
              <C>GET /compte/paquets</C>,
              <Chip>Bearer</Chip>,
              'ce que contiennent les deux paquets — taille, version, sha256 — sans les télécharger',
            ],
            [
              <C>GET /compte/extension.zip</C>,
              <>
                <Chip>Bearer</Chip> <Chip>abonnement actif</Chip>
              </>,
              <>
                l’extension empaquetée, avec son sha256 en en-tête (<C>x-tare-sha256</C>) pour la
                vérifier sans nous refaire confiance
              </>,
            ],
            [
              <C>GET /compte/mcp.tgz</C>,
              <>
                <Chip>Bearer</Chip> <Chip>abonnement actif</Chip>
              </>,
              <>
                le serveur MCP, empaqueté par <C>npm pack</C>
              </>,
            ],
            [
              <C>GET /compte/journal</C>,
              <Chip>Bearer</Chip>,
              'l’historique : analyses, verdicts, substitutions. Limite entre 1 et 500, 50 par défaut',
            ],
            [
              <C>POST /compte/journal</C>,
              <Chip>x-tare-cle</Chip>,
              'l’extension et le MCP y déposent. La source déclarée doit correspondre à la portée de la clé',
            ],
          ]}
        />

        <Corps>
          <P>
            La règle tient dans la dernière ligne : une clé d’extension qui se déclarerait{' '}
            <C>source: "mcp"</C> est refusée, sinon l’historique mentirait sur l’origine de ce
            qu’il montre. Et l’abonnement est relu <F>en base à chaque appel</F>, pas déduit du
            fait qu’une session existe : sans ça, une session ouverte pendant l’abonnement lui
            survivrait, et les téléchargements avec elle.
          </P>
          <P>
            <F>Un refus dit toujours sa raison.</F> Sans base configurée (<C>TARE_PG_DSN</C> ou{' '}
            <C>DATABASE_URL</C>), toutes ces routes rendent <C>503</C> et le disent — le reste de
            l’API fonctionne sans. Un paquet non construit rend <C>503</C> portant la commande
            exacte, parce que c’est un défaut de notre côté, pas une erreur de l’appelant : un{' '}
            <C>404</C> l’enverrait chercher chez lui.
          </P>
        </Corps>
      </Panel>

      {/* -------------------------------------------------------------- 4. x402 */}
      <Panel
        index="dev-x402"
        title="x402 — payer une mesure sans compte"
        meta={['POST /measure', `${X.prix_unite_usd} USDC par mesure`, X.reseau]}
      >
        <Corps>
          <P>
            Un agent ne remplit pas un formulaire d’inscription. <C>POST /measure</C> est{' '}
            <F>la seule route payante</F> : sans paiement elle rend un <C>402</C> qui{' '}
            <F>annonce son prix avant tout paiement</F>, dans un corps qui nomme l’unité (
            <C>measurement</C>), le modèle (<C>per-measurement</C>), le prix unitaire, le nombre
            d’unités <F>de cette requête-là</F> et le total. Le prix n’est pas plat : il est
            calculé sur le corps de la requête, donc une requête qui demande cinq mesures paie
            cinq fois le prix unitaire.
          </P>
          <P>
            Le péage encaisse <F>avant</F> que le moteur ne tourne : le prix est figé au{' '}
            <C>402</C>, l’argent bouge au règlement, l’étiquette n’existe qu’après. Une unité non
            facturable déjà payée n’est donc pas gratuite — elle devient un <F>crédit</F> :{' '}
            <C>amount_usd</C> dit ce qui est dû, <C>amount_settled_usd</C> ce qui a réellement été
            prélevé on-chain, <C>credit_usd</C> l’écart que le service doit. Côté en-têtes, x402 v2
            envoie <C>PAYMENT-SIGNATURE</C> et v1 <C>X-PAYMENT</C> : les deux sont lus.
          </P>
          <P>
            Le règlement n’est pas cru sur parole : il est <F>relu sur le mirror node Hedera</F>.
            Réseau <C>{X.reseau}</C>, facilitateur <Lien href={X.facilitateur}>{X.facilitateur}</Lien>
            , jeton <C>{X.jeton}</C>, encaisseur <C>{X.encaisseur}</C>.{' '}
            <C>GET /usage</C> et <C>GET /usage/hcs</C> rendent ce qui a été compté et ce qui a été
            ancré.
          </P>
        </Corps>

        <Tableau
          min={620}
          gabarit="minmax(100px,120px) minmax(110px,140px) minmax(110px,150px) minmax(90px,110px) minmax(120px,1fr)"
          entetes={['réglé le', 'montant', 'clé qui a signé', 'latence', 'sur le mirror node']}
          lignes={X.lignes.map((l) => [
            l.ts.slice(0, 10),
            `${(Number(l.montant) / 1e6).toFixed(6)} USDC`,
            l.cle === 'ledger-keyring' ? 'scellée dans un Ledger' : 'variable d’environnement',
            `${nb(l.latence_ms)} ms`,
            <>
              <Lien href={l.hashscan}>{l.transaction}</Lien> · {l.statut}
            </>,
          ])}
        />

        <Corps>
          <P>
            {nb(X.regles)} règlements réglés, {nb(X.vus)} relus sur le mirror node, dont{' '}
            {nb(X.par_keyring)} signés par une clé <F>scellée dans un Ledger</F>. Source :{' '}
            <C>{facts.sources.x402}</C>. Et l’agent qui répond a une identité{' '}
            <F>{facts.agent.standard}</F> publiée sur un topic —{' '}
            <Lien href={facts.agent.hashscan}>{facts.agent.topic}</Lien> — recalculable depuis six
            champs : l’appelant peut vérifier <F>qui</F> il appelle avant de payer.
          </P>
        </Corps>
      </Panel>
    </>
  )
}
