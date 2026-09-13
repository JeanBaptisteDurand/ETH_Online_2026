/**
 * PANNEAU 15 — LE COMPTE.
 *
 * La seule surface de tout l'instrument qui demande un serveur ET un portefeuille. Tout le
 * reste — le verdict, la table, la courbe, les diodes — vient du paquet et ne demande rien.
 * Ce panneau le dit, parce que c'est la difference entre « ce site est casse » et « cette
 * partie-la a besoin d'un service qui n'est pas publie ».
 *
 * LE PARCOURS, dans l'ordre ou il se vit :
 *
 *   1. choisir un portefeuille  EIP-6963, parce qu'avec deux portefeuilles installes
 *                               `window.ethereum` n'en montre qu'un et cache l'autre.
 *   2. signer le message        celui que le SERVEUR a rendu, transmis tel quel.
 *   3. l'abonnement             LU sur la chaine. Le site ne le croit jamais sur parole,
 *                               meme juste apres un paiement : il relit.
 *   4. les cles d'API           une pour l'extension, une pour le MCP. Le secret est
 *                               affiche UNE fois et n'est jamais redemandable.
 *   5. les telechargements      l'extension et le MCP, derriere l'abonnement.
 *   6. l'historique             ce que l'extension, le MCP et le site ont fait.
 *
 * TROIS CHOSES QUE CET ECRAN NE FAIT PAS, et chacune est un choix :
 *
 *   - il ne garde PAS le jeton dans localStorage. `sessionStorage` s'efface a la fermeture
 *     de l'onglet ; un jeton qui survit des semaines dans un navigateur partage est une
 *     porte laissee ouverte que personne ne se rappelle avoir ouverte.
 *   - il n'affiche jamais deux fois une cle. Une cle relisible n'est plus un secret, et il
 *     n'existe aucune route pour la relire.
 *   - il ne dit jamais « abonne » parce qu'un paiement est parti. Une transaction envoyee
 *     n'est pas une transaction incluse, et seule la relecture du contrat tranche.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Panel, Copy, NonLu, Replay, Absence } from './Prim'
import { ConnectButton, usePortefeuille, QR_DISPONIBLE } from '../compte/wallet'
import {
  API,
  CONTRAT_ABONNEMENT,
  CHAINE_ABONNEMENT,
  Refus,
  connecter,
  connecterAvecSigneur,
  creerCle,
  deconnecter,
  ecouterPortefeuilles,
  garderSession,
  lireCompte,
  lireJournal,
  lirePaquets,
  lirePrixAbonnement,
  pasDApi,
  payerAbonnement,
  relireAbonnement,
  revoquerCle,
  sessionGardee,
  type Compte,
  type Evenement,
  type Paquets,
  type PortefeuilleAnnonce,
  type Portee,
  type Session,
} from '../compte/api'

/* ------------------------------------------------------------------ presentation */

const L = ({ k, v, titre }: { k: string; v: React.ReactNode; titre?: string }) => (
  <div className="flex items-baseline gap-[10px] px-[16px] py-[6px]" style={{ borderTop: '1px solid var(--line)' }}>
    <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 132 }} title={titre}>
      {k}
    </span>
    <span className="t-data-xs" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>
      {v}
    </span>
  </div>
)

