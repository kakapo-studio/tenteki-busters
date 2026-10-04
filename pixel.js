// ===== ドット絵（スーファミ風） =====
// 画面は 160×214 ドットの小さな canvas に描いて、ぼかさずに3倍にして表示する
// ドット絵のルール：
//   ・色は「暗い → 明るい」の段階（ramp）だけを使う
//   ・丸い部分は、左上から光が当たったように段階を選ぶ
//   ・段階の境目は、市松もようのように点を混ぜる「ディザ」でなじませる
//   ・輪郭は黒ではなく、そのドットの色を暗くした色（セルアウト）
// （W・H・ZONE・stageNum などは script.js で用意したものを使う）

const LS = 3;    // 1ドット ＝ ゲームの座標の 3
const LW = 160;  // ドット絵の画面の横幅
const LH = 214;  // ドット絵の画面の高さ
const low = document.createElement("canvas");
low.width = LW;
low.height = LH;
const lg = low.getContext("2d");

// ===== 色 =====
const hex = (c) => {
  const n = parseInt(c.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
};
const ramp = (...colors) => colors.map(hex);
const mixRGB = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const darken = (c, k) => c.map((v) => Math.round(v * (1 - k)));
const css = (c) => "rgb(" + c[0] + "," + c[1] + "," + c[2] + ")";

// ディザ用の表（4×4）：ドットの場所ごとに、少しずつちがう「しきい値」
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[((y & 3) << 2) + (x & 3)];

// 場所から決まる「でたらめな数」（毎回同じ模様になる）
const hash = (x, y, seed = 0) => {
  const s = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return s - Math.floor(s);
};

// 段階（level）から色を選ぶ（script.js の pick とぶつからない名前にする）。はんぱな分は、ディザで次の段階と混ぜる
function tone(r, level, x, y) {
  const top = r.length - 1;
  const l = Math.min(top, Math.max(0, level));
  const base = Math.floor(l);
  return r[Math.min(top, l - base > bayer(x, y) ? base + 1 : base)];
}

// ===== ドットを置く紙 =====
// part：パーツの番号。あとから描いたパーツのふちに、うすい輪郭をつけるのに使う
class Pix {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.c = new Array(w * h).fill(null);
    this.p = new Int16Array(w * h);
    this.nextPart = 1;
  }

  set(x, y, col, part = 0) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.c[y * this.w + x] = col;
    this.p[y * this.w + x] = part;
  }

  get(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? null : this.c[y * this.w + x];
  }

  // 形の中のドットを、1つずつ塗る
  // test：形の中か　shade：段階　o.pattern：模様（段階を変える、または [別のramp, 段階] を返す）
  fill(box, test, shade, r, o = {}) {
    const part = o.part ?? this.nextPart++;
    for (let y = Math.floor(box[1]); y <= Math.ceil(box[3]); y++) {
      for (let x = Math.floor(box[0]); x <= Math.ceil(box[2]); x++) {
        if (!test(x + 0.5, y + 0.5)) continue;
        let level = shade(x + 0.5, y + 0.5) + (o.bias || 0);
        let use = r;
        if (o.pattern) {
          const res = o.pattern(x, y, level);
          if (Array.isArray(res)) {
            use = res[0];
            level = res[1];
          } else {
            level = res;
          }
        }
        this.set(x, y, tone(use, level, x, y), part);
      }
    }
    return part;
  }

  // 球のように光を当てた、だ円
  ball(cx, cy, rx, ry, r, o = {}) {
    return this.fill(
      [cx - rx, cy - ry, cx + rx, cy + ry],
      (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1,
      (x, y) => {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        const v = -0.5 * nx - 0.6 * ny + 0.62 * nz; // 左上・手前からの光
        return Math.min(1, Math.max(0, (v + 0.2) / 1.1)) * (r.length - 1);
      },
      r, o
    );
  }

  // 多角形（左上ほど明るい。o.level で明るさを決めることもできる）
  poly(pts, r, o = {}) {
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const span = (box[2] - box[0]) * 0.5 + (box[3] - box[1]) * 0.8 || 1;
    return this.fill(
      box,
      (x, y) => {
        let inside = false;
        for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
          const [xi, yi] = pts[i];
          const [xj, yj] = pts[j];
          if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
      },
      (x, y) => {
        if (o.level !== undefined) return o.level;
        const t = ((x - box[0]) * 0.5 + (y - box[1]) * 0.8) / span;
        return (1 - t) * (r.length - 1);
      },
      r, o
    );
  }

  // つつ（しっぽ・腕）：ベジェ曲線にそって、小さな球を並べる
  tube(pts, r0, r1, r, o = {}) {
    const part = o.part ?? this.nextPart++;
    const n = 40;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const u = 1 - t;
      const x = u * u * u * pts[0][0] + 3 * u * u * t * pts[1][0] + 3 * u * t * t * pts[2][0] + t * t * t * pts[3][0];
      const y = u * u * u * pts[0][1] + 3 * u * u * t * pts[1][1] + 3 * u * t * t * pts[2][1] + t * t * t * pts[3][1];
      const rad = r0 + (r1 - r0) * t;
      this.ball(x, y, rad, rad, o.rampAt ? o.rampAt(t) : r, { part, pattern: o.pattern });
    }
    return part;
  }

  // 輪郭：シルエットのふちは濃く、パーツの重なりのふちはうすく暗くする
  outline(outer = 0.5, inner = 0.28) {
    const src = this.c.slice();
    const at = (x, y) => (x < 0 || y < 0 || x >= this.w || y >= this.h ? null : src[y * this.w + x]);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (!src[i]) continue;
        const near = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        if (near.some(([nx, ny]) => !at(nx, ny))) {
          this.c[i] = darken(src[i], outer);
        } else if (this.p[i] > 0 && near.some(([nx, ny]) => {
          const pp = this.p[ny * this.w + nx];
          return pp > 0 && pp < this.p[i];
        })) {
          this.c[i] = darken(src[i], inner);
        }
      }
    }
  }

  // 時間帯の色をかける（夕方・夜）
  tint(m) {
    this.c = this.c.map((c) => (c ? c.map((v, i) => Math.min(255, Math.round(v * m[i]))) : c));
  }

  toCanvas() {
    const cv = document.createElement("canvas");
    cv.width = this.w;
    cv.height = this.h;
    const g = cv.getContext("2d");
    const img = g.createImageData(this.w, this.h);
    this.c.forEach((c, i) => {
      if (!c) return;
      img.data[i * 4] = c[0];
      img.data[i * 4 + 1] = c[1];
      img.data[i * 4 + 2] = c[2];
      img.data[i * 4 + 3] = 255;
    });
    g.putImageData(img, 0, 0);
    return cv;
  }
}

