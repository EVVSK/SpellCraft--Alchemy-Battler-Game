# 🔮 Spellcraft: AI Alchemy Card Battler

Spellcraft is a browser-based fantasy card battler that combines **Infinite
Craft-style ingredient discovery** with **Slay the Spire-style turn-based card
combat**. Players combine two reagents, including words they invent
themselves, and receive a playable spell card generated at runtime by Google
Gemini.

The project is designed as a complete, demonstrable submission for the
**Generative AI in Gaming assessment (10 marks)**:

- runtime generative AI changes the content and stats of the player's cards;
- the generated result is constrained to a game-safe JSON shape;
- the game remains playable when the network, API, or proxy is unavailable;
- the frontend is a static GitHub Pages application; and
- the API key is kept behind a stateless Cloudflare Worker.

## Game loop and playability

The player starts as the Grand Alchemist with a small starter grimoire. Each
turn has two actions and one brewing opportunity:

1. Select any two pantry reagents: Fire, Water, Stone, Wind, Venom, Mirror, or
   a custom word entered in the crucible.
2. Select **Brew Spell Card**. The resulting card displays its generated name,
   emoji, recipe, damage, shield, and healing effects.
3. Click cards in the grimoire to cast them. Cards cost one action, damage the
   boss, add block, and/or heal the player.
4. End the turn. The boss strikes for its current intent and the player receives
   two actions for the next turn.

The run contains three boss stages:

1. **Iron Automaton** — weak to Fire and Lightning.
2. **Sun Wyrm** — weak to Water and Ice.
3. **The Void King** — weak to Light and Alchemy.

Matching a boss's weakness in a card name or recipe applies a **1.5x critical
hit**, giving the player a reason to experiment with different generated
recipes. When a boss is defeated, the game pauses at the post-boss
intermission. The player must explicitly choose **Continue to Next Boss** or
**Stop & Claim Victory**. Defeating The Void King completes the full run;
claiming victory earlier ends the run as a successful partial gauntlet.

## Runtime generative AI

The browser-side integration is implemented in
[`js/ai-service.js`](./js/ai-service.js). When a new recipe is not already in
the client cache, the service sends the two player-selected inputs to
`gemini-2.5-flash`.

The request supplies a strict generation contract:

```json
{
  "name": "2-3 word evocative spell name",
  "emoji": "one emoji",
  "damage": "integer from 12 to 30",
  "block": "integer from 0 to 18",
  "heal": "integer from 0 to 14"
}
```

Gemini is configured with `responseMimeType: "application/json"` and the
service validates and clamps returned numeric values before putting the card
in the player's hand. This means arbitrary custom inputs can produce new
names, emojis, damage, and block/heal combinations without changing the
frontend source code. Generated cards are visibly marked **⚗️ AI Brewed**.

## Production architecture

```text
Browser / GitHub Pages
  ├─ index.html
  ├─ css/styles.css
  ├─ js/game.js              combat state machine and UI
  ├─ js/canvas-engine.js     60 FPS battle effects
  └─ js/ai-service.js        Gemini client, cache, timeout, fallback
             │ POST { userPrompt }
             ▼
Cloudflare Worker
  ├─ backend/worker.js       CORS, per-IP limit, upstream timeout, proxy
  └─ GEMINI_API_KEY          Cloudflare secret, never committed to source
             │
             ▼
Google Gemini API
  └─ gemini-2.5-flash
```

The frontend is a zero-database static application. The Worker in
[`backend/worker.js`](./backend/worker.js) is a stateless edge proxy: it
accepts only the prompts needed for card generation, adds the secret API key
server-side, calls Gemini, and returns the structured JSON response. The
secret is configured through Wrangler rather than embedded in JavaScript.
[`backend/wrangler.toml`](./backend/wrangler.toml) defines the Worker entry
point and deployment name.

### Reliability and live-evaluation controls

- **Per-IP protection:** the Worker tracks requests using the
  `CF-Connecting-IP` address and enforces a 12-request-per-minute
  sliding-window policy. Requests over the limit receive HTTP 429.
- **Client protection:** the browser applies the same 12-per-minute guard
  before attempting a request.
- **Recipe cache:** `js/game.js` stores completed recipes in a `Map`. Repeating
  the same pair returns immediately and reports **0 ms (Cached)**, avoiding
  duplicate generation and latency.
- **Latency cutoff:** both client and Worker use `AbortController` with an
  8.5-second cutoff. The Worker reports a 504 for an upstream timeout.
