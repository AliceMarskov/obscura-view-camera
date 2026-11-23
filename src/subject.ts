import * as THREE from 'three';

/**
 * Millimetres, y up. The entrance pupil of the neutral camera sits at the
 * origin looking towards -z. Empty focus.* nodes lie on the visible surfaces.
 */
export function createSubject(): THREE.Group {
  const subject = new THREE.Group();
  subject.name = 'Architectural still life';
  const stoneGrain = mineralGrain();

  const stone = (color: number, roughness = 0.88) =>
    new THREE.MeshStandardMaterial({
      color,
      roughness,
      map: stoneGrain,
      bumpMap: stoneGrain,
      bumpScale: 0.32,
    });

  const slabMaterial = stone(0xc6beb0);
  const stairMaterial = stone(0xd6c7b0);
  const archMaterial = stone(0xede1cb);
  const clay = stone(0xc2704b, 0.84);
  const graphite = stone(0x424b47, 0.59);

  function mesh(
    geometry: THREE.BufferGeometry,
    material: THREE.Material,
    name: string,
  ): THREE.Mesh {
    const object = new THREE.Mesh(geometry, material);
    object.name = name;
    object.castShadow = true;
    object.receiveShadow = true;
    subject.add(object);
    return object;
  }

  function focalMark(
    object: THREE.Object3D,
    name: string,
    x: number,
    y: number,
    z: number,
  ) {
    const mark = new THREE.Object3D();
    mark.name = name;
    mark.position.set(x, y, z);
    object.add(mark);
  }

  // A low continuous slab picks up the contact shadows of all three subjects.
  const deckShape = new THREE.Shape();
  deckShape.moveTo(-267, -234);
  deckShape.lineTo(267, -234);
  deckShape.lineTo(267, 234);
  deckShape.lineTo(-267, 234);
  deckShape.closePath();
  const deckGeometry = block(deckShape, 10, 2);
  deckGeometry.rotateX(-Math.PI / 2);
  const deck = mesh(deckGeometry, slabMaterial, 'subject.plinth');
  deck.position.set(0, -158, -1027);
  const deckTop = -146;

  // Continuous annular portal profile. Its opening really passes through
  // the solid; silhouettes, contact shadows and focus rays use the same mesh.
  const arch = new THREE.Shape();
  const spring = 181;
  const outer = 130;
  const inner = 66;
  arch.moveTo(-outer, 0);
  arch.lineTo(-outer, spring);
  arch.absarc(0, spring, outer, Math.PI, 0, true);
  arch.lineTo(outer, 0);
  arch.lineTo(inner, 0);
  arch.lineTo(inner, spring);
  arch.absarc(0, spring, inner, 0, Math.PI, false);
  arch.lineTo(-inner, 0);
  arch.closePath();
  const portal = mesh(block(arch, 78, 2.2), archMaterial, 'subject.arch');
  portal.position.set(28, deckTop + 2.2, -1176);
  portal.rotation.y = -Math.PI / 18;
  focalMark(portal, 'focus.arch', -18, spring + outer - 21, 80.2);

  // Rounded shoulder and foot, plus shallow wheel-thrown ridges. The body is
  // turned from a single profile, including the slightly inset flat top.
  const radius = 65;
  const height = 222;
  const clayProfile = [
    new THREE.Vector2(0, 0),
    new THREE.Vector2(radius - 4, 0),
    new THREE.Vector2(radius - 1.5, 1.3),
    new THREE.Vector2(radius, 3.4),
  ];
  for (let y = 5; y < height - 5; y += 2) {
    const taper = 1.3 * (1 - y / height);
    const ring = 0.48 * Math.cos((y * Math.PI * 2) / 8);
    clayProfile.push(new THREE.Vector2(radius - taper + ring, y));
  }
  clayProfile.push(
    new THREE.Vector2(radius + 0.35, height - 3),
    new THREE.Vector2(radius - 0.15, height - 1.2),
    new THREE.Vector2(radius - 1.7, height),
    new THREE.Vector2(radius - 4.1, height - 0.3),
    new THREE.Vector2(0, height - 0.3),
  );
  const clayGeometry = new THREE.LatheGeometry(clayProfile, 96);
  const clayUv = clayGeometry.getAttribute('uv');
  for (let i = 0; i < clayUv.count; i++) {
    clayUv.setXY(i, 6 * clayUv.getX(i), 3 * clayUv.getY(i));
  }
  const column = mesh(clayGeometry, clay, 'subject.cylinder');
  column.position.set(-138, deckTop, -956);
  const middle = clayProfile.find((point) => point.y === 121)!;
  focalMark(column, 'focus.cylinder', 0, middle.y, middle.x);

  // A monolithic staircase recedes toward the right side of the portal.
  // Its risers provide repeating detail at known, successively greater depths.
  const steps = 6;
  const run = 36;
  const rise = 19.5;
  const stairProfile = new THREE.Shape();
  stairProfile.moveTo(0, 0);
  for (let i = 0; i < steps; i++) {
    stairProfile.lineTo(i * run, (i + 1) * rise);
    stairProfile.lineTo((i + 1) * run, (i + 1) * rise);
  }
  stairProfile.lineTo(steps * run, 0);
  stairProfile.closePath();
  const stair = mesh(block(stairProfile, 90, 0.85), stairMaterial, 'subject.steps');
  stair.rotation.y = Math.PI / 2;
  stair.position.set(163, deckTop + 0.85, -956);

  const ballRadius = 41;
  const ball = mesh(
    new THREE.SphereGeometry(ballRadius, 64, 40),
    graphite,
    'subject.sphere',
  );
  ball.position.set(108, deckTop + ballRadius, -853);
  focalMark(ball, 'focus.sphere', 0, 0, ballRadius);
  return subject;
}

function block(shape: THREE.Shape, depth: number, bevel: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 48,
    steps: 1,
  });
  // ExtrudeGeometry uses profile millimetres as UVs. Project all sides in
  // millimetres so the stone inclusions keep their scale around the portal.
  const positions = geometry.getAttribute('position');
  const normals = geometry.getAttribute('normal');
  const uv = geometry.getAttribute('uv');
  const tile = 73;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(normals.getX(i));
    const ny = Math.abs(normals.getY(i));
    const nz = Math.abs(normals.getZ(i));
    const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
    if (nz >= nx && nz >= ny) uv.setXY(i, x / tile, y / tile);
    else if (nx >= ny) uv.setXY(i, z / tile, y / tile);
    else uv.setXY(i, x / tile, z / tile);
  }
  return geometry;
}

/** Seeded, tileable mineral grain; runs in a browser or in headless Node. */
function mineralGrain(): THREE.DataTexture {
  const side = 128;
  const pixels = new Uint8Array(side * side * 4);
  let state = 27;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const i = 4 * (x + side * y);
      const vein = 2.8 * Math.sin((y / side) * 4 * Math.PI +
        0.72 * Math.cos((x / side) * 2 * Math.PI));
      const grain = Math.round(244 + vein + (random() - 0.5) * 14);
      pixels.set([grain, grain, grain, 255], i);
    }
  }
  for (let p = 0; p < 180; p++) {
    const x = Math.floor(random() * side), y = Math.floor(random() * side);
    const length = 1 + Math.floor(random() * 5);
    const tone = 201 + Math.floor(random() * 31);
    for (let n = 0; n < length; n++) {
      const i = 4 * (((x + n) % side) + side * y);
      pixels.set([tone, tone, tone, 255], i);
    }
  }
  const map = new THREE.DataTexture(pixels, side, side, THREE.RGBAFormat);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true;
  map.needsUpdate = true;
  return map;
}
