import * as THREE from 'three';

/** Draws many copies of a multi-part model with one InstancedMesh per part. */
export class Instancer {
  readonly group = new THREE.Group();
  private parts: { mesh: THREE.InstancedMesh; local: THREE.Matrix4 }[] = [];
  private count = 0;
  private m = new THREE.Matrix4();

  constructor(model: THREE.Object3D, private capacity: number, opts: { shadows?: boolean; sway?: { value: number } } = {}) {
    model.updateMatrixWorld(true);
    model.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      let material = o.material as THREE.Material;
      if (opts.sway && o.name === 'canopy') material = swayMaterial(material, opts.sway);
      const mesh = new THREE.InstancedMesh(o.geometry, material, capacity);
      mesh.castShadow = opts.shadows ?? true;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.parts.push({ mesh, local: o.matrixWorld.clone() });
      this.group.add(mesh);
    });
  }
  reset() { this.count = 0; for (const p of this.parts) p.mesh.count = 0; }
  add(x: number, y: number, z: number, rotY = 0, scale = 1, color?: THREE.Color, scaleY = scale) {
    if (this.count >= this.capacity) return;
    const base = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), new THREE.Vector3(scale, scaleY, scale));
    for (const p of this.parts) {
      p.mesh.setMatrixAt(this.count, this.m.multiplyMatrices(base, p.local));
      if (color) p.mesh.setColorAt(this.count, color);
    }
    this.count++;
  }
  /** Rail-style instance: stretched along local x between two points. */
  addSpan(ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
    if (this.count >= this.capacity) return;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), new THREE.Vector3(dx / len, dy / len, dz / len));
    const base = new THREE.Matrix4().compose(new THREE.Vector3((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2), q, new THREE.Vector3(len, 1, 1));
    for (const p of this.parts) p.mesh.setMatrixAt(this.count, this.m.multiplyMatrices(base, p.local));
    this.count++;
  }
  commit() {
    for (const p of this.parts) {
      p.mesh.count = this.count;
      p.mesh.instanceMatrix.needsUpdate = true;
      if (p.mesh.instanceColor) p.mesh.instanceColor.needsUpdate = true;
    }
  }
  setShadows(on: boolean) { for (const p of this.parts) p.mesh.castShadow = on; }
}

/** Gentle wind sway for tree canopies, done in the vertex shader. */
function swayMaterial(base: THREE.Material, time: { value: number }) {
  const m = base.clone();
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 1.3;
        transformed.x += sin(uTime * 1.6 + ph) * 0.06 * max(position.y + 0.2, 0.0);
        transformed.z += cos(uTime * 1.2 + ph) * 0.04 * max(position.y + 0.2, 0.0);
      #endif`,
    );
  };
  return m;
}
