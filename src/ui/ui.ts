import { GAME_DURATION, expForLevel } from '../game/config';
import type { GameWorld } from '../game/world';
import { choiceInfo, type UpgradeChoice } from '../game/upgrades';
import { copyCard, downloadCard, drawShareCard, formatTime, openXShare, type RunStats } from './share';

function el<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`#${id} not found`);
  return node as T;
}

export class UI {
  private readonly title = el('title-screen');
  private readonly hud = el('hud');
  private readonly levelup = el('levelup');
  private readonly choicesBox = el('choices');
  private readonly pause = el('pause');
  private readonly result = el('result');
  private readonly vignette = el('vignette');
  private readonly warning = el('warning');
  private readonly timer = el('timer');
  private readonly hpfill = el('hpfill');
  private readonly expfill = el('expfill');
  private readonly lvl = el('lvl');
  private readonly killsEl = el('kills');
  private readonly bossbar = el('bossbar');
  private readonly bossfill = el('bossfill');
  private readonly skillIcons = el('skill-icons');
  private warningTimer: number | null = null;

  onPick: ((index: number) => void) | null = null;

  constructor() {
    this.choicesBox.addEventListener('click', (ev) => {
      const target = (ev.target as HTMLElement).closest('[data-index]');
      if (target) this.onPick?.(Number((target as HTMLElement).dataset.index));
    });
  }

  showTitle(highScore: number, bestTitle: string): void {
    this.hideAll();
    const hs = el('highscore');
    hs.textContent = highScore > 0
      ? `ハイスコア: 討伐 ${highScore.toLocaleString()}人「${bestTitle}」`
      : '';
    this.title.classList.remove('hidden');
  }

  showHud(): void {
    this.hideAll();
    this.hud.classList.remove('hidden');
  }

  hideAll(): void {
    for (const s of [this.title, this.levelup, this.pause, this.result]) s.classList.add('hidden');
    this.hud.classList.add('hidden');
  }

  updateHud(world: GameWorld): void {
    const remain = Math.max(0, GAME_DURATION - world.time);
    const boss = world.bossIndex >= 0 ? world.enemies[world.bossIndex] : null;
    const bossAlive = !!boss && boss.active && boss.kind === 'hero';
    this.timer.textContent = bossAlive ? 'FINAL BATTLE' : formatTime(remain);
    this.timer.classList.toggle('final', bossAlive || remain <= 60);

    this.hpfill.style.width = `${Math.max(0, (world.hp / world.maxHp) * 100)}%`;
    this.lvl.textContent = `Lv${world.level}`;
    this.expfill.style.width = `${(world.exp / expForLevel(world.level)) * 100}%`;
    this.killsEl.textContent = `⚔ ${world.kills.toLocaleString()}`;

    this.bossbar.classList.toggle('hidden', !bossAlive);
    if (bossAlive && boss) {
      this.bossfill.style.width = `${Math.max(0, (boss.hp / boss.maxHp) * 100)}%`;
    }

    const icons: string[] = [];
    for (const [id, lv] of world.weapons) icons.push(`${choiceInfo({ kind: 'weapon', id, nextLevel: lv }).icon}${lv}`);
    for (const [id, lv] of world.passives) icons.push(`${choiceInfo({ kind: 'passive', id, nextLevel: lv }).icon}${lv}`);
    this.skillIcons.textContent = icons.join(' ');
  }

  showLevelUp(choices: UpgradeChoice[]): void {
    this.choicesBox.innerHTML = '';
    choices.forEach((c, i) => {
      const info = choiceInfo(c);
      const card = document.createElement('button');
      card.className = 'choice';
      card.dataset.index = String(i);
      card.innerHTML = `
        <span class="choice-key">${i + 1}</span>
        <span class="choice-icon">${info.icon}</span>
        <span class="choice-name">${info.name} <em>${info.levelText}</em></span>
        <span class="choice-desc">${info.desc}</span>`;
      this.choicesBox.appendChild(card);
    });
    this.levelup.classList.remove('hidden');
  }

  hideLevelUp(): void {
    this.levelup.classList.add('hidden');
  }

  get levelUpVisible(): boolean {
    return !this.levelup.classList.contains('hidden');
  }

  showPause(): void { this.pause.classList.remove('hidden'); }
  hidePause(): void { this.pause.classList.add('hidden'); }

  showResult(stats: RunStats, url: string): void {
    this.hud.classList.add('hidden');
    el('result-headline').textContent = stats.won
      ? '🏆 完全勝利！真の勇者を返り討ちにした！'
      : '💀 オークは力尽きた…';
    el('result-headline').className = stats.won ? 'won' : 'lost';
    el('result-stats').innerHTML = `
      <div class="stat"><span>称号</span><strong>「${stats.title}」</strong></div>
      <div class="stat"><span>討伐した勇者</span><strong>${stats.kills.toLocaleString()}人</strong></div>
      <div class="stat"><span>生存時間</span><strong>${formatTime(stats.timeSec)}</strong></div>
      <div class="stat"><span>スコア</span><strong>${stats.score.toLocaleString()}</strong></div>
      <div class="stat"><span>到達レベル</span><strong>Lv${stats.level}</strong></div>`;
    const card = el<HTMLCanvasElement>('card');
    drawShareCard(card, stats);
    el('share-x').onclick = () => openXShare(stats, url);
    el('save-card').onclick = () => downloadCard(card);
    el('copy-card').onclick = async () => {
      const ok = await copyCard(card);
      el('copy-card').textContent = ok ? '✅ コピーしました' : '❌ 未対応ブラウザ';
      setTimeout(() => { el('copy-card').textContent = '画像をコピー'; }, 1600);
    };
    this.result.classList.remove('hidden');
  }

  bossWarning(): void {
    this.warning.classList.remove('hidden');
    if (this.warningTimer) clearTimeout(this.warningTimer);
    this.warningTimer = setTimeout(() => this.warning.classList.add('hidden'), 3000) as unknown as number;
  }

  flashVignette(): void {
    this.vignette.classList.remove('flash');
    void this.vignette.offsetWidth; // アニメーション再トリガ
    this.vignette.classList.add('flash');
  }
}

/** リザルト用の統計を組み立てる */
export function collectStats(world: GameWorld, title: string): RunStats {
  const icons: string[] = [];
  for (const [id] of world.weapons) icons.push(choiceInfo({ kind: 'weapon', id, nextLevel: 1 }).icon);
  for (const [id] of world.passives) icons.push(choiceInfo({ kind: 'passive', id, nextLevel: 1 }).icon);
  return {
    won: world.state === 'won',
    kills: world.kills,
    score: world.score,
    timeSec: world.time,
    level: world.level,
    title,
    buildIcons: icons,
  };
}
