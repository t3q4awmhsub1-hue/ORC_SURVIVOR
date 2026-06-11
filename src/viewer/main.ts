import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import {
  buildOrc, buildMinionOrc, buildTrainee, buildAdventurer,
  buildArcher, buildMage, buildKnight, buildPaladin, buildHero,
} from '../assets/characters';
import { buildGem, buildMeat, buildPig, buildTree, buildRock } from '../assets/props';

interface Entry {
  name: string;
  build: () => THREE.Group;
  labelY: number;
  spin?: boolean;
}

const CHARACTERS: Entry[] = [
  { name: 'オーク（あなた）', build: buildOrc, labelY: 2.5 },
  { name: '子分オーク', build: buildMinionOrc, labelY: 1.7 },
  { name: '見習い剣士', build: buildTrainee, labelY: 2.1 },
  { name: '冒険者', build: buildAdventurer, labelY: 2.1 },
  { name: 'アーチャー', build: buildArcher, labelY: 2.1 },
  { name: 'メイジ', build: buildMage, labelY: 2.3 },
  { name: 'ナイト', build: buildKnight, labelY: 2.2 },
  { name: 'パラディン', build: buildPaladin, labelY: 2.6 },
  { name: '真の勇者', build: buildHero, labelY: 3.0 },
];

const PROPS: Entry[] = [
  { name: '経験値ジェム', build: buildGem, labelY: 1.0, spin: true },
  { name: '肉', build: buildMeat, labelY: 1.0 },
  { name: 'ブタ', build: buildPig, labelY: 1.3 },
  { name: '木', build: buildTree, labelY: 2.2 },
  { name: '岩', build: buildRock, labelY: 1.0 },
];

// --- シーン基盤 -------------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9ed1e8);
scene.fog = new THREE.Fog(0x9ed1e8, 25, 60);

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 4.5, 11);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.setSize(innerWidth, innerHeight);
labelRenderer.domElement.style.position = 'fixed';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
document.body.appendChild(labelRenderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI / 2.05;
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xbfd9ff, 0x6a8a4f, 0.9));
const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
sun.position.set(6, 12, 5);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -14;
sun.shadow.camera.right = 14;
sun.shadow.camera.top = 14;
sun.shadow.camera.bottom = -14;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(20, 48),
  new THREE.MeshLambertMaterial({ color: 0x78a85a }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// --- モデル配置 -------------------------------------------------------------
const spinners: THREE.Group[] = [];

function placeRow(entries: Entry[], z: number, spacing: number): void {
  const offset = ((entries.length - 1) * spacing) / 2;
  entries.forEach((entry, i) => {
    const model = entry.build();
    model.position.set(i * spacing - offset, 0, z);
    scene.add(model);
    spinners.push(model);

    const div = document.createElement('div');
    div.className = 'label';
    div.textContent = entry.name;
    const label = new CSS2DObject(div);
    label.position.set(0, entry.labelY, 0);
    model.add(label);
  });
}

placeRow(CHARACTERS, 0, 1.9);
placeRow(PROPS, 3.2, 1.9);

// 検品用フック（ビューワー専用。ゲーム本体には含めない）
let spinning = true;
Object.assign(window as { __viewer?: unknown }, {
  __viewer: {
    camera,
    controls,
    spinners,
    setSpinning: (v: boolean) => { spinning = v; },
    resetRotation: () => { for (const m of spinners) m.rotation.y = 0; },
  },
});

// --- ループ -----------------------------------------------------------------
const clock = new THREE.Clock();

function tick(): void {
  requestAnimationFrame(tick);
  const dt = clock.getDelta();
  if (spinning) for (const m of spinners) m.rotation.y += dt * 0.5;
  controls.update();
  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
tick();

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  labelRenderer.setSize(innerWidth, innerHeight);
});
