# Brand DESIGN.md library

33 design systems extracted from public websites by [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT, see LICENSE). Each file follows the design.md format (YAML tokens + prose sections, `npx @google/design.md lint`) that da-kit uses for `design/DESIGN.md`: atmosphere, palette and roles, typography, components, layout, depth, do and don't, responsive, agent prompt guide.

How `/da-kit:da` uses them (mandatory, two files per DA, cited on the `Brand DESIGN.md read :` line of design/DESIGN.md): read two or three that sit near the brief's family, borrow the *reasoning* (why this radius, why this contrast, how depth is built), never the identity. A launch that looks like Stripe or Linear is a failure, a launch whose spacing and hierarchy are as disciplined as theirs is the goal. Quote which files were read in `DESIGN.md → references`.

| Family (see docs/V2.md 2.2) | Read |
|---|---|
| editorial, premium calm | linear.app, vercel, framer, superhuman, resend, claude |
| terminal, dense data | warp, raycast, cursor, posthog, supabase, x.ai |
| finance, exchange, trust | stripe, coinbase, kraken, binance, revolut, wise |
| luxe, object, cinematic | ferrari, lamborghini, bugatti, apple, tesla, spacex |
| loud, culture, energy | nike, spotify, playstation, runwayml, elevenlabs |
| editorial press | theverge, wired |
| retro web | nintendo-2001, dell-1996 |

Refresh: `git clone --depth 1 https://github.com/VoltAgent/awesome-design-md /tmp/adm && cp /tmp/adm/design-md/<brand>/DESIGN.md references/design-md/<brand>.md`.
