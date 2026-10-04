// ===== 熱闘天敵バスターズ =====
// 天敵たちが投げてくる球を、タイミングと場所を合わせて打ち返すゲーム

// ===== 設定（数字を変えると、むずかしさが変わる） =====
const W = 480;                 // 画面の横幅（canvas の中の座標）
const H = 640;                 // 画面の高さ
const PITCHES = 10;            // 1ステージで投げてくる球の数
const HIT_WINDOW = 0.1;        // 球がとどく瞬間の、前後この秒数以内に振ればバットに当たる
const HOMERUN = 100;           // この飛距離（m）以上でホームラン
const FOUL = 0.8;
const SWING_COOLDOWN = 0.4;    // 振ってから、次に振れるまでの秒数（バットが構えにもどるまで）              // タイミングのずれが HIT_WINDOW のこの割合をこえるとファウル
const ZONE = { x: 170, y: 380, w: 140, h: 130 }; // ストライクゾーン
const RELEASE = { x: 258, y: 168 };              // ピッチャーが球をはなす位置
const MOUND = { x: 240, y: 232 };                // ピッチャーの足もと
const GAME_URL = "https://kakapo-studio.com/games/tenteki-busters/";

// ===== 画面の部品 =====
const $ = (id) => document.getElementById(id);
const canvas = $("game");
const ctx = canvas.getContext("2d");

// 高解像度の画面でもくっきり描けるように、canvas の実際の大きさを調整する
function setupCanvas() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // 以降は 480×640 の座標で描ける
}
setupCanvas();

// ===== ゲームの状態 =====
// state：title（タイトル）／intro（ステージの紹介）／windup（投げる前）
//        pitch（球が飛んでくる）／flight（打球が飛んでいく）／after（結果を見せている）
//        result（ステージが終わった）
let state = "title";
let stageNum = 0;
let pitchCount = 0;    // 何球投げたか
let homeruns = 0;
let stageBest = 0;     // このステージでいちばん飛んだ距離
let save = loadSave(); // { unlocked：遊べるステージ数, best：最長飛距離 }

let pitch = null;        // 今投げている球
let elapsed = 0;         // 球をはなしてからの時間（秒）
let timer = 0;           // 次の動きまでの待ち時間
let swung = false;       // この球でもう振ったか
let swingTime = 99;      // 振りはじめてからの時間（バットの動きに使う）
let pendingHit = null;   // 早めに振って当たったとき、球がとどくまで待っておく
let flight = null;       // 打球
let message = null;      // 大きな文字
let particles = [];      // 紙ふぶき
let enemyHurt = 0;       // 天敵がダメージを受けている時間
let warpFlash = 0;       // 瞬間移動のピカッという光
let shake = 0;           // 打った瞬間の、画面のゆれ

// ===== 進み具合（ブラウザに保存） =====
function loadSave() {
  try {
    const data = JSON.parse(localStorage.getItem("tenteki-busters-save"));
    if (data && data.unlocked) {
      return data;
    }
  } catch (e) {
    // 保存が使えない環境でも気にしない
  }
  return { unlocked: 1, best: 0 };
}

function writeSave() {
  try {
    localStorage.setItem("tenteki-busters-save", JSON.stringify(save));
  } catch (e) {
    // 保存できなくても気にしない
  }
}

function updateHud() {
  $("stageLabel").textContent = stageNum + 1;
  $("ballsLeft").textContent = PITCHES - pitchCount;
  $("hrLabel").textContent = homeruns + " / " + STAGES[stageNum].need;
  $("bestLabel").textContent = save.best ? save.best + "m" : "-";
}

// ===== 便利な関数 =====
const rand = (min, max) => min + Math.random() * (max - min);
const side = () => (Math.random() < 0.5 ? -1 : 1);

// { straight: 2, curve: 1 } のような表から、数字の大きさに応じてランダムに1つ選ぶ
function pick(table) {
  const entries = Object.entries(table);
  let r = Math.random() * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [name, weight] of entries) {
    r -= weight;
    if (r < 0) {
      return name;
    }
  }
  return entries[0][0];
}

