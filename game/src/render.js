// Everything the player sees: the starfield arena, glow-drawn ships and swarms, the HUD, and the
// six screens (title, play, paused, level-up, game over, victory). Pure canvas, all art drawn in
// code — no images. The renderer only reads world state; it never changes it.

import { BOSS_WAVES, COLORS, FIELD, FINAL_WAVE } from './config.js';
import { createRandom } from './random.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVELUP = 'levelup';
export const SCREEN_OVER = 'over';
export const SCREEN_VICTORY = 'victory';

const TAU = Math.PI * 2;
const FONT = '"Segoe UI", system-ui, -apple-system, sans-serif';

// The upgrade cards' geometry lives here so main.js hit-tests clicks against the same rects.
export const CARD_W = 348;
export const CARD_H = 216;
export function upgradeCardRects(count) {
  const gap = 26;
  const total = count * CARD_W + (count - 1) * gap;
  const x0 = (FIELD.width - total) / 2;
  return Array.from({ length: count }, (_, i) => ({ x: x0 + i * (CARD_W + gap), y: 292, w: CARD_W, h: CARD_H }));
}

// A fixed starfield and nebula, generated once from a fixed seed (identical on every load).
const starRandom = createRandom(20261117);
const STARS = Array.from({ length: 210 }, () => ({
  x: starRandom.next() * FIELD.width,
  y: starRandom.next() * FIELD.height,
  r: starRandom.range(0.6, 1.9),
  layer: starRandom.chance(0.5) ? 0.35 : 1,
  tw: starRandom.range(0, TAU),
}));
const NEBULAE = [
  { x: 240, y: 150, r: 340, color: 'rgba(64, 60, 180, 0.20)' },
  { x: 1060, y: 560, r: 380, color: 'rgba(150, 30, 120, 0.16)' },
  { x: 880, y: 110, r: 260, color: 'rgba(20, 120, 160, 0.15)' },
  { x: 180, y: 620, r: 280, color: 'rgba(30, 60, 160, 0.14)' },
];

function txt(ctx, str, x, y, size, color, align = 'center', weight = 700, glow = 0) {
  ctx.save();
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (glow > 0) {
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
  }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
  ctx.restore();
}

function bar(ctx, x, y, w, h, frac, fill, back = 'rgba(255,255,255,0.13)') {
  const f = Math.max(0, Math.min(1, frac));
  ctx.fillStyle = back;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w * f, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}

