// ===== ステージ（攻めてくる天敵たち） =====
// need：クリアに必要なホームランの本数（1ステージ10球）
// speed：球がとどくまでの秒数（[いちばん速い, いちばん遅い]）
// pitches：投げてくる球の種類と、その出やすさ（数字が大きいほど、よく投げてくる）
//   straight：ストレート　fast：速球　slow：スローボール
//   curve：横に曲がる　sinker：落ちる　rise：浮き上がる
//   vanish：とちゅうで消える　stop：とちゅうで止まる　accel：急に加速する
//   zigzag：ジグザグ　clone：分身する　warp：瞬間移動する
// sky：空の色（上, 下）。ステージが進むほど、あやしい空になる

const STAGES = [
  {
    name: "ネズミのチュータ",
    animal: "rat",
    line: "チュッチュッ、里の木の実は ぜんぶいただくぜ！",
    need: 3,
    speed: [1.05, 1.2],
    pitches: { straight: 1 },
    sky: ["#a9d8ec", "#e8f4ee"],
  },
  {
    name: "ノラネコのクロベエ",
    animal: "cat",
    line: "ニャフフ…おいらの球は、速いかな？ 遅いかな？",
    need: 4,
    speed: [0.9, 1.0],
    pitches: { straight: 2, fast: 2, slow: 2 },
    sky: ["#9cc6e4", "#f3ead2"],
  },
  {
    name: "フェレットのクネリ",
    animal: "ferret",
    line: "くねくね〜っと曲がる球、打てるもんなら打ってみな",
    need: 4,
    speed: [0.85, 0.95],
    pitches: { straight: 1, curve: 3, sinker: 2, rise: 1 },
    sky: ["#f2b77e", "#f7e0b8"],
  },
  {
    name: "オコジョのシロガネ",
    animal: "stoat",
    line: "この白い毛は雪の色…わたしの球も、雪のように消えるのさ",
    need: 5,
    speed: [0.8, 0.9],
    pitches: { fast: 1, curve: 1, vanish: 3, stop: 2 },
    sky: ["#7d6a9e", "#e3b9a4"],
  },
  {
    name: "大ワシのハースト大王",
    animal: "eagle",
    line: "太古の空を支配した、このワシの魔球を受けてみよ！",
    need: 5,
    speed: [0.75, 0.85],
    pitches: { fast: 1, zigzag: 2, clone: 2, warp: 2, accel: 2, vanish: 1 },
    sky: ["#3b2a4a", "#a34a4a"],
  },
];
