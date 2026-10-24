/* Jogadores realistas (versão adulta). Os modelos e animações vêm do Mixamo e ficam em
 * public/models/ só na hora de montar o app (não vão para o repositório público; ver PUBLICAR.md).
 *
 * Cada jogador realista fica "pendurado" no boneco de blocos (que continua invisível):
 * - modo boneco: braços, pernas e cabeça seguem as articulações do boneco de blocos, então todas
 *   as animações do jogo (corrida, comemorações, lamento) funcionam sem mudar nada;
 * - modo clipe: toca uma animação do Mixamo (chute, pulo do goleiro, vitória).
 * A troca entre os dois modos é suave (mistura de 0,2 s).
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Kit } from './teams';

export type RealWho = 'm' | 'f';
export type ClipName = 'chute' | 'goleiro-pulo' | 'goleiro-pulo-direita' | 'goleiro-parado' | 'goleiro-parado-com-bola' | 'comemoracao' | 'comemoracao-boxe';

const FILES: Record<RealWho, string> = { m: 'models/jogador.glb', f: 'models/jogadora.glb' };
/** altura no jogo (o boneco de blocos tem uns 2 m; os modelos têm 1,76 m) */
const SCALE = 0.0106;

interface Proto {
  scene: THREE.Object3D;
  clips: Map<string, THREE.AnimationClip>;
  /** altura do modelo (cm) */
  height: number;
}
const protos: Partial<Record<RealWho, Proto>> = {};
let loading: Promise<boolean> | null = null;

/** Carrega os dois modelos (uma vez só). Responde false se os arquivos não estiverem no app. */
export function loadReal(): Promise<boolean> {
  if (!loading) loading = (async () => {
    try {
      const loader = new GLTFLoader();
      await Promise.all((Object.keys(FILES) as RealWho[]).map(async (who) => {
        const g = await loader.loadAsync(FILES[who]);
        protos[who] = prepare(g.scene, g.animations);
      }));
      return true;
    } catch (e) {
      console.warn('modelos realistas indisponíveis', e);
      return false;
    }
  })();
  return loading;
}
export const realReady = () => !!(protos.m && protos.f);

const boneKey = (n: string) => n.replace(/^mixamorig\d*:?/, '').replace(/_\d+$/, ''); // o carregador põe _1, _2 em nomes repetidos

/** Marca em cada vértice que parte do uniforme ele é: x camisa, y calção, z meião, w luva.
 * 1 = roupa do modelo (tecido branco: multiplica pela cor), 2 = pele pintada (manga longa, meião). */
