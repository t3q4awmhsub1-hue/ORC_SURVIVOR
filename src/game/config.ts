/** ゲームバランス定義。すべての数値調整はこのファイルに集約する */

export type EnemyKind =
  | 'trainee' | 'adventurer' | 'archer' | 'mage' | 'knight' | 'paladin' | 'hero';
export type WeaponKind = 'club' | 'bone' | 'stomp' | 'roar' | 'pig' | 'minion';
export type PassiveKind = 'muscle' | 'skin' | 'trotters' | 'glutton' | 'bulk' | 'nose';
export type ProjectileKind = 'bone' | 'arrow' | 'bolt';

export const GAME_DURATION = 300;     // 5分（秒）

// ---------------------------------------------------------------------------
// ステージ（難易度別）
// ---------------------------------------------------------------------------
export type StageId = 'grass' | 'snow' | 'hell';

export interface StageDef {
  name: string;
  difficulty: string;
  icon: string;
  desc: string;
  /** 出現レート倍率 */
  rateMul: number;
  /** 敵HP倍率 */
  hpMul: number;
  /** 敵ダメージ倍率 */
  dmgMul: number;
  /** スコア倍率 */
  scoreMul: number;
  // 見た目（レンダラが参照）
  ground: number;
  sky: number;
  sun: number;
  hemiSky: number;
  hemiGround: number;
  treeTint: number;
  rockTint: number;
}

export const STAGES: Record<StageId, StageDef> = {
  grass: {
    name: 'オークの森', difficulty: 'ふつう', icon: '🌳',
    desc: '住み慣れた草原。基準の難易度',
    rateMul: 1, hpMul: 1, dmgMul: 1, scoreMul: 1,
    ground: 0x6f9c54, sky: 0x9ed1e8, sun: 0xfff2d8,
    hemiSky: 0xbfd9ff, hemiGround: 0x6a8a4f,
    treeTint: 0xffffff, rockTint: 0xffffff,
  },
  snow: {
    name: '雪原の国境', difficulty: 'むずかしい', icon: '⛄',
    desc: '敵が増え、硬くなる。スコア1.5倍',
    rateMul: 1.3, hpMul: 1.2, dmgMul: 1.1, scoreMul: 1.5,
    ground: 0xd8e4ea, sky: 0xc2d4e2, sun: 0xeef4ff,
    hemiSky: 0xdde8f2, hemiGround: 0x9fb4c0,
    treeTint: 0xa8c8d8, rockTint: 0xc8d8e2,
  },
  hell: {
    name: '勇者の本国', difficulty: 'じごく', icon: '🔥',
    desc: '敵の本拠地。生半可では死ぬ。スコア2倍',
    rateMul: 1.6, hpMul: 1.45, dmgMul: 1.25, scoreMul: 2,
    ground: 0x55303a, sky: 0x301622, sun: 0xff8a55,
    hemiSky: 0x6a3a50, hemiGround: 0x3a2028,
    treeTint: 0xb06a6a, rockTint: 0x9a6a72,
  },
};
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
  trainee:    { hp: 10,  speed: 1.85, dmg: 7,  score: 1,   xp: 1,  radius: 0.35, kbResist: 0 },
  adventurer: { hp: 26,  speed: 2.35, dmg: 10, score: 2,   xp: 2,  radius: 0.35, kbResist: 0 },
  archer:     { hp: 24,  speed: 2.25, dmg: 5,  score: 5,   xp: 4,  radius: 0.35, kbResist: 0,
                ranged: { range: 8, cooldown: 2.7, projSpeed: 7.8, dmg: 7, projKind: 'arrow' } },
  mage:       { hp: 34,  speed: 1.65, dmg: 5,  score: 8,   xp: 6,  radius: 0.35, kbResist: 0,
                ranged: { range: 10, cooldown: 3.6, projSpeed: 5.8, dmg: 13, projKind: 'bolt' } },
  knight:     { hp: 110, speed: 1.5, dmg: 16, score: 10,  xp: 8,  radius: 0.45, kbResist: 0.8 },
  paladin:    { hp: 400, speed: 2.0, dmg: 22, score: 20,  xp: 25, radius: 0.55, kbResist: 0.9,
                auraSpeedMul: 1.55, auraRadius: 7 },
  hero:       { hp: 2600, speed: 3.3, dmg: 28, score: 500, xp: 0, radius: 0.65, kbResist: 1 },
};

