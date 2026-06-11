/** シード可能なPRNG（mulberry32）。リプレイ検証・デイリーチャレンジに備える */
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** min以上max未満 */
export function range(rng: Rng, min: number, max: number): number {
  return min + rng() * (max - min);
}

/** 重み付き抽選。weightsの合計は任意 */
export function weightedPick<T extends string>(rng: Rng, weights: Partial<Record<T, number>>): T {
  const entries = Object.entries(weights) as Array<[T, number]>;
  let total = 0;
  for (const [, w] of entries) total += w;
  let r = rng() * total;
  for (const [key, w] of entries) {
    r -= w;
    if (r <= 0) return key;
  }
  return entries[entries.length - 1][0];
}

/** 重複なしでn個選ぶ */
export function pickN<T>(rng: Rng, arr: readonly T[], n: number): T[] {
  const pool = arr.slice();
  const out: T[] = [];
  while (out.length < n && pool.length > 0) {
    const i = Math.floor(rng() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}
