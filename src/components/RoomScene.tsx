import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  checkLayout,
  corners,
  doorZone,
  snap,
  type Layout,
  type Piece,
} from "../engine/room";
import {
  box,
  createFurniture,
  disposeGroup,
  rod,
  slab,
  solid,
  surface,
} from "./furniture";

export type RoomSceneProps = {
  layout: Layout;
  selected: string | null;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, z: number) => void;
  onFallback: () => void;
  resetView: number;
};

type Outline = {
  group: THREE.Group;
  material: THREE.MeshBasicMaterial;
  fill: THREE.MeshBasicMaterial;
};
type Item = { model: THREE.Group; outline: Outline; signature: string };
type Runtime = {
  sync: (layout: Layout, selected: string | null) => void;
  home: () => void;
};
type Drag = {
  pointerId: number;
  piece: Piece;
  start: THREE.Vector3;
  screenX: number;
  screenY: number;
  x: number;
  z: number;
  moved: boolean;
  width: number;
  depth: number;
};

const WALL_HEIGHT = 2.55;
const SELECTED_COLOR = "#486d69";
const ISSUE_COLOR = "#bb4b3e";

function signature(piece: Piece) {
  return [piece.kind, piece.width, piece.depth, piece.height, piece.color].join(
    "|",
  );
}

/** Deterministic grain: changing the selection never rearranges the floor. */
function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function floor(parent: THREE.Group, width: number, depth: number) {
  const foundation = surface("#c8b699", 0.92);
  box(
    parent,
    [width + 0.08, 0.15, depth + 0.08],
    [width / 2, -0.1, depth / 2],
    foundation,
    0.018,
  );
  const rand = random(37);
  const plankWidth = 0.19;
  const planks: {
    x: number;
    z: number;
    width: number;
    depth: number;
    tone: number;
  }[] = [];
  for (let row = 0; row < Math.ceil(depth / plankWidth); row++) {
    const z = row * plankWidth;
    const d = Math.min(plankWidth, depth - z);
    for (let x = -(row % 3) * 0.41; x < width;) {
      const length = 1.12 + rand() * 0.35;
      const start = Math.max(0, x);
      const end = Math.min(width, x + length);
      if (end > start)
        planks.push({
          x: (start + end) / 2,
          z: z + d / 2,
          width: end - start,
          depth: d,
          tone: rand(),
        });
      x += length;
    }
  }
  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    surface("#ffffff", 0.82),
    planks.length,
  );
  const transform = new THREE.Object3D();
  const pale = new THREE.Color("#c3a27c");
  const honey = new THREE.Color("#dbc3a0");
  planks.forEach((plank, i) => {
    transform.position.set(plank.x, -0.016, plank.z);
    transform.scale.set(
      Math.max(0.002, plank.width - 0.004),
      0.032,
      Math.max(0.002, plank.depth - 0.003),
    );
    transform.updateMatrix();
    mesh.setMatrixAt(i, transform.matrix);
    mesh.setColorAt(i, pale.clone().lerp(honey, plank.tone));
  });
  mesh.receiveShadow = true;
  mesh.instanceMatrix.needsUpdate = true;
  parent.add(mesh);

  // Hairline wood fibres run with each board. Instancing keeps the entire floor cheap.
  const fibres = new THREE.InstancedMesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({
      color: "#846344",
      transparent: true,
      opacity: 0.105,
      depthWrite: false,
    }),
    planks.length * 3,
  );
  planks.forEach((plank, i) => {
    for (let j = 0; j < 3; j++) {
      const length = plank.width * (0.32 + rand() * 0.52);
      transform.position.set(
        plank.x + (rand() - 0.5) * (plank.width - length) * 0.8,
        0.001,
        plank.z + (rand() - 0.5) * plank.depth * 0.8,
      );
      transform.rotation.set(-Math.PI / 2, 0, 0);
      transform.scale.set(length, 0.0009 + rand() * 0.0008, 1);
      transform.updateMatrix();
      fibres.setMatrixAt(i * 3 + j, transform.matrix);
    }
  });
  fibres.instanceMatrix.needsUpdate = true;
  parent.add(fibres);
}

