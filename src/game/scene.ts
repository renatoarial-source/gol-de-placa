/* Cena 3D: campo, gol com rede, bonecos de blocos, bola e torcida (three.js).
 * Toda a animação é feita aqui; quem decide o resultado é o jogo (main.ts) e a física.
 */
import * as THREE from 'three';
import { BALL_R, GOAL_H, HALF, PLAYER_W, WALL_JUMP, ballAt, flightTime, type Outcome, type Shot, type Wall } from './physics';
import type { Kit } from './teams';

const GOAL_W_T = 2 * HALF + 0.24;
const SKINS = ['#ffdbac', '#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#5c3a1e'];
const HAIRS = ['#1d120a', '#4a2a12', '#7a3b10', '#d9a441', '#111111', '#b5651d'];

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const lambert = (color: string | THREE.Texture) =>
  typeof color === 'string' ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshLambertMaterial({ map: color });

export type HairStyle = 'short' | 'long' | 'mohawk' | 'curly' | 'bald';
export const HAIR_STYLES: HairStyle[] = ['short', 'long', 'mohawk', 'curly', 'bald'];
export const SKIN_COLORS = SKINS;
export const HAIR_COLORS = HAIRS;
export const BOOT_COLORS = ['#161616', '#ffffff', '#ff3d00', '#ffd400', '#00c853', '#2979ff', '#e040fb'];
/** "Meu craque": como o boneco da criança aparece. */
export interface Look { skin: number; hair: number; style: HairStyle; boots: number; number: number; name: string }
export type Weather = 'day' | 'night' | 'rain' | 'snow';
export type Crowd = 'full' | 'half' | 'few';

interface Body {
  root: THREE.Group; // posição no campo
  pose: THREE.Group; // inclinação (mergulho do goleiro)
  legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group;
}

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], y = 0, x = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

const faceCache = new Map<string, THREE.Texture>();
function faceTex(skin: string, hair: string): THREE.Texture {
  const k = skin + hair;
  if (!faceCache.has(k)) {
    faceCache.set(k, canvasTex(128, 128, (g) => {
      g.fillStyle = skin; g.fillRect(0, 0, 128, 128);
      g.fillStyle = hair; g.fillRect(0, 0, 128, 22);
      g.fillStyle = '#ffffff'; g.fillRect(30, 46, 22, 24); g.fillRect(76, 46, 22, 24);
      g.fillStyle = '#1b1b1b'; g.fillRect(38, 52, 12, 16); g.fillRect(84, 52, 12, 16);
      g.fillStyle = 'rgba(255,90,90,.35)'; g.fillRect(18, 78, 18, 10); g.fillRect(92, 78, 18, 10);
      g.strokeStyle = '#3a1f12'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.arc(64, 82, 18, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
    }));
  }
  return faceCache.get(k)!;
}

function shirtTex(kit: Kit, color: string, number: number | null, name = ''): THREE.Texture {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 128, 128);
    if (kit.stripe && color === kit.shirt) {
      g.fillStyle = kit.stripe;
      for (let x = 10; x < 128; x += 36) g.fillRect(x, 0, 16, 128);
    }
    if (number !== null) {
      g.font = '900 72px system-ui, sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.55)';
      const y = name ? 78 : 70;
      g.strokeText(String(number), 64, y);
      g.fillStyle = '#ffffff'; g.fillText(String(number), 64, y);
      if (name) {
        g.font = `900 ${name.length > 7 ? 15 : 19}px system-ui, sans-serif`;
        g.lineWidth = 4;
        g.strokeText(name.toUpperCase(), 64, 24);
        g.fillText(name.toUpperCase(), 64, 24);
      }
    }
  });
}

