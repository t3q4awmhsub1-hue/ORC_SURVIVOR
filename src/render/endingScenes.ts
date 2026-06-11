import * as THREE from 'three';
import { buildMinionOrc, buildOrcRig, buildSword } from '../assets/characters';
import { buildMeat, buildRock, buildTree } from '../assets/props';
import { cyl, group, matGlow } from '../assets/parts';

/**
 * クリア時のエンディングシネマ。自動進行のカット4場面＋タイミング字幕。
 * レターボックスや字幕の表示はUI層（DOM）が担当し、ここは3D描画と進行管理のみ行う。
 */

interface Subtitle {
  at: number;
  text: string;
}

interface EndingScene {
  scene: THREE.Scene;
  camFrom: THREE.Vector3;
  camTo: THREE.Vector3;
  lookAt: THREE.Vector3;
  duration: number;
  subtitles: Subtitle[];
  update?: (t: number) => void;
}

function ground(scene: THREE.Scene, color: number): void {
  const g = new THREE.Mesh(new THREE.CircleGeometry(70, 48), new THREE.MeshLambertMaterial({ color }));
  g.rotation.x = -Math.PI / 2;
  g.receiveShadow = true;
  scene.add(g);
}

function scatterTrees(scene: THREE.Scene, spots: Array<[number, number, number?]>): void {
  for (const [x, z, s] of spots) {
    const t = buildTree();
    t.position.set(x, 0, z);
    t.rotation.y = (x * 3 + z * 7) % 6.28;
    if (s) t.scale.setScalar(s);
    scene.add(t);
  }
}

