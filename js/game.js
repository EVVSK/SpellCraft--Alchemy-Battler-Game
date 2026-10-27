/* ==========================================================================
   Spellcraft — Core Combat State Machine, Card Brewing & UI Controller
   ========================================================================== */

const BOSSES = [
  {
    name: "Iron Automaton",
    avatar: "🤖",
    maxHp: 90,
    dmg: 12,
    weakness: "Fire & Lightning",
    weakKeywords: ["fire", "flame", "magma", "spark", "lightning", "steam", "acid"]
  },
  {
    name: "Sun Wyrm",
    avatar: "🐉",
    maxHp: 115,
    dmg: 15,
    weakness: "Water & Ice",
    weakKeywords: ["water", "ice", "frost", "wave", "mist", "mirror", "stone"]
  },
  {
    name: "The Void King",
    avatar: "👁️",
    maxHp: 140,
    dmg: 18,
    weakness: "Light & Alchemy",
    weakKeywords: ["mirror", "light", "sun", "venom", "crystal", "storm"]
  }
];

let state = {
  bossIdx: 0,
  bossHp: 90,
  playerHp: 80,
  playerMaxHp: 80,
  playerBlock: 0,
  energy: 2,
  forgedThisTurn: false,
  slotA: null,
  slotB: null,
  hand: [],
  awaitingIntermission: false,
  gameOver: false
};

function resetGame() {
  state.bossIdx = 0;
  state.bossHp = BOSSES[0].maxHp;
  state.playerHp = 80;
  state.playerBlock = 0;
  state.energy = 2;
  state.forgedThisTurn = false;
  state.slotA = null;
  state.slotB = null;
  state.awaitingIntermission = false;
  state.gameOver = false;
  state.hand = [
    { name: "Cinder Bolt", emoji: "🔥", damage: 18, block: 0, heal: 0, recipe: "Starter Grimoire", isAI: false },
    { name: "Stone Ward", emoji: "🪨", damage: 8, block: 12, heal: 0, recipe: "Starter Grimoire", isAI: false },
    { name: "Healing Mist", emoji: "💧", damage: 0, block: 6, heal: 10, recipe: "Starter Grimoire", isAI: false }
  ];
  document.getElementById("intermissionOverlay").classList.remove("active");
  setBanner("Pick two reagents in the green Crucible to brew a spell card, or cast a card from your hand!");
  render();
}

function render() {
  const boss = BOSSES[state.bossIdx];
  document.getElementById("stageBadge").textContent = `Encounter ${state.bossIdx + 1} of ${BOSSES.length}`;
  document.getElementById("bossName").textContent = boss.name;
  document.getElementById("bossAvatar").textContent = boss.avatar;
  document.getElementById("bossWeakness").textContent = `Weak to ${boss.weakness} (1.5x)`;
  document.getElementById("bossHpText").textContent = `${state.bossHp} / ${boss.maxHp} HP`;
  document.getElementById("bossHpBar").style.width = `${(state.bossHp / boss.maxHp) * 100}%`;
  document.getElementById("bossIntent").textContent = `Next: Strike ${boss.dmg}`;

  document.getElementById("playerHpText").textContent = `${state.playerHp} / ${state.playerMaxHp} HP`;
  document.getElementById("playerHpBar").style.width = `${(state.playerHp / state.playerMaxHp) * 100}%`;
  document.getElementById("playerBlock").textContent = state.playerBlock;
  document.getElementById("energyText").textContent = `${state.energy} / 2`;

  const slotAEl = document.getElementById("slotA");
  const slotBEl = document.getElementById("slotB");
  slotAEl.textContent = state.slotA || "Select 1st Reagent";
  slotBEl.textContent = state.slotB || "Select 2nd Reagent";
  slotAEl.className = `slot ${state.slotA ? "filled" : ""}`;
  slotBEl.className = `slot ${state.slotB ? "filled" : ""}`;

  const forgeBtn = document.getElementById("forgeBtn");
  forgeBtn.disabled = !(state.slotA && state.slotB) || state.forgedThisTurn || state.gameOver || state.awaitingIntermission;
  document.getElementById("forgeStatus").textContent = state.forgedThisTurn
    ? "✓ Brewed 1 card this turn"
    : "1 Brew available this turn";

  const handContainer = document.getElementById("handContainer");
  handContainer.replaceChildren();
  state.hand.forEach((card, i) => {
    const cardElement = document.createElement("div");
    cardElement.className = "spell-card";
    cardElement.addEventListener("click", () => playCard(i));

    const content = document.createElement("div");
    const top = document.createElement("div");
    top.className = "card-top";
    const emoji = document.createElement("span");
    emoji.className = "card-emoji";
    emoji.textContent = card.emoji;
    const tag = document.createElement("span");
    tag.className = `card-tag ${card.isAI ? "ai" : ""}`;
    tag.textContent = card.isAI ? "⚗️ AI Brewed" : "Base Spell";
    top.append(emoji, tag);

    const title = document.createElement("h3");
    title.className = "card-title serif";
    title.textContent = card.name;
    const recipe = document.createElement("div");
    recipe.className = "card-recipe";
    recipe.textContent = card.recipe;
    content.append(top, title, recipe);

    const stats = document.createElement("div");
    stats.className = "card-stats";
    if (card.damage > 0) stats.append(createCardStat("stat-dmg", `⚔ ${card.damage} Dmg`));
    if (card.block > 0) stats.append(createCardStat("stat-blk", `🛡 ${card.block} Shield`));
    if (card.heal > 0) stats.append(createCardStat("stat-heal", `✚ ${card.heal} Heal`));
    cardElement.append(content, stats);
    handContainer.append(cardElement);
  });
}

