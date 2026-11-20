import { arrivalLocations, garagePosts, parkingDepth, parkingLocations, parkingWidth, warehouse } from './mapLayout';

export type Point = [number, number, number];
export interface Face { points: Point[]; color: string; stroke: string | null; center: Point }

export const ground: Face[] = [];
export const fixtures: Face[] = [];
const shades = new Map<string, string>();

function shade(color: string, factor: number) {
  const key = color + factor;
  if (!shades.has(key)) {
    const channels = (color.slice(1).match(/../g) ?? []).map(channel => Math.min(255, Math.round(parseInt(channel, 16) * factor)));
    shades.set(key, `rgb(${channels.join(',')})`);
  }
  return shades.get(key)!;
}

function polygon(mesh: Face[], points: Point[], color: string, stroke: string | null = null) {
  mesh.push({ points, color, stroke, center: points.reduce<Point>((sum, point) => {
    point.forEach((value, axis) => { sum[axis] += value / points.length; });
    return sum;
  }, [0, 0, 0]) });
}

export function flat(mesh: Face[], x: number, y: number, z: number, width: number, depth: number, color: string) {
  polygon(mesh, [[x,y,z], [x+width,y,z], [x+width,y,z+depth], [x,y,z+depth]], color);
}

function box(mesh: Face[], x: number, y: number, z: number, w: number, h: number, d: number, color: string, edge: string | null = null) {
  const a: Point = [x,y,z], b: Point = [x+w,y,z], c: Point = [x+w,y,z+d], e: Point = [x,y,z+d];
  const f: Point = [x,y+h,z], g: Point = [x+w,y+h,z], k: Point = [x+w,y+h,z+d], l: Point = [x,y+h,z+d];
  polygon(mesh, [f,g,k,l], shade(color, 1.12), edge);
  polygon(mesh, [e,c,k,l], shade(color, .87), edge);
  polygon(mesh, [b,c,k,g], shade(color, .70), edge);
  polygon(mesh, [a,b,g,f], shade(color, .74), edge);
  polygon(mesh, [a,e,l,f], shade(color, .80), edge);
}

function cylinder(mesh: Face[], x: number, y: number, z: number, radius: number, length: number, color: string, axis: 'x' | 'y' = 'x') {
  const sides = 14;
  const rings = [0, length].map(offset => Array.from({ length: sides }, (_, i): Point => {
    const angle = i * Math.PI * 2 / sides;
    return axis === 'x'
      ? [x + offset, y + Math.cos(angle) * radius, z + Math.sin(angle) * radius]
      : [x + Math.cos(angle) * radius, y + offset, z + Math.sin(angle) * radius];
  }));
  polygon(mesh, rings[0], shade(color, .83));
  polygon(mesh, rings[1], color);
  for (let i = 0; i < sides; i++) {
    const j = (i + 1) % sides;
    polygon(mesh, [rings[0][i], rings[0][j], rings[1][j], rings[1][i]], shade(color, .79 + .21 * Math.cos(i * 2 * Math.PI / sides)));
  }
}

