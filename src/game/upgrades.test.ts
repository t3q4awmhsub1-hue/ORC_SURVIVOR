import { describe, expect, it } from 'vitest';
import { MAX_SKILL_LEVEL, MAX_WEAPON_SLOTS, type PassiveKind, type WeaponKind } from './config';
import { mulberry32 } from './rng';
import { generateChoices } from './upgrades';

const W = (entries: Array<[WeaponKind, number]>) => new Map(entries);
const P = (entries: Array<[PassiveKind, number]>) => new Map(entries);

describe('generateChoices', () => {
  it('常に3択を返し、候補は重複しない', () => {
    const rng = mulberry32(1);
    for (let i = 0; i < 50; i++) {
      const choices = generateChoices(rng, W([['club', 1]]), P([]));
      expect(choices).toHaveLength(3);
      const keys = choices.map((c) => (c.kind === 'heal' ? 'heal' : `${c.kind}:${c.id}`));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it('武器枠が満杯なら新規武器は提示されない', () => {
    const rng = mulberry32(2);
    const owned: WeaponKind[] = ['club', 'bone', 'stomp', 'roar'];
    expect(owned).toHaveLength(MAX_WEAPON_SLOTS);
    for (let i = 0; i < 50; i++) {
      const choices = generateChoices(rng, W(owned.map((w) => [w, 1])), P([]));
      for (const c of choices) {
        if (c.kind === 'weapon') {
          expect(owned).toContain(c.id);
          expect(c.nextLevel).toBe(2);
        }
      }
    }
  });

  it('最大レベルのスキルは候補から外れる', () => {
    const rng = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      const choices = generateChoices(rng, W([['club', MAX_SKILL_LEVEL]]), P([]));
      for (const c of choices) {
        if (c.kind === 'weapon') expect(c.id).not.toBe('club');
      }
    }
  });

  it('すべて取り尽くした場合は回復で埋まる', () => {
    const rng = mulberry32(4);
    const allWeaponsMax = W([['club', 5], ['bone', 5], ['stomp', 5], ['roar', 5]]);
    const allPassivesMax = P([['muscle', 5], ['skin', 5], ['trotters', 5], ['glutton', 5]]);
    const choices = generateChoices(rng, allWeaponsMax, allPassivesMax);
    expect(choices.length).toBeGreaterThanOrEqual(1);
    expect(choices.every((c) => c.kind === 'heal')).toBe(true);
  });

  it('新規取得はnextLevel=1、強化は現在値+1', () => {
    const rng = mulberry32(5);
    for (let i = 0; i < 50; i++) {
      const choices = generateChoices(rng, W([['club', 3]]), P([['muscle', 2]]));
      for (const c of choices) {
        if (c.kind === 'weapon' && c.id === 'club') expect(c.nextLevel).toBe(4);
        else if (c.kind === 'passive' && c.id === 'muscle') expect(c.nextLevel).toBe(3);
        else if (c.kind !== 'heal') expect(c.nextLevel).toBe(1);
      }
    }
  });
});
