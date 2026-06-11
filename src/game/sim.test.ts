import { describe, expect, it } from 'vitest';
import { GAME_DURATION, WEAPON_STATS, ENEMY_DEFS } from './config';
import { GameWorld } from './world';
import type { UpgradeChoice } from './upgrades';

/**
 * 自動プレイシミュレーションによるバランス検証。
 * 「敵の密度が薄い方向へ逃げ続け、武器優先でビルドする」素朴なAIでも
 * 中盤までは生存できること（＝初見の人間が即死しない難易度）を担保する。
 */

const DT = 1 / 30;

/**
 * 「群れの縁で間合いを保って刈る」AI:
 * 棍棒の射程(約2.3)を意識して、近すぎれば離れ、遠すぎれば寄る。
 * 余裕があればジェムを回収する。
 */
function kiteInput(w: GameWorld): { dx: number; dz: number } {
  // 最寄りの敵と局所的な圧力ベクトル。遠隔敵は優先的に狩る（人間の定石）
  let nd = Number.POSITIVE_INFINITY;
  let nx = 0;
  let nz = 0;
  let rd = Number.POSITIVE_INFINITY;
  let rx = 0;
  let rz = 0;
  let fx = 0;
  let fz = 0;
  for (const e of w.enemies) {
    if (!e.active) continue;
    const dx = w.px - e.x;
    const dz = w.pz - e.z;
    const d = Math.hypot(dx, dz);
    if (d < nd) {
      nd = d;
      nx = e.x;
      nz = e.z;
    }
    if ((e.kind === 'archer' || e.kind === 'mage') && d < rd && d < 12) {
      rd = d;
      rx = e.x;
      rz = e.z;
    }
    if (d < 4) {
      fx += dx / Math.max(0.3, d * d);
      fz += dz / Math.max(0.3, d * d);
    }
  }
  // 近接の圧が弱いときは射手を狩りに行く
  if (Number.isFinite(rd) && nd > 1.8) {
    nx = rx;
    nz = rz;
    nd = Math.max(2.5, nd); // engage判定を「寄る」側に倒す
  }

  // HPが減っているときは安全マージンを広げる（人間の自衛行動）
  const lowHp = w.hp < w.maxHp * 0.45;
  const engageDist = lowHp ? 5.5 : 2.4;
  const fleeDist = lowHp ? 4.0 : 1.5;

  let dx: number;
  let dz: number;
  if (!Number.isFinite(nd)) {
    // 敵がいない: 中央へ戻る
    const d = Math.hypot(w.px, w.pz) || 1;
    dx = -w.px / d;
    dz = -w.pz / d;
  } else if (nd < fleeDist) {
    // 近すぎ: 圧力の低い方へ離脱 + 接線
    const len = Math.hypot(fx, fz) || 1;
    dx = fx / len - (fz / len) * 0.35;
    dz = fz / len + (fx / len) * 0.35;
  } else if (nd > engageDist) {
    // 遠い: ジェムがあれば回収、なければ群れの縁へ寄る
    let gx = 0;
    let gz = 0;
    let gd = 10;
    for (const g of w.gems) {
      if (!g.active) continue;
      const d = Math.hypot(g.x - w.px, g.z - w.pz);
      if (d < gd) {
        gd = d;
        gx = g.x;
        gz = g.z;
      }
    }
    if (gd < 10 && nd > 3.5) {
      const d = gd || 1;
      dx = (gx - w.px) / d;
      dz = (gz - w.pz) / d;
    } else {
      const d = Math.hypot(nx - w.px, nz - w.pz) || 1;
      dx = (nx - w.px) / d;
      dz = (nz - w.pz) / d;
    }
  } else {
    // ちょうどいい間合い: 接線方向に回りながら微妙に離れる
    const tx = -(nz - w.pz);
    const tz = nx - w.px;
    const tl = Math.hypot(tx, tz) || 1;
    const len = Math.hypot(fx, fz) || 1;
    dx = (tx / tl) * 0.85 + (fx / len) * 0.3;
    dz = (tz / tl) * 0.85 + (fz / len) * 0.3;
  }

  // 向かってくる弾を垂直方向に避ける（人間のドッジ）
  for (const p of w.projectiles) {
    if (!p.active || p.fromPlayer) continue;
    const tox = w.px - p.x;
    const toz = w.pz - p.z;
    const d = Math.hypot(tox, toz);
    if (d > 4) continue;
    const vl = Math.hypot(p.vx, p.vz) || 1;
    const closing = (tox * p.vx + toz * p.vz) / (d * vl || 1);
    if (closing > 0.85) {
      // 弾道に対して垂直へ強く回避
      const ex = -p.vz / vl;
      const ez = p.vx / vl;
      const side = ex * tox + ez * toz >= 0 ? 1 : -1;
      dx = dx * 0.3 + ex * side * 1.2;
      dz = dz * 0.3 + ez * side * 1.2;
      break;
    }
  }

  // 壁際では中央方向へ補正
  const fromCenter = Math.hypot(w.px, w.pz);
  if (fromCenter > 45) {
    dx = dx * 0.4 - (w.px / fromCenter) * 0.6;
    dz = dz * 0.4 - (w.pz / fromCenter) * 0.6;
  }
  return { dx, dz };
}

