import * as THREE from 'three';
import {
  buildAdventurer, buildArcher, buildHero, buildKnight, buildMage,
  buildOrcRig, buildPaladin, buildTrainee, type OrcRig, type OrcVariant,
} from '../assets/characters';
import { buildChest, buildMeat, buildPig, buildRock, buildTree } from '../assets/props';
import { ARENA_RADIUS, CHEST_CAP, ENEMY_CAP, GEM_CAP, STAGES, type ChestTier, type StageId } from '../game/config';
import { mulberry32, range } from '../game/rng';
import type { GameEvent, GameWorld } from '../game/world';
import { makeInstanced } from './bake';

const INSTANCED_KINDS = ['trainee', 'adventurer', 'archer', 'mage', 'knight', 'paladin'] as const;
type InstancedKind = (typeof INSTANCED_KINDS)[number];

const ENEMY_BUILDERS: Record<InstancedKind, () => THREE.Group> = {
  trainee: buildTrainee,
  adventurer: buildAdventurer,
  archer: buildArcher,
  mage: buildMage,
  knight: buildKnight,
  paladin: buildPaladin,
};

interface Particle {
  active: boolean; x: number; y: number; z: number;
  vx: number; vy: number; vz: number; life: number; maxLife: number;
  color: THREE.Color;
}

interface Popup {
  active: boolean; wx: number; wz: number; t: number;
  text: string; color: string; size: number;
}

interface RingFx { mesh: THREE.Mesh; t: number; dur: number; maxR: number }

const PARTICLE_CAP = 512;
const POPUP_CAP = 80;

export class GameRenderer {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly popupCanvas: HTMLCanvasElement;
  private readonly popupCtx: CanvasRenderingContext2D;

  private readonly sun: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;
  private groundMat!: THREE.MeshLambertMaterial;
  private treeMesh!: THREE.InstancedMesh;
  private rockMesh!: THREE.InstancedMesh;
  private grassMesh!: THREE.InstancedMesh;
  private mountainMat!: THREE.MeshLambertMaterial;
  private playerRig: OrcRig;
  private playerClub: THREE.Object3D | null = null;
  private readonly minionRigs: OrcRig[] = [];
  private bossModel: THREE.Group | null = null;
  private readonly telegraphRing: THREE.Mesh;

  private readonly enemyMeshes = new Map<InstancedKind, THREE.InstancedMesh>();
  private readonly chestMeshes = new Map<ChestTier, THREE.InstancedMesh>();
  private rainbowMat: THREE.MeshLambertMaterial | null = null;
  private readonly gemMesh: THREE.InstancedMesh;
  private readonly meatMesh: THREE.InstancedMesh;
  private readonly pigMesh: THREE.InstancedMesh;
  private readonly projMeshes: Record<'bone' | 'arrow' | 'bolt', THREE.InstancedMesh>;
  private readonly particleMesh: THREE.InstancedMesh;
  private readonly particles: Particle[] = [];
  private readonly popups: Popup[] = [];
  private readonly rings: RingFx[] = [];
  private readonly wedge: THREE.Mesh;
  private wedgeT = 1;
  private readonly beam: THREE.Mesh;
  private beamT = 1;

  private readonly dummy = new THREE.Object3D();
  private readonly flashColor = new THREE.Color(0xff5544);
  private readonly whiteColor = new THREE.Color(0xffffff);

  private elapsed = 0;
  private swingT = 1;
  private stompT = 1;
  private shake = 0;
  private attractAngle = 0.6;

  constructor(parent: HTMLElement) {
    this.scene.background = new THREE.Color(0x9ed1e8);
    this.scene.fog = new THREE.Fog(0x9ed1e8, 40, 95);

    this.camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 160);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(innerWidth, innerHeight);
    // モバイルGPUでは解像度を抑えてフレームレートを優先する
    const coarsePointer = matchMedia('(pointer: coarse)').matches;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, coarsePointer ? 1.5 : 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    parent.appendChild(this.renderer.domElement);

    // ダメージ数字用の2Dオーバーレイ
    this.popupCanvas = document.createElement('canvas');
    Object.assign(this.popupCanvas.style, {
      position: 'fixed', inset: '0', pointerEvents: 'none', zIndex: '5',
    } as CSSStyleDeclaration);
    parent.appendChild(this.popupCanvas);
    this.popupCtx = this.popupCanvas.getContext('2d')!;

