import * as THREE from 'three';
import { box, cyl, cone, group, mat, matGlow } from './parts';

// ---------------------------------------------------------------------------
// 共通カラー
// ---------------------------------------------------------------------------
export const COLORS = {
  orcSkin: 0x5d9b45,
  orcSkinDark: 0x4a7c36,
  humanSkin: 0xf0c8a0,
  wood: 0x6e4a23,
  woodLight: 0x8b5a2b,
  steel: 0xcfd6dd,
  steelDark: 0x7d8590,
  gold: 0xd9a92f,
  white: 0xf5f3ea,
  tuskWhite: 0xefe8d8,
  eyeRed: 0xff2e1f,
  eyeDark: 0x1c1c24,
} as const;

// ---------------------------------------------------------------------------
// 武器・装備（ハンドル原点 = 握り位置）
// ---------------------------------------------------------------------------
export function buildSword(scale = 1): THREE.Group {
  const g = group(
    cyl(0.025, 0.025, 0.16, COLORS.wood, 0, 0, 0),          // 柄
    box(0.18, 0.045, 0.05, COLORS.steelDark, 0, 0.1, 0),    // 鍔
    box(0.07, 0.6, 0.025, COLORS.steel, 0, 0.42, 0),        // 刀身
    cone(0.035, 0.08, COLORS.steel, 0, 0.76, 0, 4),         // 切先
  );
  g.scale.setScalar(scale);
  return g;
}

export function buildClub(scale = 1): THREE.Group {
  const g = group(
    cyl(0.15, 0.06, 0.9, COLORS.woodLight, 0, 0.35, 0, 7),
  );
  // 先端の石スパイク
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const s = cone(0.05, 0.16, COLORS.steelDark, Math.cos(a) * 0.14, 0.62, Math.sin(a) * 0.14, 5);
    s.rotation.set(Math.sin(a) * 1.2, 0, -Math.cos(a) * 1.2);
    g.add(s);
  }
  g.scale.setScalar(scale);
  return g;
}

export function buildBow(): THREE.Group {
  const arc = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.025, 5, 12, Math.PI),
    mat(COLORS.wood),
  );
  arc.castShadow = true;
  arc.rotation.z = -Math.PI / 2; // 開口部を前(+Z)に向ける
  const string = box(0.012, 0.012, 0.68, 0x3a3a3a, 0, 0, 0);
  return group(arc, string);
}

export function buildStaff(): THREE.Group {
  const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), matGlow(0x69d2ff, 0x2fa8ff, 1.2));
  orb.castShadow = true;
  orb.position.y = 0.78;
  return group(
    cyl(0.03, 0.04, 1.3, COLORS.wood, 0, 0.15, 0, 6),
    cone(0.07, 0.12, COLORS.woodLight, 0, 0.66, 0, 5),
    orb,
  );
}

export function buildHammer(): THREE.Group {
  return group(
    cyl(0.035, 0.045, 0.95, COLORS.wood, 0, 0.3, 0, 6),
    box(0.34, 0.2, 0.2, COLORS.steelDark, 0, 0.72, 0),
    box(0.36, 0.1, 0.1, COLORS.gold, 0, 0.72, 0),
  );
}

function buildShield(w: number, h: number, base: number, emblem: number): THREE.Group {
  return group(
    box(w, h, 0.05, base, 0, 0, 0),
    box(w * 0.55, h * 0.18, 0.03, emblem, 0, 0, 0.035),
    box(w * 0.18, h * 0.6, 0.03, emblem, 0, 0, 0.035),
  );
}

// ---------------------------------------------------------------------------
// 人型ベース（勇者たち共通）。原点 = 足元
// ---------------------------------------------------------------------------
interface HumanoidOpts {
  skin?: number;
  shirt: number;
  pants: number;
  legless?: boolean; // メイジ等、ローブで脚を隠すタイプ
}

interface Humanoid {
  root: THREE.Group;
  headPivot: THREE.Group; // 首位置（y≈1.12）
  armL: THREE.Group;      // 肩ピボット。手は local y -0.5
  armR: THREE.Group;
  torsoTopY: number;
}

