// The whole simulation: the pilot, bullets, five enemy kinds, XP gems, particles and the wave
// director. Fixed-step and free of rendering and clocks — main.js feeds it input, render.js
// paints state, and the same step() runs the title's attract mode and the screenshot scenes.
// Events come back as a bitmask so main.js can answer them with sound and announcements.

import { BOSS_WAVES, ENEMY_KINDS, FIELD, FINAL_WAVE, PLAYER, UPGRADES, XP_BASE, XP_GROWTH } from './config.js';

export const EVENT_SHOOT = 1;
export const EVENT_HITMARK = 2;
export const EVENT_BOOM = 4;
export const EVENT_HURT = 8;
export const EVENT_GEM = 16;
export const EVENT_LEVELUP = 32;
export const EVENT_WAVE = 64;
export const EVENT_BOSS = 128;
export const EVENT_OVER = 256;
export const EVENT_WIN = 512;

const TAU = Math.PI * 2;

function dist2(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

export function createWorld(random) {
  const state = {
    time: 0,
    score: 0,
    kills: 0,
    wave: 0,
    toSpawn: 0,
    spawnTimer: 0,
    clearTimer: 0,
    boss: null,
    shake: 0,
    banner: null,
    levelupPending: false,
    choices: [],
    over: false,
    won: false,
    player: null,
    bullets: [],
    orbs: [],
    enemies: [],
    gems: [],
    particles: [],
    texts: [],
  };

  function freshPlayer() {
    return {
      x: FIELD.width / 2,
      y: FIELD.height / 2,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      hp: PLAYER.hp,
      maxHp: PLAYER.hp,
      level: 1,
      xp: 0,
      xpNeed: XP_BASE,
      speed: PLAYER.speed,
      damage: PLAYER.damage,
      fireRate: PLAYER.fireRate,
      bulletSpeed: PLAYER.bulletSpeed,
      bulletLife: PLAYER.bulletLife,
      projectiles: 1,
      pierce: 0,
      magnet: PLAYER.magnet,
      regen: 0,
      scoreMult: 1,
      fireCooldown: 0,
      invuln: 0,
      thrust: 0,
    };
  }

  function reset() {
    state.time = 0;
    state.score = 0;
    state.kills = 0;
    state.wave = 0;
    state.toSpawn = 0;
    state.spawnTimer = 0;
    state.clearTimer = 0;
    state.boss = null;
    state.shake = 0;
    state.banner = null;
    state.levelupPending = false;
    state.choices = [];
    state.over = false;
    state.won = false;
    state.player = freshPlayer();
    state.bullets.length = 0;
    state.orbs.length = 0;
    state.enemies.length = 0;
    state.gems.length = 0;
    state.particles.length = 0;
    state.texts.length = 0;
  }

  function banner(title, sub, seconds = 2.4) {
    state.banner = { title, sub, t: seconds, max: seconds };
  }

  function burst(x, y, color, count, speed, size = 3, life = 0.5) {
    for (let i = 0; i < count; i += 1) {
      if (state.particles.length > 420) return;
      const a = random.next() * TAU;
      const v = speed * (0.3 + random.next() * 0.7);
      state.particles.push({
        x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: life * (0.5 + random.next() * 0.5), maxLife: life,
        size: size * (0.6 + random.next() * 0.8), color,
      });
    }
  }

  function floatText(x, y, text, color, size = 15) {
    state.texts.push({ x, y, text, color, size, life: 0.9, maxLife: 0.9 });
  }

  function spawnPoint() {
    // On an edge, but never on top of the pilot.
    for (let tries = 0; tries < 12; tries += 1) {
      const edge = random.int(0, 3);
      const x = edge === 0 ? 24 : edge === 1 ? FIELD.width - 24 : random.range(24, FIELD.width - 24);
      const y = edge === 2 ? 24 : edge === 3 ? FIELD.height - 24 : random.range(24, FIELD.height - 24);
      if (dist2(x, y, state.player.x, state.player.y) > 260 * 260) return { x, y };
    }
    return { x: 40, y: 40 };
  }

  function spawnEnemy(kind, x, y) {
    const spec = ENEMY_KINDS[kind];
    const scale = 1 + (state.wave - 1) * 0.1;
    const enemy = {
      kind,
      x: x ?? spawnPoint().x,
      y: y ?? spawnPoint().y,
      vx: 0, vy: 0,
      hp: Math.round(spec.hp * (kind === 'boss' ? 1 + (state.wave - 5) * 0.22 : scale)),
      radius: spec.radius,
      contact: spec.contact,
      score: spec.score,
      xp: spec.xp,
      color: spec.color,
      shape: spec.shape,
      t: random.range(0, 10),
      spawnT: 0.55,
      fireT: random.range(1, 2),
      lungeT: random.range(0.6, 1.6),
      lungeVx: 0, lungeVy: 0,
      radialT: 1.6, aimedT: 0.9, summonT: 3.2,
      wanderA: random.next() * TAU,
    };
    enemy.maxHp = enemy.hp;
    if (x === undefined) {
      const p = spawnPoint();
      enemy.x = p.x;
      enemy.y = p.y;
    }
    state.enemies.push(enemy);
    return enemy;
  }

  function waveComposition(wave) {
    if (BOSS_WAVES.includes(wave)) return { boss: true, minions: 4 + wave };
    const list = [];
    const total = 5 + wave * 3;
    for (let i = 0; i < total; i += 1) {
      const roll = random.next();
      if (wave >= 4 && roll < 0.14) list.push('brute');
      else if (wave >= 3 && roll < 0.38) list.push('spitter');
      else if (wave >= 2 && roll < 0.62) list.push('dart');
      else list.push('drifter');
    }
    return { boss: false, list };
  }

  let spawnList = [];

  function startWave(wave) {
    state.wave = wave;
    const comp = waveComposition(wave);
    state.spawnTimer = 0.4;
    if (comp.boss) {
      spawnList = [];
      for (let i = 0; i < comp.minions; i += 1) spawnList.push(random.chance(0.6) ? 'drifter' : 'dart');
      state.toSpawn = spawnList.length;
      state.boss = spawnEnemy('boss', FIELD.width / 2, 92);
      banner(wave === FINAL_WAVE ? 'FINAL WAVE — THE VOID WARDEN' : 'THE VOID SENTINEL AWAKENS', 'Destroy it to ' + (wave === FINAL_WAVE ? 'win the run' : 'clear the wave'), 3);
      return EVENT_BOSS;
    }
    spawnList = comp.list;
    state.toSpawn = spawnList.length;
    banner(`WAVE ${wave}`, wave === 1 ? 'Survive the swarm' : `${state.toSpawn} hostiles inbound`, 2.2);
    return EVENT_WAVE;
  }

  /** Begin a fresh run at wave 1. Returns the opening event mask (the wave banner). */
  function startRun() {
    reset();
    return startWave(1);
  }

  function gainXp(value, events) {
    const p = state.player;
    p.xp += value;
    if (p.xp >= p.xpNeed && !state.levelupPending) {
      p.xp -= p.xpNeed;
      p.level += 1;
      p.xpNeed = XP_BASE + (p.level - 1) * XP_GROWTH;
      p.hp = Math.min(p.maxHp, p.hp + 12); // a small patch-up with every level
      state.levelupPending = true;
      state.choices = rollChoices();
      burst(p.x, p.y, '#3dffc8', 26, 190, 3, 0.6);
      floatText(p.x, p.y - 30, 'LEVEL UP', '#3dffc8', 19);
      return events | EVENT_LEVELUP;
    }
    return events;
  }

  function rollChoices() {
    const pool = UPGRADES.filter((u) => {
      if (u.id === 'multishot') return state.player.projectiles < 4;
      if (u.id === 'pierce') return state.player.pierce < 3;
      return true;
    });
    const picks = [];
    const copy = [...pool];
    while (picks.length < 3 && copy.length > 0) {
      picks.push(copy.splice(random.int(0, copy.length - 1), 1)[0]);
    }
    return picks;
  }

  /** Apply a chosen upgrade card; returns true when another level is already queued behind it. */
  function applyUpgrade(id) {
    const p = state.player;
    switch (id) {
      case 'damage': p.damage *= 1.25; break;
      case 'firerate': p.fireRate *= 1.18; break;
      case 'multishot': p.projectiles += 1; break;
      case 'pierce': p.pierce += 1; break;
      case 'speed': p.speed *= 1.12; break;
      case 'vitality': p.maxHp += 25; p.hp = Math.min(p.maxHp, p.hp + 25); break;
      case 'magnet': p.magnet *= 1.6; break;
      case 'regen': p.regen += 0.7; break;
      case 'velocity': p.bulletSpeed *= 1.2; p.bulletLife *= 1.12; break;
      case 'greed': p.scoreMult *= 1.4; break;
      default: break;
    }
    state.levelupPending = false;
    state.choices = [];
    if (p.xp >= p.xpNeed) {
      p.xp -= p.xpNeed;
      p.level += 1;
      p.xpNeed = XP_BASE + (p.level - 1) * XP_GROWTH;
      state.levelupPending = true;
      state.choices = rollChoices();
      return true;
    }
    return false;
  }

  function killEnemy(enemy, events) {
    state.kills += 1;
    const gained = Math.round(enemy.score * state.player.scoreMult);
    state.score += gained;
    floatText(enemy.x, enemy.y - enemy.radius - 4, `+${gained}`, '#e8f6ff', enemy.kind === 'boss' ? 22 : 13);
    burst(enemy.x, enemy.y, enemy.color, enemy.kind === 'boss' ? 90 : enemy.kind === 'brute' ? 34 : 16, enemy.kind === 'boss' ? 320 : 210, enemy.kind === 'boss' ? 4 : 3, 0.6);
    if (enemy.kind === 'boss') {
      state.shake = Math.max(state.shake, 16);
      state.boss = null;
      events |= EVENT_BOOM;
      if (state.wave === FINAL_WAVE) {
        state.won = true;
        state.score += 1000;
        return events | EVENT_WIN;
      }
    } else {
      events |= EVENT_BOOM;
    }
    const gems = enemy.kind === 'boss' ? 10 : 1;
    for (let i = 0; i < gems; i += 1) {
      const share = enemy.kind === 'boss' ? Math.ceil(enemy.xp / gems) : enemy.xp;
      state.gems.push({
        x: enemy.x + random.range(-14, 14), y: enemy.y + random.range(-14, 14),
        vx: random.range(-40, 40), vy: random.range(-40, 40), value: share, t: random.range(0, 6),
      });
    }
    return events;
  }

  function hurtPlayer(damage, events) {
    const p = state.player;
    if (p.invuln > 0 || state.over) return events;
    p.hp -= damage;
    p.invuln = PLAYER.invulnTime;
    state.shake = Math.max(state.shake, 9);
    burst(p.x, p.y, '#ff4757', 14, 200, 3, 0.4);
    if (p.hp <= 0) {
      p.hp = 0;
      state.over = true;
      burst(p.x, p.y, '#40e0ff', 70, 300, 4, 0.9);
      burst(p.x, p.y, '#ff4fd8', 40, 220, 3, 0.8);
      return events | EVENT_HURT | EVENT_OVER;
    }
    return events | EVENT_HURT;
  }

  function fireOrbs(enemy, angle, count, spread, speed) {
    for (let i = 0; i < count; i += 1) {
      const a = angle + (count === 1 ? 0 : (i - (count - 1) / 2) * spread);
      state.orbs.push({
        x: enemy.x + Math.cos(a) * (enemy.radius + 6), y: enemy.y + Math.sin(a) * (enemy.radius + 6),
        vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
        r: 6, dmg: ENEMY_KINDS[enemy.kind].orbDamage, life: 4.5, color: enemy.color,
      });
    }
  }

  function stepPlayer(dt, control, events) {
    const p = state.player;
    const mv = control.move;
    p.x += mv.x * p.speed * dt;
    p.y += mv.y * p.speed * dt;
    p.x = Math.max(18, Math.min(FIELD.width - 18, p.x));
    p.y = Math.max(18, Math.min(FIELD.height - 18, p.y));
    p.thrust = Math.min(1, p.thrust + ((mv.x !== 0 || mv.y !== 0) ? dt * 6 : -dt * 4));
    if (control.aim) p.angle = Math.atan2(control.aim.y - p.y, control.aim.x - p.x);
    if (p.invuln > 0) p.invuln -= dt;
    if (p.regen > 0) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);
    // Engine trail.
    if (p.thrust > 0.2 && state.particles.length < 420) {
      state.particles.push({
        x: p.x - Math.cos(p.angle) * 14, y: p.y - Math.sin(p.angle) * 14,
        vx: -Math.cos(p.angle) * 60 + random.range(-16, 16), vy: -Math.sin(p.angle) * 60 + random.range(-16, 16),
        life: 0.3, maxLife: 0.3, size: 2.6, color: '#40e0ff',
      });
    }
    p.fireCooldown -= dt;
    if (control.firing && p.fireCooldown <= 0 && control.aim) {
      p.fireCooldown = 1 / p.fireRate;
      const base = p.angle;
      for (let i = 0; i < p.projectiles; i += 1) {
        const a = base + (p.projectiles === 1 ? 0 : (i - (p.projectiles - 1) / 2) * 0.085);
        state.bullets.push({
          x: p.x + Math.cos(base) * 16, y: p.y + Math.sin(base) * 16,
          vx: Math.cos(a) * p.bulletSpeed, vy: Math.sin(a) * p.bulletSpeed,
          life: p.bulletLife, dmg: p.damage, pierce: p.pierce,
        });
      }
      events |= EVENT_SHOOT;
    }
    return events;
  }

  function stepEnemies(dt, events, attract) {
    const p = state.player;
    for (const e of state.enemies) {
      e.t += dt;
      if (e.spawnT > 0) {
        e.spawnT -= dt;
        continue;
      }
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      const ux = dx / d;
      const uy = dy / d;
      if (attract) {
        e.wanderA += (random.next() - 0.5) * dt * 2;
        e.x += Math.cos(e.wanderA) * e.speed * 0.4 * dt;
        e.y += Math.sin(e.wanderA) * e.speed * 0.4 * dt;
        e.x = Math.max(30, Math.min(FIELD.width - 30, e.x));
        e.y = Math.max(30, Math.min(FIELD.height - 30, e.y));
        continue;
      }
      const speed = ENEMY_KINDS[e.kind].speed * (e.kind === 'boss' && e.hp < e.maxHp / 2 ? 1.3 : 1);
      if (e.kind === 'drifter') {
        const wob = Math.sin(e.t * 3.1) * 0.45;
        e.x += (ux - uy * wob) * speed * dt;
        e.y += (uy + ux * wob) * speed * dt;
      } else if (e.kind === 'dart') {
        e.lungeT -= dt;
        if (e.lungeT <= 0 && d < 280) {
          e.lungeVx = ux * speed * 3.1;
          e.lungeVy = uy * speed * 3.1;
          e.lungeT = random.range(1.3, 1.9);
          e.lungeTime = 0.32;
        }
        if (e.lungeTime > 0) {
          e.lungeTime -= dt;
          e.x += e.lungeVx * dt;
          e.y += e.lungeVy * dt;
        } else {
          e.x += ux * speed * dt;
          e.y += uy * speed * dt;
        }
      } else if (e.kind === 'spitter') {
        const want = d > 320 ? 1 : d < 210 ? -1 : 0;
        const strafe = Math.sin(e.t * 0.9) * 0.6;
        e.x += (ux * want - uy * strafe) * speed * dt;
        e.y += (uy * want + ux * strafe) * speed * dt;
        e.fireT -= dt;
        if (e.fireT <= 0 && d < 560) {
          e.fireT = ENEMY_KINDS.spitter.fireEvery * random.range(0.85, 1.15);
          fireOrbs(e, Math.atan2(dy, dx), 1, 0, ENEMY_KINDS.spitter.orbSpeed);
        }
      } else if (e.kind === 'brute') {
        e.x += ux * speed * dt;
        e.y += uy * speed * dt;
      } else if (e.kind === 'boss') {
        const want = d > 330 ? 1 : d < 250 ? -0.4 : 0;
        e.x += ux * want * speed * dt + -uy * Math.sin(e.t * 0.6) * 14 * dt;
        e.y += uy * want * speed * dt + ux * Math.sin(e.t * 0.6) * 14 * dt;
        const enrage = e.hp < e.maxHp / 2 ? 0.72 : 1;
        e.radialT -= dt;
        e.aimedT -= dt;
        e.summonT -= dt;
        if (e.radialT <= 0) {
          e.radialT = 2.3 * enrage;
          const n = 14;
          const off = random.next() * TAU;
          for (let i = 0; i < n; i += 1) fireOrbs(e, off + (i / n) * TAU, 1, 0, ENEMY_KINDS.boss.orbSpeed * 0.8);
        }
        if (e.aimedT <= 0) {
          e.aimedT = 1.15 * enrage;
          fireOrbs(e, Math.atan2(dy, dx), 3, 0.16, ENEMY_KINDS.boss.orbSpeed);
        }
        if (e.summonT <= 0) {
          e.summonT = 4.5;
          if (state.enemies.length < 16) {
            spawnEnemy(random.chance(0.5) ? 'drifter' : 'dart', e.x + random.range(-90, 90), e.y + random.range(-90, 90));
          }
        }
      }
      // Contact damage.
      if (dist2(e.x, e.y, p.x, p.y) < (e.radius + 13) * (e.radius + 13)) {
        events = hurtPlayer(e.contact, events);
        const push = e.kind === 'brute' || e.kind === 'boss' ? 6 : 26;
        e.x -= ux * push;
        e.y -= uy * push;
      }
    }
    // Gentle separation so stacks read as a swarm, not a blob.
    const list = state.enemies;
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const a = list[i];
        const b = list[j];
        const min = (a.radius + b.radius) * 0.8;
        const d2 = dist2(a.x, a.y, b.x, b.y);
        if (d2 > 0.01 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.5 * 22 * dt;
          const ux = (b.x - a.x) / d;
          const uy = (b.y - a.y) / d;
          a.x -= ux * push;
          a.y -= uy * push;
          b.x += ux * push;
          b.y += uy * push;
        }
      }
    }
    return events;
  }

  function stepProjectiles(dt, events) {
    const p = state.player;
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -20 || b.x > FIELD.width + 20 || b.y < -20 || b.y > FIELD.height + 20) {
        state.bullets.splice(i, 1);
      }
    }
    // Bullet vs enemy.
    for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
      const b = state.bullets[i];
      let consumed = false;
      for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
        const e = state.enemies[j];
        if (e.spawnT > 0) continue;
        if (dist2(b.x, b.y, e.x, e.y) < (e.radius + 4) * (e.radius + 4)) {
          e.hp -= b.dmg;
          events |= EVENT_HITMARK;
          burst(b.x, b.y, e.color, 3, 130, 2, 0.25);
          const kb = e.kind === 'brute' || e.kind === 'boss' ? 1.5 : 7;
          e.x += (b.vx / PLAYER.bulletSpeed) * kb;
          e.y += (b.vy / PLAYER.bulletSpeed) * kb;
          if (e.hp <= 0) {
            state.enemies.splice(j, 1);
            events = killEnemy(e, events);
          }
          if (b.pierce > 0) {
            b.pierce -= 1;
          } else {
            consumed = true;
          }
          break;
        }
      }
      if (consumed) state.bullets.splice(i, 1);
    }
    // Enemy orbs vs player.
    for (let i = state.orbs.length - 1; i >= 0; i -= 1) {
      const o = state.orbs[i];
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      o.life -= dt;
      if (o.life <= 0 || o.x < -30 || o.x > FIELD.width + 30 || o.y < -30 || o.y > FIELD.height + 30) {
        state.orbs.splice(i, 1);
        continue;
      }
      if (dist2(o.x, o.y, p.x, p.y) < (o.r + 12) * (o.r + 12)) {
        state.orbs.splice(i, 1);
        events = hurtPlayer(o.dmg, events);
      }
    }
    return events;
  }

  function stepGems(dt, events) {
    const p = state.player;
    for (let i = state.gems.length - 1; i >= 0; i -= 1) {
      const g = state.gems[i];
      g.t += dt;
      const d2 = dist2(g.x, g.y, p.x, p.y);
      if (d2 < p.magnet * p.magnet) {
        const d = Math.sqrt(d2) || 1;
        const pull = 560 * (1 - d / (p.magnet * 1.6));
        g.vx += ((p.x - g.x) / d) * pull * dt * 3;
        g.vy += ((p.y - g.y) / d) * pull * dt * 3;
      }
      g.vx *= 0.92;
      g.vy *= 0.92;
      g.x += g.vx * dt;
      g.y += g.vy * dt;
      if (d2 < PLAYER.pickup * PLAYER.pickup) {
        state.gems.splice(i, 1);
        events |= EVENT_GEM;
        events = gainXp(g.value, events);
      }
    }
    return events;
  }

  function stepFx(dt) {
    for (let i = state.particles.length - 1; i >= 0; i -= 1) {
      const pt = state.particles[i];
      pt.life -= dt;
      if (pt.life <= 0) {
        state.particles.splice(i, 1);
        continue;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= 0.94;
      pt.vy *= 0.94;
    }
    for (let i = state.texts.length - 1; i >= 0; i -= 1) {
      const t = state.texts[i];
      t.life -= dt;
      t.y -= 34 * dt;
      if (t.life <= 0) state.texts.splice(i, 1);
    }
    if (state.shake > 0) state.shake = Math.max(0, state.shake - dt * 26);
    if (state.banner) {
      state.banner.t -= dt;
      if (state.banner.t <= 0) state.banner = null;
    }
  }

  /**
   * Advance one fixed step. `control` is {move:{x,y}, aim:{x,y}, firing}; in attract mode the
   * pilot drifts on a lissajous and the swarm wanders, for the title screen's living backdrop.
   */
  function step(dt, control, attract = false) {
    let events = 0;
    state.time += dt;
    if (attract) {
      const p = state.player;
      p.x = FIELD.width / 2 + Math.cos(state.time * 0.24) * 190;
      p.y = FIELD.height / 2 + Math.sin(state.time * 0.41) * 120;
      p.angle = Math.atan2(Math.cos(state.time * 0.41) * 120 * 0.41, -Math.sin(state.time * 0.24) * 190 * 0.24);
      if (state.enemies.length < 7 && random.chance(0.02)) {
        spawnEnemy(random.pick(['drifter', 'dart', 'spitter']));
      }
      events = stepEnemies(dt, events, true);
      stepFx(dt);
      return events;
    }
    if (state.over || state.won) {
      stepFx(dt);
      return events;
    }
    // Spawning.
    if (state.toSpawn > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0) {
        state.spawnTimer = Math.max(0.32, 0.85 - state.wave * 0.05);
        spawnEnemy(spawnList.pop());
        state.toSpawn -= 1;
      }
    }
    events = stepPlayer(dt, control, events);
    events = stepEnemies(dt, events, false);
    events = stepProjectiles(dt, events);
    events = stepGems(dt, events);
    stepFx(dt);
    // Wave clear?
    if (!state.over && !state.won && state.toSpawn === 0 && state.enemies.length === 0 && !state.boss) {
      state.clearTimer += dt;
      if (state.clearTimer > 1.4) {
        state.clearTimer = 0;
        state.score += 100 * state.wave;
        events |= startWave(state.wave + 1);
      }
    } else {
      state.clearTimer = 0;
    }
    return events;
  }

  reset();
  return { state, reset, startRun, startWave, applyUpgrade, step };
}