function createCardStat(className, text) {
  const stat = document.createElement("span");
  stat.className = className;
  stat.textContent = text;
  return stat;
}

function setBanner(msg) {
  document.getElementById("combatBanner").textContent = msg;
}

function pickIngredient(item) {
  if (state.gameOver || state.awaitingIntermission) return;
  if (!state.slotA) state.slotA = item;
  else if (!state.slotB) state.slotB = item;
  else state.slotB = item;
  render();
}

function addCustomIngredient() {
  const input = document.getElementById("customIngredient");
  const val = input.value.trim();
  if (!val) return;
  pickIngredient(`${val} ✨`);
  input.value = "";
}

function clearSlot(which) {
  if (which === "A") state.slotA = null;
  if (which === "B") state.slotB = null;
  render();
}

async function forgeSpellCard() {
  if (!state.slotA || !state.slotB || state.forgedThisTurn || state.awaitingIntermission) return;

  const ingA = state.slotA;
  const ingB = state.slotB;
  const key = [ingA, ingB].sort().join(" + ");

  const forgeBtn = document.getElementById("forgeBtn");
  forgeBtn.disabled = true;
  forgeBtn.textContent = "⚗️ Brewing...";
  setBanner(`Brewing ${ingA} and ${ingB} in the cauldron...`);
  spawnBrewBurst();

  let card;
  if (recipeCache.has(key)) {
    card = { ...recipeCache.get(key) };
    document.getElementById("latencyStat").textContent = "0 ms (Cached)";
  } else {
    card = await generateCardWithAI(ingA, ingB);
    recipeCache.set(key, card);
  }

  state.hand.push(card);
  state.slotA = null;
  state.slotB = null;
  state.forgedThisTurn = true;
  forgeBtn.textContent = "⚗️ Brew Spell Card";
  setBanner(`Brewed "${card.name}" (${card.emoji})! Click it in your hand to cast.`);
  render();
}

function playCard(index) {
  if (state.gameOver || state.awaitingIntermission) return;
  if (state.energy <= 0) {
    setBanner("Out of actions! Click 'End Turn →' to refresh your actions.");
    return;
  }

  const card = state.hand[index];
  const boss = BOSSES[state.bossIdx];
  state.hand.splice(index, 1);
  state.energy -= 1;

  const textToCheck = `${card.name} ${card.recipe}`.toLowerCase();
  const isCrit = boss.weakKeywords.some(k => textToCheck.includes(k));
  const finalDamage = isCrit ? Math.round(card.damage * 1.5) : card.damage;

  state.bossHp = Math.max(0, state.bossHp - finalDamage);
  state.playerBlock += card.block;
  state.playerHp = Math.min(state.playerMaxHp, state.playerHp + card.heal);

  const pEl = document.getElementById("playerFighter");
  pEl.style.transform = "translateX(12px)";
  setTimeout(() => (pEl.style.transform = "translateX(0)"), 180);

  if (finalDamage > 0) {
    spawnProjectile(true, isCrit ? "#fbbf24" : "#34d399", `-${finalDamage}${isCrit ? " CRIT!" : ""}`, isCrit);
  } else {
    spawnFloatingText(0.16, 0.4, `+${card.block}🛡 / +${card.heal}✚`, "#38bdf8");
  }

  setBanner(
    `Cast ${card.name}! Dealt ${finalDamage} dmg${isCrit ? " (1.5x Weakness Hit!)" : ""}${card.block ? `, +${card.block} Shield` : ""}${card.heal ? `, +${card.heal} HP` : ""}.`
  );

  if (state.bossHp <= 0) {
    handleBossDefeated();
  }
  render();
}

