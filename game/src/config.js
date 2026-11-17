// Neon Void's tuning: the field, the pilot, the waves and every enemy kind in one place, so the
// world, the renderer and the screenshot scenes all read the same numbers.

export const FIELD = { width: 1280, height: 720 };
export const STEP = 1 / 60;
export const BEST_KEY = 'neon-void-best';
export const FINAL_WAVE = 10;
export const BOSS_WAVES = [5, 10];

export const PLAYER = {
  radius: 14,
  hp: 100,
  speed: 268,
  damage: 12,
  fireRate: 5.5, // shots a second
  bulletSpeed: 640,
  bulletLife: 0.85,
  magnet: 96,
  pickup: 20,
  invulnTime: 0.7, // seconds of grace after a hit lands
};

// xp needed to leave a level: level 1 -> 2 costs XP_BASE, growing by XP_GROWTH a level.
export const XP_BASE = 6;
export const XP_GROWTH = 5;

// Each kind: how it looks (shape, colour, radius), how it moves, how hard it is to kill, and what
// it pays out. `speed` in px/s, `contact` the damage a touch deals, `score` and `xp` its bounty.
export const ENEMY_KINDS = {
  drifter: {
    label: 'Drifter', shape: 'diamond', color: '#ff4fd8', radius: 15,
    hp: 22, speed: 74, contact: 10, score: 50, xp: 1,
  },
  dart: {
    label: 'Dart', shape: 'spike', color: '#ffb02e', radius: 11,
    hp: 12, speed: 148, contact: 8, score: 60, xp: 1,
  },
  spitter: {
    label: 'Spitter', shape: 'hex', color: '#5dff8f', radius: 16,
    hp: 30, speed: 62, contact: 10, score: 90, xp: 2, orbSpeed: 218, orbDamage: 8, fireEvery: 2.35,
  },
  brute: {
    label: 'Brute', shape: 'pentagon', color: '#ff4757', radius: 27,
    hp: 135, speed: 40, contact: 18, score: 150, xp: 4,
  },
  boss: {
    label: 'Void Warden', shape: 'warden', color: '#b26bff', radius: 46,
    hp: 1150, speed: 34, contact: 24, score: 1500, xp: 30, orbSpeed: 265, orbDamage: 10,
  },
};

// The level-up shelf: id, card title, blurb and the stat it moves (applied in world.applyUpgrade).
export const UPGRADES = [
  { id: 'damage', name: 'Heavy Rounds', desc: '+25% bullet damage', icon: 'dmg' },
  { id: 'firerate', name: 'Overclock', desc: '+18% fire rate', icon: 'rate' },
  { id: 'multishot', name: 'Split Cannon', desc: '+1 projectile per shot', icon: 'split' },
  { id: 'pierce', name: 'Lance Rounds', desc: 'Shots pierce +1 enemy', icon: 'pierce' },
  { id: 'speed', name: 'Ion Thrusters', desc: '+12% move speed', icon: 'speed' },
  { id: 'vitality', name: 'Reinforced Hull', desc: '+25 max HP and heal 25', icon: 'hp' },
  { id: 'magnet', name: 'Tractor Field', desc: '+60% XP magnet radius', icon: 'magnet' },
  { id: 'regen', name: 'Nano Repair', desc: 'Regenerate +0.7 HP/s', icon: 'regen' },
  { id: 'velocity', name: 'Rail Driver', desc: '+20% bullet speed & range', icon: 'rail' },
  { id: 'greed', name: 'Void Siphon', desc: '+40% score from every kill', icon: 'score' },
];

export const COLORS = {
  ink: '#04050d',
  panel: 'rgba(8, 14, 30, 0.82)',
  line: 'rgba(110, 231, 255, 0.55)',
  text: '#e8f6ff',
  dim: '#8fb8d8',
  cyan: '#40e0ff',
  magenta: '#ff4fd8',
  amber: '#ffb02e',
  green: '#5dff8f',
  red: '#ff4757',
  violet: '#b26bff',
  xp: '#3dffc8',
};