// ===== 球を作る =====
function makePitch() {
  const stage = STAGES[stageNum];
  const type = pick(stage.pitches);
  const margin = 14;
  const p = {
    type,
    // 最後にとどく場所（ストライクゾーンのどこか）
    target: {
      x: rand(ZONE.x + margin, ZONE.x + ZONE.w - margin),
      y: rand(ZONE.y + margin, ZONE.y + ZONE.h - margin),
    },
    dur: rand(stage.speed[0], stage.speed[1]), // とどくまでの秒数
    amp: 0,       // 曲がる大きさ
    pause: 0,     // 止まる時間（stop）
    fakes: [],    // 分身の位置のずれ（clone）
    warped: false,
  };
  if (type === "fast") p.dur *= 0.75;
  if (type === "slow") p.dur *= 1.6;
  if (type === "accel") p.dur *= 1.4;
  if (type === "curve") p.amp = side() * rand(90, 140);
  if (type === "sinker") p.amp = rand(90, 130);
  if (type === "rise") p.amp = rand(70, 100);
  if (type === "zigzag") p.amp = rand(40, 60);
  if (type === "warp") p.amp = side() * rand(80, 110);
  if (type === "stop") p.pause = rand(0.35, 0.7);
  if (type === "clone") p.fakes = [-1, 1].map((s) => s * rand(70, 100));
  p.arrive = p.dur + p.pause; // 実際にとどくまでの秒数
  return p;
}

// 経過時間から、球がどこまで進んだか（0＝ピッチャーの手、1＝ストライクゾーン）
function progressOf(p, time) {
  if (p.type === "stop") {
    const half = p.dur * 0.5;
    if (time < half) return time / p.dur;
    if (time < half + p.pause) return 0.5; // 空中でぴたっと止まる
    return (time - p.pause) / p.dur;
  }
  if (p.type === "accel") {
    const u = time / p.dur;
    return u < 1 ? Math.pow(u, 2.4) : u; // ゆっくり → 急に速く
  }
  return time / p.dur;
}

// 進み具合 t から、画面の上の位置と大きさを計算する
// dx：分身用に、とどく場所を左右にずらす量
function ballAt(p, t, dx = 0) {
  if (p.type === "warp" && t < 0.68) {
    dx += p.amp; // とちゅうまでは、ちがう場所に向かっている
  }
  // t × t：遠くはゆっくり、近づくほど速く見える（奥行きの表現）
  const e = t * t;
  let x = RELEASE.x + (p.target.x + dx - RELEASE.x) * e;
  let y = RELEASE.y + (p.target.y - RELEASE.y) * e;
  // とちゅうでふくらんで、最後はちゃんとねらった場所にとどく曲がり方
  const bend = Math.sin(Math.PI * Math.min(t, 1)) * t;
  if (p.type === "curve") x += p.amp * bend;
  if (p.type === "sinker") y -= p.amp * bend;
  if (p.type === "rise") y += p.amp * bend;
  if (p.type === "zigzag") x += p.amp * 2 * Math.sin(t * Math.PI * 7) * Math.max(0, 1 - t);
  const visible = !(p.type === "vanish" && t > 0.4 && t < 0.86);
  return { x, y, r: 2.5 + 10.5 * e, visible };
}

// ===== 案内用の画面（overlay） =====
function showOverlay({ title, text, button, onClick, sub = null, onSub = null, kakapo = true, stages = false, share = false }) {
  $("overlayTitle").innerHTML = title;
  $("overlayText").innerHTML = text;
  // svg は .hidden が効かないので、hidden 属性を直接つけ外しする
  $("overlayKakapo").toggleAttribute("hidden", !kakapo);
  $("overlayButton").hidden = !button;
  $("overlayButton").textContent = button || "";
  $("overlayButton").onclick = onClick || null;
  $("subButton").hidden = !sub;
  $("subButton").textContent = sub || "";
  $("subButton").onclick = onSub;
  $("stageList").hidden = !stages;
  $("share").hidden = !share;
  if (stages) {
    renderStageList();
  }
  $("overlay").hidden = false;
}