// ===== ステージごとの光の色（昼 → 夕方 → 夜） =====
const STAGE_LIGHT = [
  [1, 1, 1],
  [1, 0.98, 0.95],
  [1.06, 0.9, 0.76],
  [0.74, 0.7, 0.95],
  [0.62, 0.52, 0.78],
];
const light = () => STAGE_LIGHT[stageNum] || STAGE_LIGHT[0];

// ===== 作ったドット絵を、ステージごとに保存しておく =====
const spriteCache = {};

// build(p)：Pix に描く関数　ox, oy：足もと（基準点）の位置
function sprite(key, w, h, ox, oy, build, tinted = true) {
  const k = key + (tinted ? "@" + stageNum : "");
  if (!spriteCache[k]) {
    const p = new Pix(w, h);
    build(p);
    p.outline();
    if (tinted) p.tint(light());
    spriteCache[k] = { canvas: p.toCanvas(), ox, oy };
  }
  return spriteCache[k];
}

// ゲームの座標（480×640）で、ドット絵を置く
function put(s, x, y, alpha = 1) {
  lg.globalAlpha = alpha;
  lg.drawImage(s.canvas, Math.round(x / LS - s.ox), Math.round(y / LS - s.oy));
  lg.globalAlpha = 1;
}

// ===== 色の段階（パレット） =====
const PAL = {
  ratFur: ramp("#2a221c", "#463a30", "#65584a", "#857766", "#a99b86", "#cbbfa8"),
  ratBelly: ramp("#6b5e4e", "#9a8b76", "#c4b69c", "#e2d6bd"),
  pink: ramp("#6e3c3c", "#9c5c5a", "#c98a82", "#e8b4aa", "#f8d8cf"),
  black: ramp("#0c0b0f", "#1a1920", "#2a2833", "#3d3a48", "#58546a"),
  white: ramp("#6c6f80", "#9a9cab", "#c9cad3", "#eceef2", "#ffffff"),
  cream: ramp("#5a4126", "#8a6a44", "#b8996a", "#dcc398", "#f3e2c0", "#fff6e0"),
  brown: ramp("#1a0f07", "#2e1d10", "#4a321e", "#6b4a30", "#8a6644"),
  snow: ramp("#6f7888", "#98a0ae", "#c3c8d2", "#e6e8ee", "#ffffff"),
  eagle: ramp("#120c08", "#26190f", "#3d2a1c", "#5a422e", "#7a5e44", "#9c8064"),
  horn: ramp("#6b5426", "#a88f58", "#d8c08a", "#f4e6c0"),
  gold: ramp("#6b4a08", "#a8800f", "#d9a520", "#f2cf6a"),
  moss: ramp("#16260a", "#253f12", "#3a5e1c", "#567f28", "#78a336", "#a0c654", "#c9e07e"),
  disc: ramp("#5e5428", "#8f8248", "#c2b26c", "#e6d898", "#f8eec0"),
  ivory: ramp("#5f584a", "#8e8676", "#c3bba8", "#ece6d6"),
  foot: ramp("#4a443a", "#7a7266", "#a8a092", "#cfc8bc"),
  ball: ramp("#8a8478", "#bdb7aa", "#e6e2d8", "#ffffff"),
  wood: ramp("#5e3a1c", "#8a5a30", "#b07a44", "#d8a46a", "#f2d29a"),
  bark: ramp("#2a1a0e", "#3e2a1a", "#58402a", "#76583a", "#94744e"),
  ring: ramp("#8a6438", "#b08a58", "#d4b07a", "#ecd2a0", "#fbe8c0"),
  leaf: ramp("#13260f", "#1f3a18", "#2f5424", "#416e30", "#58893e", "#74a44e"),
  grass: ramp("#2f5a22", "#3f7029", "#548a33", "#6aa13e", "#86b84f", "#a6cc6c", "#c4dd8e"),
  dirt: ramp("#6e4a2a", "#8f6a40", "#b08a58", "#cfae7c", "#e3c99c"),
  wall: ramp("#7a6040", "#a88a60", "#d2b688", "#ecd6ac", "#fff0d0"),
  thatch: ramp("#4a3010", "#7a5420", "#a87a38", "#cfa055", "#e8c27a"),
  stone: ramp("#4f4b44", "#7a756c", "#a39e94", "#cdc8bd", "#efebe2"),
  cloud: ramp("#a9b8cc", "#d3dce8", "#f4f7fb", "#ffffff"),
  berry: ramp("#6a1010", "#a8221c", "#e04a3a", "#ff8a70"),
};

// ===== 目 =====
// 左目・右目の左上の位置に、ew×2 ドットの目を描く。内側の上を、まぶたでかくして「にらむ目」にする
function evilEyes(p, L, R, o) {
  const dark = hex(o.lid);
  if (o.hurt) {
    const c = hex("#1a120c");
    p.set(L[0], L[1] - 1, c);
    p.set(L[0] + 1, L[1], c);
    p.set(L[0], L[1] + 1, c);
    p.set(R[0] + 1, R[1] - 1, c);
    p.set(R[0], R[1], c);
    p.set(R[0] + 1, R[1] + 1, c);
    return;
  }
  const ew = o.width || 2;
  const iris = hex(o.iris);
  const mid = darken(iris, 0.35);
  const deep = darken(iris, 0.7);
  const pupil = hex("#0b0705");
  [[L, 1], [R, -1]].forEach(([[x, y], s]) => {
    for (let i = 0; i < ew; i++) {
      p.set(x + i, y, iris);
      p.set(x + i, y + 1, i === (s > 0 ? ew - 1 : 0) ? deep : mid);
    }
    if (o.slit) {
      p.set(x + Math.floor(ew / 2), y, pupil);
      p.set(x + Math.floor(ew / 2), y + 1, pupil);
    }
    // まぶた（内側が下がる）とまゆ
    const inner = s > 0 ? x + ew - 1 : x;
    const outer = s > 0 ? x : x + ew - 1;
    p.set(inner, y, dark);
    p.set(inner, y - 1, dark);
    p.set(inner + s, y - 1, dark);
    p.set(outer, y - 1, dark);
    p.set(outer - s, y - 2, dark);
  });
}

