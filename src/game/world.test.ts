import { describe, expect, it } from 'vitest';
import { ENEMY_DEFS, GAME_DURATION, PLAYER, expForLevel } from './config';
import { GameWorld, type InputState } from './world';

const IDLE: InputState = { dx: 0, dz: 0 };
const DT = 1 / 60;

/** ポーズ（レベルアップ選択）はそのまま、指定秒だけ進める */
function step(world: GameWorld, seconds: number, input: InputState = IDLE): void {
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) world.update(DT, input);
}

/** レベルアップ選択肢は常に先頭を選びつつ、シミュレーション時間で指定秒進める */
function stepAuto(world: GameWorld, seconds: number, input: InputState = IDLE): void {
  const target = world.time + seconds;
  let guard = Math.ceil(seconds / DT) * 2 + 100;
  while (world.time < target && world.state === 'playing' && guard-- > 0) {
    world.update(DT, input);
    while (world.pendingChoices) world.chooseUpgrade(0);
  }
}

/** 観測用: プレイヤーへのダメージを無効化（被ダメ経路は hurtPlayer に集約されている） */
function makeInvincible(world: GameWorld): void {
  Object.defineProperty(world, 'hurtPlayer', { value: () => {} });
}

describe('プレイヤー移動', () => {
  it('入力方向に移動し、停止すると動かない', () => {
    const w = new GameWorld(1);
    step(w, 1, { dx: 1, dz: 0 });
    expect(w.px).toBeCloseTo(PLAYER.speed, 1);
    expect(w.pz).toBeCloseTo(0, 5);
    const x = w.px;
    step(w, 1, IDLE);
    expect(w.px).toBe(x);
  });

  it('斜め移動は正規化される（速くならない）', () => {
    const w = new GameWorld(1);
    step(w, 1, { dx: 1, dz: 1 });
    expect(Math.hypot(w.px, w.pz)).toBeCloseTo(PLAYER.speed, 1);
  });

  it('アリーナ外には出られない', () => {
    const w = new GameWorld(1);
    stepAuto(w, 30, { dx: 1, dz: 0 });
    expect(Math.hypot(w.px, w.pz)).toBeLessThanOrEqual(55 + 0.001);
  });

  it('豚足パッシブで移動が速くなる', () => {
    const w = new GameWorld(1);
    w.passives.set('trotters', 5);
    step(w, 1, { dx: 1, dz: 0 });
    expect(w.px).toBeCloseTo(PLAYER.speed * 1.4, 1);
  });
});

describe('戦闘', () => {
  it('棍棒が近くの敵を倒し、ジェムがドロップして経験値になる', () => {
    const w = new GameWorld(1);
    w.spawnEnemy('trainee', { x: 0, z: 1.2 });
    step(w, 3, IDLE);
    expect(w.kills).toBe(1);
    expect(w.score).toBe(ENEMY_DEFS.trainee.score);
    expect(w.exp).toBe(ENEMY_DEFS.trainee.xp); // 落ちたジェムは吸引で自動回収される
  });

  it('接触ダメージでHPが減り、0で敗北する', () => {
    const w = new GameWorld(1);
    for (let i = 0; i < 50; i++) w.spawnEnemy('knight', { x: 0, z: -2 });
    stepAuto(w, 60, IDLE);
    expect(w.hp).toBeLessThanOrEqual(0);
    expect(w.state).toBe('lost');
  });

  it('分厚い皮膚パッシブで被ダメージが減る', () => {
    const base = new GameWorld(1);
    const tanky = new GameWorld(1);
    tanky.passives.set('skin', 5); // -40%
    for (const w of [base, tanky]) {
      w.spawnEnemy('knight', { x: 0, z: -0.5 });
      step(w, 2, IDLE);
    }
    const baseLost = PLAYER.maxHp - base.hp;
    const tankyLost = PLAYER.maxHp - tanky.hp;
    expect(baseLost).toBeGreaterThan(0);
    expect(tankyLost).toBeCloseTo(baseLost * 0.6, 0);
  });

  it('遠隔敵（アーチャー）は距離を保って矢を放ち、当たるとダメージ', () => {
    const w = new GameWorld(1);
    w.spawnEnemy('archer', { x: 0, z: -6 });
    step(w, 8, IDLE);
    expect(w.hp).toBeLessThan(PLAYER.maxHp);
    const archer = w.enemies.find((e) => e.active && e.kind === 'archer');
    expect(archer).toBeDefined();
    expect(Math.hypot(archer!.x - w.px, archer!.z - w.pz)).toBeGreaterThan(2);
  });

  it('ナイトはノックバックにほぼ耐性がある', () => {
    const w = new GameWorld(1);
    const knight = w.spawnEnemy('knight', { x: 0, z: 1.5 })!;
    const trainee = w.spawnEnemy('trainee', { x: 0.3, z: 1.5 })!;
    trainee.hp = 1000; // 一撃で死んでプールが再利用されないように
    step(w, 0.6, IDLE); // 初撃（cd 0.5s）が入った直後
    // 耐性0の見習いは耐性0.8のナイトより大きく弾かれる
    expect(trainee.kbz).toBeGreaterThan(knight.kbz * 3);
    expect(knight.kbz).toBeGreaterThan(0); // 完全無効ではない
  });
});