function humanoid(opts: HumanoidOpts): Humanoid {
  const skin = opts.skin ?? COLORS.humanSkin;
  const root = new THREE.Group();

  if (!opts.legless) {
    root.add(box(0.16, 0.55, 0.18, opts.pants, -0.13, 0.275, 0));
    root.add(box(0.16, 0.55, 0.18, opts.pants, 0.13, 0.275, 0));
  }
  root.add(box(0.56, 0.55, 0.32, opts.shirt, 0, 0.825, 0));

  const headPivot = new THREE.Group();
  headPivot.position.y = 1.12;
  headPivot.add(box(0.38, 0.38, 0.38, skin, 0, 0.21, 0));
  // 目
  headPivot.add(box(0.05, 0.07, 0.02, COLORS.eyeDark, -0.09, 0.24, 0.19));
  headPivot.add(box(0.05, 0.07, 0.02, COLORS.eyeDark, 0.09, 0.24, 0.19));
  root.add(headPivot);

  const mkArm = (side: 1 | -1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.36, 1.02, 0);
    arm.add(box(0.14, 0.5, 0.16, opts.shirt, 0, -0.22, 0));
    arm.add(box(0.13, 0.12, 0.14, skin, 0, -0.5, 0)); // 手
    arm.rotation.z = side * -0.08;
    root.add(arm);
    return arm;
  };

  return { root, headPivot, armL: mkArm(-1), armR: mkArm(1), torsoTopY: 1.1 };
}

/** 手（local y -0.5）に武器を持たせる */
function hold(arm: THREE.Group, weapon: THREE.Group, rotX = 0, rotZ = 0): void {
  weapon.position.set(0, -0.5, 0.02);
  weapon.rotation.set(rotX, 0, rotZ);
  arm.add(weapon);
}

// ---------------------------------------------------------------------------
// オーク（プレイヤー）。原点 = 足元、身長 ≈ 2.1
// ---------------------------------------------------------------------------

/** アニメーション用に可動部の参照を持つリグ */
export interface OrcRig {
  root: THREE.Group;
  upper: THREE.Group;   // 前傾上半身（猫背ピボット）
  headPivot: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;    // 棍棒を持つ腕
}

/** プレイアブルオークの見た目バリエーション */
export type OrcVariant = 'warrior' | 'shaman' | 'chief';