// ===== 天敵たち =====
// w, h：絵の大きさ（ドット）　ox, oy：足もとの位置　shoulder：投げる腕のつけ根（足もとから）
// arm：腕の ramp　hand：手の ramp
const ENEMIES = {
  rat: {
    w: 36, h: 44, ox: 18, oy: 42, shoulder: [7, -17], arm: PAL.ratFur, hand: PAL.pink,
    build(p, hurt) {
      // しっぽ（うろこの輪つき）
      p.tube([[11, 39], [2, 38], [1, 28], [5, 19]], 1.6, 0.7, PAL.pink, {
        pattern: (x, y, l) => (((x + y) % 3 === 0) ? l - 1 : l),
      });
      p.ball(13, 41, 3.6, 1.7, PAL.pink);
      p.ball(23, 41, 3.6, 1.7, PAL.pink);
      const body = p.ball(18, 30, 10, 11.5, PAL.ratFur, {
        pattern: (x, y, l) => (((x - 18.5) / 6) ** 2 + ((y - 33) / 8) ** 2 < 1 ? [PAL.ratBelly, l - 0.6] : l + (hash(x, y) - 0.5) * 0.8),
      });
      p.ball(11.5, 26, 3, 3.2, PAL.ratFur, { bias: 0.4 });
      // 耳（内側は濃いピンク）
      [[10, 10], [26, 9.5]].forEach(([x, y]) => {
        p.ball(x, y, 4.2, 4.6, PAL.pink, {
          pattern: (px, py, l) => (((px + 0.5 - x) / 2.3) ** 2 + ((py + 0.5 - y - 0.6) / 2.8) ** 2 < 1 ? l - 1.4 : l),
        });
      });
      const head = p.ball(18, 16, 7.6, 7, PAL.ratFur, { pattern: (x, y, l) => l + (hash(x, y, 2) - 0.5) * 0.8 });
      p.ball(18.5, 21, 3.6, 2.8, PAL.ratFur, { part: head, bias: 0.9 });
      // 鼻・オレンジの前歯・ひげ
      p.set(18, 22, hex("#e07a80"));
      p.set(19, 22, hex("#c85a62"));
      p.set(18, 24, hex("#f0b040"));
      p.set(19, 24, hex("#c88a20"));
      [[13, 22], [12, 22], [11, 23], [24, 22], [25, 22], [26, 23]].forEach(([x, y]) => p.set(x, y, hex("#e8e0d0")));
      evilEyes(p, [14, 15], [21, 15], { iris: "#ff3a2a", lid: "#463a30", hurt });
      void body;
    },
  },

  cat: {
    w: 40, h: 48, ox: 20, oy: 46, shoulder: [8, -18], arm: PAL.black, hand: PAL.white,
    build(p, hurt) {
      p.tube([[12, 42], [2, 40], [4, 24], [2, 15]], 2.3, 1.5, PAL.black);
      p.ball(20, 33, 10.5, 12, PAL.black, {
        pattern: (x, y, l) => (((x - 19.5) / 4.6) ** 2 + ((y - 33) / 9.5) ** 2 < 1 ? [PAL.white, l + 0.4] : l + (hash(x, y, 3) - 0.5) * 0.7),
      });
      p.ball(14, 45, 3.6, 1.8, PAL.white);
      p.ball(26, 45, 3.6, 1.8, PAL.white);
      // とがった耳（内側はピンク）
      p.poly([[10, 14], [9, 3], [17, 9]], PAL.black, { level: 3 });
      p.poly([[30, 14], [31, 3], [23, 9]], PAL.black, { level: 2 });
      [[11, 8], [11, 9], [12, 10], [29, 8], [29, 9], [28, 10]].forEach(([x, y]) => p.set(x, y, hex("#b07a84")));
      const head = p.ball(20, 17, 9.2, 8, PAL.black, { pattern: (x, y, l) => l + (hash(x, y, 4) - 0.5) * 0.7 });
      p.ball(20, 21.5, 3.8, 2.6, PAL.white, { part: head + 1 });
      p.set(19, 20, hex("#d88a95"));
      p.set(20, 20, hex("#d88a95"));
      p.set(18, 23, hex("#1a1418"));
      p.set(21, 23, hex("#1a1418"));
      p.set(21, 24, hex("#ffffff"));
      [[12, 21], [11, 21], [10, 22], [27, 21], [28, 21], [29, 22]].forEach(([x, y]) => p.set(x, y, hex("#f0f0f0")));
      evilEyes(p, [14, 15], [22, 15], { iris: "#f8e040", lid: "#1a1920", width: 3, slit: true, hurt });
    },
  },

  ferret: {
    w: 40, h: 48, ox: 22, oy: 46, shoulder: [7, -23], arm: PAL.brown, hand: PAL.brown,
    build(p, hurt) {
      p.tube([[16, 41], [10, 42], [5, 40], [1, 36]], 2.6, 2, PAL.brown, { pattern: (x, y, l) => l + (hash(x, y, 5) - 0.5) });
      // 体：下にいくほど、こげ茶（境目はディザでなじませる）
      p.ball(22, 31, 8, 15, PAL.cream, {
        pattern: (x, y, l) => (y > 34 + bayer(x, y) * 5 ? [PAL.brown, l + 0.4] : l + (hash(x, y, 6) - 0.5) * 0.7),
      });
      p.ball(18, 45, 3, 1.6, PAL.brown);
      p.ball(26, 45, 3, 1.6, PAL.brown);
      p.ball(15.5, 26, 2.5, 3, PAL.brown);
      p.ball(16, 8, 2.6, 2.6, PAL.cream);
      p.ball(28, 8, 2.6, 2.6, PAL.cream);
      // 頭（目のまわりのマスク）
      p.ball(22, 14, 7.2, 6.6, PAL.cream, {
        pattern: (x, y, l) => (Math.abs(y - 13) <= 1 && Math.abs(x + 0.5 - 22) >= 1.5 ? [PAL.brown, l - 0.3] : l),
      });
      p.set(21, 18, hex("#e08a90"));
      p.set(22, 18, hex("#c06a72"));
      evilEyes(p, [18, 13], [24, 13], { iris: "#e03030", lid: "#2e1d10", hurt });
    },
  },

  stoat: {
    w: 40, h: 48, ox: 22, oy: 46, shoulder: [6, -22], arm: PAL.snow, hand: PAL.snow,
    build(p, hurt) {
      p.tube([[17, 42], [9, 43], [4, 38], [3, 30]], 2.1, 1.9, PAL.snow);
      p.tube([[3, 30], [3, 28], [3, 26], [3.5, 23]], 2, 1.1, PAL.black);
      p.ball(22, 31, 7.5, 14.5, PAL.snow, { pattern: (x, y, l) => l + (hash(x, y, 7) - 0.5) * 0.6 });
      p.ball(18, 45, 2.8, 1.5, PAL.snow);
      p.ball(26, 45, 2.8, 1.5, PAL.snow);
      p.ball(16, 27, 2.4, 3, PAL.snow);
      p.ball(17, 8, 2.3, 2.3, PAL.snow);
      p.ball(27, 8, 2.3, 2.3, PAL.snow);
      p.ball(22, 14, 6.6, 6, PAL.snow);
      p.set(22, 18, hex("#1c1a18"));
      [[19, 19], [20, 20], [24, 20], [25, 19]].forEach(([x, y]) => p.set(x, y, hex("#5a5560")));
      evilEyes(p, [18, 13], [24, 13], { iris: "#ff2a3a", lid: "#98a0ae", hurt });
    },
  },

  eagle: {
    w: 88, h: 58, ox: 44, oy: 56, shoulder: [8, -24], arm: PAL.eagle, hand: PAL.gold,
    build(p, hurt) {
      // 翼（左右）：先に風切り羽を描いて、その根もとを翼の羽でおおう
      [-1, 1].forEach((s) => {
        const X = (x) => 44 + s * x;
        const lit = s > 0 ? -0.4 : 0.3; // 右の翼は少しかげ
        for (let i = 0; i < 10; i++) {
          const k = i / 9;
          const rx = 41 - k * 22;            // 根もと：翼のうしろのふち
          const ry = 6 + k * 19;
          const a = -0.15 + k * 1.05;        // 外向き → 下向き
          const len = 13 - k * 4;
          const tx = rx + Math.cos(a) * len;
          const ty = ry + Math.sin(a) * len;
          const nx = -Math.sin(a);
          const ny = Math.cos(a);
          p.poly([
            [X(rx + nx * 2.2), ry + ny * 2.2], [X(tx + nx * 0.9), ty + ny * 0.9],
            [X(tx), ty + 0.5], [X(tx - nx * 0.9), ty - ny * 0.9], [X(rx - nx * 2.2), ry - ny * 2.2],
          ], PAL.eagle, { level: 2.6 - k * 0.8 + lit + (i % 2 ? -0.5 : 0) });
        }
        p.poly([[X(8), 27], [X(13), 15], [X(24), 7], [X(36), 3], [X(44), 4], [X(42), 9], [X(32), 17], [X(20), 27], [X(12), 33]], PAL.eagle, {
          pattern: (x, y, l) => l + lit + (((x + (y % 4 < 2 ? 0 : 2)) % 4 === 0 && y % 2 === 0) ? 1.1 : 0) + (hash(x, y, 17) - 0.5) * 0.5,
        });
        // 翼の上のふちに、光の当たった羽
        for (let i = 0; i < 26; i++) {
          const t = i / 25;
          p.set(X(10 + t * 32), 15 - t * 11 + (t > 0.5 ? 0 : (0.5 - t) * 2) - 0.5, PAL.eagle[5 + (s > 0 ? -1 : 0)], 0);
        }
      });
      // 黄色い脚と、黒いつめ
      [[40, 50], [48, 50]].forEach(([x, y]) => {
        for (let yy = y - 4; yy <= y; yy++) {
          p.set(x, yy, PAL.gold[3]);
          p.set(x + 1, yy, PAL.gold[2]);
        }
        p.set(x - 1, y + 1, hex("#141010"));
        p.set(x + 1, y + 1, hex("#141010"));
        p.set(x + 2, y + 1, hex("#141010"));
      });
      // 体（胸にうろこのような羽）
      p.ball(44, 38, 9.6, 14, PAL.eagle, {
        pattern: (x, y, l) => (y > 28 && y % 3 === 1 && (x + (y % 6 < 3 ? 0 : 2)) % 4 === 0 ? l + 1.6 : l + (hash(x, y, 8) - 0.5) * 0.6),
      });
      // 頭のうしろの逆立った羽
      [[39, 11], [41, 10], [43, 11], [45, 10], [47, 11], [38, 12], [48, 12]].forEach(([x, y]) => p.set(x, y, PAL.eagle[1]));
      p.ball(44, 19, 7.5, 7, PAL.eagle, { pattern: (x, y, l) => l + (hash(x, y, 9) - 0.5) * 0.6 });
      // 太いかぎ形のくちばし
      p.poly([[43, 20], [49, 18], [52, 21], [51, 26], [49, 25], [48, 23], [44, 23]], PAL.horn);
      p.set(44, 19, PAL.gold[2]);
      p.set(45, 19, PAL.gold[3]);
      evilEyes(p, [39, 17], [46, 17], { iris: "#ffc21c", lid: "#120c08", hurt });
    },
  },
};

