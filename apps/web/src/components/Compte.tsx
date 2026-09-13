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
import {
  API,
  CONTRAT_ABONNEMENT,
  CHAINE_ABONNEMENT,
  Refus,
  connecter,
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
        quoi="l’API du compte"
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
  analyse: 'analyse',
  verdict: 'verdict',
  substitution: 'substitution',
  mesure: 'mesure',
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
        {e.sujet ?? <NonLu quoi="sujet" />}
      </td>
      <td className="t-data-xs px-[10px] py-[6px] text-right" style={{ color: 'var(--ink)', whiteSpace: 'nowrap' }}>
        {/* Un bps absent n'est pas un zero : c'est une ligne qui n'en portait pas. */}
        {bps === null ? <NonLu quoi="prelevement" /> : `${bps.toFixed(2)} bps`}
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
    { mcpServers: { tare: { command: 'node', args: ['<chemin-du-depot>/apps/mcp/dist/src/index.js'] } } },
    null,
    2,
  )
  return (
    <>
      <div
        className="px-[16px] py-[10px]"
        style={{ borderTop: '1px solid var(--line-strong)', background: 'var(--surface-1)' }}
      >
        <span className="t-label" style={{ color: 'var(--ink-2)' }}>ce que le compte ouvre</span>
      </div>

      <L
        k="cle « extension »"
        v={
          <>
            pour que l'extension depose ses verdicts dans ton historique.{' '}
            <strong style={{ color: 'var(--ink)' }}>Facultative</strong> : sans elle l'extension
            marche, hors ligne, sans une requete — la table des mesures vit dans son service worker.
          </>
        }
      />
      <L
        k="cle « mcp »"
        v={
          <>
            pour que le serveur MCP depose ses appels dans ton historique.{' '}
            <strong style={{ color: 'var(--ink)' }}>Facultative</strong> aussi : sans elle il repond
            depuis les mesures commitees et n'envoie rien a personne.
          </>
        }
      />
      <L
        k="ce qu'une cle NE peut pas"
        v={
          <>
            en creer une autre. Une cle s'authentifie par{' '}
            <code style={{ fontFamily: 'var(--mono)' }}>x-tare-cle</code> et n'ouvre que l'ecriture
            au journal ; la gestion des cles demande une session de portefeuille. Les deux
            authentifications ne se melangent jamais.
          </>
        }
      />
      <L
        k="la cle n'est rendue qu'une fois"
        v="la base n'en detient que le sha256. Une cle relisible n'est plus un secret."
      />

      <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-label" style={{ color: 'var(--ink-2)' }}>installer l'extension</div>
        <div className="t-data-xs mt-[5px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '78ch' }}>
          Telecharge <code style={{ fontFamily: 'var(--mono)' }}>extension.zip</code> (abonnement
          actif requis), decompresse, puis <code style={{ fontFamily: 'var(--mono)' }}>chrome://extensions</code>{' '}
          → mode developpeur → <strong style={{ color: 'var(--ink)' }}>Load unpacked</strong> → le
          dossier. La cle d'API se regle dans sa page d'options, et elle est facultative.
        </div>
      </div>

      <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)' }}>
        <div className="t-label" style={{ color: 'var(--ink-2)' }}>brancher le serveur MCP</div>
        <div className="t-data-xs mt-[5px] mb-[7px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '78ch' }}>
          Dans Claude Desktop, ajoute ceci a{' '}
          <code style={{ fontFamily: 'var(--mono)' }}>claude_desktop_config.json</code> et redemarre.
          Ses quatre outils : <code style={{ fontFamily: 'var(--mono)' }}>tare_measure</code>,{' '}
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
          <Copy text={conf} label="copier la configuration" />
          <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
            Claude Code, en une ligne :{' '}
            <code style={{ fontFamily: 'var(--mono)' }}>
              claude mcp add tare -- node &lt;chemin&gt;/apps/mcp/dist/src/index.js
            </code>
          </span>
        </div>
        <div className="t-data-xs mt-[7px]" style={{ color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: '78ch' }}>
          Les deux paquets s'installent aussi depuis le depot, sans compte ni abonnement :{' '}
          <a href={depot} style={{ color: 'var(--ink)' }}>{depot.replace('https://', '')}</a>. Le
          compte ne fabrique aucune mesure — il ouvre des surfaces.
        </div>
      </div>
    </>
  )
}

