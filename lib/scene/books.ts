// The wireframe book shapes in the background field, shared with
// components/BookScene.tsx. Pure three.js geometry and no DOM, so every shape can
// be built and measured in Node (see scripts/check-scene-motion.mjs).

import * as THREE from 'three';

export type Kind = 'hardcover' | 'paperback' | 'tome' | 'square' | 'open' | 'scroll' | 'stack';

/** The order books are dealt out in, so the field mixes shapes rather than repeating one. */
export const KINDS: Kind[] = [
  'hardcover',
  'paperback',
  'open',
  'tome',
  'scroll',
  'square',
  'paperback',
  'stack',
  'hardcover',
  'open',
  'scroll',
  'tome',
];

// Width, height and depth in scene units.
const DIMS: Record<'hardcover' | 'paperback' | 'tome' | 'square', [number, number, number]> = {
  hardcover: [1.0, 1.42, 0.2],
  paperback: [0.82, 1.22, 0.1],
  tome: [1.12, 1.56, 0.5],
  square: [1.36, 1.36, 0.16],
};

export interface BuiltBook {
  group: THREE.Group;
  /** Every geometry created for this book, so the caller can dispose of them. */
  geometries: THREE.BufferGeometry[];
}

/**
 * Build one wireframe book. `outer` draws the silhouette and `inner` the page
 * block; both are supplied by the caller so each book can fade and flash on its own.
 */
export function buildBook(kind: Kind, outer: THREE.Material, inner: THREE.Material): BuiltBook {
  const geometries: THREE.BufferGeometry[] = [];
  const group = new THREE.Group();

  const edgesOf = (geom: THREE.BufferGeometry) => {
    const edges = new THREE.EdgesGeometry(geom);
    geom.dispose();
    geometries.push(edges);
    return edges;
  };

  const addBox = (
    parent: THREE.Object3D,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    x = 0,
    y = 0,
    z = 0,
  ) => {
    const line = new THREE.LineSegments(edgesOf(new THREE.BoxGeometry(w, h, d)), mat);
    line.position.set(x, y, z);
    parent.add(line);
    return line;
  };

  if (kind === 'open') {
    // Two covers hinged at the spine, opening towards the viewer.
    const W = 0.9;
    const H = 1.3;
    const a = 0.55;
    for (const s of [-1, 1]) {
      const page = new THREE.Group();
      page.rotation.y = -s * a;
      addBox(page, W, H, 0.05, outer, s * (W / 2), 0, 0);
      addBox(page, W - 0.06, H - 0.06, 0.02, inner, s * (W / 2), 0, 0.01);
      group.add(page);
    }
    return { group, geometries };
  }

  if (kind === 'scroll') {
    // A rolled manuscript with a sheet uncurling out of it.
    const roll = new THREE.LineSegments(edgesOf(new THREE.CylinderGeometry(0.17, 0.17, 1.0, 10)), outer);
    roll.rotation.z = Math.PI / 2;
    group.add(roll);

    const sheet = new THREE.LineSegments(edgesOf(new THREE.PlaneGeometry(0.72, 0.86, 2, 2)), inner);
    sheet.position.set(0.05, -0.5, 0.12);
    sheet.rotation.set(-0.5, 0, 0.06);
    group.add(sheet);
    return { group, geometries };
  }

  if (kind === 'stack') {
    // Three volumes piled up, each turned a little differently.
    const layers: [number, number, number, number, number][] = [
      [1.1, 0.22, 0.86, 0, -0.52],
      [1.0, 0.2, 0.78, 0.14, -0.26],
      [0.9, 0.18, 0.7, -0.2, 0],
    ];
    for (const [w, h, d, ry, y] of layers) {
      const slab = new THREE.Group();
      slab.rotation.y = ry;
      slab.position.y = y + h / 2;
      addBox(slab, w, h, d, outer);
      addBox(slab, w * 0.86, h * 0.7, d * 0.9, inner);
      group.add(slab);
    }
    return { group, geometries };
  }

  const [w, h, d] = DIMS[kind];
  addBox(group, w, h, d, outer);
  // A slightly smaller box suggests the block of pages.
  addBox(group, w * 0.92, h * 0.94, d * 0.6, inner, 0.03 * w, 0, 0);
  return { group, geometries };
}
