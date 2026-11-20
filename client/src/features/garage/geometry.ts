import { arrivalLocations, desks, garagePosts, parkingAisle, parkingDepth, parkingEntrance, parkingLocations, parkingWidth, parkingZones, siteBounds } from './mapLayout';

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

function makeSite() {
  const { left, right, back, front } = siteBounds;
  box(ground, left, -.93, back, right - left, .70, front - back, '#5e6b64');
  flat(ground, left + .03, -.216, back + .03, right - left - .06, front - back - .06, '#b9c0b5');
  flat(ground, parkingEntrance - 1.8, -.18, back + .4, 3.6, front - back - .8, '#77827d');
  flat(ground, -8, -.17, parkingAisle - 2.5, parkingEntrance + 8.8, 5, '#77827d');
  flat(ground, -10.35, -.17, 5.6, parkingEntrance + 11.95, 3.65, '#77827d');
  for (let z = back + 1; z < front - 1; z += 2.4) {
    flat(ground, parkingEntrance - .027, -.164, z, .054, 1.04, '#c8c8af');
  }
  for (let x = -7.4; x < parkingEntrance - 2; x += 1.8) {
    flat(ground, x, -.163, parkingAisle, .84, .06, '#c8c8af');
  }

  for (const zone of parkingZones) {
    const arrival = zone.kind === 'arrival';
    box(ground, -7.7, -.35, zone.z - 2.7, 16.9, .27, 5.4, arrival ? '#526a75' : '#515d58');
    flat(ground, -7.68, -.068, zone.z - 2.68, 16.86, 5.36, arrival ? '#77909d' : '#747f77');
  }
  for (const place of [...parkingLocations, ...arrivalLocations]) {
    flat(ground, place.x - parkingWidth / 2, -.04, place.z - parkingDepth / 2,
      parkingWidth, parkingDepth, place.kind === 'arrival' ? '#8ca5b0' : '#849086');
  }

  flat(ground, -17.95, -.16, -24.3, 7.35, 17.5, '#a0b49b');
  flat(ground, -17.9, -.16, 6.02, 7.4, 2.9, '#d6c9a9');
  flat(ground, -10.47, -.155, 6.02, 2.4, 6.4, '#d6c9a9');
  for (const z of [-22.9, -18.4, -13.8, -9.1]) {
    cylinder(fixtures, -15.4, -.15, z, .14, 1.45, '#796b53', 'y');
    cylinder(fixtures, -15.4, .98, z, .79, 1.43, '#6d8b70', 'y');
    cylinder(fixtures, -15.47, 1.84, z, .59, .65, '#7b9978', 'y');
  }
}

function desk(x: number, z: number, accent: string) {
  box(fixtures, x, 0, z, 2.66, .87, .94, accent);
  box(fixtures, x - .08, .87, z - .07, 2.82, .13, 1.12, '#c7a579');
  box(fixtures, x + 1.37, 1, z + .36, .58, .07, .34, '#404f46');
  box(fixtures, x + 1.58, 1.07, z + .48, .14, .28, .12, '#404f46');
  box(fixtures, x + 1.22, 1.29, z + .48, .84, .53, .12, '#3b4e45');
  box(fixtures, x + 1.27, 1.34, z + .6, .74, .43, .02, '#8eb9ab');
  box(fixtures, x + .30, 1, z + .4, .46, .06, .39, '#e9dfc3');
  box(fixtures, x + .84, .40, z - .93, .76, .12, .71, '#4b6258');
  box(fixtures, x + .84, .48, z - .95, .76, .65, .13, '#4b6258');
  cylinder(fixtures, x + 1.22, .01, z - .58, .13, .42, '#49554e', 'y');
}

function makeOffices() {
  for (const [name, room] of Object.entries(desks)) {
    const { left, right, back, front } = room;
    const stock = name === 'warehouse';
    box(ground, left, -.65, back, right - left, .58, front - back, '#5c665f');
    flat(ground, left + .04, -.04, back + .04, right - left - .08, front - back - .08, stock ? '#a6b3a5' : '#c4b99c');
    box(fixtures, left, 0, back, right - left, 2.63, .22, '#d6dcc9');
    box(fixtures, left, 0, back + .22, .23, 2.63, 3.72, '#c4cebb');
    box(fixtures, left, 1.06, back + .23, right - left, .12, .04, stock ? '#769786' : '#a88353');
    if (stock) {
      const w = 2.46;
      for (const x of [left + .43, left + 3.08]) {
        for (const dx of [0, w - .10]) {
          for (const dz of [0, .74]) box(fixtures, x + dx, 0, back + .47 + dz, .10, 2.15, .10, '#507364');
        }
        for (const h of [.25, .91, 1.57]) {
          box(fixtures, x, h, back + .47, w, .09, .83, '#607a6c');
          box(fixtures, x + .21, h + .09, back + .59, .73, .46, .57, '#b78b55');
          box(fixtures, x + 1.1, h + .09, back + .59, .66, .39, .59, '#95a685');
        }
      }
    } else {
      for (const x of [left + .56, left + 1.56]) {
        box(fixtures, x, .41, back + .6, .82, .18, .78, '#8e6049');
        box(fixtures, x, .56, back + .6, .82, .6, .14, '#a16f54');
        box(fixtures, x + .12, 0, back + .72, .58, .41, .54, '#695747');
      }
    }
    desk(right - 3.15, front - 1.78, stock ? '#64796a' : '#9a744c');
  }
}

makeSite();
makeBuilding();
makeOffices();

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
