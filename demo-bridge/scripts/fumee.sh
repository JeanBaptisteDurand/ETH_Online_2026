#!/usr/bin/env bash
#
#   LE SCRIPT DE FUMEE — a lancer AVANT la demo, et a relire ligne par ligne.
#
#   Il exerce les CINQ routes contre le service reel et rend un verdict par ligne :
#   OK, ou ECHEC suivi de la raison. Aucune connaissance du code n'est requise.
#
#   USAGE
#     scripts/fumee.sh                                  # vise http://127.0.0.1:8790
#     DEMO_BASE=https://demo.tare-hooks.tech scripts/fumee.sh
#     DEMO_BASE=https://tare-hooks.tech/pont scripts/fumee.sh     # filet de secours
#
#   La route /demo/approuver demande a un HUMAIN de lire seize ecrans sur l'appareil et
#   d'appuyer. Par defaut le script marche dans les ecrans a sa place (c'est une
#   verification, pas la demo). Pour tester la vraie demo, avec un humain aux boutons :
#     FUMEE_AUTO=0 scripts/fumee.sh
#
#   Code de sortie : 0 si tout est vert, 1 sinon.
#
set -uo pipefail

BASE="${DEMO_BASE:-http://127.0.0.1:8790}"; BASE="${BASE%/}"
# Le sous-domaine demo.tare-hooks.tech se teste aujourd'hui par l'en-tete Host, faute de DNS
# (voir plus bas). curl sait le faire ; `fetch` de Node, non. L'etape d'aller-retour vise donc
# le MEME service par un chemin que Node sait joindre.
BASE_NODE="$BASE"
if [ "${DEMO_BASE:-}" = "https://demo.tare-hooks.tech" ]; then
  HOTE_FORCE="demo.tare-hooks.tech"
  BASE="https://tare-hooks.tech"
  BASE_NODE="https://tare-hooks.tech/pont"
fi
ADRESSE="${ADRESSE:-0xDad77910DbDFdE764fC21FCD4E74D71bBACA6D8D}"
AUTO="${FUMEE_AUTO:-1}"
DERNIER_DIGEST=""