function hideOverlay() {
  $("overlay").hidden = true;
}

// ステージを選ぶボタンを並べる（まだ遊べないステージは「？？？」）
function renderStageList() {
  const list = $("stageList");
  list.innerHTML = "";
  STAGES.forEach((stage, i) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "stage-button";
    const open = i < save.unlocked;
    button.disabled = !open;
    button.innerHTML = "<span>" + (i + 1) + "</span>" + (open ? stage.name : "？？？");
    button.addEventListener("click", () => showIntro(i));
    list.appendChild(button);
  });
}

function showTitle() {
  state = "title";
  pitch = null;
  flight = null;
  message = null;
  showOverlay({
    title: "熱闘<br>天敵バスターズ",
    text: "カカポの里に、天敵たちが攻めてきた！<br>ホームランを打って、追い返そう。",
    stages: true,
    kakapo: false, // ステージのボタンが入りきるように（カカポは後ろの画面にいる）
  });
}

// ステージの紹介（天敵のセリフ）
function showIntro(n) {
  stageNum = n;
  pitchCount = 0;
  homeruns = 0;
  stageBest = 0;
  pitch = null;
  flight = null;
  message = null;
  enemyHurt = 0;
  state = "intro";
  updateHud();
  const stage = STAGES[n];
  showOverlay({
    title: "ステージ " + (n + 1),
    text:
      "<strong>" + stage.name + "</strong>が あらわれた！<br>" +
      "「" + stage.line + "」<br><br>" +
      PITCHES + "球のうち、<strong>ホームラン " + stage.need + "本</strong>で追い返せ！",
    button: "プレイボール",
    onClick: startStage,
    sub: "ステージを選ぶ",
    onSub: showTitle,
    kakapo: false,
  });
}

function startStage() {
  hideOverlay();
  nextPitch();
}

// 次の球を投げる準備
function nextPitch() {
  pitch = makePitch();
  elapsed = 0;
  swung = false;
  swingTime = 99;
  pendingHit = null;
  flight = null;
  message = null;
  state = "windup";
  timer = rand(0.8, 1.3); // 投げるまでの間（毎回少し変わる）
}

// ===== バットを振る =====
function swing() {
  // 球が飛んできている間は、何回でも振れる
  // （投げる前は振らない。当たったあと・バットが構えにもどる前も振れない）
  if (state !== "pitch" || pendingHit) {
    return;
  }
  if (swingTime < SWING_COOLDOWN) {
    return;
  }
  swung = true;
  swingTime = 0;
  sound.swing();

  // err：球がとどく瞬間とのずれ（マイナス＝早い、プラス＝おそい）
  // 前のコマから今までの時間も足して、クリックした瞬間の時間を正確に出す
  const now = elapsed + Math.min((performance.now() - lastTime) / 1000, 1 / 30);
  const err = now - pitch.arrive;
  if (Math.abs(err) <= HIT_WINDOW) {
    pendingHit = { err };
    if (err >= 0) {
      launchHit();
    }
  }
}

// 打球を飛ばす
function launchHit() {
  const { err } = pendingHit;
  pendingHit = null;
  // タイミングがどれだけピッタリだったか（1がいちばん良い）
  const timing = 1 - Math.abs(err) / HIT_WINDOW;
  const distance = Math.round(40 + 110 * timing); // ピッタリで150m、ずれるほど飛ばない
  const foul = Math.abs(err) > HIT_WINDOW * FOUL;
  flight = {
    u: 0,
    x: pitch.target.x,
    y: pitch.target.y,
    angle: (err / HIT_WINDOW) * 0.9, // 早く振ると左へ、おそく振ると右へ飛ぶ
    distance,
    foul,
    homer: !foul && distance >= HOMERUN,
  };
  state = "flight";
  shake = 0.3;
  sound.hit();
}

