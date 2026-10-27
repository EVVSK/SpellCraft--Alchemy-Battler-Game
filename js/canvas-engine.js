/* ==========================================================================
   Spellcraft — 2D HTML5 Canvas Battle Animation Engine
   Renders ambient arcane motes, ground ward rings, projectiles, shockwaves,
   cauldron brewing bubbles, and floating combat text at 60fps.
   ========================================================================== */

const canvas = document.getElementById("battleCanvas");
const ctx = canvas.getContext("2d");

let ambientMotes = [];
let projectiles = [];
let shockwaves = [];
let floatingTexts = [];
let brewBubbles = [];
let tick = 0;

function resizeCanvas() {
  if (!canvas || !canvas.parentElement) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width;
  canvas.height = rect.height;
}

window.addEventListener("resize", resizeCanvas);

function initAmbientMotes() {
  resizeCanvas();
  ambientMotes = Array.from({ length: 28 }, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height,
    r: 1.2 + Math.random() * 2.5,
    vx: (Math.random() - 0.5) * 0.4,
    vy: -0.25 - Math.random() * 0.45,
    color: Math.random() > 0.45 ? "#818cf8" : "#34d399",
    alpha: 0.25 + Math.random() * 0.55
  }));
}

function spawnProjectile(fromPlayer, color, labelText, isCrit = false) {
  const startX = fromPlayer ? canvas.width * 0.16 : canvas.width * 0.84;
  const targetX = fromPlayer ? canvas.width * 0.84 : canvas.width * 0.16;
  const y = canvas.height * 0.52;

  projectiles.push({
    x: startX,
    y,
    targetX,
    vx: (targetX - startX) / 22,
    color,
    labelText,
    isCrit,
    trail: []
  });
}

function spawnFloatingText(xRatio, yRatio, text, color) {
  floatingTexts.push({
    x: canvas.width * xRatio,
    y: canvas.height * yRatio,
    text,
    alpha: 1,
    color
  });
}

function spawnBrewBurst() {
  const cx = canvas.width * 0.5;
  const cy = canvas.height * 0.85;
  for (let i = 0; i < 18; i++) {
    brewBubbles.push({
      x: cx + (Math.random() - 0.5) * 160,
      y: cy,
      r: 3 + Math.random() * 5,
      vy: -1.4 - Math.random() * 2.2,
      alpha: 0.95
    });
  }
}

function animateBattleCanvas() {
  tick += 0.04;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const leftX = canvas.width * 0.14;
  const rightX = canvas.width * 0.86;
  const baseY = canvas.height * 0.68;

  // Ground ward rings
  ctx.save();
  ctx.strokeStyle = "rgba(99, 102, 241, 0.28)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(leftX, baseY, 48 + Math.sin(tick) * 4, 14, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(192, 132, 252, 0.28)";
  ctx.beginPath();
  ctx.ellipse(rightX, baseY, 52 + Math.cos(tick) * 4, 15, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // Ambient drifting motes
  ambientMotes.forEach(m => {
    m.x += m.vx;
    m.y += m.vy;
    if (m.y < -10) {
      m.y = canvas.height + 10;
      m.x = Math.random() * canvas.width;
    }
    ctx.save();
    ctx.globalAlpha = m.alpha;
    ctx.fillStyle = m.color;
    ctx.beginPath();
    ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  // Emerald cauldron bubbles
  for (let i = brewBubbles.length - 1; i >= 0; i--) {
    const b = brewBubbles[i];
    b.y += b.vy;
    b.alpha -= 0.022;
    if (b.alpha <= 0) {
      brewBubbles.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = b.alpha;
    ctx.strokeStyle = "#34d399";
    ctx.fillStyle = "rgba(16, 185, 129, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Projectiles
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.trail.push({ x: p.x, y: p.y });
    if (p.trail.length > 8) p.trail.shift();
    p.x += p.vx;

    p.trail.forEach((pt, idx) => {
      ctx.save();
      ctx.globalAlpha = ((idx + 1) / p.trail.length) * 0.55;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 4 + idx * 0.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });

    ctx.save();
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    if ((p.vx > 0 && p.x >= p.targetX) || (p.vx < 0 && p.x <= p.targetX)) {
      shockwaves.push({ x: p.targetX, y: p.y, r: 6, maxR: p.isCrit ? 62 : 44, alpha: 1, color: p.color });
      if (p.labelText) {
        floatingTexts.push({ x: p.targetX, y: p.y - 16, text: p.labelText, alpha: 1, color: p.color });
      }
      projectiles.splice(i, 1);
    }
  }

  // Shockwaves
  for (let i = shockwaves.length - 1; i >= 0; i--) {
    const s = shockwaves[i];
    s.r += 3.2;
    s.alpha -= 0.045;
    if (s.alpha <= 0) {
      shockwaves.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = s.alpha;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Floating combat numbers
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y -= 0.85;
    ft.alpha -= 0.02;
    if (ft.alpha <= 0) {
      floatingTexts.splice(i, 1);
      continue;
    }
    ctx.save();
    ctx.globalAlpha = ft.alpha;
    ctx.font = "bold 14px 'Plus Jakarta Sans', sans-serif";
    ctx.fillStyle = ft.color;
    ctx.textAlign = "center";
    ctx.fillText(ft.text, ft.x, ft.y);
    ctx.restore();
  }

  requestAnimationFrame(animateBattleCanvas);
}
