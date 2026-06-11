import * as C from './config';
import { SpatialGrid } from './grid';
import { mulberry32, range, weightedPick, type Rng } from './rng';
import { generateChoices, type UpgradeChoice } from './upgrades';

export interface InputState {
  dx: number; // -1..1
  dz: number;
}

export type GameEventType =
  | 'kill' | 'hit' | 'levelup' | 'gem' | 'meat' | 'hurt'
  | 'clubSwing' | 'stomp' | 'roar' | 'boneThrow' | 'pigCharge' | 'minionSummon'
  | 'bossSpawn' | 'bossTelegraph' | 'bossDash' | 'wave'
  | 'chest' | 'relic'
  | 'win' | 'lose';

export interface GameEvent {
  type: GameEventType;
  x?: number;
  z?: number;
  value?: number;
  kind?: string;
  text?: string;
}

export interface Enemy {
  active: boolean;
  kind: C.EnemyKind;
  x: number;
  z: number;
  hp: number;
  maxHp: number;
  kbx: number;
  kbz: number;
  stun: number;
  shootCd: number;
  facingX: number;
  facingZ: number;
  /** 被弾フラッシュ残時間（描画用） */
  flash: number;
}

export interface Projectile {
  active: boolean;
  kind: C.ProjectileKind;
  fromPlayer: boolean;
  x: number; z: number;
  vx: number; vz: number;
  dmg: number;
  pierce: number;
  life: number;
  hitIds: number[];
}

export interface Gem { active: boolean; x: number; z: number; value: number }
export interface Meat { active: boolean; x: number; z: number }
export interface Chest { active: boolean; x: number; z: number; tier: C.ChestTier }
export interface Pig {
  active: boolean; x: number; z: number; vx: number; vz: number;
  dmg: number; knockback: number; radius: number; life: number; hitIds: number[];
}
export interface Minion { x: number; z: number; attackCd: number; facingX: number; facingZ: number }

const PROJECTILE_CAP = 220;
const MEAT_CAP = 30;
const PIG_CAP = 12;

export class GameWorld {
  readonly rng: Rng;
  time = 0;
  state: 'playing' | 'won' | 'lost' = 'playing';
  events: GameEvent[] = [];

  // プレイヤー
  px = 0;
  pz = 0;
  facingX = 0;
  facingZ = 1;
  hp: number = C.PLAYER.maxHp;
  level = 1;
  exp = 0;
  kills = 0;
  score = 0;
  moving = false;
  private hurtCd = 0;

  weapons = new Map<C.WeaponKind, number>();
  passives = new Map<C.PassiveKind, number>();
  readonly relics = new Set<C.RelicId>();
  private weaponCds = new Map<C.WeaponKind, number>();

  pendingChoices: UpgradeChoice[] | null = null;
  private pendingLevelUps = 0;

  // エンティティプール
  readonly enemies: Enemy[] = [];
  readonly projectiles: Projectile[] = [];
  readonly gems: Gem[] = [];
  readonly meats: Meat[] = [];
  readonly chests: Chest[] = [];
  readonly pigs: Pig[] = [];
  readonly minions: Minion[] = [];

  // ボス
  bossIndex = -1;
  bossState: 'none' | 'chase' | 'telegraph' | 'dash' = 'none';
  private bossTimer = 0;
  private bossDashX = 0;
  private bossDashZ = 0;