    // ライト
    this.hemi = new THREE.HemisphereLight(0xbfd9ff, 0x6a8a4f, 0.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    const sc = this.sun.shadow.camera;
    sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18;
    sc.far = 60;
    this.scene.add(this.sun, this.sun.target);

    // 地面とアリーナ境界（プロシージャルなまだら模様で平面の単調さを消す）
    this.groundMat = new THREE.MeshLambertMaterial({ color: 0x6f9c54, map: this.makeGroundTexture() });
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(ARENA_RADIUS + 25, 64),
      this.groundMat,
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const edge = new THREE.Mesh(
      new THREE.RingGeometry(ARENA_RADIUS - 0.25, ARENA_RADIUS + 0.35, 96),
      new THREE.MeshBasicMaterial({ color: 0x4a3528, transparent: true, opacity: 0.7 }),
    );
    edge.rotation.x = -Math.PI / 2;
    edge.position.y = 0.02;
    this.scene.add(edge);

    this.scatterDecorations();

    // プレイヤー
    this.playerRig = buildOrcRig();
    this.playerClub = this.playerRig.root.getObjectByName('club') ?? null;
    this.scene.add(this.playerRig.root);

    // 敵（種類ごとにベイク + InstancedMesh）
    for (const kind of INSTANCED_KINDS) {
      const mesh = makeInstanced(ENEMY_BUILDERS[kind](), ENEMY_CAP);
      // 被弾フラッシュ用にinstanceColorを確保
      mesh.setColorAt(0, this.whiteColor);
      this.enemyMeshes.set(kind, mesh);
      this.scene.add(mesh);
    }

    // 回収物・弾・ブタ
    this.gemMesh = new THREE.InstancedMesh(
      new THREE.IcosahedronGeometry(0.17, 0),
      new THREE.MeshLambertMaterial({ color: 0x3ddc6a, emissive: 0x1faa4a, emissiveIntensity: 0.8 }),
      GEM_CAP,
    );
    this.gemMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.gemMesh.frustumCulled = false;
    this.scene.add(this.gemMesh);

    this.meatMesh = makeInstanced(buildMeat(), 30);
    this.scene.add(this.meatMesh);
    this.pigMesh = makeInstanced(buildPig(), 12);
    this.scene.add(this.pigMesh);

    // 宝箱（tierごとにInstancedMesh。虹は発光マテリアルで色相を回す）
    const chestDefs: Array<[ChestTier, number, number]> = [
      ['wood', 0x8a5a2b, 0x5a3a1a],
      ['silver', 0xcfd6dd, 0x8a939e],
      ['gold', 0xd9a92f, 0x9a7218],
      ['rainbow', 0xffffff, 0xffe97a],
    ];
    for (const [tier, base, trim] of chestDefs) {
      const mesh = makeInstanced(buildChest(base, trim), CHEST_CAP);
      if (tier === 'rainbow') {
        const m = mesh.material as THREE.MeshLambertMaterial;
        m.emissive = new THREE.Color(0xff00ff);
        m.emissiveIntensity = 0.55;
        this.rainbowMat = m;
      }
      this.chestMeshes.set(tier, mesh);
      this.scene.add(mesh);
    }

    this.projMeshes = {
      bone: makeInstanced(this.buildBoneModel(), 64),
      arrow: makeInstanced(this.buildArrowModel(), 96),
      bolt: new THREE.InstancedMesh(
        new THREE.IcosahedronGeometry(0.18, 0),
        new THREE.MeshLambertMaterial({ color: 0xc176ff, emissive: 0x8a2be2, emissiveIntensity: 1.2 }),
        96,
      ),
    };
    this.projMeshes.bolt.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.projMeshes.bolt.frustumCulled = false;
    for (const m of Object.values(this.projMeshes)) this.scene.add(m);

    // パーティクル
    this.particleMesh = new THREE.InstancedMesh(
      new THREE.TetrahedronGeometry(0.13, 0),
      new THREE.MeshBasicMaterial({ vertexColors: false }),
      PARTICLE_CAP,
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.setColorAt(0, this.whiteColor);
    this.scene.add(this.particleMesh);
    for (let i = 0; i < PARTICLE_CAP; i++) {
      this.particles.push({
        active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
        life: 0, maxLife: 1, color: new THREE.Color(),
      });
    }
    for (let i = 0; i < POPUP_CAP; i++) {
      this.popups.push({ active: false, wx: 0, wz: 0, t: 0, text: '', color: '#fff', size: 16 });
    }

    // リングエフェクト（地団駄など）
    for (let i = 0; i < 6; i++) {
      const mesh = new THREE.Mesh(
        new THREE.TorusGeometry(1, 0.1, 6, 32),
        new THREE.MeshBasicMaterial({ color: 0xd8c27a, transparent: true, opacity: 0 }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.rings.push({ mesh, t: 1, dur: 0.45, maxR: 3 });
    }

    // 雄叫びの扇形
    this.wedge = new THREE.Mesh(
      new THREE.CircleGeometry(1, 20),
      new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    this.wedge.rotation.x = -Math.PI / 2;
    this.wedge.visible = false;
    this.scene.add(this.wedge);

    // レベルアップの光柱
    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.9, 0.9, 7, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x7dffa0, transparent: true, opacity: 0, side: THREE.DoubleSide }),
    );
    this.beam.visible = false;
    this.scene.add(this.beam);

    // ボスの突進予告リング
    this.telegraphRing = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1.2, 32),
      new THREE.MeshBasicMaterial({ color: 0xff3030, transparent: true, opacity: 0 }),
    );
    this.telegraphRing.rotation.x = -Math.PI / 2;
    this.telegraphRing.visible = false;
    this.scene.add(this.telegraphRing);

