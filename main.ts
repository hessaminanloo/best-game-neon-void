// A working best-game-01 entry (Node 22, standard library only): the game is this directory's
// game/ folder, plain static files a desktop browser loads offline (game/index.html and its ES
// modules, no library and no network request), and the program hands it in. It copies game/ and
// screenshots/ from beside this file to /output and writes /output/dossier.json, the summary the
// judge reads, with the vendored make.fun library. A starting point, not a winner: Block Dodger, a
// plain 2D canvas game where a paddle dodges falling blocks and catches coins, with a title screen,
// score, lives and levels, game over and restart, flat colours and no sound. Build your own game
// (any genre, any library you vendor under game/, or none), put your 3 or 4 PNG or JPEG screenshots
// in screenshots/ (the first by name is the cover) and run it.
//
// Serve it locally with `node serve.ts`, then open http://localhost:8080.
// Outside the grader's container, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------------------
// Neon Void build pipeline additions, authored for this entry.
//
// The hand-in below copies the game and writes the dossier; the code in this
// section makes that hand-in safer and auditable:
//   1. a pre-flight pass that measures the source game/ and screenshots/
//      folders against the scorer's caps and refuses to copy anything when
//      a cap would be broken, naming the offending file and the limit;
//   2. after the dossier is written (see the end of this file), a build
//      manifest listing every output file with its byte size and SHA-256
//      digest, saved as build-manifest.json next to dossier.json;
//   3. a short human-readable summary of the build on stdout.
// ---------------------------------------------------------------------------

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

// The same limits the dossier call at the end of this file passes to
// buildDossier, restated here so the pre-flight pass can talk about them.
const CAPS = {
  screenshotsMax: 4,
  screenshotMaxBytes: 262144,
  gameMaxFiles: 993,
  gameMaxBytes: 50331648,
  gamePathMaxBytes: 1000,
} as const;

interface FileFact {
  /** Path relative to the folder the walk started from, '/' separators. */
  rel: string;
  /** Absolute path on disk. */
  abs: string;
  /** Size in bytes. */
  bytes: number;
}

/** Recursively list every regular file under dir (which must exist). */
function collectFiles(dir: string): FileFact[] {
  const facts: FileFact[] = [];
  const pending: string[] = [dir];
  while (pending.length > 0) {
    const current = pending.pop() as string;
    for (const name of readdirSync(current).sort()) {
      const abs = join(current, name);
      const st = statSync(abs);
      if (st.isDirectory()) {
        pending.push(abs);
      } else if (st.isFile()) {
        facts.push({ rel: relative(dir, abs).split(sep).join('/'), abs, bytes: st.size });
      }
    }
  }
  return facts.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
}

/** Print a clear refusal and stop the build before anything is copied. */
function refuse(problem: string): never {
  console.error(`[neon-void] pre-flight check failed: ${problem}`);
  console.error('[neon-void] nothing was copied; fix the file(s) above and run again.');
  process.exit(1);
}

function checkScreenshots(dir: string): FileFact[] {
  if (!existsSync(dir)) return [];
  const shots = collectFiles(dir);
  if (shots.length > CAPS.screenshotsMax) {
    refuse(`screenshots/ holds ${shots.length} files but the scorer accepts at most ${CAPS.screenshotsMax}`);
  }
  for (const shot of shots) {
    if (shot.bytes > CAPS.screenshotMaxBytes) {
      refuse(`screenshots/${shot.rel} is ${shot.bytes} bytes; one screenshot may be at most ${CAPS.screenshotMaxBytes} bytes`);
    }
    if (!/\.(png|jpe?g)$/i.test(shot.rel)) {
      refuse(`screenshots/${shot.rel} is not a PNG or JPEG image, the only formats the judge reads`);
    }
  }
  return shots;
}

function checkGame(dir: string): FileFact[] {
  if (!existsSync(dir)) refuse('game/ is missing: there is no game to hand in');
  const files = collectFiles(dir);
  if (files.length === 0) refuse('game/ is empty: there is no game to hand in');
  if (files.length > CAPS.gameMaxFiles) {
    refuse(`game/ holds ${files.length} files but the scorer accepts at most ${CAPS.gameMaxFiles}`);
  }
  let total = 0;
  for (const file of files) {
    total += file.bytes;
    const pathBytes = Buffer.byteLength(`game/${file.rel}`, 'utf8');
    if (pathBytes > CAPS.gamePathMaxBytes) {
      refuse(`the path game/${file.rel} is ${pathBytes} bytes; a path under game/ may be at most ${CAPS.gamePathMaxBytes} bytes`);
    }
  }
  if (total > CAPS.gameMaxBytes) {
    refuse(`game/ totals ${total} bytes but the scorer accepts at most ${CAPS.gameMaxBytes} bytes of game files`);
  }
  if (!files.some((file) => file.rel === 'index.html')) {
    refuse('game/index.html is missing: the judge opens the game at that path');
  }
  return files;
}

// Run the pre-flight pass now, before the copy below: a build the scorer
// would refuse should fail here, on the author's machine, with the reason
// spelled out, instead of being discovered after submission.
const sourceGameFiles = checkGame(join(here, 'game'));
const sourceShots = checkScreenshots(join(here, 'screenshots'));
console.log(
  `[neon-void] pre-flight ok: ${sourceGameFiles.length} game file(s), ` +
    `${sourceShots.length} screenshot(s), all inside the scorer's caps`,
);

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the bytes; the others refuse an entry the
// scorer would refuse (more than 4 screenshots or one over 256 KiB; more than 993 files in game/ or 48 MiB of game
// files, in all, or a path under game/ over 1000 bytes: game/ counts beside /output's own 1000-entry cap, its
// screenshots/ and dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

// ---------------------------------------------------------------------------
// Build manifest: fingerprint everything that was just handed in, so the
// exact bytes of this build can be re-verified later. The manifest lists
// every file in the output directory except itself, with the SHA-256 of
// its contents, and is written next to dossier.json.
// ---------------------------------------------------------------------------

interface ManifestEntry {
  path: string;
  bytes: number;
  sha256: string;
}

function sha256OfFile(abs: string): string {
  return createHash('sha256').update(readFileSync(abs)).digest('hex');
}

const manifestEntries: ManifestEntry[] = collectFiles(out)
  .filter((file) => file.rel !== 'build-manifest.json')
  .map((file) => ({ path: file.rel, bytes: file.bytes, sha256: sha256OfFile(file.abs) }));

const manifest = {
  game: 'Neon Void',
  entrypoint: 'main.ts',
  generated_by: 'the Neon Void build pipeline in main.ts',
  file_count: manifestEntries.length,
  total_bytes: manifestEntries.reduce((sum, entry) => sum + entry.bytes, 0),
  files: manifestEntries,
};

writeFileSync(join(out, 'build-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const dossierBytes = statSync(join(out, 'dossier.json')).size;
console.log(`[neon-void] build complete -> ${out}`);
console.log(`[neon-void]   game files copied : ${sourceGameFiles.length}`);
console.log(`[neon-void]   screenshots copied: ${sourceShots.length}`);
console.log(`[neon-void]   dossier.json      : ${dossierBytes} bytes`);
console.log(
  `[neon-void]   build-manifest    : ${manifest.file_count} file(s), ${manifest.total_bytes} bytes total, sha256 per file`,
);