describe('レベルアップ', () => {
  it('経験値が閾値に達すると選択肢3つが提示され、選ぶまで時間が止まる', () => {
    const w = new GameWorld(1);
    w.exp = expForLevel(1);
    step(w, DT, IDLE);
    expect(w.level).toBe(2);
    expect(w.pendingChoices).toHaveLength(3);
    const t = w.time;
    step(w, 1, IDLE);
    expect(w.time).toBe(t); // ポーズ中は進まない
    w.chooseUpgrade(0);
    expect(w.pendingChoices).toBeNull();
    step(w, 1, IDLE);
    expect(w.time).toBeGreaterThan(t);
  });

  it('武器の選択肢を選ぶと装備に追加される', () => {
    const w = new GameWorld(1);
    w.pendingChoices = [{ kind: 'weapon', id: 'stomp', nextLevel: 1 }];
    w.chooseUpgrade(0);
    expect(w.weapons.get('stomp')).toBe(1);
  });

  it('でかい図体を取ると最大HPが増え、増加分が回復する', () => {
    const w = new GameWorld(1);
    w.hp = 50;
    w.pendingChoices = [{ kind: 'passive', id: 'bulk', nextLevel: 1 }];
    w.chooseUpgrade(0);
    expect(w.maxHp).toBeCloseTo(120);
    expect(w.hp).toBeCloseTo(70);
  });

  it('回復の選択肢はHPを30回復する（最大HPは超えない）', () => {
    const w = new GameWorld(1);
    w.hp = 90;
    w.pendingChoices = [{ kind: 'heal' }];
    w.chooseUpgrade(0);
    expect(w.hp).toBe(100);
  });
});

describe('スポーンタイムライン', () => {
  it('開始直後は見習い剣士だけが湧く', () => {
    const w = new GameWorld(1);
    makeInvincible(w);
    stepAuto(w, 15, IDLE);
    const kinds = new Set(w.enemies.filter((e) => e.active).map((e) => e.kind));
    expect(kinds.size).toBeGreaterThan(0);
    expect([...kinds]).toEqual(['trainee']);
  });

  it('3:00の第1波で総スポーン数が一気に増える', () => {
    const before = totalSpawned(179);
    const after = totalSpawned(181);
    expect(after - before).toBeGreaterThanOrEqual(40);
  });

  it('10:00で雑魚スポーンが止まりボスが1体だけ出現する', () => {
    const w = new GameWorld(1);
    makeInvincible(w);
    stepAuto(w, GAME_DURATION + 2, IDLE);
    const bosses = w.enemies.filter((e) => e.active && e.kind === 'hero');
    expect(bosses).toHaveLength(1);
  });

  it('ボスを倒すと勝利になる', () => {
    const w = new GameWorld(1);
    makeInvincible(w);
    w.time = GAME_DURATION;
    step(w, DT, IDLE);
    const boss = w.enemies.find((e) => e.active && e.kind === 'hero');
    expect(boss).toBeDefined();
    boss!.x = w.px;
    boss!.z = w.pz + 1.0;
    boss!.hp = 1;
    stepAuto(w, 3, IDLE);
    expect(w.state).toBe('won');
  });
});

describe('決定性', () => {
  it('同じシードと入力なら同じ結果になる', () => {
    const results: Array<[number, number, number, number, number]> = [];
    for (let run = 0; run < 2; run++) {
      const w = new GameWorld(99);
      stepAuto(w, 45, { dx: 0.7, dz: -0.3 });
      stepAuto(w, 45, { dx: -1, dz: 0 });
      results.push([w.px, w.pz, w.hp, w.kills, w.activeEnemyCount()]);
    }
    expect(results[0]).toEqual(results[1]);
  });
});

/** seed=1でtimeSec秒まで観測し、総スポーン数（撃破+生存）を返す */
function totalSpawned(timeSec: number): number {
  const w = new GameWorld(1);
  makeInvincible(w);
  stepAuto(w, timeSec, IDLE);
  return w.kills + w.activeEnemyCount();
}