// 打球が落ちた（または場外へ消えた）
function landHit() {
  if (flight.foul) {
    message = { text: "ファウル", sub: null, color: "#6b675c" };
    sound.foul();
  } else if (flight.homer) {
    homeruns++;
    stageBest = Math.max(stageBest, flight.distance);
    if (flight.distance > save.best) {
      save.best = flight.distance;
      writeSave();
    }
    message = { text: "ホームラン！", sub: flight.distance + "m", color: "#d9534f" };
    enemyHurt = 0.8;
    sound.homerun();
    spawnConfetti();
  } else {
    message = {
      text: flight.distance + "m",
      sub: "あと " + (HOMERUN - flight.distance) + "m…",
      color: "#4a6b22",
    };
    sound.foul();
  }
  endPitch(1.2);
}

function strike() {
  message = { text: swung ? "空振り！" : "見のがし…", sub: null, color: "#6b675c" };
  sound.strike();
  endPitch(1.0);
}

function endPitch(wait) {
  pitchCount++;
  state = "after";
  timer = wait;
  updateHud();
}

// 1球ごとの結果を見せたあと：次の球か、ステージ終了か
function afterPitch() {
  const stage = STAGES[stageNum];
  const left = PITCHES - pitchCount;
  if (homeruns + left < stage.need || left === 0) {
    finishStage(); // もう届かない、または全部投げ終わった
  } else {
    nextPitch();
  }
}

function finishStage() {
  state = "result";
  pitch = null;
  flight = null;
  message = null;
  const stage = STAGES[stageNum];
  const cleared = homeruns >= stage.need;
  const last = stageNum === STAGES.length - 1;

  if (!cleared) {
    sound.fail();
    setupShare(false);
    showOverlay({
      title: "ざんねん…",
      text:
        stage.name + "に、里を荒らされてしまった…<br>" +
        "ホームラン " + homeruns + " / " + stage.need + "本",
      button: "もう一度",
      onClick: () => showIntro(stageNum),
      sub: "ステージを選ぶ",
      onSub: showTitle,
      share: true,
    });
    return;
  }

  sound.clear();
  if (!last && save.unlocked < stageNum + 2) {
    save.unlocked = stageNum + 2;
  }
  writeSave();

  if (last) {
    setupShare(true);
    showOverlay({
      title: "ぜんぶクリア！",
      text:
        "ハースト大王を追い返した！<br>カカポの里に、平和がもどりました。<br>" +
        "最長飛距離 " + save.best + "m",
      button: "タイトルへ",
      onClick: showTitle,
      share: true,
    });
    return;
  }

  showOverlay({
    title: "クリア！",
    text:
      stage.name + "を追い返した！<br>" +
      "ホームラン " + homeruns + "本（最長 " + stageBest + "m）",
    button: "次のステージへ",
    onClick: () => showIntro(stageNum + 1),
    sub: "ステージを選ぶ",
    onSub: showTitle,
  });
}

function quitGame() {
  showTitle();
}

// ===== 紙ふぶき =====
function spawnConfetti() {
  const colors = ["#d9534f", "#f2c14e", "#7cb05c", "#5b9bd5", "#ffffff"];
  for (let i = 0; i < 40; i++) {
    particles.push({
      x: rand(0, W),
      y: rand(-40, 0),
      vx: rand(-30, 30),
      vy: rand(80, 200),
      rot: rand(0, Math.PI),
      spin: rand(-6, 6),
      life: rand(1.2, 2),
      color: colors[i % colors.length],
    });
  }
}

// ===== 操作 =====
// 画面のどこをクリック・タップしても振る（合わせるのはタイミングだけ）
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  unlockAudio();
  swing();
});

document.addEventListener("keydown", (e) => {
  unlockAudio();
  if (e.key === "Enter" && !$("overlay").hidden && !$("overlayButton").hidden) {
    $("overlayButton").click();
    return;
  }
  if (e.key === " ") {
    e.preventDefault(); // 画面がスクロールしないように
    swing();
  }
});

$("overlay").addEventListener("pointerdown", unlockAudio);

$("muteButton").addEventListener("click", () => {
  unlockAudio();
  setMuted(!muted);
  updateMuteButton();
});