function windowAndWalls(parent: THREE.Group, width: number, depth: number) {
  const plaster = surface("#efece2", 0.96);
  const leftPlaster = surface("#e9e7dc", 0.98);
  const trim = surface("#f8f4e8", 0.65);
  const reveal = surface("#d0c9b7", 0.88);
  const windowWidth = Math.min(2.65, width * 0.51);
  const windowHeight = 1.22;
  const center = width * 0.45;
  const left = center - windowWidth / 2;
  const right = center + windowWidth / 2;
  const bottom = 1.04;
  const top = bottom + windowHeight;
  box(
    parent,
    [0.12, WALL_HEIGHT, depth + 0.12],
    [-0.06, WALL_HEIGHT / 2, depth / 2 - 0.06],
    leftPlaster,
    0.006,
  );
  box(
    parent,
    [left, WALL_HEIGHT, 0.12],
    [left / 2, WALL_HEIGHT / 2, -0.06],
    plaster,
  );
  box(
    parent,
    [width - right, WALL_HEIGHT, 0.12],
    [(width + right) / 2, WALL_HEIGHT / 2, -0.06],
    plaster,
  );
  box(
    parent,
    [windowWidth, bottom, 0.12],
    [center, bottom / 2, -0.06],
    plaster,
  );
  box(
    parent,
    [windowWidth, WALL_HEIGHT - top, 0.12],
    [center, (top + WALL_HEIGHT) / 2, -0.06],
    plaster,
  );
  box(
    parent,
    [width + 0.12, 0.035, 0.14],
    [width / 2 - 0.06, WALL_HEIGHT, -0.06],
    trim,
    0.008,
  );
  box(
    parent,
    [0.14, 0.035, depth + 0.12],
    [-0.06, WALL_HEIGHT, depth / 2 - 0.06],
    trim,
    0.008,
  );
  box(parent, [width, 0.085, 0.025], [width / 2, 0.043, 0.016], trim, 0.008);
  box(parent, [0.025, 0.085, depth], [0.016, 0.043, depth / 2], trim, 0.008);

  const surround = slab(
    parent,
    windowWidth + 0.1,
    windowHeight + 0.1,
    0.07,
    0.08,
    [center, bottom + windowHeight / 2, -0.04],
    reveal,
  );
  surround.rotation.x = Math.PI / 2;
  const frame = slab(
    parent,
    windowWidth + 0.035,
    windowHeight + 0.035,
    0.065,
    0.065,
    [center, bottom + windowHeight / 2, 0.005],
    trim,
  );
  frame.rotation.x = Math.PI / 2;
  const skyMaterial = new THREE.MeshStandardMaterial({
    color: "#d4e1dc",
    emissive: "#ccdcd3",
    emissiveIntensity: 0.32,
    roughness: 0.32,
  });
  const paneWidth = (windowWidth - 0.16) / 2;
  for (const sign of [-1, 1]) {
    const pane = slab(
      parent,
      paneWidth,
      windowHeight - 0.12,
      0.008,
      0.033,
      [
        center + sign * (paneWidth / 2 + 0.022),
        bottom + windowHeight / 2,
        0.075,
      ],
      skyMaterial,
    );
    pane.rotation.x = Math.PI / 2;
    pane.castShadow = false;
    // A pale lower pane suggests a garden beyond the frosted glazing.
    const garden = slab(
      parent,
      paneWidth - 0.015,
      0.27,
      0.003,
      0.026,
      [pane.position.x, bottom + 0.21, 0.085],
      surface("#c8d3c4", 0.96),
    );
    garden.rotation.x = Math.PI / 2;
    garden.castShadow = false;
    box(
      parent,
      [paneWidth, 0.027, 0.045],
      [pane.position.x, bottom + windowHeight * 0.5, 0.12],
      trim,
      0.007,
    );
  }
  box(
    parent,
    [0.047, windowHeight - 0.045, 0.055],
    [center, bottom + windowHeight / 2, 0.12],
    trim,
    0.007,
  );
  box(
    parent,
    [windowWidth + 0.19, 0.055, 0.26],
    [center, bottom - 0.015, 0.055],
    trim,
    0.015,
  );
  box(
    parent,
    [0.025, 0.08, 0.035],
    [center + 0.075, bottom + windowHeight * 0.48, 0.157],
    surface("#aa9b7a", 0.45),
    0.005,
  );

  // Slim linen curtains, made from individual folds, soften the architectural edges.
  const linen = surface("#e2dac8", 1);
  for (const edge of [left - 0.11, right + 0.11]) {
    for (let i = 0; i < 4; i++) {
      box(
        parent,
        [0.062, 1.39 - (i % 2) * 0.018, 0.06],
        [edge + (i - 1.5) * 0.048, 1.65, 0.17 + (i % 2) * 0.025],
        linen,
        0.027,
      );
    }
  }
  rod(
    parent,
    [left - 0.26, 2.39, 0.18],
    [right + 0.26, 2.39, 0.18],
    0.011,
    surface("#99856a", 0.5),
  );
}

