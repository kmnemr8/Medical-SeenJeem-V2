
/* script.js
   - Multiplayer Q&A game with lifelines, timer, custom banks, sounds, rematch, leaderboard, explanation option
*/

const socket = io();
let roomId = null;
let playerName = null;
let myRole = null; // "A" أو "B"
let isMaster = false;

// ---------- refs ----------
const setupEl = document.getElementById("setup");
const gameEl = document.getElementById("game");
const gameOverEl = document.getElementById("gameOver");
const roomSetupEl = document.getElementById("roomSetup");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const playerNameInput = document.getElementById("playerNameInput");
const roomIdInput = document.getElementById("roomIdInput");
const roleInfo = document.getElementById("roleInfo");

const startBtn = document.getElementById("startBtn");
const restartBtn = document.getElementById("restartBtn");
const rematchBtn = document.getElementById("rematchBtn");
const questionBankSelect = document.getElementById("questionBank");
const customBankInput = document.getElementById("customBank");
const difficultySelect = document.getElementById("difficulty");
const timeLimitInput = document.getElementById("timeLimit");
const numQuestionsInput = document.getElementById("numQuestions");
const showExplanationInput = document.getElementById("showExplanation");
const themeBtn = document.getElementById("themeBtn");
const muteBtn = document.getElementById("muteBtn");

const teamANameEl = document.getElementById("teamAName");
const teamBNameEl = document.getElementById("teamBName");
const scoreAEl = document.getElementById("scoreA");
const scoreBEl = document.getElementById("scoreB");
const lifelinesAEl = document.getElementById("lifelinesA");
const lifelinesBEl = document.getElementById("lifelinesB");

const turnLabel = document.getElementById("turnLabel");
const progressEl = document.getElementById("progress");
const timerEl = document.getElementById("timer");
const qCategoryEl = document.getElementById("qCategory");
const qDifficultyEl = document.getElementById("qDifficulty");
const questionTextEl = document.getElementById("questionText");
const choicesEl = document.getElementById("choices");
const feedbackEl = document.getElementById("feedback");
const nextBtn = document.getElementById("nextBtn");
const use50Btn = document.getElementById("use50");
const usePassBtn = document.getElementById("usePass");
const useConsultBtn = document.getElementById("useConsult");
const finalText = document.getElementById("finalText");

const soundCorrect = document.getElementById("soundCorrect");
const soundWrong = document.getElementById("soundWrong");
const soundTimeout = document.getElementById("soundTimeout");
const soundLifeline = document.getElementById("soundLifeline");
const bgMusic = document.getElementById("bgMusic");

// ---------- state ----------
let allQuestions = [];
let gamePool = [];
let currentIndex = 0;
let currentQuestion = null;
let currentChoices = [];
let timeLimit = 30;
let timer = null;
let timeLeft = 0;
let players = { A: "Player A", B: "Player B" };
let scores = { A: 0, B: 0 };
let turn = "A";
let lifelines = {
  A: { fifty: true, pass: true, consult: true },
  B: { fifty: true, pass: true, consult: true },
};
let lastInitState = null;
let isMuted = false;
let showExplanation = true;

// ---------- helpers ----------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ---------- socket handlers ----------
joinRoomBtn.addEventListener("click", () => {
  roomId = roomIdInput.value.trim();
  playerName = playerNameInput.value.trim();
  if (!roomId || !playerName) {
    alert("رجاءً اكتب اسمك ومعرّف الغرفة أولاً.");
    return;
  }
  socket.emit("joinRoom", { roomId, playerName });
});

socket.on("roomFull", () => {
  alert("هذه الغرفة ممتلئة (لاعبان فقط). اختر رقم غرفة آخر.");
});

socket.on("playerRole", ({ role, playerName: name }) => {
  myRole = role;
  isMaster = role === "A";
  players[role] = name;
  roleInfo.textContent = `✅ أنت ${name} (Player ${role})`;
  if (!isMaster) startBtn.disabled = true;
  setupEl.classList.remove("hidden");
  roomSetupEl.classList.add("hidden");
});

