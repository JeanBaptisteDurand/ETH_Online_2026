# L'image du service x402 : l'API Node et le moteur Python dans le meme conteneur.
#
# Ils ne sont pas separables : POST /measure execute `python3 apps/api/scripts/measure_one.py`
# et lit sa sortie. Deux conteneurs voudraient dire un protocole entre eux, donc une
# surface de plus a garder honnete, pour aucun gain.
#
# Le moteur n'a AUCUNE dependance Python hors bibliotheque standard (il parle au RPC en
# urllib) : pas de pip, pas de roue a compiler, pas de requirements.txt a faire vieillir.
FROM node:22-slim

# python3 pour le moteur ; ca-certificates pour joindre le facilitateur x402, le mirror
# node Hedera et le backend LKRP en TLS.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ca-certificates curl \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /srv/tare

# Les dependances d'abord, pour que le cache Docker survive a un changement de code.
COPY apps/api/package.json apps/api/package-lock.json ./apps/api/
COPY packages/keyring/package.json packages/keyring/package-lock.json ./packages/keyring/
RUN cd packages/keyring && npm ci --omit=dev \
 && cd ../../apps/api && npm ci --omit=dev

# tsx, INSTALLE dans l'image et pas telecharge au demarrage.
#
# Le CMD lance `npx tsx`, mais tsx est une devDependency et `npm ci --omit=dev` ne
# l'installe pas : `npx` allait donc le CHERCHER SUR NPM a chaque demarrage du conteneur.
# Sur une machine sans acces sortant, ou pendant une panne de npm, l'API ne demarrait
# jamais — et le message d'erreur parlait de npm, pas de nous. La version est epinglee
# sur celle de apps/api/package.json.
RUN npm install -g tsx@4.23.13

# Le code, puis les donnees. Les mesures (docs/) sont le produit : sans elles l'API
# demarre mais /hooks est vide, et elle le DIT au lieu de rendre une liste vide.
COPY engine/ ./engine/
COPY packages/ ./packages/
COPY apps/api/ ./apps/api/
COPY docs/ ./docs/
COPY Makefile README.md ./

ENV NODE_ENV=production \
    PORT=8787 \
    TARE_RPC_URL=http://anvil:8545

EXPOSE 8787

# Le health check interroge la route qui compte les mesures : un service qui repond 200
# sans jeu de donnees serait "sain" et inutile.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8787/health | grep -q '"ok":true' || exit 1

# `tsx` et non `npx tsx` : le binaire est dans l'image, il n'y a rien a resoudre.
CMD ["tsx", "apps/api/src/server.ts"]