/** 経過時間による敵HPスケール（5分で3倍） */
export function enemyHpScale(timeSec: number): number {
  return 1 + (timeSec / 60) * 0.4;
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

// ---------------------------------------------------------------------------
// 武器進化（武器Lv5 + 対応パッシブ所持で自動進化）
// ---------------------------------------------------------------------------
export interface EvolutionDef extends SkillInfo {
  passive: PassiveKind;
}

export const EVOLUTIONS: Record<WeaponKind, EvolutionDef> = {
  club:   { passive: 'muscle',   name: '魔王の大金棒',     desc: '全周を薙ぎ払う一撃', icon: '⚒️' },
  bone:   { passive: 'nose',     name: '竜骨ブーメラン',   desc: '無限貫通で往復する', icon: '🪃' },
  stomp:  { passive: 'bulk',     name: '大地割り',         desc: '大地を砕く巨大衝撃波', icon: '🌋' },
  roar:   { passive: 'glutton',  name: '覇王の咆哮',       desc: '全方位の敵を怯ませる', icon: '👑' },
  pig:    { passive: 'trotters', name: '豚の大群',         desc: '6頭のブタが踏み荒らす', icon: '🌪️' },
  minion: { passive: 'skin',     name: 'オーク戦士団',     desc: '5体の精鋭が付き従う', icon: '⚔️' },
};

/** 進化後ステータス（WEAPON_STATSと同形。Lv5を大きく上回る性能） */
export const EVOLVED_STATS = {
  club:   { cooldown: 0.6,  dmg: 95,  range: 3.6, arc: Math.PI * 2, knockback: 6 },
  bone:   { cooldown: 0.7,  dmg: 60,  count: 4, pierce: 99, speed: 15, boomerang: true },
  stomp:  { cooldown: 2.0,  dmg: 75,  radius: 5.6, knockback: 13, stun: 0.8 },
  roar:   { cooldown: 2.6,  dmg: 50,  range: 7.0, arc: Math.PI * 2, stun: 3.0, knockback: 9 },
  pig:    { cooldown: 3.6,  count: 6, dmg: 120, speed: 12, radius: 1.1, knockback: 10 },
  minion: { max: 5, dmg: 50, attackCooldown: 0.55, speed: 5.2, range: 1.0 },
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
// 宝箱
// ---------------------------------------------------------------------------
export type ChestTier = 'wood' | 'silver' | 'gold' | 'rainbow';
export type RelicId = 'kanabo' | 'belly' | 'heart' | 'hog';

/** 全敵共通: 超激レア（虹の宝箱）のドロップ率 */
export const LEGENDARY_CHANCE = 0.01;
export const CHEST_CAP = 24;

export interface ChestDropDef {
  chance: number;
  tiers: Partial<Record<'wood' | 'silver' | 'gold', number>>;
}

/** 敵が強いほどドロップ率が高く、中身も豪華（パラディンは確定で金） */
export const CHEST_DROPS: Record<EnemyKind, ChestDropDef> = {
  trainee:    { chance: 0.004, tiers: { wood: 1 } },
  adventurer: { chance: 0.008, tiers: { wood: 0.9, silver: 0.1 } },
  archer:     { chance: 0.012, tiers: { wood: 0.7, silver: 0.3 } },
  mage:       { chance: 0.02,  tiers: { wood: 0.5, silver: 0.5 } },
  knight:     { chance: 0.05,  tiers: { silver: 0.8, gold: 0.2 } },
  paladin:    { chance: 1,     tiers: { gold: 1 } },
  hero:       { chance: 0,     tiers: {} },
};

/** 宝箱の中身（時間経過＝敵の強さに応じて経験値量もスケールする） */
export const CHEST_REWARDS = {
  wood:   { heal: 25, xpBase: 8 },
  silver: { upgrades: 1, xpFallback: 30 },
  gold:   { upgrades: 2, healRatio: 0.4, xpFallback: 60 },
} as const;

export function chestXp(timeSec: number): number {
  return Math.round(CHEST_REWARDS.wood.xpBase * enemyHpScale(timeSec));
}

/** 超激レア固有アイテム（1ランで各1個まで） */
export const RELICS: Record<RelicId, SkillInfo> = {
  kanabo: { name: '魔王の金棒',   desc: '全攻撃力が2.2倍になる',                icon: '👹' },
  belly:  { name: '不滅の鉄腹',   desc: '最大HP2倍＋毎秒HPが回復し続ける',       icon: '🪨' },
  heart:  { name: '勇者の心臓',   desc: '被ダメージ-35%＋被弾後の無敵時間2倍',   icon: '❤️‍🔥' },
  hog:    { name: '豚神の加護',   desc: '全武器のクールダウン40%短縮＋移動+25%', icon: '🐷' },
};

export const RELIC_EFFECTS = {
  kanaboAttackMul: 2.2,
  bellyMaxHpMul: 2,
  bellyRegenRatioPerSec: 0.01, // 最大HPの1%/秒
  heartDamageTakenMul: 0.65,
  heartHurtCooldownMul: 2,
  hogCooldownMul: 0.6,
  hogSpeedMul: 1.25,
} as const;

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
  { from: 0,   rate: 1.4, weights: { trainee: 1 } },
  { from: 30,  rate: 2.0, weights: { trainee: 0.7, adventurer: 0.3 } },
  { from: 60,  rate: 2.6, weights: { trainee: 0.55, adventurer: 0.3, archer: 0.15 } },
  { from: 120, rate: 3.2, weights: { trainee: 0.4, adventurer: 0.3, archer: 0.15, mage: 0.15 } },
  { from: 150, rate: 3.8, weights: { trainee: 0.28, adventurer: 0.3, archer: 0.15, mage: 0.12, knight: 0.15 } },
  { from: 225, rate: 4.6, weights: { trainee: 0.15, adventurer: 0.33, archer: 0.18, mage: 0.14, knight: 0.2 } },
  { from: 270, rate: 5.2, weights: { adventurer: 0.35, archer: 0.2, mage: 0.15, knight: 0.3 } },
];

export interface SpawnWave {
  at: number;
  spawns: Partial<Record<EnemyKind, number>>;
  /** trueなら円形にプレイヤーを包囲して出現 */
  ring?: boolean;
}

export const SPAWN_WAVES: SpawnWave[] = [
  { at: 90,  spawns: { trainee: 50 }, ring: true },
  { at: 180, spawns: { paladin: 1, adventurer: 18 } },
  { at: 270, spawns: { paladin: 3, knight: 10 } },
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