// ===== カカポ（バッター） =====
// 苔色に、黒と黄色のまだら（羽がうろこのように重なっている）
function kakapoMottle(seed) {
  return (x, y, l) => {
    // 6×4 ドットの羽を、レンガのように1段ごとにずらして並べる
    const row = Math.floor(y / 4);
    const shift = (row % 2) * 3;
    const col = Math.floor((x + shift) / 6);
    const fx = (x + shift) % 6;
    const fy = y % 4;
    const n = (hash(x, y, seed) - 0.5) * 0.5;
    if (fy === 3 && fx >= 1 && fx <= 4) return l - 1.3 + n;          // 羽のふちの黒いまだら
    if (fy === 1 && fx === 3 && hash(col, row, seed) > 0.35) return l + 1.3; // 黄色いすじ
    return l + n;
  };
}

const KAKAPO = {
  w: 46, h: 50, ox: 20, oy: 48,
  build(p) {
    p.ball(14, 47, 4, 1.8, PAL.foot);
    p.ball(25, 47, 4, 1.8, PAL.foot);
    // 頭と体を「ひとつの形」として塗る。光の当て方も、大きなたまご形ひとつで計算する
    // （別々に塗ると、雪だるまのように2つの玉に見えてしまう）
    const inBody = (x, y) => ((x - 20) / 15.5) ** 2 + ((y - 33) / 15) ** 2 <= 1;
    const inHead = (x, y) => ((x - 24) / 10.5) ** 2 + ((y - 18) / 9) ** 2 <= 1;
    p.fill([4, 8, 36, 48], (x, y) => inBody(x, y) || inHead(x, y), (x, y) => {
      const nx = (x - 21) / 17;
      const ny = (y - 29) / 21;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const v = -0.5 * nx - 0.6 * ny + 0.62 * nz;
      return Math.min(1, Math.max(0, (v + 0.2) / 1.1)) * (PAL.moss.length - 1);
    }, PAL.moss, { pattern: kakapoMottle(1) });
    // 顔の円盤・象牙色のくちばし・目・ひげ
    p.ball(31.5, 18, 4.5, 6.5, PAL.disc, { pattern: (x, y, l) => l + ((x + y) % 2 ? 0.3 : -0.3) });
    p.ball(36, 19, 2.6, 3.2, PAL.ivory);
    p.set(37, 21, PAL.ivory[1]);
    p.set(31, 16, hex("#2a1808"));
    [[37, 22], [38, 23], [39, 23], [38, 24]].forEach(([x, y]) => p.set(x, y, hex("#e8e0b0")));
  },
};

