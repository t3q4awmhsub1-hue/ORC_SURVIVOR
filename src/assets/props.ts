import * as THREE from 'three';
import { box, cyl, cone, ball, group, mat, matGlow } from './parts';

/** 経験値ジェム（緑の魂） */
export function buildGem(): THREE.Group {
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.16, 0),
    matGlow(0x3ddc6a, 0x1faa4a, 1.1),
  );
  core.castShadow = true;
  core.position.y = 0.35;
  return group(core);
}

/** 回復アイテムの肉（マンガ肉） */
export function buildMeat(): THREE.Group {
  const meat = ball(0.22, 0xb5543a, 0, 0.3, 0);
  meat.scale.set(1.4, 1, 1);
  const bone = cyl(0.035, 0.035, 0.62, 0xefe8d8, 0, 0.3, 0, 6);
  bone.rotation.z = Math.PI / 2;
  return group(
    meat,
    bone,
    ball(0.07, 0xefe8d8, -0.33, 0.3, 0, 0),
    ball(0.07, 0xefe8d8, 0.33, 0.3, 0, 0),
  );
}

/** ブタ突進スキルのブタ */
export function buildPig(): THREE.Group {
  const pink = 0xf2a6b8;
  const dark = 0xdb8298;
  const g = group(
    box(0.42, 0.36, 0.62, pink, 0, 0.42, 0),          // 胴
    box(0.32, 0.3, 0.26, pink, 0, 0.5, 0.4),          // 頭
    box(0.14, 0.12, 0.06, dark, 0, 0.46, 0.55),       // 鼻
  );
  // 耳・脚
  g.add(cone(0.07, 0.14, dark, -0.11, 0.68, 0.38, 4));
  g.add(cone(0.07, 0.14, dark, 0.11, 0.68, 0.38, 4));
  for (const [x, z] of [[-0.13, 0.2], [0.13, 0.2], [-0.13, -0.2], [0.13, -0.2]]) {
    g.add(box(0.1, 0.24, 0.1, dark, x, 0.12, z));
  }
  // 目
  g.add(box(0.04, 0.05, 0.02, 0x1c1c24, -0.09, 0.56, 0.54));
  g.add(box(0.04, 0.05, 0.02, 0x1c1c24, 0.09, 0.56, 0.54));
  return g;
}

/** 地形小物: 木 */
export function buildTree(): THREE.Group {
  return group(
    cyl(0.1, 0.15, 0.7, 0x6e4a23, 0, 0.35, 0, 6),
    ball(0.55, 0x4f8f3a, 0, 1.05, 0, 0),
    ball(0.35, 0x5fa548, 0.15, 1.5, 0.1, 0),
  );
}

/** 地形小物: 岩 */
export function buildRock(): THREE.Group {
  const rock = new THREE.Mesh(
    new THREE.DodecahedronGeometry(0.42, 0),
    mat(0x8d9298),
  );
  rock.castShadow = true;
  rock.scale.set(1.1, 0.65, 0.9);
  rock.position.y = 0.22;
  return group(rock);
}