function prepare(scene: THREE.Object3D, clips: THREE.AnimationClip[]): Proto {
  const meshes: THREE.SkinnedMesh[] = [];
  scene.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
  let height = 0;
  for (const m of meshes) { m.geometry.computeBoundingBox(); height = Math.max(height, m.geometry.boundingBox!.max.y); }
  const has = (re: RegExp) => meshes.some((m) => re.test(m.name));
  // a camisa já tem manga longa? (a da jogadora tem; a do jogador é camiseta)
  const shirt = meshes.find((m) => /Shirt/.test(m.name));
  const longSleeve = !!shirt && usesBone(shirt, /ForeArm/);
  const ownSocks = has(/Socks/);
  for (const m of meshes) {
    const g = m.geometry;
    const n = g.attributes.position.count;
    const kit = new Float32Array(n * 4);
    const bones = m.skeleton.bones.map((b) => boneKey(b.name));
    const si = g.attributes.skinIndex, sw = g.attributes.skinWeight, pos = g.attributes.position;
    const part = /Shirt/.test(m.name) ? 0 : /Shorts/.test(m.name) ? 1 : /Socks/.test(m.name) ? 2 : -1;
    const body = /Body/.test(m.name);
    for (let v = 0; v < n; v++) {
      if (part >= 0) { kit[v * 4 + part] = 1; continue; }
      if (!body) continue;
      let best = 0, bi = 0;
      for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > best) { best = w; bi = si.getComponent(v, k); } }
      const b = bones[bi] ?? '';
      const y = pos.getY(v) / height;
      if (/Hand/.test(b)) kit[v * 4 + 3] = 2; // luva (só no goleiro)
      else if (!longSleeve && /Arm$|ForeArm/.test(b)) kit[v * 4] = 2; // manga longa por cima das tatuagens
      else if (!ownSocks && /Leg$/.test(b) && !/UpLeg/.test(b) && y < 0.25) kit[v * 4 + 2] = 2; // meião até abaixo do joelho
    }
    g.setAttribute('kitPart', new THREE.BufferAttribute(kit, 4));
    m.frustumCulled = false; // a caixa do modelo parado não acompanha o mergulho
  }
  const map = new Map<string, THREE.AnimationClip>();
  for (const c of clips) map.set(c.name, c);
  return { scene, clips: map, height };
}
function usesBone(m: THREE.SkinnedMesh, re: RegExp): boolean {
  const idx = m.skeleton.bones.map((b, i) => (re.test(b.name) ? i : -1)).filter((i) => i >= 0);
  const si = m.geometry.attributes.skinIndex, sw = m.geometry.attributes.skinWeight;
  for (let v = 0; v < si.count; v++) for (let k = 0; k < 4; k++) if (sw.getComponent(v, k) > 0.5 && idx.includes(si.getComponent(v, k))) return true;
  return false;
}

/* ---------- uniforme pintado ---------- */

export interface Uniform { kit: Kit; number: number; keeper: boolean; name?: string }

