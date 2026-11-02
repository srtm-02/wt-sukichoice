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
  if (duelIndex < 60) return 40;       // 序盤
  if (duelIndex < 140) return 24;      // 中盤
  return 12;                           // 終盤
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

    const appA = appearanceCounts.get(a.id) || 0;
    const appB = appearanceCounts.get(b.id) || 0;
    return appA - appB;
  });
}

// ==========================================
// マッチメイキング
// ==========================================

function getRoundMembers(requestedSize) {
  const unappeared = MEMBERS.filter(m => (appearanceCounts.get(m.id) || 0) === 0);

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

  if (duelIndex >= 140 && Math.random() < 0.65) {
    const topPoolSize = Math.min(20, Math.max(requestedSize + 3, Math.floor(MEMBERS.length * 0.3)));
    const topCandidates = sorted.slice(0, topPoolSize);
    if (topCandidates.length >= requestedSize) {
      return getRandomFromList(topCandidates, requestedSize);
    }
  }

  const minApps = Math.min(...Array.from(appearanceCounts.values()));
  const candidatesForSeed = MEMBERS.filter(m => (appearanceCounts.get(m.id) || 0) <= minApps + 2);
  const seedPool = candidatesForSeed.length > 0 ? candidatesForSeed : MEMBERS;
  const seed = shuffle(seedPool)[0];

  const seedIndex = sorted.findIndex(m => m.id === seed.id);

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

  if (result.length < requestedSize) {
    const currentIds = new Set(result.map(m => m.id));
    const fill = getRandomFromList(MEMBERS, requestedSize - result.length, currentIds);
    result.push(...fill);
  }

  return result.slice(0, requestedSize);
}

// ==========================================
// 診断画面の表示
// ==========================================

function renderDuel() {
  duelCards.replaceChildren();

  const total = roundPlan.length;
  const percent = total > 0 ? Math.floor((duelIndex / total) * 100) : 0;

  // 進捗度をパーセント表記に変更
  if (duelProgressText) {
    duelProgressText.textContent = `選択 ${percent}%`;
  }
  if (duelProgressBar) {
    duelProgressBar.style.width = `${percent}%`;
  }

  if (duelIndex >= total) {
    duelCards.textContent = "すべての選択が完了しました！";
    if (duelMessage) duelMessage.textContent = "お疲れさま！「結果を見る」を押して、上位9人を確認しよう。";
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

    const expectedWinner = 1 / (1 + Math.pow(10, (loserRating - winnerRating) / 400));
    const expectedLoser = 1 - expectedWinner;

    const newWinnerRating = (eloRatings.get(winner.id) ?? INITIAL_RATING) + currentK * (1 - expectedWinner);
    const newLoserRating = loserRating + currentK * (0 - expectedLoser);

    eloRatings.set(winner.id, newWinnerRating);
    eloRatings.set(loser.id, newLoserRating);
  });
}

function chooseDuelWinner(winnerMember) {
  if (duelIndex >= roundPlan.length) return;

  updateEloRatings(winnerMember, currentRoundMembers);
  duelIndex++;
  renderDuel();
}

// ==========================================
// イベントハンドラ & 初期化
// ==========================================

function startDuel() {
  if (!Array.isArray(MEMBERS) || MEMBERS.length < 9) {
    alert("診断には9人以上の登録が必要です。js/members.jsを確認してください。");
    return;
  }

  eloRatings = new Map(MEMBERS.map(m => [m.id, INITIAL_RATING]));
  appearanceCounts = new Map(MEMBERS.map(m => [m.id, 0]));

  selectedMembers = [];
  duelIndex = 0;
  roundPlan = buildRoundPlan();

  if (duelFinishButton) duelFinishButton.disabled = true;
  if (resultMessage) resultMessage.textContent = "";

  showMode("duel");
  renderDuel();
}

if (startButton) startButton.addEventListener("click", startDuel);

if (duelRestartButton) {
  duelRestartButton.addEventListener("click", () => {
    if (
      duelIndex === 0 ||
      window.confirm("最初からやり直す？ 今までの選択結果はリセットされます。")
    ) {
      showMode("start");
    }
  });
}

if (restartFromResultButton) {
  restartFromResultButton.addEventListener("click", () => {
    showMode("start");
  });
}

