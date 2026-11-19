import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import {
  BONUSES,
  BRICK_H,
  BRICK_W,
  H,
  MAX_BALLS,
  NET_Y,
  RACKET_H,
  RACKET_W,
  RACKET_Y,
  SPARK_LIFE,
  W,
  type BonusId,
  type Brick,
  type Game,
} from "./engine";

/**
 * Tampilan 3D Slay Rally (three.js). Mesin game tetap 2D (x, y logis); di sini
 * x → sumbu X, y → sumbu Z (menjauh dari kamera), dan Y adalah ketinggian.
 */

const BLOCK_HEIGHT = 28;
const STRONG_HEIGHT = 42;
const WALL_HEIGHT = 34;
const WALL_THICK = 10;
const APRON = 26; // jarak lapangan ke dinding
const MAX_DROPS = 4;
const MAX_SPARKS = 48;

/**
 * Jahitan bola tenis: satu kurva tertutup di permukaan bola yang membelahnya menjadi
 * dua panel felt berbentuk "angka delapan" yang saling mengunci.
 */
function seamPoint(t: number, target: THREE.Vector3) {
  const a = t * Math.PI * 2;
  return target.set(
    0.75 * Math.cos(a) + 0.25 * Math.cos(3 * a),
    0.75 * Math.sin(a) - 0.25 * Math.sin(3 * a),
    0.866 * Math.sin(2 * a),
  );
}

const SEAM_HALF_WIDTH = 0.07; // setengah lebar jahitan, dalam radian di permukaan bola

/** Bola digambar sedikit lebih besar dari ukuran fisiknya supaya detailnya terbaca. */
const BALL_VISUAL = 1.6;

const toX = (x: number) => x - W / 2;
const toZ = (y: number) => y - H / 2;

/** Warna diambil dari token CSS oleh pemanggil — renderer tidak menyimpan hex. */
export type Palette = {
  /** Warna permukaan di dalam garis lapangan (lebih terang dari arena di luarnya). */
  courtInner: string;
  /** Warna dasar blok (bagian bawah gradasi). */
  brickBase: string;
  courtTop: string;
  courtBottom: string;
  line: string;
  ball: string;
  /** Warna felt dan jahitan bola tenis. */
  felt: string;
  seam: string;
  racket: string;
  /** Warna atas blok; dasarnya `brickBase` (gradasi). */
  brick: string;
  /** Bangku tribun. */
  seat: string;
  ink: string;
  wall: string;
  ground: string;
  /** font-family untuk tulisan di lapangan. */
  font: string;
  bonus: Record<BonusId, string>;
};

/**
 * Lukis permukaan arena ke canvas 2D — dipakai sebagai tekstur lantai. Arena bermain lebih
 * lebar dari lapangan tenisnya; garis lapangan digambar dengan proporsi lapangan sungguhan
 * (23,77 m × 10,97 m) di tengah arena, jadi tidak tampak melar.
 */