socket.on("playersUpdate", ({ players: list }) => {
  list.forEach((p) => {
    players[p.role] = p.name;
  });
  updateScoreboard();
});

socket.on("gameStart", (state) => {
  applyGameState(state);
  setupEl.classList.add("hidden");
  gameOverEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  renderQuestion();
  startTimer();
});

socket.on("gameEvent", (event) => {
  handleRemoteEvent(event);
});

// ---------- game state ----------
function buildInitialState(numQuestions, difficulty) {
  let pool = allQuestions.slice();
  if (difficulty && difficulty !== "mixed") {
    pool = pool.filter((q) => q.difficulty === difficulty);
  }
  if (pool.length < numQuestions) {
    // في حال البنك أصغر من المطلوب
    numQuestions = pool.length;
  }
  pool = shuffle(pool).slice(0, numQuestions);

  return {
    gamePool: pool,
    currentIndex: 0,
    currentQuestion: pool[0],
    currentChoices: mapAndShuffleChoices(pool[0]),
    scores: { A: 0, B: 0 },
    lifelines: {
      A: { fifty: true, pass: true, consult: true },
      B: { fifty: true, pass: true, consult: true },
    },
    turn: "A",
    players,
    timeLimit,
    roomId,
    showExplanation,
  };
}

function mapAndShuffleChoices(q) {
  return shuffle(
    q.choices.map((c, i) => ({
      text: c,
      isCorrect: i === q.answerIndex,
      origIndex: i,
    }))
  );
}

function applyGameState(state) {
  gamePool = state.gamePool;
  currentIndex = state.currentIndex;
  currentQuestion = state.currentQuestion;
  currentChoices = state.currentChoices;
  scores = state.scores;
  lifelines = state.lifelines;
  turn = state.turn;
  players = state.players;
  timeLimit = state.timeLimit;
  showExplanation = state.showExplanation ?? true;
}

// ---------- timer ----------
function startTimer() {
  clearInterval(timer);
  if (timeLimit <= 0) {
    timerEl.textContent = "";
    timerEl.style.setProperty("--duration", "0s");
    return;
  }
  timeLeft = timeLimit;
  timerEl.textContent = `⏱ ${timeLeft}s`;

  timerEl.style.setProperty("--duration", `${timeLimit}s`);
  timerEl.classList.remove("anim");
  void timerEl.offsetWidth;
  timerEl.classList.add("anim");

  timer = setInterval(() => {
    timeLeft--;
    timerEl.textContent = `⏱ ${timeLeft}s`;
    if (timeLeft <= 0) {
      clearInterval(timer);
      if (myRole === turn) {
        const event = { type: "timeout" };
        socket.emit("gameEvent", { roomId, event });
        handleRemoteEvent(event);
      }
    }
  }, 1000);
}

// ---------- UI ----------
function updateScoreboard() {
  teamANameEl.textContent = players.A;
  teamBNameEl.textContent = players.B;

  [scoreAEl, scoreBEl].forEach((el, idx) => {
    const role = idx === 0 ? "A" : "B";
    const newScore = scores[role];
    if (parseInt(el.textContent) !== newScore) {
      el.textContent = newScore;
      el.classList.add("updated");
      setTimeout(() => el.classList.remove("updated"), 600);
    }
  });

  lifelinesAEl.innerHTML = `50:50 ${lifelines.A.fifty ? "●" : "✕"} · Pass ${
    lifelines.A.pass ? "●" : "✕"
  } · Consult ${lifelines.A.consult ? "●" : "✕"}`;
  lifelinesBEl.innerHTML = `50:50 ${lifelines.B.fifty ? "●" : "✕"} · Pass ${
    lifelines.B.pass ? "●" : "✕"
  } · Consult ${lifelines.B.consult ? "●" : "✕"}`;

  turnLabel.textContent = `Turn: ${turn === "A" ? players.A : players.B}`;
  progressEl.textContent = `Q ${currentIndex + 1} / ${gamePool.length}`;
}

