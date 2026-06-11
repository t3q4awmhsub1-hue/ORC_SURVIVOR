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
    expect(w.maxHp).toBeCloseTo(PLAYER.maxHp * 1.2);
    expect(w.hp).toBeCloseTo(50 + PLAYER.maxHp * 0.2);
  });

  it('回復の選択肢はHPを30回復する', () => {
    const w = new GameWorld(1);
    w.hp = 50;
    w.pendingChoices = [{ kind: 'heal' }];
    w.chooseUpgrade(0);
    expect(w.hp).toBe(80);
  });

  it('回復は最大HPを超えない', () => {
    const w = new GameWorld(1);
    w.hp = PLAYER.maxHp - 10;
    w.pendingChoices = [{ kind: 'heal' }];
    w.chooseUpgrade(0);
    expect(w.hp).toBe(PLAYER.maxHp);
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

  it('1:30の第1波で総スポーン数が一気に増える', () => {
    const before = totalSpawned(89);
    const after = totalSpawned(91);
    expect(after - before).toBeGreaterThanOrEqual(40);
  });

  it('5:00で雑魚スポーンが止まりボスが1体だけ出現する', () => {
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

describe('武器進化', () => {
  it('武器Lv5 + 対応パッシブ所持で自動進化する', () => {
    const w = new GameWorld(1);
    w.weapons.set('club', 4);
    w.passives.set('muscle', 1);
    w.pendingChoices = [{ kind: 'weapon', id: 'club', nextLevel: 5 }];
    w.chooseUpgrade(0);
    expect(w.evolved.has('club')).toBe(true);
    expect(w.events.some((e) => e.type === 'evolve' && e.kind === 'club')).toBe(true);
  });

  it('対応パッシブがなければLv5でも進化しない', () => {
    const w = new GameWorld(1);
    w.weapons.set('club', 4);
    w.passives.set('skin', 5); // 対応外のパッシブ
    w.pendingChoices = [{ kind: 'weapon', id: 'club', nextLevel: 5 }];
    w.chooseUpgrade(0);
    expect(w.evolved.has('club')).toBe(false);
  });

  it('武器がLv5になった後でパッシブを取っても進化する', () => {
    const w = new GameWorld(1);
    w.weapons.set('bone', 5);
    w.pendingChoices = [{ kind: 'passive', id: 'nose', nextLevel: 1 }];
    w.chooseUpgrade(0);
    expect(w.evolved.has('bone')).toBe(true);
  });

  it('宝箱のLvアップ経由でも進化する', () => {
    const w = new GameWorld(1);
    w.weapons.set('club', 4);
    w.passives.set('muscle', 5); // 強化候補はclubのみ
    w.spawnChestForTest('silver', 0, 0.5);
    step(w, 0.1, IDLE);
    expect(w.weapons.get('club')).toBe(5);
    expect(w.evolved.has('club')).toBe(true);
  });

  it('進化した棍棒は全周(背後の敵も)を薙ぎ払う', () => {
    const w = new GameWorld(1);
    w.weapons.set('club', 5);
    w.passives.set('muscle', 1);
    w.pendingChoices = [{ kind: 'heal' }];
    w.chooseUpgrade(0); // checkEvolutionsを発火
    expect(w.evolved.has('club')).toBe(true);
    w.spawnEnemy('trainee', { x: 0, z: 1.5 });
    w.spawnEnemy('trainee', { x: 0, z: -1.5 });
    step(w, 0.6, IDLE); // 進化棍棒の初撃（タイムラインの初スポーンは0.71s以降）
    expect(w.kills).toBe(2); // 前後とも一撃で討伐
  });

  it('竜骨ブーメランは折り返して戻ってくる', () => {
    const w = new GameWorld(1);
    w.weapons.set('bone', 5);
    w.passives.set('nose', 1);
    w.pendingChoices = [{ kind: 'heal' }];
    w.chooseUpgrade(0);
    expect(w.evolved.has('bone')).toBe(true);
    w.spawnEnemy('knight', { x: 0, z: 8 });
    step(w, 1.5, IDLE); // 寿命2.5sの半分(1.25s)を超えて折り返している
    expect(w.projectiles.some((p) => p.active && p.boomerang && p.returning)).toBe(true);
  });
});

describe('宝箱', () => {
  it('パラディンは確定で金の宝箱をドロップする', () => {
    const w = new GameWorld(1);
    // 虹の抽選をスキップするため全レリック所持にする（虹は未所持がある場合のみ）
    for (const id of ['kanabo', 'belly', 'heart', 'hog'] as const) w.relics.add(id);
    const paladin = w.spawnEnemy('paladin', { x: 0, z: 30 })!; // 拾わない位置
    paladin.hp = 1;
    paladin.x = 0; paladin.z = 30;
    // 直接ダメージ経路を通す（プールの別敵と区別するためtierを検証）
    (w as never as { damageEnemy: (e: unknown, d: number, x: number, z: number, k: number) => void })
      .damageEnemy(paladin, 9999, 0, 1, 0);
    const chest = w.chests.find((c) => c.active);
    expect(chest).toBeDefined();
    expect(chest!.tier).toBe('gold');
  });

  it('銀の宝箱は所持スキルをLv+1する', () => {
    const w = new GameWorld(1);
    w.weapons.set('club', 2);
    w.spawnChestForTest('silver', 0, 0.5);
    step(w, 0.1, IDLE); // 接触範囲内なので即開封
    const clubLv = w.weapons.get('club')!;
    const passiveLevels = [...w.passives.values()];
    // club(唯一の所持スキル)が上がる
    expect(clubLv + passiveLevels.reduce((a, b) => a + b, 0)).toBe(3);
    expect(w.events.some((e) => e.type === 'chest')).toBe(true);
  });

  it('木の宝箱は回復と経験値。経験値は時間経過でスケールする', () => {
    const early = new GameWorld(1);
    early.hp = 50;
    early.spawnChestForTest('wood', 0, 0.5);
    step(early, 0.1, IDLE);
    expect(early.hp).toBeCloseTo(75, 0);
    const late = new GameWorld(1);
    late.time = 240;
    late.spawnChestForTest('wood', 0, 0.5);
    step(late, 0.1, IDLE);
    expect(late.exp).toBeGreaterThan(early.exp);
  });

  it('虹の宝箱で未所持レリックを獲得し、効果が反映される', () => {
    const w = new GameWorld(1);
    const baseAtk = w.attackMul;
    const baseHp = w.maxHp;
    const baseSpeed = w.moveSpeed;
    for (let i = 0; i < 4; i++) {
      w.spawnChestForTest('rainbow', 0, 0.5);
      step(w, 0.1, IDLE);
    }
    expect(w.relics.size).toBe(4); // 4種すべて獲得（重複しない）
    expect(w.attackMul).toBeCloseTo(baseAtk * 2.2);
    expect(w.maxHp).toBeCloseTo(baseHp * 2);
    expect(w.moveSpeed).toBeCloseTo(baseSpeed * 1.25);
    expect(w.damageTakenMul).toBeCloseTo(0.65);
  });

  it('全レリック所持後の虹の宝箱は経験値に変換される', () => {
    const w = new GameWorld(1);
    for (const id of ['kanabo', 'belly', 'heart', 'hog'] as const) w.relics.add(id);
    const expBefore = w.exp;
    w.spawnChestForTest('rainbow', 0, 0.5);
    step(w, 0.1, IDLE);
    expect(w.relics.size).toBe(4);
    expect(w.exp).toBeGreaterThan(expBefore);
  });

  it('不滅の鉄腹は毎秒自動回復する', () => {
    const w = new GameWorld(1);
    w.relics.add('belly');
    w.hp = 100;
    step(w, 2, IDLE);
    expect(w.hp).toBeGreaterThan(100);
  });

  it('約1%の確率で虹の宝箱がドロップする（統計検証）', () => {
    const w = new GameWorld(7);
    let rainbows = 0;
    const trials = 4000;
    for (let i = 0; i < trials; i++) {
      for (const c of w.chests) c.active = false;
      w.relics.clear();
      const e = w.spawnEnemy('trainee', { x: 0, z: 40 })!;
      (w as never as { damageEnemy: (e: unknown, d: number, x: number, z: number, k: number) => void })
        .damageEnemy(e, 9999, 0, 1, 0);
      if (w.chests.some((c) => c.active && c.tier === 'rainbow')) rainbows++;
    }
    const rate = rainbows / trials;
    expect(rate).toBeGreaterThan(0.005);
    expect(rate).toBeLessThan(0.018);
  });
});

describe('ステージ難易度', () => {
  it('じごくステージは敵HP・被ダメ・スコアが増える', () => {
    const grass = new GameWorld(1, 'grass');
    const hell = new GameWorld(1, 'hell');
    const eg = grass.spawnEnemy('knight', { x: 0, z: 40 })!;
    const eh = hell.spawnEnemy('knight', { x: 0, z: 40 })!;
    expect(eh.maxHp).toBeCloseTo(eg.maxHp * 1.45, 1);
    // 被ダメ倍率
    for (const w of [grass, hell]) {
      w.spawnEnemy('trainee', { x: 0, z: -0.5 });
      step(w, 0.5, IDLE);
    }
    const grassLost = grass.maxHp - grass.hp;
    const hellLost = hell.maxHp - hell.hp;
    expect(hellLost).toBeGreaterThan(grassLost * 1.1);
    // スコア倍率（trainee=1pt → hell 2pt）
    const w2 = new GameWorld(1, 'hell');
    w2.spawnEnemy('trainee', { x: 0, z: 1.2 });
    step(w2, 1.5, IDLE);
    expect(w2.kills).toBeGreaterThanOrEqual(1);
    expect(w2.score).toBeGreaterThanOrEqual(w2.kills * 2);
  });

  it('じごくステージは出現レートが1.6倍', () => {
    const count = (stage: 'grass' | 'hell') => {
      const w = new GameWorld(1, stage);
      Object.defineProperty(w, 'hurtPlayer', { value: () => {} });
      stepAuto(w, 20, IDLE);
      return w.kills + w.activeEnemyCount();
    };
    const g = count('grass');
    const h = count('hell');
    expect(h).toBeGreaterThan(g * 1.3);
  });

  it('デフォルトは草原（既存テストとの互換）', () => {
    const w = new GameWorld(1);
    expect(w.stage).toBe('grass');
  });
});

describe('プレイアブルキャラクター', () => {
  it('シャーマンは骨投げ開始・HP80%・移動112%', () => {
    const w = new GameWorld(1, 'grass', 'shaman');
    expect(w.weapons.has('bone')).toBe(true);
    expect(w.weapons.has('club')).toBe(false);
    expect(w.maxHp).toBeCloseTo(PLAYER.maxHp * 0.8);
    expect(w.hp).toBeCloseTo(w.maxHp); // 初期HPは補正後の最大値
    expect(w.moveSpeed).toBeCloseTo(PLAYER.speed * 1.12);
  });

  it('族長は仲間召喚開始で、子分が湧いて戦う', () => {
    const w = new GameWorld(1, 'grass', 'chief');
    expect(w.weapons.has('minion')).toBe(true);
    step(w, 0.5, IDLE);
    expect(w.minions.length).toBeGreaterThanOrEqual(1);
  });

  it('デフォルトは戦士（既存挙動と互換）', () => {
    const w = new GameWorld(1);
    expect(w.character).toBe('warrior');
    expect(w.weapons.has('club')).toBe(true);
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