export function buildOrcRig(variant: OrcVariant = 'warrior'): OrcRig {
  const root = new THREE.Group();
  const loincloth = variant === 'shaman' ? 0x6a4a8a : COLORS.woodLight;

  // 短く太い脚
  root.add(box(0.28, 0.5, 0.32, COLORS.orcSkin, -0.23, 0.25, 0));
  root.add(box(0.28, 0.5, 0.32, COLORS.orcSkin, 0.23, 0.25, 0));
  // 腰布とスカルバックルのベルト
  root.add(box(0.62, 0.28, 0.46, loincloth, 0, 0.56, 0));
  root.add(box(0.66, 0.09, 0.5, 0x3a2a18, 0, 0.66, 0));
  root.add(box(0.14, 0.12, 0.06, variant === 'chief' ? COLORS.gold : COLORS.tuskWhite, 0, 0.66, 0.26));
  root.add(box(0.04, 0.05, 0.07, 0x1c1c24, -0.03, 0.665, 0.27));
  root.add(box(0.04, 0.05, 0.07, 0x1c1c24, 0.03, 0.665, 0.27));

  // 前傾した上半身（猫背ピボット）
  const upper = new THREE.Group();
  upper.position.y = 0.66;
  upper.rotation.x = 0.14;
  root.add(upper);

  upper.add(box(0.95, 0.7, 0.55, COLORS.orcSkin, 0, 0.38, 0));
  upper.add(box(0.99, 0.22, 0.59, COLORS.orcSkinDark, 0, 0.62, 0)); // 肩まわりの影色

  if (variant === 'warrior') {
    // 左肩の鉄肩当て（歴戦感）
    upper.add(box(0.4, 0.16, 0.45, 0x5a6570, -0.5, 0.74, 0));
    upper.add(box(0.36, 0.1, 0.41, 0x6e7a86, -0.5, 0.84, 0));
    upper.add(cone(0.07, 0.22, 0x8a939e, -0.5, 0.97, 0, 5));
  } else if (variant === 'shaman') {
    // 骨の首飾り
    for (const [x, y] of [[-0.22, 0.6], [-0.08, 0.55], [0.08, 0.55], [0.22, 0.6]] as const) {
      const fang = cone(0.045, 0.16, COLORS.tuskWhite, x, y, 0.3, 4);
      fang.rotation.x = Math.PI;
      upper.add(fang);
    }
  } else {
    // 族長: 両肩当て + 赤マント
    for (const sx of [-1, 1] as const) {
      upper.add(box(0.4, 0.16, 0.45, 0x5a6570, sx * 0.5, 0.74, 0));
      upper.add(cone(0.07, 0.22, 0x8a939e, sx * 0.5, 0.97, 0, 5));
    }
    const cape = box(0.85, 1.05, 0.05, 0x9a2b1f, 0, 0.05, -0.38);
    cape.rotation.x = -0.08;
    upper.add(cape);
  }

  // 頭
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 0.82, 0.1);
  upper.add(headPivot);
  headPivot.add(box(0.55, 0.46, 0.5, COLORS.orcSkin, 0, 0.26, 0));
  headPivot.add(box(0.6, 0.2, 0.46, COLORS.orcSkinDark, 0, 0.1, 0.06));   // 下あご
  // 牙（口の端から外向きに反り上がる）
  const tuskL = cone(0.055, 0.2, COLORS.tuskWhite, -0.22, 0.21, 0.26, 5);
  tuskL.rotation.z = 0.25;
  const tuskR = cone(0.055, 0.2, COLORS.tuskWhite, 0.22, 0.21, 0.26, 5);
  tuskR.rotation.z = -0.25;
  headPivot.add(tuskL, tuskR);
  // とがった耳
  const earL = cone(0.09, 0.28, COLORS.orcSkin, -0.36, 0.32, 0, 5);
  earL.rotation.z = Math.PI / 2.4;
  const earR = cone(0.09, 0.28, COLORS.orcSkin, 0.36, 0.32, 0, 5);
  earR.rotation.z = -Math.PI / 2.4;
  headPivot.add(earL, earR);
  // 赤く光る目と怒り眉
  const eyeMat = matGlow(COLORS.eyeRed, COLORS.eyeRed, 1.4);
  for (const sx of [-1, 1] as const) {
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.06, 0.02), eyeMat);
    eye.position.set(sx * 0.14, 0.34, 0.26);
    headPivot.add(eye);
    const brow = box(0.16, 0.06, 0.04, COLORS.orcSkinDark, sx * 0.14, 0.4, 0.26);
    brow.rotation.z = sx * -0.35;
    headPivot.add(brow);
  }
  if (variant === 'shaman') {
    // 白塗りのウォーペイント（額の縦線）
    headPivot.add(box(0.06, 0.18, 0.02, COLORS.tuskWhite, 0, 0.42, 0.26));
  } else if (variant === 'chief') {
    // 族長の角飾り
    for (const sx of [-1, 1] as const) {
      const horn = cone(0.08, 0.34, COLORS.tuskWhite, sx * 0.26, 0.55, 0, 5);
      horn.rotation.z = sx * -0.5;
      headPivot.add(horn);
    }
  }

  // 太い腕
  const mkArm = (side: 1 | -1) => {
    const arm = new THREE.Group();
    arm.position.set(side * 0.62, 0.62, 0);
    arm.add(box(0.28, 0.75, 0.32, COLORS.orcSkin, 0, -0.3, 0));
    arm.add(box(0.3, 0.22, 0.34, COLORS.orcSkinDark, 0, -0.72, 0)); // 拳
    arm.rotation.z = side * -0.18;
    upper.add(arm);
    return arm;
  };
  const armL = mkArm(-1);
  const armR = mkArm(1);

  if (variant === 'warrior') {
    armR.rotation.x = -0.45;
    // 棍棒（進化演出でスケールするため名前を付けておく）
    const club = buildClub(1.1);
    club.name = 'club';
    club.position.set(0, -0.72, 0.05);
    club.rotation.x = 0.45;
    armR.add(club);
  } else if (variant === 'shaman') {
    armR.rotation.x = -0.3;
    // 骨の杖（頭骨付き）
    const staff = group(
      cyl(0.035, 0.045, 1.25, 0x8a7a5e, 0, 0.2, 0, 6),
      box(0.16, 0.14, 0.14, COLORS.tuskWhite, 0, 0.9, 0),
      cone(0.04, 0.12, COLORS.tuskWhite, -0.08, 1.0, 0, 4),
      cone(0.04, 0.12, COLORS.tuskWhite, 0.08, 1.0, 0, 4),
    );
    staff.name = 'club';
    staff.position.set(0, -0.72, 0.05);
    staff.rotation.x = 0.3;
    armR.add(staff);
  } else {
    armR.rotation.x = -0.45;
    // 族長の大斧
    const axe = group(
      cyl(0.05, 0.05, 1.0, COLORS.wood, 0, 0.3, 0, 6),
      box(0.34, 0.3, 0.06, COLORS.steelDark, 0.14, 0.72, 0),
      cone(0.06, 0.14, COLORS.steel, 0, 0.88, 0, 4),
    );
    axe.name = 'club';
    axe.position.set(0, -0.72, 0.05);
    axe.rotation.x = 0.45;
    armR.add(axe);
  }

  return { root, upper, headPivot, armL, armR };
}