function roomDecor(parent: THREE.Group, layout: Layout) {
  const { width, depth } = layout;
  const rugWidth = Math.min(width * 0.49, 3.1);
  const rugDepth = Math.min(depth * 0.44, 2.2);
  const rugX = width * 0.405;
  const rugZ = depth * 0.46;
  const rug = surface("#dcd6c2", 1);
  slab(parent, rugWidth, rugDepth, 0.008, 0.075, [rugX, 0.004, rugZ], rug);
  const thread = surface("#c7bea7", 1);
  for (const side of [-1, 1]) {
    for (let stripe = 0; stripe < 3; stripe++) {
      box(
        parent,
        [rugWidth - 0.12, 0.001, 0.008],
        [rugX, 0.0128, rugZ + side * (rugDepth / 2 - 0.08 - stripe * 0.025)],
        thread,
      );
    }
    for (let i = 0; i < 35; i++) {
      box(
        parent,
        [0.013, 0.004, 0.05],
        [
          rugX + (i / 34 - 0.5) * (rugWidth - 0.12),
          0.005,
          rugZ + side * (rugDepth / 2 + 0.016),
        ],
        rug,
      );
    }
  }

  const lamp = new THREE.Group();
  lamp.position.set(0.34, 0, 0.4);
  parent.add(lamp);
  const metal = new THREE.MeshStandardMaterial({
    color: "#8e7b55",
    metalness: 0.62,
    roughness: 0.46,
  });
  solid(
    lamp,
    new THREE.CylinderGeometry(0.15, 0.17, 0.035, 32),
    metal,
    [0, 0.025, 0],
  );
  rod(lamp, [0, 0.04, 0], [0, 1.39, 0], 0.014, metal);
  const shadeMaterial = new THREE.MeshStandardMaterial({
    color: "#efe3c6",
    emissive: "#ddad62",
    emissiveIntensity: 0.13,
    side: THREE.DoubleSide,
    roughness: 1,
  });
  solid(
    lamp,
    new THREE.CylinderGeometry(0.16, 0.27, 0.3, 40, 1, true),
    shadeMaterial,
    [0, 1.43, 0],
  );
  const inner = solid(
    lamp,
    new THREE.CircleGeometry(0.245, 40),
    surface("#f7e9cd"),
    [0, 1.295, 0],
  );
  inner.rotation.x = Math.PI / 2;
  const lampLight = new THREE.PointLight("#ffdba0", 0.45, 1.7, 2);
  lampLight.position.set(0, 1.26, 0);
  lamp.add(lampLight);

  // A small framed abstract print on the return wall, entirely geometry.
  const art = new THREE.Group();
  art.position.set(0.025, 1.68, depth * 0.6);
  art.rotation.y = Math.PI / 2;
  parent.add(art);
  box(art, [0.67, 0.87, 0.032], [0, 0, 0], surface("#a28662"), 0.01);
  box(art, [0.615, 0.815, 0.008], [0, 0, 0.02], surface("#eee5d1"), 0.002);
  const sun = solid(
    art,
    new THREE.CircleGeometry(0.145, 40),
    new THREE.MeshBasicMaterial({ color: "#b88463" }),
    [0.065, 0.12, 0.026],
  );
  sun.castShadow = false;
  box(art, [0.33, 0.025, 0.003], [-0.035, -0.15, 0.027], surface("#9da28a"));
  box(art, [0.42, 0.019, 0.003], [0.015, -0.195, 0.027], surface("#b5b59b"));

  const zone = doorZone(layout);
  const fill = solid(
    parent,
    new THREE.PlaneGeometry(zone.width, zone.depth),
    new THREE.MeshBasicMaterial({
      color: "#799486",
      transparent: true,
      opacity: 0.065,
      depthWrite: false,
    }),
    [zone.x, 0.006, zone.z],
  );
  fill.rotation.x = -Math.PI / 2;
  fill.castShadow = false;
  fill.receiveShadow = false;
  const points = corners(zone).map((p) => new THREE.Vector3(p.x, 0.009, p.z));
  points.push(points[0].clone());
  const outline = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(points),
    new THREE.LineDashedMaterial({
      color: "#789083",
      dashSize: 0.065,
      gapSize: 0.052,
      transparent: true,
      opacity: 0.54,
    }),
  );
  outline.computeLineDistances();
  parent.add(outline);
  box(
    parent,
    [zone.width, 0.025, 0.035],
    [zone.x, 0.0, depth + 0.012],
    surface("#b99a72"),
    0.006,
  );
}

