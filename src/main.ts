import { GAME_DURATION, titleFor } from './game/config';
import { GameWorld } from './game/world';
import { GameRenderer } from './render/renderer';
import { PrologueScenes } from './render/prologueScenes';
import { EndingPlayer } from './render/endingScenes';
import { Sound } from './audio/sound';
import { UI, collectStats } from './ui/ui';

const GAME_URL = 'https://t3q4awmhsub1-hue.github.io/ORC_SURVIVOR/';
const HS_KEY = 'orc-survivor-highscore';

type AppState = 'title' | 'prologue' | 'playing' | 'paused' | 'ending' | 'result';
const PROLOGUE_SEEN_KEY = 'orc-survivor-prologue-seen';

const ui = new UI();
const sound = new Sound();
const renderer = new GameRenderer(document.getElementById('game')!);

let state: AppState = 'title';
let world = new GameWorld(1);
let resultDelay = 0;
let bgmLevel: 1 | 2 | 3 = 1;

// デバッグ・検証用フック
declare global {
  interface Window {
    __game?: {
      world: () => GameWorld;
      fps: () => number;
      start: () => void;
      bench: (frames?: number) => number;
      forceEnding: () => void;
      endingStep: (dt?: number) => void;
    };
  }
}
let fpsSamples: number[] = [];
window.__game = {
  world: () => world,
  fps: () => (fpsSamples.length ? fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length : 0),
  start: () => { if (state === 'title' || state === 'result') startRun(); },
  // rAFスロットリングの影響を受けない同期ベンチ: 1フレームあたりのCPUコスト(ms)を返す
  bench: (frames = 180) => {
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) {
      world.update(1 / 60, { dx: i % 40 < 20 ? 1 : -1, dz: 0 });
      if (world.pendingChoices) world.chooseUpgrade(0);
      world.events.length = 0;
      renderer.render(world, 1 / 60);
    }
    return (performance.now() - t0) / frames;
  },
  // エンディング演出の検証用（rAFスロットリング環境でも進められる）
  forceEnding: () => beginEnding(),
  endingStep: (dt = 0.5) => ending?.render(dt),
};

// --- 入力 -------------------------------------------------------------------
const keys = new Set<string>();

addEventListener('keydown', (ev) => {
  if (ev.repeat) return;
  keys.add(ev.code);
  sound.ensure();

  if (ev.code === 'KeyM') {
    sound.toggleMute();
    return;
  }
  switch (state) {
    case 'title':
      if (ev.code === 'Space' || ev.code === 'Enter') requestStart();
      break;
    case 'prologue':
      if (ev.code === 'Space' || ev.code === 'Enter') ui.prologueNext();
      else if (ev.code === 'Escape') ui.prologueSkip();
      break;
    case 'ending':
      if (ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'Escape') showResultNow();
      break;
    case 'playing':
      if (ui.levelUpVisible) {
        const idx = ['Digit1', 'Digit2', 'Digit3'].indexOf(ev.code);
        if (idx >= 0) pickUpgrade(idx);
      } else if (ev.code === 'Escape' || ev.code === 'KeyP') {
        state = 'paused';
        ui.showPause();
      }
      break;
    case 'paused':
      if (ev.code === 'Escape' || ev.code === 'KeyP' || ev.code === 'Space') {
        state = 'playing';
        ui.hidePause();
      }
      break;
    case 'result':
      if (ev.code === 'Space' || ev.code === 'Enter') startRun();
      break;
  }
});
addEventListener('keyup', (ev) => keys.delete(ev.code));

function inputVector(): { dx: number; dz: number } {
  let dx = 0;
  let dz = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) dx -= 1;
  if (keys.has('KeyD') || keys.has('ArrowRight')) dx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) dz -= 1;
  if (keys.has('KeyS') || keys.has('ArrowDown')) dz += 1;
  return { dx, dz };
}

document.getElementById('start')!.addEventListener('click', () => {
  sound.ensure();
  requestStart();
});
document.getElementById('replay-prologue')!.addEventListener('click', () => {
  sound.ensure();
  playPrologue();
});
document.getElementById('retry')!.addEventListener('click', () => startRun());
document.getElementById('resume')!.addEventListener('click', () => {
  state = 'playing';
  ui.hidePause();
});
document.getElementById('quit')!.addEventListener('click', () => {
  sound.stopBgm();
  state = 'title';
  showTitle();
});

// --- 状態遷移 ------------------------------------------------------------------

/** タイトルからの開始: 初回はプロローグを挟む */
function requestStart(): void {
  if (localStorage.getItem(PROLOGUE_SEEN_KEY)) {
    startRun();
  } else {
    playPrologue();
  }
}

let prologueScenes: PrologueScenes | null = null;
let ending: EndingPlayer | null = null;
let finTimer = -1; // 「完」カード表示からリザルトまでの残り秒。負なら未表示

