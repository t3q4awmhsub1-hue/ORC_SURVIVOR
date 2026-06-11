/**
 * タッチ位置を基準に出現する仮想スティック。
 * 触れた場所がスティックの中心になり、ドラッグ方向が移動入力になる。
 */
export class VirtualJoystick {
  /** 正規化済み入力（-1..1）。タッチしていないときは0 */
  dx = 0;
  dz = 0;

  private readonly base: HTMLDivElement;
  private readonly knob: HTMLDivElement;
  private touchId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly radius = 60;

  /** trueを返す状態のときだけタッチを移動入力として扱う */
  enabled: () => boolean = () => true;

  constructor() {
    this.base = document.createElement('div');
    this.base.id = 'stick-base';
    this.knob = document.createElement('div');
    this.knob.id = 'stick-knob';
    this.base.appendChild(this.knob);
    document.body.appendChild(this.base);

    document.addEventListener('touchstart', (e) => this.onStart(e), { passive: false });
    document.addEventListener('touchmove', (e) => this.onMove(e), { passive: false });
    document.addEventListener('touchend', (e) => this.onEnd(e));
    document.addEventListener('touchcancel', (e) => this.onEnd(e));
  }

  get active(): boolean {
    return this.touchId !== null;
  }

  private onStart(e: TouchEvent): void {
    if (!this.enabled() || this.touchId !== null) return;
    // ボタンやカード上のタッチはUI操作として通す
    if ((e.target as HTMLElement).closest('button, .choice, a')) return;
    const t = e.changedTouches[0];
    this.touchId = t.identifier;
    this.originX = t.clientX;
    this.originY = t.clientY;
    this.base.style.display = 'block';
    this.base.style.left = `${t.clientX}px`;
    this.base.style.top = `${t.clientY}px`;
    this.setKnob(0, 0);
    e.preventDefault();
  }

  private onMove(e: TouchEvent): void {
    if (this.touchId === null) return;
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.touchId) continue;
      let ox = t.clientX - this.originX;
      let oy = t.clientY - this.originY;
      const len = Math.hypot(ox, oy);
      if (len > this.radius) {
        ox = (ox / len) * this.radius;
        oy = (oy / len) * this.radius;
      }
      this.setKnob(ox, oy);
      // デッドゾーン15%
      const norm = Math.min(1, len / this.radius);
      if (norm < 0.15) {
        this.dx = 0;
        this.dz = 0;
      } else {
        this.dx = ox / this.radius;
        this.dz = oy / this.radius; // 画面下方向 = +z（ワールドの手前方向）
      }
      e.preventDefault();
      return;
    }
  }

  private onEnd(e: TouchEvent): void {
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier !== this.touchId) continue;
      this.reset();
      return;
    }
  }

  reset(): void {
    this.touchId = null;
    this.dx = 0;
    this.dz = 0;
    this.base.style.display = 'none';
  }

  private setKnob(ox: number, oy: number): void {
    this.knob.style.transform = `translate(calc(${ox}px - 50%), calc(${oy}px - 50%))`;
  }
}