/** Boneco de blocos virado para +z. */
function makeBody(kit: Kit, number: number, seed: number, keeper = false, look?: Look): Body {
  const skin = SKINS[look ? look.skin : seed % SKINS.length];
  const hair = HAIRS[look ? look.hair : (seed * 7 + 3) % HAIRS.length];
  const style: HairStyle = look ? look.style : (['short', 'short', 'curly', 'long', 'mohawk', 'bald'] as HairStyle[])[(seed * 5 + 1) % 6];
  if (look) number = look.number;
  const shirt = keeper ? kit.keeper : kit.shirt;
  const shorts = keeper ? '#1b1b1b' : kit.shorts;
  const socks = keeper ? kit.keeper : kit.socks;
  const mSkin = lambert(skin);
  const mShirt = lambert(shirt);
  const mShirtFront = lambert(shirtTex(kit, shirt, null));
  const mShirtBack = lambert(shirtTex(kit, shirt, number, look?.name ?? ''));
  const mShorts = lambert(shorts);
  const mSocks = lambert(socks);
  const mShoe = lambert(look ? BOOT_COLORS[look.boots] : '#161616');
  const mHair = lambert(hair);
  const mGlove = lambert(keeper ? '#f5f5f5' : skin);

  const root = new THREE.Group();
  const pose = new THREE.Group();
  root.add(pose);

  const leg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.8, 0);
    g.add(box(0.2, 0.3, 0.22, mSkin, -0.15));
    g.add(box(0.21, 0.42, 0.23, mSocks, -0.5));
    g.add(box(0.24, 0.1, 0.34, mShoe, -0.75, 0, 0.04));
    pose.add(g);
    return g;
  };
  const legL = leg(-0.14);
  const legR = leg(0.14);
  pose.add(box(0.58, 0.24, 0.32, mShorts, 0.82));
  // tronco: frente com listras, costas com número
  pose.add(box(0.58, 0.62, 0.32, [mShirt, mShirt, mShirt, mShirt, mShirtFront, mShirtBack], 1.24));
  const arm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 1.5, 0);
    g.add(box(0.18, 0.22, 0.2, mShirt, -0.1));
    g.add(box(0.16, 0.34, 0.18, mSkin, -0.38));
    g.add(box(0.2, 0.14, 0.2, mGlove, -0.6));
    pose.add(g);
    return g;
  };
  const armL = arm(-0.39);
  const armR = arm(0.39);
  const bald = style === 'bald';
  const top = bald ? mSkin : mHair;
  const head = box(0.46, 0.46, 0.46, [mSkin, mSkin, top, mSkin, lambert(faceTex(skin, bald ? skin : hair)), top], 1.8);
  pose.add(head);
  if (style === 'short' || style === 'long') pose.add(box(0.5, 0.1, 0.5, mHair, 2.06));
  if (style === 'long') pose.add(box(0.5, 0.5, 0.1, mHair, 1.82, 0, -0.26));
  if (style === 'mohawk') pose.add(box(0.12, 0.22, 0.48, mHair, 2.12));
  if (style === 'curly') pose.add(box(0.62, 0.3, 0.6, mHair, 2.1, 0, -0.03));
  pose.traverse((o) => { o.castShadow = false; });
  return { root, pose, legL, legR, armL, armR };
}

function resetPose(b: Body) {
  b.pose.position.set(0, 0, 0);
  b.pose.rotation.set(0, 0, 0);
  b.legL.rotation.set(0, 0, 0); b.legR.rotation.set(0, 0, 0);
  b.armL.rotation.set(0, 0, 0); b.armR.rotation.set(0, 0, 0);
}

interface Tween { t: number; dur: number; fn: (k: number) => void; done: () => void }

export interface PlayOpts {
  shot: Shot;
  runUp: number; // segundos de corrida até a bola
  wallU: number | null; // onde bate na barreira
  cpuKeeper: { x: number; y: number } | null; // para onde o goleiro da máquina pula
  decide: () => Outcome; // chamado quando a bola chega no gol
  onKick?: () => void;
  onFlightStart?: (t0: number) => void;
}