export function buildOrc(): THREE.Group {
  return buildOrcRig().root;
}

/** 子分オーク（召喚スキル用）: 本体の縮小 */
export function buildMinionOrc(): THREE.Group {
  const g = buildOrc();
  g.scale.setScalar(0.62);
  return g;
}

// ---------------------------------------------------------------------------
// 勇者たち
// ---------------------------------------------------------------------------

/** 見習い剣士: 量産モブ。粗末な服と短剣 */
export function buildTrainee(): THREE.Group {
  const h = humanoid({ shirt: 0xcdb27e, pants: 0x6e5a3a });
  // 鉢巻きと髪
  h.headPivot.add(box(0.4, 0.1, 0.4, 0x6b4226, 0, 0.42, 0));
  h.headPivot.add(box(0.41, 0.07, 0.41, 0xb33939, 0, 0.33, 0));
  h.armR.rotation.x = -0.4;
  hold(h.armR, buildSword(0.8), 0.5);
  return h.root;
}

/** 冒険者: 革鎧 + 剣 + 小盾 */
export function buildAdventurer(): THREE.Group {
  const h = humanoid({ shirt: 0x8a5a33, pants: 0x4a4136 });
  h.headPivot.add(box(0.4, 0.12, 0.4, 0x3f2e1d, 0, 0.42, 0)); // 髪
  h.root.add(box(0.6, 0.16, 0.36, 0x5a3a1e, 0, 0.62, 0));     // ベルト
  h.armR.rotation.x = -0.4;
  hold(h.armR, buildSword(1), 0.5);
  const shield = buildShield(0.3, 0.38, 0x7a5230, 0xc9a14d);
  shield.position.set(-0.1, -0.35, 0.06);
  shield.rotation.y = -0.2;
  h.armL.add(shield);
  return h.root;
}

/** アーチャー: 緑フード + 弓 + 矢筒 */
export function buildArcher(): THREE.Group {
  const h = humanoid({ shirt: 0x4a7a3a, pants: 0x39512e });
  const hood = cone(0.32, 0.42, 0x3d6630, 0, 0.42, -0.02, 7);
  h.headPivot.add(hood);
  h.armL.rotation.x = -0.6;
  hold(h.armL, buildBow(), 0, 0);
  // 矢筒
  const quiver = cyl(0.08, 0.08, 0.45, 0x6e4a23, 0, 0.95, -0.24, 6);
  quiver.rotation.z = 0.3;
  h.root.add(quiver);
  h.root.add(cone(0.04, 0.1, 0xd8d2c2, -0.09, 1.2, -0.24, 4));
  h.root.add(cone(0.04, 0.1, 0xd8d2c2, -0.16, 1.16, -0.24, 4));
  return h.root;
}

/** メイジ: 青ローブ + とんがり帽子 + 杖 */
export function buildMage(): THREE.Group {
  const h = humanoid({ shirt: 0x3a4f9e, pants: 0x2c3c7a, legless: true });
  h.root.add(cyl(0.3, 0.46, 0.75, 0x32448c, 0, 0.38, 0, 8)); // ローブ裾
  // とんがり帽子
  h.headPivot.add(cyl(0.42, 0.42, 0.05, 0x2c3c7a, 0, 0.4, 0, 8));
  const hat = cone(0.28, 0.5, 0x32448c, 0, 0.62, 0, 8);
  hat.rotation.x = 0.12;
  h.headPivot.add(hat);
  h.armR.rotation.x = -0.25;
  hold(h.armR, buildStaff(), 0.25);
  return h.root;
}

