import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Piece } from "../engine/room";

type XYZ = [number, number, number];
type Surface = THREE.Material | THREE.Material[];

export function surface(color: THREE.ColorRepresentation, roughness = 0.75) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

export function solid(
  parent: THREE.Object3D,
  geometry: THREE.BufferGeometry,
  material: Surface,
  position: XYZ = [0, 0, 0],
) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

export function box(
  parent: THREE.Object3D,
  size: XYZ,
  position: XYZ,
  material: Surface,
  radius = 0,
) {
  return solid(
    parent,
    radius
      ? new RoundedBoxGeometry(
          ...size,
          3,
          Math.min(radius, ...size.map((v) => v / 2)),
        )
      : new THREE.BoxGeometry(...size),
    material,
    position,
  );
}

/** A rounded footprint independent of slab thickness (unlike a bevelled box). */
export function slab(
  parent: THREE.Object3D,
  width: number,
  depth: number,
  thickness: number,
  radius: number,
  position: XYZ,
  material: Surface,
) {
  const x = -width / 2;
  const y = -depth / 2;
  const r = Math.min(radius, width / 2, depth / 2);
  const shape = new THREE.Shape();
  shape.moveTo(x + r, y);
  shape.lineTo(x + width - r, y);
  shape.quadraticCurveTo(x + width, y, x + width, y + r);
  shape.lineTo(x + width, y + depth - r);
  shape.quadraticCurveTo(x + width, y + depth, x + width - r, y + depth);
  shape.lineTo(x + r, y + depth);
  shape.quadraticCurveTo(x, y + depth, x, y + depth - r);
  shape.lineTo(x, y + r);
  shape.quadraticCurveTo(x, y, x + r, y);
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: false,
    curveSegments: 10,
    steps: 1,
  });
  geometry.rotateX(-Math.PI / 2);
  return solid(parent, geometry, material, position);
}

export function rod(
  parent: THREE.Object3D,
  start: XYZ,
  end: XYZ,
  radius: number,
  material: Surface,
  topRadius = radius,
) {
  const a = new THREE.Vector3(...start);
  const b = new THREE.Vector3(...end);
  const direction = b.clone().sub(a);
  const mesh = solid(
    parent,
    new THREE.CylinderGeometry(topRadius, radius, direction.length(), 12),
    material,
  );
  mesh.position.copy(a.add(b).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    direction.normalize(),
  );
  return mesh;
}

function piping(
  parent: THREE.Object3D,
  points: XYZ[],
  material: Surface,
  radius = 0.004,
) {
  return solid(
    parent,
    new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p))),
      32,
      radius,
      5,
      false,
    ),
    material,
  );
}

function cushion(
  parent: THREE.Object3D,
  size: XYZ,
  position: XYZ,
  material: Surface,
  rotation: XYZ = [0, 0, 0],
) {
  const pillow = box(
    parent,
    size,
    position,
    material,
    Math.min(...size) * 0.44,
  );
  pillow.rotation.set(...rotation);
  return pillow;
}

function sofa(group: THREE.Group, color: string) {
  const fabric = surface(color, 0.94);
  const lighter = surface(
    new THREE.Color(color).lerp(new THREE.Color("#ecd6bd"), 0.13),
    1,
  );
  const seam = surface(new THREE.Color(color).multiplyScalar(0.78), 1);
  const oak = surface("#69503b");
  for (const x of [-0.91, 0.91])
    for (const z of [-0.3, 0.3]) {
      rod(group, [x, 0, z], [x * 0.95, 0.18, z * 0.94], 0.033, oak, 0.043);
    }
  box(group, [2.12, 0.22, 0.82], [0, 0.24, 0], fabric, 0.075);
  cushion(group, [2.02, 0.48, 0.19], [0, 0.54, -0.35], fabric, [-0.065, 0, 0]);
  for (const x of [-1, 1]) {
    cushion(group, [0.2, 0.4, 0.87], [x, 0.4, 0.015], fabric);
  }
  for (const x of [-0.48, 0.48]) {
    cushion(group, [0.94, 0.17, 0.66], [x, 0.405, 0.085], lighter);
    cushion(group, [0.93, 0.34, 0.17], [x, 0.6, -0.22], lighter, [-0.11, 0, 0]);
    piping(
      group,
      [
        [x - 0.4, 0.41, 0.415],
        [x, 0.403, 0.42],
        [x + 0.4, 0.41, 0.415],
      ],
      seam,
    );
  }
  cushion(
    group,
    [0.33, 0.31, 0.13],
    [-0.73, 0.58, -0.025],
    surface("#e1d6bd", 1),
    [-0.19, 0.14, -0.16],
  );
  cushion(
    group,
    [0.3, 0.29, 0.13],
    [0.73, 0.57, -0.025],
    surface("#a88c62", 1),
    [-0.2, -0.14, 0.17],
  );
}

