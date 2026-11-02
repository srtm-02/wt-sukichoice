/* ==========================================
   ワートリ好き顔メーカー (200ラウンド高精度Elo版)
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

// DOM要素の取得
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

const duelRestartButton = $("#duel-restart-button");
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

  if (startSection) startSection.hidden = mode !== "start";
  if (duelMode) duelMode.hidden = mode !== "duel";
  if (resultSection) resultSection.hidden = mode !== "result";
}

function scrollToCurrentSection() {
  const target = currentMode === "result"
    ? resultSection
    : currentMode === "duel"
      ? duelMode
      : startSection;

  if (target) {
    target.scrollIntoView({
      behavior: "smooth",
      block: "start"
    });
  }
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
// 現在のランキングリストを取得 (Eloレーティング降順)
// ==========================================

function getSortedMembers() {
  return [...MEMBERS].sort((a, b) => {
    const rateA = eloRatings.get(a.id) ?? INITIAL_RATING;
    const rateB = eloRatings.get(b.id) ?? INITIAL_RATING;

    if (rateA !== rateB) return rateB - rateA;

    // レートが完全一致の場合は登場回数が少ない方を上位（補正）
    const appA = appearanceCounts.get(a.id) || 0;
    const appB = appearanceCounts.get(b.id) || 0;
    return appA - appB;
  });
}

// ==========================================
// 高精度 Eloマッチメイキング
// ==========================================

function getRoundMembers(requestedSize) {
  const unappeared = MEMBERS.filter(m => (appearanceCounts.get(m.id) || 0) === 0);

  // 1. 未登場メンバーの補填（最優先）
  if (unappeared.length > 0) {
    if (unappeared.length >= requestedSize) {
      return getRandomFromList(unappeared, requestedSize);
    }
    const selected = [...unappeared];
    const excludeSet = new Set(selected.map(m => m.id));
    const restNeeded = requestedSize - selected.length;
    const others = getRandomFromList(MEMBERS, restNeeded, excludeSet);
    return [...selected, ...others];
  }

  const sorted = getSortedMembers();

  // 2. 終盤（140回以降）：上位陣（Top 15〜20）同士を高確率でぶつけて精度固定
  if (duelIndex >= 140 && Math.random() < 0.65) {
    const topPoolSize = Math.min(20, Math.max(requestedSize + 3, Math.floor(MEMBERS.length * 0.3)));
    const topCandidates = sorted.slice(0, topPoolSize);
    if (topCandidates.length >= requestedSize) {
      return getRandomFromList(topCandidates, requestedSize);
    }
  }

  // 3. 通常のマッチング（レーティングの近いライバル同士の対戦）
  const minApps = Math.min(...Array.from(appearanceCounts.values()));
  const candidatesForSeed = MEMBERS.filter(m => (appearanceCounts.get(m.id) || 0) <= minApps + 2);
  const seedPool = candidatesForSeed.length > 0 ? candidatesForSeed : MEMBERS;
  const seed = shuffle(seedPool)[0];

  const seedIndex = sorted.findIndex(m => m.id === seed.id);

  // 基準メンバーの順位近傍から対戦相手を選出
  const windowSize = Math.max(6, requestedSize * 2);
  let startIdx = Math.max(0, seedIndex - Math.floor(windowSize / 2));
  let endIdx = Math.min(sorted.length, startIdx + windowSize);

  if (endIdx - startIdx < windowSize) {
    startIdx = Math.max(0, endIdx - windowSize);
  }

  const nearbyPool = sorted.slice(startIdx, endIdx);
  const excludeSet = new Set([seed.id]);
  const matchedOpponents = getRandomFromList(nearbyPool, requestedSize - 1, excludeSet);

  const result = shuffle([seed, ...matchedOpponents]);

  // 万が一規定数に届かない場合のフォールバック
  if (result.length < requestedSize) {
    const currentIds = new Set(result.map(m => m.id));
    const fill = getRandomFromList(MEMBERS, requestedSize - result.length, currentIds);
    result.push(...fill);
  }

  return result.slice(0, requestedSize);
}

// ==========================================
// 診断画面を表示
// ==========================================

function renderDuel() {
  duelCards.replaceChildren();

  const total = roundPlan.length;
  // 進捗度をパーセントで算出
  const percent = total > 0 ? Math.floor((duelIndex / total) * 100) : 0;

  // ★「選択 ○%」形式に明示変更
  if (duelProgressText) {
    duelProgressText.textContent = `選択 ${percent}%`;
  }
  if (duelProgressBar) {
    duelProgressBar.style.width = `${percent}%`;
  }

  if (duelIndex >= total) {
    duelCards.textContent = "すべての選択が完了しました！";
    duelMessage.textContent = "お疲れさま！「結果を見る」を押して、上位9人を確認しよう。";
    if (duelFinishButton) duelFinishButton.disabled = false;
    return;
  }

  if (duelFinishButton) duelFinishButton.disabled = true;

  const baseSize = roundPlan[duelIndex];
  currentRoundMembers = getRoundMembers(baseSize);

  const actualSize = currentRoundMembers.length;
  const label = actualSize === 4 ? "四択" : actualSize === 3 ? "三択" : "二択";

  if (duelMessage) {
    duelMessage.textContent = `第${duelIndex + 1}回：${label} — 好きな人を1人選んでね。`;
  }

  // 選択カード表示グリッドの調整
  if (actualSize > 2) {
    duelCards.style.gridTemplateColumns = "repeat(2, 1fr)";
  } else {
    duelCards.style.gridTemplateColumns = "1fr 1fr";
  }

  currentRoundMembers.forEach(member => {
    appearanceCounts.set(
      member.id,
      (appearanceCounts.get(member.id) || 0) + 1
    );

    const button = document.createElement("button");
    button.type = "button";
    button.className = "duel-card";

    button.appendChild(createImage(member));

    const name = document.createElement("strong");
    name.textContent = member.name;

    const group = document.createElement("small");
    group.textContent = member.group;

    button.append(name, group);

    button.addEventListener("click", () => {
      chooseDuelWinner(member);
    });

    duelCards.appendChild(button);
  });
}

// ==========================================
// Eloレーティングの計算と更新
// ==========================================

function updateEloRatings(winner, participants) {
  const winnerRating = eloRatings.get(winner.id) ?? INITIAL_RATING;
  const currentK = getCurrentKFactor();

  participants.forEach(loser => {
    if (loser.id === winner.id) return;

    const loserRating = eloRatings.get(loser.id) ?? INITIAL_RATING;

    const