function makeBuilding() {
  box(ground, -10.4, -.65, -5.9, 20.8, .58, 13.2, '#575b54');
  flat(ground, -10.39, -.06, -5.89, 20.78, 13.18, '#8c8c80');
  for (let x = 0; x < 24; x++) {
    for (let z = 0; z < 14; z++) {
      const tone = ['#a9aaa0', '#a6a79d', '#abaca1', '#a8a99f'][(x * 3 + z * 5 + x * z) % 4];
      flat(ground, -9.58 + x * .798, 0, -5.12 + z * .803, .788, .792, tone);
    }
  }
  flat(ground, -9.6, .005, 6.2, 19.2, .72, '#595d55');
  for (let x = -9; x < 9.6; x += .57) {
    flat(ground, x, .008, 6.53, .27, .08, '#d0ad63');
  }

  for (let segment = 0; segment < 12; segment++) {
    const x = -9.69 + segment * 1.61;
    box(fixtures, x, 0, -5.44, 1.606, .71, .35, '#646c61');
    box(fixtures, x, .71, -5.44, 1.606, .09, .35, '#b76b44');
    box(fixtures, x, .8, -5.44, 1.606, 2.35, .35, '#e5dfc8');
    box(fixtures, x, 3.15, -5.47, 1.606, .13, .41, '#5f655a');
  }
  for (let segment = 0; segment < 11; segment++) {
    const z = -5.09 + segment * .83;
    box(fixtures, -9.7, 0, z, .34, .71, .827, '#646c61');
    box(fixtures, -9.7, .71, z, .34, .09, .827, '#b76b44');
    box(fixtures, -9.7, .8, z, .34, 2.35, .827, '#ddd8c4');
    box(fixtures, -9.73, 3.15, z, .4, .13, .827, '#5f655a');
  }
  for (const x of [-6.05, 0, 6.05]) {
    const frameX = x - 1.48;
    box(fixtures, frameX, 1.75, -5.08, 2.96, 1.02, .12, '#555e59');
    for (let i = 0; i < 3; i++) {
      const paneX = frameX + .08 + i * .94;
      box(fixtures, paneX, 1.82, -4.95, .9, .88, .025, '#92a8a7');
      box(fixtures, paneX + .06, 1.92, -4.92, .50, .035, .02, '#bac8bf');
    }
    box(fixtures, x - 1.52, 1.69, -5.06, 3.04, .10, .24, '#c6c5b0');
    box(fixtures, x - .61, 2.97, -5.05, 1.22, .10, .24, '#fff4c8');
    makeBench(x);
  }
  for (const x of [-9.7, -3.04, 3.04, 9.30]) {
    box(fixtures, x, 0, -5.12, .34, 3.26, .34, '#70776a');
    box(fixtures, x, 0, 4.36, .34, 2.98, .37, '#666e63');
    box(fixtures, x, 0, 4.33, .35, .51, .42, '#c79951');
  }
  box(fixtures, -9.31, 0, .4, .49, 1.92, 1.4, '#777f72');
  for (let i = 0; i < 2; i++) {
    box(fixtures, -8.81, .08, .46 + i * .66, .05, 1.78, .6, '#92988a');
    box(fixtures, -8.75, 1.01, .69 + i * .66, .04, .22, .05, '#484e45');
  }
  for (let i = 0; i < 4; i++) {
    cylinder(fixtures, 8.28, .045 + i * .20, -2.8, .49, .18, '#343934', 'y');
    cylinder(fixtures, 8.28, .224 + i * .20, -2.8, .25, .012, '#666a60', 'y');
  }
  box(fixtures, 8.08, 0, -3.94, .77, .5, .52, '#a95038');
  box(fixtures, 8.11, .49, -3.92, .71, .07, .48, '#40483e');
}

function makeBench(x: number) {
  box(fixtures, x - 1.49, .09, -4.73, 2.98, .72, .60, '#788274');
  box(fixtures, x - 1.55, .81, -4.78, 3.10, .13, .71, '#50574b');
  for (let drawer = 0; drawer < 5; drawer++) {
    const left = x - 1.44 + drawer * .58;
    box(fixtures, left, .22, -4.11, .55, .52, .042, '#919989');
    box(fixtures, left + .12, .57, -4.06, .31, .042, .035, '#c9cdb9');
  }
  box(fixtures, x - .28, .95, -4.57, .56, .28, .31, '#af5c40');
  box(fixtures, x + .58, .95, -4.58, .30, .21, .36, '#d4ae62');
}

function makeLift(x: number, y: number, mesh: Face[]) {
  for (const side of [-1, 1]) {
    const column = x + side * 1.74;
    box(fixtures, column - .27, .02, -.32, .54, .10, .66, '#4a5046');
    box(fixtures, column - .14, .12, -.16, .28, 2.42, .34, '#ce9451');
    box(fixtures, column - .17, 2.50, -.19, .34, .12, .40, '#4c5449');
    box(fixtures, column - .07, .6, .185, .14, 1.62, .025, '#766645');
    const inward = x + side * .96;
    box(mesh, Math.min(column, inward), y + .12, -.12, Math.abs(column - inward), .12, .26, '#9c6f44');
    box(mesh, inward - .075, y + .12, -.90, .15, .09, 1.80, '#b47f49');
  }
}