function beginEnding(): void {
  state = 'ending';
  finTimer = -1;
  ending ??= new EndingPlayer(document.getElementById('ending-scene')!);
  ending.onSubtitle = (text) => ui.setEndingSubtitle(text);
  ending.onFinished = () => {
    ui.showEndingFin();
    finTimer = 3.4;
  };
  ui.showEnding();
  sound.playEndingTheme();
  ending.start();
}

function showResultNow(): void {
  ending?.stop();
  sound.stopEndingTheme();
  ui.hideEnding();
  state = 'result';
  saveHighScore(world.kills);
  ui.showResult(collectStats(world, titleFor(world.kills, world.state === 'won')), GAME_URL);
}

document.getElementById('ending')!.addEventListener('click', () => {
  if (state === 'ending') showResultNow();
});

function playPrologue(): void {
  state = 'prologue';
  localStorage.setItem(PROLOGUE_SEEN_KEY, '1');
  // ジオラマは初回再生時に遅延生成（起動コストをタイトルにかけない）
  prologueScenes ??= new PrologueScenes(document.getElementById('prologue-scene')!);
  ui.onPrologueAdvance = (page) => {
    sound.page();
    prologueScenes!.setPage(page);
  };
  ui.startPrologue(() => startRun());
}

function startRun(): void {
  const params = new URLSearchParams(location.search);
  const seed = params.has('seed')
    ? Number(params.get('seed'))
    : (Math.random() * 0xffffffff) >>> 0;
  world = new GameWorld(seed);
  if (params.has('stress')) {
    world.debugSpawn('trainee', Math.min(300, Number(params.get('stress')) || 300));
  }
  state = 'playing';
  resultDelay = 0;
  bgmLevel = 1;
  sound.setIntensity(1);
  sound.startBgm();
  ui.showHud();
}

function showTitle(): void {
  const hs = loadHighScore();
  ui.showTitle(hs, titleFor(hs, false));
}

function pickUpgrade(index: number): void {
  world.chooseUpgrade(index);
  if (world.pendingChoices) {
    ui.showLevelUp(world.pendingChoices); // 複数レベル分の選択が残っている
  } else {
    ui.hideLevelUp();
  }
}

// レベルアップカードのマウスクリック選択
ui.onPick = (index) => {
  if (state === 'playing' && ui.levelUpVisible) pickUpgrade(index);
};

function loadHighScore(): number {
  return Number(localStorage.getItem(HS_KEY) ?? 0);
}

function saveHighScore(kills: number): void {
  if (kills > loadHighScore()) localStorage.setItem(HS_KEY, String(kills));
}

// --- イベント処理 ---------------------------------------------------------------
function processEvents(): void {
  for (const e of world.events) {
    renderer.handleEvent(e, world);
    switch (e.type) {
      case 'clubSwing': sound.swing(); break;
      case 'hit': sound.hit(); break;
      case 'kill': sound.kill(); break;
      case 'gem': sound.gem(); break;
      case 'meat': sound.meat(); break;
      case 'hurt': sound.hurt(); ui.flashVignette(); break;
      case 'levelup': sound.levelup(); break;
      case 'roar': sound.roar(); break;
      case 'stomp': sound.stomp(); break;
      case 'boneThrow': sound.bone(); break;
      case 'pigCharge': sound.pig(); break;
      case 'minionSummon': sound.summon(); break;
      case 'bossSpawn':
        sound.bossSpawn();
        ui.bossWarning();
        bgmLevel = 3;
        sound.setIntensity(3);
        break;
      case 'win': sound.stopBgm(); sound.win(); break;
      case 'lose': sound.stopBgm(); sound.lose(); break;
      default: break;
    }
  }
  world.events.length = 0;
}

// --- メインループ ---------------------------------------------------------------
let last = performance.now();

function tick(now: number): void {
  requestAnimationFrame(tick);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  fpsSamples.push(1 / Math.max(dt, 1e-6));
  if (fpsSamples.length > 120) fpsSamples = fpsSamples.slice(-120);

  if (state === 'playing') {
    world.update(dt, inputVector());
    processEvents();

    if (world.pendingChoices && !ui.levelUpVisible) {
      ui.showLevelUp(world.pendingChoices);
    }
    if (bgmLevel === 1 && world.time >= GAME_DURATION / 2) {
      bgmLevel = 2;
      sound.setIntensity(2); // 5:00でBGM転調
    }
    ui.updateHud(world);

    if (world.state !== 'playing') {
      resultDelay += dt;
      if (resultDelay > 1.4) {
        if (world.state === 'won') {
          beginEnding(); // 勝利はエンディングシネマを経由する
        } else {
          showResultNow();
        }
      }
    }
  }

  if (state === 'prologue' && prologueScenes) {
    prologueScenes.render(dt);
  } else if (state === 'ending' && ending) {
    ending.render(dt);
    if (finTimer > 0) {
      finTimer -= dt;
      if (finTimer <= 0) showResultNow();
    }
  } else {
    renderer.render(world, dt);
  }
}

showTitle();
requestAnimationFrame(tick);