function handleBossDefeated() {
  const defeatedBoss = BOSSES[state.bossIdx];
  if (state.bossIdx < BOSSES.length - 1) {
    state.awaitingIntermission = true;
    const nextBoss = BOSSES[state.bossIdx + 1];
    document.getElementById("intermissionTitle").textContent = `✨ ${defeatedBoss.name} Vanquished!`;
    document.getElementById("intermissionDesc").textContent =
      `You defeated ${defeatedBoss.name}! Up next is ${nextBoss.name} (${nextBoss.maxHp} HP). Would you like to continue fighting or claim your victory now?`;
    document.getElementById("intermissionOverlay").classList.add("active");
  } else {
    state.gameOver = true;
    setBanner("🏆 Grand Sanctum Cleared! You conquered all 3 bosses with your AI-brewed spell deck!");
  }
}

function continueToNextBoss() {
  state.bossIdx += 1;
  const nextBoss = BOSSES[state.bossIdx];
  state.bossHp = nextBoss.maxHp;
  state.playerHp = Math.min(state.playerMaxHp, state.playerHp + 15);
  state.energy = 2;
  state.forgedThisTurn = false;
  state.awaitingIntermission = false;
  document.getElementById("intermissionOverlay").classList.remove("active");
  setBanner(`⚔️ ${nextBoss.name} emerges! (+15 HP restored). Your turn: 2 Actions ready.`);
  render();
}

function stopAndClaimVictory() {
  state.awaitingIntermission = false;
  state.gameOver = true;
  document.getElementById("intermissionOverlay").classList.remove("active");
  setBanner(`🏆 Victory Claimed! You retired as Champion after vanquishing ${BOSSES[state.bossIdx].name} with ${state.playerHp} HP remaining!`);
  render();
}

function endTurn() {
  if (state.gameOver || state.awaitingIntermission) return;
  const boss = BOSSES[state.bossIdx];
  const incoming = Math.max(0, boss.dmg - state.playerBlock);
  state.playerHp = Math.max(0, state.playerHp - incoming);
  state.playerBlock = 0;
  state.energy = 2;
  state.forgedThisTurn = false;

  const bEl = document.getElementById("bossFighter");
  bEl.style.transform = "translateX(-12px)";
  setTimeout(() => (bEl.style.transform = "translateX(0)"), 180);

  spawnProjectile(false, "#fb7185", incoming > 0 ? `-${incoming} HP` : "BLOCKED!");

  if (state.playerHp <= 0) {
    state.gameOver = true;
    setBanner(`Fallen in battle against ${boss.name}. Click '↻ New Run' to play again.`);
  } else {
    setBanner(`${boss.name} struck for ${boss.dmg} (${incoming} unblocked). Your turn: 2 Actions ready.`);
  }
  render();
}

function toggleSettings() {
  const modal = document.getElementById("settingsModal");
  document.getElementById("proxyInput").value = config.proxyUrl;
  modal.classList.toggle("open");
}

function saveSettings() {
  config.proxyUrl = document.getElementById("proxyInput").value.trim();
  localStorage.setItem("SC_PROXY", config.proxyUrl);
  toggleSettings();
  setBanner("API & Proxy configuration saved.");
}

function simulateError() {
  document.getElementById("latencyStat").textContent = "Simulated 429/Timeout -> Recovered";
  const fallback = buildFallbackCard("Fire 🔥", "Mirror 🪞");
  state.hand.push(fallback);
  toggleSettings();
  spawnBrewBurst();
  setBanner(`[Error Handler Active] Simulated API failure recovered gracefully: Brewed "${fallback.name}" into your hand.`);
  render();
}

// Boot Game
window.addEventListener("DOMContentLoaded", () => {
  initAmbientMotes();
  animateBattleCanvas();
  resetGame();
});
