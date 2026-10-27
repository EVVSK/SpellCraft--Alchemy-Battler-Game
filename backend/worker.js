/**
 * Stateless Edge Proxy (Cloudflare Worker) for Spellcraft
 * Features:
 * 1. Protects GEMINI_API_KEY in secure server-side environment variables
 * 2. Sliding-window Per-IP Rate Limiter (12 requests / minute per IP)
 * 3. Strict Latency Controller (8.5-second AbortController cutoff)
 * 4. Enforces structured JSON output from Gemini 2.5 Flash
 */

const rateLimitMap = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 12;
const UPSTREAM_TIMEOUT_MS = 8500;
const MAX_PROMPT_LENGTH = 200;
const CARD_SYSTEM_PROMPT = `You are the alchemy engine for a wizard card battler. Combine the two reagents into a creative spell card.
Return ONLY valid JSON with this exact structure:
{
  "name": "string (2-3 words max, evocative spell name)",
  "emoji": "single emoji representing the combined spell",
  "damage": integer between 12 and 30,
  "block": integer between 0 and 18,
  "heal": integer between 0 and 14
}`;

function getAllowedOrigin(request, env) {
  const origin = request.headers.get("Origin");
  const configuredOrigins = (env.ALLOWED_ORIGINS || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean);
  return origin && configuredOrigins.includes(origin) ? origin : null;
}

function jsonResponse(body, status, origin) {
  const headers = {
    "Content-Type": "application/json",
    "Vary": "Origin"
  };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Methods"] = "POST, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

export default {
  async fetch(request, env) {
    const origin = getAllowedOrigin(request, env);
    if (!origin) {
      return jsonResponse({ error: "Origin is not allowed" }, 403, null);
    }

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": origin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
          "Vary": "Origin"
        }
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405, origin);
    }

    // 1. Per-IP Sliding Window Rate Limiter
    const clientIP = request.headers.get("CF-Connecting-IP") || "anonymous";
    const now = Date.now();
    const record = rateLimitMap.get(clientIP) || { count: 0, resetAt: now + WINDOW_MS };

    if (now > record.resetAt) {
      record.count = 0;
      record.resetAt = now + WINDOW_MS;
    }

    record.count += 1;
    rateLimitMap.set(clientIP, record);

    if (record.count > MAX_REQUESTS_PER_WINDOW) {
      const waitSec = Math.ceil((record.resetAt - now) / 1000);
      return jsonResponse({ error: `Rate limit exceeded. Try again in ${waitSec}s.` }, 429, origin);
    }

    // 2. Latency Controller (AbortController Timeout)
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);

    try {
      const body = await request.json();
      const userPrompt = body?.userPrompt;
      if (typeof userPrompt !== "string" || userPrompt.length === 0 || userPrompt.length > MAX_PROMPT_LENGTH) {
        return jsonResponse({ error: "Invalid userPrompt" }, 400, origin);
      }

      const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${env.GEMINI_API_KEY}`;
      const upstream = await fetch(url, {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: CARD_SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userPrompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 300,
            responseMimeType: "application/json"
          }
        })
      });

      clearTimeout(timer);

      if (!upstream.ok) {
        const errText = await upstream.text();
        throw new Error(`Upstream Gemini HTTP ${upstream.status}: ${errText}`);
      }

      const data = await upstream.json();
      const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      const card = JSON.parse(rawJson);
      const safeCard = {
        name: typeof card.name === "string" ? card.name.slice(0, 60) : "Aether Surge",
        emoji: typeof card.emoji === "string" ? card.emoji.slice(0, 8) : "✨",
        damage: Number.isFinite(Number(card.damage)) ? Number(card.damage) : 18,
        block: Number.isFinite(Number(card.block)) ? Number(card.block) : 6,
        heal: Number.isFinite(Number(card.heal)) ? Number(card.heal) : 0
      };

      return jsonResponse(safeCard, 200, origin);
    } catch (err) {
      clearTimeout(timer);
      const isTimeout = err.name === "AbortError";
      return jsonResponse({
        error: isTimeout ? "Upstream latency cutoff exceeded (8.5s)" : "Upstream generation failed"
      }, isTimeout ? 504 : 500, origin);
    }
  }
};