// 正面のカカポ（クリア・ざんねんの画面用）
function buildKakapoFront(p) {
  p.ball(11, 30, 4, 1.8, PAL.foot);
  p.ball(21, 30, 4, 1.8, PAL.foot);
  p.ball(16, 18, 13, 12, PAL.moss, { pattern: kakapoMottle(3) });
  p.ball(16, 14, 9.5, 7.5, PAL.disc, { pattern: (x, y, l) => l + ((x + y) % 2 ? 0.3 : -0.3) });
  p.ball(16, 18.5, 2.6, 3.6, PAL.ivory);
  [[11, 12], [20, 12]].forEach(([x, y]) => {
    p.set(x, y, hex("#1a1008"));
    p.set(x + 1, y, hex("#1a1008"));
    p.set(x, y + 1, hex("#1a1008"));
    p.set(x + 1, y + 1, hex("#2a1a0c"));
    p.set(x, y, hex("#ffffff"));
  });
  [[8, 17], [24, 17]].forEach(([x, y]) => p.set(x, y, hex("#e89a8a")));
}

function drawKakapoFront(canvas) {
  const p = new Pix(32, 33);
  buildKakapoFront(p);
  p.outline();
  const g = canvas.getContext("2d");
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(p.toCanvas(), 0, 0);
}

// ===== ボール =====
function ballSprite(r) {
  const rr = Math.max(0.8, Math.round(r * 2) / 2);
  return sprite("ball" + rr, Math.ceil(rr * 2) + 2, Math.ceil(rr * 2) + 2, rr + 1, rr + 1, (p) => {
    p.ball(rr + 1, rr + 1, rr, rr, PAL.ball);
    if (rr >= 2.5) {
      p.set(rr + 1 - Math.round(rr * 0.5), rr + 1, hex("#d9534f"));
      p.set(rr + 1 + Math.round(rr * 0.5), rr, hex("#d9534f"));
    }
  }, false);
}

function drawBall(x, y, r, alpha = 1) {
  put(ballSprite(r / LS), x, y, alpha);
}

// 地面に落ちる影：市松もように点を置く（スーファミっぽい半透明）
function drawBallShadow(x, y, r, alpha) {
  const cx = Math.round(x / LS);
  const cy = Math.round(y / LS);
  const rx = Math.max(1, (r / LS) * 1.4);
  const ry = Math.max(0.6, (r / LS) * 0.5);
  lg.fillStyle = "rgba(20, 30, 10, " + Math.min(0.9, alpha * 2.2) + ")";
  for (let yy = Math.floor(-ry); yy <= Math.ceil(ry); yy++) {
    for (let xx = Math.floor(-rx); xx <= Math.ceil(rx); xx++) {
      if ((xx / rx) ** 2 + (yy / ry) ** 2 <= 1 && (cx + xx + cy + yy) % 2 === 0) {
        lg.fillRect(cx + xx, cy + yy, 1, 1);
      }
    }
  }
}

// ===== 天敵を描く =====
// x, y：足もと　hand：手の位置（ゲームの座標）　holding：球を持っている　hurt：ダメージ中
function drawEnemy(animal, x, y, hand, holding, hurt) {
  const e = ENEMIES[animal];
  if (hurt > 0) {
    x += Math.round(Math.sin(hurt * 60)) * LS; // ぶるぶる（1ドット単位）
  }
  drawBallShadow(x + 3, y + 3, animal === "eagle" ? 34 : 20, 0.4);
  put(sprite(animal + (hurt > 0 ? "-hurt" : ""), e.w, e.h, e.ox, e.oy, (p) => e.build(p, hurt > 0)), x, y);

  // 投げる腕：毎コマ、小さな紙に描いてから貼る
  const sx = x / LS + e.shoulder[0];
  const sy = y / LS + e.shoulder[1];
  const hx = hand.x / LS;
  const hy = hand.y / LS;
  const left = Math.floor(Math.min(sx, hx)) - 4;
  const top = Math.floor(Math.min(sy, hy)) - 4;
  const p = new Pix(Math.ceil(Math.abs(hx - sx)) + 9, Math.ceil(Math.abs(hy - sy)) + 9);
  const mx = (sx + hx) / 2 + 2;
  const my = (sy + hy) / 2 + 1;
  p.tube([[sx - left, sy - top], [mx - left, my - top], [mx - left, my - top], [hx - left, hy - top]], 1.8, 1.4, e.arm);
  p.ball(hx - left, hy - top, 1.8, 1.8, e.hand);
  p.outline();
  p.tint(light());
  lg.drawImage(p.toCanvas(), left, top);
  if (holding) {
    drawBall(hand.x + 2, hand.y - 6, 6);
  }
}