    this.resize();
    addEventListener('resize', () => this.resize());
  }

  private buildBoneModel(): THREE.Group {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0xefe8d8, flatShading: true });
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.4, 5), mat);
    shaft.rotation.z = Math.PI / 2;
    const k1 = new THREE.Mesh(new THREE.IcosahedronGeometry(0.09, 0), mat);
    k1.position.x = -0.2;
    const k2 = k1.clone();
    k2.position.x = 0.2;
    g.add(shaft, k1, k2);
    return g;
  }

  private buildArrowModel(): THREE.Group {
    const g = new THREE.Group();
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.55, 4),
      new THREE.MeshLambertMaterial({ color: 0x8a6a3a, flatShading: true }),
    );
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.14, 4),
      new THREE.MeshLambertMaterial({ color: 0xcfd6dd, flatShading: true }),
    );
    tip.rotation.x = Math.PI / 2;
    tip.position.z = 0.32;
    g.add(shaft, tip);
    return g;
  }

  /** 草地のまだら・土の斑点をCanvasで生成（グレースケール: ステージ色が乗算される） */
  private makeGroundTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, size, size);
    const rng = mulberry32(4242);
    for (let i = 0; i < 420; i++) {
      const v = 235 + Math.floor(rng() * 40) - 20; // 明暗のゆらぎ
      ctx.fillStyle = `rgba(${v},${v},${v},0.5)`;
      const r = 3 + rng() * 14;
      ctx.beginPath();
      ctx.arc(rng() * size, rng() * size, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // 草の短いストローク
    ctx.strokeStyle = 'rgba(210,220,205,0.35)';
    for (let i = 0; i < 240; i++) {
      const x = rng() * size;
      const y = rng() * size;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rng() - 0.5) * 4, y - 3 - rng() * 4);
      ctx.stroke();
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    return tex;
  }

  /** プレイヤーの見た目をキャラクターに合わせて差し替える */
  setCharacter(variant: OrcVariant): void {
    this.scene.remove(this.playerRig.root);
    this.playerRig = buildOrcRig(variant);
    this.playerClub = this.playerRig.root.getObjectByName('club') ?? null;
    this.scene.add(this.playerRig.root);
  }

  /** ステージの配色テーマを適用する */
  setStage(id: StageId): void {
    const s = STAGES[id];
    (this.scene.background as THREE.Color).setHex(s.sky);
    this.scene.fog!.color.setHex(s.sky);
    this.groundMat.color.setHex(s.ground);
    this.sun.color.setHex(s.sun);
    this.hemi.color.setHex(s.hemiSky);
    this.hemi.groundColor.setHex(s.hemiGround);
    (this.treeMesh.material as THREE.MeshLambertMaterial).color.setHex(s.treeTint);
    (this.rockMesh.material as THREE.MeshLambertMaterial).color.setHex(s.rockTint);
    // 草は基本色(緑)にステージ色を乗算（白だと素のコーンが見えてしまう）
    (this.grassMesh.material as THREE.MeshLambertMaterial).color
      .setHex(0x4f8f3a)
      .multiply(new THREE.Color(s.treeTint));
    this.mountainMat.color.setHex(s.mountain);
  }

  private scatterDecorations(): void {
    const rng = mulberry32(7777);
    const treeMesh = makeInstanced(buildTree(), 40);
    const rockMesh = makeInstanced(buildRock(), 26);
    this.treeMesh = treeMesh;
    this.rockMesh = rockMesh;
    treeMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    rockMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    let t = 0;
    let r = 0;
    for (let i = 0; i < 120 && (t < 40 || r < 26); i++) {
      const angle = rng() * Math.PI * 2;
      const dist = range(rng, 9, ARENA_RADIUS + 14);
      this.dummy.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      this.dummy.rotation.set(0, rng() * Math.PI * 2, 0);
      const s = range(rng, 0.8, 1.5);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      if (rng() < 0.6 && t < 40) treeMesh.setMatrixAt(t++, this.dummy.matrix);
      else if (r < 26) rockMesh.setMatrixAt(r++, this.dummy.matrix);
    }
    treeMesh.count = t;
    rockMesh.count = r;

    // 草むら（小さな茂みを散らして地面に変化を付ける）
    const grass = new THREE.InstancedMesh(
      new THREE.ConeGeometry(0.14, 0.34, 5),
      new THREE.MeshLambertMaterial({ color: 0x4f8f3a, flatShading: true }),
      140,
    );
    grass.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    for (let i = 0; i < 140; i++) {
      const angle = rng() * Math.PI * 2;
      const dist = 2 + rng() * (ARENA_RADIUS + 16);
      this.dummy.position.set(Math.cos(angle) * dist, 0.12, Math.sin(angle) * dist);
      this.dummy.rotation.set((rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.4);
      this.dummy.scale.set(1 + rng(), 0.8 + rng() * 0.8, 1 + rng());
      this.dummy.updateMatrix();
      grass.setMatrixAt(i, this.dummy.matrix);
    }
    grass.receiveShadow = true;
    this.grassMesh = grass;

    // 遠景の山並み（霧の向こうにシルエット）
    this.mountainMat = new THREE.MeshLambertMaterial({ color: 0x4f7058, flatShading: true });
    const mountains = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2 + rng() * 0.4;
      const dist = 78 + rng() * 14;
      const m = new THREE.Mesh(new THREE.ConeGeometry(10 + rng() * 9, 9 + rng() * 9, 5), this.mountainMat);
      m.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);
      m.rotation.y = rng() * Math.PI;
      mountains.add(m);
    }

    this.dummy.scale.setScalar(1);
    this.dummy.rotation.set(0, 0, 0);
    this.scene.add(treeMesh, rockMesh, grass, mountains);
  }

  resize(): void {
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(innerWidth, innerHeight);
    this.popupCanvas.width = innerWidth;
    this.popupCanvas.height = innerHeight;
  }

  // --- イベント → 演出 -------------------------------------------------------
  handleEvent(e: GameEvent, world: GameWorld): void {
    switch (e.type) {
      case 'clubSwing':
        this.swingT = 0;
        break;
      case 'stomp':
        this.stompT = 0;
        this.spawnRing(e.x!, e.z!, e.value!, 0xd8c27a);
        break;
      case 'roar':
        this.showWedge(world, e.value!);
        break;
      case 'kill':
        this.burst(e.x!, 0.8, e.z!, e.kind === 'hero' ? 40 : 10, 0xff8866);
        if (e.kind === 'hero') this.shake = Math.max(this.shake, 1.2);
        break;
      case 'levelup':
        this.beamT = 0;
        this.burst(world.px, 1, world.pz, 24, 0x7dffa0);
        break;
      case 'hit':
        if (e.value! > 0) this.addPopup(e.x!, e.z!, String(e.value), e.value! >= 40 ? '#ffd34d' : '#ffffff', e.value! >= 40 ? 22 : 15);
        break;
      case 'hurt':
        this.addPopup(world.px, world.pz, `-${e.value}`, '#ff5555', 20);
        this.shake = Math.max(this.shake, 0.35);
        break;
      case 'meat':
        this.addPopup(world.px, world.pz, `+${Math.round(e.value!)}`, '#6dff6d', 18);
        break;
      case 'bossSpawn':
        this.shake = Math.max(this.shake, 0.8);
        break;
      case 'chest':
        this.burst(e.x ?? world.px, 0.7, e.z ?? world.pz, 14,
          e.kind === 'gold' ? 0xffd34d : e.kind === 'silver' ? 0xdfe6ee : 0xc89a5a);
        break;
      case 'relic':
        this.burst(e.x ?? world.px, 1.0, e.z ?? world.pz, 60, 0xff7af0);
        this.burst(e.x ?? world.px, 1.2, e.z ?? world.pz, 30, 0x7af0ff);
        this.beamT = 0;
        this.shake = Math.max(this.shake, 0.5);
        break;
      case 'evolve':
        this.burst(world.px, 1.2, world.pz, 70, 0xffb52e);
        this.burst(world.px, 0.8, world.pz, 35, 0xff5a1f);
        this.spawnRing(world.px, world.pz, 5, 0xffb52e);
        this.beamT = 0;
        this.shake = Math.max(this.shake, 0.7);
        break;
      case 'bossDash':
        this.shake = Math.max(this.shake, 0.5);
        break;
      default:
        break;
    }
  }

  private spawnRing(x: number, z: number, maxR: number, color: number): void {
    const ring = this.rings.find((r) => r.t >= 1);
    if (!ring) return;
    ring.t = 0;
    ring.maxR = maxR;
    ring.mesh.position.set(x, 0.1, z);
    (ring.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
    ring.mesh.visible = true;
  }

  private showWedge(world: GameWorld, rangeR: number): void {
    this.wedgeT = 0;
    const arc = Math.PI * 0.7;
    this.wedge.geometry.dispose();
    this.wedge.geometry = new THREE.CircleGeometry(rangeR, 20, Math.PI / 2 - arc / 2, arc);
    this.wedge.position.set(world.px, 0.12, world.pz);
    // CircleGeometryは+Y上向きに寝かせた状態で+Z方向が基準になるよう回転を合わせる
    this.wedge.rotation.set(-Math.PI / 2, 0, -Math.atan2(world.facingX, world.facingZ));
    this.wedge.visible = true;
  }

  private burst(x: number, y: number, z: number, count: number, color: number): void {
    let made = 0;
    for (const p of this.particles) {
      if (made >= count) break;
      if (p.active) continue;
      p.active = true;
      p.x = x; p.y = y; p.z = z;
      const a = Math.random() * Math.PI * 2;
      const up = Math.random();
      const sp = 2 + Math.random() * 4;
      p.vx = Math.cos(a) * sp * (1 - up * 0.5);
      p.vz = Math.sin(a) * sp * (1 - up * 0.5);
      p.vy = 2 + up * 5;
      p.maxLife = p.life = 0.5 + Math.random() * 0.4;
      p.color.setHex(color).offsetHSL(0, 0, (Math.random() - 0.5) * 0.2);
      made++;
    }
  }

  private addPopup(wx: number, wz: number, text: string, color: string, size: number): void {
    const p = this.popups.find((p) => !p.active);
    if (!p) return;
    p.active = true;
    p.wx = wx + (Math.random() - 0.5) * 0.6;
    p.wz = wz;
    p.t = 0;
    p.text = text;
    p.color = color;
    p.size = size;
  }

  // --- 毎フレーム描画 ---------------------------------------------------------
  render(world: GameWorld, dt: number, attract = false): void {
    this.elapsed += dt;
    this.updatePlayer(world, dt);
    this.updateEnemies(world);
    this.updateMinions(world);
    this.updateBoss(world);
    this.updateInstancedPools(world);
    this.updateFx(dt);
    if (attract) {
      this.updateAttractCamera(world, dt);
    } else {
      this.updateCamera(world, dt);
    }
    this.renderer.render(this.scene, this.camera);
    this.drawPopups(dt);
  }

  /** タイトル用: プレイヤーの周りをゆっくり旋回するカメラ */
  private updateAttractCamera(world: GameWorld, dt: number): void {
    this.attractAngle += dt * 0.1;
    const r = 12;
    this.camera.position.set(
      world.px + Math.cos(this.attractAngle) * r,
      6.0,
      world.pz + Math.sin(this.attractAngle) * r,
    );
    this.camera.lookAt(world.px, 1.4, world.pz);
    this.sun.position.set(world.px + 8, 16, world.pz + 6);
    this.sun.target.position.set(world.px, 0, world.pz);
  }

  private updatePlayer(world: GameWorld, dt: number): void {
    const rig = this.playerRig;
    rig.root.position.set(world.px, 0, world.pz);
    rig.root.rotation.y = Math.atan2(world.facingX, world.facingZ);
    // 歩行バウンス
    if (world.moving) {
      rig.root.position.y = Math.abs(Math.sin(this.elapsed * 9)) * 0.12;
      rig.root.rotation.z = Math.sin(this.elapsed * 9) * 0.05;
    } else {
      rig.root.rotation.z = 0;
    }
    // 棍棒スイング
    if (this.swingT < 1) {
      this.swingT = Math.min(1, this.swingT + dt / 0.28);
      rig.armR.rotation.x = -0.45 - Math.sin(this.swingT * Math.PI) * 1.3;
      rig.upper.rotation.y = Math.sin(this.swingT * Math.PI) * 0.5;
    } else {
      rig.upper.rotation.y = 0;
    }
    // 地団駄
    if (this.stompT < 1) {
      this.stompT = Math.min(1, this.stompT + dt / 0.3);
      const squash = 1 - Math.sin(this.stompT * Math.PI) * 0.18;
      rig.root.scale.set(2 - squash, squash, 2 - squash);
    } else {
      rig.root.scale.setScalar(1);
    }
    rig.root.visible = world.state !== 'lost';
    // 進化した棍棒は巨大化する
    this.playerClub?.scale.setScalar(world.evolved.has('club') ? 1.7 : 1.1);
  }

  private updateEnemies(world: GameWorld): void {
    const counts = new Map<InstancedKind, number>();
    for (const kind of INSTANCED_KINDS) counts.set(kind, 0);

    for (let i = 0; i < world.enemies.length; i++) {
      const e = world.enemies[i];
      if (!e.active || e.kind === 'hero') continue;
      const kind = e.kind as InstancedKind;
      const mesh = this.enemyMeshes.get(kind)!;
      const idx = counts.get(kind)!;
      const bob = Math.abs(Math.sin(this.elapsed * 8 + i * 1.7)) * 0.08;
      this.dummy.position.set(e.x, e.stun > 0 ? 0 : bob, e.z);
      this.dummy.rotation.set(
        e.stun > 0 ? -0.25 : 0,
        Math.atan2(e.facingX, e.facingZ),
        Math.sin(this.elapsed * 8 + i * 1.7) * 0.06,
      );
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(idx, this.dummy.matrix);
      mesh.setColorAt(idx, e.flash > 0 ? this.flashColor : this.whiteColor);
      counts.set(kind, idx + 1);
    }
    for (const kind of INSTANCED_KINDS) {
      const mesh = this.enemyMeshes.get(kind)!;
      mesh.count = counts.get(kind)!;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  private updateMinions(world: GameWorld): void {
    while (this.minionRigs.length < world.minions.length) {
      const rig = buildOrcRig();
      rig.root.scale.setScalar(0.62);
      this.minionRigs.push(rig);
      this.scene.add(rig.root);
    }
    const minionScale = world.evolved.has('minion') ? 0.8 : 0.62; // 戦士団は一回り大きい
    this.minionRigs.forEach((rig, i) => {
      const m = world.minions[i];
      if (!m) {
        rig.root.visible = false;
        return;
      }
      rig.root.visible = true;
      rig.root.scale.setScalar(minionScale);
      rig.root.position.set(m.x, Math.abs(Math.sin(this.elapsed * 10 + i * 2)) * 0.08, m.z);
      rig.root.rotation.y = Math.atan2(m.facingX, m.facingZ);
    });
  }

  private updateBoss(world: GameWorld): void {
    const boss = world.bossIndex >= 0 ? world.enemies[world.bossIndex] : null;
    const visible = !!boss && boss.active && boss.kind === 'hero';
    if (visible && !this.bossModel) {
      this.bossModel = buildHero();
      this.scene.add(this.bossModel);
    }
    if (this.bossModel) this.bossModel.visible = visible;
    if (!visible || !boss || !this.bossModel) {
      this.telegraphRing.visible = false;
      return;
    }
    this.bossModel.position.set(boss.x, Math.abs(Math.sin(this.elapsed * 7)) * 0.1, boss.z);
    this.bossModel.rotation.y = Math.atan2(boss.facingX, boss.facingZ);
    this.bossModel.rotation.x = world.bossState === 'dash' ? 0.45 : 0;

    const telegraph = world.bossState === 'telegraph';
    this.telegraphRing.visible = telegraph;
    if (telegraph) {
      this.telegraphRing.position.set(boss.x, 0.08, boss.z);
      const pulse = 1 + Math.sin(this.elapsed * 18) * 0.15;
      this.telegraphRing.scale.setScalar(pulse * 1.4);
      (this.telegraphRing.material as THREE.MeshBasicMaterial).opacity = 0.5 + Math.sin(this.elapsed * 18) * 0.3;
    }
  }

  private updateInstancedPools(world: GameWorld): void {
    // ジェム
    let gi = 0;
    for (const g of world.gems) {
      if (!g.active) continue;
      this.dummy.position.set(g.x, 0.35 + Math.sin(this.elapsed * 4 + g.x) * 0.08, g.z);
      this.dummy.rotation.set(0, this.elapsed * 2 + g.x, 0);
      this.dummy.scale.setScalar(Math.min(1.6, 1 + g.value * 0.02));
      this.dummy.updateMatrix();
      this.gemMesh.setMatrixAt(gi++, this.dummy.matrix);
    }
    this.gemMesh.count = gi;
    this.gemMesh.instanceMatrix.needsUpdate = true;

    // 肉
    let mi = 0;
    for (const m of world.meats) {
      if (!m.active) continue;
      this.dummy.position.set(m.x, Math.sin(this.elapsed * 3 + m.x) * 0.05, m.z);
      this.dummy.rotation.set(0, this.elapsed + m.x, 0);
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      this.meatMesh.setMatrixAt(mi++, this.dummy.matrix);
    }
    this.meatMesh.count = mi;
    this.meatMesh.instanceMatrix.needsUpdate = true;

    // 宝箱
    const chestCounts = new Map<ChestTier, number>();
    for (const c of world.chests) {
      if (!c.active) continue;
      const mesh = this.chestMeshes.get(c.tier)!;
      const idx = chestCounts.get(c.tier) ?? 0;
      this.dummy.position.set(c.x, 0.06 + Math.abs(Math.sin(this.elapsed * 3 + c.x)) * 0.07, c.z);
      this.dummy.rotation.set(0, Math.sin(this.elapsed * 1.5 + c.z) * 0.3, 0);
      this.dummy.scale.setScalar(c.tier === 'rainbow' ? 1.25 : 1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(idx, this.dummy.matrix);
      chestCounts.set(c.tier, idx + 1);
    }
    for (const [tier, mesh] of this.chestMeshes) {
      mesh.count = chestCounts.get(tier) ?? 0;
      mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.rainbowMat) {
      this.rainbowMat.emissive.setHSL((this.elapsed * 0.35) % 1, 0.85, 0.55);
    }

    // ブタ
    let pi = 0;
    for (const p of world.pigs) {
      if (!p.active) continue;
      this.dummy.position.set(p.x, Math.abs(Math.sin(this.elapsed * 14 + p.x)) * 0.15, p.z);
      this.dummy.rotation.set(0, Math.atan2(p.vx, p.vz), 0);
      this.dummy.scale.setScalar(1.2);
      this.dummy.updateMatrix();
      this.pigMesh.setMatrixAt(pi++, this.dummy.matrix);
    }
    this.pigMesh.count = pi;
    this.pigMesh.instanceMatrix.needsUpdate = true;

    // 弾
    const counts = { bone: 0, arrow: 0, bolt: 0 };
    for (const p of world.projectiles) {
      if (!p.active) continue;
      const mesh = this.projMeshes[p.kind];
      this.dummy.position.set(p.x, 0.9, p.z);
      if (p.kind === 'bone') {
        this.dummy.rotation.set(this.elapsed * 9, this.elapsed * 7, 0);
      } else {
        this.dummy.rotation.set(0, Math.atan2(p.vx, p.vz), 0);
      }
      this.dummy.scale.setScalar(1);
      this.dummy.updateMatrix();
      mesh.setMatrixAt(counts[p.kind]++, this.dummy.matrix);
    }
    for (const kind of ['bone', 'arrow', 'bolt'] as const) {
      this.projMeshes[kind].count = counts[kind];
      this.projMeshes[kind].instanceMatrix.needsUpdate = true;
    }
  }

  private updateFx(dt: number): void {
    // パーティクル
    let pi = 0;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.vy -= 12 * dt;
      if (p.y < 0.05) p.y = 0.05;
      const s = Math.max(0.05, p.life / p.maxLife);
      this.dummy.position.set(p.x, p.y, p.z);
      this.dummy.rotation.set(p.life * 9, p.life * 7, 0);
      this.dummy.scale.setScalar(s);
      this.dummy.updateMatrix();
      this.particleMesh.setMatrixAt(pi, this.dummy.matrix);
      this.particleMesh.setColorAt(pi, p.color);
      pi++;
    }
    this.particleMesh.count = pi;
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;

    // リング
    for (const r of this.rings) {
      if (r.t >= 1) continue;
      r.t = Math.min(1, r.t + dt / r.dur);
      const radius = 0.5 + (r.maxR - 0.5) * r.t;
      r.mesh.scale.set(radius, radius, 1);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.7 * (1 - r.t);
      if (r.t >= 1) r.mesh.visible = false;
    }

    // 扇形
    if (this.wedgeT < 1) {
      this.wedgeT = Math.min(1, this.wedgeT + dt / 0.3);
      (this.wedge.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - this.wedgeT);
      if (this.wedgeT >= 1) this.wedge.visible = false;
    }

    // 光柱
    if (this.beamT < 1) {
      this.beamT = Math.min(1, this.beamT + dt / 0.6);
      this.beam.visible = true;
      this.beam.position.set(this.playerRig.root.position.x, 3.5, this.playerRig.root.position.z);
      this.beam.scale.set(1 + this.beamT * 0.6, 1, 1 + this.beamT * 0.6);
      (this.beam.material as THREE.MeshBasicMaterial).opacity = 0.5 * (1 - this.beamT);
      if (this.beamT >= 1) this.beam.visible = false;
    }
  }

  private updateCamera(world: GameWorld, dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 2.5);
    const sx = (Math.random() - 0.5) * this.shake * 0.6;
    const sz = (Math.random() - 0.5) * this.shake * 0.6;
    this.camera.position.set(world.px + sx, 17, world.pz + 11 + sz);
    this.camera.lookAt(world.px + sx, 0, world.pz + sz);
    this.sun.position.set(world.px + 8, 16, world.pz + 6);
    this.sun.target.position.set(world.px, 0, world.pz);
  }

  private drawPopups(dt: number): void {
    const ctx = this.popupCtx;
    ctx.clearRect(0, 0, this.popupCanvas.width, this.popupCanvas.height);
    const v = new THREE.Vector3();
    for (const p of this.popups) {
      if (!p.active) continue;
      p.t += dt;
      if (p.t > 0.7) {
        p.active = false;
        continue;
      }
      v.set(p.wx, 1.6 + p.t * 1.6, p.wz).project(this.camera);
      if (v.z > 1) continue;
      const x = (v.x * 0.5 + 0.5) * this.popupCanvas.width;
      const y = (-v.y * 0.5 + 0.5) * this.popupCanvas.height;
      const alpha = p.t < 0.5 ? 1 : 1 - (p.t - 0.5) / 0.2;
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.font = `bold ${p.size}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,20,30,0.9)';
      ctx.strokeText(p.text, x, y);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, x, y);
    }
    ctx.globalAlpha = 1;
  }
}
