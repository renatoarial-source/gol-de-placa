/* Cena 3D: campo, gol com rede, bonecos de blocos, bola e torcida (three.js).
 * Toda a animação é feita aqui; quem decide o resultado é o jogo (main.ts) e a física.
 */
import * as THREE from 'three';
import { BALL_R, G, GOAL_H, HALF, PLAYER_W, WALL_JUMP, ballAtTime, flightTime, velocityAt, type Outcome, type Shot, type Wall } from './physics';
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

export type HairStyle = 'short' | 'long' | 'mohawk' | 'curly' | 'bald' | 'ponytail' | 'buns' | 'braids' | 'spiky'
  | 'quiff' | 'dreads' | 'bob' | 'pigtails' | 'topknot';
export const HAIR_STYLES: HairStyle[] = [
  'short', 'long', 'ponytail', 'buns', 'braids', 'curly', 'spiky', 'mohawk', 'bald', 'quiff', 'dreads', 'bob', 'pigtails', 'topknot',
];
/** Tipo de corpo: cada jogador em campo sai de um jeito (o "Meu craque" escolhe o seu). */
export type Build = 'normal' | 'tall' | 'short' | 'slim' | 'chubby' | 'round' | 'square' | 'strong';
export const BUILDS: Build[] = ['normal', 'tall', 'short', 'slim', 'chubby', 'round', 'square', 'strong'];
/** Escala do corpo (largura, altura, profundidade), barriga e tamanho da cabeça de cada tipo. */
const BUILD_SHAPE: Record<Build, { sx: number; sy: number; sz: number; belly: number; head: number; arm?: number }> = {
  normal: { sx: 1, sy: 1, sz: 1, belly: 0, head: 1 },
  tall: { sx: 0.95, sy: 1.14, sz: 0.95, belly: 0, head: 1 },
  short: { sx: 1.02, sy: 0.84, sz: 1.02, belly: 0, head: 1.06 },
  slim: { sx: 0.8, sy: 1.05, sz: 0.85, belly: 0, head: 0.95 },
  chubby: { sx: 1.2, sy: 0.97, sz: 1.2, belly: 0.1, head: 1.04 },
  round: { sx: 1.36, sy: 0.9, sz: 1.36, belly: 0.16, head: 1.08 },
  square: { sx: 1.18, sy: 1, sz: 1.05, belly: 0, head: 1.14 },
  // fortinho: ombros largos e braços grossos
  strong: { sx: 1.14, sy: 1.04, sz: 1.08, belly: 0, head: 0.98, arm: 1.35 },
};
export const SKIN_COLORS = SKINS;
export const HAIR_COLORS = HAIRS;
export const BOOT_COLORS = ['#161616', '#ffffff', '#ff3d00', '#ffd400', '#00c853', '#2979ff', '#e040fb'];
/** "Meu craque": como o boneco da criança aparece. */
export interface Look { skin: number; hair: number; style: HairStyle; boots: number; number: number; name: string; female?: boolean; build?: Build }
/** Expressão do rosto: concentrado antes do chute, feliz no gol, triste no erro, assustado no quase. */
export type Mood = 'calm' | 'focus' | 'happy' | 'sad' | 'wow';
export type Weather = 'day' | 'night' | 'rain' | 'snow';
export type Celebration = 'jump' | 'plane' | 'dance' | 'flip' | 'robot' | 'knee' | 'fish' | 'spin';
export const CELEBRATIONS: Celebration[] = ['jump', 'plane', 'dance', 'flip', 'robot', 'knee', 'fish', 'spin'];
export type Crowd = 'full' | 'half' | 'few';

interface Body {
  root: THREE.Group; // posição no campo
  pose: THREE.Group; // inclinação (mergulho do goleiro)
  legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group;
  head: THREE.Mesh;
  /** rosto (troca de expressão) */
  face: { mat: THREE.MeshLambertMaterial; skin: string; hair: string; female: boolean; mood: Mood };
  /** quantas animações (corrida, chute, comemoração) controlam o corpo agora; com 0 ele volta a respirar */
  busy?: number;
  /** fase própria, para os bonecos não respirarem todos juntos */
  phase: number;
}

const smooth = (q: number) => q * q * (3 - 2 * q);

function box(w: number, h: number, d: number, mat: THREE.Material | THREE.Material[], y = 0, x = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  return m;
}