const matCache = new Map<string, THREE.Material[]>();
function numberTex(number: number, name: string, dark: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = dark ? '#151515' : '#ffffff';
  g.strokeStyle = dark ? 'rgba(255,255,255,.35)' : 'rgba(0,0,0,.45)';
  g.font = '900 150px system-ui, sans-serif';
  g.lineWidth = 8;
  g.strokeText(String(number), 128, 156);
  g.fillText(String(number), 128, 156);
  if (name) {
    g.font = `900 ${name.length > 8 ? 30 : 38}px system-ui, sans-serif`;
    g.lineWidth = 5;
    g.strokeText(name.toUpperCase(), 128, 42);
    g.fillText(name.toUpperCase(), 128, 42);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const lum = (hex: string) => { const c = new THREE.Color(hex); return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b; };

/** Material do corpo com o uniforme do time (cores e número pintados pela placa de vídeo). */
function uniformMaterial(base: THREE.MeshStandardMaterial, u: Uniform, height: number): THREE.MeshLambertMaterial {
  const shirt = u.keeper ? u.kit.keeper : u.kit.shirt;
  const shorts = u.keeper ? '#1b1b1b' : u.kit.shorts;
  const socks = u.keeper ? u.kit.keeper : u.kit.socks;
  const m = new THREE.MeshLambertMaterial({ map: base.map });
  const col = (h: string) => new THREE.Color(h);
  const uniforms = {
    uShirt: { value: col(shirt) }, uShorts: { value: col(shorts) }, uSocks: { value: col(socks) },
    uGlove: { value: col('#f2f2f2') }, uGloveOn: { value: u.keeper ? 1 : 0 },
    uStripe: { value: col(!u.keeper && u.kit.stripe ? u.kit.stripe : shirt) }, uStripeOn: { value: !u.keeper && u.kit.stripe ? 1 : 0 },
    uNum: { value: numberTex(u.number, u.name ?? '', lum(shirt) > 0.62) },
    uH: { value: height },
  };
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 kitPart;\nvarying vec4 vKit;\nvarying vec3 vBind;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKit = kitPart;\nvBind = position;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec4 vKit; varying vec3 vBind;
uniform vec3 uShirt, uShorts, uSocks, uGlove, uStripe; uniform float uGloveOn, uStripeOn, uH; uniform sampler2D uNum;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec4 k = vKit; k.w *= uGloveOn;
  float w = max(max(k.x, k.y), max(k.z, k.w));
  if (w > 0.5) {
    vec3 c = k.x >= w ? uShirt : k.y >= w ? uShorts : k.z >= w ? uSocks : uGlove;
    // listras verticais na camisa (frente e costas, não nas mangas)
    if (k.x >= w && uStripeOn > 0.5 && abs(vBind.x) < uH * 0.11 && mod(vBind.x + 4.0, 17.0) < 7.5) c = uStripe;
    // tecido do modelo: mantém as dobras; pele pintada: cor lisa
    vec3 shade = w > 1.5 ? vec3(0.9) : diffuseColor.rgb;
    diffuseColor.rgb = c * shade;
    // número (e nome) nas costas
    if (k.x >= w && vBind.z < -uH * 0.02) {
      vec2 nuv = vec2((uH * 0.075 - vBind.x) / (uH * 0.15), (vBind.y - uH * 0.6) / (uH * 0.17));
      if (nuv.x > 0.0 && nuv.x < 1.0 && nuv.y > 0.0 && nuv.y < 1.0) {
        vec4 n = texture2D(uNum, nuv);
        diffuseColor.rgb = mix(diffuseColor.rgb, n.rgb * shade / max(shade.r, 0.6), n.a);
      }
    }
  }
}`);
  };
  m.customProgramCacheKey = () => 'uniforme';
  m.userData.uniform = true;
  return m;
}

/* ---------- jogador ---------- */

/** Peças do boneco de blocos que o jogador realista segue no modo boneco. */
export interface Rig { pose: THREE.Object3D; legL: THREE.Object3D; legR: THREE.Object3D; armL: THREE.Object3D; armR: THREE.Object3D; head: THREE.Object3D }

const q1 = new THREE.Quaternion(), q2 = new THREE.Quaternion(), q3 = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);
const QE = new THREE.Quaternion(), EE = new THREE.Euler();

export class RealBody {
  /** vai dentro do "pose" do boneco de blocos */
  readonly obj = new THREE.Group();
  readonly model: THREE.Object3D;
  private mixer: THREE.AnimationMixer;
  private bones = new Map<string, THREE.Bone>();
  private all: THREE.Bone[] = [];
  /** pose de base do modo boneco (de pé, braços soltos) */
  private base: { q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  /** orientação de cada osso seguido, no espaço do "pose", na pose de base */
  private rest = new Map<string, THREE.Quaternion>();
  private snap: { q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
  private blend = 1;
  private action: THREE.AnimationAction | null = null;
  private stopAt = Infinity;
  mode: 'puppet' | 'clip' = 'puppet';
  readonly proto: Proto;

  constructor(readonly who: RealWho, u: Uniform) {
    const p = protos[who]!;
    this.proto = p;
    this.model = cloneSkinned(p.scene);
    this.model.scale.setScalar(SCALE);
    this.obj.add(this.model);
    const mats = new Map<THREE.Material, THREE.Material>();
    const key = `${who}|${u.keeper ? u.kit.keeper : u.kit.shirt}|${u.kit.shorts}|${u.kit.socks}|${u.kit.stripe}|${u.number}|${u.keeper}|${u.name ?? ''}`;
    const cached = matCache.get(key);
    let i = 0;
    const made: THREE.Material[] = [];
    this.model.traverse((o) => {
      if ((o as THREE.Bone).isBone) { this.bones.set(boneKey(o.name), o as THREE.Bone); this.all.push(o as THREE.Bone); }
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh) return;
      m.castShadow = false;
      const src = m.material as THREE.MeshStandardMaterial;
      if (!mats.has(src)) {
        const mm = cached?.[i] ?? (/body/i.test(src.name)
          ? uniformMaterial(src, u, p.height)
          : new THREE.MeshLambertMaterial({ map: src.map, alphaTest: 0.5, side: THREE.DoubleSide }));
        mats.set(src, mm); made.push(mm); i++;
      }
      m.material = mats.get(src)!;
    });
    if (!cached) matCache.set(key, made);
    if (matCache.size > 40) matCache.delete(matCache.keys().next().value!);
    this.mixer = new THREE.AnimationMixer(this.model);
    // pose de base: o primeiro quadro da comemoração (de pé, natural)
    const a = this.mixer.clipAction(p.clips.get('comemoracao')!);
    a.play(); this.mixer.setTime(0);
    this.base = this.all.map((b) => ({ q: b.quaternion.clone(), p: b.position.clone() }));
    this.obj.updateMatrixWorld(true);
    const inv = this.obj.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const n of ['LeftArm', 'RightArm', 'LeftUpLeg', 'RightUpLeg', 'Head', 'LeftLeg', 'RightLeg']) {
      const b = this.bones.get(n);
      if (b) this.rest.set(n, inv.clone().multiply(b.getWorldQuaternion(new THREE.Quaternion())));
    }
    a.stop(); // (parar a animação devolve o esqueleto à pose "T"; a base já foi guardada)
  }

  bone(n: string) { return this.bones.get(n); }

  private takeSnap() {
    this.snap = this.all.map((b) => ({ q: b.quaternion.clone(), p: b.position.clone() }));
    this.blend = 0;
  }

  /** Toca um clipe do Mixamo. `from`/`to`: trecho (s); `speed`: velocidade; `loop`: repete. */
  play(name: ClipName, o: { from?: number; to?: number; speed?: number; loop?: boolean } = {}) {
    const clip = this.proto.clips.get(name);
    if (!clip) return;
    this.takeSnap();
    this.mixer.stopAllAction();
    const a = this.mixer.clipAction(clip);
    a.reset();
    a.setLoop(o.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    a.clampWhenFinished = true;
    a.timeScale = o.speed ?? 1;
    a.time = o.from ?? 0;
    a.play();
    this.action = a;
    this.stopAt = o.to ?? Infinity;
    this.mode = 'clip';
  }
  /** Tempo atual do clipe que está tocando. */
  get clipTime() { return this.action?.time ?? 0; }
  set speed(s: number) { if (this.action) this.action.timeScale = s; }

  /** Volta a seguir o boneco de blocos. */
  puppet() {
    if (this.mode === 'puppet') return;
    this.takeSnap();
    this.mixer.stopAllAction();
    this.action = null;
    this.mode = 'puppet';
  }

  update(dt: number, rig: Rig) {
    if (this.mode === 'clip' && this.action) {
      this.mixer.update(dt);
      if (this.action.time >= this.stopAt) { this.action.time = this.stopAt; this.action.paused = true; }
    } else {
      this.all.forEach((b, i) => { b.quaternion.copy(this.base[i].q); b.position.copy(this.base[i].p); });
      this.obj.updateMatrixWorld(true);
      const poseInv = q3.copy(this.obj.getWorldQuaternion(q1)).invert();
      const follow = (n: string, rot: THREE.Quaternion, bend = 0) => {
        const b = this.bones.get(n), r = this.rest.get(n);
        if (!b || !r) return;
        // alvo no espaço do "pose": rotação da peça do boneco × orientação de descanso
        const target = q1.copy(rot);
        if (bend) target.multiply(q2.setFromAxisAngle(AX, bend));
        target.multiply(r);
        const parent = b.parent!.getWorldQuaternion(q2);
        b.quaternion.copy(parent.premultiply(poseInv).invert().multiply(target));
        b.updateMatrixWorld(true);
      };
      // braço esquerdo do boneco (x < 0) é o lado direito do jogador
      follow('RightArm', rig.armL.quaternion); follow('LeftArm', rig.armR.quaternion);
      // de joelhos (corpo baixo e "pernas para a frente" no boneco): coxa para baixo e canela para trás, no chão
      const kneel = rig.pose.position.y < -0.25;
      for (const [up, low, leg] of [['RightUpLeg', 'RightLeg', rig.legL], ['LeftUpLeg', 'LeftLeg', rig.legR]] as const) {
        let rx = leg.rotation.x, bend: number;
        if (kneel && rx < -0.8) { rx += 1.25; bend = 1.55; }
        // joelho dobra quando a coxa vai para a frente (corrida, cambalhota) e um pouco quando vai para trás
        else bend = THREE.MathUtils.clamp(-rx * 1.1 - 0.05, 0, 1.7) + (rx > 0.2 ? rx * 0.5 : 0);
        const q = kneel ? QE.setFromEuler(EE.set(rx, leg.rotation.y, leg.rotation.z)) : leg.quaternion;
        follow(up, q);
        follow(low, q, bend);
      }
      follow('Head', rig.head.quaternion);
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.2);
      const e = this.blend * this.blend * (3 - 2 * this.blend);
      this.all.forEach((b, i) => {
        const s = this.snap[i];
        if (!s) return;
        b.quaternion.copy(q1.copy(s.q).slerp(b.quaternion, e));
        b.position.lerpVectors(s.p, b.position.clone(), e);
      });
    }
  }

  /** Ponto entre as mãos (para a bola encaixar nas luvas). */
  hands(): THREE.Vector3 {
    this.obj.updateMatrixWorld(true);
    const a = this.bones.get('LeftHand')!.getWorldPosition(new THREE.Vector3());
    const b = this.bones.get('RightHand')!.getWorldPosition(new THREE.Vector3());
    return a.add(b).multiplyScalar(0.5);
  }

  /** Enfeite preso na cabeça (chapéu da edição da época). */
  addHat(o: THREE.Object3D) {
    const head = this.bones.get('Head');
    if (!head) return;
    const g = new THREE.Group();
    g.scale.setScalar(0.55 / SCALE);
    g.position.y = 9; // cm acima do pescoço
    g.add(o);
    head.add(g);
  }
}

/* ---------- torcida realista ---------- */

/** Poses da torcida (colunas do atlas): parado, braços para cima, aplaudindo, mãos na cabeça. */
export const CROWD_POSES = 4;
/** Recorte de cada foto, em metros: da cintura até as mãos levantadas. */
export const CROWD_W = 1.2, CROWD_H = 1.5, CROWD_Y0 = 0.95;
export interface CrowdAtlas { map: THREE.Texture; mask: THREE.Texture }
let atlas: CrowdAtlas | null = null;

function maskMaterial(src: THREE.Material): THREE.MeshBasicMaterial {
  const map = (src as THREE.MeshLambertMaterial).map ?? null;
  const hair = !src.userData.uniform;
  const m = new THREE.MeshBasicMaterial({ color: '#000000', map: hair ? map : null, alphaTest: hair ? 0.5 : 0, side: THREE.DoubleSide });
  if (!hair) m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 kitPart;\nvarying float vShirt;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShirt = kitPart.x;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShirt;')
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\ngl_FragColor = vec4(vec3(step(0.5, vShirt)), 1.0);');
  };
  m.customProgramCacheKey = () => 'mascara' + (hair ? 'c' : 'k');
  return m;
}

/** Fotografa o jogador e a jogadora nas poses da torcida (uma vez só): cor e máscara da camisa. */
export function crowdAtlas(renderer: THREE.WebGLRenderer): CrowdAtlas | null {
  if (atlas) return atlas;
  if (!realReady()) return null;
  const CW = 192, CH = 240; // pixels por foto
  const mk = () => {
    const t = new THREE.WebGLRenderTarget(CW * CROWD_POSES, CH * 2, { samples: 4 });
    t.texture.colorSpace = THREE.SRGBColorSpace;
    t.texture.generateMipmaps = true;
    t.texture.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  };
  const rtMap = mk(), rtMask = mk();
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight('#ffffff', '#8a8a8a', 2.2));
  const key = new THREE.DirectionalLight('#ffffff', 1.4);
  key.position.set(0.6, 2.5, 3);
  scene.add(key);
  const cam = new THREE.OrthographicCamera(-CROWD_W / 2, CROWD_W / 2, CROWD_Y0 + CROWD_H, CROWD_Y0, 0.1, 20);
  cam.position.set(0, 0, 6);
  const white: Kit = { shirt: '#ffffff', shorts: '#ffffff', socks: '#ffffff', keeper: '#ffffff' };
  const rig = () => ({ pose: new THREE.Group(), legL: new THREE.Group(), legR: new THREE.Group(), armL: new THREE.Group(), armR: new THREE.Group(), head: new THREE.Group() });
  const poses: ((r: Rig) => void)[] = [
    (r) => { r.armL.rotation.z = -0.12; r.armR.rotation.z = 0.12; },
    (r) => { r.armL.rotation.set(0.15, 0, -2.55); r.armR.rotation.set(0.15, 0, 2.55); r.head.rotation.x = -0.2; },
    (r) => { r.armL.rotation.set(-1.15, 0, 0.42); r.armR.rotation.set(-1.15, 0, -0.42); },
    (r) => { r.armL.rotation.set(0.85, 0, -2.85); r.armR.rotation.set(0.85, 0, 2.85); r.head.rotation.x = 0.3; },
  ];
  const prevClear = renderer.getClearColor(new THREE.Color()), prevAlpha = renderer.getClearAlpha();
  const prevTarget = renderer.getRenderTarget();
  renderer.setClearColor('#000000', 0);
  (['m', 'f'] as RealWho[]).forEach((who, row) => {
    const body = new RealBody(who, { kit: white, number: 0, keeper: false });
    scene.add(body.obj);
    const meshes: THREE.SkinnedMesh[] = [];
    body.model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh) meshes.push(o as THREE.SkinnedMesh); });
    const color = meshes.map((m) => m.material as THREE.Material);
    const masks = color.map((m) => maskMaterial(m));
    poses.forEach((set, col) => {
      const r = rig();
      set(r);
      body.update(0.016, r);
      body.obj.updateMatrixWorld(true);
      for (const [rt, mats] of [[rtMap, color], [rtMask, masks]] as const) {
        meshes.forEach((m, i) => { m.material = mats[i]; });
        rt.viewport.set(col * CW, (1 - row) * CH, CW, CH);
        rt.scissor.set(col * CW, (1 - row) * CH, CW, CH);
        rt.scissorTest = true;
        renderer.setRenderTarget(rt);
        renderer.clear();
        renderer.render(scene, cam);
      }
    });
    meshes.forEach((m, i) => { m.material = color[i]; });
    scene.remove(body.obj);
    masks.forEach((m) => m.dispose());
  });
  renderer.setRenderTarget(prevTarget);
  renderer.setClearColor(prevClear, prevAlpha);
  atlas = { map: rtMap.texture, mask: rtMask.texture };
  return atlas;
}

/** Material da torcida realista: cada torcedor escolhe a foto (pose e quem) e pinta a camisa. */
export function crowdMaterial(a: CrowdAtlas): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ map: a.map, alphaTest: 0.45, side: THREE.DoubleSide });
  m.onBeforeCompile = (s) => {
    s.uniforms.uMask = { value: a.mask };
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aPose;\nattribute vec2 aVar;\nvarying float vTone;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
vMapUv = vec2((uv.x + aPose) / ${CROWD_POSES}.0, (uv.y + 1.0 - aVar.x) / 2.0);
vTone = aVar.y;`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uMask;\nvarying float vTone;')
      .replace('#include <color_fragment>', `
#if defined( USE_INSTANCING_COLOR ) || defined( USE_COLOR )
  float shirt = texture2D(uMask, vMapUv).r;
  diffuseColor.rgb *= mix(mix(vec3(0.5, 0.36, 0.28), vec3(1.0), vTone), vColor, shirt); // pele e cabelo variam do mais escuro ao mais claro
#endif`);
  };
  m.customProgramCacheKey = () => 'torcida';
  return m;
}