# Viser le sous-domaine sans son DNS : on presente le certificat de tare-hooks.tech (qui, lui,
# resout) et on met demo.tare-hooks.tech dans l'en-tete Host. Caddy route sur le Host, pas sur
# le SNI : c'est donc bien le bloc du sous-domaine qui repond, et le MEME chemin public.
# L'injection ne vise QUE les appels au pont : les URL publiques verifiees en section 7
# (https://tare-hooks.tech/rpc, /ecran) doivent garder leur propre Host.
if [ -n "${HOTE_FORCE:-}" ]; then
  RESOLVE=(--resolve "tare-hooks.tech:443:92.112.193.140" -H "Host: $HOTE_FORCE")
  curl() {
    local a
    for a in "$@"; do
      case "$a" in
        "$BASE"/demo/*) command curl "${RESOLVE[@]}" "$@"; return $?;;
      esac
    done
    command curl "$@"
  }
fi
ICI="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RACINE="$(cd "$ICI/.." && pwd)"

VERTS=0; ROUGES=0
ok()   { printf '  \033[32mOK\033[0m     %s\n' "$1"; VERTS=$((VERTS+1)); }
ko()   { printf '  \033[31mECHEC\033[0m  %s\n' "$1"; ROUGES=$((ROUGES+1)); }
titre(){ printf '\n\033[1m%s\033[0m\n' "$1"; }

# Un petit lecteur de JSON : on ne depend d'aucun outil qui pourrait manquer le jour J.
champ() { python3 -c '
import json,sys
try: d=json.load(sys.stdin)
except Exception as e: print("__JSON_ILLISIBLE__:"+str(e)[:80]); sys.exit(0)
for k in sys.argv[1].split("."):
    if isinstance(d,list):
        try: d=d[int(k)]
        except Exception: print("__ABSENT__"); sys.exit(0)
    elif isinstance(d,dict) and k in d: d=d[k]
    else: print("__ABSENT__"); sys.exit(0)
print("" if d is None else (json.dumps(d,ensure_ascii=False) if isinstance(d,(dict,list)) else d))
' "$1"; }

echo "================================================================"
echo " TARE — fumee du pont de la demo"
echo " cible   : $BASE"
echo " adresse : $ADRESSE"
echo " date    : $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "================================================================"

# ---------------------------------------------------------------- 0. joignable
titre "0. Le service repond-il ?"
SANTE="$(curl -sS -m 15 "$BASE/demo/sante" 2>&1)"
if [ "$(printf '%s' "$SANTE" | champ ok)" = "True" ] || [ "$(printf '%s' "$SANTE" | champ ok)" = "true" ]; then
  ok "le service repond sur $BASE"
else
  ko "le service ne repond pas sur $BASE — reponse : ${SANTE:0:160}"
  echo; echo "Rien d'autre ne peut etre teste. Sur le serveur :  systemctl status tare-demo-bridge"
  exit 1
fi

# -------------------------------------------------------------------- 1. etat
titre "1. GET /demo/etat — le fork, l'appareil, le snapshot"
ETAT="$(curl -sS -m 20 "$BASE/demo/etat" 2>&1)"
CH="$(printf '%s' "$ETAT" | champ fork.chain_id)"
BL="$(printf '%s' "$ETAT" | champ fork.block_number)"
RP="$(printf '%s' "$ETAT" | champ fork.rpc)"
SP="$(printf '%s' "$ETAT" | champ speculos.joignable)"
EC="$(printf '%s' "$ETAT" | champ speculos.ecran)"
[ "$CH" = "8453" ] && ok "le fork annonce la chaine 8453 (Base)" || ko "chaine annoncee : « $CH » au lieu de 8453"
[ "$BL" = "50614000" ] && ok "le fork est epingle au bloc 50614000, celui du corpus" \
                        || ko "bloc du fork : « $BL » au lieu de 50614000 — les chiffres montres ne seraient plus ceux du corpus"
[ -n "$RP" ] && [ "$RP" != "__ABSENT__" ] && ok "le RPC public annonce est $RP" || ko "aucun RPC public annonce"
if [ "$SP" = "True" ] || [ "$SP" = "true" ]; then
  ok "l'appareil Ledger emule repond — ecran : « $EC »"
else
  ko "l'appareil Ledger emule NE REPOND PAS — sur le serveur : docker ps | grep speculos"
fi
DIV="$(printf '%s' "$ETAT" | champ divergences)"
if [ "$DIV" != "[]" ] && [ "$DIV" != "__ABSENT__" ] && [ -n "$DIV" ]; then
  echo "  note   le service signale une divergence entre le brief et le corpus (elle est publiee, pas masquee) :"
  printf '%s' "$ETAT" | python3 -c 'import json,sys
for d in json.load(sys.stdin).get("divergences",[]):
    print("         - %s.%s : annonce %s, corpus %s" % (d["acte"], d["champ"], d["annonce"][:22]+"…", d["corpus"][:22]+"…"))'
fi

# ---------------------------------------------------------------- 2. preparer
for ACTE in stop substitution queue; do
titre "2. POST /demo/preparer {\"acte\":\"$ACTE\"} — credit, snapshot, calldata"
P="$(curl -sS -m 40 -X POST -H 'content-type: application/json' \
      -d "{\"adresse\":\"$ADRESSE\",\"acte\":\"$ACTE\"}" "$BASE/demo/preparer" 2>&1)"
SNAP="$(printf '%s' "$P" | champ snapshot)"
TO="$(printf '%s' "$P" | champ transaction.to)"
DATA="$(printf '%s' "$P" | champ transaction.data)"
VAL="$(printf '%s' "$P" | champ transaction.value)"
PID="$(printf '%s' "$P" | champ porte.pool_id)"
HK="$(printf '%s' "$P" | champ porte.hook)"
BPS="$(printf '%s' "$P" | champ porte.bps)"
TW="$(printf '%s' "$P" | champ porte.taille_wei)"
SENS="$(printf '%s' "$P" | champ porte.sens)"
ETH="$(printf '%s' "$P" | champ soldes.eth_wei)"
USD="$(printf '%s' "$P" | champ soldes.usdc)"
ETT="$(printf '%s' "$P" | champ etat_transaction)"
MOT="$(printf '%s' "$P" | champ motif)"

case "$SNAP" in 0x*) ok "un snapshot du fork a ete pris : $SNAP (la demo se rejouera a l'identique)";;
              *) ko "aucun snapshot rendu — /demo/revenir ne pourra pas rejouer (recu : « $SNAP »)";; esac
[ "$TO" = "0x6ff5693b99212da76ad316178a184ab56d299b43" ] \
  && ok "la transaction vise l'Universal Router de Base" \
  || ko "destinataire inattendu : « $TO »"
case "$DATA" in 0x3593564c*) ok "le calldata est un execute(bytes,bytes[],uint256) — $(( (${#DATA}-2)/2 )) octets";;
              *) ko "le calldata ne commence pas par le selecteur attendu : « ${DATA:0:12} »";; esac
[ -n "$VAL" ] && ok "value = $VAL" || ko "aucune value rendue"
case "$PID" in 0x????????????????????????????????????????????????????????????????) ok "porte : pool $PID";;
              *) ko "pool_id absent ou malforme : « $PID »";; esac
case "$HK" in 0x????????????????????????????????????????) ok "porte : hook $HK";;
            *) ko "hook absent ou malforme : « $HK »";; esac
if [ "$BPS" = "" ] || [ "$BPS" = "__ABSENT__" ]; then
  ko "le prelevement est absent de la reponse"
elif [ "$BPS" = "None" ] || [ "$BPS" = "null" ]; then
  ok "prelevement NON MESURE a ce point — le service rend null et un motif, jamais zero"
else
  ok "prelevement mesure : $BPS bps, taille $TW wei, sens $SENS, au bloc 50614000"
fi
# La dotation n'est pas ecrite ici : elle est LUE dans /demo/etat. Ecrire « 10 ETH » en dur
# faisait echouer ce controle le jour ou la dotation est passee a 100 ETH — un faux echec.
DOT_ETH_ATTENDU="$(printf '%s' "$ETAT" | champ dotation.eth_wei)"
DOT_USDC_ATTENDU="$(printf '%s' "$ETAT" | champ dotation.usdc)"
[ "$ETH" = "$DOT_ETH_ATTENDU" ] && ok "l'adresse a bien ete creditee de la dotation ($ETH wei)" \
                                 || ko "solde ETH apres credit : « $ETH » wei au lieu de la dotation « $DOT_ETH_ATTENDU »"
if [ "$USD" = "__ABSENT__" ]; then
  ko "solde USDC illisible"
elif [ "$USD" = "$DOT_USDC_ATTENDU" ]; then
  ok "l'adresse a aussi ete creditee en USDC ($USD unites, soit $((USD / 1000000)) USDC)"
else
  ko "solde USDC apres credit : « $USD » au lieu de la dotation « $DOT_USDC_ATTENDU » — l'ecriture de stockage n'a pas pris"
fi
# CE QUE METAMASK FAIT AVANT D AFFICHER : il SIMULE. Un `eth_call` sur la transaction au
# bloc « pending ». S il revert, le portefeuille ecrit « This transaction is likely to fail »
# et le jury le lit avant nous. Rien ne testait ca ; c est ce qui a casse une repetition.
RPCU2="$(printf '%s' "$ETAT" | champ fork.rpc)"
SIM="$(curl -sS -m 25 -X POST -H 'content-type: application/json' \
  --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"eth_call\",\"params\":[{\"from\":\"$ADRESSE\",\"to\":\"$TO\",\"data\":\"$DATA\",\"value\":\"$VAL\"},\"pending\"]}" \
  "$RPCU2" 2>/dev/null | "$ICI/nommer-erreur.py")"
case "$ACTE/$SIM" in
  */OK)   ok "MetaMask ne predira pas d echec : la simulation au bloc pending passe";;
  # « queue » depense un ERC-20 obscur que le portefeuille ne detient pas : son revert est
  # ATTENDU et n'a rien a voir avec la demo. On le DIT plutot que de le masquer.
  queue/*) ok "acte queue : la simulation revert, et c'est normal — l'entree est un ERC-20 que"
           echo "         le portefeuille ne detient pas. Cet acte se montre, il ne s'envoie pas."
           echo "         ($SIM)";;
  *)      ko "MetaMask affichera « This transaction is likely to fail » — $SIM";;
esac
HFIG="$(printf '%s' "$ETAT" | champ base.horloge_figee)"
{ [ "$HFIG" = "True" ] || [ "$HFIG" = "true" ]; } \
  && ok "l horloge du fork est FIGEE sur l horodatage du bloc epingle (le swap s execute dans le contexte de la mesure)" \
  || ko "l horloge du fork n est pas figee : le rendement du swap changera avec le temps de parole — $(printf '%s' "$ETAT" | champ base.horloge_motif)"

case "$ETT" in
  PRETE) ok "transaction PRETE : le plancher de sortie vient d'une cotation vivante du fork";;
  SANS_PLANCHER) ko "transaction SANS PLANCHER — $MOT";;
  RELECTURE_DIVERGENTE) ko "LE SERVICE A REFUSE DE RENDRE SON PROPRE CALLDATA (relecture divergente) — $MOT";;
  *) ko "etat de transaction inattendu : « $ETT »";;
esac
done

# ------------------------------------------------------- 3. aller-retour du calldata
titre "3. ALLER-RETOUR — le decodeur du depot relit-il ce que le service construit ?"
echo "  (c'est le test qui compte : c'est ce meme decodeur qui tournera devant le jury)"
if [ -x "$RACINE/node_modules/.bin/tsx" ]; then
  if "$RACINE/node_modules/.bin/tsx" "$ICI/relire.ts" "$BASE_NODE" 2>&1 | sed 's/^/  /'; then
    VERTS=$((VERTS+1))
  else
    ROUGES=$((ROUGES+1))
  fi
else
  ko "tsx introuvable : lance d'abord  cd $RACINE && npm install"
fi

# -------------------------------------------------------------------- 4. soldes
titre "4. GET /demo/soldes — les soldes lus sur le fork"
S="$(curl -sS -m 20 "$BASE/demo/soldes?adresse=$ADRESSE" 2>&1)"
SE="$(printf '%s' "$S" | champ eth_wei)"
SU="$(printf '%s' "$S" | champ usdc)"
case "$SE" in ''|*[!0-9]*) ko "solde ETH illisible : « $SE »";; *) ok "solde ETH : $SE wei";; esac
[ "$SU" != "__ABSENT__" ] && ok "solde USDC : $SU" || ko "solde USDC absent de la reponse"
BIDON="$(curl -sS -m 15 "$BASE/demo/soldes?adresse=pasuneadresse" 2>&1 | champ erreur)"
[ "$BIDON" = "adresse_invalide" ] && ok "une adresse invalide est refusee, pas devinee" \
                                  || ko "une adresse invalide n'est pas refusee (recu : « $BIDON »)"

# ------------------------------------------------------------------- 5. revenir
titre "5. POST /demo/revenir — revenir au snapshot pour rejouer a l'identique"
R1="$(curl -sS -m 30 -X POST "$BASE/demo/revenir" 2>&1)"
[ "$(printf '%s' "$R1" | champ ok)" = "True" ] || [ "$(printf '%s' "$R1" | champ ok)" = "true" ] \
  && ok "retour a l etat de base effectue, fork au bloc $(printf '%s' "$R1" | champ block_number)" \
  || ko "le retour a echoue : $(printf '%s' "$R1" | champ motif)"
B1="$(printf '%s' "$R1" | champ block_number)"; C1="$(printf '%s' "$R1" | champ conforme)"
if [ "$B1" = "50614000" ] && { [ "$C1" = "True" ] || [ "$C1" = "true" ]; }; then
  ok "le fork est bien revenu au BLOC EPINGLE 50614000 — le bandeau ne mentira pas"
else
  ko "le rembobinage a rendu le bloc « $B1 » (conforme=$C1) : ce n est pas le bloc du corpus, et les chiffres montres ne seraient plus ceux qui ont ete mesures"
fi
R2="$(curl -sS -m 30 -X POST "$BASE/demo/revenir" 2>&1)"
[ "$(printf '%s' "$R2" | champ ok)" = "True" ] || [ "$(printf '%s' "$R2" | champ ok)" = "true" ] \
  && ok "un SECOND retour marche aussi : la demo se rejoue autant de fois qu'il faut" \
  || ko "le second retour a echoue : $(printf '%s' "$R2" | champ motif) — la demo ne se rejouerait qu'une fois"
# LA DOTATION SURVIT-ELLE AU REMBOBINAGE ? C'est le detail qui casse une repetition sans
# prevenir : sans redotation, un retour a l'etat epingle rend au portefeuille du presentateur
# ses VRAIS soldes de Base (0,248 ETH, 0 USDC) et la demo devient injouable au deuxieme tour.
DOT_ETH="$(printf '%s' "$R2" | champ dotation.eth_wei)"
DOT_USDC="$(printf '%s' "$R2" | champ dotation.usdc)"
TOUS="$(printf '%s' "$R2" | champ dotation.tous_conformes)"
E2="$(curl -sS -m 20 "$BASE/demo/soldes?adresse=$ADRESSE" | champ eth_wei)"
[ "$E2" = "$DOT_ETH" ] && ok "apres retour, l'adresse preparee a de nouveau ses $DOT_ETH wei" \
                        || ko "apres retour le solde vaut « $E2 » au lieu de « $DOT_ETH » : le snapshot n'a pas ete pris au bon moment"
if [ "$TOUS" = "True" ] || [ "$TOUS" = "true" ]; then
  ok "apres retour, TOUS les portefeuilles de demonstration sont refinances (dotation relue, pas supposee)"
else
  ko "apres retour, au moins un portefeuille de demonstration n est pas finance — la repetition casserait au deuxieme tour"
fi
printf '%s' "$R2" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except Exception: raise SystemExit
for w in (d.get('dotation') or {}).get('dernier') or []:
    e=int(w['eth_wei'] or 0)/1e18; u=int(w['usdc'] or 0)/1e6
    etat='' if w['conforme'] else '  <- NON CONFORME: '+str(w['motif'])
    print('         %s : %.4f ETH · %.6f USDC%s' % (w['adresse'], e, u, etat))"
PORTES="$(printf '%s' "$ETAT" | champ dotation.portefeuilles_demo)"
[ -n "$PORTES" ] && [ "$PORTES" != "[]" ] && [ "$PORTES" != "__ABSENT__" ] \
  && ok "portefeuilles de demonstration configures : $PORTES (dotation $DOT_ETH wei + $DOT_USDC USDC)" \
  || ko "aucun portefeuille de demonstration configure : DEMO_PORTEFEUILLES est vide"

# ------------------------------------------------------------------ 6. approuver
titre "6. POST /demo/approuver — l'EIP-712 sur l'ecran de l'appareil"
if [ "$AUTO" = "1" ]; then
  echo "  (le script marche dans les ecrans a la place de l'humain ; FUMEE_AUTO=0 pour le faire soi-meme)"
  CORPS='{"verdict":"stop","auto":true}'
else
  echo "  >>> VA APPUYER SUR LES BOUTONS DE L'APPAREIL. « Blind signing ahead » = les DEUX boutons,"
  echo "  >>> puis a droite champ par champ, et les DEUX boutons sur « Sign message »."
  CORPS='{"verdict":"stop"}'
fi
A="$(curl -sS -m 260 -X POST -H 'content-type: application/json' -d "$CORPS" "$BASE/demo/approuver" 2>&1)"
SIG="$(printf '%s' "$A" | champ signature)"
REF="$(printf '%s' "$A" | champ refus)"
ERR="$(printf '%s' "$A" | champ erreur)"
if [ -n "$SIG" ] && [ "$SIG" != "__ABSENT__" ]; then
  ok "l'appareil a SIGNE : ${SIG:0:26}… (65 octets, v=$(printf '%s' "$A" | champ v))"
  # ce qui a ete AFFICHE : c'est la preuve, pas la signature
  printf '%s' "$A" | python3 -c '
import json,sys
d=json.load(sys.stdin)
e=[x for x in d.get("ecrans",[]) if "Press right button" not in x]
clair=[x for x in e if x.split(" ")[0] in ("verdict","hook","poolId","take","label","size","direction","measuredAtBlock","warnings","promptDigest","name","version","chainId")]
print("  ecrans affiches par l appareil : %d, dont %d champs NOMMES et lisibles :" % (len(e), len(clair)))
for x in clair[:20]: print("         " + x)
aveugle=[x for x in e if "Sign hash" in x or "blind sign" in x.lower() and "ahead" not in x.lower()]
print("  ATTENTION : signature AVEUGLE detectee -> " + str(aveugle) if aveugle else "  aucun ecran de signature aveugle : les champs sont rendus en clair.")'
  T="$(printf '%s' "$A" | python3 -c 'import json,sys;print(json.load(sys.stdin).get("message",{}).get("swaps",[{}])[0].get("take","?"))' 2>/dev/null)"
  [ -n "$T" ] && ok "le prelevement affiche sur l'appareil : « $T »"
elif [ "$REF" = "4001" ]; then
  ok "REFUS enregistre comme tel : $(printf '%s' "$A" | champ raison) — c'est le bon comportement si tu as appuye sur Reject"
elif [ "$ERR" = "speculos_injoignable" ]; then
  ko "l'appareil ne repond pas : $(printf '%s' "$A" | champ motif)"
else
  M="$(printf '%s' "$A" | champ motif)"
  case "$M" in
    *reglage_manquant*|*6a80*)
      ko "L'APPAREIL REFUSE D'AFFICHER LA STRUCTURE (0x6a80). Ce n'est PAS la signature aveugle qu'il"
      echo "         faut activer : c'est  Settings -> Raw messages -> Enabled. Sur le serveur :"
      echo "         /root/tare-demo-bridge/scripts/speculos-raw-messages.sh";;
    *) ko "l'appareil n'a pas signe : ${M:-${A:0:200}}";;
  esac
fi

# ------------------------------- 6bis. la langue de l ecran, et l empreinte partagee
titre "6bis. Ce que l appareil AFFICHE : la langue, et l empreinte que la page montre aussi"
# Trois essais : une reponse vide n'est pas une faute du service, c'est un aleas de
# connexion — et un script de verification qui crie au loup dessus finit par ne plus etre lu.
MSG=""
for _essai in 1 2 3; do
  MSG="$(curl -sS -m 20 "$BASE/demo/message?acte=stop" 2>&1)"
  [ -n "$MSG" ] && break
  sleep 1
done
DIGP="$(printf '%s' "$MSG" | champ prompt_digest)"
case "$DIGP" in
  0x????????????????????????????????????????????????????????????????) ok "la page recevra l empreinte $DIGP";;
  *) ko "aucune empreinte rendue par /demo/message (recu « $DIGP »)";;
esac
# Le francais qui trainait sur l ecran de l appareil, mot pour mot. Le controle vit dans
# scripts/verifier-langue.py : une expression reguliere de cette taille ne survit pas a une
# imbrication de guillemets dans un script shell — essaye et relis, c'est illisible.
FR="$("$ICI/verifier-langue.py" <<< "$MSG")"
case "$FR" in
  "")            ok "tout ce que l appareil affiche est en anglais";;
  __ILLISIBLE__*) ko "/demo/message n a rien rendu de lisible — la langue n a PAS pu etre verifiee ($FR)";;
  *)             ko "du francais subsiste sur l ecran de l appareil, champs : $FR";;
esac
# l empreinte rendue a la page est-elle bien le keccak du texte scelle ?
if [ -x "$RACINE/node_modules/.bin/tsx" ] && [ -n "$DERNIER_DIGEST" ]; then
  [ "$DERNIER_DIGEST" = "$DIGP" ] \
    && ok "l appareil a affiche la MEME empreinte que celle rendue a la page" \
    || ko "l appareil a affiche $DERNIER_DIGEST et la page recevra $DIGP — les deux doivent etre le meme nombre"
fi

# ------------------------------------------------- 7. les surfaces publiques
titre "7. Les surfaces publiques — celles que la page et MetaMask vont utiliser"
RPCU="$(printf '%s' "$ETAT" | champ fork.rpc)"
ECRU="$(printf '%s' "$ETAT" | champ speculos.ecran_public)"
echo "  le service annonce a la page :  RPC $RPCU"
echo "                                 ecran $ECRU"

# 7a. le RPC doit repondre comme un noeud Base, et n avoir QU UN SEUL en-tete CORS :
#     un navigateur refuse net une reponse qui en porte deux.
CID="$(curl -sS -m 20 -X POST -H 'content-type: application/json' \
        --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPCU" 2>/dev/null | champ result)"
[ "$CID" = "0x2105" ] && ok "MetaMask peut ajouter $RPCU : eth_chainId rend 0x2105 (8453)" \
                       || ko "le RPC annonce ne repond pas 0x2105 mais « $CID » — MetaMask refusera le reseau"
BNH="$(curl -sS -m 20 -X POST -H 'content-type: application/json' \
        --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}' "$RPCU" 2>/dev/null | champ result)"
# Le bloc AVANCE des qu'une transaction est envoyee, et c'est normal en pleine demo : ce qui
# doit etre vrai, c'est que /demo/revenir ramene au bloc epingle — verifie en section 5.
# Exiger 50614000 ici faisait echouer le script pendant qu'on repetait, ce qui est absurde.
BN="$(printf '%s' "$BNH" | python3 -c "import sys;v=sys.stdin.read().strip();print(int(v,16) if v.startswith('0x') else -1)")"
if [ "$BN" = "50614000" ]; then
  ok "le RPC est au bloc epingle 50614000, celui du corpus"
elif [ "$BN" -gt 50614000 ] 2>/dev/null; then
  ok "le RPC est au bloc $BN : des transactions ont ete envoyees depuis le dernier rembobinage (normal)"
  echo "         /demo/revenir le ramene a 50614000 — verifie plus haut, section 5."
else
  ko "le RPC rend le bloc « $BNH » : ce n est pas une chaine epinglee au corpus"
fi
NACO="$(curl -sS -m 20 -D - -o /dev/null -X POST -H 'content-type: application/json' \
        --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' "$RPCU" 2>/dev/null | grep -ci 'access-control-allow-origin')"
[ "$NACO" = "1" ] && ok "un seul en-tete Access-Control-Allow-Origin (deux feraient echouer le navigateur)" \
                   || ko "$NACO en-tete(s) Access-Control-Allow-Origin sur le RPC — il en faut exactement un"

# 7b. l ecran doit etre lisible et les boutons cliquables ; l APDU doit etre MUR.
EV="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$ECRU/events?currentscreenonly=true" 2>/dev/null)"
[ "$EV" = "200" ] && ok "l ecran de l appareil est lisible : GET $ECRU/events" \
                   || ko "l ecran n est pas lisible (HTTP $EV) — le public ne verra rien"
SC="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$ECRU/screenshot" 2>/dev/null)"
[ "$SC" = "200" ] && ok "la capture d ecran repond : GET $ECRU/screenshot" || ko "GET /screenshot rend HTTP $SC"
# CE QU ON CHERCHE EXACTEMENT : Speculos. Il rend « 200 + application/json » sur POST /apdu,
# et c est la seule signature qui compte. Un 200 ne suffit pas a crier au loup : les chemins
# percent-encodes comme /ecran/%2e%2e/apdu sont NORMALISES par Caddy en /apdu AVANT le
# routage, sortent donc du bloc /ecran/* et tombent sur la SPA, dont le `try_files` rend
# index.html en 200 text/html pour n importe quel chemin. C est la page d accueil, pas
# l appareil — verifie octet par octet (2684 octets, « <!doctype html> »). On distingue donc
# le type de contenu, sinon le script hurlerait a chaque execution pour une page web.
FUITE=0; NORMALISES=0
for CHEMIN in /apdu /automation /finger "/events/../apdu" "/button/left/../../apdu" "/%2e%2e/apdu" "/%2E%2E%2Fapdu"; do
  # Une requete qui n aboutit pas rend un statut VIDE, et ce n est pas une fuite : c est du
  # reseau. On reessaie une fois avant de conclure — un script de verification qui crie au
  # loup sur un aleas de connexion finit par ne plus etre lu.
  HC=""; CT=""
  for _essai in 1 2 3 4 5; do
    LIGNE="$(curl -sS -m 15 -D - -o /dev/null -X POST -H 'content-type: application/json' \
          -d '{"data":"e0020000"}' "$ECRU$CHEMIN" 2>/dev/null)"
    HC="$(printf '%s' "$LIGNE" | head -1 | tr -d '\r' | awk '{print $2}')"
    CT="$(printf '%s' "$LIGNE" | grep -i '^content-type:' | head -1 | tr -d '\r')"
    [ -n "$HC" ] && break
    sleep 2
  done
  if [ -z "$HC" ]; then
    ko "injoignable (cinq essais) : $ECRU$CHEMIN — probleme de reseau, pas une fuite"
    FUITE=1
    continue
  fi
  case "$HC/$CT" in
    200/*application/json*) ko "FUITE : POST $ECRU$CHEMIN rend 200 + JSON — c est la signature de Speculos"; FUITE=1;;
    200/*text/html*)        NORMALISES=$((NORMALISES+1));;
    404/*|405/*|400/*)      ;;
    *)                      ko "reponse inattendue sur $ECRU$CHEMIN : $HC $CT"; FUITE=1;;
  esac
done
[ "$FUITE" = "0" ] && ok "l APDU reste mur : aucun chemin public ne le sert (seul le pont, en local, le pilote)"
[ "$NORMALISES" -gt 0 ] && echo "  note   $NORMALISES chemin(s) percent-encode(s) sortent du bloc /ecran apres normalisation et"
[ "$NORMALISES" -gt 0 ] && echo "         retombent sur la page d accueil (200 text/html) : c est la SPA, pas l appareil."
for V in "GET /button/left" "POST /screenshot" "POST /button/enter"; do
  M="${V%% *}"; C="${V#* }"
  H="$(curl -sS -m 15 -o /dev/null -w '%{http_code}' -X "$M" "$ECRU$C" 2>/dev/null)"
  [ "$H" = "404" ] && ok "refuse comme prevu : $M $C -> 404" || ko "$M $C rend $H au lieu de 404"
done

# ------------------------------------------------------- 8. la forme du corpus
titre "8. La distribution — pour qu'aucun chiffre montre ne passe pour le milieu"
MED="$(printf '%s' "$ETAT" | champ distribution.mediane_bps)"
MOY="$(printf '%s' "$ETAT" | champ distribution.moyenne_bps)"
MAX="$(printf '%s' "$ETAT" | champ distribution.max_bps)"
NN="$(printf '%s' "$ETAT" | champ distribution.n)"
N5K="$(printf '%s' "$ETAT" | champ distribution.n_au_dessus_de_5000_bps)"
P5K="$(printf '%s' "$ETAT" | champ distribution.part_au_dessus_de_5000_bps)"
P100="$(printf '%s' "$ETAT" | champ distribution.part_au_dessus_de_100_bps)"
SRC="$(printf '%s' "$ETAT" | champ distribution.seuils.source)"
if [ "$NN" = "63156" ]; then
  ok "calculee sur les $NN lignes MESUREES portant une valeur (sur 125072 mesures)"
else
  ko "la distribution porte sur « $NN » lignes au lieu de 63156"
fi
[ "$MED" != "__ABSENT__" ] && ok "mediane $MED bps · moyenne $MOY bps (la moyenne est SOUS la mediane : des lignes negatives existent)" \
                            || ko "la distribution n est pas publiee par /demo/etat"
[ "$P100" != "__ABSENT__" ] && ok "part au-dessus de 100 bps : $P100 %" || ko "part au-dessus de 100 bps absente"
if [ "$N5K" = "54" ]; then
  ok "le chiffre qui remet l extreme a sa place : $N5K lignes seulement depassent 5 000 bps ($P5K %), max $MAX"
else
  ko "le compte au-dessus de 5 000 bps vaut « $N5K » au lieu de 54"
fi
[ "$SRC" = "table" ] && ok "les seuils publies viennent de la table (centiles), pas de valeurs ecrites en dur" \
                      || ko "les seuils viennent de « $SRC » : la table ne porte pas ses centiles"
ADEMO="$(printf '%s' "$ETAT" | champ actes_de_la_demo)"
case "$ADEMO" in
  *'"stop"'*'"substitution"*'|'["stop", "substitution"]') ok "la demo joue stop puis substitution ; « queue » reste accessible mais n ouvre plus";;
  *) case "$ADEMO" in *queue*) ko "« queue » figure dans les actes de la demo : l exception ne doit pas ouvrir";; *) ok "actes de la demo : $ADEMO (« queue » reste accessible sur demande)";; esac;;
esac

# -------------------------------------------------------------------- verdict
echo
echo "================================================================"
if [ "$ROUGES" -eq 0 ]; then
  printf ' \033[32mVERDICT : VERT\033[0m — %d verifications passees, 0 echec.\n' "$VERTS"
  echo " Le pont est pret pour la demo."
  echo "================================================================"
  exit 0
else
  printf ' \033[31mVERDICT : %d ECHEC(S)\033[0m sur %d verifications.\n' "$ROUGES" "$((VERTS+ROUGES))"
  echo " Relis les lignes ECHEC ci-dessus : chacune dit quoi faire."
  echo "================================================================"
  exit 1
fi
