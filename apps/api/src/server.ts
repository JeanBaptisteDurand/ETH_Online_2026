import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const { app, cfg } = createApp();

/**
 * DERRIERE UN PROXY QUI TERMINE TLS, LE SERVICE SE CROIT EN CLAIR.
 *
 * Caddy parle a ce processus en HTTP simple sur la boucle locale. Node ne voit donc que
 * `http://`, et `c.req.url` vaut `http://api.tare-hooks.tech/measure`. Or l adaptateur x402
 * construit `resource.url` a partir de cette valeur exacte : le 402 annoncait une ressource
 * en `http://` alors que le service n est joignable qu en `https://`. La ressource annoncee
 * et la ressource appelee differaient d un caractere — et c est sur cette chaine que le
 * client verifie ce qu il paie.
 *
 * On recolle donc le schema depuis `X-Forwarded-Proto`, que le bloc Caddy pose, AVANT que
 * la requete n atteigne l application. Sans en-tete (appel direct en local), rien ne bouge.
 */
const fetchDerriereProxy: typeof app.fetch = (request, ...reste) => {
  const annonce = request.headers.get("x-forwarded-proto");
  if (!annonce) return app.fetch(request, ...reste);

  // "https, http" quand plusieurs proxys se sont succede : le premier fait foi.
  const schema = annonce.split(",")[0]!.trim().toLowerCase();
  if (schema !== "http" && schema !== "https") return app.fetch(request, ...reste);

  const url = new URL(request.url);
  if (url.protocol === `${schema}:`) return app.fetch(request, ...reste);
  url.protocol = `${schema}:`;

  // Un Request ne se recopie pas par etalement : methode, en-tetes et corps sont des
  // accesseurs du prototype, pas des proprietes propres. On les reprend un par un.
  // `duplex: "half"` est exige des qu un corps est reemis : sans lui Node refuse la
  // construction, et toute requete POST — donc /measure, donc le peage — tomberait.
  const aUnCorps = request.method !== "GET" && request.method !== "HEAD";
  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers: request.headers,
    redirect: request.redirect,
    signal: request.signal,
  };
  if (aUnCorps) {
    init.body = request.body;
    init.duplex = "half";
  }
  return app.fetch(new Request(url, init), ...reste);
};

serve({ fetch: fetchDerriereProxy, port: cfg.port }, (info) => {
  console.log(`TARE api  http://127.0.0.1:${info.port}`);
  console.log(`  moteur  ${cfg.rpcUrl}  bloc ${cfg.forkBlock}`);
  console.log(
    `  x402    ${cfg.x402Enabled ? `${cfg.x402Network} via ${cfg.facilitatorUrl}` : "desactive"}`,
  );
});