function chair(group: THREE.Group, color: string) {
  const oak = surface("#977656");
  const fabric = surface(color, 1);
  const light = surface(
    new THREE.Color(color).lerp(new THREE.Color("#d9d5bb"), 0.12),
    1,
  );
  for (const x of [-0.31, 0.31]) {
    rod(group, [x * 1.12, 0, 0.31], [x, 0.52, 0.2], 0.026, oak, 0.031);
    rod(group, [x * 1.1, 0, -0.31], [x, 0.73, -0.26], 0.029, oak, 0.034);
    rod(group, [x, 0.26, -0.27], [x, 0.26, 0.26], 0.023, oak);
    box(group, [0.075, 0.055, 0.69], [x * 1.12, 0.53, -0.025], oak, 0.025);
  }
  box(group, [0.65, 0.065, 0.64], [0, 0.28, 0.045], oak, 0.025);
  cushion(group, [0.65, 0.16, 0.64], [0, 0.39, 0.045], light);
  cushion(group, [0.7, 0.42, 0.17], [0, 0.585, -0.27], fabric, [-0.16, 0, 0]);
  cushion(
    group,
    [0.38, 0.18, 0.12],
    [0, 0.48, -0.105],
    surface("#d6cbb2", 1),
    [-0.12, 0, 0],
  );
}

function table(group: THREE.Group, color: string) {
  const oak = surface(color, 0.56);
  const endgrain = surface(new THREE.Color(color).multiplyScalar(0.85), 0.7);
  slab(group, 1.05, 0.65, 0.065, 0.25, [0, 0.315, 0], oak);
  for (const [x, z] of [
    [-0.33, -0.16],
    [0.33, -0.16],
    [0.0, 0.2],
  ]) {
    rod(group, [x * 1.09, 0, z * 1.1], [x, 0.33, z], 0.053, endgrain, 0.043);
  }
  // Fine inlaid lines give the top a grain without a downloaded texture.
  const grain = surface(new THREE.Color(color).multiplyScalar(0.94), 0.8);
  for (let i = 0; i < 7; i++) {
    box(
      group,
      [0.7 - Math.abs(i - 3) * 0.035, 0.0008, 0.0014],
      [0, 0.3805, (i - 3) * 0.055],
      grain,
    );
  }
}

function desk(group: THREE.Group, color: string) {
  const oak = surface(color, 0.6);
  const dark = surface("#806044");
  const brass = new THREE.MeshStandardMaterial({
    color: "#a88b50",
    metalness: 0.6,
    roughness: 0.4,
  });
  slab(group, 1.4, 0.65, 0.055, 0.045, [0, 0.705, 0], oak);
  for (const x of [-0.59, 0.59])
    for (const z of [-0.235, 0.235]) {
      rod(group, [x * 1.035, 0, z * 1.08], [x, 0.72, z], 0.025, dark, 0.041);
    }
  box(group, [1.2, 0.1, 0.035], [0, 0.63, -0.26], oak, 0.008);
  box(group, [0.46, 0.12, 0.48], [0.35, 0.642, 0.005], oak, 0.009);
  box(group, [0.22, 0.013, 0.025], [0.35, 0.64, 0.259], brass, 0.004);
}

