/** 均一グリッドの空間分割。毎フレーム clear → insert で再構築する */
export class SpatialGrid {
  private readonly cellSize: number;
  private readonly buckets = new Map<number, number[]>();
  private readonly xs: number[] = [];
  private readonly zs: number[] = [];

  constructor(cellSize: number) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number): number {
    // 16bitずつにパック（±32767セルまで）
    return ((cx + 0x8000) << 16) | ((cz + 0x8000) & 0xffff);
  }

  clear(): void {
    for (const b of this.buckets.values()) b.length = 0;
    this.xs.length = 0;
    this.zs.length = 0;
  }

  insert(index: number, x: number, z: number): void {
    this.xs[index] = x;
    this.zs[index] = z;
    const cx = Math.floor(x / this.cellSize);
    const cz = Math.floor(z / this.cellSize);
    const k = this.key(cx, cz);
    let bucket = this.buckets.get(k);
    if (!bucket) {
      bucket = [];
      this.buckets.set(k, bucket);
    }
    bucket.push(index);
  }

  /** 円内のインデックスをoutに集めて件数を返す（outは呼び出し側で使い回す） */
  queryCircle(x: number, z: number, r: number, out: number[]): number {
    out.length = 0;
    const cs = this.cellSize;
    const minX = Math.floor((x - r) / cs);
    const maxX = Math.floor((x + r) / cs);
    const minZ = Math.floor((z - r) / cs);
    const maxZ = Math.floor((z + r) / cs);
    const r2 = r * r;
    for (let cx = minX; cx <= maxX; cx++) {
      for (let cz = minZ; cz <= maxZ; cz++) {
        const bucket = this.buckets.get(this.key(cx, cz));
        if (!bucket) continue;
        for (const i of bucket) {
          const dx = this.xs[i] - x;
          const dz = this.zs[i] - z;
          if (dx * dx + dz * dz <= r2) out.push(i);
        }
      }
    }
    return out.length;
  }
}
