import { describe, expect, it } from 'vitest';
import { mulberry32, pickN, weightedPick } from './rng';

describe('mulberry32', () => {
  it('同じシードなら同じ系列を返す（決定性）', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    for (let i = 0; i < 100; i++) {
      expect(a()).toBe(b());
    }
  });

  it('異なるシードは異なる系列を返す', () => {
    const a = mulberry32(1);
    const b = mulberry32(2);
    const seqA = Array.from({ length: 10 }, () => a());
    const seqB = Array.from({ length: 10 }, () => b());
    expect(seqA).not.toEqual(seqB);
  });

  it('値は常に[0,1)の範囲', () => {
    const rng = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('weightedPick', () => {
  it('重み0のキーはほぼ選ばれず、重みに比例して選ばれる', () => {
    const rng = mulberry32(123);
    const counts = { a: 0, b: 0, c: 0 };
    for (let i = 0; i < 3000; i++) {
      counts[weightedPick(rng, { a: 1, b: 3, c: 0 })]++;
    }
    expect(counts.c).toBe(0);
    expect(counts.b).toBeGreaterThan(counts.a * 2); // 期待比 3:1 のゆるい検証
    expect(counts.a + counts.b).toBe(3000);
  });
});

describe('pickN', () => {
  it('重複なしでn個選ぶ', () => {
    const rng = mulberry32(5);
    const picked = pickN(rng, ['a', 'b', 'c', 'd', 'e'], 3);
    expect(picked).toHaveLength(3);
    expect(new Set(picked).size).toBe(3);
  });

  it('要素数がn未満なら全要素を返す', () => {
    const rng = mulberry32(5);
    const picked = pickN(rng, ['a', 'b'], 5);
    expect(picked.sort()).toEqual(['a', 'b']);
  });

  it('空配列なら空を返す', () => {
    const rng = mulberry32(5);
    expect(pickN(rng, [], 3)).toEqual([]);
  });
});
