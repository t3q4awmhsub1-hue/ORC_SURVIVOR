import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * パーツ組み立てのGroupを頂点カラー付きの単一ジオメトリに焼き込む。
 * InstancedMeshで大量描画するための前処理（タイプごとに1ドローコール）。
 */
export function bakeGroupGeometry(root: THREE.Object3D): THREE.BufferGeometry {
  root.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  const color = new THREE.Color();

  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geo = (mesh.geometry as THREE.BufferGeometry).toNonIndexed();
    geo.applyMatrix4(mesh.matrixWorld);

    const mat = mesh.material as THREE.MeshLambertMaterial;
    color.copy(mat.color);
    // 発光マテリアルはベイク後に光らないため、色を明るく寄せて代用する
    if (mat.emissive && (mat.emissive.r + mat.emissive.g + mat.emissive.b) > 0) {
      color.lerp(mat.emissive, 0.5).multiplyScalar(1.4);
    }
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = Math.min(1, color.r);
      colors[i * 3 + 1] = Math.min(1, color.g);
      colors[i * 3 + 2] = Math.min(1, color.b);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.deleteAttribute('uv'); // 不要 & 属性集合をそろえてマージ可能にする
    geos.push(geo);
  });

  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  return merged;
}

export function bakedMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
}

/** ベイク済みジオメトリからInstancedMeshを作る共通ヘルパー */
export function makeInstanced(
  source: THREE.Object3D,
  capacity: number,
): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(bakeGroupGeometry(source), bakedMaterial(), capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.count = 0;
  mesh.castShadow = true;
  mesh.frustumCulled = false; // インスタンスが広域に散るため個別カリングは無効
  return mesh;
}