// ===== カカポとバット =====
// angle：バットの角度（ラジアン）
// （from は振りはじめの角度。前の描き方では残像に使っていた。昔のゲームらしく、残像は描かない）
function drawKakapo(angle, from = null) {
  const x = 96;
  const y = 586;
  drawBallShadow(x + 6, y + 3, 30, 0.45);
  put(sprite("kakapo", KAKAPO.w, KAKAPO.h, KAKAPO.ox, KAKAPO.oy, KAKAPO.build), x, y);

  // バット：手もとを中心に、ドットで描く
  const px = (x + 38) / LS;
  const py = (y - 78) / LS;
  const size = 96;
  const p = new Pix(size, size);
  const c = size / 2;

  p.nextPart = 5;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  for (let t = -2; t <= 40; t += 0.4) {
    const half = t < 6 ? 0.9 : 0.9 + ((t - 6) / 34) * 1.9;
    for (let s = -half; s <= half; s += 0.4) {
      const k = (s + half) / (2 * half);       // 0＝光の当たる側、1＝かげ側
      let col;
      if (t < 6) col = k < 0.5 ? hex("#5a463a") : hex("#2e241c");  // グリップ
      else col = tone(PAL.wood, (1 - k) * 4 - (t > 38 ? 1 : 0), Math.round(c + dx * t + nx * s), Math.round(c + dy * t + ny * s));
      p.set(c + dx * t + nx * s, c + dy * t + ny * s, col, 6);
    }
  }
  p.outline(0.45, 0);
  p.tint(light());
  lg.drawImage(p.toCanvas(), Math.round(px - c), Math.round(py - c));

  // バットをにぎる翼
  put(sprite("kakapo-wing", 12, 10, 6, 5, (w) => {
    w.ball(6, 5, 4.8, 3.4, PAL.moss, { pattern: kakapoMottle(4) });
  }), x + 32, y - 72);
}

// ===== カカポの里（背景） =====
let sceneCache = { key: null, canvas: null };
let sceneLights = [];

function drawScene(stage) {
  const index = STAGES.indexOf(stage);
  if (sceneCache.key !== index) {
    sceneCache = { key: index, canvas: paintVillage(stage, index) };
  }
  lg.drawImage(sceneCache.canvas, 0, 0);
  drawClouds(index);
}

function paintVillage(stage, index) {
  const night = index >= 3;
  const p = new Pix(LW, LH);
  const top = hex(stage.sky[0]);
  const bottom = hex(stage.sky[1]);
  const skyBands = Array.from({ length: 9 }, (_, i) => mixRGB(top, bottom, i / 8));

  // 空：色の帯をディザでつなぐ
  for (let y = 0; y < 78; y++) {
    for (let x = 0; x < LW; x++) {
      p.set(x, y, tone(skyBands, (y / 72) * 8, x, y));
    }
  }
  // 太陽（夜は月）と、そのまわりの光の輪
  const sun = night ? hex("#fbe7c0") : hex("#fffbe8");
  for (let y = 4; y < 46; y++) {
    for (let x = 98; x < 142; x++) {
      const d = Math.hypot(x + 0.5 - 120, y + 0.5 - 24);
      if (d < 6) p.set(x, y, night && hash(x, y, 1) > 0.8 ? darken(sun, 0.12) : sun);
      else if (d < 9 && bayer(x, y) < 0.5) p.set(x, y, mixRGB(p.get(x, y), sun, 0.6));
      else if (d < 13 && bayer(x, y) < 0.2) p.set(x, y, mixRGB(p.get(x, y), sun, 0.4));
    }
  }
  // 遠くの山（2重）
  const ridge = (x, base, hgt, f, ph) => base - hgt * (0.55 + 0.45 * Math.sin(x * f + ph) * Math.sin(x * f * 2.3 + ph));
  const far = mixRGB(bottom, hex("#5a7a86"), 0.45);
  const near = hex("#4f7a50");
  for (let x = 0; x < LW; x++) {
    const h1 = Math.round(ridge(x, 52, 10, 0.04, 1.3));
    for (let y = h1; y < 78; y++) p.set(x, y, y === h1 ? mixRGB(far, hex("#ffffff"), 0.25) : far);
    const h2 = Math.round(ridge(x, 60, 8, 0.065, 4.1));
    const slope = ridge(x + 1, 60, 8, 0.065, 4.1) - ridge(x, 60, 8, 0.065, 4.1);
    for (let y = h2; y < 78; y++) p.set(x, y, slope > 0 ? darken(near, 0.15) : y === h2 ? mixRGB(near, hex("#ffffff"), 0.2) : near);
  }
  // 地面：遠くは明るくかすみ、手前は濃い。草の細かいむら
  for (let y = 70; y < LH; y++) {
    for (let x = 0; x < LW; x++) {
      const base = 4.4 - ((y - 70) / 144) * 2.8 + (y < 80 ? (80 - y) * 0.12 : 0);
      p.set(x, y, tone(PAL.grass, base + (hash(x, y, 3) - 0.5) * 1.1, x, y));
    }
  }
  // 草の葉（手前ほど多い）
  for (let i = 0; i < 520; i++) {
    const y = Math.floor(80 + Math.pow(hash(i, 1, 4), 0.7) * 134);
    const x = Math.floor(hash(i, 2, 4) * LW);
    const c = PAL.grass[hash(i, 3, 4) > 0.5 ? 1 : 5];
    p.set(x, y, c);
    if (y > 120) p.set(x, y - 1, c);
  }
  // 土の小道（手前ほど広い）
  for (let y = 79; y < LH; y++) {
    const half = 5 + Math.pow((y - 79) / 135, 1.1) * 31;
    for (let x = Math.floor(80 - half - 1); x <= Math.ceil(80 + half); x++) {
      const edge = Math.abs(x + 0.5 - 80) / half;
      if (edge > 1) continue;
      let l = 2.7 + (hash(x, y, 5) - 0.5) * 1.3 - (edge > 0.85 ? 1 : 0) - (y < 90 ? 0 : 0);
      if (hash(x, y, 6) > 0.985) l += 1.6; // 小石
      p.set(x, y, tone(PAL.dirt, l, x, y));
    }
  }
  // 奥の森（2列の丸い木）
  const forest = new Pix(LW, 24);
  for (let row = 0; row < 2; row++) {
    for (let x = -4, i = 0; x < LW + 6; x += 7 + Math.floor(hash(i, row, 7) * 4), i++) {
      const r = 5.5 + hash(i, row, 8) * 2.5;
      forest.ball(x, 12 + row * 3 + hash(i, row, 9) * 2, r, r * 1.05, PAL.leaf, {
        bias: row === 0 ? 0.3 : 1,
        pattern: (px, py, l) => l + (hash(px, py, 10) - 0.5) * 1.6,
      });
    }
  }
  forest.outline(0.35, 0.2);

  const cv = p.toCanvas();
  const g = cv.getContext("2d");
  g.drawImage(forest.toCanvas(), 0, 52);

  // 里の家・茂み・切り株・石（遠いものから）
  sceneLights = [];
  const stamp = (s, x, y) => g.drawImage(s, Math.round(x - s.ox), Math.round(y - s.oy));
  const withOrigin = (pix, ox, oy) => {
    pix.outline();
    const c = pix.toCanvas();
    c.ox = ox;
    c.oy = oy;
    return c;
  };
  [[50, 80, 0.6, false], [111, 79, 0.55, true], [21, 90, 1, false], [139, 89, 0.95, true]].forEach(([x, y, s, flip]) => {
    stamp(withOrigin(buildHut(s, flip, night, x, y), 22, 26), x, y);
  });
  [[68, 82, 0.6], [97, 83, 0.65], [40, 96, 1], [120, 97, 0.95]].forEach(([x, y, s]) => {
    stamp(withOrigin(buildBush(s), 12, 10), x, y);
  });
  stamp(withOrigin(buildStump(), 18, 4), 80, 77);
  stamp(withOrigin(buildStone(), 13, 4), 80, 199);
  const tree = buildForegroundTree();
  g.drawImage(tree, 0, 0);

  // 時間帯の色をかけてから、窓の明かりを光らせる
  const img = g.getImageData(0, 0, LW, LH);
  const m = STAGE_LIGHT[index] || STAGE_LIGHT[0];
  for (let i = 0; i < img.data.length; i += 4) {
    img.data[i] = Math.min(255, img.data[i] * m[0]);
    img.data[i + 1] = Math.min(255, img.data[i + 1] * m[1]);
    img.data[i + 2] = Math.min(255, img.data[i + 2] * m[2]);
  }
  g.putImageData(img, 0, 0);
  sceneLights.forEach(([lx, ly]) => {
    g.fillStyle = "#ffd56b";
    g.fillRect(lx, ly, 2, 2);
    g.fillStyle = "rgba(255, 210, 110, 0.35)";
    for (let yy = -4; yy <= 5; yy++) {
      for (let xx = -4; xx <= 5; xx++) {
        if (Math.hypot(xx - 0.5, yy - 0.5) < 5 && (lx + xx + ly + yy) % 2 === 0) g.fillRect(lx + xx, ly + yy, 1, 1);
      }
    }
  });
  return cv;
}