function updateMuteButton() {
  $("muteButton").textContent = muted ? "音：OFF" : "音：ON";
}

$("quitButton").addEventListener("click", quitGame);

// ===== 毎コマの動き =====
function update(dt) {
  swingTime += dt;
  enemyHurt = Math.max(0, enemyHurt - dt);
  warpFlash = Math.max(0, warpFlash - dt);
  shake = Math.max(0, shake - dt);

  if (state === "windup") {
    timer -= dt;
    if (timer <= 0) {
      state = "pitch";
      elapsed = 0;
      sound.pitch();
    }
  } else if (state === "pitch") {
    elapsed += dt;
    const t = progressOf(pitch, elapsed);
    if (pitch.type === "warp" && !pitch.warped && t >= 0.68) {
      pitch.warped = true;
      warpFlash = 0.15;
      sound.warp();
    }
    if (pendingHit && elapsed >= pitch.arrive) {
      launchHit();
    } else if (!pendingHit && elapsed > pitch.arrive + 0.25) {
      strike();
    }
  } else if (state === "flight") {
    flight.u += dt / 1.3;
    if (flight.u >= 1) {
      landHit();
    }
  } else if (state === "after") {
    elapsed += dt; // 見のがした球は、そのまま後ろへ飛んでいく
    timer -= dt;
    if (timer <= 0) {
      afterPitch();
    }
  }

  particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.rot += p.spin * dt;
    p.life -= dt;
  });
  particles = particles.filter((p) => p.life > 0);
}

// ===== 描く =====
// ピッチャーの手の位置（振りかぶる → 投げる）
function handPosition() {
  const rest = { x: MOUND.x + 30, y: MOUND.y - 46 };
  const up = { x: MOUND.x + 40, y: MOUND.y - 104 };
  const lerp = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  if (state === "windup") {
    return lerp(rest, up, Math.min(1, Math.max(0, 1 - (timer - 0.1) / 0.6)));
  }
  if (state === "pitch" && elapsed < 0.2) {
    return lerp(up, { x: RELEASE.x, y: RELEASE.y + 4 }, elapsed / 0.2);
  }
  return rest;
}

// バットの角度：かまえ → 0.14秒で振りきる → 少し止まる → SWING_COOLDOWN 秒で構えにもどる
// from：振りはじめの角度（振っている最中だけ）
function batAngle() {
  const ready = -2.3 + Math.sin(performance.now() / 300) * 0.05;
  if (swingTime > SWING_COOLDOWN) {
    return { angle: ready, from: null };
  }
  const full = 3.1;
  if (swingTime > 0.22) {
    const back = (swingTime - 0.22) / (SWING_COOLDOWN - 0.22); // 0 → 1 で構えにもどる
    return { angle: ready + full * (1 - back), from: null };
  }
  const s = Math.min(1, swingTime / 0.14);
  const angle = ready + full * (1 - Math.pow(1 - s, 3));
  return { angle, from: swingTime < 0.22 ? ready : null };
}

// 球の進み具合 t から、地面に落ちる影の位置を出す（切り株から石まで、地面の上をたどる）
function groundY(t) {
  return 240 + (592 - 240) * t * t;
}

