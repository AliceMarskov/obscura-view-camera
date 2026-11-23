import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const up = new THREE.Vector3(0, 1, 0);
type Material = THREE.MeshStandardMaterial;

function finish(color: number, roughness: number, metalness = 0): Material {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

// The long grain runs along each timber. Using a small data texture also lets
// the model be instantiated in Node for geometry tests without a DOM.
function walnut(): Material {
  const width = 128, height = 64;
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = 2 * Math.PI * x / width, t = 2 * Math.PI * y / height;
      const grain = Math.sin(t * 8 + 0.9 * Math.sin(s) + 0.3 * Math.sin(s * 3 + t));
      const pores = Math.pow(Math.max(0, Math.sin(t * 22 + 1.1 * Math.cos(s + t))), 5);
      const d = 10 * grain - 10 * pores + 3 * Math.sin(3 * t + s);
      const i = (y * width + x) * 4;
      pixels[i] = 128 + d;
      pixels[i + 1] = 90 + d * 0.78;
      pixels[i + 2] = 64 + d * 0.52;
      pixels[i + 3] = 255;
    }
  }
  const map = new THREE.DataTexture(pixels, width, height, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.43, map });
}

function addMesh(parent: THREE.Group, geometry: THREE.BufferGeometry, material: Material,
                 x: number, y: number, z: number): THREE.Mesh {
  const part = new THREE.Mesh(geometry, material);
  part.position.set(x, y, z);
  parent.add(part);
  return part;
}

function box(parent: THREE.Group, material: Material, x: number, y: number, z: number,
             w: number, h: number, d: number): THREE.Mesh {
  return addMesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
}

function cylinder(parent: THREE.Group, material: Material, x: number, y: number, z: number,
                  radius: number, depth: number, axis: 'x' | 'y' | 'z', segments = 32): THREE.Mesh {
  const part = addMesh(parent, new THREE.CylinderGeometry(radius, radius, depth, segments), material, x, y, z);
  if (axis === 'x') part.rotation.z = Math.PI / 2;
  if (axis === 'z') part.rotation.x = Math.PI / 2;
  return part;
}

function tube(parent: THREE.Group, material: Material, a: THREE.Vector3, b: THREE.Vector3,
              radiusA: number, radiusB: number, sides = 12) {
  const geometry = new THREE.CylinderGeometry(radiusB, radiusA, a.distanceTo(b), sides);
  const mesh = addMesh(parent, geometry, material, 0, 0, 0);
  mesh.position.addVectors(a, b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(up, new THREE.Vector3().subVectors(b, a).normalize());
}

function ring(parent: THREE.Group, material: Material, z: number, radius: number, wire: number) {
  addMesh(parent, new THREE.TorusGeometry(radius, wire, 8, 56), material, 0, 0, z);
}

function knob(parent: THREE.Group, material: Material, trim: Material,
              x: number, y: number, z: number, radius: number, sign: number) {
  cylinder(parent, material, x, y, z, radius, 7, 'x');
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const tooth = box(parent, material, x, y + radius * Math.cos(a), z + radius * Math.sin(a),
                      6.5, 1.1, 1.2);
    tooth.rotation.x = a;
  }
  cylinder(parent, trim, x + sign * 3.6, y, z, radius * 0.47, 0.8, 'x');
}

// Bake static details by material so a screw, dial tooth or engraved tick does
// not cost its own draw call. Each moving assembly keeps its own rigid frame.
function bake(parent: THREE.Group) {
  const parts = new Map<Material, THREE.BufferGeometry[]>();
  for (const item of [...parent.children]) {
    if (!(item instanceof THREE.Mesh)) continue;
    item.updateMatrix();
    const geometry = item.geometry as THREE.BufferGeometry;
    geometry.applyMatrix4(item.matrix);
    geometry.clearGroups();
    const material = item.material as Material;
    const set = parts.get(material) ?? [];
    set.push(geometry);
    parts.set(material, set);
    parent.remove(item);
  }
  for (const [material, geometries] of parts) {
    const combined = mergeGeometries(geometries, false);
    if (!combined) throw new Error('Could not assemble the view camera geometry');
    const mesh = new THREE.Mesh(combined, material);
    mesh.castShadow = mesh.receiveShadow = true;
    parent.add(mesh);
    for (const geometry of geometries) geometry.dispose();
  }
}

type RingPoint = readonly [number, number];
const pleatOutline: RingPoint[] = [
  [-0.92, 1], [0.92, 1], [1, 0.92], [1, -0.92],
  [0.92, -1], [-0.92, -1], [-1, -0.92], [-1, 0.92],
];