  private spawnAcc = 0;
  private wavesDone = new Set<number>();
  private readonly grid = new SpatialGrid(1.5);
  private readonly queryOut: number[] = [];

  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    for (let i = 0; i < C.ENEMY_CAP; i++) {
      this.enemies.push({
        active: false, kind: 'trainee', x: 0, z: 0, hp: 0, maxHp: 0,
        kbx: 0, kbz: 0, stun: 0, shootCd: 0, facingX: 0, facingZ: 1, flash: 0,
      });
    }
    for (let i = 0; i < PROJECTILE_CAP; i++) {
      this.projectiles.push({
        active: false, kind: 'bone', fromPlayer: true, x: 0, z: 0, vx: 0, vz: 0,
        dmg: 0, pierce: 0, life: 0, hitIds: [],
      });
    }
    for (let i = 0; i < C.GEM_CAP; i++) this.gems.push({ active: false, x: 0, z: 0, value: 0 });
    for (let i = 0; i < MEAT_CAP; i++) this.meats.push({ active: false, x: 0, z: 0 });
    for (let i = 0; i < C.CHEST_CAP; i++) this.chests.push({ active: false, x: 0, z: 0, tier: 'wood' });
    for (let i = 0; i < PIG_CAP; i++) {
      this.pigs.push({ active: false, x: 0, z: 0, vx: 0, vz: 0, dmg: 0, knockback: 0, radius: 0.8, life: 0, hitIds: [] });
    }
    this.weapons.set('club', 1);
    this.weaponCds.set('club', 0.5);
  }

  // --- 派生ステータス ------------------------------------------------------
  get maxHp(): number {
    const relic = this.relics.has('belly') ? C.RELIC_EFFECTS.bellyMaxHpMul : 1;
    return C.PLAYER.maxHp * C.PASSIVE_STATS.bulk(this.passives.get('bulk') ?? 0) * relic;
  }
  get attackMul(): number {
    const relic = this.relics.has('kanabo') ? C.RELIC_EFFECTS.kanaboAttackMul : 1;
    return C.PASSIVE_STATS.muscle(this.passives.get('muscle') ?? 0) * relic;
  }
  get damageTakenMul(): number {
    const relic = this.relics.has('heart') ? C.RELIC_EFFECTS.heartDamageTakenMul : 1;
    return C.PASSIVE_STATS.skin(this.passives.get('skin') ?? 0) * relic;
  }
  get moveSpeed(): number {
    const relic = this.relics.has('hog') ? C.RELIC_EFFECTS.hogSpeedMul : 1;
    return C.PLAYER.speed * C.PASSIVE_STATS.trotters(this.passives.get('trotters') ?? 0) * relic;
  }
  private get cooldownMul(): number {
    return this.relics.has('hog') ? C.RELIC_EFFECTS.hogCooldownMul : 1;
  }
  private get hurtCooldown(): number {
    return C.PLAYER.hurtCooldown * (this.relics.has('heart') ? C.RELIC_EFFECTS.heartHurtCooldownMul : 1);
  }
  get magnetRadius(): number {
    return C.PLAYER.magnet * C.PASSIVE_STATS.nose(this.passives.get('nose') ?? 0);
  }
  private get meatDropChance(): number {
    const lv = this.passives.get('glutton') ?? 0;
    return lv > 0 ? C.PASSIVE_STATS.glutton(lv).dropChance : C.BASE_MEAT_DROP;
  }
  private get meatHeal(): number {
    const lv = this.passives.get('glutton') ?? 0;
    return lv > 0 ? C.PASSIVE_STATS.glutton(lv).heal : C.BASE_MEAT_HEAL;
  }

  get paused(): boolean {
    return this.pendingChoices !== null;
  }

  private emit(e: GameEvent): void {
    if (this.events.length < 256) this.events.push(e);
  }

  // --- メイン更新 ----------------------------------------------------------
  update(dt: number, input: InputState): void {
    if (this.state !== 'playing' || this.paused) return;
    this.time += dt;

    this.updateSpawns(dt);
    this.updatePlayer(dt, input);
    this.rebuildGrid();
    this.updateWeapons(dt);
    this.updateMinions(dt);
    this.updatePigs(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updatePickups(dt);
    this.checkLevelUp();

    if (this.hp <= 0 && this.state === 'playing') {
      this.state = 'lost';
      this.emit({ type: 'lose' });
    }
  }

  // --- スポーン ------------------------------------------------------------
  private updateSpawns(dt: number): void {
    if (this.time >= C.GAME_DURATION) {
      if (this.bossState === 'none') this.spawnBoss();
      return;
    }
    const phase = C.phaseAt(this.time);
    this.spawnAcc += phase.rate * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const kind = weightedPick(this.rng, phase.weights);
      this.spawnEnemy(kind, this.spawnPos());
    }
    for (let i = 0; i < C.SPAWN_WAVES.length; i++) {
      const wave = C.SPAWN_WAVES[i];
      if (this.time >= wave.at && !this.wavesDone.has(i)) {
        this.wavesDone.add(i);
        this.emit({ type: 'wave' });
        let total = 0;
        for (const n of Object.values(wave.spawns)) total += n;
        let placed = 0;
        for (const [kind, count] of Object.entries(wave.spawns) as Array<[C.EnemyKind, number]>) {
          for (let k = 0; k < count; k++) {
            const pos = wave.ring
              ? this.ringPos((placed / total) * Math.PI * 2, 14)
              : this.spawnPos();
            this.spawnEnemy(kind, pos);
            placed++;
          }
        }
      }
    }
  }

  private spawnPos(): { x: number; z: number } {
    return this.ringPos(this.rng() * Math.PI * 2, range(this.rng, 16, 20));
  }

  private ringPos(angle: number, dist: number): { x: number; z: number } {
    const x = this.px + Math.cos(angle) * dist;
    const z = this.pz + Math.sin(angle) * dist;
    const d = Math.hypot(x, z);
    const limit = C.ARENA_RADIUS * 1.15;
    if (d > limit) {
      return { x: (x / d) * limit, z: (z / d) * limit };
    }
    return { x, z };
  }

  spawnEnemy(kind: C.EnemyKind, pos: { x: number; z: number }): Enemy | null {
    const def = C.ENEMY_DEFS[kind];
    for (const e of this.enemies) {
      if (e.active) continue;
      e.active = true;
      e.kind = kind;
      e.x = pos.x;
      e.z = pos.z;
      const scale = kind === 'hero' ? 1 : C.enemyHpScale(this.time);
      e.maxHp = def.hp * scale;
      e.hp = e.maxHp;
      e.kbx = 0;
      e.kbz = 0;
      e.stun = 0;
      e.flash = 0;
      e.shootCd = def.ranged ? range(this.rng, 0.5, def.ranged.cooldown) : 0;
      return e;
    }
    return null; // 上限到達時はスポーンを諦める
  }

  private spawnBoss(): void {
    const e = this.spawnEnemy('hero', this.ringPos(this.rng() * Math.PI * 2, 16));
    if (!e) {
      // プールが満杯なら最古の雑魚を退場させて確保する
      const victim = this.enemies.find((en) => en.active && en.kind !== 'hero');
      if (victim) victim.active = false;
      this.spawnBoss();
      return;
    }
    this.bossIndex = this.enemies.indexOf(e);
    this.bossState = 'chase';
    this.bossTimer = 3.5;
    this.emit({ type: 'bossSpawn', x: e.x, z: e.z });
  }

  // --- プレイヤー ----------------------------------------------------------
  private updatePlayer(dt: number, input: InputState): void {
    const len = Math.hypot(input.dx, input.dz);
    this.moving = len > 0.01;
    if (this.moving) {
      const nx = input.dx / Math.max(1, len);
      const nz = input.dz / Math.max(1, len);
      this.px += nx * this.moveSpeed * dt;
      this.pz += nz * this.moveSpeed * dt;
      this.facingX = nx;
      this.facingZ = nz;
      const d = Math.hypot(this.px, this.pz);
      if (d > C.ARENA_RADIUS) {
        this.px = (this.px / d) * C.ARENA_RADIUS;
        this.pz = (this.pz / d) * C.ARENA_RADIUS;
      }
    } else {
      // 立ち止まっているときは最寄りの敵に向き直る（棍棒の狙い）
      const i = this.nearestEnemy(this.px, this.pz, 10);
      if (i >= 0) {
        const e = this.enemies[i];
        const d = Math.hypot(e.x - this.px, e.z - this.pz) || 1;
        this.facingX = (e.x - this.px) / d;
        this.facingZ = (e.z - this.pz) / d;
      }
    }
    if (this.hurtCd > 0) this.hurtCd -= dt;
    // 不滅の鉄腹: 自動回復
    if (this.relics.has('belly') && this.hp > 0) {
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * C.RELIC_EFFECTS.bellyRegenRatioPerSec * dt);
    }
  }

  private nearestEnemy(x: number, z: number, maxDist: number): number {
    let best = -1;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      const dx = e.x - x;
      const dz = e.z - z;
      const d = dx * dx + dz * dz;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  // --- 武器 ----------------------------------------------------------------
  private updateWeapons(dt: number): void {
    for (const [kind, lv] of this.weapons) {
      const cd = (this.weaponCds.get(kind) ?? 0) - dt;
      if (cd > 0) {
        this.weaponCds.set(kind, cd);
        continue;
      }
      switch (kind) {
        case 'club': this.fireClub(lv); break;
        case 'bone': this.fireBone(lv); break;
        case 'stomp': this.fireStomp(lv); break;
        case 'roar': this.fireRoar(lv); break;
        case 'pig': this.firePig(lv); break;
        case 'minion': break; // 召喚はupdateMinionsで管理
      }
      const stats = C.WEAPON_STATS[kind](lv) as { cooldown?: number };
      this.weaponCds.set(kind, (stats.cooldown ?? 1) * this.cooldownMul);
    }
  }

  private damageEnemy(e: Enemy, dmg: number, kbx: number, kbz: number, kb: number, stun = 0): void {
    if (!e.active) return; // 同一フレーム内の多重撃破を防ぐ
    const def = C.ENEMY_DEFS[e.kind];
    const amount = dmg * this.attackMul;
    e.hp -= amount;
    e.flash = 0.15;
    const resist = 1 - def.kbResist;
    e.kbx += kbx * kb * resist;
    e.kbz += kbz * kb * resist;
    if (stun > 0 && def.kbResist < 1) e.stun = Math.max(e.stun, stun);
    this.emit({ type: 'hit', x: e.x, z: e.z, value: Math.round(amount) });
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    const def = C.ENEMY_DEFS[e.kind];
    e.active = false;
    this.kills++;
    this.score += def.score;
    this.emit({ type: 'kill', x: e.x, z: e.z, kind: e.kind });
    if (def.xp > 0) this.dropGem(e.x, e.z, def.xp);
    if (this.rng() < this.meatDropChance) {
      const m = this.meats.find((m) => !m.active);
      if (m) {
        m.active = true;
        m.x = e.x;
        m.z = e.z;
      }
    }
    this.rollChestDrop(e);
    if (e.kind === 'hero') {
      this.state = 'won';
      this.emit({ type: 'win' });
    }
  }

  /** 宝箱ドロップ判定: 全敵共通1%の虹（未所持レリックがある場合）→ 敵種別の通常宝箱 */
  private rollChestDrop(e: Enemy): void {
    const hasUnownedRelic = this.relics.size < Object.keys(C.RELICS).length;
    if (e.kind !== 'hero' && hasUnownedRelic && this.rng() < C.LEGENDARY_CHANCE) {
      this.spawnChest(e.x, e.z, 'rainbow');
      return;
    }
    const drop = C.CHEST_DROPS[e.kind];
    if (drop.chance > 0 && this.rng() < drop.chance) {
      this.spawnChest(e.x, e.z, weightedPick(this.rng, drop.tiers));
    }
  }

  private spawnChest(x: number, z: number, tier: C.ChestTier): void {
    const c = this.chests.find((c) => !c.active);
    if (!c) return; // 上限超過は諦める（取り切れていない合図）
    c.active = true;
    c.x = x;
    c.z = z;
    c.tier = tier;
  }

  /** 宝箱の開封。報酬のテキストはイベントでUIへ渡す */
  private openChest(tier: C.ChestTier, x: number, z: number): void {
    switch (tier) {
      case 'wood': {
        const xp = C.chestXp(this.time);
        this.exp += xp;
        this.hp = Math.min(this.maxHp, this.hp + C.CHEST_REWARDS.wood.heal);
        this.emit({ type: 'chest', kind: tier, x, z, text: `木の宝箱: HP回復 + EXP${xp}` });
        break;
      }
      case 'silver': {
        const name = this.upgradeRandomSkill();
        this.emit({
          type: 'chest', kind: tier, x, z,
          text: name ? `銀の宝箱: ${name} 強化！` : `銀の宝箱: EXP${C.CHEST_REWARDS.silver.xpFallback}`,
        });
        if (!name) this.exp += C.CHEST_REWARDS.silver.xpFallback;
        break;
      }
      case 'gold': {
        const names: string[] = [];
        for (let i = 0; i < C.CHEST_REWARDS.gold.upgrades; i++) {
          const name = this.upgradeRandomSkill();
          if (name) names.push(name);
        }
        if (names.length === 0) this.exp += C.CHEST_REWARDS.gold.xpFallback;
        this.hp = Math.min(this.maxHp, this.hp + this.maxHp * C.CHEST_REWARDS.gold.healRatio);
        // 同じスキルが複数回強化された場合は「◯◯ 2段階強化」とまとめる
        const counts = new Map<string, number>();
        for (const n of names) counts.set(n, (counts.get(n) ?? 0) + 1);
        const summary = [...counts.entries()]
          .map(([n, c]) => (c > 1 ? `${n} ${c}段階強化` : `${n} 強化`))
          .join('・');
        this.emit({
          type: 'chest', kind: tier, x, z,
          text: names.length > 0 ? `金の宝箱: ${summary}！` : `金の宝箱: 大回復 + EXP${C.CHEST_REWARDS.gold.xpFallback}`,
        });
        break;
      }
      case 'rainbow': {
        const unowned = (Object.keys(C.RELICS) as C.RelicId[]).filter((r) => !this.relics.has(r));
        if (unowned.length === 0) {
          this.exp += C.CHEST_REWARDS.gold.xpFallback;
          this.emit({ type: 'chest', kind: 'gold', x, z, text: `輝く宝箱: EXP${C.CHEST_REWARDS.gold.xpFallback}` });
          return;
        }
        const id = unowned[Math.floor(this.rng() * unowned.length)];
        this.relics.add(id);
        if (id === 'belly') this.hp = Math.min(this.maxHp, this.hp * 2); // 最大HP倍増分を反映
        const info = C.RELICS[id];
        this.emit({ type: 'relic', kind: id, x, z, text: `${info.icon} ${info.name}！ ${info.desc}` });
        break;
      }
    }
  }

  /** 所持スキルからランダムに1つLvを上げる。対象がなければnull */
  private upgradeRandomSkill(): string | null {
    const candidates: Array<{ kind: 'weapon' | 'passive'; id: C.WeaponKind | C.PassiveKind }> = [];
    for (const [id, lv] of this.weapons) {
      if (lv < C.MAX_SKILL_LEVEL) candidates.push({ kind: 'weapon', id });
    }
    for (const [id, lv] of this.passives) {
      if (lv < C.MAX_SKILL_LEVEL) candidates.push({ kind: 'passive', id });
    }
    if (candidates.length === 0) return null;
    const pick = candidates[Math.floor(this.rng() * candidates.length)];
    if (pick.kind === 'weapon') {
      const id = pick.id as C.WeaponKind;
      this.weapons.set(id, (this.weapons.get(id) ?? 0) + 1);
      return C.WEAPON_INFO[id].name;
    }
    const id = pick.id as C.PassiveKind;
    const prevMaxHp = this.maxHp;
    this.passives.set(id, (this.passives.get(id) ?? 0) + 1);
    if (id === 'bulk') this.hp += this.maxHp - prevMaxHp;
    return C.PASSIVE_INFO[id].name;
  }

  private dropGem(x: number, z: number, value: number): void {
    const g = this.gems.find((g) => !g.active);
    if (g) {
      g.active = true;
      g.x = x;
      g.z = z;
      g.value = value;
    } else {
      // プール満杯: ランダムな既存ジェムに合算（取り逃しを防ぐ）
      const target = this.gems[Math.floor(this.rng() * this.gems.length)];
      target.value += value;
    }
  }

  /** 扇状攻撃の照準方向: 射程内の最寄りの敵（いなければ向いている方向） */
  private aimDir(searchRange: number): { x: number; z: number } {
    const i = this.nearestEnemy(this.px, this.pz, searchRange);
    if (i < 0) return { x: this.facingX, z: this.facingZ };
    const e = this.enemies[i];
    const d = Math.hypot(e.x - this.px, e.z - this.pz) || 1;
    return { x: (e.x - this.px) / d, z: (e.z - this.pz) / d };
  }

  private fireClub(lv: number): void {
    const s = C.WEAPON_STATS.club(lv);
    this.emit({ type: 'clubSwing' });
    const aim = this.aimDir(s.range * 1.5);
    const n = this.grid.queryCircle(this.px, this.pz, s.range, this.queryOut);
    const cosHalf = Math.cos(s.arc / 2);
    for (let k = 0; k < n; k++) {
      const e = this.enemies[this.queryOut[k]];
      const dx = e.x - this.px;
      const dz = e.z - this.pz;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx / d) * aim.x + (dz / d) * aim.z;
      if (dot >= cosHalf) {
        this.damageEnemy(e, s.dmg, dx / d, dz / d, s.knockback);
      }
    }
  }

  private fireBone(lv: number): void {
    const s = C.WEAPON_STATS.bone(lv);
    const n = this.grid.queryCircle(this.px, this.pz, 15, this.queryOut);
    if (n === 0) {
      this.weaponCds.set('bone', 0.25); // 標的なし: 少し待って再試行
      return;
    }
    const sorted = this.queryOut
      .slice(0, n)
      .sort((a, b) => {
        const ea = this.enemies[a];
        const eb = this.enemies[b];
        const da = (ea.x - this.px) ** 2 + (ea.z - this.pz) ** 2;
        const db = (eb.x - this.px) ** 2 + (eb.z - this.pz) ** 2;
        return da - db;
      })
      .slice(0, s.count);
    for (const idx of sorted) {
      const e = this.enemies[idx];
      const dx = e.x - this.px;
      const dz = e.z - this.pz;
      const d = Math.hypot(dx, dz) || 1;
      this.spawnProjectile('bone', true, this.px, this.pz, (dx / d) * s.speed, (dz / d) * s.speed, s.dmg, s.pierce);
    }
    this.emit({ type: 'boneThrow' });
  }

  private fireStomp(lv: number): void {
    const s = C.WEAPON_STATS.stomp(lv);
    this.emit({ type: 'stomp', x: this.px, z: this.pz, value: s.radius });
    const n = this.grid.queryCircle(this.px, this.pz, s.radius, this.queryOut);
    for (let k = 0; k < n; k++) {
      const e = this.enemies[this.queryOut[k]];
      const dx = e.x - this.px;
      const dz = e.z - this.pz;
      const d = Math.hypot(dx, dz) || 1;
      this.damageEnemy(e, s.dmg, dx / d, dz / d, s.knockback);
    }
  }

  private fireRoar(lv: number): void {
    const s = C.WEAPON_STATS.roar(lv);
    this.emit({ type: 'roar', x: this.px, z: this.pz, value: s.range });
    const aim = this.aimDir(s.range * 1.3);
    const n = this.grid.queryCircle(this.px, this.pz, s.range, this.queryOut);
    const cosHalf = Math.cos(s.arc / 2);
    for (let k = 0; k < n; k++) {
      const e = this.enemies[this.queryOut[k]];
      const dx = e.x - this.px;
      const dz = e.z - this.pz;
      const d = Math.hypot(dx, dz) || 1;
      const dot = (dx / d) * aim.x + (dz / d) * aim.z;
      if (dot >= cosHalf) {
        this.damageEnemy(e, s.dmg, dx / d, dz / d, s.knockback, s.stun);
      }
    }
  }

  private firePig(lv: number): void {
    const s = C.WEAPON_STATS.pig(lv);
    let launched = 0;
    for (const p of this.pigs) {
      if (p.active || launched >= s.count) continue;
      const angle = this.rng() * Math.PI * 2;
      // プレイヤー付近を通過する軌道で横切る
      const offX = Math.cos(angle + Math.PI / 2) * range(this.rng, -3, 3);
      const offZ = Math.sin(angle + Math.PI / 2) * range(this.rng, -3, 3);
      p.active = true;
      p.x = this.px - Math.cos(angle) * 14 + offX;
      p.z = this.pz - Math.sin(angle) * 14 + offZ;
      p.vx = Math.cos(angle) * s.speed;
      p.vz = Math.sin(angle) * s.speed;
      p.dmg = s.dmg;
      p.knockback = s.knockback;
      p.radius = s.radius;
      p.life = 30 / s.speed;
      p.hitIds.length = 0;
      launched++;
    }
    if (launched > 0) this.emit({ type: 'pigCharge' });
  }

  private spawnProjectile(
    kind: C.ProjectileKind, fromPlayer: boolean,
    x: number, z: number, vx: number, vz: number, dmg: number, pierce: number,
  ): void {
    const p = this.projectiles.find((p) => !p.active);
    if (!p) return;
    p.active = true;
    p.kind = kind;
    p.fromPlayer = fromPlayer;
    p.x = x;
    p.z = z;
    p.vx = vx;
    p.vz = vz;
    p.dmg = dmg;
    p.pierce = pierce;
    p.life = 2.5;
    p.hitIds.length = 0;
  }

  // --- 子分オーク ----------------------------------------------------------
  private updateMinions(dt: number): void {
    const lv = this.weapons.get('minion');
    if (lv === undefined) return;
    const s = C.WEAPON_STATS.minion(lv);
    while (this.minions.length < s.max) {
      const angle = (this.minions.length / 3) * Math.PI * 2 + Math.PI;
      this.minions.push({
        x: this.px + Math.cos(angle) * 1.5,
        z: this.pz + Math.sin(angle) * 1.5,
        attackCd: 0,
        facingX: 0,
        facingZ: 1,
      });
      this.emit({ type: 'minionSummon' });
    }
    this.minions.forEach((m, idx) => {
      m.attackCd -= dt;
      const target = this.nearestEnemy(m.x, m.z, 14);
      let tx: number;
      let tz: number;
      if (target >= 0) {
        tx = this.enemies[target].x;
        tz = this.enemies[target].z;
      } else {
        const angle = (idx / 3) * Math.PI * 2 + Math.PI * 0.75;
        tx = this.px + Math.cos(angle) * 1.8;
        tz = this.pz + Math.sin(angle) * 1.8;
      }
      const dx = tx - m.x;
      const dz = tz - m.z;
      const d = Math.hypot(dx, dz) || 1;
      if (d > s.range * 0.8) {
        m.x += (dx / d) * s.speed * dt;
        m.z += (dz / d) * s.speed * dt;
      }
      m.facingX = dx / d;
      m.facingZ = dz / d;
      if (target >= 0 && d <= s.range && m.attackCd <= 0) {
        m.attackCd = s.attackCooldown;
        this.damageEnemy(this.enemies[target], s.dmg, dx / d, dz / d, 2);
      }
    });
  }

  // --- ブタ ----------------------------------------------------------------
  private updatePigs(dt: number): void {
    for (const p of this.pigs) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      const n = this.grid.queryCircle(p.x, p.z, p.radius, this.queryOut);
      for (let k = 0; k < n; k++) {
        const idx = this.queryOut[k];
        if (p.hitIds.includes(idx)) continue;
        p.hitIds.push(idx);
        const e = this.enemies[idx];
        const d = Math.hypot(p.vx, p.vz) || 1;
        this.damageEnemy(e, p.dmg, p.vx / d, p.vz / d, p.knockback);
      }
    }
  }

  // --- 敵 ------------------------------------------------------------------
  private rebuildGrid(): void {
    this.grid.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.active) this.grid.insert(i, e.x, e.z);
    }
  }

  private updateEnemies(dt: number): void {
    // パラディンのオーラ（数が少ないので毎フレーム列挙してよい）
    const paladins: Enemy[] = [];
    for (const e of this.enemies) {
      if (e.active && e.kind === 'paladin') paladins.push(e);
    }

    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (!e.active) continue;
      const def = C.ENEMY_DEFS[e.kind];
      if (e.flash > 0) e.flash -= dt;

      // ノックバック減衰
      e.x += e.kbx * dt;
      e.z += e.kbz * dt;
      const decay = Math.max(0, 1 - 6 * dt);
      e.kbx *= decay;
      e.kbz *= decay;

      if (e.stun > 0) {
        e.stun -= dt;
        continue;
      }

      if (e.kind === 'hero') {
        this.updateBoss(e, dt);
      } else {
        let speed = def.speed;
        if (e.kind !== 'paladin') {
          for (const p of paladins) {
            const dx = e.x - p.x;
            const dz = e.z - p.z;
            const r = p === e ? 0 : (C.ENEMY_DEFS.paladin.auraRadius ?? 0);
            if (dx * dx + dz * dz < r * r) {
              speed *= C.ENEMY_DEFS.paladin.auraSpeedMul ?? 1;
              break;
            }
          }
        }
        const dx = this.px - e.x;
        const dz = this.pz - e.z;
        const d = Math.hypot(dx, dz) || 1;
        e.facingX = dx / d;
        e.facingZ = dz / d;

        if (def.ranged) {
          e.shootCd -= dt;
          if (d > def.ranged.range * 0.9) {
            e.x += (dx / d) * speed * dt;
            e.z += (dz / d) * speed * dt;
          } else if (d < def.ranged.range * 0.3) {
            // 完全な安全圏を作らせない: 近接の間合い近くまでは粘る
            e.x -= (dx / d) * speed * 0.8 * dt;
            e.z -= (dz / d) * speed * 0.8 * dt;
          }
          if (e.shootCd <= 0 && d <= def.ranged.range) {
            e.shootCd = def.ranged.cooldown;
            this.spawnProjectile(
              def.ranged.projKind, false, e.x, e.z,
              (dx / d) * def.ranged.projSpeed, (dz / d) * def.ranged.projSpeed,
              def.ranged.dmg, 0,
            );
          }
        } else {
          e.x += (dx / d) * speed * dt;
          e.z += (dz / d) * speed * dt;
        }

        // 接触ダメージ
        if (d < def.radius + C.PLAYER.radius && this.hurtCd <= 0) {
          this.hurtPlayer(def.dmg);
        }
      }

      // 近接の重なり解消（軽い分離）
      const n = this.grid.queryCircle(e.x, e.z, 0.7, this.queryOut);
      for (let k = 0; k < n; k++) {
        const j = this.queryOut[k];
        if (j === i) continue;
        const o = this.enemies[j];
        const sx = e.x - o.x;
        const sz = e.z - o.z;
        const sd = Math.hypot(sx, sz);
        if (sd > 0.001 && sd < 0.7) {
          const push = ((0.7 - sd) / sd) * 0.5 * dt * 10;
          e.x += sx * push;
          e.z += sz * push;
        }
      }
    }
  }

  private hurtPlayer(dmg: number): void {
    this.hp -= dmg * this.damageTakenMul;
    this.hurtCd = this.hurtCooldown;
    this.emit({ type: 'hurt', value: Math.round(dmg * this.damageTakenMul) });
  }

  private updateBoss(e: Enemy, dt: number): void {
    const def = C.ENEMY_DEFS.hero;
    const dx = this.px - e.x;
    const dz = this.pz - e.z;
    const d = Math.hypot(dx, dz) || 1;
    this.bossTimer -= dt;

    switch (this.bossState) {
      case 'chase':
        e.facingX = dx / d;
        e.facingZ = dz / d;
        e.x += (dx / d) * def.speed * dt;
        e.z += (dz / d) * def.speed * dt;
        if (d < def.radius + C.PLAYER.radius && this.hurtCd <= 0) this.hurtPlayer(def.dmg);
        if (this.bossTimer <= 0) {
          this.bossState = 'telegraph';
          this.bossTimer = 1.0;
          this.emit({ type: 'bossTelegraph', x: e.x, z: e.z });
        }
        break;
      case 'telegraph':
        e.facingX = dx / d;
        e.facingZ = dz / d;
        if (this.bossTimer <= 0) {
          this.bossState = 'dash';
          this.bossTimer = 0.7;
          this.bossDashX = dx / d;
          this.bossDashZ = dz / d;
          this.emit({ type: 'bossDash', x: e.x, z: e.z });
        }
        break;
      case 'dash':
        e.x += this.bossDashX * 14 * dt;
        e.z += this.bossDashZ * 14 * dt;
        if (d < def.radius + C.PLAYER.radius + 0.3 && this.hurtCd <= 0) this.hurtPlayer(def.dmg * 2);
        if (this.bossTimer <= 0) {
          this.bossState = 'chase';
          this.bossTimer = 3.5;
        }
        break;
      default:
        break;
    }
  }

  // --- 弾 ------------------------------------------------------------------
  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      if (p.fromPlayer) {
        const n = this.grid.queryCircle(p.x, p.z, 0.5, this.queryOut);
        for (let k = 0; k < n; k++) {
          const idx = this.queryOut[k];
          if (p.hitIds.includes(idx)) continue;
          const e = this.enemies[idx];
          if (!e.active) continue;
          p.hitIds.push(idx);
          const d = Math.hypot(p.vx, p.vz) || 1;
          this.damageEnemy(e, p.dmg, p.vx / d, p.vz / d, 2);
          p.pierce--;
          if (p.pierce < 0) {
            p.active = false;
            break;
          }
        }
      } else {
        const dx = this.px - p.x;
        const dz = this.pz - p.z;
        if (dx * dx + dz * dz < (C.PLAYER.radius + 0.25) ** 2) {
          p.active = false;
          if (this.hurtCd <= 0) this.hurtPlayer(p.dmg);
        }
      }
    }
  }

  // --- 回収物 --------------------------------------------------------------
  private updatePickups(dt: number): void {
    const magnetR = this.magnetRadius;
    for (const g of this.gems) {
      if (!g.active) continue;
      const dx = this.px - g.x;
      const dz = this.pz - g.z;
      const d = Math.hypot(dx, dz);
      if (d < magnetR) {
        const pull = 9 * dt;
        g.x += (dx / (d || 1)) * pull;
        g.z += (dz / (d || 1)) * pull;
      }
      if (d < 0.7) {
        g.active = false;
        this.exp += g.value;
        this.emit({ type: 'gem', value: g.value });
      }
    }
    for (const m of this.meats) {
      if (!m.active) continue;
      const dx = this.px - m.x;
      const dz = this.pz - m.z;
      if (dx * dx + dz * dz < 0.8 * 0.8) {
        m.active = false;
        this.hp = Math.min(this.maxHp, this.hp + this.meatHeal);
        this.emit({ type: 'meat', value: this.meatHeal });
      }
    }
    for (const c of this.chests) {
      if (!c.active) continue;
      const dx = this.px - c.x;
      const dz = this.pz - c.z;
      if (dx * dx + dz * dz < 0.95 * 0.95) {
        c.active = false;
        this.openChest(c.tier, c.x, c.z);
      }
    }
  }

  // --- レベルアップ ----------------------------------------------------------
  private checkLevelUp(): void {
    while (this.exp >= C.expForLevel(this.level)) {
      this.exp -= C.expForLevel(this.level);
      this.level++;
      this.pendingLevelUps++;
      this.emit({ type: 'levelup', value: this.level });
    }
    if (this.pendingLevelUps > 0 && this.pendingChoices === null) {
      this.pendingChoices = generateChoices(this.rng, this.weapons, this.passives);
    }
  }

  chooseUpgrade(index: number): void {
    if (!this.pendingChoices) return;
    const choice = this.pendingChoices[index];
    if (!choice) return;
    if (choice.kind === 'weapon') {
      this.weapons.set(choice.id, choice.nextLevel);
      if (!this.weaponCds.has(choice.id)) this.weaponCds.set(choice.id, 0.3);
    } else if (choice.kind === 'passive') {
      const prevMaxHp = this.maxHp;
      this.passives.set(choice.id, choice.nextLevel);
      if (choice.id === 'bulk') {
        this.hp += this.maxHp - prevMaxHp; // 増えた分は即回復
      }
    } else {
      this.hp = Math.min(this.maxHp, this.hp + 30);
    }
    this.pendingLevelUps--;
    this.pendingChoices = this.pendingLevelUps > 0
      ? generateChoices(this.rng, this.weapons, this.passives)
      : null;
  }

  /** テスト・デバッグ用: 任意の宝箱を任意の位置に出す */
  spawnChestForTest(tier: C.ChestTier, x: number, z: number): void {
    this.spawnChest(x, z, tier);
  }

  /** 負荷試験・デバッグ用 */
  debugSpawn(kind: C.EnemyKind, count: number): void {
    for (let i = 0; i < count; i++) {
      this.spawnEnemy(kind, this.spawnPos());
    }
  }

  activeEnemyCount(): number {
    let n = 0;
    for (const e of this.enemies) if (e.active) n++;
    return n;
  }
}
