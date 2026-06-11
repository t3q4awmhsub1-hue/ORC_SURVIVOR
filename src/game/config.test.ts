import { describe, expect, it } from 'vitest';
import {
  ENEMY_DEFS, GAME_DURATION, SPAWN_PHASES, WEAPON_STATS,
  enemyHpScale, expForLevel, phaseAt, titleFor,
} from './config';

describe('expForLevel', () => {
  it('レベルに応じて単調増加する', () => {
    expect(expForLevel(1)).toBe(12);
    expect(expForLevel(2)).toBe(20);
    for (let lv = 1; lv < 50; lv++) {
      expect(expForLevel(lv + 1)).toBeGreaterThan(expForLevel(lv));
    }
  });
});

describe('enemyHpScale', () => {
  it('開始時は1倍、10分で2.5倍', () => {
    expect(enemyHpScale(0)).toBe(1);
    expect(enemyHpScale(600)).toBeCloseTo(2.5);
  });
});

describe('phaseAt', () => {
  it('開始直後は見習い剣士のみ', () => {
    const p = phaseAt(0);
    expect(p.weights).toEqual({ trainee: 1 });
  });

  it('フェーズ境界ちょうどで次のフェーズに切り替わる', () => {
    expect(phaseAt(59.999).from).toBe(0);
    expect(phaseAt(60).from).toBe(60);
  });

  it('終盤フェーズは出現レートが序盤より高い', () => {
    expect(phaseAt(599).rate).toBeGreaterThan(phaseAt(0).rate * 3);
  });

  it('全フェーズの重み合計はほぼ1（抽選の前提）', () => {
    for (const p of SPAWN_PHASES) {
      const sum = Object.values(p.weights).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 5);
    }
  });
});

describe('武器ステータス', () => {
  it('レベルが上がるとクールダウンは短く、ダメージは増える', () => {
    for (const make of [WEAPON_STATS.club, WEAPON_STATS.bone, WEAPON_STATS.stomp, WEAPON_STATS.roar]) {
      const lv1 = make(1);
      const lv5 = make(5);
      expect(lv5.cooldown).toBeLessThan(lv1.cooldown);
      expect(lv5.dmg).toBeGreaterThan(lv1.dmg);
      expect(lv5.cooldown).toBeGreaterThan(0); // Lv5でも0や負にならない
    }
  });

  it('子分オークはLv5で3体になる', () => {
    expect(WEAPON_STATS.minion(1).max).toBe(1);
    expect(WEAPON_STATS.minion(3).max).toBe(2);
    expect(WEAPON_STATS.minion(5).max).toBe(3);
  });
});

describe('titleFor', () => {
  it('討伐数の境界で称号が切り替わる', () => {
    expect(titleFor(0, false)).toBe('村の小悪党');
    expect(titleFor(99, false)).toBe('村の小悪党');
    expect(titleFor(100, false)).toBe('街道の脅威');
    expect(titleFor(500, false)).toBe('砦の主');
    expect(titleFor(1000, false)).toBe('王国の悪夢');
    expect(titleFor(2000, false)).toBe('勇者卸売業者');
  });

  it('クリア時は討伐数に関わらず最上位称号', () => {
    expect(titleFor(0, true)).toBe('真・魔王軍最強オーク');
  });
});

describe('敵定義の整合性', () => {
  it('ボスは経過時間スケールなしでも10分時点の雑魚より十分硬い', () => {
    const knightAt10min = ENEMY_DEFS.knight.hp * enemyHpScale(GAME_DURATION);
    expect(ENEMY_DEFS.hero.hp).toBeGreaterThan(knightAt10min * 5);
  });

  it('遠隔敵には射程とクールダウンが定義されている', () => {
    for (const kind of ['archer', 'mage'] as const) {
      const def = ENEMY_DEFS[kind];
      expect(def.ranged).toBeDefined();
      expect(def.ranged!.range).toBeGreaterThan(0);
      expect(def.ranged!.cooldown).toBeGreaterThan(0);
    }
  });
});