export function ComptePanel() {
  const [session, setSession] = useState<Session | null>(() => sessionGardee())
  const [portefeuilles, setPortefeuilles] = useState<PortefeuilleAnnonce[]>([])
  const [choisi, setChoisi] = useState<PortefeuilleAnnonce | null>(null)
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
      setOccupe('lecture du compte')
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

  const seConnecter = async () => {
    if (!choisi) return
    setOccupe('signature dans le portefeuille')
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
    setOccupe('lecture du prix sur la chaine')
    try {
      setPrix(await lirePrixAbonnement(choisi.provider))
    } finally {
      setOccupe(null)
    }
  }

  const payer = async () => {
    if (!choisi || !session || !prix || 'raison' in prix) return
    setOccupe('paiement dans le portefeuille')
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
          `transaction envoyee (${hash.slice(0, 18)}…). Elle n'est pas encore incluse : ` +
            "clique « relire l'abonnement » quand elle l'est. Le site ne dira « abonne » que " +
            'quand le contrat le dira.',
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
    setOccupe("relecture de l'abonnement sur la chaine")
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
    setOccupe(`creation d'une cle ${portee}`)
    try {
      const r = await creerCle(session.jeton, portee, portee === 'extension' ? 'navigateur' : 'agent')
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
    setOccupe('revocation')
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
      title="Le compte"
      right={
        <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
          {absente
            ? 'aucune API publiee'
            : session
              ? `${session.adresse.slice(0, 6)}…${session.adresse.slice(-4)}`
              : 'un portefeuille, une signature, aucun mot de passe'}
        </span>
      }
    >
      <p
        className="m-0 px-[16px] py-[12px]"
        style={{ fontFamily: 'var(--prose)', fontSize: 15, lineHeight: 1.6, maxWidth: '78ch', color: 'var(--ink-2)' }}
      >
        C'est la <strong style={{ color: 'var(--ink)' }}>seule</strong> partie de cet instrument qui
        demande un serveur et un portefeuille. Tout le reste — le verdict, la table, la courbe, les
        diodes — vient du paquet, sans une requete. Ici on signe un message, on lit son abonnement{' '}
        <strong style={{ color: 'var(--ink)' }}>sur la chaine</strong>, on genere une cle d'API pour
        l'extension ou le MCP, et on retrouve l'historique de ce qu'ils ont fait.
      </p>

      <CeQueLeCompteOuvre depot="https://github.com/JeanBaptisteDurand/ETH_Online_2026" />

      {absente && (
        <Dire
          r={
            new Refus(
              'api_absente',
              "aucune API n'est publiee pour cette version du site : le compte demande un serveur, " +
                "et il n'y en a pas a joindre depuis ici. Ce n'est pas une panne.",
            )
          }
        />
      )}

      {!absente && !session && (
        <>
          <L k="api" v={API} />
          {portefeuilles.length === 0 ? (
            <div className="px-[16px] py-[11px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              aucun portefeuille annonce. Installe MetaMask ou Rainbow, puis recharge — la
              detection passe par EIP-6963, parce qu'avec deux portefeuilles installes{' '}
              <code style={{ fontFamily: 'var(--mono)' }}>window.ethereum</code> n'en montre qu'un et
              cache l'autre.
            </div>
          ) : (
            <>
              <L
                k="portefeuille"
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
                  signer pour entrer
                </Bouton>
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  {occupe ?? 'le texte signe est celui que le serveur rend — le client ne le reconstruit pas'}
                </span>
              </div>
            </>
          )}
        </>
      )}

      {refus && <Dire r={refus} />}

      {compte && (
        <>
          <L k="adresse" v={compte.compte.adresse} />
          <L k="vu le" v={compte.compte.vu_le.slice(0, 19).replace('T', ' ')} />

          {/* ------------------------------------------------------- l'abonnement */}
          <div className="px-[16px] pt-[13px] pb-[6px] t-label" style={{ borderTop: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}>
            l'abonnement, lu sur la chaine
          </div>
          <L
            k="etat"
            v={
              <span style={{ color: ab?.actif ? 'var(--ink)' : 'var(--m-3)' }}>
                {ab?.actif ? 'actif' : 'inactif'}
                {ab?.raison && <span style={{ color: 'var(--ink-2)' }}> — {ab.raison}</span>}
              </span>
            }
          />
          {ab?.actif_jusqu_au && <L k="jusqu'au" v={ab.actif_jusqu_au.slice(0, 19).replace('T', ' ')} />}
          <L
            k="contrat"
            v={
              ab?.contrat ?? CONTRAT_ABONNEMENT ?? (
                <NonLu quoi="TARE_ABONNEMENT_CONTRAT / VITE_ABONNEMENT_CONTRAT" />
              )
            }
            titre={`chaine ${ab?.chain_id ?? CHAINE_ABONNEMENT}`}
          />
          <div className="px-[16px] py-[11px] flex flex-wrap items-center gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
            <Bouton onClick={relire} actif={!occupe}>
              relire l'abonnement
            </Bouton>
            {!ab?.actif && CONTRAT_ABONNEMENT && (
              <>
                <Bouton onClick={demanderPrix} actif={!occupe && Boolean(choisi)}>
                  lire le prix
                </Bouton>
                {prix && 'prixWei' in prix && (
                  <>
                    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                      {(Number(prix.prixWei) / 1e18).toFixed(4)} ETH pour{' '}
                      {(Number(prix.dureeS) / 86400).toFixed(0)} jours
                    </span>
                    <Bouton onClick={payer} actif={!occupe} fort>
                      payer
                    </Bouton>
                  </>
                )}
                {prix && 'raison' in prix && (
                  <span className="t-data-xs" style={{ color: 'var(--m-3)' }}>{prix.raison}</span>
                )}
              </>
            )}
            <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {occupe ?? "le site ne dit « abonne » que quand le contrat le dit"}
            </span>
          </div>

          {/* ------------------------------------------------------------ les cles */}
          <div className="px-[16px] pt-[13px] pb-[6px] t-label" style={{ borderTop: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}>
            les cles d'API — une par surface
          </div>
          {cleNeuve && (
            <div className="px-[16px] py-[11px]" style={{ borderTop: '1px solid var(--line)', background: 'var(--bg-2)' }}>
              <div className="t-label" style={{ color: 'var(--m-5)' }}>
                note-la maintenant · portee {cleNeuve.portee}
              </div>
              <div className="t-data-xs mt-[6px]" style={{ color: 'var(--ink)', wordBreak: 'break-all' }}>
                {cleNeuve.cle}
              </div>
              <div className="mt-[8px] flex items-center gap-[10px]">
                <Copy text={cleNeuve.cle} label="copier la cle" />
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  elle n'est rendue qu'une fois : la base n'en detient que le sha256, et aucune route
                  ne la relit. Perdue, elle se revoque et se recree.
                </span>
              </div>
            </div>
          )}
          {compte.cles.length === 0 ? (
            <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              aucune cle. L'extension et le MCP fonctionnent sans — ils analysent hors ligne ; une
              cle ne sert qu'a deposer leurs actions dans l'historique ci-dessous.
            </div>
          ) : (
            compte.cles.map((c) => (
              <div key={c.id} className="px-[16px] py-[7px] flex items-baseline gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
                <span className="t-label" style={{ color: 'var(--ink-2)', minWidth: 78 }}>{c.portee}</span>
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>{c.prefixe}…</span>
                <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                  {c.nom || '—'} · creee {c.cree_le.slice(0, 10)}
                  {c.vue_le ? ` · vue ${c.vue_le.slice(0, 10)}` : ' · jamais utilisee'}
                </span>
                <span className="ml-auto">
                  {c.revoquee_le ? (
                    <span className="t-label" style={{ color: 'var(--ink-2)' }}>revoquee</span>
                  ) : (
                    <Bouton onClick={() => revoquer(c.id)} actif={!occupe}>revoquer</Bouton>
                  )}
                </span>
              </div>
            ))
          )}
          <div className="px-[16px] py-[11px] flex flex-wrap items-center gap-[10px]" style={{ borderTop: '1px solid var(--line)' }}>
            <Bouton onClick={() => nouvelleCle('extension')} actif={!occupe && Boolean(ab?.actif)}>
              une cle pour l'extension
            </Bouton>
            <Bouton onClick={() => nouvelleCle('mcp')} actif={!occupe && Boolean(ab?.actif)}>
              une cle pour le MCP
            </Bouton>
            {!ab?.actif && (
              <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
                une cle ne sert a rien sans abonnement : le serveur refuse de la delivrer plutot que
                de la faire echouer plus tard
              </span>
            )}
          </div>

          {/* --------------------------------------------------- les telechargements */}
          <div className="px-[16px] pt-[13px] pb-[6px] t-label" style={{ borderTop: '1px solid var(--line-strong)', color: 'var(--ink-2)' }}>
            les deux surfaces, a telecharger
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
                      {p.nom} · {((p.octets ?? 0) / 1024).toFixed(0)} Ko · v{p.version ?? '?'}
                    </span>
                    <span className="t-data-xs" style={{ color: 'var(--ink-2)' }} title={p.sha256}>
                      sha256 {p.sha256?.slice(0, 12)}…
                    </span>
                    <span className="ml-auto flex items-center gap-[8px]">
                      {p.sha256 && <Copy text={p.sha256} label="copier le sha256" />}
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
                              setOccupe(`telechargement de ${quoi}`)
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
                          telecharger
                        </a>
                      ) : (
                        <span className="t-label" style={{ color: 'var(--ink-2)' }}>ferme</span>
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
            l'historique — ce que l'extension, le MCP et ce site ont fait
          </div>
          {journal === null ? (
            <div className="px-[16px] py-[9px]" style={{ borderTop: '1px solid var(--line)' }}>
              <NonLu quoi="/compte/journal" />
            </div>
          ) : journal.length === 0 ? (
            <div className="px-[16px] py-[9px] t-data-xs" style={{ borderTop: '1px solid var(--line)', color: 'var(--ink-2)' }}>
              rien encore. L'extension y depose ses verdicts si tu lui donnes une cle ; sans cle elle
              fonctionne pareil et n'envoie rien.
            </div>
          ) : (
            <div tabIndex={0} role="region" aria-label="historique du compte" style={{ overflowX: 'auto', borderTop: '1px solid var(--line)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['quand', 'ou', 'quoi', 'sujet', 'prelevement'].map((h, i) => (
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
              rafraichir
            </Bouton>
            <Bouton onClick={seDeconnecter} actif={!occupe}>
              se deconnecter
            </Bouton>
            <span className="t-data-xs" style={{ color: 'var(--ink-2)' }}>
              {occupe ?? "le jeton vit dans sessionStorage : il s'efface a la fermeture de l'onglet"}
            </span>
          </div>
        </>
      )}
    </Panel>
  )
}