function makeCar(mesh: Face[], x: number, y: number, z: number, color: string) {
  flat(mesh, x - 1.06, y + .22, z - 2, 2.12, 4, '#373c38');
  for (const side of [-1, 1]) {
    for (const axle of [-1.38, 1.34]) {
      const tireX = x + (side < 0 ? -1.05 : .83);
      cylinder(mesh, tireX, y + .34, z + axle, .36, .24, '#292c2b');
      cylinder(mesh, tireX + (side < 0 ? -.017 : .245), y + .34, z + axle, .213, .014, '#989e94');
    }
  }
  const hull: Point[] = [
    [-2.13,.68,.83], [-1.91,.84,1.00], [-.88,.93,1.00],
    [.98,.91,1.00], [1.85,.75,.98], [2.12,.64,.84],
  ];
  const point = (slice: Point, side: number, lower = false): Point => [x + side * slice[2], y + (lower ? .35 : slice[1]), z + slice[0]];
  for (let i = 0; i < hull.length - 1; i++) {
    const a = hull[i], b = hull[i + 1];
    polygon(mesh, [point(a,-1), point(a,1), point(b,1), point(b,-1)], shade(color, 1.13));
    for (const side of [-1, 1]) {
      polygon(mesh, [point(a,side), point(b,side), point(b,side,true), point(a,side,true)], shade(color,.89));
    }
  }
  for (const [index, end] of [[0,-1], [hull.length-1,1]]) {
    const row = hull[index];
    polygon(mesh, [point(row,-1), point(row,1), point(row,1,true), point(row,-1,true)], shade(color,.80));
    for (const side of [-1, 1]) {
      box(mesh, x + side * .62 - .16, y + .54, z + row[0] + end * .025 - .035, .32, .11, .07, end > 0 ? '#f9efcc' : '#db6050');
    }
    box(mesh, x - .30, y + .42, z + row[0] + end * .027 - .025, .6, .085, .05, '#414742');
  }
  const cabin: Point[] = [
    [-1.38,.89,.80], [-.70,1.45,.70], [.51,1.45,.70], [1.19,.90,.81],
  ];
  for (let i = 0; i < cabin.length - 1; i++) {
    const a = cabin[i], b = cabin[i + 1];
    polygon(mesh, [point(a,-1), point(a,1), point(b,1), point(b,-1)],
      i === 1 ? shade(color, 1.21) : '#3e5659', shade(color, .90));
  }
  for (const side of [-1, 1]) {
    polygon(mesh, [point(cabin[0],side), point(cabin[1],side), point(cabin[2],side), point(cabin[3],side)], '#445c5e', shade(color, .83));
    polygon(mesh, [[x+side*.788,y+.9,z+.04],[x+side*.706,y+1.45,z+.04],
      [x+side*.706,y+1.45,z+.11],[x+side*.793,y+.9,z+.11]], shade(color, .90));
    box(mesh, x + side * .99 - .09, y + .91, z + .79, .18, .13, .24, color);
  }
}

function makeParking() {
  box(ground, 10.4, -.65, -5.85, 18.3, .58, 18.1, '#555b56');
  flat(ground, 10.41, -.059, -5.84, 18.28, 18.08, '#747c75');
  flat(ground, 11.6, -.052, .7, 16.8, 5.15, '#646e67');
  flat(ground, 11.63, -.049, -5.55, 16.68, .34, '#a9aa97');
  flat(ground, 11.63, -.049, 11.9, 16.68, .2, '#a9aa97');
  for (let x = 12.55; x < 28; x += 1.45) flat(ground, x, -.045, 3.54, .79, .075, '#c0c4b1');
  for (const place of parkingLocations) {
    flat(ground, place.x - parkingWidth / 2, -.04, place.z - parkingDepth / 2,
      parkingWidth, parkingDepth, '#828981');
  }
  box(ground, -10.4, -.65, 7.1, 18.1, .58, 9.5, '#556368');
  flat(ground, -10.38, -.059, 7.12, 18.06, 9.46, '#798b90');
  flat(ground, -10.15, -.048, 16.16, 17.58, .23, '#b4c5c2');
  for (const place of arrivalLocations) {
    flat(ground, place.x - parkingWidth / 2, -.04, place.z - parkingDepth / 2, parkingWidth, parkingDepth, '#899fa5');
  }
}

