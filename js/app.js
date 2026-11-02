/* ==========================================
   ワートリ好き顔メーカー (200ラウンド高精度Elo & 動的K値版)
   ========================================== */

const TOTAL_ROUNDS = 200;

// 200回に合わせて配分 (合計200回)
const ROUND_COUNTS = [
  { size: 4, count: 70 },
  { size: 3, count: 70 },
  { size: 2, count: 60 }
];

// Eloレーティングの基本設定
const INITIAL_RATING = 1500;

const $ = selector => document.querySelector(selector);

const startSection = $("#start-section");
const duelMode = $("#duel-mode");
const resultSection = $("#result-section");

const startButton = $("#start-button");
const duelCards = $("#duel-cards");
const duelProgressText = $("#duel-progress-text");
const duelProgressBar = $("#duel-progress-bar");
const duelMessage = $("#duel-message");

const resultGrid = $("#result-grid");
const resultSubtitle = $("#result-subtitle");
const resultMessage = $("#result-message");

const duelFinishButton = $("#duel-finish-button");
const restartFromResultButton = $("#restart-from-result-button");
const saveButton = $("#save-button");
const copyButton = $("#copy-button");

let currentMode = "start";
let selectedMembers = [];

// Eloレートおよび出場回数データ
let eloRatings = new Map();
let appearanceCounts = new Map();

let roundPlan = [];
let duelIndex = 0;
let currentRoundMembers = [];

// ==========================================
// 共通関数
// ==========================================

function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function createImage(member) {
  const img = document.createElement("img");
  img.src = member.image;
  img.alt = member.name;
  img.loading = "lazy";

  img.addEventListener("error", () => {
    img.removeAttribute("src");
    img.alt = `${member.name}（画像を読み込めません）`;
  }, { once: true });

  return img;
}

function getRandomFromList(list, count = 1, excludeIds = new Set()) {
  const filtered = list.filter(m => !excludeIds.has(m.id));
  const shuffled = shuffle(filtered);
  return shuffled.slice(0, count);
}

// 進行度に応じた動的なK値（変動幅）を取得
function getCurrentKFactor() {
  if (duelIndex < 60) return 40;       // 序盤：大きく動かして位置を掴む
  if (duelIndex < 140) return 24;      // 中盤：安定した調整
  return 12;                           // 終盤：精密な微調整
}

// ==========================================
// 画面切り替え
// ==========================================

function showMode(mode) {
  currentMode = mode;

  startSection.hidden = mode !== "start";
  duelMode.hidden = mode !== "duel";
  resultSection.hidden = mode !== "result";
}

// ==========================================
// 出題順を作成
// ==========================================

function buildRoundPlan() {
  const plan = [];

  ROUND_COUNTS.forEach(({ size, count }) => {
    for (let i = 0; i < count; i++) {
      plan.push(size);
    }
  });

  while (plan.length < TOTAL_ROUNDS) {
    plan.push(2);
  }

  return plan.slice(0, TOTAL_ROUNDS);
}

// ==========================================
// 診断開始・リセット
// ==========================================

function startDuel() {
  if (!Array.isArray(MEMBERS) || MEMBERS.length < 9) {
    alert("診断には9人以上の
