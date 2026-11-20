'use strict';

const canvas = document.querySelector('#garage');
const ctx = canvas.getContext('2d');
const stage = document.querySelector('.scene');
const posts = [
  { name: 'Диагностика', x: -6.05, color: '#bc4f35' },
  { name: 'Слесарный пост', x: 0, color: '#66868c' },
  { name: 'Шиномонтаж', x: 6.05, color: '#c99a46' },
];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
const initialView = { angle: .43, tilt: .67, zoom: 1 };
const view = { ...initialView };
const markerList = document.querySelector('#markers');
let selected = 0;
let frame = 0;
let viewport;

posts.forEach((post, index) => {
  post.busy = false;

  const marker = document.createElement('button');
  marker.className = 'marker';
  marker.type = 'button';
  marker.textContent = `Пост ${index + 1}`;
  marker.setAttribute('aria-label', `Пост ${index + 1}, ${post.name}`);
  marker.addEventListener('click', () => {
    selectPost(index);
    parent.postMessage({ type: 'bay-selected', id: index + 1 }, location.origin);
  });
  markerList.append(marker);
  post.marker = marker;
});

function selectPost(index) {
  selected = index;
  updateMarkers();
  scheduleDraw();
}

function updateMarkers() {
  for (const [index, post] of posts.entries()) {
    post.marker.setAttribute('aria-pressed', String(index === selected));
  }
}

let receivedBays = false;
window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== parent || event.data?.type !== 'workshop-bays') return;
  for (const bay of event.data.bays) {
    const post = posts[bay.id - 1];
    if (!post) continue;
    const busy = Boolean(bay.status);
    if (receivedBays && busy !== post.busy && !reduceMotion.matches) {
      post.transition = { start: performance.now(), entering: busy };
    }
    post.busy = busy;
  }
  receivedBays = true;
  selectPost(event.data.selected - 1);
});

const ground = [];
const fixtures = [];
const shades = new Map();

function shade(color, factor) {
  const key = color + factor;
  if (!shades.has(key)) {
    const channels = color.slice(1).match(/../g).map(channel => Math.min(255, Math.round(parseInt(channel, 16) * factor)));
    shades.set(key, `rgb(${channels.join(',')})`);
  }
  return shades.get(key);
}

function polygon(mesh, points, color, stroke = null) {
  mesh.push({ points, color, stroke, center: points.reduce((sum, point) => {
    point.forEach((value, axis) => { sum[axis] += value / points.length; });
    return sum;
  }, [0, 0, 0]) });
}

function flat(mesh, x, y, z, width, depth, color) {
  polygon(mesh, [[x,y,z], [x+width,y,z], [x+width,y,z+depth], [x,y,z+depth]], color);
}

function box(mesh, x, y, z, w, h, d, color, edge = null) {
  const a = [x,y,z], b = [x+w,y,z], c = [x+w,y,z+d], e = [x,y,z+d];
  const f = [x,y+h,z], g = [x+w,y+h,z], k = [x+w,y+h,z+d], l = [x,y+h,z+d];
  polygon(mesh, [f,g,k,l], shade(color, 1.12), edge);
  polygon(mesh, [e,c,k,l], shade(color, .87), edge);
  polygon(mesh, [b,c,k,g], shade(color, .70), edge);
  polygon(mesh, [a,b,g,f], shade(color, .74), edge);
  polygon(mesh, [a,e,l,f], shade(color, .80), edge);
}