function draw() {
  const stage = STAGES[stageNum];

  // 打った瞬間は、画面を少しゆらす（1〜2ドット）
  const power = shake / 0.3;
  beginFrame(Math.round(rand(-2, 2) * power), Math.round(rand(-2, 2) * power));

  drawScene(stage);

  const hand = handPosition();
  const holding = state === "windup" || state === "intro" || state === "title";
  drawEnemy(stage.animal, MOUND.x, MOUND.y, hand, holding, enemyHurt);

  drawZone();

  // 飛んでくる球（と分身）
  if (pitch && (state === "pitch" || (state === "after" && !flight))) {
    const t = progressOf(pitch, elapsed);
    if (t > 0 && t < 1.4) {
      pitch.fakes.forEach((dx) => {
        const alpha = t < 0.72 ? 1 : Math.max(0, 1 - (t - 0.72) / 0.1);
        if (alpha > 0) {
          const f = ballAt(pitch, t, dx);
          drawBallShadow(f.x, groundY(t), f.r, 0.3 * alpha);
          drawBall(f.x, f.y, f.r, alpha);
        }
      });
      const b = ballAt(pitch, t);
      if (b.visible) {
        drawBallShadow(b.x, groundY(t), b.r, 0.35);
        // 残像（少し前の位置に、うすい球を重ねる）
        for (let k = 3; k >= 1; k--) {
          const tk = t - k * 0.035;
          if (tk > 0.05 && ballAt(pitch, tk).visible) {
            const p = ballAt(pitch, tk);
            drawBall(p.x, p.y, p.r, 0.12 * (4 - k));
          }
        }
        drawBall(b.x, b.y, b.r);
      }
    }
  }

  const bat = batAngle();
  drawKakapo(bat.angle, bat.from);

  // 打球：上へ飛びながら、遠ざかって小さくなる。影は地面を奥へ進む
  if (flight) {
    const u = Math.min(1, flight.u);
    const peak = flight.homer ? -60 : 330 - flight.distance * 2.4;
    const rise = 1 - Math.pow(1 - u, 2);
    const y = flight.y + (peak - flight.y) * rise;
    const x = flight.x + Math.tan(flight.angle) * (flight.y - y);
    const gy = 590 - (590 - 215) * rise * Math.min(1, flight.distance / 110);
    const gx = flight.x + Math.tan(flight.angle) * (590 - gy) * 0.6;
    const r = Math.max(2, 12 * (1 - u * 0.85));
    drawBallShadow(gx, gy, r, 0.3 * (1 - u));
    drawBall(x, y, r);
  }

  endFrame();

  // 瞬間移動の光
  if (warpFlash > 0) {
    lg.fillStyle = "rgba(255, 255, 255, " + warpFlash * 3 + ")";
    lg.fillRect(0, 0, LW, LH);
  }

  // 紙ふぶき（くるくる回るように、横長とたて長を切りかえる）
  particles.forEach((p) => {
    lg.fillStyle = p.color;
    const flat = Math.sin(p.rot) > 0;
    lg.fillRect(Math.round(p.x / LS), Math.round(p.y / LS), flat ? 2 : 1, flat ? 1 : 2);
  });

  present();

  if (message) {
    drawMessage(message.text, message.sub, message.color);
  }
}

// ===== SNS でシェア =====
let shareText = "";

function setupShare(allClear) {
  const result = allClear
    ? "ぜんぶクリアして、カカポの里を守った！"
    : "ステージ" + (stageNum + 1) + "「" + STAGES[stageNum].name + "」に挑戦中！";
  shareText =
    "熱闘天敵バスターズで" + result + "\n" +
    "最長飛距離 " + save.best + "m\n" +
    "#熱闘天敵バスターズ";

  // encodeURIComponent：日本語や改行を、URL に入れられる形に変換する
  $("shareX").href =
    "https://x.com/intent/post?text=" + encodeURIComponent(shareText) +
    "&url=" + encodeURIComponent(GAME_URL);
  $("shareLine").href =
    "https://social-plugins.line.me/lineit/share?url=" + encodeURIComponent(GAME_URL);
  $("copyMessage").textContent = "";
}

$("copyResult").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(shareText + "\n" + GAME_URL);
    $("copyMessage").textContent = "コピーしました！";
  } catch (e) {
    $("copyMessage").textContent = "コピーできませんでした…";
  }
});

// ===== ゲームループ（毎秒およそ60回くり返す） =====
let lastTime = performance.now();

function loop(now) {
  // 前のコマからの経過時間（タブを離れていたときなどに大きくなりすぎないよう、上限を付ける）
  const dt = Math.min((now - lastTime) / 1000, 1 / 30);
  lastTime = now;

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// ===== はじめに =====
updateHud();
updateMuteButton();
drawKakapoFront($("overlayKakapo"));
showTitle();
requestAnimationFrame(loop);