const faceCache = new Map<string, THREE.Texture>();
/** Rosto desenhado num canvas: olhos, sobrancelhas, bochechas e boca mudam com a expressão. */
function faceTex(skin: string, hair: string, mood: Mood = 'calm', female = false): THREE.Texture {
  const k = `${skin}${hair}${mood}${female ? 'f' : 'm'}`;
  if (!faceCache.has(k)) {
    faceCache.set(k, canvasTex(128, 128, (g) => {
      g.fillStyle = skin; g.fillRect(0, 0, 128, 128);
      g.fillStyle = hair; g.fillRect(0, 0, 128, 22);
      g.lineCap = 'round';
      // olhos: no "feliz" viram arquinhos (^ ^); no "assustado" ficam bem abertos
      if (mood === 'happy') {
        g.strokeStyle = '#1b1b1b'; g.lineWidth = 7;
        for (const x of [41, 87]) { g.beginPath(); g.arc(x, 62, 10, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
      } else {
        const tall = mood === 'wow' ? 30 : mood === 'focus' ? 18 : 24;
        const top = mood === 'focus' ? 52 : 46;
        g.fillStyle = '#ffffff'; g.fillRect(30, top, 22, tall); g.fillRect(76, top, 22, tall);
        g.fillStyle = '#1b1b1b';
        const py = mood === 'sad' ? top + tall - 14 : top + (tall - 14) / 2;
        g.fillRect(38, py, 12, 14); g.fillRect(84, py, 12, 14);
      }
      // sobrancelhas: bravas no "concentrado", caídas no "triste", lá em cima no "assustado"
      g.strokeStyle = hair; g.lineWidth = 6;
      const brow = (x1: number, y1: number, x2: number, y2: number) => { g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); };
      if (mood === 'focus') { brow(28, 40, 52, 47); brow(100, 40, 76, 47); }
      else if (mood === 'sad') { brow(28, 44, 52, 36); brow(100, 44, 76, 36); }
      else if (mood === 'wow') { brow(30, 32, 52, 30); brow(98, 32, 76, 30); }
      else if (mood === 'happy') { brow(30, 40, 52, 36); brow(98, 40, 76, 36); }
      else { brow(30, 38, 52, 38); brow(98, 38, 76, 38); }
      // jogadora: cílios
      if (female && mood !== 'happy') {
        g.strokeStyle = '#1b1b1b'; g.lineWidth = 3;
        for (const [x, d] of [[30, -1], [52, 1], [76, -1], [98, 1]] as const) { g.beginPath(); g.moveTo(x, (mood === 'focus' ? 52 : 46) + 2); g.lineTo(x + d * 6, (mood === 'focus' ? 52 : 46) - 5); g.stroke(); }
      }
      g.fillStyle = mood === 'happy' ? 'rgba(255,90,90,.55)' : 'rgba(255,90,90,.35)';
      g.fillRect(16, 78, 20, 11); g.fillRect(92, 78, 20, 11);
      // boca
      const lip = female ? '#c2185b' : '#3a1f12';
      if (mood === 'happy') {
        // sorrisão de boca aberta, com língua
        g.fillStyle = '#5a1010'; g.beginPath(); g.arc(64, 80, 22, 0, Math.PI); g.closePath(); g.fill();
        g.fillStyle = '#ff6f7d'; g.beginPath(); g.arc(64, 96, 10, Math.PI, 2 * Math.PI); g.fill();
        g.fillStyle = '#ffffff'; g.fillRect(48, 80, 32, 5);
      } else if (mood === 'wow') {
        g.fillStyle = '#5a1010'; g.beginPath(); g.ellipse(64, 92, 9, 12, 0, 0, Math.PI * 2); g.fill();
      } else if (mood === 'sad') {
        g.strokeStyle = lip; g.lineWidth = 6; g.beginPath(); g.arc(64, 104, 16, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke();
      } else if (mood === 'focus') {
        g.strokeStyle = lip; g.lineWidth = 6; g.beginPath(); g.moveTo(54, 92); g.lineTo(74, 90); g.stroke();
      } else {
        g.strokeStyle = lip; g.lineWidth = 6; g.beginPath(); g.arc(64, 82, 18, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke();
      }
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
function makeBody(kit: Kit, number: number, seed: number, keeper = false, look?: Look, womens = false): Body {
  const skin = SKINS[look ? look.skin : seed % SKINS.length];
  const hair = HAIRS[look ? look.hair : (seed * 7 + 3) % HAIRS.length];
  // futebol feminino: todas as jogadoras, com penteados de jogadora; masculino: os de sempre
  const pool: HairStyle[] = womens
    ? ['ponytail', 'buns', 'long', 'braids', 'ponytail', 'curly', 'long', 'bob', 'pigtails', 'topknot']
    : ['short', 'short', 'curly', 'long', 'mohawk', 'bald', 'spiky', 'quiff', 'dreads', 'topknot'];
  const style: HairStyle = look ? look.style : pool[(seed * 5 + 1) % pool.length];
  // corpo: o do "Meu craque" é o escolhido; os outros variam (metade normal, o resto de todo tipo)
  const build: Build = look ? look.build ?? 'normal' : seed % 3 === 0 ? 'normal' : BUILDS[1 + ((seed * 3 + 1) % (BUILDS.length - 1))];
  const shape = BUILD_SHAPE[build];
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
  const mSole = lambert('#f2f2f2');
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
    // chuteira bem visível: maior, com sola branca e as travinhas
    g.add(box(0.27, 0.13, 0.4, mShoe, -0.74, 0, 0.06));
    g.add(box(0.28, 0.04, 0.41, mSole, -0.82, 0, 0.06));
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
  const female = look ? !!look.female : womens;
  const faceHair = bald ? skin : hair;
  const mFace = new THREE.MeshLambertMaterial({ map: faceTex(skin, faceHair, 'calm', female) });
  const head = box(0.46, 0.46, 0.46, [mSkin, mSkin, top, mSkin, mFace, top], 1.8);
  pose.add(head);
  // barriguinha dos mais cheinhos (na frente da camisa)
  if (shape.belly) pose.add(box(0.5, 0.42, shape.belly, mShirt, 1.18, 0, 0.16 + shape.belly / 2));
  // penteados de jogadora: presos na cabeça, para acompanhar quando ela vira o rosto
  if (style === 'ponytail') {
    head.add(box(0.5, 0.1, 0.5, mHair, 0.26));
    head.add(box(0.5, 0.36, 0.08, mHair, 0.04, 0, -0.25));
    const tail = box(0.14, 0.42, 0.12, mHair, -0.12, 0, -0.33);
    tail.rotation.x = 0.25;
    head.add(tail);
  }
  if (style === 'buns') {
    head.add(box(0.5, 0.1, 0.5, mHair, 0.26));
    head.add(box(0.5, 0.3, 0.08, mHair, 0.07, 0, -0.25));
    head.add(box(0.16, 0.16, 0.16, mHair, 0.32, -0.18, -0.04));
    head.add(box(0.16, 0.16, 0.16, mHair, 0.32, 0.18, -0.04));
  }
  // cabelo preso na cabeça (coordenadas da cabeça: o centro dela fica a 1,8 m), para virar junto com o rosto
  if (style === 'short' || style === 'long') head.add(box(0.5, 0.1, 0.5, mHair, 0.26));
  if (style === 'long') head.add(box(0.5, 0.5, 0.1, mHair, 0.02, 0, -0.26));
  if (style === 'mohawk') head.add(box(0.12, 0.22, 0.48, mHair, 0.32));
  if (style === 'curly') head.add(box(0.62, 0.3, 0.6, mHair, 0.3, 0, -0.03));
  // trancinhas: duas tranças caindo dos lados
  if (style === 'braids') {
    head.add(box(0.5, 0.1, 0.5, mHair, 0.26));
    for (const x of [-0.27, 0.27]) {
      head.add(box(0.08, 0.3, 0.1, mHair, 0.02, x, -0.08));
      head.add(box(0.1, 0.12, 0.12, mHair, -0.18, x, -0.08));
      head.add(box(0.07, 0.16, 0.08, mHair, -0.32, x, -0.08));
    }
  }
  // espetado: pontinhas para cima
  if (style === 'spiky') {
    head.add(box(0.5, 0.08, 0.5, mHair, 0.26));
    for (const [x, z] of [[-0.15, 0.12], [0.05, 0.14], [0.17, 0.02], [-0.06, -0.05], [-0.18, -0.16], [0.1, -0.17]]) {
      const sp = box(0.1, 0.18, 0.1, mHair, 0.36, x, z);
      sp.rotation.z = -x * 1.4;
      sp.rotation.x = z * 1.4;
      head.add(sp);
    }
  }
  // cinco penteados a mais
  if (style === 'quiff') { // topete
    head.add(box(0.5, 0.08, 0.5, mHair, 0.26));
    const q = box(0.42, 0.16, 0.22, mHair, 0.34, 0, 0.16);
    q.rotation.x = -0.35;
    head.add(q);
  }
  if (style === 'dreads') {
    head.add(box(0.52, 0.12, 0.52, mHair, 0.26));
    for (const [x, z] of [[-0.24, -0.1], [0.24, -0.1], [-0.2, -0.24], [0, -0.26], [0.2, -0.24], [-0.26, 0.08], [0.26, 0.08]])
      head.add(box(0.08, 0.42, 0.08, mHair, 0.02, x, z));
  }
  if (style === 'bob') { // chanel
    head.add(box(0.54, 0.12, 0.54, mHair, 0.26));
    head.add(box(0.54, 0.34, 0.12, mHair, 0.06, 0, -0.24));
    for (const x of [-0.26, 0.26]) head.add(box(0.06, 0.34, 0.4, mHair, 0.06, x, -0.02));
    head.add(box(0.5, 0.08, 0.06, mHair, 0.2, 0, 0.24)); // franjinha
  }
  if (style === 'pigtails') { // maria-chiquinha
    head.add(box(0.5, 0.1, 0.5, mHair, 0.26));
    for (const x of [-0.32, 0.32]) {
      const t = box(0.12, 0.34, 0.12, mHair, 0.04, x, -0.06);
      t.rotation.z = x > 0 ? -0.4 : 0.4;
      head.add(t);
    }
  }
  if (style === 'topknot') { // coque no alto
    head.add(box(0.5, 0.1, 0.5, mHair, 0.26));
    head.add(box(0.2, 0.18, 0.2, mHair, 0.4, 0, -0.04));
  }
  // tipo de corpo: escala o boneco a partir dos pés (chão continua no 0) e mantém a cabeça "de cubo"
  pose.scale.set(shape.sx, shape.sy, shape.sz);
  head.scale.set(shape.head / shape.sx, shape.head / shape.sy, shape.head / shape.sz);
  if (shape.arm) for (const a of [armL, armR]) a.scale.set(shape.arm, 1, shape.arm);
  pose.traverse((o) => { o.castShadow = false; });
  return {
    root, pose, legL, legR, armL, armR, head,
    face: { mat: mFace, skin, hair: faceHair, female, mood: 'calm' },
    phase: (seed * 1.37) % (Math.PI * 2),
  };
}

/** Troca a expressão do rosto. */
function setMood(b: Body | null, mood: Mood) {
  if (!b || b.face.mood === mood) return;
  b.face.mood = mood;
  b.face.mat.map = faceTex(b.face.skin, b.face.hair, mood, b.face.female);
  b.face.mat.needsUpdate = true;
}

/** Parado, mas vivo: respira, mexe o peso e olha em volta. Só corpo, braços e cabeça; nada fica acumulando. */
function breathe(b: Body, t: number, armOpen = 0.08) {
  const p = b.phase;
  b.pose.position.y = Math.sin(t * 2.1 + p) * 0.012;
  b.pose.rotation.z = Math.sin(t * 0.9 + p) * 0.025;
  // braços levemente afastados do corpo (o esquerdo abre girando no sentido negativo)
  b.armL.rotation.z = -armOpen - Math.sin(t * 2.1 + p) * 0.03;
  b.armR.rotation.z = armOpen + Math.sin(t * 2.1 + p) * 0.03;
  b.head.rotation.y = Math.sin(t * 0.45 + p * 2) * 0.22;
  b.head.rotation.x = Math.sin(t * 0.7 + p) * 0.05;
}

/** Volta suavemente à posição neutra (sem o "tranco" de zerar tudo de uma vez). */
function easeToRest(tween: (d: number, fn: (k: number) => void) => Promise<void>, b: Body, dur = 0.3) {
  const parts = [b.pose, b.legL, b.legR, b.armL, b.armR, b.head];
  // volta pelo menor caminho: uma cambalhota completa (-360°) termina em pé, não gira de volta
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const from = parts.map((o) => new THREE.Euler(wrap(o.rotation.x), wrap(o.rotation.y), wrap(o.rotation.z)));
  const py = b.pose.position.clone();
  return tween(dur, (q) => {
    const e = smooth(q);
    parts.forEach((o, i) => o.rotation.set(from[i].x * (1 - e), from[i].y * (1 - e), from[i].z * (1 - e)));
    b.pose.position.set(py.x * (1 - e), py.y * (1 - e), py.z * (1 - e));
  });
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
  private crowdBX!: Float32Array; // posição de cada torcedor na cadeira
  private crowdBZ!: Float32Array;
  private crowdR!: Float32Array; // jeito de cada um (0..1): ritmo, altura do pulo, quem gira
  private ohh = 0; // torcida lamentando (mãos na cabeça)
  private tension = false; // cobrança prestes a sair: a torcida levanta e segura a respiração
  private tense = 0;
  private paper: THREE.Points | null = null; // papel picado do gol
  private paperV: Float32Array | null = null;
  private paperT = 0;
  private crowdPal: string[] = ['#ffffff'];
  private cheer = 0;
  private hemi!: THREE.HemisphereLight;
  private sun!: THREE.DirectionalLight;
  private lamps: THREE.Mesh[] = [];
  private fall: THREE.Points | null = null;
  private weather: Weather = 'day';
  private snowCover!: THREE.Mesh;
  private seatA = new THREE.MeshLambertMaterial({ color: '#8a96a3' });
  private seatB = new THREE.MeshLambertMaterial({ color: '#5b6672' });
  private groundMat = new THREE.MeshLambertMaterial({ color: '#3a8a35' });
  private sky!: THREE.Mesh;
  private flags: THREE.Mesh[] = [];
  private showcaseBody: Body | null = null;
  private tweens: Tween[] = [];
  private last = performance.now();
  private idle = 0;
  private spot = { sx: 0, sz: 11 };
  private keeperDiving = false;
  /** Velocidade do tempo (0,35 no replay em câmera lenta). */
  timeScale = 1;
  /** Comemoração de quem bate, para o próximo gol. */
  kickerCelebration: Celebration = 'jump';
  private replayCam = false;
  private celebCam: { body: Body; fwd: THREE.Vector3; id: number } | null = null;
  private celebId = 0;
  /** futebol feminino: todo mundo em campo é jogadora (escolhido no Meu craque e na tela do time) */
  womens = false;
  private lastSetup: Parameters<Pitch['setup']>[0] | null = null;
  private view: 'kick' | 'keep' = 'kick';
  /** Ao defender: câmera atrás do gol ('goal') ou atrás do cobrador ('kicker'). */
  keeperCam: 'goal' | 'kicker' = 'goal';
  private netBack: THREE.Mesh[] = [];
  private keeperMode: 'dive' | 'up' | 'low' = 'up';
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

    this.sky = new THREE.Mesh(new THREE.SphereGeometry(260, 32, 16), new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false }));
    this.scene.add(this.sky);
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
      this.tick(dt * this.timeScale);
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
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), this.groundMat);
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
    this.netBack = [back, roof];
    net.add(back, roof, side(-HALF), side(HALF));
    this.scene.add(net);
    return net;
  }

  private buildStands() {
    const grey = this.seatA;
    const dark = this.seatB;
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
    this.crowdBX = new Float32Array(n);
    this.crowdBZ = new Float32Array(n);
    this.crowdR = new Float32Array(n);
    const m = new THREE.Matrix4();
    order.forEach((si, i) => {
      const p = seats[si];
      m.makeTranslation(p.x, p.y, p.z);
      this.crowd.setMatrixAt(i, m);
      this.crowdY[i] = p.y;
      this.crowdX[i] = along[si];
      this.crowdBX[i] = p.x;
      this.crowdBZ[i] = p.z;
      this.crowdR[i] = Math.random();
    });
    this.scene.add(this.crowd);

    // bandeiras da torcida na primeira fila (atrás do gol e atrás do batedor)
    const pole = lambert('#d8d8d8');
    const spots: [number, number, number][] = [];
    for (let i = 0; i < 9; i++) spots.push([-26 + i * 6.5, -15.2, 0], [-26 + i * 6.5, 51.2, Math.PI]);
    for (const [x, z, ry] of spots) {
      const g = new THREE.Group();
      g.add(box(0.06, 2.4, 0.06, pole, 1.2));
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.05, 8, 1), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));
      flag.position.set(0.85, 1.9, 0);
      g.add(flag);
      g.position.set(x, 1.0, z);
      g.rotation.y = ry;
      this.scene.add(g);
      this.flags.push(flag);
    }
  }

  /** Bandeiras com duas faixas nas cores escolhidas (time do coração ou dos times em campo). */
  private paintFlags(c1: string, c2: string) {
    const tex = canvasTex(64, 40, (g) => {
      g.fillStyle = c1; g.fillRect(0, 0, 64, 40);
      g.fillStyle = c2; g.fillRect(0, 14, 64, 12);
    });
    for (const f of this.flags) {
      const m = f.material as THREE.MeshLambertMaterial;
      m.map?.dispose();
      m.map = tex;
      m.needsUpdate = true;
    }
  }

  /** Céu de verdade: degradê, nuvens de dia, estrelas à noite, nuvens carregadas na chuva e na neve. */
  private paintSky(w: Weather, base: string) {
    const tex = canvasTex(2048, 512, (g) => {
      g.scale(4, 2);
      const top = { day: '#2f8fe0', night: '#030817', rain: '#4b5866', snow: '#a9b9c9' }[w];
      const grad = g.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, top); grad.addColorStop(0.5, base); grad.addColorStop(1, base);
      g.fillStyle = grad; g.fillRect(0, 0, 512, 256);
      if (w === 'night') {
        for (let i = 0; i < 260; i++) {
          g.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.7})`;
          g.fillRect(Math.random() * 512, Math.random() * 120, Math.random() < 0.15 ? 2 : 1, 1);
        }
        g.fillStyle = '#f4f1d0'; g.beginPath(); g.arc(380, 40, 10, 0, Math.PI * 2); g.fill();
      } else {
        const n = w === 'day' ? 40 : 90;
        const c = { day: 'rgba(255,255,255,.85)', rain: 'rgba(70,80,92,.8)', snow: 'rgba(235,240,246,.85)', night: '' }[w];
        for (let i = 0; i < n; i++) {
          const x = Math.random() * 512, y = 25 + Math.random() * 85, r = 3 + Math.random() * 5;
          g.fillStyle = c;
          for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + k * r * 0.8, y + Math.sin(k * 2) * r * 0.3, r * (k === 2 ? 1.3 : 1), 0, Math.PI * 2); g.fill(); }
        }
      }
    });
    const m = this.sky.material as THREE.MeshBasicMaterial;
    m.map?.dispose();
    m.map = tex;
    m.needsUpdate = true;
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

  /** Estádio: cores das arquibancadas e do chão em volta do gramado. */
  setStadium(o: { seatA: string; seatB: string; ground: string }) {
    this.seatA.color.set(o.seatA);
    this.seatB.color.set(o.seatB);
    this.groundMat.color.set(o.ground);
  }

  /** Clima e torcida da partida. colors: cores das camisas dos dois times, para a torcida. */
  setAtmosphere(o: { weather: Weather; crowd: Crowd; colors: string[]; flag?: [string, string] }) {
    this.paintFlags(...(o.flag ?? [o.colors[0], '#ffffff']));
    this.weather = o.weather;
    const sky = { day: '#7cc4f5', night: '#0b1736', rain: '#6f7f8f', snow: '#c9d7e4' }[o.weather];
    const fog = { day: '#a8d8f7', night: '#0b1736', rain: '#7d8b98', snow: '#dbe5ee' }[o.weather];
    (this.scene.background as THREE.Color).set(sky);
    this.paintSky(o.weather, sky);
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
    this.crowdPal = [...o.colors, ...o.colors, '#ffffff', '#ffd400'];
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
    // enquadramento: o boneco inteiro (até o mais alto) na parte de cima, com os pés acima do painel
    this.camera.position.set(0, 5.9, 15.6);
    this.camera.lookAt(0, -2.5, 6);
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
    const { sx, sz } = this.spot;
    const d = Math.hypot(sx, sz);
    // goleiro: atrás do gol, de frente para o cobrador (a rede do fundo e do teto some para não tampar)
    if (this.replayCam) {
      // replay: de lado, rente ao gramado, perto do gol
      this.camera.clearViewOffset();
      this.camera.aspect = window.innerWidth / window.innerHeight;
      const side = sx > 0 ? -1 : 1;
      this.camera.position.set(side * 9, 1.5, Math.min(sz, 14) * 0.55);
      this.camera.lookAt(0, 1.1, Math.min(sz, 14) * 0.25);
      this.camera.fov = THREE.MathUtils.clamp(48 / Math.min(1, this.camera.aspect * 1.6), 48, 85);
      this.camera.updateProjectionMatrix();
      for (const m of this.netBack) m.visible = true;
      return;
    }
    const behindGoal = this.view === 'keep' && this.keeperCam === 'goal';
    for (const m of this.netBack) m.visible = !behindGoal;
    const w = window.innerWidth, h = window.innerHeight;
    if (behindGoal) {
      // olhando reto para o cobrador; o quadro é "deslocado" para cima (sem entortar as traves),
      // assim o gol fica embaixo da tela e quase não sobra gramado vazio
      const dist = 9;
      this.camera.position.set(-(sx / d) * 1.2, 1.8, -dist);
      this.camera.lookAt(sx * 0.3, 1.8, sz);
      const hx = (HALF + 0.7) / dist; // metade da largura visível (tangente)
      const span = (2 * hx) / (w / h); // altura visível (em tangente)
      // linha do gol (1,8 m abaixo do olho, a 9 m) a ~70% da altura da tela
      const goalLine = 1.8 / dist;
      const top = Math.max(0.7 * span - goalLine, 0.2);
      const bottom = span - top;
      const full = Math.max(top, bottom);
      const fullH = h * ((2 * full) / span);
      this.camera.aspect = w / fullH;
      this.camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(full));
      this.camera.setViewOffset(w, fullH, 0, ((full - top) / (2 * full)) * fullH, w, h);
      this.camera.updateProjectionMatrix();
      return;
    }
    this.camera.clearViewOffset();
    this.camera.aspect = w / h;
    // batedor: alto e atrás da bola, olhando para o gol
    const back = 4.2;
    // um pouco à direita: o batedor (que vem pela esquerda) não tampa o caminho da bola
    const side = 0.75;
    const px = sx + (sx / d) * back + (sz / d) * side, pz = sz + (sz / d) * back - (sx / d) * side;
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
    this.lastSetup = o;
    this.tweens = [];
    this.clearPlayers();
    this.spot = { sx: o.sx, sz: o.sz };
    this.view = o.view;
    this.keeperDiving = false;
    this.celebCam = null;
    this.net.scale.set(1, 1, 1);
    this.bp.set(o.sx, BALL_R, o.sz);
    this.ball.position.set(o.sx, BALL_R * 1.5, o.sz);
    this.ball.rotation.set(0, 0, 0);
    this.ball.visible = true;

    const dir = Math.atan2(-o.sx, -o.sz); // virado para o gol
    // o boneco da criança usa o "Meu craque" (batedor ou goleiro, conforme o papel)
    this.kicker = makeBody(o.kickerKit, 7 + (o.seed % 4) * 2, o.seed, false, o.view === 'kick' ? o.look : undefined, this.womens);
    // começa atrás e à esquerda da bola (chuta de pé direito)
    const d = Math.hypot(o.sx, o.sz);
    this.back = { x: o.sx / d, z: o.sz / d };
    this.kicker.root.position.set(o.sx + this.back.x * 1.8 - this.back.z * 1.1, 0, o.sz + this.back.z * 1.8 + this.back.x * 1.1);
    this.kicker.root.rotation.y = dir;
    this.scene.add(this.kicker.root);

    this.keeper = makeBody(o.keeperKit, 1, o.seed + 2, true, o.view === 'keep' ? o.look : undefined, this.womens);
    this.keeper.root.position.set(0, 0, 0.35);
    this.keeper.root.rotation.y = Math.atan2(o.sx, o.sz) * 0.5;
    this.keeper.armL.rotation.z = 0.5; this.keeper.armR.rotation.z = -0.5;
    this.scene.add(this.keeper.root);

    if (o.wall) {
      for (let i = 0; i < o.wall.count; i++) {
        const b = makeBody(o.keeperKit, [4, 5, 6, 8, 3][i], o.seed + 5 + i, false, undefined, this.womens);
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
    this.idle += dt;
    const T = this.idle;
    // goleiro esperando: agachado, braços prontos, passa o peso de um pé para o outro e olha a bola
    const gk = this.keeper;
    if (gk && !this.keeperDiving && !gk.busy) {
      const sway = Math.sin(T * 1.7 + gk.phase);
      gk.pose.position.x = sway * 0.13;
      gk.pose.position.y = -0.06 + Math.abs(Math.sin(T * 3.4 + gk.phase)) * 0.035;
      gk.pose.rotation.z = -sway * 0.05;
      gk.pose.rotation.x = 0.12;
      gk.armL.rotation.set(-0.35, 0, -0.55 - Math.sin(T * 3.4) * 0.05);
      gk.armR.rotation.set(-0.35, 0, 0.55 + Math.sin(T * 3.4) * 0.05);
      gk.legL.rotation.z = -0.08; gk.legR.rotation.z = 0.08;
    }
    if (gk && !this.keeperDiving) {
      // a cabeça segue a bola
      const dx = this.bp.x - gk.root.position.x, dz = this.bp.z - gk.root.position.z;
      const yaw = Math.atan2(dx, dz) - gk.root.rotation.y;
      const want = Math.max(-0.8, Math.min(0.8, Math.atan2(Math.sin(yaw), Math.cos(yaw))));
      gk.head.rotation.y += (want - gk.head.rotation.y) * Math.min(1, dt * 8);
    }
    // batedor, barreira e o boneco da vitrine respiram enquanto esperam
    if (this.kicker && !this.kicker.busy) breathe(this.kicker, T);
    for (const w of this.wall) if (!w.busy) breathe(w, T, -0.25);
    if (this.showcaseBody && !this.showcaseBody.busy) breathe(this.showcaseBody, T);
    // torcida: cada um balança no seu ritmo, faz a "ola" de tempos em tempos e explode no gol
    // (pula, levanta os braços, vai de um lado para o outro e alguns giram); no lance perdido, murcha
    this.cheer = Math.max(0, this.cheer - dt);
    this.ohh = Math.max(0, this.ohh - dt);
    const arr = this.crowd.instanceMatrix.array as Float32Array;
    const wave = (this.idle * 22) % 520; // a ola percorre o estádio (~268 m) e some por um tempo
    const party = Math.min(1, this.cheer / 1.5); // a festa vai acalmando no fim
    const sad = Math.min(1, this.ohh / 0.8);
    this.tense += ((this.tension ? 1 : 0) - this.tense) * Math.min(1, dt * 3);
    const CT = this.idle;
    for (let i = 0; i < this.crowd.count; i++) {
      const r = this.crowdR[i];
      const ph = r * 40;
      // cada torcedor é de um "tipo": pulador, bandeira (balança de lado), batedor de palmas, abraçador ou girador
      const kind = r < 0.28 ? 0 : r < 0.5 ? 1 : r < 0.7 ? 2 : r < 0.82 ? 3 : 4;
      let y = Math.sin(CT * (1.8 + r * 1.2) + ph) * 0.04 * (1 - this.tense * 0.7);
      let sx = 1, sy = 1, xo = 0, zo = 0, rot = 0;
      // antes da cobrança: todo mundo levanta e fica parado, na ponta do pé
      y += this.tense * 0.12; sy += this.tense * 0.08;
      // ola
      const dw = Math.abs(this.crowdX[i] - wave);
      if (dw < 6) { const k = 1 - dw / 6; y += k * 0.5; sy += k * 0.3; }
      // ninguém fica parado: de vez em quando um torcedor sozinho pula, acena, vira para o lado ou levanta os braços
      const slot = Math.floor(CT * 0.4 + r * 97);
      const roll = (Math.sin(slot * 12.9898 + i * 78.233) * 43758.5453) % 1;
      const ev = Math.abs(roll);
      if (!party && ev < 0.05) {
        const f = (CT * 0.4 + r * 97) % 1; // quanto do "momento" já passou
        const bump = Math.sin(Math.PI * f);
        if (ev < 0.015) y += bump * 0.45; // pulinho
        else if (ev < 0.03) { sy += bump * 0.4; sx -= bump * 0.1; } // braços para cima
        else if (ev < 0.04) rot = Math.sin(CT * 10) * 0.5 * bump; // acenando
        else rot = bump * 1.2; // vira para conversar com o vizinho
      }
      if (party) {
        const j = Math.max(0, Math.sin(CT * (7 + r * 7) + ph));
        if (kind === 0) { y += j * (0.4 + 0.5 * r) * party; sy += j * 0.45 * party; sx -= j * 0.12 * party; }
        else if (kind === 1) { xo = Math.sin(CT * 5 + ph) * 0.35 * party; sy += 0.35 * party; rot = Math.sin(CT * 5 + ph) * 0.4 * party; }
        else if (kind === 2) { sx += Math.abs(Math.sin(CT * 14 + ph)) * 0.25 * party; sy += 0.2 * party; y += j * 0.15 * party; }
        else if (kind === 3) { xo = Math.sin(CT * 2 + ph) * 0.3 * party; zo = Math.cos(CT * 2 + ph) * 0.1 * party; y += j * 0.25 * party; rot = Math.sin(CT * 2 + ph) * 0.3 * party; }
        else { rot = (CT * (5 + r * 6) + ph) * party; y += j * 0.3 * party; }
      }
      if (sad) {
        if (kind <= 1) { y -= 0.12 * sad; sy -= 0.18 * sad; } // mãos na cabeça
        else if (kind <= 3) { y -= 0.3 * sad; sy -= 0.3 * sad; } // senta de desânimo
        else rot = Math.sin(CT * 9 + ph) * 0.35 * sad; // balança a cabeça: "não acredito"
      }
      const c = Math.cos(rot), sn = Math.sin(rot), o = i * 16;
      arr[o] = c * sx; arr[o + 2] = -sn * sx;
      arr[o + 5] = sy;
      arr[o + 8] = sn; arr[o + 10] = c;
      arr[o + 12] = this.crowdBX[i] + xo;
      arr[o + 13] = this.crowdY[i] + y + (sy - 1) * 0.31;
      arr[o + 14] = this.crowdBZ[i] + zo;
    }
    this.updatePaper(dt);
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
    if (this.showcaseBody && !this.showcaseBody.busy) this.showcaseBody.root.rotation.y += dt * 0.8;
    if (this.celebCam) this.followCelebCam(Math.min(1, dt * 5));
    // bandeiras tremulando (mais forte na festa do gol)
    this.flags.forEach((f, i) => {
      const pos = (f.geometry as THREE.PlaneGeometry).attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k) + 0.85;
        pos.setZ(k, Math.sin(this.idle * (party ? 11 : 4) + x * 3 + i) * (party ? 0.28 : 0.12) * x);
      }
      pos.needsUpdate = true;
      // na festa, as bandeiras sobem e descem, cada uma no seu tempo
      if (f.parent) f.parent.position.y = 1.0 + (party ? Math.max(0, Math.sin(this.idle * 8 + i * 1.3)) * 0.9 * party : 0);
    });
    this.ballShadow.position.x = this.ball.position.x;
    this.ballShadow.position.z = this.ball.position.z;
    const s = Math.max(0.3, 1 - this.ball.position.y / 6);
    this.ballShadow.scale.set(s, s, s);
  }

  /** O goleiro pula para alcançar (x, y) no gol daqui a `contactIn` segundos.
   * Bola longe: mergulho de lado (gira em torno dos pés e cai deitado). Bola alta no meio: salta com
   * os braços para cima. Bola baixa no meio: agacha e encaixa. */
  keeperDive(x: number, y: number, contactIn: number) {
    const k = this.keeper;
    if (!k || this.keeperDiving) return;
    this.keeperDiving = true;
    const C = THREE.MathUtils.clamp;
    const tx = C(x, -HALF - 0.4, HALF + 0.4);
    const ty = C(y, BALL_R, GOAL_H + 0.3);
    const side = Math.sign(tx) || 1;
    const ax = Math.abs(tx);
    const x0 = k.pose.position.x;
    const dur = Math.max(0.12, contactIn);
    const mode: 'dive' | 'up' | 'low' = ax < 0.9 && ty < 1.0 ? 'low' : ax < 1.2 ? 'up' : 'dive';
    this.keeperMode = mode;
    // pés (fx, fy) e inclinação do corpo para as luvas chegarem na bola
    let fx = tx * 0.85, fy = 0, rot = 0;
    if (mode === 'up') {
      fx = tx * 0.75;
      fy = C(ty - 2.15, 0, 0.6);
      rot = -Math.atan2(tx - fx, 2);
    } else if (mode === 'dive') {
      fx = tx * 0.45;
      fy = C((ty - 1.3) * 0.9, 0, 0.9);
      rot = -side * C(Math.atan2(ax - Math.abs(fx), Math.max(0.05, ty - fy)), 0, 1.5);
    }
    void this.tween(dur, (q) => {
      const e = 1 - (1 - q) * (1 - q);
      k.pose.position.x = x0 + (fx - x0) * e;
      k.pose.rotation.z = rot * e;
      if (mode === 'low') {
        k.pose.position.y = -0.32 * e;
        k.armL.rotation.set(-1.25 * e, 0, 0.2); k.armR.rotation.set(-1.25 * e, 0, -0.2);
        k.legL.rotation.z = 0.45 * e; k.legR.rotation.z = -0.45 * e;
      } else {
        k.pose.position.y = fy * Math.sin((Math.PI / 2) * q) + (mode === 'dive' ? 0.18 * Math.sin(Math.abs(rot)) * e : 0);
        k.armL.rotation.set(0, 0, 0.5 + (Math.PI * 0.94 - 0.5) * e);
        k.armR.rotation.set(0, 0, -0.5 - (Math.PI * 0.94 - 0.5) * e);
        // pernas em tesoura no mergulho
        k.legL.rotation.x = 0.35 * e; k.legR.rotation.x = -0.25 * e;
      }
    }).then(() => {
      if (mode === 'low') return;
      // depois do contato: cai no gramado (de lado no mergulho, de pé no salto)
      const y1 = k.pose.position.y, r1 = k.pose.rotation.z;
      const rEnd = mode === 'dive' ? -side * 1.5 : r1;
      void this.tween(0.45, (q) => {
        const e = q * q;
        k.pose.rotation.z = r1 + (rEnd - r1) * e;
        k.pose.position.y = y1 + ((mode === 'dive' ? 0.2 : 0) - y1) * e;
      });
    });
  }

  /** Ponto entre as luvas do goleiro (para a bola encaixar nas mãos). */
  private gloves(): THREE.Vector3 {
    const k = this.keeper!;
    k.root.updateMatrixWorld(true);
    const a = k.armL.localToWorld(new THREE.Vector3(0.05, -0.62, 0.12));
    const b = k.armR.localToWorld(new THREE.Vector3(-0.05, -0.62, 0.12));
    return a.add(b).multiplyScalar(0.5);
  }

  /** Ponto do plano do gol (z = 0) sob o dedo: mira do chute ou pulo do goleiro.
   * Pode ficar fora do gol (ao lado, acima) ou abaixo do chão (= chute rasteiro). */
  goalPointAt(clientX: number, clientY: number): { x: number; y: number } | null {
    const v = new THREE.Vector2((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(v, this.camera);
    const p = new THREE.Vector3();
    if (!ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), p)) return null;
    return { x: THREE.MathUtils.clamp(p.x, -HALF - 4, HALF + 4), y: THREE.MathUtils.clamp(p.y, -2, GOAL_H + 3) };
  }

  /** A bola já saiu do pé? (usado nos testes e nas capturas da loja) */
  ballMoving(): boolean {
    return this.lastSetup !== null && this.ball.position.distanceTo(new THREE.Vector3(this.lastSetup.sx, BALL_R * 1.5, this.lastSetup.sz)) > 0.3;
  }

  /** Quanto do caminho até o gol a bola já percorreu (0 = no pé, 1 = na linha). */
  ballProgress(): number {
    return this.lastSetup ? 1 - this.ball.position.z / this.lastSetup.sz : 0;
  }

  /** Onde um ponto do campo aparece na tela (usado nos testes para mirar). */
  screenOf(x: number, y: number, z: number): { x: number; y: number } {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * window.innerWidth, y: ((1 - v.y) / 2) * window.innerHeight };
  }

  /** Bola: posição física (centro) e desenho (a esfera é desenhada 1,5x maior, apoiada no chão). */
  private bp = new THREE.Vector3();
  private drawBall(dt: number, v: { x: number; z: number }) {
    this.ball.position.set(this.bp.x, this.bp.y + BALL_R * 0.5, this.bp.z);
    // gira como se rolasse na direção do movimento
    this.ball.rotation.x += (v.z * dt) / (BALL_R * 1.5);
    this.ball.rotation.z -= (v.x * dt) / (BALL_R * 1.5);
  }

  /** Continua o movimento da bola com gravidade, quiques, atrito e a rede (se entrou no gol). */
  private simulate(v: THREE.Vector3, dur: number, inGoal: boolean): Promise<void> {
    let last = 0;
    let netHit = false;
    return this.tween(dur, (q) => {
      const dt = (q - last) * dur;
      last = q;
      const n = Math.max(1, Math.ceil(dt / 0.008));
      const h = dt / n;
      for (let i = 0; i < n; i++) {
        v.y -= G * h;
        this.bp.addScaledVector(v, h);
        if (this.bp.y < BALL_R) {
          this.bp.y = BALL_R;
          v.y = v.y < -0.8 ? -v.y * 0.5 : 0;
          const f = v.y === 0 ? 1 - 1.6 * h : 0.92; // rolando ou quicando
          v.x *= f; v.z *= f;
        }
        if (inGoal && this.bp.z < 0) {
          if (this.bp.z < -1.65) {
            this.bp.z = -1.65; v.z = Math.abs(v.z) * 0.12; v.x *= 0.35; v.y *= 0.35;
            if (!netHit) { netHit = true; void this.tween(0.4, (k) => { this.net.scale.z = 1 + 0.2 * Math.sin(Math.PI * k); }); }
          }
          if (this.bp.y > GOAL_H - BALL_R) { this.bp.y = GOAL_H - BALL_R; v.y = -Math.abs(v.y) * 0.2; }
          if (Math.abs(this.bp.x) > HALF - BALL_R) { this.bp.x = Math.sign(this.bp.x) * (HALF - BALL_R); v.x = -v.x * 0.2; }
        }
      }
      this.drawBall(dt, v);
    });
  }

  /** Corrida, chute, voo da bola e o desfecho. Resolve com o resultado. */
  async play(o: PlayOpts): Promise<Outcome> {
    const k = this.kicker!;
    const s = o.shot;
    const start = k.root.position.clone();
    const b = this.back;
    const target = new THREE.Vector3(s.sx + b.x * 0.45 - b.z * 0.28, 0, s.sz + b.z * 0.45 + b.x * 0.28);
    k.busy = (k.busy ?? 0) + 1;
    k.head.rotation.set(0, 0, 0);
    setMood(k, 'focus'); setMood(this.keeper, 'focus');
    const strides = Math.max(1, o.runUp * 4);
    await this.tween(o.runUp, (q) => {
      // acelera no começo e chega firme na bola
      k.root.position.lerpVectors(start, target, q < 0.35 ? (q * q) / 0.7 : 0.175 + (q - 0.35) * (0.825 / 0.65));
      const ph = q * Math.PI * 2 * strides;
      const w = Math.sin(ph);
      k.legL.rotation.x = w * 0.75; k.legR.rotation.x = -w * 0.75;
      k.armL.rotation.set(-w * 0.7, 0, -0.12); k.armR.rotation.set(w * 0.7, 0, 0.12);
      k.pose.position.y = Math.abs(Math.cos(ph)) * 0.07; // sobe e desce a cada passada
      k.pose.rotation.x = 0.16 * Math.min(1, q * 3); // corpo inclinado para a frente
      k.pose.rotation.z = Math.sin(ph) * 0.04;
      // última passada: puxa a perna do chute para trás
      if (q > 0.82) { const e = (q - 0.82) / 0.18; k.legR.rotation.x = 0.9 * e; k.legL.rotation.x = -0.2 * e; }
    });
    // chute: perna de apoio firme, perna direita vem de trás e acompanha o movimento; braços abrem para equilibrar
    k.legL.rotation.x = 0.25;
    // golpe rápido: o pé chega na bola e só então ela sai
    await this.tween(0.09, (q) => {
      k.legR.rotation.x = 0.9 - 1.5 * q;
      k.armL.rotation.set(-0.2, 0, -0.6 * q);
      k.pose.rotation.x = 0.16 - 0.1 * q;
    });
    // acompanha o movimento depois do chute e volta ao normal
    void this.tween(0.36, (q) => {
      k.legR.rotation.x = -0.6 - 1.0 * Math.sin((Math.PI / 2) * Math.min(1, q * 2)) * (q < 0.5 ? 1 : 1 - (q - 0.5));
      k.pose.rotation.x = 0.06 - 0.22 * Math.sin(Math.PI * q);
      k.pose.position.y = 0.04 * Math.sin(Math.PI * q);
      k.armL.rotation.set(-0.2, 0, -0.6 - 0.3 * Math.sin(Math.PI * q));
      k.armR.rotation.set(-0.5 * Math.sin(Math.PI * q), 0, 0.5 * Math.sin(Math.PI * q));
    }).then(() => easeToRest((d, fn) => this.tween(d, fn), k, 0.45)).then(() => { k.busy = (k.busy ?? 1) - 1; });
    o.onKick?.();
    for (const w of this.wall) {
      void this.tween(0.5, (q) => { w.root.position.y = WALL_JUMP * Math.sin(Math.PI * q); });
    }
    const T = flightTime(s);
    if (o.cpuKeeper) {
      // o goleiro da máquina reage um instante depois do chute e chega junto com a bola
      const c = o.cpuKeeper;
      const react = T * 0.14;
      void this.tween(react, () => {}).then(() => this.keeperDive(c.x, c.y, T - react));
    }
    o.onFlightStart?.(performance.now());
    const endT = T * (o.wallU ?? 1);
    let last = 0;
    await this.tween(endT, (q) => {
      const t = q * endT;
      const p = ballAtTime(s, t);
      this.bp.set(p.x, p.y, p.z);
      this.drawBall(t - last, velocityAt(s, t));
      last = t;
    });
    const v0 = velocityAt(s, endT);
    const v = new THREE.Vector3(v0.x, v0.y, v0.z);
    if (o.wallU !== null) {
      // bate na barreira e volta
      v.set(v.x * 0.3 + (Math.random() - 0.5) * 3, Math.abs(v.y) * 0.3 + 2, Math.abs(v.z) * 0.3);
      this.lament(k, 'sad');
      await this.simulate(v, 0.9, false);
      return 'wall';
    }
    const res = o.decide();
    const rnd = Math.random;
    // quem não se deu bem no lance reage: mãos na cabeça (batedor) ou cabeça baixa (goleiro)
    if (res === 'goal') this.dejected(this.keeper);
    else this.lament(k, res === 'save' ? 'sad' : 'wow');
    if (res !== 'goal' && res !== 'save') setMood(this.keeper, 'happy');
    if (res === 'goal') {
      this.celebrate(true);
      await this.simulate(v, 1.1, true);
    } else if (res === 'save') {
      if (!this.keeperDiving) this.keeperDive(this.bp.x, this.bp.y, 0.12);
      const catchIt = this.keeperMode !== 'dive' || (Math.abs(s.tx) < 1.8 && s.ty < 1.8 && s.speed < 20);
      if (catchIt) {
        // encaixa: a bola fica nas luvas
        await this.tween(0.9, () => { this.bp.copy(this.gloves()); this.ball.position.set(this.bp.x, this.bp.y, this.bp.z); });
      } else {
        // espalma para fora (ou por cima, se a bola vinha alta)
        const high = s.ty > 1.9;
        v.set(Math.sign(this.bp.x || 1) * (2 + rnd() * 2), high ? 4.5 : 2 + rnd() * 2, high ? -2 : Math.abs(v.z) * 0.3 + 1);
        await this.simulate(v, 1.0, false);
      }
      this.celebrate(false);
    } else if (res === 'post') {
      const side = Math.abs(s.tx) > HALF - BALL_R && s.ty < GOAL_H;
      if (side) v.set(-Math.sign(s.tx) * (Math.abs(v.x) * 0.4 + 1.2), v.y * 0.6, Math.abs(v.z) * 0.45);
      else v.set(v.x * 0.6, -Math.abs(v.y) * 0.4 - 1, Math.abs(v.z) * 0.4);
      await this.simulate(v, 1.0, false);
    } else {
      // para fora ou por cima: a bola segue o caminho e quica atrás do gol
      await this.simulate(v, 1.0, false);
    }
    return res;
  }

  /** Escolheu a cor da chuteira: a câmera desce até os pés e o boneco levanta o pé para mostrar. */
  showBoots() {
    const b = this.showcaseBody;
    if (!b) return;
    b.busy = (b.busy ?? 0) + 1;
    b.root.rotation.y = 0; // de frente
    const from = this.camera.position.clone();
    // os pés ficam na parte de cima da tela (embaixo estão as opções): olha para um ponto abaixo do chão
    const to = new THREE.Vector3(0, 3.4, 12);
    void this.tween(1.6, (q) => {
      const k = Math.sin(Math.PI * Math.min(1, q * 1.15)); // vai e volta
      this.camera.position.lerpVectors(from, to, k);
      this.camera.lookAt(0, -2.5 + k * 0.5, 6);
      b.legR.rotation.x = -0.6 * k; // pé para a frente, mostrando a chuteira
      b.pose.rotation.x = 0.12 * k;
      b.armL.rotation.z = -0.5 * k; b.armR.rotation.z = 0.5 * k;
    }).then(() => {
      this.camera.position.copy(from);
      this.camera.lookAt(0, -2.5, 6);
      void easeToRest((d, fn) => this.tween(d, fn), b, 0.2).then(() => { b.busy = (b.busy ?? 1) - 1; });
    });
  }

  /** Mostra a comemoração escolhida no boneco da vitrine do "Meu craque". */
  celebrateShowcase() {
    if (!this.showcaseBody) return;
    const k = this.kicker;
    this.kicker = this.showcaseBody;
    this.celebrate(true);
    this.kicker = k;
  }

  /** Replay em câmera lenta da última cobrança, de outro ângulo. */
  async replay(o: PlayOpts): Promise<void> {
    if (!this.lastSetup) return;
    this.setup(this.lastSetup);
    this.replayCam = true;
    this.placeCamera();
    this.timeScale = 0.35;
    try {
      await this.play({ ...o, runUp: 0.35, onKick: undefined, onFlightStart: undefined });
      await this.tween(0.5, () => {});
    } finally {
      this.timeScale = 1;
      this.replayCam = false;
      this.placeCamera();
    }
  }

  /** Comemoração: quem fez o gol comemora do jeito escolhido; ou o goleiro levanta os braços. */
  /** Batedor que errou: "uuuh!" com as mãos na cabeça, olha para o céu e depois baixa a cabeça. */
  private lament(b: Body | null, mood: Mood) {
    if (!b) return;
    setMood(b, mood);
    b.busy = (b.busy ?? 0) + 1;
    void this.tween(0.25, () => {}).then(() => this.tween(1.7, (q) => {
      const up = smooth(Math.min(1, q * 4)); // as mãos sobem rápido
      // com o braço para cima, girar em +x traz a mão para a frente, por cima da cabeça
      b.armL.rotation.set(0.85 * up, 0, -2.85 * up);
      b.armR.rotation.set(0.85 * up, 0, 2.85 * up);
      b.head.rotation.x = q < 0.45 ? -0.35 * up : -0.35 + 0.75 * smooth((q - 0.45) / 0.55); // olha para cima, depois para baixo
      b.head.rotation.y = q > 0.5 ? Math.sin((q - 0.5) * 18) * 0.25 * (1 - q) * 2 : 0; // balança a cabeça: "não acredito"
      b.pose.rotation.x = -0.12 * up + (q > 0.5 ? 0.2 * smooth((q - 0.5) / 0.5) : 0);
      b.pose.position.y = q < 0.3 ? -0.08 * Math.sin((q / 0.3) * Math.PI) : 0;
    })).then(() => easeToRest((d, fn) => this.tween(d, fn), b, 0.45)).then(() => { b.busy = (b.busy ?? 1) - 1; });
  }

  /** Goleiro que sofreu o gol: rosto triste e cabeça baixa (no chão, se mergulhou). */
  private dejected(b: Body | null) {
    if (!b) return;
    setMood(b, 'sad');
    void this.tween(0.5, () => {}).then(() => this.tween(1.6, (q) => {
      b.head.rotation.x = 0.5 * smooth(Math.min(1, q * 3));
      if (!this.keeperDiving) { b.pose.rotation.x = 0.25 * smooth(Math.min(1, q * 3)); b.armL.rotation.z = -0.05; b.armR.rotation.z = 0.05; }
    }));
  }

  /** Reação da torcida ao lance: festa (gol da criança ou defesa dela) ou lamento. */
  /** Torcida tensa (de pé, quietinha) enquanto a cobrança não sai. */
  crowdTension(on: boolean) { this.tension = on; }

  crowdReact(kind: 'party' | 'ohh') {
    this.tension = false;
    if (kind === 'ohh') { this.ohh = 1.6; return; }
    this.cheer = Math.max(this.cheer, 4.5);
    this.throwPaper();
  }

  /** Papel picado caindo das arquibancadas, nas cores da torcida. */
  private throwPaper() {
    const n = 700;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    this.paperV = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const back = i % 2 === 0; // metade atrás do gol, metade nas laterais
      pos[i * 3] = back ? (Math.random() - 0.5) * 60 : (Math.random() < 0.5 ? -1 : 1) * (27 + Math.random() * 5);
      pos[i * 3 + 1] = 6 + Math.random() * 6;
      pos[i * 3 + 2] = back ? -13 - Math.random() * 6 : Math.random() * 36;
      this.paperV[i * 3] = (Math.random() - 0.5) * 2;
      this.paperV[i * 3 + 1] = 1.5 + Math.random() * 3; // sobe um pouco antes de cair
      this.paperV[i * 3 + 2] = (Math.random() - 0.5) * 2;
      c.set(this.crowdPal[Math.floor(Math.random() * this.crowdPal.length)]);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    if (this.paper) { this.scene.remove(this.paper); this.paper.geometry.dispose(); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.paper = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 1, depthWrite: false }));
    this.paperT = 0;
    this.scene.add(this.paper);
  }

  private updatePaper(dt: number) {
    if (!this.paper || !this.paperV) return;
    this.paperT += dt;
    const p = this.paper.geometry.attributes.position as THREE.BufferAttribute;
    const a = p.array as Float32Array;
    const v = this.paperV;
    for (let i = 0; i < p.count; i++) {
      v[i * 3 + 1] = Math.max(-1.6, v[i * 3 + 1] - 6 * dt); // cai devagar, como papel
      a[i * 3] += (v[i * 3] + Math.sin(this.paperT * 4 + i) * 0.8) * dt;
      a[i * 3 + 1] = Math.max(0.02, a[i * 3 + 1] + v[i * 3 + 1] * dt);
      a[i * 3 + 2] += v[i * 3 + 2] * dt;
    }
    p.needsUpdate = true;
    const m = this.paper.material as THREE.PointsMaterial;
    m.opacity = Math.max(0, 1 - Math.max(0, this.paperT - 5) / 1.5);
    if (this.paperT > 6.5) { this.scene.remove(this.paper); this.paper.geometry.dispose(); this.paper = null; }
  }

  celebrate(goal: boolean) {
    this.cheer = Math.max(this.cheer, 3);
    const b = goal ? this.kicker : this.keeper;
    if (b) setMood(b, 'happy');
    if (!b || (!goal && this.keeperMode === 'dive')) return; // goleiro que mergulhou fica no chão
    const style: Celebration = goal ? this.kickerCelebration : 'jump';
    // gol da criança no jogo: primeiro ela vê a bola na rede, depois a câmera vira para o jogador comemorando de frente
    const front = goal && b === this.kicker && b !== this.showcaseBody && this.view === 'kick' && !this.replayCam;
    b.busy = (b.busy ?? 0) + 1;
    void this.tween(front ? 0.45 : 0, () => {}).then(() => {
      const cam = front && this.kicker === b ? this.startCelebCam(b) : 0;
      this.runCelebration(b, style, cam);
    });
  }

  /** Câmera da comemoração: na frente do jogador, acompanhando enquanto ele se mexe. */
  private startCelebCam(b: Body): number {
    const r = b.root.rotation.y;
    const id = ++this.celebId;
    this.celebCam = { body: b, fwd: new THREE.Vector3(Math.sin(r), 0, Math.cos(r)), id };
    this.camera.clearViewOffset();
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.fov = THREE.MathUtils.clamp(46 / Math.min(1, this.camera.aspect * 1.7), 46, 78);
    this.camera.updateProjectionMatrix();
    this.followCelebCam(1);
    return id;
  }
  private followCelebCam(k: number) {
    const c = this.celebCam;
    if (!c) return;
    const p = c.body.root.position;
    // à frente do jogador (entre ele e o gol), um pouco de lado e na altura do peito
    const side = new THREE.Vector3(c.fwd.z, 0, -c.fwd.x);
    const want = new THREE.Vector3(p.x + c.fwd.x * 4.6 + side.x * 1.2, 1.7, p.z + c.fwd.z * 4.6 + side.z * 1.2);
    this.camera.position.lerp(want, k);
    this.camera.lookAt(p.x, 1.05 + c.body.root.position.y * 0.5, p.z);
  }
  private endCelebCam(id: number) {
    if (!id || this.celebCam?.id !== id) return;
    this.celebCam = null;
    this.placeCamera();
  }

  private runCelebration(b: Body, style: Celebration, cam: number) {
    const y0 = b.root.position.y;
    const p0 = b.root.position.clone();
    const r0 = b.root.rotation.y;
    const fwd = new THREE.Vector3(Math.sin(r0), 0, Math.cos(r0)); // para onde o boneco olha
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    const dur = { jump: 1.7, plane: 2.1, dance: 1.9, flip: 1.6, robot: 1.9, knee: 2.0, fish: 2.0, spin: 1.8 }[style];
    // na vitrine do Meu craque o boneco fica perto da câmera: corre e desliza menos para não sair do quadro
    const reach = b === this.showcaseBody ? 0.4 : 1;
    // braços para cima em "V": o esquerdo (x negativo) abre girando no sentido negativo, o direito no positivo
    const armsUp = (a: number) => { b.armL.rotation.z = -a; b.armR.rotation.z = a; };
    void this.tween(dur, (q) => {
      const t = q * dur;
      b.armL.rotation.set(0, 0, 0); b.armR.rotation.set(0, 0, 0);
      b.legL.rotation.set(0, 0, 0); b.legR.rotation.set(0, 0, 0);
      b.pose.rotation.set(0, 0, 0); b.pose.position.set(0, 0, 0);
      b.head.rotation.set(0, 0, 0);
      if (style === 'jump') {
        // três pulos socando o ar, encolhendo as pernas lá em cima
        const ph = q * Math.PI * 3;
        const air = Math.abs(Math.sin(ph));
        b.root.position.y = y0 + air * 0.6;
        armsUp(Math.PI * 0.78 + Math.sin(ph * 2) * 0.12);
        b.legL.rotation.x = -air * 0.5; b.legR.rotation.x = -air * 0.5;
        b.head.rotation.x = -0.25 * air;
      } else if (style === 'plane') {
        // aviãozinho: braços abertos batendo como asas, corre em arco na frente da câmera inclinando o corpo
        const flap = Math.sin(t * 9) * 0.4;
        b.armL.rotation.z = -Math.PI / 2 - flap; b.armR.rotation.z = Math.PI / 2 + flap;
        // um "8" deitado na frente da câmera: vai para um lado, faz a curva e volta para o outro
        const at = (u: number) => {
          const a = u * Math.PI * 2;
          const sx = Math.sin(a) * 2.0 * reach, sz = Math.sin(a * 2) * 0.7 * reach;
          return new THREE.Vector3(p0.x + right.x * sx + fwd.x * sz, y0, p0.z + right.z * sx + fwd.z * sz);
        };
        const u = smooth(q);
        const here = at(u), next = at(Math.min(1, u + 0.01));
        b.root.position.copy(here);
        if (next.distanceTo(here) > 1e-4) {
          // meio caminho entre "para onde corre" e "de frente para a câmera": a criança vê o rosto e as asas
          const along = Math.atan2(next.x - here.x, next.z - here.z);
          const d = Math.atan2(Math.sin(along - r0), Math.cos(along - r0));
          b.root.rotation.y = r0 + d * 0.45;
        }
        const turn = Math.cos(u * Math.PI * 2); // de que lado é a curva agora
        b.pose.rotation.z = -turn * 0.4; // inclina para dentro da curva, como asa de avião
        b.pose.rotation.x = 0.15;
        const run = Math.sin(t * 15);
        b.legL.rotation.x = run * 0.75; b.legR.rotation.x = -run * 0.75;
        b.pose.position.y = Math.abs(Math.cos(t * 15)) * 0.06;
      } else if (style === 'dance') {
        // dancinha: quadril para os lados, braços alternando para cima, pulinhos
        const s = Math.sin(t * 8);
        b.pose.position.x = s * 0.2;
        b.pose.rotation.z = s * 0.15;
        b.pose.rotation.y = Math.sin(t * 4) * 0.35;
        b.armL.rotation.z = -(Math.PI * 0.45 + Math.max(0, s) * Math.PI * 0.45);
        b.armR.rotation.z = Math.PI * 0.45 + Math.max(0, -s) * Math.PI * 0.45;
        b.legL.rotation.x = Math.max(0, s) * 0.55; b.legR.rotation.x = Math.max(0, -s) * 0.55;
        b.root.position.y = y0 + Math.abs(Math.cos(t * 8)) * 0.12;
        b.head.rotation.z = -s * 0.15;
      } else if (style === 'flip') {
        // cambalhota para trás no ar, braços para cima antes e na chegada
        const k = Math.min(1, Math.max(0, (t - 0.2) / 0.85));
        const e = smooth(k);
        b.root.position.y = y0 + Math.sin(Math.PI * k) * 1.4;
        // gira pela cintura (1 m do chão), não pelos pés: o corpo não "cai" em cima da câmera no meio do giro
        const th = -Math.PI * 2 * e;
        b.pose.rotation.x = th;
        b.pose.position.y = 1 - Math.cos(th);
        b.pose.position.z = -Math.sin(th);
        if (t < 0.2) { const c = t / 0.2; b.pose.position.y = -0.25 * c; armsUp(Math.PI * 0.6 * c); } // agacha e prepara
        else if (k < 1) { b.legL.rotation.x = -1.2 * Math.sin(Math.PI * k); b.legR.rotation.x = -1.2 * Math.sin(Math.PI * k); armsUp(Math.PI * 0.3); }
        else armsUp(Math.PI * 0.8);
      } else if (style === 'robot') {
        // robô: movimentos travados, em passos, e cabeça virando junto
        const step = Math.floor(t / 0.24) % 4;
        // poses travadas para os lados (de frente dá para ver): um braço para cima, o outro esticado, e troca
        const up = Math.PI * 0.95, out = Math.PI / 2;
        b.armL.rotation.z = -[up, out, 0.15, out][step]; b.armR.rotation.z = [0.15, out, up, out][step];
        b.armL.rotation.x = step === 1 ? -0.6 : 0; b.armR.rotation.x = step === 3 ? -0.6 : 0;
        b.pose.rotation.y = [0.35, 0, -0.35, 0][step];
        b.head.rotation.y = [-0.5, 0, 0.5, 0][step];
        b.legL.rotation.x = step % 2 ? 0.4 : 0; b.legR.rotation.x = step % 2 ? 0 : 0.4;
        b.root.position.y = y0 + (step % 2) * 0.05;
      } else if (style === 'fish') {
        // peixinho: corre, mergulha de barriga e desliza na grama com os braços para a frente, depois bate as pernas
        const run = Math.min(1, t / 0.45);
        const dive = Math.min(1, Math.max(0, (t - 0.45) / 0.25));
        const slide = Math.min(1, Math.max(0, (t - 0.45) / 0.9));
        const go = (0.8 * run + 2.4 * (1 - (1 - slide) * (1 - slide))) * reach;
        b.root.position.set(p0.x + fwd.x * go, y0, p0.z + fwd.z * go);
        if (dive === 0) {
          const r = Math.sin(t * 16);
          b.legL.rotation.x = r * 0.7; b.legR.rotation.x = -r * 0.7;
        } else {
          b.pose.rotation.x = (Math.PI / 2) * smooth(dive); // deita de barriga
          b.pose.position.y = 0.35 * smooth(dive);
          b.pose.position.z = 0.6 * smooth(dive);
          armsUp(Math.PI * 0.95);
          const kick = t > 1.2 ? Math.sin((t - 1.2) * 18) * 0.5 : 0;
          b.legL.rotation.x = -0.3 + kick; b.legR.rotation.x = -0.3 - kick;
          b.head.rotation.x = -0.9 * smooth(dive);
        }
      } else if (style === 'spin') {
        // pião: gira no lugar com os braços abertos, cada vez mais rápido, e termina com os braços para cima
        const e = smooth(Math.min(1, t / 1.4));
        b.root.rotation.y = r0 + e * Math.PI * 6;
        b.armL.rotation.z = -Math.PI / 2 - Math.sin(t * 10) * 0.1; b.armR.rotation.z = Math.PI / 2 + Math.sin(t * 10) * 0.1;
        b.root.position.y = y0 + Math.abs(Math.sin(t * 6)) * 0.12;
        b.legL.rotation.z = -0.15; b.legR.rotation.z = 0.15;
        if (t > 1.4) { b.root.rotation.y = r0; armsUp(Math.PI * 0.85); b.root.position.y = y0 + Math.sin((t - 1.4) * Math.PI / 0.4) * 0.4; }
      } else {
        // de joelhos deslizando na grama, depois inclina para trás e soca o ar
        const k = Math.min(1, t / 0.9);
        const slide = 1 - (1 - k) * (1 - k);
        b.root.position.set(p0.x + fwd.x * 2.6 * reach * slide, y0, p0.z + fwd.z * 2.6 * reach * slide);
        b.pose.position.y = -0.42;
        b.legL.rotation.x = -1.4; b.legR.rotation.x = -1.4;
        b.pose.rotation.x = -0.15 - 0.25 * Math.min(1, t / 1.0);
        armsUp(Math.PI * 0.8 + (t > 0.9 ? Math.sin((t - 0.9) * 12) * 0.15 : 0));
        b.head.rotation.x = -0.35;
      }
    }).then(() => {
      if (!b) return;
      b.root.position.y = y0;
      // volta à posição neutra suavemente e só então volta a respirar; a câmera volta ao normal
      void easeToRest((d, fn) => this.tween(d, fn), b, 0.35).then(() => { b.busy = (b.busy ?? 1) - 1; this.endCelebCam(cam); setMood(b, 'calm'); });
    });
  }
}

