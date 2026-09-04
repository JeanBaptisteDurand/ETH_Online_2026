import { serve } from "@hono/node-server";
import { createApp } from "./app.js";

const { app, cfg } = createApp();

serve({ fetch: app.fetch, port: cfg.port }, (info) => {
  console.log(`TARE api  http://127.0.0.1:${info.port}`);
  console.log(`  moteur  ${cfg.rpcUrl}  bloc ${cfg.forkBlock}`);
  console.log(
    `  x402    ${cfg.x402Enabled ? `${cfg.x402Network} via ${cfg.facilitatorUrl}` : "desactive"}`,
  );
});
