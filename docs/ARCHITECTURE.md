# Spellcraft Production Architecture

This document is the implementation reference for **Spellcraft: AI Alchemy
Card Battler** and maps the shipped architecture to the 10-mark Generative AI
in Gaming assessment.

## 1. Product and game architecture

Spellcraft deliberately joins two familiar game patterns:

- **Infinite Craft-style discovery:** the player combines two known reagents or
  any two custom words in the Alchemy Crucible.
- **Slay the Spire-style combat:** the resulting spell enters a hand of cards,
  costs an action to cast, and can deal damage, add block, or heal.

The combat state machine in [`js/game.js`](../js/game.js) owns player HP,
actions, block, hand, boss HP, stage progression, and game-over state. The
three encounter definitions are:

| Stage | Boss | HP | Intent damage | Weakness |
|---|---|---:|---:|---|
| 1 | Iron Automaton | 90 | 12 | Fire & Lightning |
| 2 | Sun Wyrm | 115 | 15 | Water & Ice |
| 3 | The Void King | 140 | 18 | Light & Alchemy |

When a card's name or recipe contains a stage weakness, its damage receives a
1.5x critical multiplier. A defeated non-final boss opens the intermission
overlay in [`index.html`](../index.html). The player chooses **Continue to Next
Boss** or **Stop & Claim Victory**. The final boss closes the complete
three-stage run with a Grand Sanctum victory. This explicit decision workflow
makes partial success playable while preserving a full-boss completion path.

The UI is split into three functional surfaces:

1. the animated battle arena from `canvas-engine.js`;
2. the Alchemy Crucible for base and custom ingredients; and
3. the Spell Grimoire, where generated and starter cards are cast.

## 2. Runtime Generative AI pipeline

The production request path is:

```text
Player inputs A + B
  → game.js checks recipe Map
  → ai-service.js builds prompts
  → Cloudflare Worker POST
  → Gemini gemini-2.5-flash
  → strict JSON response
  → numeric validation/clamping
  → AI Brewed card in hand
```

[`js/ai-service.js`](../js/ai-service.js) sends a system prompt requiring
exactly these fields:

```json
{
  "name": "string",
  "emoji": "single emoji",
  "damage": 12,
  "block": 0,
  "heal": 0
}
```

The direct Gemini path sets
`generationConfig.responseMimeType` to `"application/json"` and targets
`gemini-2.5-flash`. The Worker applies the same structured-output setting
when it forwards the request. As a result, card content is generated at
runtime from arbitrary player input rather than selected from a fixed card
catalog. The client supplies safe defaults and clamps values before rendering
the card, which is marked `⚗️ AI Brewed`.

## 3. Stateless Cloudflare edge proxy

The browser defaults to the Worker URL and sends a user recipe prompt.
[`backend/worker.js`](../backend/worker.js) performs the
server-side responsibilities:

1. allow CORS only for origins listed in `ALLOWED_ORIGINS`;
2. answer CORS preflight requests;
3. accept only POST requests;
4. validate the user prompt and ignore caller-supplied system instructions;
5. identify the caller with `CF-Connecting-IP`;
6. apply the per-IP request limit;
7. read `env.GEMINI_API_KEY`;
8. call the Gemini REST endpoint with the fixed card-generation prompt;
9. validate and normalize the generated JSON before returning it.

The key is not present in `index.html`, `js/ai-service.js`, or
`backend/worker.js`. [`backend/wrangler.toml`](../backend/wrangler.toml)
declares the Worker entry point and deployment name; the key is attached at
deployment time with `npx wrangler secret put GEMINI_API_KEY`. The Worker has
no application database and no durable game session, so it remains a
stateless proxy suitable for edge deployment.

The proxy is not an unrestricted public Gemini relay: wildcard CORS is
disabled, arbitrary system prompts are not forwarded, and prompt length is
bounded. The frontend also renders generated and custom-input values through
DOM `textContent` assignments rather than `innerHTML`, preventing model or
user text from becoming executable markup.

## 4. Rate limiting, latency, and failure behavior

### Rate limiting

The Worker maintains an in-memory per-IP request record with a 60-second
window and a maximum of 12 requests. Requests beyond the sliding-window
policy return HTTP 429 with a retry interval. The browser also tracks its
recent request timestamps and routes a client-side limit hit directly to the
fallback card instead of making another network call.