// 家：正面・横の壁・わらぶき屋根を、ちがう明るさで塗る
function buildHut(s, flip, night, wx, wy) {
  const p = new Pix(46, 30);
  const X = (x) => (flip ? 22 - x : 22 + x);
  const S = (v) => v * s;
  const base = 27;
  // 横の壁（かげ）
  p.poly([[X(S(8)), base], [X(S(14)), base - S(3)], [X(S(14)), base - S(13)], [X(S(8)), base - S(10)]], PAL.wall, { level: flip ? 2.2 : 1.3 });
  // 正面の壁
  p.poly([[X(-S(8)), base], [X(S(8)), base], [X(S(8)), base - S(10)], [X(-S(8)), base - S(10)]], PAL.wall, {
    level: 3.2, pattern: (x, y, l) => l + (hash(x, y, 11) - 0.5) * 0.6,
  });
  p.poly([[X(-S(9)), base - S(10)], [X(0), base - S(19)], [X(S(9)), base - S(10)]], PAL.wall, { level: 3.6 });
  // わらぶき屋根（横の面）：すじ模様
  p.poly([[X(0), base - S(20)], [X(S(7)), base - S(23)], [X(S(17)), base - S(13)], [X(S(10)), base - S(10)]], PAL.thatch, {
    pattern: (x, y, l) => l + ((x + y * 2) % 3 === 0 ? -1 : 0) + (flip ? 0.6 : 0),
  });
  // 入り口と窓
  p.poly([[X(-S(2)), base], [X(S(2)), base], [X(S(2)), base - S(6)], [X(-S(2)), base - S(6)]], PAL.bark, { level: 1.5 });
  const wxL = Math.round(X(-S(6)));
  const wyT = Math.round(base - S(8));
  for (let yy = 0; yy < Math.max(2, S(3)); yy++) {
    for (let xx = 0; xx < Math.max(2, S(3)); xx++) {
      p.set(wxL + xx - (flip ? Math.max(2, S(3)) - 1 : 0), wyT + yy, night ? hex("#ffd56b") : hex("#8fb6c9"), 0);
    }
  }
  if (night) {
    sceneLights.push([Math.round(wx - 22 + wxL - (flip ? 1 : 0)), Math.round(wy - 26 + wyT)]);
  }
  return p;
}

// リムの実がなった茂み
function buildBush(s) {
  const p = new Pix(26, 14);
  p.ball(12 - 5 * s, 9 - 2 * s, 6 * s, 5 * s, PAL.leaf, { bias: 1, pattern: (x, y, l) => l + (hash(x, y, 12) - 0.5) * 1.4 });
  p.ball(12 + 5 * s, 9 - 2 * s, 6.5 * s, 5.2 * s, PAL.leaf, { bias: 1.3, pattern: (x, y, l) => l + (hash(x, y, 13) - 0.5) * 1.4 });
  p.ball(12, 9 - 6 * s, 6 * s, 5 * s, PAL.leaf, { bias: 1.8, pattern: (x, y, l) => l + (hash(x, y, 14) - 0.5) * 1.4 });
  [[-4, -5], [2, -9], [6, -3], [-1, -2]].forEach(([dx, dy]) => {
    p.set(12 + dx * s, 9 + dy * s, PAL.berry[2], 0);
    p.set(12 + dx * s + 1, 9 + dy * s, PAL.berry[1], 0);
  });
  return p;
}