function renderQuestion() {
  if (!currentQuestion) {
    gameEl.classList.add("hidden");
    gameOverEl.classList.remove("hidden");

    let winner = "Draw";
    if (scores.A > scores.B) winner = players.A;
    else if (scores.B > scores.A) winner = players.B;

    finalText.textContent = `${players.A} ${scores.A} — ${players.B} ${scores.B}. Winner: ${winner}`;

    if (isMaster) {
      socket.emit("gameEvent", {
        roomId,
        event: { type: "gameOver", scores, winner },
      });
    }
    return;
  }

  updateScoreboard();
  qCategoryEl.textContent = currentQuestion.category || "";
  qDifficultyEl.textContent = currentQuestion.difficulty?.toUpperCase() || "";
  questionTextEl.textContent = currentQuestion.question || "—";
  choicesEl.innerHTML = "";
  feedbackEl.textContent = "";
  nextBtn.classList.add("hidden");

  currentChoices.forEach((c, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.innerText = c.text;
    btn.dataset.idx = idx;
    btn.disabled = myRole !== turn;
    btn.addEventListener("click", () => onChoiceClick(idx));
    choicesEl.appendChild(btn);
  });

  use50Btn.disabled = !lifelines[turn].fifty;
  usePassBtn.disabled = !lifelines[turn].pass;
  useConsultBtn.disabled = !lifelines[turn].consult;

  startTimer();
}

// ---------- events ----------
function onChoiceClick(idx) {
  if (myRole !== turn) return;
  const event = { type: "answer", idx };
  socket.emit("gameEvent", { roomId, event });
  handleRemoteEvent(event);
}

function nextQuestion() {
  const event = { type: "next" };
  socket.emit("gameEvent", { roomId, event });
  handleRemoteEvent(event);
}

function handleLifeline(type) {
  const event = { type: "lifeline", lifeline: type, player: turn };
  socket.emit("gameEvent", { roomId, event });
  handleRemoteEvent(event);
}