function vase(
  parent: THREE.Object3D,
  position: XYZ,
  material: Surface,
  size = 1,
) {
  const points = [
    [0.045, 0],
    [0.08, 0.03],
    [0.085, 0.1],
    [0.053, 0.15],
    [0.04, 0.2],
  ];
  return solid(
    parent,
    new THREE.LatheGeometry(
      points.map(([r, y]) => new THREE.Vector2(r * size, y * size)),
      20,
    ),
    material,
    position,
  );
}

function shelf(group: THREE.Group, color: string) {
  const oak = surface(color, 0.71);
  const backing = surface(new THREE.Color(color).multiplyScalar(0.91), 0.9);
  box(group, [1.25, 1.63, 0.022], [0, 0.865, -0.164], backing);
  for (const x of [-0.602, 0.602])
    box(group, [0.046, 1.7, 0.35], [x, 0.85, 0], oak, 0.006);
  const boards = [0.065, 0.465, 0.865, 1.265, 1.677];
  for (const y of boards) box(group, [1.2, 0.045, 0.35], [0, y, 0], oak, 0.005);
  const covers = [
    "#697b72",
    "#c18d70",
    "#e3d8c3",
    "#9caa9b",
    "#c4ad80",
    "#676960",
  ].map((c) => surface(c));
  const paper = surface("#e9deca");
  for (let row = 0; row < 4; row++) {
    const y = boards[row] + 0.0225;
    const start = row % 2 ? 0.1 : -0.52;
    for (let i = 0; i < 5; i++) {
      const h = 0.2 + ((i * 7 + row * 3) % 9) * 0.012;
      const x = start + i * 0.072;
      box(
        group,
        [0.052, h, 0.215],
        [x, y + h / 2, 0.008],
        covers[(i + row) % covers.length],
        0.002,
      );
      box(group, [0.035, 0.008, 0.001], [x, y + h * 0.75, 0.117], paper);
      box(group, [0.035, 0.004, 0.001], [x, y + h * 0.16, 0.117], paper);
    }
    if (row === 1 || row === 3)
      vase(group, [-0.32, y, 0.015], covers[row], row === 1 ? 1.1 : 1.35);
    else {
      const cover = covers[(row + 2) % covers.length];
      box(group, [0.27, 0.04, 0.24], [0.3, y + 0.02, 0], cover, 0.004);
      box(group, [0.24, 0.032, 0.21], [0.31, y + 0.055, -0.01], paper, 0.003);
      if (!row) vase(group, [0.3, y + 0.071, 0], covers[4], 0.65);
    }
  }
}

function leafGeometry(length: number, width: number) {
  const vertices: number[] = [];
  const indices: number[] = [];
  const rows = 10;
  for (let i = 0; i <= rows; i++) {
    const t = i / rows;
    const spread = (Math.pow(Math.sin(Math.PI * t), 0.8) * width) / 2;
    for (let j = -1; j <= 1; j++) {
      vertices.push(
        j * spread,
        t * length,
        Math.sin(t * Math.PI) * length * 0.13 - Math.abs(j) * spread * 0.18,
      );
    }
  }
  for (let i = 0; i < rows; i++)
    for (let j = 0; j < 2; j++) {
      const a = i * 3 + j;
      indices.push(a, a + 1, a + 3, a + 1, a + 4, a + 3);
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(vertices, 3),
  );
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function plant(group: THREE.Group, color: string) {
  const ceramic = surface("#c5a487", 0.92);
  const earth = surface("#514334", 1);
  const bark = surface("#7a6650", 0.9);
  const foliage = [0, 0.12, 0.24].map((n) => {
    const material = surface(
      new THREE.Color(color).lerp(new THREE.Color("#879369"), n),
      0.85,
    );
    material.side = THREE.DoubleSide;
    return material;
  });
  solid(
    group,
    new THREE.CylinderGeometry(0.19, 0.135, 0.3, 32),
    ceramic,
    [0, 0.15, 0],
  );
  solid(
    group,
    new THREE.CylinderGeometry(0.172, 0.172, 0.014, 32),
    earth,
    [0, 0.291, 0],
  );
  const lip = solid(
    group,
    new THREE.TorusGeometry(0.18, 0.012, 8, 32),
    ceramic,
    [0, 0.3, 0],
  );
  lip.rotation.x = Math.PI / 2;
  piping(
    group,
    [
      [0, 0.28, 0],
      [-0.025, 0.7, 0.018],
      [0.015, 1.14, -0.01],
      [0.005, 1.44, 0],
    ],
    bark,
    0.011,
  );
  for (let i = 0; i < 13; i++) {
    const angle = i * 2.399;
    const y = 0.62 + i * 0.059;
    const reach = 0.11 + (i % 3) * 0.025;
    const start: XYZ = [
      Math.cos(angle) * reach,
      y + 0.04,
      Math.sin(angle) * reach,
    ];
    rod(group, [0, y - 0.08, 0], start, 0.004, bark);
    const leaf = solid(
      group,
      leafGeometry(0.25 + (i % 3) * 0.025, 0.14),
      foliage[i % 3],
      start,
    );
    leaf.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(
        Math.cos(angle) * 0.7,
        0.65,
        Math.sin(angle) * 0.7,
      ).normalize(),
    );
  }
}

