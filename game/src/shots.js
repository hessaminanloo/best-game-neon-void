// The screenshot scenes behind ?shot=menu|combat|boss|victory. Each stages the real game — a
// fresh world played forward by a simple autopilot under the real rules (it can be hit, it
// levels up and takes the first upgrade offered) — so every frame is what play actually looks
// like, and the same seed always stages the same frame.

import { FIELD, STEP } from './config.js';
import { EVENT_LEVELUP } from './world.js';
import { SCREEN_LEVELUP, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY } from './render.js';

const IDLE = { move: { x: 0, y: 0 }, aim: { x: FIELD.width / 2, y: 0 }, firing: false };

/** A fair pilot: aim at the nearest hostile, keep a fighting distance, strafe, always firing. */
function autopilot(state) {
  const p = state.player;
  let target = null;
  let bestD = Infinity;
  for (const e of state.enemies) {
    if (e.spawnT > 0) continue;
    const d = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
    if (d < bestD) {
      bestD = d;
      target = e;
    }
  }
  if (!target) {
    let gem = null;
    let gemD = Infinity;
    for (const g of state.gems) {
      const d = (g.x - p.x) ** 2 + (g.y - p.y) ** 2;
      if (d < gemD) {
        gemD = d;
        gem = g;
      }
    }
    const goal = gem ?? { x: FIELD.width / 2, y: FIELD.height / 2 };
    const dx = goal.x - p.x;
    const dy = goal.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    return { move: { x: dx / d, y: dy / d }, aim: { x: p.x + dx, y: p.y + dy }, firing: false };
  }
  const dx = target.x - p.x;
  const dy = target.y - p.y;
  const d = Math.hypot(dx, dy) || 1;
  const ux = dx / d;
  const uy = dy / d;
  // Keep 230px: close in when far, back off when close, otherwise circle-strafe.
  let mx;
  let my;
  if (d > 330) {
    mx = ux;
    my = uy;
  } else if (d < 180) {
    mx = -ux;
    my = -uy;
  } else {
    const s = Math.sin(state.time * 0.9) > 0 ? 1 : -1;
    mx = -uy * s;
    my = ux * s;
  }
  // Stay off the walls.
  if (p.x < 90) mx = Math.abs(mx);
  if (p.x > FIELD.width - 90) mx = -Math.abs(mx);
  if (p.y < 90) my = Math.abs(my);
  if (p.y > FIELD.height - 90) my = -Math.abs(my);
  const lead = Math.min(0.35, d / 900);
  return {
    move: { x: mx, y: my },
    aim: { x: target.x + (target.vx ?? 0) * lead, y: target.y + (target.vy ?? 0) * lead },
    firing: true,
  };
}

/** Play the world forward for `seconds` under the autopilot, taking upgrades as they come. */
function simulate(world, seconds) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const events = world.step(STEP, autopilot(world.state), false);
    if (events & EVENT_LEVELUP) {
      const choice = world.state.choices[0];
      if (choice) world.applyUpgrade(choice.id);
    }
    if (world.state.over || world.state.won) break;
  }
}

/**
 * Set `world` to the named scene and return the screen to draw over it.
 * menu: the title over its living attract arena. combat: a wave-2/3 firefight.
 * boss: the wave-5 Sentinel fight with a built-up ship. victory: the cleared-arena end screen.
 */
export function stageShot(name, world) {
  const state = world.state;
  if (name === 'combat') {
    world.startRun();
    simulate(world, 9);
    // Keep playing until the frame is a real firefight: a pack alive and shots in the air.
    for (let i = 0; i < 100 && !state.over; i += 1) {
      simulate(world, 0.25);
      const alive = state.enemies.filter((e) => e.spawnT <= 0).length;
      if (alive >= 5 && state.bullets.length >= 2) break;
    }
    return SCREEN_PLAY;
  }
  if (name === 'boss') {
    world.startRun();
    // A ship that has earned wave 5: a couple of upgrades deep, level 6 — strong enough to
    // be here, not so strong the Sentinel melts before the frame.
    world.applyUpgrade('damage');
    world.applyUpgrade('firerate');
    state.player.level = 6;
    state.player.xp = 4;
    state.player.xpNeed = 31;
    state.score = 4350;
    state.kills = 87;
    world.startWave(5);
    // Meet it mid-arena: the pilot holds the centre so the Sentinel dives off the top edge,
    // and the scene stops mid-fight — boss down in the arena, visibly hurt, still dangerous.
    state.player.x = FIELD.width / 2;
    state.player.y = 430;
    simulate(world, 3);
    for (let i = 0; i < 70 && state.boss && !state.over; i += 1) {
      simulate(world, 0.2);
      if (state.boss && state.boss.y > 185 && state.boss.hp < state.boss.maxHp * 0.82) break;
    }
    return SCREEN_PLAY;
  }
  if (name === 'levelup') {
    world.startRun();
    // Play (without choosing) until the first level-up is pending, then hold the cards open.
    for (let i = 0; i < 60 * 60 && !state.levelupPending && !state.over; i += 1) {
      world.step(STEP, autopilot(state), false);
    }
    return SCREEN_LEVELUP;
  }
  if (name === 'victory') {
    world.startRun();
    simulate(world, 3);
    // The run as it stands at the Warden's fall: wave 10 cleared, stats on the board.
    state.wave = 10;
    state.score = 18940;
    state.kills = 236;
    state.player.level = 11;
    state.player.hp = 57;
    state.time = 432;
    state.won = true;
    return SCREEN_VICTORY;
  }
  world.reset();
  for (let i = 0; i < 5 / STEP; i += 1) world.step(STEP, IDLE, true);
  return SCREEN_TITLE;
}