function makeWarehouse() {
  const { left, right, back, front } = warehouse;
  box(ground, left, -.63, back, right - left, .58, front - back, '#5c665f');
  flat(ground, left + .04, -.04, back + .04, right - left - .08, front - back - .08, '#a6b3a5');
  flat(ground, 11.3, -.03, front - .7, 10, .44, '#c0caac');
  box(fixtures, left, 0, back, right - left, 2.8, .25, '#d6dcc9');
  box(fixtures, left, 0, back + .25, .22, 2.8, 3.3, '#c4cebb');
  box(fixtures, left, 1.1, back + .25, right - left, .12, .045, '#769786');

  for (const x of [11.28, 14.68]) {
    const z = -11.32;
    const width = 2.87;
    for (const dx of [0, width - .10]) {
      for (const dz of [0, .95]) box(fixtures, x + dx, 0, z + dz, .10, 2.16, .10, '#507364');
    }
    for (const height of [.25, .91, 1.57]) {
      box(fixtures, x, height, z, width, .09, 1.06, '#607a6c');
      box(fixtures, x + .21, height + .09, z + .15, .73, .48, .7, '#b78b55');
      box(fixtures, x + 1.10, height + .09, z + .16, .58, .42, .66, '#95a685');
      box(fixtures, x + 1.94, height + .09, z + .19, .61, .43, .63, '#c7a976');
    }
  }

  // Stockkeeper's desk, screen and chair face the open side of the warehouse.
  box(fixtures, 18.15, .88, -8.48, 2.72, .12, 1.31, '#c7a579');
  box(fixtures, 18.24, 0, -8.36, .15, .88, 1.05, '#64746a');
  box(fixtures, 20.54, 0, -8.36, .19, .88, 1.05, '#64746a');
  box(fixtures, 19.66, 1, -7.68, .62, .055, .41, '#404f46');
  box(fixtures, 19.89, 1.055, -7.55, .13, .29, .11, '#404f46');
  box(fixtures, 19.54, 1.31, -7.57, .83, .53, .10, '#3b4e45');
  box(fixtures, 19.59, 1.36, -7.46, .73, .42, .018, '#8eb9ab');
  box(fixtures, 19.62, 1.0, -8.01, .65, .043, .18, '#405448');
  box(fixtures, 18.53, 1.0, -7.8, .43, .057, .53, '#e9dfc3');

  box(fixtures, 18.72, .38, -9.43, .79, .12, .72, '#40534a');
  box(fixtures, 18.72, .5, -9.47, .79, .8, .13, '#465c50');
  box(fixtures, 19.05, .07, -9.13, .14, .32, .14, '#494e4a');
  box(fixtures, 18.89, .49, -9.13, .48, .76, .55, '#476e5b');
  box(fixtures, 18.83, .96, -8.95, .16, .17, .57, '#486d5a');
  box(fixtures, 19.31, .96, -8.95, .16, .17, .66, '#486d5a');
  box(fixtures, 18.85, .98, -8.38, .13, .11, .17, '#be916e');
  box(fixtures, 19.32, .98, -8.29, .13, .11, .17, '#be916e');
  cylinder(fixtures, 19.14, 1.18, -8.88, .11, .18, '#ca9d79', 'y');
  cylinder(fixtures, 19.14, 1.32, -8.88, .23, .39, '#ca9d79', 'y');
  cylinder(fixtures, 19.14, 1.62, -8.9, .245, .12, '#43453a', 'y');
}

makeBuilding();
makeParking();
makeWarehouse();

export const lifts = garagePosts.map(post => {
  const arms: Face[] = [];
  makeLift(post.x, 0, arms);
  return arms;
});

const carColors = ['#b74e39', '#5b8385', '#bf954f', '#46679a', '#b1b1a2'];
export const carModels = carColors.map(color => {
  const model: Face[] = [];
  makeCar(model, 0, 0, 0, color);
  return model;
});