/** ナイト: 全身鎧 + 大盾。固くて遅い */
export function buildKnight(): THREE.Group {
  const armor = 0x9aa3ad;
  const h = humanoid({ shirt: armor, pants: 0x6b7280, skin: armor });
  // 兜（頭を覆う）+ スリット + 赤い房
  h.headPivot.add(box(0.44, 0.44, 0.44, armor, 0, 0.21, 0));
  h.headPivot.add(box(0.34, 0.07, 0.04, COLORS.eyeDark, 0, 0.26, 0.22));
  h.headPivot.add(box(0.08, 0.18, 0.3, 0xb33939, 0, 0.5, -0.02));
  // 肩当て
  h.root.add(box(0.2, 0.14, 0.3, 0x7d8590, -0.4, 1.06, 0));
  h.root.add(box(0.2, 0.14, 0.3, 0x7d8590, 0.4, 1.06, 0));
  h.armR.rotation.x = -0.35;
  hold(h.armR, buildSword(1.05), 0.45);
  const shield = buildShield(0.4, 0.55, 0x6b7280, 0x4a5560);
  shield.position.set(-0.1, -0.38, 0.08);
  shield.rotation.y = -0.15;
  h.armL.add(shield);
  return h.root;
}

/** パラディン（エリート）: 金白の鎧 + ウォーハンマー + マント */
export function buildPaladin(): THREE.Group {
  const h = humanoid({ shirt: COLORS.white, pants: 0xb8b3a4, skin: COLORS.gold });
  h.root.add(box(0.6, 0.3, 0.36, COLORS.gold, 0, 0.95, 0)); // 胸当て
  // 兜 + 白い羽飾り
  h.headPivot.add(box(0.44, 0.44, 0.44, COLORS.gold, 0, 0.21, 0));
  h.headPivot.add(box(0.34, 0.07, 0.04, COLORS.eyeDark, 0, 0.26, 0.22));
  h.headPivot.add(box(0.07, 0.34, 0.2, COLORS.white, 0, 0.55, -0.06));
  // 大型肩当て
  h.root.add(box(0.26, 0.18, 0.34, COLORS.gold, -0.42, 1.08, 0));
  h.root.add(box(0.26, 0.18, 0.34, COLORS.gold, 0.42, 1.08, 0));
  // マント
  const cape = box(0.54, 0.78, 0.04, 0xe8e2d2, 0, 0.72, -0.22);
  cape.rotation.x = 0.12;
  h.root.add(cape);
  h.armR.rotation.x = -0.5;
  hold(h.armR, buildHammer(), 0.6);
  // スケールで威圧感を出す
  h.root.scale.setScalar(1.18);
  return h.root;
}

/** 真の勇者（最終ボス）: 金髪ツンツン + 赤マント + 大剣 */
export function buildHero(): THREE.Group {
  const h = humanoid({ shirt: 0x2f5fd0, pants: 0x37425a });
  h.root.add(box(0.58, 0.3, 0.34, COLORS.steel, 0, 0.95, 0)); // 銀の胸当て
  // 金髪（土台 + ツンツンの束）
  const hair = 0xe8c84a;
  h.headPivot.add(box(0.4, 0.16, 0.4, hair, 0, 0.42, -0.02));
  // ツンツン頭: 高さ・角度をばらして王冠に見えないようにする
  const spikes: Array<[number, number, number, number, number]> = [
    [0, 0.58, -0.08, 0.15, 0.36],      // 中央の大きな束（やや後ろへ）
    [-0.13, 0.52, 0.08, -0.75, 0.26],  // 前髪 左
    [0.12, 0.54, 0.1, 0.55, 0.22],     // 前髪 右
    [-0.15, 0.5, -0.12, -0.95, 0.3],
    [0.16, 0.51, -0.1, 0.85, 0.28],
    [0.02, 0.5, 0.16, 0.1, 0.2],       // 額の上の短い束
  ];
  for (const [x, y, z, tilt, len] of spikes) {
    const s = cone(0.08, len, hair, x, y, z, 5);
    s.rotation.z = tilt;
    s.rotation.x = z < 0 ? -0.55 : 0.35;
    h.headPivot.add(s);
  }
  h.headPivot.add(box(0.44, 0.07, 0.44, 0xb33939, 0, 0.34, 0)); // 鉢巻き
  // 赤マント
  const cape = box(0.56, 0.8, 0.04, 0xc0392b, 0, 0.7, -0.2);
  cape.rotation.x = 0.16;
  h.root.add(cape);
  // 大剣を掲げる（腕の回転を打ち消して刃を真上に向ける）
  h.armR.rotation.x = -2.6;
  hold(h.armR, buildSword(1.5), 2.75);
  h.root.scale.setScalar(1.25);
  return h.root;
}
