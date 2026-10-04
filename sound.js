// ===== 効果音 =====
// 音のファイルは使わず、Web Audio API で音をその場で作ります（ブロック崩しと同じしくみ）

let audio = null;   // 音を鳴らすための装置（最初にクリックやキーを押したときに作る）
let muted = false;

try {
  muted = localStorage.getItem("tenteki-busters-muted") === "1";
} catch (e) {
  // 保存が使えない環境でも気にしない
}

// ブラウザは「人が操作するまで音を出してはいけない」ルールなので、
// 最初の操作のときに音の装置を準備する
function unlockAudio() {
  if (!audio) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      audio = new AudioContextClass();
    }
  }
  if (audio && audio.state === "suspended") {
    audio.resume();
  }
}

// 音を1つ鳴らす
// freq：音の高さ（Hz）　duration：長さ（秒）　type：音色　volume：大きさ　slideTo：終わりの高さ
function beep(freq, duration, type = "square", volume = 0.04, slideTo = null) {
  if (muted || !audio) {
    return;
  }
  const now = audio.currentTime;
  const osc = audio.createOscillator(); // 音のもと
  const gain = audio.createGain();      // 音量のつまみ

  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  if (slideTo) {
    osc.frequency.exponentialRampToValueAtTime(slideTo, now + duration);
  }
  gain.gain.setValueAtTime(volume, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration); // だんだん小さく

  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(now);
  osc.stop(now + duration);
}

// ゲームで使う音
const sound = {
  pitch: () => beep(500, 0.12, "triangle", 0.03, 900),
  swing: () => beep(260, 0.13, "sawtooth", 0.025, 70),
  hit: () => {
    beep(1500, 0.04, "square", 0.06);
    beep(2400, 0.3, "triangle", 0.05, 1600); // カキーン
  },
  foul: () => beep(700, 0.1, "square", 0.04, 400),
  strike: () => beep(220, 0.3, "square", 0.035, 140),
  warp: () => beep(1800, 0.1, "sine", 0.05, 300),
  homerun: () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      setTimeout(() => beep(f, 0.16, "triangle", 0.05), i * 90);
    });
  },
  clear: () => {
    [784, 988, 1175, 1568].forEach((f, i) => {
      setTimeout(() => beep(f, 0.2, "triangle", 0.05), i * 140);
    });
  },
  fail: () => {
    [392, 330, 262].forEach((f, i) => {
      setTimeout(() => beep(f, 0.3, "sawtooth", 0.03), i * 220);
    });
  },
};

function setMuted(value) {
  muted = value;
  try {
    localStorage.setItem("tenteki-busters-muted", value ? "1" : "0");
  } catch (e) {
    // 保存できなくても気にしない
  }
}
