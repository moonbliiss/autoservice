import type { Bay } from '../../api/types';
import { fixtures, flat, geometry, ground, type Face, type Point } from './geometry';

interface Camera { cs: number; sn: number; ce: number; se: number; scale: number; x: number; y: number }
interface Transition { start: number; entering: boolean }
export interface MarkerPosition { x: number; y: number; hidden: boolean }

const initialView = { angle: .43, tilt: .67, zoom: 1 };
const cameraKeys = new Map([
  ['ArrowLeft', [-.08, 0]], ['ArrowRight', [.08, 0]],
  ['ArrowUp', [0, -.08]], ['ArrowDown', [0, .08]],
]);

export function mountGarage(
  canvas: HTMLCanvasElement, stage: HTMLElement, onMarkers: (positions: MarkerPosition[]) => void,
) {
  const context = canvas.getContext('2d');
  if (!context) return null;
  const ctx = context;
  const view = { ...initialView };
  const posts = geometry.map(post => ({ ...post, busy: false, transition: null as Transition | null }));
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let selected = 0;
  let frame = 0;
  let viewport = { width: 0, height: 0 };
  let receivedBays = false;

  function camera(): Camera {
    return {
      cs: Math.cos(view.angle), sn: Math.sin(view.angle),
      ce: Math.cos(view.tilt), se: Math.sin(view.tilt),
      scale: Math.min(viewport.width / 24.4, viewport.height / 17.3) * view.zoom,
      x: viewport.width * .50, y: viewport.height * .51,
    };
  }

  function project([x, y, z]: Point, cam: Camera): Point {
    const distance = x * cam.sn + z * cam.cs;
    return [
      cam.x + (x * cam.cs - z * cam.sn) * cam.scale,
      cam.y + (distance * cam.se - y * cam.ce) * cam.scale,
      distance * cam.ce + y * cam.se,
    ];
  }

  function drawFace(face: Face, cam: Camera, lift = 0, travel = 0) {
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

  function drawShadow(cam: Camera, x: number, z: number, width: number, depth: number, opacity: number) {
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

  function drawMarkings(cam: Camera) {
    const markings: Face[] = [];
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

  function draw(now: number) {
    frame = 0;
    const cam = camera();
    ctx.clearRect(0, 0, viewport.width, viewport.height);
    drawShadow(cam, .32, 1.0, 12.5, 9.8, .25);
    ground.forEach(face => drawFace(face, cam));
    drawMarkings(cam);
    const visible: { face: Face; lift: number; travel: number; depth: number }[] = [];
    const markers: MarkerPosition[] = [];
    const add = (geometry: Face[], lift = 0, travel = 0) => {
      for (const face of geometry) {
        const [x,y,z] = face.center;
        const depth = (x * cam.sn + (z + travel) * cam.cs) * cam.ce + (y + lift) * cam.se;
        visible.push({ face, lift, travel, depth });
      }
    };
    add(fixtures);
    for (const post of posts) {
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
      const lift = Math.max(0, occupancy - .56) * 1.45;
      if (post.busy || post.transition) {
        drawShadow(cam, post.x, travel, 1.63, 2.65, .31);
        add(post.model, lift, travel);
      }
      add(post.arms, lift);
      const [x,y] = project([post.x, .18, 3.14], cam);
      markers.push({ x, y, hidden: x < 18 || y < 35 || x > viewport.width - 18 || y > viewport.height - 48 });
    }
    visible.sort((a,b) => a.depth - b.depth);
    visible.forEach(({ face, lift, travel }) => drawFace(face, cam, lift, travel));
    onMarkers(markers);
  }

  function scheduleDraw() {
    if (!frame && viewport.width && viewport.height) frame = requestAnimationFrame(draw);
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

  function zoomBy(amount: number) {
    view.zoom = Math.max(.71, Math.min(1.65, view.zoom * amount));
    scheduleDraw();
  }


  let dragging: { id: number; x: number; y: number; angle: number; tilt: number } | null = null;
  function rotateTo(angle: number, tilt: number) {
    view.angle = Math.max(.10, Math.min(.81, angle));
    view.tilt = Math.max(.44, Math.min(1.1, tilt));
    scheduleDraw();
  }

  const events = new AbortController();
  const options = { signal: events.signal };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !event.isPrimary) return;
    canvas.setPointerCapture(event.pointerId);
    dragging = { id: event.pointerId, x: event.clientX, y: event.clientY, ...view };
  }, options);
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== dragging?.id) return;
    rotateTo(dragging.angle + (event.clientX - dragging.x) * .005,
      dragging.tilt + (event.clientY - dragging.y) * .005);
  }, options);
  canvas.addEventListener('lostpointercapture', event => {
    if (event.pointerId === dragging?.id) dragging = null;
  }, options);
  canvas.addEventListener('keydown', event => {
    const step = cameraKeys.get(event.key);
    if (!step) return;
    event.preventDefault();
    rotateTo(view.angle + step[0], view.tilt + step[1]);
  }, options);
  const observer = new ResizeObserver(resize);
  observer.observe(stage);

  return {
    zoomBy,
    reset() {
      Object.assign(view, initialView);
      scheduleDraw();
    },
    update(bays: readonly Bay[], selectedId: number) {
      for (const [index, post] of posts.entries()) {
        const busy = Boolean(bays.find(bay => bay.id === index + 1)?.status);
        if (busy === post.busy) continue;
        post.transition = receivedBays && !reduceMotion.matches ? { start: performance.now(), entering: busy } : null;
        post.busy = busy;
      }
      receivedBays = true;
      selected = selectedId - 1;
      scheduleDraw();
    },
    destroy() {
      observer.disconnect();
      events.abort();
      cancelAnimationFrame(frame);
    },
  };
}