function paintCourt(ctx: CanvasRenderingContext2D, p: Palette) {
  const floor = ctx.createLinearGradient(0, 0, 0, H);
  floor.addColorStop(0, p.courtBottom);
  floor.addColorStop(1, p.ground);
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, W, H);

  const length = H - 44; // panjang lapangan (baseline ke baseline)
  const metre = length / 23.77;
  const width = 10.97 * metre * 1.12; // sedikit dilebarkan supaya mengisi arena
  const alley = 1.37 * metre; // lorong ganda
  const service = 6.4 * metre; // jarak garis servis dari net
  const left = (W - width) / 2;
  const right = left + width;
  const top = (H - length) / 2;
  const bottom = top + length;
  const mid = H / 2;

  // Di dalam garis: biru yang lebih hidup, paling terang di sekitar net.
  const inner = ctx.createLinearGradient(0, top, 0, bottom);
  inner.addColorStop(0, p.courtTop);
  inner.addColorStop(0.5, p.courtInner);
  inner.addColorStop(1, p.courtTop);
  ctx.fillStyle = inner;
  ctx.fillRect(left, top, width, length);
  // Sorot lampu lembut di tengah arena.
  const spot = ctx.createRadialGradient(W / 2, mid, 0, W / 2, mid, H * 0.55);
  spot.addColorStop(0, p.brick);
  spot.addColorStop(1, "transparent");
  ctx.save();
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = spot;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();

  ctx.save();
  // Wordmark dengan hijau stabilo khas Soslay, penuh (bukan bayangan samar).
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = p.ball;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 44px ${p.font}`;
  ctx.fillText("SLAY", W / 2, mid + service + 38);
  ctx.fillText("CLUB.", W / 2, mid + service + 80);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = p.line;
  ctx.lineWidth = 5;
  ctx.strokeRect(left, top, width, length);
  ctx.beginPath();
  // Garis tunggal
  ctx.moveTo(left + alley, top);
  ctx.lineTo(left + alley, bottom);
  ctx.moveTo(right - alley, top);
  ctx.lineTo(right - alley, bottom);
  // Garis servis + garis tengah servis
  ctx.moveTo(left + alley, mid - service);
  ctx.lineTo(right - alley, mid - service);
  ctx.moveTo(left + alley, mid + service);
  ctx.lineTo(right - alley, mid + service);
  ctx.moveTo(W / 2, mid - service);
  ctx.lineTo(W / 2, mid + service);
  // Net dan tanda tengah baseline
  ctx.moveTo(left, mid);
  ctx.lineTo(right, mid);
  ctx.moveTo(W / 2, top);
  ctx.lineTo(W / 2, top + 8);
  ctx.moveTo(W / 2, bottom);
  ctx.lineTo(W / 2, bottom - 8);
  ctx.stroke();
  ctx.restore();
}

export class Court3D {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(46, 1, 10, 4000);
  private target = new THREE.Vector3(0, 0, 24);

  private palette: Palette;
  private blockGeos = new Map<number, THREE.BufferGeometry>();
  private blockMat: THREE.MeshStandardMaterial;
  private blocks = new Map<Brick, THREE.Mesh>();

  private racket = new THREE.Group();
  private balls: THREE.Mesh[] = [];
  private ballMat: THREE.MeshPhysicalMaterial;
  private ballTints: { plain: THREE.Color; smash: THREE.Color };
  private ballGlows: { plain: THREE.Color; smash: THREE.Color };
  private ballLight: THREE.PointLight;
  private drops: THREE.Sprite[] = [];
  private dropMats = {} as Record<BonusId, THREE.SpriteMaterial>;
  private sparks: THREE.Mesh[] = [];
  private net: THREE.Mesh;

  private raycaster = new THREE.Raycaster();
  private spin = new THREE.Vector3();
  private clock = 0;
  private textPainters: (() => void)[] = [];
  private disposed = false;
  /** true bila adegan perlu digambar ulang walau game sedang diam (ganti ukuran, font baru dimuat). */
  dirty = true;

  constructor(canvas: HTMLCanvasElement, palette: Palette) {
    this.palette = palette;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    const { scene } = this;
    scene.background = new THREE.Color(palette.ground);
    scene.fog = new THREE.Fog(palette.ground, 1400, 3400);
    this.blockMat = new THREE.MeshStandardMaterial({
      vertexColors: true, // gradasi warna per blok, lihat blockGeometry()
      emissive: palette.brickBase,
      emissiveIntensity: 0.18,
      roughness: 0.3,
      metalness: 0.1,
    });

    // Cahaya
    scene.add(
      new THREE.HemisphereLight(palette.brick, palette.courtBottom, 1.05),
    );
    // Cahaya tepi berwarna dari sisi berlawanan matahari — memberi kedalaman, tidak sekadar terang-gelap.
    const rim = new THREE.DirectionalLight(palette.bonus.smash, 1.5);
    rim.position.set(260, 180, -220);
    const fill = new THREE.DirectionalLight(palette.racket, 0.5);
    fill.position.set(0, 120, 420);
    scene.add(rim, fill);
    const sun = new THREE.DirectionalLight(palette.line, 2.8);
    sun.position.set(-160, 420, 140);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const shadowCam = sun.shadow.camera;
    shadowCam.left = -W / 2 - 60;
    shadowCam.right = W / 2 + 60;
    shadowCam.top = H / 2 + 60;
    shadowCam.bottom = -H / 2 - 60;
    shadowCam.near = 50;
    shadowCam.far = 900;
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    // Tanah di luar lapangan
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(6000, 6000),
      new THREE.MeshStandardMaterial({ color: palette.ground, roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.5;
    scene.add(outer);

    // Lantai lapangan — tekstur dilukis dengan canvas 2D.
    const paint = document.createElement("canvas");
    const texScale = 2;
    paint.width = W * texScale;
    paint.height = H * texScale;
    const pctx = paint.getContext("2d");
    pctx?.scale(texScale, texScale);
    if (pctx) paintCourt(pctx, palette);
    const courtTex = new THREE.CanvasTexture(paint);
    this.textPainters.push(() => {
      if (pctx) paintCourt(pctx, palette);
      courtTex.needsUpdate = true;
      this.dirty = true;
    });
    courtTex.colorSpace = THREE.SRGBColorSpace;
    courtTex.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(W, H),
      new THREE.MeshStandardMaterial({ map: courtTex, roughness: 0.85 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);

    // Apron + dinding keliling (kiri, kanan, belakang) dengan strip lime di atasnya.
    const apron = new THREE.Mesh(
      new THREE.PlaneGeometry(W + APRON * 2, H + APRON * 2),
      new THREE.MeshStandardMaterial({
        color: palette.courtBottom,
        roughness: 1,
      }),
    );
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.2;
    apron.receiveShadow = true;
    scene.add(apron);

    const wallMat = new THREE.MeshStandardMaterial({
      color: palette.wall,
      roughness: 0.7,
    });
    const stripeMat = new THREE.MeshStandardMaterial({
      color: palette.racket,
      emissive: palette.racket,
      emissiveIntensity: 0.6,
    });
    const addWall = (w: number, d: number, x: number, z: number) => {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(w, WALL_HEIGHT, d),
        wallMat,
      );
      wall.position.set(x, WALL_HEIGHT / 2, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(w, 2, d), stripeMat);
      stripe.position.set(x, WALL_HEIGHT + 1, z);
      scene.add(wall, stripe);
    };
    const sideX = W / 2 + APRON + WALL_THICK / 2;
    const backZ = -H / 2 - APRON - WALL_THICK / 2;
    addWall(WALL_THICK, H + APRON * 2, -sideX, 0);
    addWall(WALL_THICK, H + APRON * 2, sideX, 0);
    addWall(W + APRON * 2 + WALL_THICK * 2, WALL_THICK, 0, backZ);

    this.buildStands();

    // Raket: bilah tebal bersudut bulat, dengan pelat gelap di atas dan garis lime menyala di tengahnya.
    const paddleDepth = RACKET_H + 8;
    const paddleHeight = 13;
    const body = new THREE.Mesh(
      new RoundedBoxGeometry(RACKET_W, paddleHeight, paddleDepth, 4, 5),
      new THREE.MeshStandardMaterial({
        color: palette.line,
        roughness: 0.3,
        metalness: 0.05,
      }),
    );
    body.position.y = paddleHeight / 2;
    body.castShadow = true;
    const plate = new THREE.Mesh(
      new RoundedBoxGeometry(RACKET_W - 10, 3, paddleDepth - 8, 3, 1.4),
      new THREE.MeshStandardMaterial({ color: palette.ink, roughness: 0.5 }),
    );
    plate.position.y = paddleHeight;
    const glow = new THREE.Mesh(
      new RoundedBoxGeometry(RACKET_W - 26, 2, 3.5, 3, 1),
      new THREE.MeshStandardMaterial({
        color: palette.racket,
        emissive: palette.racket,
        emissiveIntensity: 1.1,
      }),
    );
    glow.position.y = paddleHeight + 1.6;
    this.racket.add(body, plate, glow);
    this.racket.position.z = toZ(RACKET_Y + RACKET_H / 2);
    scene.add(this.racket);

    // Bola
    const ballGeo = new THREE.SphereGeometry(1, 48, 32);
    // Felt kuning matte dengan kilau halus di tepi (sheen), jahitan putih yang sedikit cekung.
    const { map, bump } = this.tennisTextures();
    this.ballMat = new THREE.MeshPhysicalMaterial({
      map,
      bumpMap: bump,
      bumpScale: 2.5,
      roughness: 1,
      metalness: 0,
      sheen: 0.45,
      sheenRoughness: 0.85,
      sheenColor: new THREE.Color(palette.seam),
      emissive: palette.line,
      emissiveMap: map,
      emissiveIntensity: 0.1,
    });
    for (let i = 0; i < MAX_BALLS; i++) {
      const ball = new THREE.Mesh(ballGeo, this.ballMat);
      ball.castShadow = true;
      ball.visible = false;
      ball.userData.last = new THREE.Vector3();
      this.balls.push(ball);
      scene.add(ball);
    }
    // Cahaya panggung cukup terang; warna dasar diredupkan supaya kuning felt tidak memutih.
    // Teksturnya sudah kuning, jadi warna dasar biasa = putih; saat Slay Smash bola jadi pink.
    this.ballTints = {
      plain: new THREE.Color(palette.line).multiplyScalar(0.62),
      smash: new THREE.Color(palette.bonus.smash).multiplyScalar(0.62),
    };
    this.ballGlows = {
      plain: new THREE.Color(palette.ball),
      smash: new THREE.Color(palette.bonus.smash),
    };
    this.ballLight = new THREE.PointLight(palette.ball, 0, 150, 1.2);
    scene.add(this.ballLight);

    // Bonus yang jatuh — sprite bulat berhuruf, selalu menghadap kamera.
    for (const bonus of BONUSES) {
      const badge = document.createElement("canvas");
      badge.width = badge.height = 128;
      const bctx = badge.getContext("2d");
      const paintBadge = () => {
        if (!bctx) return;
        bctx.clearRect(0, 0, 128, 128);
        bctx.fillStyle = palette.bonus[bonus.id];
        bctx.beginPath();
        bctx.arc(64, 64, 58, 0, Math.PI * 2);
        bctx.fill();
        bctx.lineWidth = 6;
        bctx.strokeStyle = palette.ink;
        bctx.stroke();
        bctx.fillStyle = palette.ink;
        bctx.textAlign = "center";
        bctx.textBaseline = "middle";
        bctx.font = `800 ${bonus.glyph.length > 1 ? 52 : 64}px ${palette.font}`;
        bctx.fillText(bonus.glyph, 64, 68);
      };
      paintBadge();
      const tex = new THREE.CanvasTexture(badge);
      tex.colorSpace = THREE.SRGBColorSpace;
      this.textPainters.push(() => {
        paintBadge();
        tex.needsUpdate = true;
      });
      this.dropMats[bonus.id] = new THREE.SpriteMaterial({
        map: tex,
        fog: false,
      });
    }
    for (let i = 0; i < MAX_DROPS; i++) {
      const sprite = new THREE.Sprite(this.dropMats.net);
      sprite.scale.setScalar(30);
      sprite.visible = false;
      this.drops.push(sprite);
      scene.add(sprite);
    }

    // Percikan
    const sparkGeo = new THREE.BoxGeometry(4, 4, 4);
    for (let i = 0; i < MAX_SPARKS; i++) {
      const spark = new THREE.Mesh(
        sparkGeo,
        new THREE.MeshBasicMaterial({
          color: palette.brick,
          transparent: true,
        }),
      );
      spark.visible = false;
      this.sparks.push(spark);
      scene.add(spark);
    }

    // Safety net
    this.net = new THREE.Mesh(
      new THREE.BoxGeometry(W, 12, 2),
      new THREE.MeshStandardMaterial({
        color: palette.bonus.net,
        emissive: palette.bonus.net,
        emissiveIntensity: 0.9,
        transparent: true,
        opacity: 0.75,
      }),
    );
    this.net.position.set(0, 6, toZ(NET_Y));
    this.net.visible = false;
    scene.add(this.net);

    // Tulisan di kanvas (wordmark lapangan, huruf lencana) digambar sekali; kalau web font
    // belum selesai dimuat saat itu, gambar ulang begitu font tersedia.
    document.fonts
      ?.load(`800 44px ${palette.font}`)
      .then(() => {
        if (!this.disposed) for (const paint of this.textPainters) paint();
      })
      .catch(() => {
        // Font gagal dimuat — tulisan tetap memakai font cadangan.
      });
  }

  /** Sesuaikan ukuran render dan mundurkan kamera sampai seluruh lapangan terlihat. */
  resize(width: number, height: number, dpr: number) {
    if (width === 0 || height === 0) return;
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(width, height, false);
    const aspect = width / height;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();

    // Kamera rendah di belakang baseline: sisi dekat lapangan hampir selebar layar dan
    // menyempit ke belakang. Layar tegak (HP) butuh sudut lebih curam supaya lapangan tidak pendek.
    const elevation = THREE.MathUtils.degToRad(aspect < 1 ? 60 : 36);
    const dir = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
    const backZ = -H / 2 - APRON - WALL_THICK;
    const far = [
      new THREE.Vector3(-W / 2, WALL_HEIGHT, backZ),
      new THREE.Vector3(W / 2, WALL_HEIGHT, backZ),
    ];
    const near = [
      new THREE.Vector3(-W / 2, 0, H / 2),
      new THREE.Vector3(W / 2, 0, H / 2),
    ];
    const probe = new THREE.Vector3();
    const place = (distance: number) => {
      this.camera.position.copy(this.target).addScaledVector(dir, distance);
      this.camera.lookAt(this.target);
      this.camera.updateMatrixWorld();
      let top = -Infinity;
      let bottom = Infinity;
      let side = 0;
      for (const corner of far)
        top = Math.max(top, probe.copy(corner).project(this.camera).y);
      for (const corner of near) {
        probe.copy(corner).project(this.camera);
        bottom = Math.min(bottom, probe.y);
        side = Math.max(side, Math.abs(probe.x));
      }
      return { top, bottom, side };
    };
    // Beberapa putaran: mundurkan kamera sampai lapangan muat, lalu geser titik pandang agar di tengah.
    this.target.set(0, 0, 24);
    for (let pass = 0; pass < 5; pass++) {
      let distance = 200;
      let box = place(distance);
      while (
        distance < 2600 &&
        (box.side > 0.97 || box.top - box.bottom > 1.8)
      ) {
        distance += 8;
        box = place(distance);
      }
      // Sedikit di bawah tengah: HUD menumpang di bagian atas.
      this.target.z -= ((box.top + box.bottom) / 2 + 0.04) * distance * 0.22;
      place(distance);
    }
    this.dirty = true;
  }

  /** Posisi pointer di layar → x logis di lapangan (sinar ke bidang raket). */
  pointerToX(clientX: number, clientY: number): number | null {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(ndc, this.camera);
    // Sinar dipotong di kedalaman raket, jadi gerak jari di layar 1:1 dengan raket.
    const ray = this.raycaster.ray;
    if (Math.abs(ray.direction.z) < 1e-6) return null;
    const t = (toZ(RACKET_Y) - ray.origin.z) / ray.direction.z;
    return t > 0 ? ray.origin.x + ray.direction.x * t + W / 2 : null;
  }

  /**
   * Tekstur bola tenis, dihitung per piksel: jarak tiap titik permukaan ke kurva jahitan
   * menentukan warnanya (felt kuning / jahitan putih) dan kedalamannya (peta bump).
   */
  private tennisTextures() {
    // Bola hanya puluhan piksel di layar — tekstur kecil sudah cukup tajam.
    const width = 256;
    const height = 128;
    // Titik-titik contoh di sepanjang jahitan. Per piksel: cari dulu titik terdekat di antara
    // contoh kasar (tiap COARSE titik), lalu perhalus di sekitarnya — ±4× lebih cepat
    // daripada membandingkan dengan semua titik.
    const SAMPLES = 512;
    const COARSE = 8;
    const seam = new Float32Array(SAMPLES * 3);
    const point = new THREE.Vector3();
    for (let i = 0; i < SAMPLES; i++) {
      seamPoint(i / SAMPLES, point);
      seam.set([point.x, point.y, point.z], i * 3);
    }

    const felt = new THREE.Color(this.palette.felt).getRGB(
      { r: 0, g: 0, b: 0 },
      THREE.SRGBColorSpace,
    );
    const line = new THREE.Color(this.palette.seam).getRGB(
      { r: 0, g: 0, b: 0 },
      THREE.SRGBColorSpace,
    );
    const color = new ImageData(width, height);
    const depth = new ImageData(width, height);
    const smooth = (edge0: number, edge1: number, x: number) => {
      const k = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return k * k * (3 - 2 * k);
    };

    for (let j = 0; j < height; j++) {
      const theta = ((j + 0.5) / height) * Math.PI;
      const sinT = Math.sin(theta);
      const y = Math.cos(theta);
      for (let i = 0; i < width; i++) {
        // Arah yang sama dengan pemetaan UV SphereGeometry.
        const phi = ((i + 0.5) / width) * Math.PI * 2;
        const x = -Math.cos(phi) * sinT;
        const z = Math.sin(phi) * sinT;
        let best = -1;
        let nearest = 0;
        for (let s = 0; s < SAMPLES; s += COARSE) {
          const k = s * 3;
          const dot = x * seam[k] + y * seam[k + 1] + z * seam[k + 2];
          if (dot > best) {
            best = dot;
            nearest = s;
          }
        }
        for (let offset = -COARSE; offset <= COARSE; offset++) {
          const k = ((nearest + offset + SAMPLES) % SAMPLES) * 3;
          const dot = x * seam[k] + y * seam[k + 1] + z * seam[k + 2];
          if (dot > best) best = dot;
        }
        const angle = Math.acos(Math.min(1, best));
        const onSeam =
          1 - smooth(SEAM_HALF_WIDTH - 0.012, SEAM_HALF_WIDTH + 0.012, angle);
        // Bayangan tipis di bibir felt, tepat di tepi jahitan.
        const lip =
          Math.exp(-(((angle - SEAM_HALF_WIDTH - 0.02) / 0.035) ** 2)) *
          0.22 *
          (1 - onSeam);
        // Bulu felt: variasi terang-gelap yang sangat halus, hanya di bagian kuning.
        const fuzz = (Math.random() - 0.5) * 0.09 * (1 - onSeam);
        const shade = 1 - lip + fuzz;
        const at = (j * width + i) * 4;
        color.data[at] = (felt.r + (line.r - felt.r) * onSeam) * shade * 255;
        color.data[at + 1] =
          (felt.g + (line.g - felt.g) * onSeam) * shade * 255;
        color.data[at + 2] =
          (felt.b + (line.b - felt.b) * onSeam) * shade * 255;
        color.data[at + 3] = 255;
        const tall =
          (1 - onSeam * 0.85 + (Math.random() - 0.5) * 0.18 * (1 - onSeam)) *
          255;
        depth.data[at] = depth.data[at + 1] = depth.data[at + 2] = tall;
        depth.data[at + 3] = 255;
      }
    }

    const toTexture = (image: ImageData, srgb: boolean) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.putImageData(image, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      if (srgb) texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
      return texture;
    };
    return { map: toTexture(color, true), bump: toTexture(depth, false) };
  }

  /** Tribun bertingkat di tiga sisi lapangan, dengan deretan bangku kosong. */
  private buildStands() {
    const { palette, scene } = this;
    const TIERS = 11;
    const RISE = 15;
    const DEPTH = 24;
    const WALK = 22; // lorong antara dinding dan tribun
    const BENCH_H = 3;
    const BENCH_D = 9;
    const innerX = W / 2 + APRON + WALL_THICK + WALK;
    const backEdge = -H / 2 - APRON - WALL_THICK - WALK;
    const frontEdge = H / 2 + 220;
    const outerX = innerX + TIERS * DEPTH;

    const standMat = new THREE.MeshStandardMaterial({
      color: palette.courtBottom,
      roughness: 0.95,
    });
    const railMat = new THREE.MeshStandardMaterial({
      color: palette.wall,
      roughness: 0.8,
    });
    const benchMat = new THREE.MeshStandardMaterial({
      color: palette.seat,
      roughness: 0.6,
    });

    // Tribun tidak pernah berubah: semua kotak digabung menjadi satu geometri per material
    // (3 draw call, bukan puluhan).
    const rails: THREE.BufferGeometry[] = [];
    const steps: THREE.BufferGeometry[] = [];
    const benches: THREE.BufferGeometry[] = [];
    const box = (
      list: THREE.BufferGeometry[],
      size: [number, number, number],
      at: [number, number, number],
    ) => list.push(new THREE.BoxGeometry(...size).translate(...at));

    const sideLen = frontEdge - backEdge;
    const sideZ = (frontEdge + backEdge) / 2;
    for (let tier = 0; tier < TIERS; tier++) {
      const top = (tier + 1) * RISE;
      const tierSteps = tier === 0 ? rails : steps;
      // Samping kiri & kanan
      for (const sign of [-1, 1]) {
        const x = sign * (innerX + tier * DEPTH);
        box(
          tierSteps,
          [DEPTH, top, sideLen],
          [x + (sign * DEPTH) / 2, top / 2, sideZ],
        );
        box(
          benches,
          [BENCH_D, BENCH_H, sideLen],
          [x + sign * DEPTH * 0.6, top + BENCH_H / 2, sideZ],
        );
      }
      // Belakang — membentang sampai ujung tribun samping supaya sudutnya tertutup.
      const z = backEdge - tier * DEPTH;
      box(tierSteps, [outerX * 2, top, DEPTH], [0, top / 2, z - DEPTH / 2]);
      box(
        benches,
        [outerX * 2, BENCH_H, BENCH_D],
        [0, top + BENCH_H / 2, z - DEPTH * 0.6],
      );
    }
    for (const [parts, material] of [
      [rails, railMat],
      [steps, standMat],
      [benches, benchMat],
    ] as const) {
      scene.add(new THREE.Mesh(mergeGeometries(parts), material));
      for (const part of parts) part.dispose();
    }
  }

  /** Blok kubus bersudut bulat — satu geometri per tinggi (biasa / keras), dipakai bersama. */
  private blockGeometry(height: number) {
    let geometry = this.blockGeos.get(height);
    if (!geometry) {
      geometry = new RoundedBoxGeometry(
        BRICK_W - 1,
        height,
        BRICK_H - 1,
        3,
        3.5,
      );
      // Gradasi dari biru pekat di dasar ke lavender terang di atas.
      const base = new THREE.Color(this.palette.brickBase);
      const top = new THREE.Color(this.palette.brick);
      const tone = new THREE.Color();
      const position = geometry.getAttribute("position");
      const colors = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        const lift = THREE.MathUtils.clamp(
          position.getY(i) / height + 0.5,
          0,
          1,
        );
        tone.copy(base).lerp(top, lift ** 1.6);
        colors.set([tone.r, tone.g, tone.b], i * 3);
      }
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      this.blockGeos.set(height, geometry);
    }
    return geometry;
  }

  render(game: Game, dt: number) {
    const view = game.view;
    this.clock += dt;

    // Blok: buang yang hancur, tambah yang baru, perbarui warna/tinggi.
    const alive = new Set(view.bricks);
    for (const [brick, mesh] of this.blocks) {
      if (alive.has(brick)) continue;
      this.scene.remove(mesh);
      this.blocks.delete(brick);
    }
    for (const brick of view.bricks) {
      const height = brick.hp > 1 ? STRONG_HEIGHT : BLOCK_HEIGHT;
      let mesh = this.blocks.get(brick);
      if (!mesh) {
        mesh = new THREE.Mesh(this.blockGeometry(height), this.blockMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.position.x = toX(brick.x + brick.w / 2);
        mesh.position.z = toZ(brick.y + brick.h / 2);
        this.blocks.set(brick, mesh);
        this.scene.add(mesh);
      }
      mesh.geometry = this.blockGeometry(height);
      mesh.position.y = height / 2;
    }

    // Raket
    this.racket.position.x = toX(view.racketX);
    this.racket.scale.x +=
      (view.racketW / RACKET_W - this.racket.scale.x) * Math.min(1, dt * 12);

    // Bola
    const tone = view.smash ? "smash" : "plain";
    this.ballMat.color.copy(this.ballTints[tone]);
    this.balls.forEach((mesh, i) => {
      const ball = view.balls[i];
      const last = mesh.userData.last as THREE.Vector3;
      const wasVisible = mesh.visible;
      mesh.visible = Boolean(ball);
      if (!ball) return;
      const radius = view.ballR * BALL_VISUAL;
      mesh.position.set(toX(ball.x), radius, toZ(ball.y));
      mesh.scale.setScalar(radius);
      // Bola menggelinding searah geraknya.
      if (wasVisible) {
        this.spin.set(mesh.position.z - last.z, 0, last.x - mesh.position.x);
        const moved = this.spin.length();
        if (moved > 0.01 && moved < 60)
          mesh.rotateOnWorldAxis(
            this.spin.divideScalar(moved),
            (moved / radius) * 0.35,
          );
      }
      last.copy(mesh.position);
    });
    const lead = view.balls[0];
    this.ballLight.intensity = lead ? 500 : 0;
    if (lead) {
      this.ballLight.color.copy(this.ballGlows[tone]);
      // Di pusat bola: lantai ikut berpendar, tetapi permukaan bola tidak ikut tersorot.
      this.ballLight.position.set(
        toX(lead.x),
        view.ballR * BALL_VISUAL,
        toZ(lead.y),
      );
    }

    // Bonus
    this.drops.forEach((sprite, i) => {
      const drop = view.drops[i];
      sprite.visible = Boolean(drop);
      if (!drop) return;
      sprite.material = this.dropMats[drop.id];
      sprite.position.set(
        toX(drop.x),
        18 + Math.sin(this.clock * 6 + i) * 3,
        toZ(drop.y),
      );
    });

    // Percikan — melompat ke atas lalu jatuh.
    this.sparks.forEach((mesh, i) => {
      const spark = view.sparks[i];
      mesh.visible = Boolean(spark);
      if (!spark) return;
      const life = Math.max(0, spark.life / SPARK_LIFE);
      (mesh.material as THREE.MeshBasicMaterial).opacity = life;
      mesh.position.set(
        toX(spark.x),
        8 + Math.sin(life * Math.PI) * 26,
        toZ(spark.y),
      );
    });

    this.net.visible = view.net;

    this.renderer.render(this.scene, this.camera);
    this.dirty = false;
  }

  dispose() {
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Sprite) {
        object.geometry?.dispose();
        const materials = Array.isArray(object.material)
          ? object.material
          : [object.material];
        for (const material of materials) {
          (material as THREE.MeshStandardMaterial).map?.dispose();
          (material as THREE.MeshStandardMaterial).bumpMap?.dispose();
          material.dispose();
        }
      }
    });
    this.disposed = true;
    for (const geometry of this.blockGeos.values()) geometry.dispose();
    // Lencana bonus yang sedang tidak dipakai sprite tidak terjangkau traverse di atas.
    for (const material of Object.values(this.dropMats)) {
      material.map?.dispose();
      material.dispose();
    }
    this.renderer.dispose();
  }
}