function createRoom(layout: Layout) {
  const room = new THREE.Group();
  room.name = "Oak floor, plaster walls, window and room decorations";
  floor(room, layout.width, layout.depth);
  windowAndWalls(room, layout.width, layout.depth);
  roomDecor(room, layout);
  return room;
}

function createOutline(piece: Piece): Outline {
  const group = new THREE.Group();
  const material = new THREE.MeshBasicMaterial({
    color: SELECTED_COLOR,
    depthTest: true,
  });
  const fill = new THREE.MeshBasicMaterial({
    color: SELECTED_COLOR,
    transparent: true,
    opacity: 0.065,
    depthWrite: false,
  });
  const points = corners({ ...piece, x: 0, z: 0, rotation: 0 }).map(
    (p) => new THREE.Vector3(p.x, 0.026, p.z),
  );
  points.forEach((point, i) => {
    const next = points[(i + 1) % points.length];
    const edge = rod(
      group,
      [point.x, point.y, point.z],
      [next.x, next.y, next.z],
      0.012,
      material,
    );
    edge.castShadow = false;
    edge.renderOrder = 2;
  });
  const plane = solid(
    group,
    new THREE.PlaneGeometry(piece.width, piece.depth),
    fill,
    [0, 0.017, 0],
  );
  plane.rotation.x = -Math.PI / 2;
  plane.castShadow = false;
  for (const point of points) {
    const marker = rod(
      group,
      [point.x, 0.03, point.z],
      [point.x, 0.11, point.z],
      0.012,
      material,
    );
    marker.castShadow = false;
  }
  return { group, material, fill };
}