function makeBellows() {
  const rings = 25;
  const facets = pleatOutline.length;
  const vertices = new Float32Array((rings - 1) * facets * 6 * 3);
  const geometry = new THREE.BufferGeometry();
  const attribute = new THREE.BufferAttribute(vertices, 3).setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute('position', attribute);
  const shades = new Float32Array(vertices.length);
  for (let r = 0; r < rings - 1; r++) {
    for (let j = 0; j < facets; j++) {
      for (const [k, ring] of [r, r + 1, r + 1, r, r + 1, r].entries()) {
        const offset = ((r * facets + j) * 6 + k) * 3;
        shades.fill(ring % 2 ? 1 : .75, offset, offset + 3);
      }
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(shades, 3));
  const leather = finish(0x393637, 0.82, 0.015);
  leather.flatShading = leather.vertexColors = true;
  leather.side = THREE.DoubleSide;
  const mesh = new THREE.Mesh(geometry, leather);
  mesh.name = 'Leather bellows';
  mesh.castShadow = mesh.receiveShadow = true;
  const points = Array.from({ length: rings * facets }, () => new THREE.Vector3());
  const start = new THREE.Vector3(), end = new THREE.Vector3();
  function update(front: THREE.Matrix4, rear: THREE.Matrix4) {
    for (let r = 0; r < rings; r++) {
      const t = r / (rings - 1);
      const pleat = r % 2 === 1 ? 6 : 0;
      for (let j = 0; j < facets; j++) {
        const [x, y] = pleatOutline[j];
        start.set(x * (58 + pleat), y * (54 + pleat), 9).applyMatrix4(front);
        end.set(x * (73 + pleat), y * (64 + pleat), -27.5).applyMatrix4(rear);
        points[r * facets + j].lerpVectors(start, end, t);
      }
    }
    let offset = 0;
    for (let r = 0; r < rings - 1; r++) {
      for (let j = 0; j < facets; j++) {
        const k = (j + 1) % facets;
        const a = r * facets + j, b = r * facets + k, c = b + facets, d = a + facets;
        for (const index of [a, d, c, a, c, b]) {
          points[index].toArray(vertices, offset);
          offset += 3;
        }
      }
    }
    attribute.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
  }
  return { mesh, update };
}

/** Technically scaled 4×5 field/monorail camera. All distances are mm.
 *  The optical axis points toward -Z. Inputs map the optical centre and
 *  ground-glass centre, respectively, from their local frame to camera space.
 */
/** Small velvet focusing cloth. Its creased, closed rear curtain really
 * occludes the ground glass; none of the scene imagery is baked onto it. */
function darkCloth() {
  const group = new THREE.Group();
  group.name = 'Focusing cloth';
  group.userData.standard = 'rear';
  const velvet = finish(0x17161a, .98);
  velvet.side = THREE.DoubleSide;
  const points: number[] = [], uv: number[] = [], triangles: number[] = [];
  const columns = 32, rows = 21;
  // The upper part catches on the rail, the free end drops over the glass.
  for (let j = 0; j <= rows; j++) for (let i = 0; i <= columns; i++) {
    const t = j / rows, s = i / columns * 2 - 1;
    const ripple = Math.cos(s * 16 + t * 4) + .38 * Math.cos(s * 27 - t * 3);
    const over = Math.min(t / .32, 1), down = Math.max(0, (t - .32) / .68);
    const x = s * (82 + 13 * t) + down * Math.sin(s * 5) * 3;
    const y = 81 - 17 * Math.pow(Math.abs(s), 3) - down * (145 + 16 * Math.cos(s * 2.1)) + 3.3 * ripple;
    const z = -2 + over * 34 + down * (34 + ripple * 9);
    points.push(x, y, z); uv.push(i / columns, t);
    if (i < columns && j < rows) {
      const q = j * (columns + 1) + i;
      triangles.push(q, q + columns + 1, q + 1, q + 1, q + columns + 1, q + columns + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(triangles); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, velvet);
  mesh.castShadow = mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}

export function createCameraModel() {
  const group = new THREE.Group();
  group.name = '4×5 technical camera';
  const bodyAssembly = new THREE.Group();
  bodyAssembly.name = 'Camera above tripod head';
  group.add(bodyAssembly);
  const frame = finish(0x383e3d, 0.38, 0.44);
  const paint = finish(0x202625, 0.44, 0.24);
  const rubber = finish(0x252927, 0.9);
  const alloy = finish(0xb3b8b3, 0.32, 0.62);
  const brass = finish(0xd2ad72, 0.26, 0.78);
  const marks = finish(0xc7c6b3, 0.6);
  const wood = walnut();
  const glass = finish(0x27484a, 0.16, 0.42);
  const barrel = new THREE.Group();
  barrel.name = 'Interchangeable lens barrel';
  const holder = new THREE.Group();
  holder.name = 'Revolving film holder';
  holder.userData.standard = 'rear';
  const cloth = darkCloth();
  const matte = finish(0xbcb7aa, 0.83);
  const grid = finish(0x898579, 0.8);

  const fixed = new THREE.Group();
  fixed.name = 'Focusing rail';
  fixed.userData.control = 'extension';
  box(fixed, frame, 0, -130, 100, 22, 16, 350);
  for (const side of [-1, 1]) {
    box(fixed, alloy, side * 11.2, -127, 100, 1, 3, 342);
    box(fixed, paint, 0, -130, 100 + side * 175, 25, 19, 4);
  }
  box(fixed, frame, 0, -144, 90, 43, 23, 39);
  knob(fixed, paint, alloy, 25, -143, 90, 9, 1);
  bake(fixed);
  bodyAssembly.add(fixed);
  const extensionRail = box(bodyAssembly, alloy, 0, -129, 273, 14, 10, 1);
  extensionRail.userData.control = 'extension';
  const tripod = new THREE.Group();
  tripod.name = 'Fixed tripod';
  cylinder(tripod, paint, 0, -162, 90, 24, 12, 'y');
  cylinder(tripod, alloy, 0, -169, 90, 23, 2, 'y');
  cylinder(tripod, frame, 0, -180, 90, 21, 21, 'y');
  const hub = new THREE.Vector3(0, -185, 90);
  bake(tripod);
  group.add(tripod);
  const legs = new THREE.Group();
  group.add(legs);
  let floorLevel = 0;
  function setGround(y: number) {
    if (floorLevel === y) return;
    floorLevel = y;
    for (const part of legs.children) (part as THREE.Mesh).geometry.dispose();
    legs.clear();
    const spread = (hub.y - y) * .36;
    for (let i = 0; i < 3; i++) {
    const angle = (i / 3) * Math.PI * 2 + 0.42;
    const axis = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
    const top = hub.clone().addScaledVector(axis, 14);
    const foot = new THREE.Vector3(spread * axis.x, y + 6, 90 + spread * axis.z);
    const latch = top.clone().lerp(foot, .59);
    tube(legs, frame, top, latch, 12.6, 10.4);
    tube(legs, alloy, latch, foot, 8, 6.7);
    tube(legs, paint, latch.clone().lerp(top, .04), latch.clone().lerp(foot, .04), 13, 13);
    cylinder(legs, rubber, foot.x, foot.y - 1, foot.z, 9, 10, 'y');
    }
    bake(legs);
  }
  setGround(-1550);

  function standard(which: 'front' | 'rear', width: number, height: number) {
    const body = new THREE.Group();
    body.name = which === 'front' ? 'Lens standard' : 'Film standard';
    body.userData.standard = which;
    body.matrixAutoUpdate = false;
    const outerX = width / 2, outerY = height / 2;
    // Back hardware is built from the board datum; the exposed surface of
    // the glass, 16.95 mm behind that datum, must land on optical z = 0.
    const boardZ = which === 'rear' ? -16.95 : 0;
    box(body, frame, 0, 0, 0, width - 5, height - 5, 13);
    for (const s of [-1, 1]) {
      box(body, wood, 0, s * (outerY - 5), 0, width, 10, 21);
      const upright = box(body, wood, s * (outerX - 5), 0, 0, height - 20, 10, 21);
      upright.rotation.z = Math.PI / 2;
      for (const t of [-1, 1]) {
        for (const side of [-1, 1]) {
          cylinder(body, brass, s * (outerX - 6), t * (outerY - 5), side * 10.8, 1.7, 0.9, 'z', 12);
        }
      }
      cylinder(body, alloy, s * (outerX + 2), 0, 0, 9.5, 5, 'x');
      knob(body, paint, brass, s * (outerX + 8), 0, 0, 8.5, s);
    }
    if (which === 'front') {
      box(body, paint, 0, 0, -8.7, 99, 99, 5);
      for (const s of [-1, 1]) {
        box(body, alloy, s * 36, 48, -12, 18, 3, 2);
        cylinder(body, brass, s * 45, -45, -11.5, 1.8, 1.5, 'z', 12);
      }
      const lensPartsStart = body.children.length;
      cylinder(body, frame, 0, 0, -13, 34, 5, 'z', 56);
      cylinder(body, paint, 0, 0, -21, 29, 14, 'z', 56);
      cylinder(body, alloy, 0, 0, -26, 28.9, 1.4, 'z', 56);
      cylinder(body, frame, 0, 0, -32, 26.7, 10, 'z', 56);
      cylinder(body, paint, 0, 0, -40, 29.6, 10, 'z', 56);
      for (let i = 0; i < 40; i++) {
        const a = i * Math.PI / 20;
        const mark = box(body, frame, 29.5 * Math.cos(a), 29.5 * Math.sin(a), -40, 1.2, 1.7, 7);
        mark.rotation.z = a;
      }
      ring(body, alloy, -45.1, 28.6, 0.65);
      cylinder(body, rubber, 0, 0, -45.2, 24.9, 1.4, 'z', 56);
      const optic = addMesh(body, new THREE.SphereGeometry(1, 40, 16), glass, 0, 0, -45.2);
      optic.scale.set(21, 21, 2.5);
      ring(body, frame, -46.1, 22.1, 1.15);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 1.25 - 1;
        const mark = box(body, marks, 32 * Math.sin(a), 32 * Math.cos(a), -15.6, 0.8, i % 3 === 0 ? 3 : 1.6, 0.8);
        mark.rotation.z = -a;
      }
      const lever = box(body, alloy, 27, -20, -19, 17, 3.2, 2.6);
      lever.rotation.z = -0.7;
      for (const part of body.children.slice(lensPartsStart)) {
        part.position.z += 12;
        barrel.add(part);
      }
      bake(barrel);
      barrel.position.z = -12;
      body.add(barrel);
    } else {
      box(holder, paint, 0, 0, 10.5, 145, 121, 11);
      box(holder, matte, 0, 0, 16.45, 120, 96, 1);
      for (const x of [-40, -20, 0, 20, 40]) box(holder, grid, x, 0, 17.04, 0.36, 96, 0.12);
      for (const y of [-32, -16, 0, 16, 32]) box(holder, grid, 0, y, 17.04, 120, 0.36, 0.12);
      for (const s of [-1, 1]) {
        box(holder, frame, s * 64, 0, 17.6, 7, 108, 5.5);
        box(holder, frame, 0, s * 51.5, 17.6, 122, 6.5, 5.5);
        box(holder, brass, s * 72, 0, 12.7, 4, 42, 3);
      }
      bake(holder);
      body.add(holder, cloth);
    }
    for (const part of body.children) part.position.z += boardZ;
    bake(body);
    bodyAssembly.add(body);

    const carriage = new THREE.Group();
    carriage.userData.standard = which;
    box(carriage, frame, 0, -120, 0, 41, 19, 34);
    box(carriage, alloy, 0, -109, 0, 59, 4, 27);
    knob(carriage, paint, brass, 25, -120, 0, 9, 1);
    bake(carriage);
    const riseBed = new THREE.Group();
    riseBed.userData.standard = which;
    box(riseBed, paint, 0, -104, 0, width + 14, 9, 14);
    for (const side of [-1, 1]) box(riseBed, alloy, side * (outerX + 4), -99, 0, 8, 12, 14);
    bake(riseBed);
    bodyAssembly.add(carriage, riseBed);
    const arms = [-1, 1].map(() => {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(6, 1, 11), frame);
      arm.castShadow = arm.receiveShadow = true;
      arm.userData.standard = which;
      bodyAssembly.add(arm);
      return arm;
    });
    const pivot = new THREE.Vector3(), base = new THREE.Vector3(), direction = new THREE.Vector3();
    function move(matrix: THREE.Matrix4) {
      body.matrix.copy(matrix);
      body.matrixWorldNeedsUpdate = true;
      pivot.set(0, 0, boardZ).applyMatrix4(matrix);
      const { x, z } = pivot;
      carriage.position.z = z;
      riseBed.position.set(x, 0, z);
      for (let i = 0; i < arms.length; i++) {
        const side = i * 2 - 1;
        base.set(x + side * (outerX + 4), -99, z);
        pivot.set(side * (outerX + 4), 0, boardZ).applyMatrix4(matrix);
        direction.subVectors(pivot, base);
        arms[i].position.addVectors(base, pivot).multiplyScalar(0.5);
        arms[i].scale.y = direction.length();
        arms[i].quaternion.setFromUnitVectors(up, direction.normalize());
      }
    }
    return move;
  }

  const moveFront = standard('front', 142, 138);
  const moveRear = standard('rear', 170, 151);
  const bellows = makeBellows();
  bodyAssembly.add(bellows.mesh);
  function update(front: THREE.Matrix4, rear: THREE.Matrix4, portrait = false) {
    holder.rotation.z = portrait ? Math.PI / 2 : 0;
    // The collar follows the turning back while the cloth keeps its hanging folds.
    cloth.scale.set(portrait ? .89 : 1, portrait ? 1.13 : 1, 1);
    moveFront(front);
    moveRear(rear);
    bellows.update(front, rear);
    const length = Math.max(0, rear.elements[14] - 257);
    extensionRail.visible = length > 0;
    extensionRail.scale.z = Math.max(1, length);
    extensionRail.position.z = 273 + length / 2;
  }
  update(new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(0, 0, 156));
  function setLens(focal: number) {
    const radius = focal <= 90 ? 1.16 : focal >= 210 ? 1.09 : 1;
    barrel.scale.set(radius, radius, focal <= 90 ? .76 : focal >= 210 ? 1.48 : 1);
  }
  return { group, bodyAssembly, update, setLens, setGround };
}
