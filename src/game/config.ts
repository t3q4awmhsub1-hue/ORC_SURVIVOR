/** ゲームバランス定義。すべての数値調整はこのファイルに集約する */

export type EnemyKind =
  | 'trainee' | 'adventurer' | 'archer' | 'mage' | 'knight' | 'paladin' | 'hero';
export type WeaponKind = 'club' | 'bone' | 'stomp' | 'roar' | 'pig' | 'minion';
export type PassiveKind = 'muscle' | 'skin' | 'trotters' | 'glutton' | 'bulk' | 'nose';
export type ProjectileKind = 'bone' | 'arrow' | 'bolt';

export const GAME_DURATION = 300;     // 5分（秒）
export const ARENA_RADIUS = 55;       // 移動可能範囲
export const ENEMY_CAP = 300;         // 同時存在上限
export const GEM_CAP = 400;
export const MAX_WEAPON_SLOTS = 4;
export const MAX_PASSIVE_SLOTS = 4;
export const MAX_SKILL_LEVEL = 5;

export const PLAYER = {
  maxHp: 120,
  speed: 5.0,
  radius: 0.55,
  magnet: 2.6,
  /** 接触ダメージを受けた直後の無敵時間（連続ヒットの緩和） */
  hurtCooldown: 0.45,
} as const;

export interface RangedDef {
  range: number;
  cooldown: number;
  projSpeed: number;
  dmg: number;
  projKind: ProjectileKind;
}

export interface EnemyDef {
  hp: number;
  speed: number;
  /** 接触時のヒットダメージ（hurtCooldownごとに1回） */
  dmg: number;
  score: number;
  xp: number;
  radius: number;
  /** ノックバック耐性 0..1（1で完全耐性） */
  kbResist: number;
  ranged?: RangedDef;
  /** パラディン: 周囲の味方の移動速度倍率 */
  auraSpeedMul?: number;
  auraRadius?: number;
}

export const ENEMY_DEFS: Record<EnemyKind, EnemyDef> = {
  trainee:    { hp: 10,  speed: 1.7, dmg: 5,  score: 1,   xp: 1,  radius: 0.35, kbResist: 0 },
  adventurer: { hp: 22,  speed: 2.2, dmg: 8,  score: 2,   xp: 2,  radius: 0.35, kbResist: 0 },
  archer:     { hp: 20,  speed: 2.2, dmg: 5,  score: 5,   xp: 4,  radius: 0.35, kbResist: 0,
                ranged: { range: 8, cooldown: 3.0, projSpeed: 7.5, dmg: 5, projKind: 'arrow' } },
  mage:       { hp: 30,  speed: 1.6, dmg: 5,  score: 8,   xp: 6,  radius: 0.35, kbResist: 0,
                ranged: { range: 10, cooldown: 4.2, projSpeed: 5.5, dmg: 11, projKind: 'bolt' } },
  knight:     { hp: 90,  speed: 1.4, dmg: 12, score: 10,  xp: 8,  radius: 0.45, kbResist: 0.8 },
  paladin:    { hp: 320, speed: 1.9, dmg: 18, score: 20,  xp: 25, radius: 0.55, kbResist: 0.9,
                auraSpeedMul: 1.45, auraRadius: 6 },
  hero:       { hp: 1800, speed: 3.1, dmg: 22, score: 500, xp: 0, radius: 0.65, kbResist: 1 },
};

/** 経過時間による敵HPスケール（5分で2.5倍） */
export function enemyHpScale(timeSec: number): number {
  return 1 + (timeSec / 60) * 0.3;
}

export function expForLevel(level: number): number {
  return 3 + level * 6;
}

// ---------------------------------------------------------------------------
// 武器（Lvは1始まり、MAX_SKILL_LEVELまで）
// ---------------------------------------------------------------------------
export const WEAPON_STATS = {
  club: (lv: number) => ({
    cooldown: 1.1 - lv * 0.08,
    dmg: 12 + lv * 6,
    range: 2.1 + lv * 0.18,
    /** 振りの全角（rad） */
    arc: 2.4 + lv * 0.18,
    knockback: 4,
  }),
  bone: (lv: number) => ({
    cooldown: 1.5 - lv * 0.13,
    dmg: 10 + lv * 5,
    count: 1 + Math.floor((lv - 1) / 2),
    pierce: 1 + lv,
    speed: 13,
  }),
  stomp: (lv: number) => ({
    cooldown: 3.4 - lv * 0.22,
    dmg: 8 + lv * 6,
    radius: 2.6 + lv * 0.5,
    knockback: 9,
  }),
  roar: (lv: number) => ({
    cooldown: 5.2 - lv * 0.38,
    dmg: 6 + lv * 4,
    range: 4.5 + lv * 0.55,
    arc: (100 + lv * 12) * (Math.PI / 180),
    stun: 1.0 + lv * 0.3,
    knockback: 6,
  }),
  pig: (lv: number) => ({
    cooldown: 6.5 - lv * 0.55,
    count: 1 + Math.floor(lv / 2),
    dmg: 25 + lv * 10,
    speed: 10,
    radius: 0.85,
    knockback: 7,
  }),
  minion: (lv: number) => ({
    max: lv <= 2 ? 1 : lv <= 4 ? 2 : 3,
    dmg: 8 + lv * 4,
    attackCooldown: 0.9,
    speed: 4.2,
    range: 0.9,
  }),
} as const;