export class Pitch {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(60, 1, 0.1, 400);
  private ball: THREE.Mesh;
  private ballShadow: THREE.Mesh;
  private net: THREE.Group;
  private kicker: Body | null = null;
  private keeper: Body | null = null;
  private wall: Body[] = [];
  private crowd!: THREE.InstancedMesh;
  private crowdY!: Float32Array;
  private crowdX!: Float32Array; // posição ao longo do estádio, para a "ola"
  private cheer = 0;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private lamps: THREE.Mesh[] = [];
  private fall: THREE.Points | null = null;
  private weather: Weather = 'day';
  private snowCover!: THREE.Mesh;
  private showcaseBody: Body | null = null;
  private tweens: Tween[] = [];
  private last = performance.now();
  private idle = 0;
  private spot = { sx: 0, sz: 11 };
  private keeperDiving = false;
  private back = { x: 0, z: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.scene.background = new THREE.Color('#7cc4f5');
    this.scene.fog = new THREE.Fog('#a8d8f7', 60, 140);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#3d7a2a', 1.6);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight('#ffffff', 1.5);
    this.sun.position.set(-12, 30, 18);
    this.scene.add(this.sun);

    this.buildPitch();
    this.net = this.buildGoal();
    this.buildStands();
    this.buildLights();
    this.setAtmosphere({ weather: 'day', crowd: 'full', colors: ['#ffd400', '#1f4fc4'] });

    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.5, 24, 16), lambert(this.ballTexture()));
    this.scene.add(this.ball);
    this.ballShadow = this.blob(0.5);
    this.scene.add(this.ballShadow);

    window.addEventListener('resize', () => this.resize());
    this.resize();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      this.tick(dt);
      this.renderer.render(this.scene, this.camera);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  private blob(size: number) {
    const tex = canvasTex(64, 64, (g) => {
      const r = g.createRadialGradient(32, 32, 2, 32, 32, 30);
      r.addColorStop(0, 'rgba(0,0,0,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.012;
    return m;
  }

  private ballTexture() {
    return canvasTex(256, 128, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 256, 128);
      g.fillStyle = '#151515';
      const spots = [[32, 30], [96, 70], [160, 30], [224, 70], [64, 108], [192, 108], [128, 8]];
      for (const [x, y] of spots) {
        g.beginPath();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
          g.lineTo(x + Math.cos(a) * 15, y + Math.sin(a) * 15);
        }
        g.fill();
      }
    });
  }

  private buildPitch() {
    // gramado com faixas e as linhas da grande área
    const W = 70, D = 60, Z0 = -12; // x de -35 a 35; z de -12 a 48
    const px = 16; // pixels por metro
    const tex = canvasTex(W * px, D * px, (g) => {
      for (let i = 0; i < D / 5; i++) {
        g.fillStyle = i % 2 ? '#3f9a3a' : '#48a843';
        g.fillRect(0, i * 5 * px, W * px, 5 * px);
      }
      const X = (x: number) => (x + W / 2) * px;
      const Z = (z: number) => (z - Z0) * px;
      g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 0.12 * px * 1.4;
      g.beginPath(); g.moveTo(0, Z(0)); g.lineTo(W * px, Z(0)); g.stroke();
      g.strokeRect(X(-9.16), Z(0), 18.32 * px, 5.5 * px);
      g.strokeRect(X(-20.16), Z(0), 40.32 * px, 16.5 * px);
      g.beginPath(); g.arc(X(0), Z(11), 9.15 * px, 0.3 * Math.PI, 0.7 * Math.PI); g.stroke();
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(X(0), Z(11), 0.22 * px, 0, Math.PI * 2); g.fill();
    });
    const field = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tex }));
    field.rotation.x = -Math.PI / 2;
    field.position.set(0, 0, Z0 + D / 2);
    this.scene.add(field);
    // camada de neve por cima do gramado (só aparece com neve)
    const snowTex = canvasTex(256, 256, (g) => {
      for (let i = 0; i < 900; i++) {
        g.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.5})`;
        const r = 2 + Math.random() * 10;
        g.beginPath(); g.arc(Math.random() * 256, Math.random() * 256, r, 0, Math.PI * 2); g.fill();
      }
    });
    snowTex.wrapS = snowTex.wrapT = THREE.RepeatWrapping;
    snowTex.repeat.set(10, 9);
    this.snowCover = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: snowTex, transparent: true, depthWrite: false }));
    this.snowCover.rotation.x = -Math.PI / 2;
    this.snowCover.position.set(0, 0.006, Z0 + D / 2);
    this.scene.add(this.snowCover);
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), lambert('#3a8a35'));
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.01;
    this.scene.add(outer);
  }

  private buildGoal(): THREE.Group {
    const white = lambert('#ffffff');
    const t = 0.12;
    this.scene.add(box(t, GOAL_H + t, t, white, (GOAL_H + t) / 2, -HALF - t / 2));
    this.scene.add(box(t, GOAL_H + t, t, white, (GOAL_H + t) / 2, HALF + t / 2));
    this.scene.add(box(GOAL_W_T, t, t, white, GOAL_H + t / 2));
    const netTex = canvasTex(256, 256, (g) => {
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
      for (let i = 0; i <= 256; i += 16) {
        g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 256); g.stroke();
        g.beginPath(); g.moveTo(0, i); g.lineTo(256, i); g.stroke();
      }
    });
    netTex.wrapS = netTex.wrapT = THREE.RepeatWrapping;
    const mk = (w: number, h: number) => {
      const tx = netTex.clone(); tx.repeat.set(w / 1.6, h / 1.6); tx.needsUpdate = true;
      return new THREE.MeshBasicMaterial({ map: tx, transparent: true, side: THREE.DoubleSide, depthWrite: false, opacity: 0.9 });
    };
    const D = 1.8;
    const net = new THREE.Group();
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, GOAL_H), mk(2 * HALF, GOAL_H));
    back.position.set(0, GOAL_H / 2, -D);
    const roof = new THREE.Mesh(new THREE.PlaneGeometry(2 * HALF, D), mk(2 * HALF, D));
    roof.rotation.x = Math.PI / 2; roof.position.set(0, GOAL_H, -D / 2);
    const side = (x: number) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(D, GOAL_H), mk(D, GOAL_H));
      s.rotation.y = Math.PI / 2; s.position.set(x, GOAL_H / 2, -D / 2);
      return s;
    };
    net.add(back, roof, side(-HALF), side(HALF));
    this.scene.add(net);
    return net;
  }

  private buildStands() {
    const grey = lambert('#8a96a3');
    const dark = lambert('#5b6672');
    // arquibancadas atrás do gol, atrás do batedor e dos lados; cada cadeira pode ter um torcedor
    const stands: { g: THREE.Group; w: number }[] = [];
    const stand = (x: number, z: number, w: number, ry: number) => {
      const g = new THREE.Group();
      for (let r = 0; r < 8; r++) g.add(box(w, 0.9, 1.4, r % 2 ? grey : dark, 0.45 + r * 0.9, 0, -r * 1.4));
      g.position.set(x, 0, z); g.rotation.y = ry;
      this.scene.add(g);
      g.updateMatrixWorld();
      stands.push({ g, w });
    };
    stand(0, -16, 64, 0); stand(0, 52, 64, Math.PI); stand(-34, 18, 70, Math.PI / 2); stand(34, 18, 70, -Math.PI / 2);
    const seats: THREE.Vector3[] = [];
    const along: number[] = [];
    let offset = 0;
    for (const s of stands) {
      for (let r = 0; r < 8; r++) {
        for (let x = -s.w / 2 + 1; x < s.w / 2 - 1; x += 0.75) {
          seats.push(new THREE.Vector3(x + (Math.random() - 0.5) * 0.2, 0.9 + r * 0.9 + 0.3, -r * 1.4).applyMatrix4(s.g.matrixWorld));
          along.push(offset + x + s.w / 2);
        }
      }
      offset += s.w;
    }
    // ordem embaralhada: com a torcida "média" ou "pouca", só os primeiros aparecem, espalhados
    const order = seats.map((_, i) => i).sort(() => Math.random() - 0.5);
    const n = seats.length;
    this.crowd = new THREE.InstancedMesh(new THREE.BoxGeometry(0.42, 0.62, 0.36), new THREE.MeshLambertMaterial(), n);
    this.crowdY = new Float32Array(n);
    this.crowdX = new Float32Array(n);
    const m = new THREE.Matrix4();
    order.forEach((si, i) => {
      const p = seats[si];
      m.makeTranslation(p.x, p.y, p.z);
      this.crowd.setMatrixAt(i, m);
      this.crowdY[i] = p.y;
      this.crowdX[i] = along[si];
    });
    this.scene.add(this.crowd);
  }

  /** Torres de iluminação: acesas à noite e na chuva. */
  private buildLights() {
    const pole = lambert('#9aa3ad');
    for (const [x, z] of [[-30, -12], [30, -12], [-30, 46], [30, 46]]) {
      this.scene.add(box(0.6, 26, 0.6, pole, 13, x, z));
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(5, 3, 0.6), new THREE.MeshBasicMaterial({ color: '#d9e3ec' }));
      lamp.position.set(x, 27, z);
      lamp.lookAt(0, 0, 14);
      this.scene.add(lamp);
      this.lamps.push(lamp);
    }
  }

  /** Clima e torcida da partida. colors: cores das camisas dos dois times, para a torcida. */
  setAtmosphere(o: { weather: Weather; crowd: Crowd; colors: string[] }) {
    this.weather = o.weather;
    const sky = { day: '#7cc4f5', night: '#0b1736', rain: '#6f7f8f', snow: '#c9d7e4' }[o.weather];
    const fog = { day: '#a8d8f7', night: '#0b1736', rain: '#7d8b98', snow: '#dbe5ee' }[o.weather];
    (this.scene.background as THREE.Color).set(sky);
    const f = this.scene.fog as THREE.Fog;
    f.color.set(fog);
    // a névoa escurece a arquibancada à noite e deixa a chuva/neve com cara de tempo fechado
    f.near = { day: 60, night: 20, rain: 20, snow: 26 }[o.weather];
    f.far = { day: 140, night: 72, rain: 85, snow: 100 }[o.weather];
    this.hemi.intensity = { day: 1.6, night: 0.4, rain: 0.85, snow: 1.5 }[o.weather];
    this.hemi.color.set(o.weather === 'night' ? '#9fb6ff' : '#ffffff');
    this.hemi.groundColor.set(o.weather === 'night' ? '#0d2a12' : '#3d7a2a');
    this.sun.intensity = { day: 1.5, night: 1.1, rain: 0.55, snow: 0.9 }[o.weather];
    // à noite a "luz do sol" vira a luz dos refletores, vinda de cima
    this.sun.color.set(o.weather === 'night' ? '#fff3d6' : '#ffffff');
    this.sun.position.set(o.weather === 'night' ? 0 : -12, 30, o.weather === 'night' ? 10 : 18);
    for (const l of this.lamps) (l.material as THREE.MeshBasicMaterial).color.set(o.weather === 'night' || o.weather === 'rain' ? '#fffbe0' : '#8f99a3');
    this.snowCover.visible = o.weather === 'snow';

    if (this.fall) { this.scene.remove(this.fall); this.fall.geometry.dispose(); this.fall = null; }
    if (o.weather === 'rain' || o.weather === 'snow') {
      const count = o.weather === 'rain' ? 2600 : 1400;
      const pos = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 50;
        pos[i * 3 + 1] = Math.random() * 20;
        pos[i * 3 + 2] = -6 + Math.random() * 30;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const rain = o.weather === 'rain';
      const dot = canvasTex(32, 32, (c) => {
        if (rain) { c.fillStyle = 'rgba(220,235,255,.9)'; c.fillRect(14, 0, 4, 32); return; }
        const r = c.createRadialGradient(16, 16, 1, 16, 16, 15);
        r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = r; c.fillRect(0, 0, 32, 32);
      });
      this.fall = new THREE.Points(g, new THREE.PointsMaterial({ map: dot, size: rain ? 0.6 : 0.28, transparent: true, depthWrite: false, opacity: rain ? 0.85 : 0.95 }));
      this.scene.add(this.fall);
    }

    // torcida: quantidade e cores dos times (mais um pouco de cores variadas)
    const share = { full: 1, half: 0.5, few: 0.16 }[o.crowd];
    this.crowd.count = Math.floor(this.crowdY.length * share);
    const pal = [...o.colors, ...o.colors, '#ffffff', '#e53935', '#43a047', '#ff8f00', '#8e24aa'];
    const c = new THREE.Color();
    for (let i = 0; i < this.crowdY.length; i++) this.crowd.setColorAt(i, c.set(pal[Math.floor(Math.random() * pal.length)]));
    if (this.crowd.instanceColor) this.crowd.instanceColor.needsUpdate = true;
  }

  /** Vitrine do "Meu craque": o boneco girando de perto. */
  showcase(look: Look, kit: Kit, keeper: boolean) {
    this.tweens = [];
    this.clearPlayers();
    this.ball.visible = false;
    const b = makeBody(kit, look.number, 1, keeper, look);
    b.root.position.set(0, 0, 6);
    this.scene.add(b.root);
    this.showcaseBody = b;
    // o boneco fica na parte de cima da tela; embaixo vêm as opções
    this.camera.position.set(0, 1.6, 13.2);
    this.camera.lookAt(0, -0.9, 6);
    this.camera.fov = 52;
    this.camera.updateProjectionMatrix();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.placeCamera();
  }

  private placeCamera() {
    // mesma câmera para batedor e goleiro: alta, atrás da bola, olhando para o gol
    const { sx, sz } = this.spot;
    const d = Math.hypot(sx, sz);
    const back = 4.2;
    const px = sx + (sx / d) * back, pz = sz + (sz / d) * back;
    this.camera.position.set(px, 3.0, pz);
    this.camera.lookAt(sx * 0.55, 0.3, sz * 0.55);
    // cabem na tela: as duas traves (largura) e a bola e o travessão (altura)
    const cam = this.camera.position;
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const ang = (x: number, y: number, z: number) => fwd.angleTo(new THREE.Vector3(x, y, z).sub(cam));
    const dist = Math.hypot(px, pz);
    const hfov = 2 * Math.atan((HALF + 1.6) / dist);
    const fromWidth = 2 * Math.atan(Math.tan(hfov / 2) / this.camera.aspect);
    const fromHeight = 2 * Math.max(ang(sx, 0, sz), ang(0, GOAL_H + 0.6, 0)) + THREE.MathUtils.degToRad(10);
    this.camera.fov = THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(Math.max(fromWidth, fromHeight)), 38, 90);
    this.camera.updateProjectionMatrix();
  }

  private clearPlayers() {
    for (const b of [this.kicker, this.keeper, this.showcaseBody, ...this.wall]) if (b) this.scene.remove(b.root);
    this.kicker = this.keeper = this.showcaseBody = null;
    this.wall = [];
  }

  /** Arruma a cena para uma cobrança. */
  setup(o: { sx: number; sz: number; view: 'kick' | 'keep'; kickerKit: Kit; keeperKit: Kit; wall: Wall | null; seed: number; look?: Look }) {
    this.tweens = [];
    this.clearPlayers();
    this.spot = { sx: o.sx, sz: o.sz };
    this.keeperDiving = false;
    this.net.scale.set(1, 1, 1);
    this.ball.position.set(o.sx, BALL_R * 1.5, o.sz);
    this.ball.rotation.set(0, 0, 0);
    this.ball.visible = true;

    const dir = Math.atan2(-o.sx, -o.sz); // virado para o gol
    // o boneco da criança usa o "Meu craque" (batedor ou goleiro, conforme o papel)
    this.kicker = makeBody(o.kickerKit, 7 + (o.seed % 4) * 2, o.seed, false, o.view === 'kick' ? o.look : undefined);
    // começa atrás e à esquerda da bola (chuta de pé direito)
    const d = Math.hypot(o.sx, o.sz);
    this.back = { x: o.sx / d, z: o.sz / d };
    this.kicker.root.position.set(o.sx + this.back.x * 1.8 - this.back.z * 1.1, 0, o.sz + this.back.z * 1.8 + this.back.x * 1.1);
    this.kicker.root.rotation.y = dir;
    this.scene.add(this.kicker.root);

    this.keeper = makeBody(o.keeperKit, 1, o.seed + 2, true, o.view === 'keep' ? o.look : undefined);
    this.keeper.root.position.set(0, 0, 0.35);
    this.keeper.root.rotation.y = Math.atan2(o.sx, o.sz) * 0.5;
    this.keeper.armL.rotation.z = 0.5; this.keeper.armR.rotation.z = -0.5;
    this.scene.add(this.keeper.root);

    if (o.wall) {
      for (let i = 0; i < o.wall.count; i++) {
        const b = makeBody(o.keeperKit, [4, 5, 6, 8, 3][i], o.seed + 5 + i);
        b.root.position.set(o.wall.x + (i - (o.wall.count - 1) / 2) * PLAYER_W, 0, o.wall.z);
        b.root.rotation.y = Math.atan2(o.sx - o.wall.x, o.sz - o.wall.z);
        b.armL.rotation.x = -0.4; b.armR.rotation.x = -0.4;
        b.armL.rotation.z = 0.25; b.armR.rotation.z = -0.25;
        this.scene.add(b.root);
        this.wall.push(b);
      }
    }
    // o batedor da máquina mostra a camisa do outro time quando o jogador é goleiro
    this.ballShadow.position.set(o.sx, 0.012, o.sz);
    this.placeCamera();
  }

  private tween(dur: number, fn: (k: number) => void): Promise<void> {
    return new Promise((done) => this.tweens.push({ t: 0, dur: Math.max(0.001, dur), fn, done }));
  }

  private tick(dt: number) {
    const live = this.tweens;
    this.tweens = [];
    for (const tw of live) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k < 1) this.tweens.push(tw); else tw.done();
    }
    // goleiro balança enquanto espera
    this.idle += dt;
    if (this.keeper && !this.keeperDiving) {
      this.keeper.pose.position.x = Math.sin(this.idle * 3) * 0.12;
      this.keeper.pose.position.y = Math.abs(Math.sin(this.idle * 6)) * 0.04;
    }
    // torcida: balança sempre, faz a "ola" de tempos em tempos e pula no gol
    this.cheer = Math.max(0, this.cheer - dt);
    const arr = this.crowd.instanceMatrix.array as Float32Array;
    const wave = (this.idle * 22) % 520; // a ola percorre o estádio (~268 m) e some por um tempo
    const party = Math.min(1, this.cheer);
    for (let i = 0; i < this.crowd.count; i++) {
      const ph = i * 1.7;
      let y = Math.sin(this.idle * 2 + ph) * 0.03;
      const dw = Math.abs(this.crowdX[i] - wave);
      if (dw < 6) y += (1 - dw / 6) * 0.5;
      if (party) y += Math.max(0, Math.sin(this.idle * 12 + ph)) * 0.4 * party;
      arr[i * 16 + 13] = this.crowdY[i] + y;
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    if (this.fall) {
      const p = this.fall.geometry.attributes.position as THREE.BufferAttribute;
      const a = p.array as Float32Array;
      const rain = this.weather === 'rain';
      for (let i = 0; i < p.count; i++) {
        a[i * 3 + 1] -= dt * (rain ? 22 : 2.2);
        if (!rain) a[i * 3] += Math.sin(this.idle + i) * dt * 0.5;
        if (a[i * 3 + 1] < 0) a[i * 3 + 1] += 20;
      }
      p.needsUpdate = true;
    }
    if (this.showcaseBody) this.showcaseBody.root.rotation.y += dt * 0.8;
    this.ballShadow.position.x = this.ball.position.x;
    this.ballShadow.position.z = this.ball.position.z;
    const s = Math.max(0.3, 1 - this.ball.position.y / 6);
    this.ballShadow.scale.set(s, s, s);
  }

  /** O goleiro (do jogador ou da máquina) pula na direção de (x, y) no gol. */
  keeperDive(x: number, y: number, dur: number) {
    const k = this.keeper;
    if (!k || this.keeperDiving) return;
    this.keeperDiving = true;
    const tx = THREE.MathUtils.clamp(x, -HALF, HALF);
    const ty = THREE.MathUtils.clamp(y, 0.1, GOAL_H);
    const from = k.pose.position.x;
    const lean = THREE.MathUtils.clamp(-Math.atan2(tx, Math.max(0.3, ty + 0.4)), -1.45, 1.45);
    const shift = tx - Math.sin(-lean) * 1.1;
    const lift = Math.max(0, ty - 1.3) * 0.7;
    void this.tween(dur, (q) => {
      const e = 1 - (1 - q) * (1 - q);
      k.pose.position.x = from + (shift - from) * e;
      k.pose.position.y = lift * Math.sin(Math.PI * Math.min(1, q * 1.2)) + (Math.abs(lean) > 0.6 ? 0.25 * e : 0);
      k.pose.rotation.z = lean * e;
      k.armL.rotation.z = 0.5 + (Math.PI - 0.5) * e * 0.95;
      k.armR.rotation.z = -0.5 - (Math.PI - 0.5) * e * 0.95;
    });
  }

  /** Ponto do gol (plano z = 0) sob o dedo, para o goleiro do jogador. */
  goalPointAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const v = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, this.camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p)) return null;
    return { x: THREE.MathUtils.clamp(p.x, -HALF - 1, HALF + 1), y: THREE.MathUtils.clamp(p.y, 0, GOAL_H + 0.8) };
  }

  /** Corrida, chute, voo da bola e o desfecho. Resolve com o resultado. */
  async play(o: PlayOpts): Promise<Outcome> {
    const k = this.kicker!;
    const s = o.shot;
    const start = k.root.position.clone();
    const b = this.back;
    const target = new THREE.Vector3(s.sx + b.x * 0.45 - b.z * 0.28, 0, s.sz + b.z * 0.45 + b.x * 0.28);
    await this.tween(o.runUp, (q) => {
      k.root.position.lerpVectors(start, target, q);
      const w = Math.sin(q * Math.PI * 2 * Math.max(1, o.runUp * 4));
      k.legL.rotation.x = w * 0.7; k.legR.rotation.x = -w * 0.7;
      k.armL.rotation.x = -w * 0.6; k.armR.rotation.x = w * 0.6;
    });
    // chute: perna direita vai à frente
    k.legL.rotation.x = 0.3;
    void this.tween(0.25, (q) => { k.legR.rotation.x = -1.4 * Math.sin(Math.PI * q); });
    o.onKick?.();
    for (const b of this.wall) {
      void this.tween(0.5, (q) => { b.root.position.y = WALL_JUMP * Math.sin(Math.PI * q); });
    }
    const T = flightTime(s);
    if (o.cpuKeeper) {
      const c = o.cpuKeeper;
      setTimeout(() => this.keeperDive(c.x, c.y, T * 0.7), T * 150);
    }
    o.onFlightStart?.(performance.now());
    const endU = o.wallU ?? 1;
    const spin = s.speed * 0.6;
    await this.tween(T * endU, (q) => {
      const p = ballAt(s, q * endU);
      this.ball.position.set(p.x, p.y + BALL_R * 0.5, p.z);
      this.ball.rotation.x -= spin * 0.016;
      this.ball.rotation.y += s.bend * 0.05;
    });
    if (o.wallU !== null) {
      await this.bounce(new THREE.Vector3((Math.random() - 0.5) * 3, 3, 7), 0.8);
      return 'wall';
    }
    const res = o.decide();
    const p = this.ball.position.clone();
    if (res === 'goal') {
      void this.tween(0.35, (q) => { this.net.scale.z = 1 + 0.18 * Math.sin(Math.PI * q); });
      await this.tween(0.45, (q) => {
        this.ball.position.set(p.x + s.bend * 0.05 * q, Math.max(BALL_R * 1.5, p.y - q * q * 1.2), p.z - 1.6 * (1 - (1 - q) * (1 - q)));
      });
      this.celebrate(true);
    } else if (res === 'save') {
      const side = Math.sign(p.x || 1);
      await this.bounce(new THREE.Vector3(side * 4, 3.5, 5), 0.8);
      this.celebrate(false);
    } else if (res === 'post') {
      await this.bounce(new THREE.Vector3(-Math.sign(p.x || 1) * 2, 2, 8), 0.8);
    } else {
      const dir = new THREE.Vector3(s.tx - s.sx, 0, -s.sz).normalize();
      await this.tween(0.6, (q) => {
        this.ball.position.set(p.x + dir.x * 6 * q, Math.max(BALL_R * 1.5, p.y + (res === 'over' ? 1.5 * q : -q)), p.z + dir.z * 6 * q);
      });
    }
    return res;
  }

  private async bounce(v: THREE.Vector3, dur: number) {
    const p = this.ball.position.clone();
    await this.tween(dur, (q) => {
      const t = q * dur;
      this.ball.position.set(p.x + v.x * t, Math.max(BALL_R * 1.5, p.y + v.y * t - 4.9 * t * t), p.z + v.z * t);
      this.ball.rotation.z += 0.2;
    });
  }

  /** Comemoração: quem fez o gol pula; ou o goleiro levanta os braços. */
  celebrate(goal: boolean) {
    this.cheer = 2.5;
    const b = goal ? this.kicker : this.keeper;
    if (!b) return;
    const y0 = b.root.position.y;
    void this.tween(1.4, (q) => {
      b.root.position.y = y0 + Math.abs(Math.sin(q * Math.PI * 3)) * 0.45;
      b.armL.rotation.z = Math.PI * 0.85; b.armR.rotation.z = -Math.PI * 0.85;
      b.armL.rotation.x = 0; b.armR.rotation.x = 0;
    }).then(() => { if (b) resetPose(b); });
  }
}