// 切り株：円柱（横は木の皮、上は年輪）
function buildStump() {
  const p = new Pix(37, 14);
  const cx = 18;
  const rx = 17;
  for (let x = 1; x < 36; x++) {
    const nx = (x + 0.5 - cx) / rx;
    if (Math.abs(nx) > 1) continue;
    const bottom = 8 + 3.6 * Math.sqrt(1 - nx * nx);
    const v = -0.6 * nx + 0.8 * Math.sqrt(1 - nx * nx);
    for (let y = 4; y <= bottom; y++) {
      p.set(x, y, tone(PAL.bark, (v + 0.3) * 3 + ((x * 7) % 5 === 0 ? -1 : 0), x, y), 1);
    }
  }
  p.fill([1, 0, 35, 8], (x, y) => ((x - cx) / rx) ** 2 + ((y - 4) / 3.8) ** 2 <= 1, (x, y) => {
    const d = Math.hypot((x - cx) / rx, (y - 4) / 3.8);
    return 3.2 - (d * 4) % 1 * 1.2 - d;
  }, PAL.ring, { part: 2 });
  return p;
}

// 平たい石（ホームベースのかわり）
function buildStone() {
  const p = new Pix(27, 8);
  p.ball(13, 4.6, 12, 3, PAL.stone, { bias: -1.2 });
  p.ball(13, 3.4, 12, 3, PAL.stone, { bias: 0.4, pattern: (x, y, l) => l + (hash(x, y, 15) - 0.5) * 0.8 });
  return p;
}

// 手前の大きな木（左のみき・上の葉っぱ）
function buildForegroundTree() {
  const p = new Pix(LW, LH);
  for (let y = 0; y < LH; y++) {
    const w = 7 + Math.floor((y / LH) * 4);
    for (let x = 0; x < w; x++) {
      const nx = (x + 0.5) / w;
      p.set(x, y, tone(PAL.bark, 3.2 - nx * 3 + ((y * 3 + x) % 7 === 0 ? -1 : 0), x, y), 1);
    }
  }
  [[0, 2, 18], [16, -2, 13], [32, -6, 10], [LW - 8, 0, 16], [LW + 4, 10, 13], [LW - 26, -6, 11]].forEach(([x, y, r], i) => {
    p.ball(x, y, r, r * 0.8, PAL.leaf, { pattern: (px, py, l) => l - 0.6 + (hash(px, py, 16 + i) - 0.5) * 1.8 });
  });
  p.outline(0.35, 0.2);
  return p.toCanvas();
}

// 空に浮かぶ雲（ゆっくり流れる）
function drawClouds(index) {
  const t = performance.now() / 1000;
  [[20, 16, 1], [84, 10, 0.75], [140, 32, 0.6]].forEach(([x0, y, s], i) => {
    const c = sprite("cloud" + i, 34, 14, 17, 7, (p) => {
      p.ball(17 - 8 * s, 8, 7 * s, 4.5 * s, PAL.cloud);
      p.ball(17, 6, 9 * s, 6 * s, PAL.cloud, { bias: 0.3 });
      p.ball(17 + 9 * s, 8.5, 6.5 * s, 4 * s, PAL.cloud);
    });
    const x = ((x0 + Math.floor(t * (2 + i))) % (LW + 40)) - 20;
    lg.globalAlpha = index >= 3 ? 0.45 : 1;
    lg.drawImage(c.canvas, Math.round(x - c.ox), Math.round(y - c.oy));
    lg.globalAlpha = 1;
  });
}

// ストライクゾーン（四すみのかぎ形だけ）
function drawZone() {
  const x0 = Math.round(ZONE.x / LS);
  const y0 = Math.round(ZONE.y / LS);
  const x1 = Math.round((ZONE.x + ZONE.w) / LS);
  const y1 = Math.round((ZONE.y + ZONE.h) / LS);
  lg.fillStyle = "rgba(255, 255, 255, 0.85)";
  [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]].forEach(([x, y, sx, sy]) => {
    for (let i = 0; i < 5; i++) {
      lg.fillRect(x + i * sx, y, 1, 1);
      lg.fillRect(x, y + i * sy, 1, 1);
    }
  });
}

// ===== 1コマの始まりと終わり =====
function beginFrame(ox, oy) {
  lg.setTransform(1, 0, 0, 1, ox, oy);
  lg.imageSmoothingEnabled = false;
}

function endFrame() {
  lg.setTransform(1, 0, 0, 1, 0, 0);
}

// ドット絵の画面を、ぼかさずに大きくして表示する
function present() {
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(low, 0, 0, LW * LS, LH * LS);
}

// ===== 大きな文字（「ホームラン！」など） =====
// ドット風の文字に、かくかくした縁どりと、ななめ下の影をつける
function drawMessage(text, sub, color) {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "44px 'DotGothic16', monospace";
  const y = 310;
  ctx.fillStyle = "#2b2a26";
  for (let dx = -3; dx <= 6; dx += 3) {
    for (let dy = -3; dy <= 6; dy += 3) {
      ctx.fillText(text, W / 2 + dx, y + dy);
    }
  }
  ctx.fillStyle = "#ffffff";
  ctx.fillText(text, W / 2, y - 3);
  ctx.fillStyle = color;
  ctx.fillText(text, W / 2, y);
  if (sub) {
    ctx.font = "24px 'DotGothic16', monospace";
    ctx.fillStyle = "#2b2a26";
    [[-2, 0], [2, 0], [0, -2], [0, 2], [3, 3]].forEach(([dx, dy]) => ctx.fillText(sub, W / 2 + dx, y + 40 + dy));
    ctx.fillStyle = "#ffffff";
    ctx.fillText(sub, W / 2, y + 40);
  }
  ctx.restore();
}