export const PASSIVE_STATS = {
  muscle:   (lv: number) => 1 + lv * 0.10,  // 攻撃力倍率
  skin:     (lv: number) => 1 - lv * 0.08,  // 被ダメ倍率
  trotters: (lv: number) => 1 + lv * 0.08,  // 移動速度倍率
  glutton:  (lv: number) => ({ dropChance: 0.02 + lv * 0.012, heal: 20 * (1 + lv * 0.2) }),
  bulk:     (lv: number) => 1 + lv * 0.20,  // 最大HP倍率
  nose:     (lv: number) => 1 + lv * 0.30,  // 吸引半径倍率
} as const;

export const BASE_MEAT_DROP = 0.02;
export const BASE_MEAT_HEAL = 25;

// ---------------------------------------------------------------------------
// スキルのメタ情報（UI表示用）
// ---------------------------------------------------------------------------
export interface SkillInfo {
  name: string;
  desc: string;
  icon: string; // 絵文字
}

export const WEAPON_INFO: Record<WeaponKind, SkillInfo> = {
  club:   { name: 'オークの棍棒', desc: '前方を薙ぎ払う。範囲と威力が伸びる', icon: '🏏' },
  bone:   { name: '骨投げ',       desc: '最寄りの敵へ骨を投げる。貫通あり', icon: '🦴' },
  stomp:  { name: '地団駄',       desc: '自分の周囲に衝撃波。敵を弾き飛ばす', icon: '💥' },
  roar:   { name: '雄叫び',       desc: '前方の敵を怯ませてダメージ', icon: '🗯️' },
  pig:    { name: 'ブタ突進',     desc: '野生のブタが敵を轢いて駆け抜ける', icon: '🐗' },
  minion: { name: '仲間オーク召喚', desc: '自動で戦う子分オークを呼ぶ', icon: '🪓' },
};

export const PASSIVE_INFO: Record<PassiveKind, SkillInfo> = {
  muscle:   { name: '筋肉',       desc: '全攻撃力 +10%', icon: '💪' },
  skin:     { name: '分厚い皮膚', desc: '被ダメージ -8%', icon: '🛡️' },
  trotters: { name: '豚足',       desc: '移動速度 +8%', icon: '👣' },
  glutton:  { name: '大食い',     desc: '肉のドロップ率と回復量アップ', icon: '🍖' },
  bulk:     { name: 'でかい図体', desc: '最大HP +20%', icon: '🏋️' },
  nose:     { name: '鼻が利く',   desc: 'ジェムの吸引半径 +30%', icon: '👃' },
};

// ---------------------------------------------------------------------------
// スポーンタイムライン
// ---------------------------------------------------------------------------
export interface SpawnPhase {
  from: number;                              // 開始秒
  rate: number;                              // 体/秒
  weights: Partial<Record<EnemyKind, number>>;
}

export const SPAWN_PHASES: SpawnPhase[] = [
  { from: 0,   rate: 1.0, weights: { trainee: 1 } },
  { from: 30,  rate: 1.4, weights: { trainee: 0.7, adventurer: 0.3 } },
  { from: 60,  rate: 1.8, weights: { trainee: 0.55, adventurer: 0.3, archer: 0.15 } },
  { from: 120, rate: 2.2, weights: { trainee: 0.4, adventurer: 0.3, archer: 0.15, mage: 0.15 } },
  { from: 150, rate: 2.6, weights: { trainee: 0.28, adventurer: 0.3, archer: 0.15, mage: 0.12, knight: 0.15 } },
  { from: 225, rate: 3.2, weights: { trainee: 0.15, adventurer: 0.33, archer: 0.18, mage: 0.14, knight: 0.2 } },
  { from: 270, rate: 3.6, weights: { adventurer: 0.35, archer: 0.2, mage: 0.15, knight: 0.3 } },
];

export interface SpawnWave {
  at: number;
  spawns: Partial<Record<EnemyKind, number>>;
  /** trueなら円形にプレイヤーを包囲して出現 */
  ring?: boolean;
}

export const SPAWN_WAVES: SpawnWave[] = [
  { at: 90,  spawns: { trainee: 40 }, ring: true },
  { at: 180, spawns: { paladin: 1, adventurer: 14 } },
  { at: 270, spawns: { paladin: 2, knight: 8 } },
];

export function phaseAt(timeSec: number): SpawnPhase {
  let current = SPAWN_PHASES[0];
  for (const p of SPAWN_PHASES) {
    if (timeSec >= p.from) current = p;
  }
  return current;
}

// ---------------------------------------------------------------------------
// 称号（討伐数ベース。クリア時は最上位を上書き）
// ---------------------------------------------------------------------------
export const TITLES: Array<{ min: number; title: string }> = [
  { min: 2000, title: '勇者卸売業者' },
  { min: 1000, title: '王国の悪夢' },
  { min: 500, title: '砦の主' },
  { min: 100, title: '街道の脅威' },
  { min: 0, title: '村の小悪党' },
];
export const CLEAR_TITLE = '真・魔王軍最強オーク';

export function titleFor(kills: number, cleared: boolean): string {
  if (cleared) return CLEAR_TITLE;
  for (const t of TITLES) {
    if (kills >= t.min) return t.title;
  }
  return TITLES[TITLES.length - 1].title;
}