export class EndingPlayer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly camera: THREE.PerspectiveCamera;
  private scenes: EndingScene[] = [];
  private index = 0;
  private sceneT = 0;
  private shownSubtitles = new Set<string>();
  active = false;

  onSubtitle: ((text: string) => void) | null = null;
  onFinished: (() => void) | null = null;

  constructor(parent: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(44, 16 / 9, 0.1, 140);
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.scenes.length === 0) {
      this.scenes = [this.buildDawn(), this.buildHomeward(), this.buildReunion(), this.buildFeast()];
    }
    this.index = 0;
    this.sceneT = 0;
    this.shownSubtitles.clear();
    this.active = true;
  }

  stop(): void {
    this.active = false;
  }

  render(dt: number): void {
    if (!this.active) return;
    const cur = this.scenes[this.index];
    this.sceneT += dt;

    for (const sub of cur.subtitles) {
      const key = `${this.index}:${sub.at}`;
      if (this.sceneT >= sub.at && !this.shownSubtitles.has(key)) {
        this.shownSubtitles.add(key);
        this.onSubtitle?.(sub.text);
      }
    }

    const k0 = Math.min(1, this.sceneT / cur.duration);
    const k = k0 * k0 * (3 - 2 * k0);
    this.camera.position.lerpVectors(cur.camFrom, cur.camTo, k);
    this.camera.lookAt(cur.lookAt);
    cur.update?.(this.sceneT);
    this.renderer.render(cur.scene, this.camera);

    if (this.sceneT >= cur.duration) {
      this.index++;
      this.sceneT = 0;
      if (this.index >= this.scenes.length) {
        this.active = false;
        this.onFinished?.();
      }
    }
  }

  /** C1: 静寂の戦場に朝が来る */
  private buildDawn(): EndingScene {
    const scene = new THREE.Scene();
    const sky = new THREE.Color(0x1a2438);
    const dawnSky = new THREE.Color(0xe89a5a);
    scene.background = sky.clone();
    scene.fog = new THREE.Fog(sky.clone(), 20, 60);
    const hemi = new THREE.HemisphereLight(0x4a587a, 0x222a1c, 0.5);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffc080, 0.0);
    sun.position.set(0, 3, -20);
    scene.add(sun);
    ground(scene, 0x4a5a3c);

    // 地面に突き立った勇者たちの剣（戦いの跡）
    for (let i = 0; i < 14; i++) {
      const sword = buildSword(1.2 + (i % 3) * 0.25);
      const a = (i / 14) * Math.PI * 2;
      const r = 2.5 + (i % 5);
      sword.position.set(Math.cos(a) * r, 0.55, Math.sin(a) * r * 0.8);
      sword.rotation.set(Math.PI + (((i * 37) % 10) - 5) * 0.06, a, (((i * 53) % 10) - 5) * 0.06);
      scene.add(sword);
    }
    const rocks = buildRock();
    rocks.position.set(-4, 0, -3);
    scene.add(rocks);

    const orc = buildOrcRig();
    orc.root.rotation.y = Math.PI; // 朝日の方角（-z）を向く
    scene.add(orc.root);

    const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(6, 40), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
    sunDisc.position.set(0, -3, -48);
    scene.add(sunDisc);

    return {
      scene,
      camFrom: new THREE.Vector3(3.6, 1.4, 5.2),
      camTo: new THREE.Vector3(-1.8, 2.4, 6.4),
      lookAt: new THREE.Vector3(0, 1.3, -2),
      duration: 9,
      subtitles: [
        { at: 0.6, text: '——夜が、明けた。' },
        { at: 5.0, text: '勇者たちは、二度と森に踏み入らなかった。' },
      ],
      update: (t) => {
        const k = Math.min(1, t / 8);
        (scene.background as THREE.Color).copy(sky).lerp(dawnSky, k);
        scene.fog!.color.copy(scene.background as THREE.Color);
        sunDisc.position.y = -3 + k * 8;
        sun.intensity = k * 1.6;
        hemi.intensity = 0.5 + k * 0.3;
        orc.root.position.y = Math.sin(t * 1.6) * 0.025; // 肩で息をする
        orc.upper.rotation.x = 0.14 + Math.sin(t * 1.6) * 0.02;
      },
    };
  }

  /** C2: 朝の森を、家族のもとへ */
  private buildHomeward(): EndingScene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xb8d4a8);
    scene.fog = new THREE.Fog(0xb8d4a8, 14, 44);
    scene.add(new THREE.HemisphereLight(0xfff4d8, 0x4a6a3a, 1.0));
    const sun = new THREE.DirectionalLight(0xfff0c8, 1.4);
    sun.position.set(5, 12, -6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    scene.add(sun);
    ground(scene, 0x5f8a48);

    // 木漏れ日（光の柱）
    for (const [x, z] of [[-2.5, -4], [1.8, -8], [-1, -13]] as const) {
      const ray = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 1.4, 9, 10, 1, true),
        new THREE.MeshBasicMaterial({
          color: 0xfff7d8, transparent: true, opacity: 0.13,
          side: THREE.DoubleSide, depthWrite: false,
        }),
      );
      ray.position.set(x, 4.5, z);
      ray.rotation.z = 0.25;
      scene.add(ray);
    }
    scatterTrees(scene, [[-3.5, -2], [3.2, -5], [-4, -9], [4.5, -11], [-2.8, -16], [3.6, -18], [-5.5, 1], [5.8, -1]]);

    const orc = buildOrcRig();
    orc.root.rotation.y = Math.PI;
    scene.add(orc.root);

    return {
      scene,
      camFrom: new THREE.Vector3(0.2, 2.4, 6.5),
      camTo: new THREE.Vector3(-0.4, 1.6, 4.0),
      lookAt: new THREE.Vector3(0, 1.2, -6),
      duration: 8,
      subtitles: [
        { at: 0.6, text: '傷だらけの体で、ただ真っ直ぐに。' },
        { at: 4.4, text: '風の向こうに——家族の匂いがした。' },
      ],
      update: (t) => {
        // 少し足を引きずりながら森の奥へ歩いていく
        orc.root.position.z = 1.5 - t * 0.85;
        orc.root.position.y = Math.abs(Math.sin(t * 2.6)) * 0.09;
        orc.root.rotation.z = Math.sin(t * 2.6) * 0.05 + 0.03;
      },
    };
  }

  /** C3: 再会 */
  private buildReunion(): EndingScene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf0c890);
    scene.fog = new THREE.Fog(0xf0c890, 16, 48);
    scene.add(new THREE.HemisphereLight(0xfff0d0, 0x6a5a3a, 0.95));
    const sun = new THREE.DirectionalLight(0xffd9a0, 1.5);
    sun.position.set(-6, 8, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -14;
    sun.shadow.camera.right = 14;
    sun.shadow.camera.top = 14;
    sun.shadow.camera.bottom = -14;
    scene.add(sun);
    ground(scene, 0x7a9a58);
    scatterTrees(scene, [[-6, -8], [6, -9], [-7.5, -1], [7.5, -3], [-4, -14], [5, -15]]);

    const father = buildOrcRig();
    father.root.position.set(0, 0, -9);
    scene.add(father.root);

    const kids: THREE.Group[] = [];
    for (const [x, z, s] of [[-0.9, 2.2, 0.42], [0.8, 2.6, 0.38], [0.1, 3.2, 0.45]] as const) {
      const kid = buildMinionOrc();
      kid.scale.setScalar(s);
      kid.position.set(x, 0, z);
      kid.rotation.y = Math.PI;
      kids.push(kid);
      scene.add(kid);
    }

    return {
      scene,
      camFrom: new THREE.Vector3(2.6, 0.9, 5.0),
      camTo: new THREE.Vector3(1.2, 1.3, 1.8),
      lookAt: new THREE.Vector3(0, 1.0, -3.5),
      duration: 10,
      subtitles: [
        { at: 1.2, text: '「「「とうちゃーー！！」」」' },
        { at: 6.6, text: '「————ただいま。」' },
      ],
      update: (t) => {
        const meet = Math.min(1, t / 6);
        // 父は歩み寄り、子どもたちは駆け出す
        father.root.position.z = -9 + meet * 4.5;
        father.root.position.y = Math.abs(Math.sin(t * 3)) * 0.06 * (1 - meet);
        kids.forEach((kid, i) => {
          const start = [2.2, 2.6, 3.2][i];
          kid.position.z = start - meet * (start + 3.4);
          kid.position.y = Math.abs(Math.sin(t * 7 + i * 1.3)) * 0.16 * (meet < 1 ? 1 : 0.3);
        });
        if (t > 6) {
          // 父が膝を落として抱きとめる
          const crouch = Math.min(1, (t - 6) / 1.2);
          father.root.position.y = -crouch * 0.35;
          father.upper.rotation.x = 0.14 + crouch * 0.4;
          father.armL.rotation.z = 0.18 + crouch * 0.9;
          father.armR.rotation.z = -0.18 - crouch * 0.9;
        }
      },
    };
  }

  /** C4: 約束の肉を、みんなで */
  private buildFeast(): EndingScene {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x281c34);
    scene.fog = new THREE.Fog(0x281c34, 12, 36);
    scene.add(new THREE.HemisphereLight(0x4a3c5a, 0x241c14, 0.5));
    ground(scene, 0x40583a);
    scatterTrees(scene, [[-5, -4], [5.5, -5], [-6, 2], [6, 3], [0, -8]]);

    // 焚き火
    const flameOuter = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.85, 7), matGlow(0xff8c3a, 0xff5a1f, 1.2));
    flameOuter.position.y = 0.5;
    const flameInner = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.55, 6), matGlow(0xffd34d, 0xffb52e, 1.4));
    flameInner.position.y = 0.42;
    const fireLight = new THREE.PointLight(0xff9043, 16, 14, 1.6);
    fireLight.position.y = 1.1;
    const logs = group();
    for (let i = 0; i < 3; i++) {
      const log = cyl(0.07, 0.07, 0.95, 0x5a3a1e, 0, 0.08, 0, 5);
      log.rotation.z = Math.PI / 2;
      log.rotation.y = (i / 3) * Math.PI;
      logs.add(log);
    }
    scene.add(group(logs, flameOuter, flameInner, fireLight));

    // 家族の輪
    const father = buildOrcRig();
    father.root.position.set(-1.6, 0, 0.2);
    father.root.rotation.y = Math.PI / 2.3;
    father.armR.rotation.x = -1.9; // 肉を掲げる
    scene.add(father.root);
    const heldMeat = buildMeat();
    heldMeat.scale.setScalar(0.9);
    heldMeat.position.set(0, -0.78, 0.15);
    father.armR.add(heldMeat);

    const kids: THREE.Group[] = [];
    for (const [x, z, ry, s] of [[0.6, 1.4, -2.0, 0.42], [1.5, 0.2, -1.6, 0.38], [0.9, -1.1, -1.0, 0.45], [-0.4, -1.5, -0.4, 0.4]] as const) {
      const kid = buildMinionOrc();
      kid.scale.setScalar(s);
      kid.position.set(x, 0, z);
      kid.rotation.y = ry;
      kids.push(kid);
      scene.add(kid);
    }

    // 蛍
    const fireflies: THREE.Mesh[] = [];
    for (let i = 0; i < 8; i++) {
      const fly = new THREE.Mesh(new THREE.IcosahedronGeometry(0.05, 0), matGlow(0xc8ff7a, 0x9aff3a, 1.6));
      fireflies.push(fly);
      scene.add(fly);
    }

    return {
      scene,
      camFrom: new THREE.Vector3(2.4, 1.4, 3.4),
      camTo: new THREE.Vector3(4.8, 2.8, 6.4),
      lookAt: new THREE.Vector3(-0.3, 0.9, 0),
      duration: 11,
      subtitles: [
        { at: 1.0, text: '約束の肉は、少しだけ焦げていた。' },
        { at: 5.8, text: 'それでも——世界一の、味がした。' },
      ],
      update: (t) => {
        fireLight.intensity = 15 + Math.sin(t * 11) * 2.4 + Math.sin(t * 23) * 1.2;
        flameOuter.scale.setScalar(1 + Math.sin(t * 9) * 0.08);
        flameInner.scale.setScalar(1 + Math.sin(t * 13 + 1) * 0.12);
        kids.forEach((kid, i) => {
          kid.position.y = Math.abs(Math.sin(t * 3 + i * 1.4)) * 0.07;
        });
        fireflies.forEach((fly, i) => {
          fly.position.set(
            Math.sin(t * 0.4 + i * 2.2) * (3 + i * 0.4),
            1.0 + Math.sin(t * 0.9 + i) * 0.5,
            Math.cos(t * 0.3 + i * 1.7) * (2.5 + i * 0.3),
          );
          const tw = (Math.sin(t * 3.5 + i * 2.6) + 1) / 2;
          fly.scale.setScalar(0.6 + tw * 0.8);
        });
      },
    };
  }
}
