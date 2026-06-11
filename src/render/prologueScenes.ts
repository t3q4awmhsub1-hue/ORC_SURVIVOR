import * as THREE from 'three';
import { buildMinionOrc, buildOrcRig, buildTrainee, buildAdventurer, buildKnight, buildPaladin } from '../assets/characters';
import { buildMeat, buildTree, buildRock } from '../assets/props';
import { box, cyl, cone, group, matGlow } from '../assets/parts';

/**
 * プロローグの3Dジオラマ。ページごとに小さなシーンを組み、
 * ゆっくりとしたカメラワークで「動く挿絵」として背景に表示する。
 */

interface DioramaPage {
  scene: THREE.Scene;
  camFrom: THREE.Vector3;
  camTo: THREE.Vector3;
  lookAt: THREE.Vector3;
  /** カメラ移動にかける秒数（読み終わるまでゆっくり） */
  duration: number;
  update?: (t: number) => void;
}

function ground(scene: THREE.Scene, color: number): void {
  const g = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshLambertMaterial({ color }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
}

function scatter(scene: THREE.Scene, builder: () => THREE.Group, spots: Array<[number, number, number?]>): void {
  for (const [x, z, s] of spots) {
    const m = builder();
    m.position.set(x, 0, z);
    m.rotation.y = (x * 7 + z * 13) % 6.28;
    if (s) m.scale.setScalar(s);
    scene.add(m);
  }
}

function campfire(): { group: THREE.Group; light: THREE.PointLight; flames: THREE.Mesh[] } {
  const logs = group();
  for (let i = 0; i < 3; i++) {
    const log = cyl(0.07, 0.07, 0.9, 0x5a3a1e, 0, 0.08, 0, 5);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 3) * Math.PI;
    logs.add(log);
  }
  const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.8, 7), matGlow(0xff8c3a, 0xff5a1f, 1.2));
  flameOuter.position.y = 0.5;
  const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.17, 0.5, 6), matGlow(0xffd34d, 0xffb52e, 1.4));
  flameInner.position.y = 0.42;
  const light = new THREE.PointLight(0xff9043, 14, 12, 1.6);
  light.position.y = 1.0;
  return { group: group(logs, flameOuter, flameInner, light), light, flames: [flameOuter, flameInner] };
}

function hut(x: number, z: number, ry: number): THREE.Group {
  const g = group(
    box(2.0, 1.4, 1.8, 0x6e4a23, 0, 0.7, 0),
    cone(1.7, 1.1, 0x52381c, 0, 2.0, 0, 4),
    box(0.6, 0.9, 0.05, 0x33230f, 0, 0.45, 0.91), // 入口
  );
  g.position.set(x, 0, z);
  g.rotation.y = ry;
  return g;
}

