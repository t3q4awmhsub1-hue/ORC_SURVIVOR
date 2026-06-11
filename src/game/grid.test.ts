import { describe, expect, it } from 'vitest';
import { SpatialGrid } from './grid';

describe('SpatialGrid', () => {
  it('円内のインデックスだけを返す', () => {
    const grid = new SpatialGrid(1.5);
    grid.insert(0, 0, 0);
    grid.insert(1, 1, 0);
    grid.insert(2, 5, 0);
    grid.insert(3, 0, -1.2);
    const out: number[] = [];
    grid.queryCircle(0, 0, 2, out);
    expect(out.sort()).toEqual([0, 1, 3]);
  });

  it('境界ちょうど（距離=半径）は含む', () => {
    const grid = new SpatialGrid(1.5);
    grid.insert(0, 3, 0);
    const out: number[] = [];
    grid.queryCircle(0, 0, 3, out);
    expect(out).toEqual([0]);
  });

  it('セル境界をまたぐ点も漏れなく拾う', () => {
    const grid = new SpatialGrid(1.5);
    // セルサイズ1.5の境界(1.5, 3.0)付近に配置
    grid.insert(0, 1.49, 1.49);
    grid.insert(1, 1.51, 1.51);
    grid.insert(2, -1.51, -1.49);
    const out: number[] = [];
    grid.queryCircle(0, 0, 2.2, out);
    expect(out.sort()).toEqual([0, 1, 2]);
  });

  it('負の座標でも動く', () => {
    const grid = new SpatialGrid(1.5);
    grid.insert(0, -10.2, -7.7);
    const out: number[] = [];
    grid.queryCircle(-10, -8, 1, out);
    expect(out).toEqual([0]);
    grid.queryCircle(10, 8, 1, out);
    expect(out).toEqual([]);
  });

  it('clearで空になり再利用できる', () => {
    const grid = new SpatialGrid(1.5);
    grid.insert(0, 0, 0);
    grid.clear();
    const out: number[] = [];
    expect(grid.queryCircle(0, 0, 5, out)).toBe(0);
    grid.insert(7, 0.5, 0.5);
    grid.queryCircle(0, 0, 5, out);
    expect(out).toEqual([7]);
  });
});
