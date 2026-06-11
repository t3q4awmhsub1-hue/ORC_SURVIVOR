import * as THREE from 'three';

// マテリアルは色ごとに共有してドローコール削減と省メモリを図る
const matCache = new Map<string, THREE.MeshLambertMaterial>();

export function mat(color: number): THREE.MeshLambertMaterial {
  const key = `c${color}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({ color, flatShading: true });
    matCache.set(key, m);
  }
  return m;
}

export function matGlow(color: number, emissive: number, intensity = 0.9): THREE.MeshLambertMaterial {
  const key = `g${color}-${emissive}-${intensity}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshLambertMaterial({
      color,
      emissive,
      emissiveIntensity: intensity,
      flatShading: true,
    });
    matCache.set(key, m);
  }
  return m;
}

function finish(mesh: THREE.Mesh, x: number, y: number, z: number): THREE.Mesh {
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

export function box(
  w: number, h: number, d: number, color: number,
  x = 0, y = 0, z = 0,
): THREE.Mesh {
  return finish(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color)), x, y, z);
}

export function cyl(
  rTop: number, rBot: number, h: number, color: number,
  x = 0, y = 0, z = 0, radial = 8,
): THREE.Mesh {
  return finish(new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, h, radial), mat(color)), x, y, z);
}

export function cone(
  r: number, h: number, color: number,
  x = 0, y = 0, z = 0, radial = 8,
): THREE.Mesh {
  return finish(new THREE.Mesh(new THREE.ConeGeometry(r, h, radial), mat(color)), x, y, z);
}

export function ball(
  r: number, color: number,
  x = 0, y = 0, z = 0, detail = 1,
): THREE.Mesh {
  return finish(new THREE.Mesh(new THREE.IcosahedronGeometry(r, detail), mat(color)), x, y, z);
}

export function group(...children: THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const c of children) g.add(c);
  return g;
}