- **Fallback alchemy:** any timeout, rate limit, malformed response, offline
  request, or missing key reaches `buildFallbackCard()` in
  [`js/ai-service.js`](./js/ai-service.js). Known combinations have curated
  cards; unknown combinations use deterministic hashing. The game therefore
  remains playable with zero crash-shaped failure paths.
- **Observable status:** the Settings & API modal exposes the latest latency
  and rate-limit state and includes an error/timeout recovery test action.

## Project structure

```text
spellcraft-alchemy-battler/
├── index.html                  # Static application entry point
├── README.md                   # Setup, architecture, and assessment mapping
├── css/
│   └── styles.css              # Visual theme and responsive layout
├── js/
│   ├── canvas-engine.js        # 2D battle animation engine
│   ├── ai-service.js           # Gemini integration and resilience controls
│   └── game.js                 # Combat state machine and card UI
├── backend/
│   ├── worker.js               # Cloudflare Gemini edge proxy
│   └── wrangler.toml           # Wrangler Worker configuration
└── docs/
    └── ARCHITECTURE.md         # Detailed architecture and rubric evidence
```

## Run locally

1. Open the `spellcraft-alchemy-battler` folder in VS Code.
2. Install or enable the **Live Server** extension.
3. Right-click [`index.html`](./index.html) and choose **Open with Live
   Server**.
4. Open **⚙ Settings & API** and enter the deployed Cloudflare Worker URL.
   The default URL is already present in the client configuration, but it can
   be replaced for another deployment.
5. If no proxy is available, leave the proxy URL blank. The deterministic
   fallback synthesizer still supports the complete game loop. The public
   frontend intentionally has no direct Gemini API-key input.

## Deploy to production

### 1. Deploy the Cloudflare backend

From the `backend` directory:

```powershell
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```

When Wrangler prompts for the secret, paste the Gemini key through the secure
prompt. Do not add it to `worker.js`, `wrangler.toml`, or the repository.
The configured production GitHub Pages URL is
`https://evvsk.github.io/SpellCraft--Alchemy-Battler-Game/`; its CORS origin is
`https://evvsk.github.io`. The Worker rejects requests from all other origins
and uses a fixed server-side card-generation prompt rather than forwarding
caller-supplied instructions. For local testing, temporarily add the exact
Live Server origin to `ALLOWED_ORIGINS` before deployment, then remove it for
the public production deployment.
Copy the resulting Worker URL into the frontend Settings & API modal, or
replace the default `SC_PROXY` value in `js/ai-service.js` for a controlled
production build.

### 2. Publish the frontend on GitHub Pages

Push the repository contents, including `index.html`, `css/`, and `js/`, to the
selected GitHub repository. In **Settings → Pages**, choose the production
branch and its root (`/`) as the source, then save. GitHub Pages serves the
static frontend; it does not need Node, a database, or the Gemini key.

After the Pages URL is live, open the game, confirm the Worker URL in **⚙
Settings & API**, and brew a card using both a standard reagent pair and a
custom word. Confirm the generated card, cached 0 ms repeat, boss weakness
critical hit, intermission choice, and fallback recovery path.

## Assessment evidence

| Criterion | Spellcraft implementation |
|---|---|
| Game concept & playability | Infinite Craft-style two-input alchemy feeds Slay the Spire-style card combat across Iron Automaton, Sun Wyrm, and The Void King, with Continue or Claim Victory after each non-final boss. |
| Runtime generative AI | `js/ai-service.js` calls `gemini-2.5-flash` with `responseMimeType: "application/json"` and generates card names, emojis, damage, block, and healing from custom input. |
| Secure edge architecture | `backend/worker.js` reads `env.GEMINI_API_KEY`; the key is provisioned as a Wrangler secret and is never hardcoded in client source. |
| Rate, latency, and errors | 12 requests/minute per IP, client recipe `Map` cache with 0 ms hits, 8.5-second aborts, HTTP error handling, and deterministic `buildFallbackCard()`. |
| Deployment | Live Server supports local evaluation; GitHub Pages hosts the static frontend; `npx wrangler deploy` publishes the Cloudflare proxy. |

## Security and push checklist

- Commit `.gitignore` and confirm `backend/.wrangler/` is ignored.
- Do not commit Gemini keys, `.env` files, browser-stored secrets, or Wrangler
  state.
- Configure `ALLOWED_ORIGINS` during Worker deployment; wildcard CORS is not
  used.
- The Worker ignores caller-supplied system prompts and validates prompt size.
- Card fields are rendered with DOM `textContent`, not HTML interpolation.