function handleRemoteEvent(event) {
  if (event.type === "answer") {
    clearInterval(timer);

    const idx = event.idx;
    const chosen = currentChoices[idx];
    const buttons = choicesEl.querySelectorAll("button");
    buttons.forEach((b) => b.classList.add("disabled"));

    buttons.forEach((b) => {
      const i = Number(b.dataset.idx);
      if (currentChoices[i].isCorrect) b.classList.add("correct");
      if (i === idx && !currentChoices[i].isCorrect) b.classList.add("wrong");
    });

    if (chosen.isCorrect) {
      if (turn === "A") scores.A += 10;
      else scores.B += 10;
      if (!isMuted) soundCorrect?.play().catch(() => {});
      feedbackEl.style.color = "green";
      feedbackEl.textContent = "✅ Correct!";
    } else {
      if (!isMuted) soundWrong?.play().catch(() => {});
      feedbackEl.style.color = "red";
      feedbackEl.textContent = "❌ Wrong!";
    }

    // ✨ عرض التفسير إذا الخيار مفعل
    if (showExplanation && currentQuestion.explanation) {
      const exp = document.createElement("div");
      exp.className = "explanation";
      exp.textContent = "💡 " + currentQuestion.explanation;
      feedbackEl.appendChild(exp);
    }

    nextBtn.classList.remove("hidden");
    updateScoreboard();
  }

  if (event.type === "timeout") {
    feedbackEl.textContent = "⏰ Time's up!";
    nextBtn.classList.remove("hidden");
    if (!isMuted) soundTimeout?.play().catch(() => {});
    // تعطيل الأزرار
    const buttons = choicesEl.querySelectorAll("button");
    buttons.forEach((b) => b.classList.add("disabled"));
  }

  if (event.type === "next") {
    currentIndex++;
    turn = turn === "A" ? "B" : "A";
    if (currentIndex >= gamePool.length) {
      currentQuestion = null;
    } else {
      currentQuestion = gamePool[currentIndex];
      currentChoices = mapAndShuffleChoices(currentQuestion);
    }
    renderQuestion();
  }

  if (event.type === "lifeline") {
    const { lifeline, player } = event;
    lifelines[player][lifeline] = false;
    feedbackEl.style.color = "orange";
    feedbackEl.textContent = `💡 ${lifeline.toUpperCase()} used by ${
      player === "A" ? players.A : players.B
    }`;
    if (!isMuted) soundLifeline?.play().catch(() => {});

    if (lifeline === "fifty") {
      let wrongIndices = currentChoices
        .map((c, i) => (c.isCorrect ? -1 : i))
        .filter((i) => i >= 0);
      wrongIndices = shuffle(wrongIndices).slice(0, 2);
      wrongIndices.forEach((idx) => {
        const b = choicesEl.querySelector(`button[data-idx='${idx}']`);
        if (b) b.style.visibility = "hidden";
      });
    }

    if (lifeline === "pass") {
      nextBtn.classList.remove("hidden");
    }

    if (lifeline === "consult") {
      const correctIdx = currentChoices.findIndex((c) => c.isCorrect);
      const others = currentChoices.map((c, i) => i).filter((i) => i !== correctIdx);
      const pickOne = shuffle(others)[0];
      const keep = [correctIdx, pickOne];
      currentChoices.forEach((c, i) => {
        const b = choicesEl.querySelector(`button[data-idx='${i}']`);
        if (b && !keep.includes(i)) b.style.visibility = "hidden";
      });
    }

    updateScoreboard();
  }
}
async function smartFetchJSON(path) {
  if (!path) return null;
  const candidates = [
    path,               // "Academic/xxx.json"
    "./" + path,        // "./Academic/xxx.json"
    "./questions/" + path,            // "./questions/Academic/xxx.json"
    path.replace(/^questions\//, ""), // "Academic/xxx.json" لو كان يبدأ بـ questions/
  ];
  for (const p of candidates) {
    try {
      const res = await fetch(p, { cache: "no-store" });
      if (res.ok) return await res.json();
    } catch (_) {}
  }
  return null;
}

// ---------- start game ----------
async function startGame() {
  // امنع Player B ويظهر تنبيه واضح بدل ما يرجع بس
  if (!isMaster) {
    alert("Only Player A (the first to join) can start the game.\nانضم كأول لاعب أو خلي Player A يضغط Start.");
    return;
  }

  let bankFile = questionBankSelect?.value || "";
  let loaded = null;

  // مزامنة خيار إظهار الشرح
  showExplanation = !!(showExplanationInput && showExplanationInput.checked);

  // أولوية لملف JSON المرفوع
  if (customBankInput?.files && customBankInput.files[0]) {
    try {
      const text = await customBankInput.files[0].text();
      loaded = JSON.parse(text);
      bankFile = "custom";
    } catch {
      alert("❌ Invalid JSON file.");
      return;
    }
  } else if (bankFile) {
    // جرّب تحميل البنك المختار بمسارات متعددة
    loaded = await smartFetchJSON(bankFile);
  } else {
    // لو ما اختارش بنك ولا رفع ملف → حمل كل البنوك بشكل افتراضي
    const bankFiles = [
      "Academic/questions_medicine.json",
      "Academic/questions_medicine_2.json",
      "Academic/questions_misc.json",
      "Academic/questions_misc_2.json",
      "Academic/questions_obgyn.json",
      "Academic/questions_obgyn_2.json",
      "Academic/questions_pediatrics.json",
      "Academic/questions_pediatrics_2.json",
      "Academic/questions_surgery.json",
      "Academic/questions_surgery_2.json",
      "Academic/questions_physiology.json",
      "Academic/questions_ethics.json",
      "Academic/questions_microbiology.json",
      "Academic/questions_pharmacology.json"
    ];
    let combined = [];
    for (const f of bankFiles) {
      const data = await smartFetchJSON(f);
      if (Array.isArray(data) && data.length) combined = combined.concat(data);
    }
    loaded = combined;
    bankFile = "all";
  }

  // Fallback لو فشل التحميل لأي سبب → عينات بسيطة لتشغيل اللعبة
  if (!Array.isArray(loaded) || loaded.length === 0) {
    console.warn("⚠️ Failed to load banks. Using fallback sample questions.");
    loaded = [
      {
        question: "What is the normal adult heart rate range?",
        choices: ["30–50 bpm", "60–100 bpm", "110–140 bpm", ">150 bpm"],
        answerIndex: 1,
        explanation: "Normal resting HR for adults is typically 60–100 bpm.",
        difficulty: "easy"
      },
      {
        question: "Which vitamin deficiency causes scurvy?",
        choices: ["Vitamin A", "Vitamin B12", "Vitamin C", "Vitamin D"],
        answerIndex: 2,
        explanation: "Vitamin C deficiency leads to impaired collagen synthesis → scurvy.",
        difficulty: "easy"
      },
      {
        question: "Which nerve is affected in carpal tunnel syndrome?",
        choices: ["Ulnar nerve", "Median nerve", "Radial nerve", "Axillary nerve"],
        answerIndex: 1,
        explanation: "Compression of the median nerve in the carpal tunnel.",
        difficulty: "easy"
      }
    ];
  }

  // خزّن في المتغير العالمي المستخدم بواسطة buildInitialState()
  allQuestions = loaded;

  // إعدادات
  const difficulty = typeof difficultySelect !== "undefined" && difficultySelect ? difficultySelect.value : "mixed";
  timeLimit = clamp(parseInt((timeLimitInput?.value || "30"), 10), 0, 600);
  const numQuestions = clamp(parseInt((numQuestionsInput?.value || "10"), 10), 1, 500);

  // بناء الحالة الابتدائية وبثها للغرفة
  const initState = buildInitialState(numQuestions, difficulty);
  initState.bankFile = bankFile;

  socket.emit("gameStart", initState);
  applyGameState(initState);
  lastInitState = initState;

  // إظهار شاشة اللعب
  setupEl.classList.add("hidden");
  gameOverEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  renderQuestion();

  if (!isMuted) bgMusic?.play().catch(() => {});
}

// ---------- restart ----------
function restart() {
  clearInterval(timer);
  // لا نغادر الغرفة؛ نرجع لإعدادات اللعبة داخل نفس الغرفة
  setupEl.classList.remove("hidden");
  gameEl.classList.add("hidden");
  gameOverEl.classList.add("hidden");
  roomSetupEl.classList.add("hidden");
  feedbackEl.textContent = "";
  nextBtn.classList.add("hidden");
  if (!isMuted) { try { bgMusic.pause(); } catch(e){} }
}

// ---------- DOM listeners ----------
startBtn.addEventListener("click", startGame);
restartBtn.addEventListener("click", restart);
rematchBtn.addEventListener("click", () => {
  if (!lastInitState) return;
  socket.emit("gameStart", lastInitState);
  applyGameState(lastInitState);
  setupEl.classList.add("hidden");
  gameOverEl.classList.add("hidden");
  gameEl.classList.remove("hidden");
  renderQuestion();
});

nextBtn.addEventListener("click", () => {
  if (myRole === turn) nextQuestion();
});
use50Btn.addEventListener("click", () => {
  if (myRole === turn && lifelines[turn].fifty) handleLifeline("fifty");
});
usePassBtn.addEventListener("click", () => {
  if (myRole === turn && lifelines[turn].pass) handleLifeline("pass");
});
useConsultBtn.addEventListener("click", () => {
  if (myRole === turn && lifelines[turn].consult) handleLifeline("consult");
});
themeBtn.addEventListener("click", () => {
  const isDark =
    document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    themeBtn.textContent = "🌙 Dark";
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    themeBtn.textContent = "☀️ Light";
  }
});
muteBtn.addEventListener("click", () => {
  isMuted = !isMuted;
  if (isMuted) {
    try { bgMusic.pause(); } catch(e){}
    muteBtn.textContent = "🔊 Unmute"; // ← تصحيح النص عند الكتم
  } else {
    bgMusic?.play().catch(() => {});
    muteBtn.textContent = "🔇 Mute";   // ← نص عند التشغيل
  }
});
customBankInput.addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    allQuestions = JSON.parse(text);
    questionBankSelect.value = "";
    alert("✅ Custom questions loaded successfully!");
  } catch {
    alert("❌ Invalid JSON file.");
  }
});