### Cache and latency

`game.js` creates a canonical recipe key by sorting the two ingredient names.
After the first successful or fallback synthesis, the resulting card is stored
in the `Map` cache. A repeat recipe is returned immediately and the settings
telemetry reports **0 ms (Cached)**.

Both sides of the network boundary use an 8,500 ms `AbortController` cutoff:

- the browser aborts a slow proxy request;
- the Worker aborts a slow Gemini request and returns HTTP 504.

The settings modal displays the latest measured latency or fallback reason,
which makes the behavior inspectable during a live evaluation.

### Fallback guarantee

`buildFallbackCard()` is the last-resort alchemy synthesizer. It first checks
curated combinations and then deterministically hashes cleaned input to select
an emoji and stable damage/block/heal values. It is used for missing
configuration, offline execution, HTTP failures, rate limits, timeouts, and
invalid upstream data. Because it returns the same card shape as a generated
card, the combat state machine can continue without an exception or an empty
hand.

## 5. Assessment rubric mapping

| Marks | Requirement | Evidence in the implementation |
|---:|---|---|
| 2 | Game concept & playability | Two-input/custom-word alchemy, playable card effects, three named boss stages, weakness critical hits, and post-boss Continue or Claim Victory. |
| 3 | Generative AI integration | Runtime `gemini-2.5-flash` invocation, strict JSON MIME response, and generated name, emoji, damage, block, and heal values. |
| 2 | Player interaction and progression | Pantry selection, custom input, crucible brew, hand casting, action economy, boss intents, and intermission decision UI. |
| 2 | Correctness and demonstration | Static modular frontend, repeat-recipe 0 ms cache, visible telemetry, deterministic fallback, and a complete start-to-finish run. |
| 1 | Implementation and error handling | Cloudflare secret proxy, 12/minute per-IP protection, 8.5-second aborts, explicit HTTP handling, and `buildFallbackCard()`. |

## 6. Local evaluation

No build step is required for the static frontend:

1. Open the project in VS Code.
2. Start **Live Server** from `index.html`.
3. Open **⚙ Settings & API**.
4. Enter the Worker URL, or leave both API fields empty to demonstrate the
   deterministic fallback.
5. Brew a standard pair, brew a custom-word pair, cast cards, defeat a boss,
   and select either intermission outcome.

Live Server is preferred over opening the file directly because it provides a
consistent local origin for browser fetch and module-free script loading.

## 7. Production deployment

### Cloudflare Worker

From `backend/`:

```powershell
npx wrangler login
npx wrangler deploy
npx wrangler secret put GEMINI_API_KEY
```

The secret prompt is the only place the production Gemini key should be
entered. Never commit it to source, a `.env` file intended for GitHub Pages,
or browser storage used by the shared deployment. The frontend has no direct
Gemini API-key input. The production Pages URL is
`https://evvsk.github.io/SpellCraft--Alchemy-Battler-Game/`; configure its CORS
origin as `https://evvsk.github.io`. Add local Live Server origins only for
temporary testing, and remove them before the public deployment.

### GitHub Pages frontend

Publish the repository root containing `index.html`, `css/`, and `js/` on the
selected GitHub Pages branch with the repository root as the Pages directory.
The frontend is static and needs no server-side build or database. After
publishing, configure the deployed Worker URL in the Settings & API modal and
verify:

- a live Gemini-generated card;
- a repeat recipe reported as 0 ms cached;
- a 429 or timeout producing a playable fallback;
- a weakness critical hit;
- Continue and Stop & Claim Victory behavior.

## 8. Source ownership

| Component | Responsibility |
|---|---|
| `index.html` | Application shell, crucible, hand, settings, and intermission UI |
| `css/styles.css` | Responsive visual design and status styling |
| `js/game.js` | Combat state, boss progression, recipe cache, and card rendering |
| `js/ai-service.js` | Prompting, Gemini requests, client limit, timeout, and fallback |
| `js/canvas-engine.js` | Canvas-based combat and brewing effects |
| `backend/worker.js` | CORS, per-IP control, server timeout, and Gemini proxy |
| `backend/wrangler.toml` | Cloudflare Worker deployment metadata |