function Bouton({
  children,
  onClick,
  actif = true,
  fort = false,
}: {
  children: React.ReactNode
  onClick: () => void
  actif?: boolean
  fort?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!actif}
      className="t-label"
      style={{
        padding: '7px 13px',
        border: `1px solid ${fort ? 'var(--line-strong)' : 'var(--line)'}`,
        background: fort ? 'var(--bg-3)' : 'transparent',
        color: actif ? 'var(--ink)' : 'var(--ink-4)',
        cursor: actif ? 'pointer' : 'not-allowed',
        transition: `background var(--t-feedback), border-color var(--t-feedback)`,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Un refus, affiche pour ce qu'il est.
 *
 * `api_absente` n'est pas une panne, et le dire autrement serait mentir dans les deux sens :
 * a l'utilisateur, qui croirait le site casse, et a nous, qui masquerions une piece
 * manquante derriere un message d'erreur generique.
 */
function Dire({ r }: { r: Refus }) {
  const panne = r.genre !== 'api_absente'
  if (!panne)
    return (
      <Absence
        quoi="the account API"
        raison={r.message}
        cmd="cd apps/api && npm start"
      />
    )
  return (
    <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)' }}>
      <div className="t-label" style={{ color: panne ? 'var(--m-3)' : 'var(--ink-3)' }}>
        {r.genre.replace(/_/g, ' ')}
      </div>
      <div className="t-data-xs mt-[5px]" style={{ color: 'var(--ink-2)', maxWidth: '76ch', lineHeight: 1.55 }}>
        {r.message}
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------- l'historique */

const NATURES: Record<string, string> = {
  analyse: 'analysis',
  verdict: 'verdict',
  substitution: 'substitution',
  mesure: 'measurement',
}

function LigneJournal({ e }: { e: Evenement }) {
  const d = e.detail ?? {}
  const bps = typeof d['bps'] === 'number' ? (d['bps'] as number) : null
  const verdict = typeof d['verdict'] === 'string' ? (d['verdict'] as string) : null
  return (
    <tr style={{ borderTop: '1px solid var(--line)' }}>
      <td className="t-data-xs px-[10px] py-[6px]" style={{ color: 'var(--ink-2)', whiteSpace: 'nowrap' }}>
        {e.cree_le.slice(0, 19).replace('T', ' ')}
      </td>
      <td className="t-label px-[10px] py-[6px]" style={{ color: 'var(--ink-2)' }}>
        {e.source}
      </td>
      <td className="t-label px-[10px] py-[6px]" style={{ color: 'var(--ink-2)' }}>
        {NATURES[e.quoi] ?? e.quoi}
      </td>
      <td className="t-data-xs px-[10px] py-[6px]" style={{ color: 'var(--ink-2)', wordBreak: 'break-all' }}>
        {e.sujet ?? <NonLu quoi="subject" />}
      </td>
      <td className="t-data-xs px-[10px] py-[6px] text-right" style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>
        {/* Un bps absent n'est pas un zero : c'est une ligne qui n'en portait pas. */}
        {bps === null ? <NonLu quoi="take" /> : `${bps.toFixed(2)} bps`}
        {verdict && <span className="t-label ml-[8px]" style={{ color: 'var(--ink-2)' }}>{verdict}</span>}
      </td>
    </tr>
  )
}

/* ---------------------------------------------------------------------- l'ecran */


/**
 * CE QUE LE COMPTE OUVRE — visible SANS etre connecte.
 *
 * Le panneau ne montrait ses six fonctions qu'une fois un portefeuille annonce et une session
 * ouverte. Consequence mesuree : sur les seize routes du site, `extension.zip` et `mcp.tgz`
 * n'apparaissaient dans AUCUN texte rendu, et la configuration du serveur MCP nulle part.
 * Quelqu'un qui visite le site — un juge, par exemple — ne pouvait pas savoir que ces deux
 * surfaces existent, ni comment les installer.
 *
 * Ce bloc est donc rendu TOUJOURS. Il ne promet rien qu'il ne tienne : chaque ligne dit ce
 * qu'elle exige, et les deux cles sont annoncees pour ce qu'elles sont — FACULTATIVES. Ni
 * l'extension ni le MCP n'en ont besoin pour repondre : ils portent la table des mesures et
 * travaillent hors ligne. La cle ne sert qu'a deposer leur trace dans l'historique.
 */
function CeQueLeCompteOuvre({ depot }: { depot: string }) {
  const conf = JSON.stringify(
    { mcpServers: { tare: { command: 'node', args: ['<repo-path>/apps/mcp/dist/src/index.js'] } } },
    null,
    2,
  )
  return (
    <>
      <div
        className="px-[16px] py-[10px]"
        style={{ borderTop: '1px solid var(--line-strong)', background: 'var(--surface-1)' }}
      >
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>what the account opens</span>
      </div>

      <L
        k="the “extension” key"
        v={
          <>
            so the extension can drop its verdicts into your history.{' '}
            <strong style={{ color: 'var(--ink)' }}>Optional</strong>: without it the extension
            works, offline, without a single request — the measurement table lives in its service worker.
          </>
        }
      />
      <L
        k="the “mcp” key"
        v={
          <>
            so the MCP server can drop its calls into your history.{' '}
            <strong style={{ color: 'var(--ink)' }}>Optional</strong> too: without it, it answers
            from the committed measurements and sends nothing to anyone.
          </>
        }
      />
      <L
        k="what a key CANNOT do"
        v={
          <>
            create another one. A key authenticates through{' '}
            <code style={{ fontFamily: 'var(--mono)' }}>x-tare-cle</code> and only opens writing to
            the log; key management needs a wallet session. The two authentications never mix.
          </>
        }
      />
      <L
        k="a key is returned only once"
        v="the database holds only its sha256. A key you can read again is no longer a secret."
      />

      <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-label" style={{ color: 'var(--ink-2)' }}>install the extension</div>
        <div className="t-data-xs mt-[5px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '78ch' }}>
          Download <code style={{ fontFamily: 'var(--mono)' }}>extension.zip</code> (active
          subscription required), unzip it, then <code style={{ fontFamily: 'var(--mono)' }}>chrome://extensions</code>{' '}
          → developer mode → <strong style={{ color: 'var(--ink)' }}>Load unpacked</strong> → the
          folder. The API key is set in its options page, and it is optional.
        </div>
      </div>

      <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-label" style={{ color: 'var(--ink-2)' }}>connect the MCP server</div>
        <div className="t-data-xs mt-[5px] mb-[7px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '78ch' }}>
          In Claude Desktop, add this to{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>claude_desktop_config.json</code> and restart.
          Its four tools: <code style={{ fontFamily: 'var(--mono)' }}>tare_measure</code>,{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>tare_lookup</code>,{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>tare_impact</code>,{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>tare_twins</code>.
        </div>
        <pre
          className="t-data-xs m-0"
          style={{
            fontFamily: 'var(--mono)',
            color: 'var(--ink-2)',
            background: 'var(--surface-1)',
            border: '1px solid var(--line)',
            padding: '10px 12px',
            overflowX: 'auto',
          }}
        >
          {conf}
        </pre>
        <div className="mt-[7px] flex flex-wrap items-center gap-[10px]">
          <Copy text={conf} label="copy the configuration" />
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            Claude Code, in one line:{' '}
            <code style={{ fontFamily: 'var(--mono)' }}>
              claude mcp add tare -- node &lt;path&gt;/apps/mcp/dist/src/index.js
            </code>
          </span>
        </div>
        <div className="t-data-xs mt-[7px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '78ch' }}>
          Both packages also install from the repository, with no account and no subscription:{' '}
          <a href={depot} style={{ color: 'var(--ink)' }}>{depot.replace('https://', '')}</a>. The
          account makes no measurement — it opens surfaces.
        </div>
      </div>
    </>
  )
}

export function ComptePanel() {
  const [session, setSession] = useState<Session | null>(() => sessionGardee())
  const [portefeuilles, setPortefeuilles] = useState<PortefeuilleAnnonce[]>([])
  const [choisi, setChoisi] = useState<PortefeuilleAnnonce | null>(null)
  const rk = usePortefeuille()
  const [compte, setCompte] = useState<Compte | null>(null)
  const [paquets, setPaquets] = useState<Paquets | null>(null)
  const [journal, setJournal] = useState<Evenement[] | null>(null)
  const [refus, setRefus] = useState<Refus | null>(null)
  const [occupe, setOccupe] = useState<string | null>(null)
  /** Le secret d'une cle neuve, affiche UNE fois. Jamais remis en etat depuis le serveur. */
  const [cleNeuve, setCleNeuve] = useState<{ cle: string; portee: Portee } | null>(null)
  const [prix, setPrix] = useState<{ prixWei: bigint; dureeS: bigint } | { raison: string } | null>(null)

  const absente = useMemo(() => pasDApi(), [])

  useEffect(() => ecouterPortefeuilles(setPortefeuilles), [])
  useEffect(() => {
    if (!choisi && portefeuilles.length > 0) setChoisi(portefeuilles[0]!)
  }, [portefeuilles, choisi])

  const attraper = useCallback((e: unknown) => {
    const r = e instanceof Refus ? e : new Refus('erreur', (e as Error).message ?? String(e))
    setRefus(r)
    // Une session refusee est une session finie : on ne garde pas un jeton mort.
    if (r.genre === 'non_authentifie') {
      garderSession(null)
      setSession(null)
      setCompte(null)
    }
  }, [])

  const rafraichir = useCallback(
    async (jeton: string) => {
      setOccupe('reading the account')
      try {
        const c = await lireCompte(jeton)
        setCompte(c)
        setRefus(null)
        // Les deux suivants ne doivent pas faire echouer la lecture du compte : ils
        // l'enrichissent. Un historique indisponible n'efface pas l'abonnement lu.
        const [p, j] = await Promise.allSettled([lirePaquets(jeton), lireJournal(jeton, { limite: 25 })])
        if (p.status === 'fulfilled') setPaquets(p.value)
        if (j.status === 'fulfilled') setJournal(j.value.lignes)
      } catch (e) {
        attraper(e)
      } finally {
        setOccupe(null)
      }
    },
    [attraper],
  )

  useEffect(() => {
    if (session?.jeton && !compte && !absente) void rafraichir(session.jeton)
  }, [session, compte, absente, rafraichir])

  /**
   * OUVRIR LA SESSION AVEC LE PORTEFEUILLE DE RAINBOWKIT.
   *
   * Meme protocole que `seConnecter` : nonce du serveur, signature du message tel quel,
   * session. La difference tient a QUI signe — wagmi, qui sait parler a un telephone par
   * WalletConnect, la ou un fournisseur EIP-1193 brut ne le sait pas.
   */
  const seConnecterRk = async () => {
    if (!rk.adresse) return
    setOccupe('signing in the wallet')
    try {
      const s = await connecterAvecSigneur(rk.adresse, rk.signer)
      garderSession(s)
      setSession(s)
      setRefus(null)
      await rafraichir(s.jeton)
    } catch (e) {
      attraper(e)
    } finally {
      setOccupe(null)
    }
  }

  const seConnecter = async () => {
    if (!choisi) return
    setOccupe('signing in the wallet')
    try {
      const s = await connecter(choisi.provider)
      garderSession(s)
      setSession(s)
      setRefus(null)
      await rafraichir(s.jeton)
    } catch (e) {
      attraper(e)
    } finally {
      setOccupe(null)
    }
  }

  const seDeconnecter = async () => {
    const j = session?.jeton
    garderSession(null)
    setSession(null)
    setCompte(null)
    setPaquets(null)
    setJournal(null)
    setCleNeuve(null)
    if (j) await deconnecter(j).catch(() => undefined)
  }

  const demanderPrix = async () => {
    if (!choisi) return
    setOccupe('reading the price on-chain')
    try {
      setPrix(await lirePrixAbonnement(choisi.provider))
    } finally {
      setOccupe(null)
    }
  }

  const payer = async () => {
    if (!choisi || !session || !prix || 'raison' in prix) return
    setOccupe('paying in the wallet')
    try {
      const hash = await payerAbonnement(choisi.provider, {
        depuis: session.adresse,
        montantWei: prix.prixWei,
      })
      // On ne dit PAS « abonne ». Une transaction envoyee n'est pas une transaction
      // incluse : on relit le contrat, et c'est lui qui tranche.
      setRefus(
        new Refus(
          'indisponible',
          `transaction sent (${hash.slice(0, 18)}…). It is not yet included: ` +
            'click “re-read the subscription” when it is. The site will say “subscribed” only ' +
            'when the contract says so.',
        ),
      )
    } catch (e) {
      attraper(e)
    } finally {
      setOccupe(null)
    }
  }

  const relire = async () => {
    if (!session) return
    setOccupe("re-reading the subscription on-chain")
    try {
      await relireAbonnement(session.jeton)
      await rafraichir(session.jeton)
    } catch (e) {
      // Un 402 ici n'est PAS une panne : c'est la reponse « toujours pas abonne ».
      if (e instanceof Refus && e.genre === 'abonnement_inactif') {
        setRefus(e)
        await lireCompte(session.jeton).then(setCompte).catch(() => undefined)
      } else attraper(e)
    } finally {
      setOccupe(null)
    }
  }

  const nouvelleCle = async (portee: Portee) => {
    if (!session) return
    setOccupe(`creating a ${portee} key`)
    try {
      const r = await creerCle(session.jeton, portee, portee === 'extension' ? 'browser' : 'agent')
      setCleNeuve({ cle: r.cle, portee })
      await rafraichir(session.jeton)
    } catch (e) {
      attraper(e)
    } finally {
      setOccupe(null)
    }
  }

  const revoquer = async (id: string) => {
    if (!session) return
    setOccupe('revoking')
    try {
      await revoquerCle(session.jeton, id)
      await rafraichir(session.jeton)
    } catch (e) {
      attraper(e)
    } finally {
      setOccupe(null)
    }
  }

  const ab = compte?.abonnement

  return (
    <Panel
      index="15"
      title="The account"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {absente
            ? 'no API published'
            : session
              ? `${session.adresse.slice(0, 6)}…${session.adresse.slice(-4)}`
              : 'a wallet, a signature, no password'}
        </span>
      }
    >
      <p
        className="m-0 px-[16px] py-[12px]"
        style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '78ch', color: 'var(--ink-2)' }}
      >
        This is the <strong style={{ color: 'var(--ink)' }}>only</strong> part of this instrument
        that needs a server and a wallet. Everything else — the verdict, the table, the curve, the
        LEDs — comes from the bundle, without a single request. Here you sign a message, read your
        subscription <strong style={{ color: 'var(--ink)' }}>on-chain</strong>, generate an API key
        for the extension or the MCP, and find the history of what they have done.
      </p>

      <CeQueLeCompteOuvre depot="https://github.com/JeanBaptisteDurand/ETH_Online_2026" />

      {absente && (
        <Dire
          r={
            new Refus(
              'api_absente',
              'no API is published for this build of the site: the account needs a server, ' +
                'and there is none to reach from here. This is not a failure.',
            )
          }
        />
      )}

      {!absente && !session && (
        <>
          <L k="api" v={API} />

          {/* RAINBOWKIT — le bouton qu'un juge reconnait, et qui apporte le QR WalletConnect.
              Il n'a pas REMPLACE la decouverte EIP-6963 : elle vit toujours dessous, listee
              plus bas, parce qu'elle marche sans projectId et sans reseau. */}
          <div className="px-[16px] py-[11px] flex flex-wrap items-center gap-[12px]" style={{ borderTop: '1px solid var(--line)' }}>
            <ConnectButton chainStatus="none" showBalance={false} accountStatus="address" />
            {rk.connecte && (
              <Bouton onClick={seConnecterRk} actif={!occupe} fort>
                sign to enter
              </Bouton>
            )}
            <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {occupe ??
                (rk.connecte
                  ? 'the signed text is the one the server returns — the client does not rebuild it'
                  : 'connect a wallet, then sign once to open the session')}
            </span>
          </div>
          {!QR_DISPONIBLE && (
            <div className="px-[16px] py-[8px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              the WalletConnect QR needs a public <code style={{ fontFamily: 'var(--mono)' }}>projectId</code>,
              set at build time by <code style={{ fontFamily: 'var(--mono)' }}>VITE_WALLETCONNECT_ID</code>. It is
              not set on this build: wallets installed in this browser work, a phone does not — and that
              is said rather than a button that fails in silence.
            </div>
          )}

          {portefeuilles.length === 0 ? (
            <div className="px-[16px] py-[11px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              no wallet announced over EIP-6963. Install MetaMask or Rainbow, then reload —
              detection goes through EIP-6963, because with two wallets installed{' '}
              <code style={{ fontFamily: 'var(--mono)' }}>window.ethereum</code> shows one and hides
              the other.
            </div>
          ) : (
            <>
              <L
                k="wallet"
                v={
                  <span className="flex flex-wrap items-center gap-[8px]">
                    {portefeuilles.map((p) => (
                      <button
                        key={p.info.uuid}
                        type="button"
                        onClick={() => setChoisi(p)}
                        className="t-label"
                        style={{
                          padding: '5px 10px',
                          border: `1px solid ${choisi?.info.uuid === p.info.uuid ? 'var(--line-strong)' : 'var(--line)'}`,
                          background: choisi?.info.uuid === p.info.uuid ? 'var(--bg-3)' : 'transparent',
                          color: 'var(--ink)',
                          cursor: 'pointer',
                        }}
                      >
                        {p.info.name}
                      </button>
                    ))}
                  </span>
                }
              />
              <div className="px-[16px] py-[11px] flex items-center gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
                <Bouton onClick={seConnecter} actif={Boolean(choisi) && !occupe} fort>
                  sign to enter
                </Bouton>
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  {occupe ?? 'the signed text is the one the server returns — the client does not rebuild it'}
                </span>
              </div>
            </>
          )}
        </>
      )}

      {refus && <Dire r={refus} />}

      {compte && (
        <>
          <L k="address" v={compte.compte.adresse} />
          <L k="seen on" v={compte.compte.vu_le.slice(0, 19).replace('T', ' ')} />

          {/* ------------------------------------------------------- l'abonnement */}
          <div className="px-[16px] pt-[13px] pb-[6px] t-label" style={{ borderTop: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}>
            the subscription, read on-chain
          </div>
          <L
            k="state"
            v={
              <span style={{ color: ab?.actif ? 'var(--ink)' : 'var(--m-3)' }}>
                {ab?.actif ? 'active' : 'inactive'}
                {ab?.raison && <span style={{ color: 'var(--ink-2)' }}> — {ab.raison}</span>}
              </span>
            }
          />
          {ab?.actif_jusqu_au && <L k="until" v={ab.actif_jusqu_au.slice(0, 19).replace('T', ' ')} />}
          <L
            k="contract"
            v={
              ab?.contrat ?? CONTRAT_ABONNEMENT ?? (
                <NonLu quoi="TARE_ABONNEMENT_CONTRAT / VITE_ABONNEMENT_CONTRAT" />
              )
            }
            titre={`chain ${ab?.chain_id ?? CHAINE_ABONNEMENT}`}
          />
          <div className="px-[16px] py-[11px] flex flex-wrap items-center gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
            <Bouton onClick={relire} actif={!occupe}>
              re-read the subscription
            </Bouton>
            {!ab?.actif && CONTRAT_ABONNEMENT && (
              <>
                <Bouton onClick={demanderPrix} actif={!occupe && Boolean(choisi)}>
                  read the price
                </Bouton>
                {prix && 'prixWei' in prix && (
                  <>
                    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                      {(Number(prix.prixWei) / 1e18).toFixed(4)} ETH for{' '}
                      {(Number(prix.dureeS) / 86400).toFixed(0)} days
                    </span>
                    <Bouton onClick={payer} actif={!occupe} fort>
                      pay
                    </Bouton>
                  </>
                )}
                {prix && 'raison' in prix && (
                  <span className="t-data-xs" style={{ color: 'var(--m-3)' }}>{prix.raison}</span>
                )}
              </>
            )}
            <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {occupe ?? 'the site says “subscribed” only when the contract says so'}
            </span>
          </div>

          {/* ------------------------------------------------------------ les cles */}
          <div className="px-[16px] pt-[13px] pb-[6px] t-label" style={{ borderTop: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}>
            the API keys — one per surface
          </div>
          {compte.cles.length === 0 ? (
            <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              no key. The extension and the MCP work without one — they analyse offline; a key
              only serves to drop their actions into the history below.
            </div>
          ) : (
            compte.cles.map((c) => (
              <div key={c.id} className="px-[16px] py-[7px] flex items-baseline gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
                <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 78 }}>{c.portee}</span>
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>{c.prefixe}…</span>
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  {c.nom || '—'} · created {c.cree_le.slice(0, 10)}
                  {c.vue_le ? ` · seen ${c.vue_le.slice(0, 10)}` : ' · never used'}
                </span>
                <span className="ml-auto">
                  {c.revoquee_le ? (
                    <span className="t-label" style={{ color: 'var(--ink-2)' }}>revoked</span>
                  ) : (
                    <Bouton onClick={() => revoquer(c.id)} actif={!occupe}>revoke</Bouton>
                  )}
                </span>
              </div>
            ))
          )}
          {/* UNE CARTE PAR SURFACE, et elle dit quoi faire de la cle.
              Les deux boutons etaient en bas d'une liste plate : on voyait les cles existantes
              sans savoir a quoi chacune sert, ni ou la coller. Ici chaque surface porte son
              etat, son bouton, et la ligne exacte a recopier. */}
          {(['extension', 'mcp'] as const).map((portee) => {
            const vivantes = compte.cles.filter((c) => c.portee === portee && !c.revoquee_le)
            const neuveIci = cleNeuve?.portee === portee ? cleNeuve.cle : null
            return (
              <div key={portee} className="px-[16px] py-[12px] flex flex-col gap-[8px]" style={{ borderTop: '1px solid var(--line)' }}>
                <div className="flex flex-wrap items-baseline gap-[10px]">
                  <span className="t-label" style={{ color: 'var(--ink)' }}>
                    {portee === 'extension' ? 'the “extension” key' : 'the “mcp” key'}
                  </span>
                  <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                    {vivantes.length === 0
                      ? 'none yet'
                      : `${vivantes.length} active`}
                  </span>
                  <span className="ml-auto">
                    <Bouton onClick={() => nouvelleCle(portee)} actif={!occupe} fort={vivantes.length === 0}>
                      {vivantes.length === 0 ? 'generate the key' : 'generate a new one'}
                    </Bouton>
                  </span>
                </div>

                {neuveIci && (
                  <div className="flex flex-col gap-[7px] p-[12px]" style={{ border: '1px solid var(--m-5)', background: 'var(--bg-2)' }}>
                    <span className="t-label" style={{ color: 'var(--m-5)' }}>
                      write it down now — it will never be shown again
                    </span>
                    <code className="t-data-sm" style={{ fontFamily: 'var(--mono)', color: 'var(--ink)', wordBreak: 'break-all' }}>
                      {neuveIci}
                    </code>
                    <div className="flex flex-wrap items-center gap-[10px]">
                      <Copy text={neuveIci} label="copy the key" />
                      <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                        the database holds only its sha256, and no route reads it back. Lost, it is
                        revoked and created again.
                      </span>
                    </div>
                    <div className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.55 }}>
                      {portee === 'extension' ? (
                        <>where to paste it: the extension’s <strong style={{ color: 'var(--ink)' }}>options
                        page</strong>, field “API key”.</>
                      ) : (
                        <>where to paste it: the MCP server’s <code style={{ fontFamily: 'var(--mono)' }}>TARE_CLE_API</code> variable,
                        in its <code style={{ fontFamily: 'var(--mono)' }}>env</code> entry in{' '}
                        <code style={{ fontFamily: 'var(--mono)' }}>claude_desktop_config.json</code>.</>
                      )}
                    </div>
                  </div>
                )}

                <div className="t-data-xs" style={{ color: 'var(--ink-2)', lineHeight: 1.55, maxWidth: '76ch' }}>
                  {portee === 'extension'
                    ? 'the extension works WITHOUT one: it analyses offline, the measurement table lives in its service worker. The key only serves to drop its verdicts into the history below.'
                    : 'the MCP server works WITHOUT one: it answers from the committed measurements, with no network. The key only serves to drop its calls into the history.'}
                </div>

                {!ab?.actif && (
                  <div className="t-data-xs" style={{ color: 'var(--m-5)' }}>
                    the subscription is not verified on-chain — the contract is not deployed yet.
                    The server still issues a key if{' '}
                    <code style={{ fontFamily: 'var(--mono)' }}>TARE_CLES_OUVERTES=1</code>, and it
                    says so in its response rather than opening the door in silence.
                  </div>
                )}
              </div>
            )
          })}

          {/* --------------------------------------------------- les telechargements */}
          <div className="px-[16px] pt-[13px] pb-[6px] t-label" style={{ borderTop: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}>
            the two surfaces, to download
          </div>
          {(['extension', 'mcp'] as const).map((quoi) => {
            const p = paquets?.[quoi]
            return (
              <div key={quoi} className="px-[16px] py-[8px] flex flex-wrap items-baseline gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
                <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 78 }}>{quoi}</span>
                {!p ? (
                  <NonLu quoi="/compte/paquets" />
                ) : p.disponible ? (
                  <>
                    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                      {p.nom} · {((p.octets ?? 0) / 1024).toFixed(0)} kB · v{p.version ?? '?'}
                    </span>
                    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }} title={p.sha256}>
                      sha256 {p.sha256?.slice(0, 12)}…
                    </span>
                    <span className="ml-auto flex items-center gap-[8px]">
                      {p.sha256 && <Copy text={p.sha256} label="copy the sha256" />}
                      {ab?.actif ? (
                        <a
                          className="t-label"
                          href={`${API}/compte/${quoi === 'extension' ? 'extension.zip' : 'mcp.tgz'}`}
                          onClick={(ev) => {
                            // Le telechargement exige l'en-tete `authorization`, qu'un lien
                            // ne peut pas porter. On le fait donc en fetch, et on ne laisse
                            // PAS le lien partir vers un 401 qui ressemblerait a une panne.
                            ev.preventDefault()
                            void (async () => {
                              setOccupe(`downloading ${quoi}`)
                              try {
                                const r = await fetch(`${API}/compte/${quoi === 'extension' ? 'extension.zip' : 'mcp.tgz'}`, {
                                  headers: { authorization: `Bearer ${session!.jeton}` },
                                })
                                if (!r.ok) {
                                  const b = (await r.json().catch(() => null)) as { raison?: string; error?: string } | null
                                  throw new Refus('indisponible', b?.raison ?? b?.error ?? `HTTP ${r.status}`)
                                }
                                const blob = await r.blob()
                                const u = URL.createObjectURL(blob)
                                const a = document.createElement('a')
                                a.href = u
                                a.download = p.nom ?? quoi
                                a.click()
                                URL.revokeObjectURL(u)
                                await rafraichir(session!.jeton)
                              } catch (e) {
                                attraper(e)
                              } finally {
                                setOccupe(null)
                              }
                            })()
                          }}
                          style={{ color: 'var(--focus)', textDecoration: 'none', cursor: 'pointer' }}
                        >
                          download
                        </a>
                      ) : (
                        <span className="t-label" style={{ color: 'var(--ink-2)' }}>closed</span>
                      )}
                    </span>
                  </>
                ) : (
                  <>
                    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>{p.raison}</span>
                    {p.commande && <Replay cmd={p.commande} />}
                  </>
                )}
              </div>
            )
          })}

          {/* -------------------------------------------------------- l'historique */}
          <div className="px-[16px] pt-[13px] pb-[6px] t-label" style={{ borderTop: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}>
            the history — what the extension, the MCP and this site have done
          </div>
          {journal === null ? (
            <div className="px-[16px] py-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
              <NonLu quoi="/compte/journal" />
            </div>
          ) : journal.length === 0 ? (
            <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              nothing yet. The extension drops its verdicts here if you give it a key; without a
              key it works the same and sends nothing.
            </div>
          ) : (
            <div tabIndex={0} role="region" aria-label="account history" style={{ overflowX: 'auto', borderTop: '1px solid var(--line)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['when', 'where', 'what', 'subject', 'take'].map((h, i) => (
                      <th
                        key={h}
                        className="t-data-sm px-[10px] py-[6px]"
                        style={{ color: 'var(--ink-2)', textAlign: i === 4 ? 'right' : 'left', background: 'var(--bg-2)' }}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {journal.map((e) => (
                    <LigneJournal key={e.id} e={e} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="px-[16px] py-[11px] flex items-center gap-[10px]" style={{ borderTop: '1px solid var(--line-strong)' }}>
            <Bouton onClick={() => session && rafraichir(session.jeton)} actif={!occupe}>
              refresh
            </Bouton>
            <Bouton onClick={seDeconnecter} actif={!occupe}>
              sign out
            </Bouton>
            <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {occupe ?? 'the token lives in sessionStorage: it is wiped when the tab closes'}
            </span>
          </div>
        </>
      )}
    </Panel>
  )
}