function bed(group: THREE.Group, color: string) {
  const oak = surface("#977452");
  const linen = surface(color, 1);
  const ivory = surface("#e9e1cf", 1);
  const throwMaterial = surface("#7f8d7b", 1);
  for (const x of [-0.64, 0.64])
    for (const z of [-0.85, 0.85]) {
      box(group, [0.075, 0.13, 0.075], [x, 0.065, z], oak, 0.013);
    }
  box(group, [1.6, 0.17, 2.1], [0, 0.195, 0], oak, 0.03);
  cushion(group, [1.6, 0.45, 0.11], [0, 0.325, -0.995], linen);
  cushion(group, [1.52, 0.18, 1.98], [0, 0.35, 0.015], ivory);
  cushion(group, [1.53, 0.1, 1.49], [0, 0.455, 0.25], linen);
  for (const x of [-0.39, 0.39])
    cushion(group, [0.64, 0.13, 0.41], [x, 0.48, -0.68], ivory, [
      0,
      x * 0.09,
      0,
    ]);
  cushion(group, [1.54, 0.028, 0.47], [0, 0.512, 0.62], throwMaterial);
  const seam = surface("#a5ad96", 1);
  for (let i = -4; i <= 4; i++) {
    piping(
      group,
      [
        [i * 0.16, 0.525, 0.41],
        [i * 0.16 + 0.008, 0.529, 0.64],
        [i * 0.16, 0.525, 0.83],
      ],
      seam,
      0.002,
    );
  }
}

/** The model's world footprint and total height exactly match the engine's Piece. */
export function createFurniture(piece: Piece): THREE.Group {
  const root = new THREE.Group();
  const model = new THREE.Group();
  const builders = { sofa, chair, table, desk, shelf, plant, bed };
  builders[piece.kind](model, piece.color);
  const bounds = new THREE.Box3().setFromObject(model, true);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  model.scale.set(
    piece.width / size.x,
    piece.height / size.y,
    piece.depth / size.z,
  );
  model.position.set(
    -center.x * model.scale.x,
    -bounds.min.y * model.scale.y,
    -center.z * model.scale.z,
  );
  root.add(model);
  root.name = piece.name;
  root.userData.pieceId = piece.id;
  root.position.set(piece.x, 0, piece.z);
  // THREE's positive Y rotation runs opposite to the engine's positive XZ rotation.
  root.rotation.y = -THREE.MathUtils.degToRad(piece.rotation);
  return root;
}

/** Groups own their resources; sharing a material inside a group is safe. */
export function disposeGroup(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (object instanceof THREE.InstancedMesh) object.dispose();
    const renderable = object as THREE.Mesh;
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      for (const material of Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material]) {
        materials.add(material);
        for (const value of Object.values(material))
          if (value instanceof THREE.Texture) textures.add(value);
      }
    }
  });
  geometries.forEach((geometry) => geometry.dispose());
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  root.removeFromParent();
}