function cylinder(mesh, x, y, z, radius, length, color, axis = 'x') {
  const sides = 14;
  const rings = [0, length].map(offset => Array.from({ length: sides }, (_, i) => {
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

function makeBench(x) {
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

function makeLift(x, y, mesh) {
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

function makeCar(mesh, x, y, z, color) {
  flat(mesh, x - 1.06, y + .22, z - 2, 2.12, 4, '#373c38');
  for (const side of [-1, 1]) {
    for (const axle of [-1.38, 1.34]) {
      const tireX = x + (side < 0 ? -1.05 : .83);
      cylinder(mesh, tireX, y + .34, z + axle, .36, .24, '#292c2b');
      cylinder(mesh, tireX + (side < 0 ? -.017 : .245), y + .34, z + axle, .213, .014, '#989e94');
    }
  }
  const hull = [
    [-2.13,.68,.83], [-1.91,.84,1.00], [-.88,.93,1.00],
    [.98,.91,1.00], [1.85,.75,.98], [2.12,.64,.84],
  ];
  const point = (slice, side, lower = false) => [x + side * slice[2], y + (lower ? .35 : slice[1]), z + slice[0]];
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
  const cabin = [
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

makeBuilding();
for (const post of posts) {
  const mesh = [];
  if (post !== posts[2]) makeLift(post.x, 0, mesh);
  post.arms = mesh;
  const localCar = [];
  makeCar(localCar, post.x, 0, 0, post.color);
  post.model = localCar;
}

function camera() {
  return {
    cs: Math.cos(view.angle), sn: Math.sin(view.angle),
    ce: Math.cos(view.tilt), se: Math.sin(view.tilt),
    scale: Math.min(viewport.width / 24.4, viewport.height / 17.3) * view.zoom,
    x: viewport.width * .50, y: viewport.height * .51,
  };
}

function project([x, y, z], cam) {
  const distance = x * cam.sn + z * cam.cs;
  return [
    cam.x + (x * cam.cs - z * cam.sn) * cam.scale,
    cam.y + (distance * cam.se - y * cam.ce) * cam.scale,
    distance * cam.ce + y * cam.se,
  ];
}

function drawFace(face, cam, lift = 0, travel = 0) {
  ctx.beginPath();
  for (const [index, [x,y,z]] of face.points.entries()) {
    const [px,py] = project([x, y + lift, z + travel], cam);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = face.color;
  ctx.fill();
  ctx.strokeStyle = face.stroke || face.color;
  ctx.lineWidth = face.stroke ? Math.max(1, cam.scale / 28) : .45;
  ctx.stroke();
}

function drawShadow(cam, x, z, width, depth, opacity) {
  const [px,py] = project([x, -.013, z], cam);
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(width * cam.scale, depth * cam.scale * cam.se);
  const gradient = ctx.createRadialGradient(0, 0, .26, 0, 0, 1);
  gradient.addColorStop(0, `rgba(35,42,33,${opacity})`);
  gradient.addColorStop(1, 'rgba(35,42,33,0)');
  ctx.fillStyle = gradient;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}

function drawMarkings(cam) {
  const markings = [];
  for (const [index, post] of posts.entries()) {
    const x = post.x;
    const active = index === selected;
    const paint = active ? '#f4d78c' : '#dedbd0';
    if (active) flat(markings, x - 2.55, .014, -3.55, 5.1, 7.82, '#b5b39e');
    flat(markings, x - 2.55, .02, -3.55, .075, 7.82, paint);
    flat(markings, x + 2.47, .02, -3.55, .075, 7.82, paint);
    flat(markings, x - 2.55, .02, -3.55, 5.1, .075, paint);
    for (let i = 0; i < 8; i++) flat(markings, x - 2.5 + i * .65, .021, 4.19, .39, .075, paint);
  }
  markings.forEach(face => drawFace(face, cam));
  ctx.font = '800 1px "Segoe UI", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const [ux,uy] = project([1,.024,0], cam);
  const [vx,vy] = project([0,.024,1], cam);
  const [ox,oy] = project([0,.024,0], cam);
  for (const [index, post] of posts.entries()) {
    const [x,y] = project([post.x,.024,4.92], cam);
    ctx.save();
    ctx.transform(ux-ox,uy-oy,vx-ox,vy-oy,x,y);
    ctx.fillStyle = index === selected ? '#f8e3a8' : '#e0dfd2';
    ctx.fillText(`0${index+1}`, 0, 0);
    ctx.restore();
  }
}

function draw(now) {
  frame = 0;
  const cam = camera();
  ctx.clearRect(0, 0, viewport.width, viewport.height);
  drawShadow(cam, .32, 1.0, 12.5, 9.8, .25);
  ground.forEach(face => drawFace(face, cam));
  drawMarkings(cam);
  const visible = [];
  const add = (geometry, lift = 0, travel = 0) => {
    for (const face of geometry) {
      const [x,y,z] = face.center;
      const depth = (x * cam.sn + (z + travel) * cam.cs) * cam.ce + (y + lift) * cam.se;
      visible.push({ face, lift, travel, depth });
    }
  };
  add(fixtures);
  for (const [index, post] of posts.entries()) {
    let travel = 0;
    let occupancy = Number(post.busy);
    if (post.transition) {
      const { start, entering } = post.transition;
      const progress = Math.max(0, Math.min((now - start) / 1100, 1));
      const eased = progress * progress * (3 - 2 * progress);
      occupancy = entering ? eased : 1 - eased;
      travel = (1 - occupancy) * 9;
      if (progress === 1) post.transition = null;
      else scheduleDraw();
    }
    const lift = index === 1 ? Math.max(0, occupancy - .56) * 1.45 : 0;
    if (post.busy || post.transition) {
      drawShadow(cam, post.x, travel, 1.63, 2.65, .31);
      add(post.model, lift, travel);
    }
    add(post.arms, lift);
    const [x,y] = project([post.x, .18, 3.14], cam);
    post.marker.style.left = `${x}px`;
    post.marker.style.top = `${y}px`;
    post.marker.hidden = x < 18 || y < 35 || x > viewport.width - 18 || y > viewport.height - 48;
  }
  visible.sort((a,b) => a.depth - b.depth);
  visible.forEach(({ face, lift, travel }) => drawFace(face, cam, lift, travel));
}

function scheduleDraw() {
  if (!frame && viewport) frame = requestAnimationFrame(draw);
}

function resize() {
  const { width, height } = stage.getBoundingClientRect();
  const ratio = Math.min(devicePixelRatio || 1, 2);
  viewport = { width, height };
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  scheduleDraw();
}

function zoomBy(amount) {
  view.zoom = Math.max(.71, Math.min(1.65, view.zoom * amount));
  scheduleDraw();
}

document.querySelector('#zoom-in').addEventListener('click', () => zoomBy(1.15));
document.querySelector('#zoom-out').addEventListener('click', () => zoomBy(1 / 1.15));
document.querySelector('#reset-view').addEventListener('click', () => {
  Object.assign(view, initialView);
  scheduleDraw();
});
let dragging = null;
function rotateTo(angle, tilt) {
  view.angle = Math.max(.10, Math.min(.81, angle));
  view.tilt = Math.max(.44, Math.min(1.1, tilt));
  scheduleDraw();
}

canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0 || !event.isPrimary) return;
  canvas.setPointerCapture(event.pointerId);
  dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, ...view };
});
canvas.addEventListener('pointermove', event => {
  if (event.pointerId !== dragging?.id) return;
  rotateTo(dragging.angle + (event.clientX - dragging.x) * .005,
    dragging.tilt + (event.clientY - dragging.y) * .005);
});
canvas.addEventListener('lostpointercapture', event => {
  if (event.pointerId === dragging?.id) dragging = null;
});
const cameraKeys = new Map([
  ['ArrowLeft', [-.08, 0]], ['ArrowRight', [.08, 0]],
  ['ArrowUp', [0, -.08]], ['ArrowDown', [0, .08]],
]);
canvas.addEventListener('keydown', event => {
  const step = cameraKeys.get(event.key);
  if (!step) return;
  event.preventDefault();
  rotateTo(view.angle + step[0], view.tilt + step[1]);
});
updateMarkers();
new ResizeObserver(resize).observe(stage);
