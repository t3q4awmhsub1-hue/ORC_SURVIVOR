import {
  MAX_PASSIVE_SLOTS, MAX_SKILL_LEVEL, MAX_WEAPON_SLOTS,
  PASSIVE_INFO, WEAPON_INFO,
  type PassiveKind, type SkillInfo, type WeaponKind,
} from './config';
import { pickN, type Rng } from './rng';

export type UpgradeChoice =
  | { kind: 'weapon'; id: WeaponKind; nextLevel: number }
  | { kind: 'passive'; id: PassiveKind; nextLevel: number }
  | { kind: 'heal' };

const ALL_WEAPONS = Object.keys(WEAPON_INFO) as WeaponKind[];
const ALL_PASSIVES = Object.keys(PASSIVE_INFO) as PassiveKind[];

export function choiceInfo(c: UpgradeChoice): SkillInfo & { levelText: string } {
  if (c.kind === 'heal') {
    return { name: '肉を食べる', desc: 'HPを30回復する', icon: '🍖', levelText: '' };
  }
  const info = c.kind === 'weapon' ? WEAPON_INFO[c.id] : PASSIVE_INFO[c.id];
  return {
    ...info,
    levelText: c.nextLevel === 1 ? 'NEW!' : `Lv${c.nextLevel - 1} → Lv${c.nextLevel}`,
  };
}

/** 取得可能なアップグレード候補から3つ選ぶ。候補不足は回復で埋める */
export function generateChoices(
  rng: Rng,
  weapons: ReadonlyMap<WeaponKind, number>,
  passives: ReadonlyMap<PassiveKind, number>,
): UpgradeChoice[] {
  const pool: UpgradeChoice[] = [];

  for (const id of ALL_WEAPONS) {
    const lv = weapons.get(id);
    if (lv === undefined) {
      if (weapons.size < MAX_WEAPON_SLOTS) pool.push({ kind: 'weapon', id, nextLevel: 1 });
    } else if (lv < MAX_SKILL_LEVEL) {
      pool.push({ kind: 'weapon', id, nextLevel: lv + 1 });
    }
  }
  for (const id of ALL_PASSIVES) {
    const lv = passives.get(id);
    if (lv === undefined) {
      if (passives.size < MAX_PASSIVE_SLOTS) pool.push({ kind: 'passive', id, nextLevel: 1 });
    } else if (lv < MAX_SKILL_LEVEL) {
      pool.push({ kind: 'passive', id, nextLevel: lv + 1 });
    }
  }

  const choices = pickN(rng, pool, 3);
  while (choices.length < 3) {
    choices.push({ kind: 'heal' });
    if (choices.filter((c) => c.kind === 'heal').length >= 2) break; // 回復は最大2枠
  }
  return choices;
}