export default function RoomScene(props: RoomSceneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const current = useRef(props);
  const runtime = useRef<Runtime | null>(null);
  current.current = props;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let renderer: THREE.WebGLRenderer | undefined;
    let controls: OrbitControls | undefined;
    let observer: ResizeObserver | undefined;
    let room: THREE.Group | undefined;
    let frame = 0;
    let disposed = false;
    let failed = false;
    let width = 0;
    let height = 0;
    let roomWidth = 0;
    let roomDepth = 0;
    let drag: Drag | null = null;
    let orbiting = false;
    const scene = new THREE.Scene();
    const items = new Map<string, Item>();
    const listeners: (() => void)[] = [];
    const camera = new THREE.OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const floorPoint = new THREE.Vector3();
    const key = new THREE.DirectionalLight("#fff1dc", 3.0);
    const fillLight = new THREE.DirectionalLight("#e3eae5", 0.75);

    const fail = () => {
      if (failed || disposed) return;
      failed = true;
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (controls) controls.enabled = false;
      current.current.onFallback();
    };

    const render = (shadows = false) => {
      if (!renderer || failed || disposed) return;
      if (shadows) renderer.shadowMap.needsUpdate = true;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!renderer || disposed || failed || width === 0 || height === 0)
          return;
        try {
          renderer.render(scene, camera);
        } catch {
          fail();
        }
      });
    };

    const highlights = (layout: Layout, selected: string | null) => {
      const bad = new Set(checkLayout(layout).flatMap((issue) => issue.ids));
      for (const piece of layout.pieces) {
        const item = items.get(piece.id);
        if (!item) continue;
        const isSelected = piece.id === selected;
        item.outline.group.visible = isSelected || bad.has(piece.id);
        item.outline.material.color.set(
          bad.has(piece.id) ? ISSUE_COLOR : SELECTED_COLOR,
        );
        item.outline.fill.color.copy(item.outline.material.color);
        item.outline.fill.opacity = isSelected ? 0.075 : 0.045;
        item.outline.group.position.set(piece.x, 0, piece.z);
        item.outline.group.rotation.y = -THREE.MathUtils.degToRad(
          piece.rotation,
        );
      }
    };

    const fitCamera = () => {
      if (!width || !height || !controls) return;
      camera.updateMatrixWorld(true);
      // Fit the actual open shell: there is no imaginary tall wall at the front.
      const worldPoints = [
        [-0.25, -0.22, -0.25],
        [roomWidth + 0.25, -0.22, -0.25],
        [-0.25, -0.22, roomDepth + 0.25],
        [roomWidth + 0.25, -0.22, roomDepth + 0.25],
        [-0.25, WALL_HEIGHT + 0.12, -0.25],
        [roomWidth + 0.18, WALL_HEIGHT + 0.12, -0.25],
        [-0.25, WALL_HEIGHT + 0.12, roomDepth + 0.18],
      ];
      const projected = worldPoints.map((p) =>
        new THREE.Vector3(...p).applyMatrix4(camera.matrixWorldInverse),
      );
      const minX = Math.min(...projected.map((p) => p.x));
      const maxX = Math.max(...projected.map((p) => p.x));
      const minY = Math.min(...projected.map((p) => p.y));
      const maxY = Math.max(...projected.map((p) => p.y));
      const aspect = width / height;
      const half =
        Math.max((maxY - minY) / 2, (maxX - minX) / (2 * aspect)) * 1.055;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;
      camera.left = centerX - half * aspect;
      camera.right = centerX + half * aspect;
      camera.top = centerY + half;
      camera.bottom = centerY - half;
      camera.updateProjectionMatrix();
      render();
    };

    const home = () => {
      if (!controls) return;
      controls.target.set(roomWidth / 2, 0.8, roomDepth / 2);
      camera.position.copy(controls.target).add(new THREE.Vector3(6, 7, 8));
      camera.zoom = 1;
      camera.lookAt(controls.target);
      controls.update();
      fitCamera();
      render();
    };

    const releaseDrag = () => {
      const previous = drag;
      drag = null;
      if (controls) controls.enabled = !failed;
      if (renderer) {
        renderer.domElement.style.cursor = "grab";
        if (
          previous &&
          renderer.domElement.hasPointerCapture(previous.pointerId)
        ) {
          renderer.domElement.releasePointerCapture(previous.pointerId);
        }
      }
      return previous;
    };

    const sync = (layout: Layout, selected: string | null) => {
      if (!renderer || failed || disposed) return;
      if (drag) {
        const piece = layout.pieces.find((p) => p.id === drag!.piece.id);
        if (
          !piece ||
          signature(piece) !== signature(drag.piece) ||
          piece.rotation !== drag.piece.rotation ||
          piece.x !== drag.piece.x ||
          piece.z !== drag.piece.z ||
          layout.width !== drag.width ||
          layout.depth !== drag.depth
        ) {
          releaseDrag();
        }
      }
      const resized = roomWidth !== layout.width || roomDepth !== layout.depth;
      if (resized) {
        if (room) disposeGroup(room);
        room = createRoom(layout);
        scene.add(room);
        roomWidth = layout.width;
        roomDepth = layout.depth;
        key.position.set(roomWidth * 0.3 + 1, 7.5, roomDepth + 3);
        key.target.position.set(roomWidth / 2, 0, roomDepth / 2);
        const extent = Math.max(roomWidth, roomDepth) * 0.85 + 2;
        Object.assign(key.shadow.camera, {
          left: -extent,
          right: extent,
          top: extent,
          bottom: -extent,
          near: 0.5,
          far: 35,
        });
        key.shadow.camera.updateProjectionMatrix();
        fillLight.position.set(roomWidth + 3, 4, -3);
        fillLight.target.position.set(roomWidth / 2, 0.4, roomDepth / 2);
      }
      const ids = new Set(layout.pieces.map((p) => p.id));
      for (const [id, item] of items)
        if (!ids.has(id)) {
          disposeGroup(item.model);
          disposeGroup(item.outline.group);
          items.delete(id);
        }
      for (const piece of layout.pieces) {
        let item = items.get(piece.id);
        const nextSignature = signature(piece);
        if (!item || item.signature !== nextSignature) {
          if (item) {
            disposeGroup(item.model);
            disposeGroup(item.outline.group);
          }
          item = {
            model: createFurniture(piece),
            outline: createOutline(piece),
            signature: nextSignature,
          };
          items.set(piece.id, item);
          scene.add(item.model, item.outline.group);
        }
        item.model.name = piece.name;
        item.model.position.set(
          drag?.piece.id === piece.id ? drag.x : piece.x,
          0,
          drag?.piece.id === piece.id ? drag.z : piece.z,
        );
        item.model.rotation.y = -THREE.MathUtils.degToRad(piece.rotation);
      }
      const preview = drag
        ? {
            ...layout,
            pieces: layout.pieces.map((p) =>
              p.id === drag!.piece.id ? { ...p, x: drag!.x, z: drag!.z } : p,
            ),
          }
        : layout;
      highlights(preview, drag?.piece.id ?? selected);
      if (resized) home();
      render(true);
    };

    const updateRay = (event: PointerEvent) => {
      if (!renderer) return false;
      const rect = renderer.domElement.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      camera.updateMatrixWorld(true);
      raycaster.setFromCamera(pointer, camera);
      return true;
    };

    const hitPiece = () => {
      scene.updateMatrixWorld(true);
      const hit = raycaster.intersectObjects(
        [...items.values()].map((item) => item.model),
        true,
      )[0];
      if (!hit) return null;
      let object: THREE.Object3D | null = hit.object;
      while (object && !object.userData.pieceId) object = object.parent;
      return (object?.userData.pieceId as string | undefined) ?? null;
    };

    const previewDrag = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId || !updateRay(event))
        return;
      if (
        !drag.moved &&
        Math.hypot(event.clientX - drag.screenX, event.clientY - drag.screenY) <
          4
      )
        return;
      if (!raycaster.ray.intersectPlane(floorPlane, floorPoint)) return;
      drag.moved = true;
      drag.x = Math.max(
        -4,
        Math.min(
          current.current.layout.width + 4,
          snap(drag.piece.x + floorPoint.x - drag.start.x),
        ),
      );
      drag.z = Math.max(
        -4,
        Math.min(
          current.current.layout.depth + 4,
          snap(drag.piece.z + floorPoint.z - drag.start.z),
        ),
      );
      const item = items.get(drag.piece.id);
      if (item) item.model.position.set(drag.x, 0, drag.z);
      const layout = current.current.layout;
      highlights(
        {
          ...layout,
          pieces: layout.pieces.map((p) =>
            p.id === drag!.piece.id ? { ...p, x: drag!.x, z: drag!.z } : p,
          ),
        },
        drag.piece.id,
      );
      render(true);
    };

    const pointerDown = (event: PointerEvent) => {
      if (failed || !renderer || !controls) return;
      if (drag) {
        event.stopImmediatePropagation();
        event.preventDefault();
        return;
      }
      if (
        event.button !== 0 ||
        !event.isPrimary ||
        orbiting ||
        !updateRay(event)
      )
        return;
      const id = hitPiece();
      if (!id || !raycaster.ray.intersectPlane(floorPlane, floorPoint)) return;
      const piece = current.current.layout.pieces.find((p) => p.id === id);
      if (!piece) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      controls.enabled = false;
      drag = {
        pointerId: event.pointerId,
        piece: { ...piece },
        start: floorPoint.clone(),
        screenX: event.clientX,
        screenY: event.clientY,
        x: piece.x,
        z: piece.z,
        moved: false,
        width: current.current.layout.width,
        depth: current.current.layout.depth,
      };
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.style.cursor = "grabbing";
      highlights(current.current.layout, id);
      render();
      current.current.onSelect(id);
    };

    const pointerMove = (event: PointerEvent) => {
      if (failed || !renderer) return;
      if (drag) {
        if (drag.pointerId === event.pointerId) {
          event.preventDefault();
          event.stopImmediatePropagation();
          previewDrag(event);
        }
        return;
      }
      if (!orbiting && event.pointerType !== "touch" && updateRay(event)) {
        renderer.domElement.style.cursor = hitPiece() ? "pointer" : "grab";
      }
    };

    const pointerUp = (event: PointerEvent) => {
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      previewDrag(event);
      const completed = releaseDrag();
      if (
        completed?.moved &&
        (completed.x !== completed.piece.x || completed.z !== completed.piece.z)
      ) {
        current.current.onMove(completed.piece.id, completed.x, completed.z);
      }
      sync(current.current.layout, current.current.selected);
    };

    const cancelDrag = (event?: PointerEvent) => {
      if (!drag || (event && event.pointerId !== drag.pointerId)) return;
      releaseDrag();
      sync(current.current.layout, current.current.selected);
    };

    const resize = () => {
      if (!renderer || disposed || failed) return;
      const rect = container.getBoundingClientRect();
      width = Math.round(rect.width);
      height = Math.round(rect.height);
      if (width < 1 || height < 1) return;
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.setSize(width, height, false);
      fitCamera();
    };

    type CanvasEvents = HTMLElementEventMap & {
      webglcontextlost: Event;
      webglcontextcreationerror: Event;
    };
    const listen = <K extends keyof CanvasEvents>(
      type: K,
      handler: (event: CanvasEvents[K]) => void,
      capture = false,
    ) => {
      const canvas = renderer!.domElement;
      canvas.addEventListener(type, handler as EventListener, { capture });
      listeners.push(() =>
        canvas.removeEventListener(type, handler as EventListener, { capture }),
      );
    };

    const cleanup = () => {
      if (disposed) return;
      disposed = true;
      runtime.current = null;
      if (frame) cancelAnimationFrame(frame);
      observer?.disconnect();
      listeners.forEach((remove) => remove());
      releaseDrag();
      controls?.dispose();
      key.shadow.dispose();
      disposeGroup(scene);
      items.clear();
      if (renderer) {
        renderer.renderLists.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      }
    };

    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      });
      renderer.setClearColor("#f3f0e8", 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.12;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.shadowMap.autoUpdate = false;
      const canvas = renderer.domElement;
      canvas.setAttribute("role", "img");
      canvas.setAttribute(
        "aria-label",
        "Interactive 3D room. Select and drag furniture to move it in 5 centimetre steps; drag the floor to orbit and scroll to zoom. Red outlines mark a fit issue. Use the furniture list and inspector for keyboard controls.",
      );
      Object.assign(canvas.style, {
        display: "block",
        width: "100%",
        height: "100%",
        touchAction: "none",
        cursor: "grab",
      });
      container.appendChild(canvas);

      // Capture furniture gestures before OrbitControls sees them.
      listen("pointerdown", pointerDown, true);
      listen("pointermove", pointerMove, true);
      listen("pointerup", pointerUp, true);
      listen("pointercancel", cancelDrag, true);
      listen("lostpointercapture", cancelDrag);
      listen("webglcontextlost", (event) => {
        event.preventDefault();
        fail();
      });
      listen("webglcontextcreationerror", fail);
      const blur = () => cancelDrag();
      window.addEventListener("blur", blur);
      window.addEventListener("resize", resize);
      listeners.push(
        () => window.removeEventListener("blur", blur),
        () => window.removeEventListener("resize", resize),
      );

      controls = new OrbitControls(camera, canvas);
      controls.enableDamping = false;
      controls.enablePan = false;
      controls.minPolarAngle = 0.48;
      controls.maxPolarAngle = 1.12;
      controls.minAzimuthAngle = 0.2;
      controls.maxAzimuthAngle = 1.35;
      controls.minZoom = 0.7;
      controls.maxZoom = 2.4;
      controls.rotateSpeed = 0.65;
      controls.zoomSpeed = 0.7;
      controls.addEventListener("change", () => render());
      controls.addEventListener("start", () => {
        orbiting = true;
        canvas.style.cursor = "grabbing";
      });
      controls.addEventListener("end", () => {
        orbiting = false;
        canvas.style.cursor = "grab";
      });

      scene.add(new THREE.HemisphereLight("#fff6e4", "#b1aa95", 2.0));
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      key.shadow.normalBias = 0.025;
      key.shadow.bias = -0.00015;
      key.shadow.radius = 3;
      scene.add(key, key.target, fillLight, fillLight.target);
      runtime.current = {
        sync,
        home: () => {
          cancelDrag();
          home();
        },
      };
      sync(current.current.layout, current.current.selected);
      observer = new ResizeObserver(resize);
      observer.observe(container);
      resize();
    } catch {
      fail();
      cleanup();
    }

    return cleanup;
  }, []);

  useEffect(() => {
    runtime.current?.sync(props.layout, props.selected);
  }, [props.layout, props.selected]);

  useEffect(() => {
    runtime.current?.home();
  }, [props.resetView]);

  return (
    <div
      ref={containerRef}
      className="room-scene"
      style={{
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        position: "absolute",
        inset: 0,
        overflow: "hidden",
      }}
    />
  );
}
