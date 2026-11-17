// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps,
// and the renderer paints what is there. Six screens: title (with the attract arena living
// behind it), play, paused, level-up, game over and victory. World events are answered with
// sound and screen-reader announcements.
//
// ?seed=N fixes a run's randomness. ?shot=menu|combat|boss|victory (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady.

import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BOOM, EVENT_BOSS, EVENT_GEM, EVENT_HITMARK, EVENT_HURT,
  EVENT_LEVELUP, EVENT_OVER, EVENT_SHOOT, EVENT_WAVE, EVENT_WIN,
} from './world.js';
import { ACTION_CONFIRM, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import {
  createRenderer, upgradeCardRects,
  SCREEN_LEVELUP, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_VICTORY,
} from './render.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

function runShot(name) {
  const screen = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, screen, 9250, false);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let lastHitmark = 0;
  let lastGem = 0;
  let lastBoom = 0;

  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    const events = world.startRun();
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.wave();
    announce(`Neon Void. Wave 1 of 10. ${world.state.player.hp} hull.`);
    return events;
  }

  function finishRun(wonGame) {
    screen = wonGame ? SCREEN_VICTORY : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (wonGame) {
      audio.win();
      announce(`Victory! Score ${world.state.score}.`);
    } else {
      audio.lose();
      announce(`Game over. Score ${world.state.score}. Best ${best}.`);
    }
  }

  function answerEvents(events) {
    const now = performance.now();
    if (events & EVENT_SHOOT) audio.shoot();
    if ((events & EVENT_HITMARK) && now - lastHitmark > 70) {
      lastHitmark = now;
      audio.enemyHit();
    }
    if ((events & EVENT_BOOM) && now - lastBoom > 80) {
      lastBoom = now;
      audio.boom(Boolean(events & EVENT_BOSS) || world.state.shake > 12);
    }
    if (events & EVENT_HURT) audio.hurt();
    if ((events & EVENT_GEM) && now - lastGem > 70) {
      lastGem = now;
      audio.gem();
    }
    if (events & EVENT_WAVE) audio.wave();
    if (events & EVENT_BOSS) audio.boss();
  }

  function chooseUpgrade(index) {
    const choice = world.state.choices[index];
    if (!choice) return;
    audio.click();
    const again = world.applyUpgrade(choice.id);
    if (again) {
      audio.levelup();
      announce(`Upgrade taken: ${choice.name}. Another level — choose again.`);
    } else {
      screen = SCREEN_PLAY;
      announce(`Upgrade taken: ${choice.name}. Back to the fight.`);
    }
  }

  function handleActions() {
    const actions = input.takeActions();
    const clicks = input.takeClicks();
    if (actions & ACTION_MUTE) audio.toggleMute();
    if (clicks.length > 0 || actions) audio.unlock();

    if (screen === SCREEN_LEVELUP) {
      const pick = input.takePick();
      if (pick >= 0) chooseUpgrade(pick);
      for (const click of clicks) {
        const rects = upgradeCardRects(world.state.choices.length);
        const index = rects.findIndex((r) => click.x >= r.x && click.x <= r.x + r.w && click.y >= r.y && click.y <= r.y + r.h);
        if (index >= 0) {
          chooseUpgrade(index);
          break;
        }
      }
      return;
    }
    input.takePick();
    if (actions & ACTION_CONFIRM) {
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_VICTORY) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if ((actions & ACTION_PAUSE) && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if ((actions & ACTION_PAUSE) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, { move: { x: 0, y: 0 }, aim: null, firing: false }, true);
      return;
    }
    const control = { move: input.moveVector(), aim: input.aim(), firing: input.firing() };
    const events = world.step(STEP, control, false);
    answerEvents(events);
    if (events & EVENT_OVER) finishRun(false);
    else if (events & EVENT_WIN) finishRun(true);
    else if (events & EVENT_LEVELUP) {
      screen = SCREEN_LEVELUP;
      audio.levelup();
      announce(`Level ${world.state.player.level}. Choose an upgrade.`);
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best, audio.isMuted());
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Neon Void. Click or press Enter to launch.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