/** 武器優先・次にパッシブの貪欲ビルド戦略 */
const PRIORITY = [
  'weapon:bone', 'weapon:club', 'weapon:stomp', 'weapon:roar',
  'passive:muscle', 'passive:skin', 'passive:bulk', 'passive:trotters',
  'passive:glutton', 'passive:nose', 'weapon:pig', 'weapon:minion',
];

function pickChoice(choices: UpgradeChoice[], lowHp: boolean): number {
  if (lowHp) {
    const heal = choices.findIndex((c) => c.kind === 'heal');
    if (heal >= 0) return heal;
  }
  let best = 0;
  let bestRank = Number.POSITIVE_INFINITY;
  choices.forEach((c, i) => {
    const key = c.kind === 'heal' ? 'heal' : `${c.kind}:${c.id}`;
    const rank = PRIORITY.indexOf(key);
    const r = rank < 0 ? 90 : rank;
    if (r < bestRank) {
      bestRank = r;
      best = i;
    }
  });
  return best;
}

interface SimResult {
  survivedSec: number;
  kills: number;
  level: number;
  state: string;
}

function runSim(seed: number, maxSec: number): SimResult {
  const w = new GameWorld(seed);
  let guard = Math.ceil(maxSec / DT) * 2;
  while (w.state === 'playing' && w.time < maxSec && guard-- > 0) {
    w.update(DT, kiteInput(w));
    while (w.pendingChoices) w.chooseUpgrade(pickChoice(w.pendingChoices, w.hp < w.maxHp * 0.5));
    w.events.length = 0;
  }
  return { survivedSec: w.time, kills: w.kills, level: w.level, state: w.state };
}

describe('自動プレイ・バランスシミュレーション', () => {
  // 難易度の基準: このAIは「弾は避けるが、ビルド構成・先読み・地形利用をしない平均的プレイヤーの下位互換」。
  // 人間はこのAIを上回るため、「初回は中盤〜終盤で死に、上達するとクリアできる」VS系の難度カーブに相当する。
  // 閾値はゲーム時間(5:00)に対する比率: 序盤35% / 平均50% / ベスト80%

  it('生存時間の分布が難度カーブの範囲にある', () => {
    const results = [1, 2, 3, 4, 5].map((s) => runSim(s, GAME_DURATION + 30));
    const detail = results.map((r, i) => `seed=${i + 1}: ${r.survivedSec.toFixed(0)}s ${r.state}`).join(' / ');
    console.log(`[sim] ${detail}`); // 難度の実測値を常に記録する
    // どのシードでも1:45より前に死なない（序盤が理不尽でないこと）
    for (const r of results) {
      expect(r.survivedSec, detail).toBeGreaterThanOrEqual(105);
    }
    // 平均2:30以上（中盤の壁が高すぎないこと）
    const mean = results.reduce((a, r) => a + r.survivedSec, 0) / results.length;
    expect(mean, detail).toBeGreaterThanOrEqual(150);
    // ベストは4:00以上（上手いプレイならクリア圏内に届くこと）
    const best = Math.max(...results.map((r) => r.survivedSec));
    expect(best, detail).toBeGreaterThanOrEqual(240);
  }, 180_000);

  it('折返し(2:30)時点で十分な討伐数と成長が得られている（爽快感の担保）', () => {
    const r = runSim(1, GAME_DURATION / 2);
    expect(r.kills).toBeGreaterThan(100);
    expect(r.level).toBeGreaterThanOrEqual(7);
  }, 30_000);

  it('フルビルドの理論DPSでボスを現実的な時間(60秒以内)に倒せる', () => {
    // 近接フルビルド時の対単体DPSの概算
    const club = WEAPON_STATS.club(5);
    const bone = WEAPON_STATS.bone(5);
    const stomp = WEAPON_STATS.stomp(5);
    const muscle = 1.5; // 筋肉Lv5
    const dpsSingleTarget =
      (club.dmg / club.cooldown + bone.dmg / bone.cooldown + stomp.dmg / stomp.cooldown) * muscle;
    const timeToKill = ENEMY_DEFS.hero.hp / dpsSingleTarget;
    expect(timeToKill).toBeLessThan(60);
  });
});