function polygon(ctx, x, y, radius, sides, rot) {
  ctx.beginPath();
  for (let i = 0; i < sides; i += 1) {
    const a = rot + (i / sides) * TAU;
    const px = x + Math.cos(a) * radius;
    const py = y + Math.sin(a) * radius;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawBackground(ctx, state) {
  const grad = ctx.createLinearGradient(0, 0, 0, FIELD.height);
  grad.addColorStop(0, '#070a1e');
  grad.addColorStop(0.55, '#04050d');
  grad.addColorStop(1, '#0a0618');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  for (const n of NEBULAE) {
    const drift = Math.sin(state.time * 0.05 + n.x) * 12;
    const g = ctx.createRadialGradient(n.x + drift, n.y, 0, n.x + drift, n.y, n.r);
    g.addColorStop(0, n.color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(n.x - n.r, n.y - n.r, n.r * 2, n.r * 2);
  }
  // A faint arena grid.
  ctx.strokeStyle = 'rgba(90, 160, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = 64; x < FIELD.width; x += 64) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, FIELD.height);
  }
  for (let y = 64; y < FIELD.height; y += 64) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(FIELD.width, y + 0.5);
  }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(110, 231, 255, 0.20)';
  ctx.strokeRect(1, 1, FIELD.width - 2, FIELD.height - 2);
  for (const s of STARS) {
    const a = 0.35 + 0.65 * Math.abs(Math.sin(state.time * 0.7 * s.layer + s.tw));
    ctx.globalAlpha = a;
    ctx.fillStyle = '#cfe9ff';
    ctx.fillRect(s.x, s.y, s.r, s.r);
  }
  ctx.globalAlpha = 1;
}

function drawGem(ctx, g, time) {
  const bob = Math.sin(g.t * 4) * 2;
  const pulse = 1 + Math.sin(g.t * 6) * 0.12;
  ctx.save();
  ctx.translate(g.x, g.y + bob);
  ctx.rotate(Math.PI / 4 + g.t * 1.5);
  ctx.shadowColor = COLORS.xp;
  ctx.shadowBlur = 12;
  ctx.fillStyle = COLORS.xp;
  const r = 6 * pulse;
  ctx.fillRect(-r / 1.4, -r / 1.4, r * 1.4, r * 1.4);
  ctx.restore();
}

function drawEnemy(ctx, e, time) {
  ctx.save();
  ctx.translate(e.x, e.y);
  if (e.spawnT > 0) {
    // Spawn telegraph: a warning ring collapsing onto the shape as it materialises.
    const f = 1 - e.spawnT / 0.55;
    ctx.globalAlpha = 0.25 + f * 0.5;
    ctx.strokeStyle = e.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius + (1 - f) * 26, 0, TAU);
    ctx.stroke();
  }
  ctx.shadowColor = e.color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = e.color;
  ctx.strokeStyle = 'rgba(255,255,255,0.75)';
  ctx.lineWidth = 1.4;
  const rot = e.t * 0.9;
  if (e.shape === 'diamond') {
    polygon(ctx, 0, 0, e.radius, 4, rot);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0b0e1d';
    polygon(ctx, 0, 0, e.radius * 0.45, 4, -rot * 1.4);
    ctx.fill();
  } else if (e.shape === 'spike') {
    const aim = Math.atan2(ctx.__aimY - e.y, ctx.__aimX - e.x);
    ctx.rotate(aim);
    ctx.beginPath();
    ctx.moveTo(e.radius * 1.25, 0);
    ctx.lineTo(-e.radius * 0.8, e.radius * 0.75);
    ctx.lineTo(-e.radius * 0.35, 0);
    ctx.lineTo(-e.radius * 0.8, -e.radius * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else if (e.shape === 'hex') {
    polygon(ctx, 0, 0, e.radius, 6, rot * 0.6);
    ctx.fill();
    ctx.stroke();
    const charging = e.fireT < 0.4;
    ctx.fillStyle = charging ? '#ffffff' : '#0b0e1d';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.38, 0, TAU);
    ctx.fill();
  } else if (e.shape === 'pentagon') {
    polygon(ctx, 0, 0, e.radius, 5, rot * 0.5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(11,14,29,0.85)';
    polygon(ctx, 0, 0, e.radius * 0.62, 5, -rot * 0.8);
    ctx.fill();
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * 0.22, 0, TAU);
    ctx.fill();
  } else if (e.shape === 'warden') {
    const enraged = e.hp < e.maxHp / 2;
    const col = enraged ? '#ff4757' : e.color;
    ctx.shadowColor = col;
    ctx.fillStyle = col;
    polygon(ctx, 0, 0, e.radius, 8, rot * 0.35);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#0b0e1d';
    polygon(ctx, 0, 0, e.radius * 0.68, 8, -rot * 0.5);
    ctx.fill();
    ctx.fillStyle = col;
    polygon(ctx, 0, 0, e.radius * 0.42, 4, rot);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, e.radius * (0.16 + 0.03 * Math.sin(time * 5)), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  // A health tick for anything tougher than a one-shot.
  if (e.maxHp >= 30 && e.hp < e.maxHp && e.spawnT <= 0) {
    const w = e.radius * 2;
    bar(ctx, e.x - e.radius, e.y - e.radius - 12, w, 4, e.hp / e.maxHp, e.color);
  }
}

function drawPlayer(ctx, p, time) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  if (p.invuln > 0) ctx.globalAlpha = 0.45 + 0.4 * Math.sin(time * 40);
  // Engine flame.
  if (p.thrust > 0.1) {
    const len = 14 + p.thrust * 12 + Math.sin(time * 34) * 3;
    ctx.fillStyle = 'rgba(64, 224, 255, 0.8)';
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(-12, 5);
    ctx.lineTo(-12 - len, 0);
    ctx.lineTo(-12, -5);
    ctx.closePath();
    ctx.fill();
  }
  ctx.shadowColor = COLORS.cyan;
  ctx.shadowBlur = 18;
  ctx.fillStyle = '#59f2ff';
  ctx.strokeStyle = '#e8fbff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(19, 0);
  ctx.lineTo(-7, 7);
  ctx.lineTo(-13, 13);
  ctx.lineTo(-9, 0);
  ctx.lineTo(-13, -13);
  ctx.lineTo(-7, -7);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(3, 0, 4.4, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawWorld(ctx, state) {
  for (const g of state.gems) drawGem(ctx, g, state.time);
  // Enemy orbs.
  for (const o of state.orbs) {
    ctx.save();
    ctx.shadowColor = o.color;
    ctx.shadowBlur = 13;
    ctx.fillStyle = o.color;
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(o.x, o.y, o.r * 0.4, 0, TAU);
    ctx.fill();
    ctx.restore();
  }
  ctx.__aimX = state.player.x;
  ctx.__aimY = state.player.y;
  for (const e of state.enemies) drawEnemy(ctx, e, state.time);
  if (!state.over) drawPlayer(ctx, state.player, state.time);
  // Bullets.
  ctx.save();
  ctx.strokeStyle = '#aef7ff';
  ctx.shadowColor = COLORS.cyan;
  ctx.shadowBlur = 9;
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const b of state.bullets) {
    ctx.moveTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016);
    ctx.lineTo(b.x, b.y);
  }
  ctx.stroke();
  ctx.restore();
  // Particles (additive).
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (const pt of state.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.maxLife);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
  ctx.globalAlpha = 1;
  // Floating texts.
  for (const t of state.texts) {
    ctx.save();
    ctx.globalAlpha = Math.max(0, t.life / t.maxLife);
    txt(ctx, t.text, t.x, t.y, t.size, t.color, 'center', 800);
    ctx.restore();
  }
}

function drawHud(ctx, state, best, muted) {
  const p = state.player;
  // Hull.
  txt(ctx, 'HULL', 24, 26, 12, COLORS.dim, 'left', 800);
  bar(ctx, 24, 38, 230, 14, p.hp / p.maxHp, p.hp / p.maxHp < 0.3 ? COLORS.red : COLORS.green);
  txt(ctx, `${Math.ceil(p.hp)} / ${p.maxHp}`, 140, 45, 12, COLORS.text, 'center', 800);
  // Level and XP.
  txt(ctx, `LV ${p.level}`, 24, 74, 14, COLORS.xp, 'left', 800);
  bar(ctx, 84, 68, 170, 9, p.xp / p.xpNeed, COLORS.xp);
  // Wave and hostiles, centre.
  txt(ctx, `WAVE ${Math.max(1, state.wave)} / ${FINAL_WAVE}`, FIELD.width / 2, 30, 19, COLORS.text, 'center', 800, 8);
  const left = state.toSpawn + state.enemies.filter((e) => e.kind !== 'boss').length;
  txt(ctx, state.boss ? 'BOSS FIGHT' : `${left} hostiles left`, FIELD.width / 2, 54, 12, state.boss ? COLORS.violet : COLORS.dim);
  // Score, right.
  txt(ctx, 'SCORE', FIELD.width - 24, 26, 12, COLORS.dim, 'right', 800);
  txt(ctx, String(state.score), FIELD.width - 24, 48, 22, COLORS.amber, 'right', 800, 8);
  txt(ctx, `best ${Math.max(best, state.score)}`, FIELD.width - 24, 70, 12, COLORS.dim, 'right');
  // Boss bar.
  if (state.boss) {
    const name = state.wave === FINAL_WAVE ? 'THE VOID WARDEN' : 'THE VOID SENTINEL';
    txt(ctx, name, FIELD.width / 2, 88, 13, COLORS.violet, 'center', 800, 8);
    bar(ctx, FIELD.width / 2 - 210, 98, 420, 10, state.boss.hp / state.boss.maxHp, COLORS.violet);
  }
  // Controls reminder + mute state.
  txt(ctx, 'WASD move · mouse aim · hold to fire · P pause · M sound ' + (muted ? '(off)' : '(on)'), FIELD.width / 2, FIELD.height - 16, 12, 'rgba(143,184,216,0.75)');
  // Low-hull warning vignette.
  if (p.hp / p.maxHp < 0.3 && !state.over) {
    const a = 0.16 + 0.1 * Math.sin(state.time * 6);
    const g = ctx.createRadialGradient(640, 360, 260, 640, 360, 720);
    g.addColorStop(0, 'rgba(255,0,0,0)');
    g.addColorStop(1, `rgba(255,40,60,${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
  }
}

function drawBanner(ctx, state) {
  if (!state.banner) return;
  const b = state.banner;
  const f = Math.min(1, (b.max - b.t) * 4, b.t * 2.2);
  ctx.save();
  ctx.globalAlpha = Math.max(0, f);
  txt(ctx, b.title, FIELD.width / 2, 168, 40, COLORS.text, 'center', 800, 18);
  txt(ctx, b.sub, FIELD.width / 2, 202, 16, COLORS.dim);
  ctx.restore();
}

function veil(ctx, alpha) {
  ctx.fillStyle = `rgba(3, 5, 14, ${alpha})`;
  ctx.fillRect(0, 0, FIELD.width, FIELD.height);
}

function statsLines(ctx, state, best, y) {
  const lines = [
    ['SCORE', String(state.score)],
    ['BEST', String(Math.max(best, state.score))],
    ['WAVE REACHED', `${Math.max(1, state.wave)} / ${FINAL_WAVE}`],
    ['KILLS', String(state.kills)],
    ['LEVEL', String(state.player.level)],
    ['TIME', `${Math.floor(state.time / 60)}:${String(Math.floor(state.time % 60)).padStart(2, '0')}`],
  ];
  lines.forEach(([k, v], i) => {
    const x = FIELD.width / 2 - 250 + (i % 3) * 250;
    const yy = y + Math.floor(i / 3) * 58;
    txt(ctx, k, x, yy, 12, COLORS.dim, 'center', 800);
    txt(ctx, v, x, yy + 24, 24, COLORS.text, 'center', 800, 6);
  });
}

function drawTitle(ctx, state, best) {
  veil(ctx, 0.45);
  txt(ctx, 'NEON', FIELD.width / 2 - 128, 218, 92, COLORS.cyan, 'center', 800, 34);
  txt(ctx, 'VOID', FIELD.width / 2 + 148, 218, 92, COLORS.magenta, 'center', 800, 34);
  txt(ctx, 'ARENA SURVIVAL', FIELD.width / 2, 282, 21, COLORS.text, 'center', 700, 8);
  txt(ctx, 'Ten waves of the swarm. One pilot. Survive the bosses on waves 5 and 10.', FIELD.width / 2, 322, 16, COLORS.dim);
  const controls = [
    'WASD / arrows — fly',
    'Mouse — aim · hold click or Space — fire',
    'Collect XP, level up, build your ship',
    'P — pause · M — sound',
  ];
  controls.forEach((line, i) => txt(ctx, line, FIELD.width / 2, 372 + i * 25, 15, '#b9d9f2'));
  const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
  ctx.save();
  ctx.globalAlpha = pulse;
  txt(ctx, 'CLICK OR PRESS ENTER TO LAUNCH', FIELD.width / 2, 512, 21, COLORS.amber, 'center', 800, 12);
  ctx.restore();
  if (best > 0) txt(ctx, `BEST SCORE  ${best}`, FIELD.width / 2, 556, 15, COLORS.dim);
}

function drawPaused(ctx) {
  veil(ctx, 0.6);
  txt(ctx, 'PAUSED', FIELD.width / 2, 330, 52, COLORS.text, 'center', 800, 16);
  txt(ctx, 'P or Esc to resume', FIELD.width / 2, 382, 17, COLORS.dim);
}

const ICON_DRAW = {
  dmg: (ctx, x, y) => { polygon(ctx, x, y, 13, 4, 0); ctx.fill(); },
  rate: (ctx, x, y) => { polygon(ctx, x, y, 13, 3, -Math.PI / 2); ctx.fill(); },
  split: (ctx, x, y) => { [-11, 0, 11].forEach((dx) => { ctx.beginPath(); ctx.arc(x + dx, y, 5.5, 0, TAU); ctx.fill(); }); },
  pierce: (ctx, x, y) => { ctx.fillRect(x - 16, y - 3, 32, 6); ctx.beginPath(); ctx.moveTo(x + 16, y - 8); ctx.lineTo(x + 26, y); ctx.lineTo(x + 16, y + 8); ctx.closePath(); ctx.fill(); },
  speed: (ctx, x, y) => { ctx.beginPath(); ctx.moveTo(x + 12, y); ctx.lineTo(x - 8, y - 11); ctx.lineTo(x - 2, y); ctx.lineTo(x - 8, y + 11); ctx.closePath(); ctx.fill(); },
  hp: (ctx, x, y) => { ctx.fillRect(x - 5, y - 14, 10, 28); ctx.fillRect(x - 14, y - 5, 28, 10); },
  magnet: (ctx, x, y) => { ctx.beginPath(); ctx.arc(x, y, 12, Math.PI, 0); ctx.lineTo(x + 12, y + 10); ctx.lineTo(x + 4, y + 10); ctx.lineTo(x + 4, y); ctx.lineTo(x - 4, y); ctx.lineTo(x - 4, y + 10); ctx.lineTo(x - 12, y + 10); ctx.lineTo(x - 12, y); ctx.closePath(); ctx.fill(); },
  regen: (ctx, x, y) => { ctx.beginPath(); ctx.arc(x, y, 12, 0, TAU); ctx.fill(); ctx.fillStyle = '#0b0e1d'; ctx.fillRect(x - 2.5, y - 8, 5, 16); ctx.fillRect(x - 8, y - 2.5, 16, 5); },
  rail: (ctx, x, y) => { ctx.fillRect(x - 18, y - 2.5, 26, 5); polygon(ctx, x + 13, y, 7, 4, 0); ctx.fill(); },
  score: (ctx, x, y) => { polygon(ctx, x, y, 13, 5, -Math.PI / 2); ctx.fill(); },
};

function drawLevelup(ctx, state) {
  veil(ctx, 0.62);
  txt(ctx, 'LEVEL UP', FIELD.width / 2, 168, 44, COLORS.xp, 'center', 800, 20);
  txt(ctx, `Level ${state.player.level} — choose one upgrade (click, or press 1 · 2 · 3)`, FIELD.width / 2, 208, 16, COLORS.dim);
  const rects = upgradeCardRects(state.choices.length);
  state.choices.forEach((choice, i) => {
    const r = rects[i];
    ctx.save();
    ctx.fillStyle = COLORS.panel;
    ctx.strokeStyle = COLORS.line;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(r.x, r.y, r.w, r.h, 14);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = COLORS.amber;
    txt(ctx, String(i + 1), r.x + 26, r.y + 28, 15, COLORS.dim, 'center', 800);
    ctx.fillStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = 12;
    ICON_DRAW[choice.icon]?.(ctx, r.x + r.w / 2, r.y + 62);
    ctx.restore();
    txt(ctx, choice.name, r.x + r.w / 2, r.y + 116, 22, COLORS.text, 'center', 800, 6);
    txt(ctx, choice.desc, r.x + r.w / 2, r.y + 152, 15, COLORS.dim);
  });
}

function drawOver(ctx, state, best) {
  veil(ctx, 0.62);
  txt(ctx, 'SHIP DESTROYED', FIELD.width / 2, 216, 56, COLORS.red, 'center', 800, 22);
  txt(ctx, `The swarm takes wave ${Math.max(1, state.wave)} — this time.`, FIELD.width / 2, 264, 17, COLORS.dim);
  statsLines(ctx, state, best, 322);
  const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
  ctx.save();
  ctx.globalAlpha = pulse;
  txt(ctx, 'ENTER OR CLICK — FLY AGAIN', FIELD.width / 2, 520, 20, COLORS.amber, 'center', 800, 10);
  ctx.restore();
}

function drawVictory(ctx, state, best) {
  veil(ctx, 0.5);
  txt(ctx, 'VOID CLEARED!', FIELD.width / 2, 216, 58, COLORS.xp, 'center', 800, 24);
  txt(ctx, 'The Void Warden falls. All ten waves survived — the arena is yours.', FIELD.width / 2, 264, 17, COLORS.text);
  statsLines(ctx, state, best, 322);
  const pulse = 0.65 + 0.35 * Math.sin(state.time * 4);
  ctx.save();
  ctx.globalAlpha = pulse;
  txt(ctx, 'ENTER OR CLICK — PLAY AGAIN', FIELD.width / 2, 520, 20, COLORS.amber, 'center', 800, 10);
  ctx.restore();
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  return {
    draw(state, screen, best, muted = false) {
      ctx.save();
      if (state.shake > 0.2) {
        ctx.translate((Math.random() - 0.5) * state.shake, (Math.random() - 0.5) * state.shake);
      }
      drawBackground(ctx, state);
      drawWorld(ctx, state);
      ctx.restore();
      if (screen !== SCREEN_TITLE) drawHud(ctx, state, best, muted);
      drawBanner(ctx, state);
      if (screen === SCREEN_TITLE) drawTitle(ctx, state, best);
      else if (screen === SCREEN_PAUSED) drawPaused(ctx);
      else if (screen === SCREEN_LEVELUP) drawLevelup(ctx, state);
      else if (screen === SCREEN_OVER) drawOver(ctx, state, best);
      else if (screen === SCREEN_VICTORY) drawVictory(ctx, state, best);
    },
  };
}