function finishDuel() {
  if (!Array.isArray(MEMBERS) || MEMBERS.length < 9 || duelIndex < roundPlan.length) {
    return;
  }

  const sorted = getSortedMembers();
  selectedMembers = sorted.slice(0, 9);
  showResult();
}

if (duelFinishButton) duelFinishButton.addEventListener("click", finishDuel);

// ==========================================
// 結果画面の表示（画像の配置順変更）
// ==========================================

function renderResult() {
  resultGrid.replaceChildren();

  // 参考画像に合わせた3x3グリッドの並び順（インデックス）
  // 1行目: 4位, 5位, 6位
  // 2行目: 2位, 1位, 3位 (中央に1位)
  // 3行目: 7位, 8位, 9位
  const displayOrderIndexes = [3, 4, 5, 1, 0, 2, 6, 7, 8];

  displayOrderIndexes.forEach(rankIndex => {
    const member = selectedMembers[rankIndex];
    if (!member) return;

    const card = document.createElement("article");
    card.className = "result-card";

    const photo = document.createElement("div");
    photo.className = "result-photo";
    photo.appendChild(createImage(member));

    const rank = document.createElement("span");
    rank.className = "result-rank";
    rank.textContent = `${rankIndex + 1}位`;
    photo.appendChild(rank);

    const name = document.createElement("div");
    name.className = "result-name";
    name.textContent = member.name;

    const group = document.createElement("div");
    group.className = "result-group";
    group.textContent = member.group;

    card.append(photo, name, group);
    resultGrid.appendChild(card);
  });
}

function showResult() {
  if (selectedMembers.length !== 9) return;

  renderResult();
  if (resultSubtitle) resultSubtitle.textContent = "ワートリ好き顔メーカー";

  showMode("result");
  scrollToCurrentSection();
}

// ==========================================
// クリップボードコピー & 画像保存
// ==========================================

function makeResultText() {
  const lines = [
    "ワートリ好き顔メーカー",
    "わたしの好き顔9選",
    ""
  ];

  selectedMembers.forEach((member, index) => {
    lines.push(`${index + 1}位：${member.name}（${member.group}）`);
  });

  return lines.join("\n");
}

if (copyButton) {
  copyButton.addEventListener("click", async () => {
    const text = makeResultText();

    try {
      await navigator.clipboard.writeText(text);
      if (resultMessage) resultMessage.textContent = "順位付きテキストをコピーしました！";
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";

      document.body.appendChild(textarea);
      textarea.select();

      const success = document.execCommand("copy");
      textarea.remove();

      if (resultMessage) {
        resultMessage.textContent = success
          ? "順位付きテキストをコピーしました！"
          : "コピーできませんでした。ブラウザの権限を確認してね。";
      }
    }
  });
}

if (saveButton) {
  saveButton.addEventListener("click", async () => {
    const capture = $("#result-capture");

    if (typeof html2canvas !== "function") {
      if (resultMessage) resultMessage.textContent = "画像保存ライブラリを読み込めませんでした。";
      return;
    }

    saveButton.disabled = true;
    saveButton.textContent = "作成中…";

    try {
      document.body.classList.add("is-capturing");

      const images = [...capture.querySelectorAll("img")];

      await Promise.all(
        images.map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise(resolve => {
            img.addEventListener("load", resolve, { once: true });
            img.addEventListener("error", resolve, { once: true });
          });
        })
      );

      const canvas = await html2canvas(capture, {
        backgroundColor: getComputedStyle(capture).backgroundColor || "#ffffff",
        scale: 2,
        useCORS: true
      });

      const link = document.createElement("a");
      link.download = "ワートリ好き顔メーカー.png";
      link.href = canvas.toDataURL("image/png");
      link.click();

      if (resultMessage) resultMessage.textContent = "画像を保存しました！";
    } catch (error) {
      console.error(error);
      if (resultMessage) resultMessage.textContent = "画像を保存できませんでした。";
    } finally {
      document.body.classList.remove("is-capturing");
      saveButton.disabled = false;
      saveButton.textContent = "画像を保存";
    }
  });
}

// ==========================================
// アプリ初期化
// ==========================================
function initApp() {
  eloRatings = new Map(MEMBERS.map(m => [m.id, INITIAL_RATING]));
  appearanceCounts = new Map(MEMBERS.map(m => [m.id, 0]));
  roundPlan = buildRoundPlan();
  showMode("start");
}

// 読み込み時に初期化を実行
initApp();
