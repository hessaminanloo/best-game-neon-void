// Keyboard and mouse, read by the loop each frame. Movement is a held-keys vector (WASD or the
// arrow keys), aim is the mouse position in world coordinates (the canvas is a fixed 1280x720
// field, CSS-scaled, so a rect mapping converts), firing is the held mouse button or Space.
// Discrete presses (confirm, pause, mute, upgrade picks) queue as an action bitmask the loop
// drains once a frame; clicks queue with their world position so menus can be clicked.

import { FIELD } from './config.js';

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_MUTE = 4;

const CONFIRM_KEYS = new Set(['Enter', 'NumpadEnter']);
const PAUSE_KEYS = new Set(['KeyP', 'Escape']);
const PICK_KEYS = ['Digit1', 'Digit2', 'Digit3'];

export function createInput(canvas) {
  const keys = new Set();
  const mouse = { x: FIELD.width / 2, y: FIELD.height / 3, down: false };
  let actions = 0;
  let picks = -1;
  const clicks = [];

  function toWorld(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * FIELD.width,
      y: ((event.clientY - rect.top) / rect.height) * FIELD.height,
    };
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    keys.add(event.code);
    if (CONFIRM_KEYS.has(event.code)) actions |= ACTION_CONFIRM;
    if (PAUSE_KEYS.has(event.code)) actions |= ACTION_PAUSE;
    if (event.code === 'KeyM') actions |= ACTION_MUTE;
    if (event.code === 'Space') actions |= ACTION_CONFIRM;
    const pick = PICK_KEYS.indexOf(event.code);
    if (pick !== -1) picks = pick;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('mousemove', (event) => {
    const p = toWorld(event);
    mouse.x = p.x;
    mouse.y = p.y;
  });
  canvas.addEventListener('mousedown', (event) => {
    mouse.down = true;
    const p = toWorld(event);
    mouse.x = p.x;
    mouse.y = p.y;
    clicks.push(p);
    actions |= ACTION_CONFIRM;
  });
  window.addEventListener('mouseup', () => {
    mouse.down = false;
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  return {
    /** The held movement direction, normalised: {x, y} each in -1..1. */
    moveVector() {
      let x = 0;
      let y = 0;
      if (keys.has('KeyA') || keys.has('ArrowLeft')) x -= 1;
      if (keys.has('KeyD') || keys.has('ArrowRight')) x += 1;
      if (keys.has('KeyW') || keys.has('ArrowUp')) y -= 1;
      if (keys.has('KeyS') || keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    aim() {
      return { x: mouse.x, y: mouse.y };
    },
    firing() {
      return mouse.down || keys.has('Space');
    },
    /** Drain the queued discrete presses; each is reported once. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** Drain queued clicks (world positions), oldest first. */
    takeClicks() {
      return clicks.splice(0, clicks.length);
    },
    /** The upgrade card index chosen by 1/2/3 since the last call, or -1. */
    takePick() {
      const taken = picks;
      picks = -1;
      return taken;
    },
  };
}