export class PrologueScenes {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly pages = new Map<number, DioramaPage>();
  private current: DioramaPage | null = null;
  private camT = 0;
  private elapsed = 0;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 120);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  setPage(index: number): void {
    let page = this.pages.get(index);
    if (!page) {
      page = this.build(index);
      this.pages.set(index, page);
    }
    this.current = page;
    this.camT = 0;
  }

  render(dt: number): void {
    if (!this.current) return;
    this.elapsed += dt;
    this.camT = Math.min(1, this.camT + dt / this.current.duration);
    const k = this.camT * this.camT * (3 - 2 * this.camT); // smoothstep
    this.camera.position.lerpVectors(this.current.camFrom, this.current.camTo, k);
    this.camera.lookAt(this.current.lookAt);
    this.current.update?.(this.elapsed);
    this.renderer.render(this.current.scene, this.camera);
  }

  // --- ページごとのジオラマ ---------------------------------------------------
  private build(index: number): DioramaPage {
    switch (index) {
      case 0: return this.buildVillageEvening();
      case 1: return this.buildHeroMarch();
      case 2: return this.buildAlarm();
      case 3: return this.buildFarewell();
      default: return this.buildResolve();
    }
  }

  /** P1: 夕餉の村。焚き火を囲む親子 */
  private buildVillageEvening(): DioramaPage {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x3a2c3e);
    scene.fog = new THREE.Fog(0x3a2c3e, 14, 38);
    scene.add(new THREE.HemisphereLight(0x5a4a6a, 0x2c2418, 0.5));
    ground(scene, 0x44603a);

    const fire = campfire();
    scene.add(fire.group);

    const father = buildOrcRig();
    father.root.position.set(-1.4, 0, 0.3);
    father.root.rotation.y = Math.PI / 2.4;
    scene.add(father.root);
    const kids: THREE.Group[] = [];
    for (const [x, z, ry] of [[1.2, 0.6, -1.9], [1.0, -0.8, -1.2]] as const) {
      const kid = buildMinionOrc();
      kid.scale.setScalar(0.42);
      kid.position.set(x, 0, z);
      kid.rotation.y = ry;
      kids.push(kid);
      scene.add(kid);
    }
    const meat = buildMeat();
    meat.position.set(0.4, 0.1, 1.1);
    meat.scale.setScalar(0.8);
    scene.add(meat);

    scene.add(hut(-4.2, -2.5, 0.5), hut(3.8, -3.5, -0.4));
    scatter(scene, buildTree, [[-7, -6], [7, -7], [-5, 3, 1.2], [9, -2]]);
    scatter(scene, buildRock, [[-2.5, 3.5], [5, 2]]);

    return {
      scene,
      camFrom: new THREE.Vector3(6.2, 3.4, 7.6),
      camTo: new THREE.Vector3(5.0, 2.6, 6.0),
      lookAt: new THREE.Vector3(-0.4, 0.9, 0),
      duration: 16,
      update: (t) => {
        fire.light.intensity = 13 + Math.sin(t * 11) * 2.2 + Math.sin(t * 23) * 1.2;
        fire.flames[0].scale.setScalar(1 + Math.sin(t * 9) * 0.08);
        fire.flames[1].scale.setScalar(1 + Math.sin(t * 13 + 1) * 0.12);
        kids.forEach((k, i) => {
          k.position.y = Math.abs(Math.sin(t * 2.2 + i * 1.7)) * 0.05; // はしゃぐ子オーク
        });
      },
    };
  }

  /** P2: 勇者たちの行軍 */
  private buildHeroMarch(): DioramaPage {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x8da4b8);
    scene.fog = new THREE.Fog(0x8da4b8, 16, 42);
    scene.add(new THREE.HemisphereLight(0xcfdce8, 0x55604a, 0.9));
    const sun = new THREE.DirectionalLight(0xeef2f5, 1.1);
    sun.position.set(-6, 10, 4);
    scene.add(sun);
    ground(scene, 0x6f8a55);
    // 街道
    const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 3.4), new THREE.MeshLambertMaterial({ color: 0x8a7a5e }));
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0.02;
    scene.add(road);

    // 行軍の列（先頭にパラディンの旗）
    const marchers: THREE.Group[] = [];
    const columnDefs = [buildPaladin, buildKnight, buildAdventurer, buildTrainee, buildAdventurer, buildTrainee, buildTrainee, buildKnight];
    columnDefs.forEach((build, i) => {
      const m = build();
      m.position.set(4.5 - i * 2.0, 0, (i % 2) * 0.9 - 0.45);
      m.rotation.y = Math.PI / 2;
      marchers.push(m);
      scene.add(m);
    });
    const banner = group(
      cyl(0.04, 0.04, 2.6, 0x6e4a23, 0, 1.3, 0, 5),
      box(0.9, 0.6, 0.03, 0xc0392b, 0.46, 2.2, 0),
      box(0.9, 0.12, 0.04, 0xd9a92f, 0.46, 2.42, 0),
    );
    banner.position.set(4.9, 0, 0.6);
    scene.add(banner);
    scatter(scene, buildTree, [[-6, -6], [2, -7], [8, -5], [-9, -3]]);

    return {
      scene,
      camFrom: new THREE.Vector3(-4.5, 2.4, 7.5),
      camTo: new THREE.Vector3(3.5, 2.0, 6.8),
      lookAt: new THREE.Vector3(0.5, 1.0, 0),
      duration: 16,
      update: (t) => {
        marchers.forEach((m, i) => {
          m.position.y = Math.abs(Math.sin(t * 5 + i * 0.9)) * 0.09; // 行進
          m.rotation.z = Math.sin(t * 5 + i * 0.9) * 0.04;
        });
      },
    };
  }

  /** P3: 夜の警報。遠くに勇者たちの松明 */
  private buildAlarm(): DioramaPage {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1e2a40);
    scene.fog = new THREE.Fog(0x1e2a40, 12, 40);
    scene.add(new THREE.HemisphereLight(0x44587a, 0x1a2014, 0.55));
    const moon = new THREE.DirectionalLight(0x9ab4d9, 0.5);
    moon.position.set(4, 9, -3);
    scene.add(moon);
    ground(scene, 0x345032);

    // 身を寄せ合う家族
    const adults = buildOrcRig();
    adults.root.position.set(-1.5, 0, 0.5);
    adults.root.rotation.y = Math.PI / 2 - 0.3;
    scene.add(adults.root);
    for (const [x, z] of [[-0.6, 1.0], [-0.9, -0.2], [-0.2, 0.4]] as const) {
      const kid = buildMinionOrc();
      kid.scale.setScalar(0.4);
      kid.position.set(x, 0, z);
      kid.rotation.y = Math.PI / 2 - 0.3;
      scene.add(kid);
    }
    scene.add(hut(-4.5, -2, 0.6));
    scatter(scene, buildTree, [[-6, 3], [-8, -4], [3, -6, 1.1]]);

    // 地平線側に松明の群れ
    const torches: THREE.Mesh[] = [];
    for (let i = 0; i < 9; i++) {
      const torch = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 0), matGlow(0xffa23a, 0xff7a1f, 1.5));
      torch.position.set(13 + (i % 3) * 1.6, 0.9 + (i % 2) * 0.25, -6 + i * 1.4);
      torches.push(torch);
      scene.add(torch);
    }

    return {
      scene,
      camFrom: new THREE.Vector3(-5.2, 2.4, 6.0),
      camTo: new THREE.Vector3(-3.8, 1.7, 4.6),
      lookAt: new THREE.Vector3(2.5, 1.0, 0),
      duration: 16,
      update: (t) => {
        torches.forEach((tor, i) => {
          const s = 1 + Math.sin(t * 9 + i * 2.1) * 0.25;
          tor.scale.setScalar(s);
        });
      },
    };
  }

  /** P4: 夕日へ歩き出す父の背中と、見送る子 */
  private buildFarewell(): DioramaPage {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd97a3e);
    scene.fog = new THREE.Fog(0xd97a3e, 22, 55);
    scene.add(new THREE.HemisphereLight(0xffb877, 0x4a3322, 0.55));
    // 夕日（巨大な円盤）と逆光
    const sunDisc = new THREE.Mesh(
      new THREE.CircleGeometry(7, 40),
      new THREE.MeshBasicMaterial({ color: 0xffc46b }),
    );
    sunDisc.position.set(0, 4.6, -42);
    scene.add(sunDisc);
    const backlight = new THREE.DirectionalLight(0xffa055, 2.0);
    backlight.position.set(0, 6, -30);
    backlight.castShadow = true;
    backlight.shadow.mapSize.set(1024, 1024);
    backlight.shadow.camera.left = -12;
    backlight.shadow.camera.right = 12;
    backlight.shadow.camera.top = 12;
    backlight.shadow.camera.bottom = -12;
    backlight.shadow.camera.far = 80;
    scene.add(backlight, backlight.target);
    ground(scene, 0x6a5638);

    const father = buildOrcRig();
    father.root.position.set(0, 0, -3);
    father.root.rotation.y = Math.PI; // 背中をこちらへ
    scene.add(father.root);

    const kid = buildMinionOrc();
    kid.scale.setScalar(0.42);
    kid.position.set(0.9, 0, 1.6);
    kid.rotation.y = Math.PI; // 父の背を見ている
    scene.add(kid);

    scatter(scene, buildTree, [[-6, -8], [6.5, -10], [-8, 2]]);
    scatter(scene, buildRock, [[3.5, -1], [-3, -4]]);

    return {
      scene,
      camFrom: new THREE.Vector3(0.6, 1.1, 4.6),
      camTo: new THREE.Vector3(0.2, 1.3, 3.0),
      lookAt: new THREE.Vector3(0, 1.6, -8),
      duration: 18,
      update: (t) => {
        // 父はゆっくり夕日へ歩いていく
        father.root.position.z = -3 - (t % 60) * 0.12;
        father.root.position.y = Math.abs(Math.sin(t * 3.4)) * 0.07;
        father.root.rotation.z = Math.sin(t * 3.4) * 0.03;
      },
    };
  }

  /** P5: 決意。こちらを向くオークと、迫る影 */
  private buildResolve(): DioramaPage {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x10150c);
    scene.fog = new THREE.Fog(0x10150c, 8, 26);
    scene.add(new THREE.HemisphereLight(0x3a4a3a, 0x141a10, 0.45));
    const key = new THREE.DirectionalLight(0xff8c3a, 1.3);
    key.position.set(4, 3, 3);
    scene.add(key);
    ground(scene, 0x2c3a26);

    const orc = buildOrcRig();
    orc.root.position.set(0, 0, 0);
    scene.add(orc.root); // 正面（+z）がカメラ側

    // 霧の向こうから迫る勇者の影
    const shadows: THREE.Group[] = [];
    const builders = [buildTrainee, buildAdventurer, buildKnight, buildTrainee, buildAdventurer, buildTrainee];
    builders.forEach((build, i) => {
      const m = build();
      m.position.set((i - 2.5) * 2.4, 0, -10 - (i % 3) * 3);
      m.rotation.y = 0;
      shadows.push(m);
      scene.add(m);
    });
    scatter(scene, buildTree, [[-5, -4], [5.5, -5]]);

    return {
      scene,
      camFrom: new THREE.Vector3(0, 1.7, 4.6),
      camTo: new THREE.Vector3(0, 1.5, 3.2),
      lookAt: new THREE.Vector3(0, 1.5, 0),
      duration: 14,
      update: (t) => {
        orc.root.position.y = Math.sin(t * 1.8) * 0.02; // 静かな呼吸
        for (const [i, s] of shadows.entries()) {
          s.position.z += Math.min(0.012, 0.006 + i * 0.001); // じわじわ迫る
          s.position.y = Math.abs(Math.sin(t * 4 + i)) * 0.06;
        }
      },
    };
  }
}
