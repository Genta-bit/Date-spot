/* ふたりのデートルーレット — アプリ本体
   Firebase Realtime Database が設定されていれば「ふたりで同期」、
   なければ localStorage で「この端末だけ」動作する。 */

const CATS = [
  { key: "daily",  name: "日常", desc: "今日どうする？",       tab: "サッと会える近所" },
  { key: "nearby", name: "近場", desc: "ちょっと足をのばして", tab: "半日〜日帰りで" },
  { key: "far",    name: "遠出", desc: "お休みを使って",       tab: "泊まりや遠征も" },
];
const CAT_COLOR = { daily: "#e0912f", nearby: "#3f9d8f", far: "#c9557b" };
const CAT_SOFT  = { daily: "rgba(224,145,47,.14)", nearby: "rgba(63,157,143,.14)", far: "rgba(201,85,123,.16)" };

const LS_SPOTS = "dateRoulette.spots.v1";
const LS_NAME  = "dateRoulette.name.v1";
const LS_PICK  = "dateRoulette.lastPick.v1";

const state = {
  spots: [],        // {id, text, category, addedBy, createdAt, visited}
  activeCat: "daily",
  allScope: false,
  lastPick: null,
  name: "",
  spinning: false,
};

/* ---------- Firebase レイヤー（動的 import）---------- */
let fb = null; // { db, ref, onValue, set, update, remove, push, child }

async function initFirebase() {
  const cfg = window.FIREBASE_CONFIG || {};
  if (!cfg.databaseURL || !cfg.apiKey) return null;
  try {
    const [{ initializeApp }, dbmod] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js"),
    ]);
    const app = initializeApp(cfg);
    const db = dbmod.getDatabase(app);
    return { db, ...dbmod };
  } catch (e) {
    console.warn("Firebase の初期化に失敗:", e);
    return null;
  }
}

/* ---------- storage helpers ---------- */
function lsGet(k, fb_) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : fb_; } catch { return fb_; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, m => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
}

/* ---------- 名前 ---------- */
function loadName() {
  state.name = lsGet(LS_NAME, "") || "";
  if (!state.name) askName(true);
  renderName();
}
function askName(first) {
  const v = window.prompt(
    first ? "あなたの名前を教えてね（追加した人の表示に使います）" : "名前を変更",
    state.name || ""
  );
  if (v && v.trim()) { state.name = v.trim().slice(0, 12); lsSet(LS_NAME, state.name); renderName(); }
}
function renderName() {
  document.getElementById("whoLabel").textContent = state.name || "（未設定）";
}

/* ---------- データ操作（Firebase or ローカル）---------- */
function saveLocal() { lsSet(LS_SPOTS, state.spots); }

function addSpot(text, category) {
  text = (text || "").trim();
  if (!text) return;
  const rec = {
    text, category,
    addedBy: state.name || "だれか",
    createdAt: Date.now(),
    visited: false,
  };
  if (fb) {
    const r = fb.push(fb.ref(fb.db, "spots"));
    fb.set(r, rec).catch(reportWrite);
  } else {
    state.spots.push({ id: uid(), ...rec });
    saveLocal(); render();
  }
}
function updateSpot(id, patch) {
  if (fb) {
    fb.update(fb.ref(fb.db, "spots/" + id), patch).catch(reportWrite);
  } else {
    const s = state.spots.find(x => x.id === id);
    if (s) { Object.assign(s, patch); saveLocal(); render(); }
  }
}
function removeSpot(id) {
  if (fb) {
    fb.remove(fb.ref(fb.db, "spots/" + id)).catch(reportWrite);
  } else {
    state.spots = state.spots.filter(s => s.id !== id);
    saveLocal(); render();
  }
}
function setLastPick(pick) {
  state.lastPick = pick;
  if (fb) {
    fb.set(fb.ref(fb.db, "meta/lastPick"), pick).catch(reportWrite);
  } else {
    lsSet(LS_PICK, pick); renderLastPick();
  }
}
function reportWrite(e) {
  console.warn("保存に失敗:", e);
  window.alert("保存できませんでした。通信状況を確認してね。");
}

/* ---------- 起動 ---------- */
async function start() {
  loadName();

  // まずローカルで即表示
  state.spots = lsGet(LS_SPOTS, null) || [];
  state.lastPick = lsGet(LS_PICK, null);
  render();

  fb = await initFirebase();

  if (!fb) {
    setSync("off", "この端末だけに保存中");
    render();
    return;
  }

  setSync("on", "ふたりで同期中");
  document.getElementById("footNote").innerHTML =
    "<div>データは Firebase に保存され、リンクを知っているふたりで共有されます。</div>";

  // spots を購読
  fb.onValue(fb.ref(fb.db, "spots"), (snap) => {
    const val = snap.val() || {};
    const arr = Object.keys(val).map(id => {
      const v = val[id] || {};
      return {
        id,
        text: v.text || "",
        category: v.category || "daily",
        addedBy: v.addedBy || "だれか",
        createdAt: v.createdAt || 0,
        visited: !!v.visited,
      };
    });
    arr.sort((a, b) => a.createdAt - b.createdAt);
    state.spots = arr;
    render();
  }, (err) => {
    console.warn("読み取りエラー:", err);
    setSync("warn", "同期エラー（権限を確認）");
  });

  // 直近のルーレット結果を購読
  fb.onValue(fb.ref(fb.db, "meta/lastPick"), (snap) => {
    state.lastPick = snap.val() || null;
    renderLastPick();
  }, () => {});
}

function setSync(cls, text) {
  const el = document.getElementById("syncState");
  el.className = "sync" + (cls === "on" ? " on" : cls === "warn" ? " warn" : "");
  el.textContent = text;
}

/* ---------- 描画 ---------- */
function catMeta(key) { return CATS.find(c => c.key === key) || CATS[0]; }

function poolFor(scopeAll, cat) {
  return state.spots.filter(s => !s.visited && (scopeAll || s.category === cat));
}

function renderTabs() {
  const el = document.getElementById("tabs");
  el.innerHTML = "";
  CATS.forEach(c => {
    const count = state.spots.filter(s => s.category === c.key && !s.visited).length;
    const b = document.createElement("button");
    b.className = "tab";
    b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", String(c.key === state.activeCat));
    b.style.setProperty("--cat", CAT_COLOR[c.key]);
    b.style.setProperty("--cat-soft", CAT_SOFT[c.key]);
    b.innerHTML =
      `<span class="t-name">${c.name}</span>` +
      `<span class="t-desc">${c.tab}</span>` +
      `<span class="t-count">${count}</span>`;
    b.addEventListener("click", () => { state.activeCat = c.key; render(); });
    el.appendChild(b);
  });
}

function renderPanel() {
  const c = catMeta(state.activeCat);
  const panel = document.getElementById("panel");
  panel.style.setProperty("--cat", CAT_COLOR[c.key]);
  panel.style.setProperty("--cat-soft", CAT_SOFT[c.key]);
  document.getElementById("pTitle").textContent = c.name + "デート";
  document.getElementById("pDesc").textContent = "— " + c.desc;
  document.getElementById("addInput").placeholder = c.name + "で行きたい場所は？";

  const active = state.spots.filter(s => s.category === c.key && !s.visited);
  const done = state.spots.filter(s => s.category === c.key && s.visited);

  const list = document.getElementById("spotList");
  list.innerHTML = "";
  active.forEach(s => list.appendChild(spotRow(s, false)));

  const doneWrap = document.getElementById("doneWrap");
  const doneList = document.getElementById("doneList");
  doneList.innerHTML = "";
  if (done.length) {
    doneWrap.hidden = false;
    done.forEach(s => doneList.appendChild(spotRow(s, true)));
  } else {
    doneWrap.hidden = true;
  }

  document.getElementById("emptyNote").hidden = (active.length + done.length) > 0;
}

function spotRow(s, isDone) {
  const li = document.createElement("li");
  li.className = "spot" + (isDone ? " done" : "");

  const dot = document.createElement("span"); dot.className = "dot"; li.appendChild(dot);
  const txt = document.createElement("span"); txt.className = "txt"; txt.textContent = s.text; li.appendChild(txt);
  const by = document.createElement("span"); by.className = "by"; by.textContent = s.addedBy; li.appendChild(by);

  const toggle = document.createElement("button");
  toggle.className = "act";
  toggle.title = isDone ? "リストに戻す" : "行った！にする";
  toggle.setAttribute("aria-label", toggle.title);
  toggle.textContent = isDone ? "↩" : "✓";
  toggle.addEventListener("click", () => updateSpot(s.id, { visited: !s.visited }));
  li.appendChild(toggle);

  const del = document.createElement("button");
  del.className = "act"; del.title = "削除"; del.setAttribute("aria-label", "削除"); del.textContent = "✕";
  del.addEventListener("click", () => {
    if (window.confirm(`「${s.text}」を削除する？`)) removeSpot(s.id);
  });
  li.appendChild(del);
  return li;
}

function renderLastPick() {
  const el = document.getElementById("lastPick");
  const p = state.lastPick;
  if (!p || !p.text) { el.hidden = true; return; }
  el.hidden = false;
  const cName = catMeta(p.category).name;
  el.innerHTML = `🎯 前回のルーレット： <b>${escapeHtml(p.text)}</b>（${cName}${p.by ? " / " + escapeHtml(p.by) + "が回した" : ""}）`;
}

function render() {
  document.getElementById("allScope").checked = state.allScope;
  renderTabs();
  renderPanel();
  renderLastPick();
  if (!state.spinning) drawWheel(wheelRot);
  updateSpinAvailability();
}

function updateSpinAvailability() {
  const pool = poolFor(state.allScope, state.activeCat);
  document.getElementById("spinBtn").disabled = state.spinning || pool.length < 1;
  const empty = document.getElementById("wheelEmpty");
  if (pool.length === 0) {
    empty.hidden = false;
    empty.textContent = state.allScope
      ? "行きたい場所を追加するとルーレットが回せるよ"
      : catMeta(state.activeCat).name + "の場所を追加してね";
  } else {
    empty.hidden = true;
  }
}

/* ---------- ルーレット ---------- */
let wheelRot = 0;

function getVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#ccc";
}
function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  r = Math.round(r + (255 - r) * amt);
  g = Math.round(g + (255 - g) * amt);
  b = Math.round(b + (255 - b) * amt);
  return `rgb(${r},${g},${b})`;
}

function drawWheel(rot) {
  const cv = document.getElementById("wheel");
  const ctx = cv.getContext("2d");
  const W = cv.width, cx = W / 2, R = W / 2 - 6;
  ctx.clearRect(0, 0, W, W);

  const pool = poolFor(state.allScope, state.activeCat);
  const n = pool.length;

  ctx.save();
  ctx.translate(cx, cx);
  ctx.rotate(rot);

  if (n === 0) {
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fillStyle = getVar("--card-2"); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = getVar("--line"); ctx.stroke();
    ctx.restore();
    return;
  }

  const seg = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a0 = i * seg;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, R, a0, a0 + seg);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? CAT_COLOR[pool[i].category] : shade(CAT_COLOR[pool[i].category], 0.16);
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = "rgba(255,255,255,.55)"; ctx.stroke();

    ctx.save();
    ctx.rotate(a0 + seg / 2);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    const fs = n > 14 ? 15 : n > 9 ? 18 : 21;
    ctx.font = `700 ${fs}px 'Zen Maru Gothic', sans-serif`;
    let label = pool[i].text;
    const maxChars = n > 14 ? 6 : n > 9 ? 9 : 12;
    if (label.length > maxChars) label = label.slice(0, maxChars - 1) + "…";
    ctx.shadowColor = "rgba(0,0,0,.22)"; ctx.shadowBlur = 3; ctx.shadowOffsetY = 1;
    ctx.fillText(label, R - 16, 0);
    ctx.restore();
  }

  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
  ctx.lineWidth = 5; ctx.strokeStyle = getVar("--card"); ctx.stroke();
  ctx.restore();
}

function spin() {
  if (state.spinning) return;
  const pool = poolFor(state.allScope, state.activeCat);
  if (pool.length < 1) return;
  if (pool.length === 1) { finishSpin(pool, 0); return; }

  state.spinning = true;
  updateSpinAvailability();

  const n = pool.length;
  const seg = (Math.PI * 2) / n;
  const target = Math.floor(Math.random() * n);
  const segCenter = target * seg + seg / 2;
  const pointer = -Math.PI / 2;
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (reduce) {
    wheelRot = pointer - segCenter;
    drawWheel(wheelRot);
    finishSpin(pool, target);
    return;
  }

  const turns = 5 + Math.floor(Math.random() * 4);
  const startRot = wheelRot % (Math.PI * 2);
  let finalRot = pointer - segCenter + turns * Math.PI * 2;
  while (finalRot < startRot + turns * Math.PI) finalRot += Math.PI * 2;

  const dur = 4200;
  const t0 = performance.now();
  function frame(now) {
    const p = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - p, 4);
    wheelRot = startRot + (finalRot - startRot) * e;
    drawWheel(wheelRot);
    if (p < 1) requestAnimationFrame(frame);
    else { wheelRot = finalRot; drawWheel(wheelRot); finishSpin(pool, target); }
  }
  requestAnimationFrame(frame);
}

function finishSpin(pool, idx) {
  state.spinning = false;
  const spot = pool[idx];
  if (!spot) { updateSpinAvailability(); return; }
  setLastPick({ text: spot.text, category: spot.category, by: state.name || "", at: Date.now() });
  showResult(spot);
  updateSpinAvailability();
}

/* ---------- 結果モーダル ---------- */
function showResult(spot) {
  const c = catMeta(spot.category);
  const ov = document.createElement("div");
  ov.className = "overlay";
  const box = document.createElement("div");
  box.className = "result";
  box.style.setProperty("--cat", CAT_COLOR[spot.category]);
  box.style.setProperty("--cat-soft", CAT_SOFT[spot.category]);
  box.innerHTML =
    `<div class="tag">${c.name} / ${c.desc}</div>` +
    `<div class="headline">今回のデートは…</div>` +
    `<div class="name">${escapeHtml(spot.text)}</div>` +
    `<div class="by">${escapeHtml(spot.addedBy)} が追加した場所</div>` +
    `<div class="row">` +
      `<button class="btn" data-act="again">もう一回</button>` +
      `<button class="btn primary" data-act="go">ここに決めた！</button>` +
    `</div>`;
  ov.appendChild(box);
  document.body.appendChild(ov);
  confetti();

  const close = () => ov.remove();
  ov.addEventListener("click", (ev) => { if (ev.target === ov) close(); });
  box.querySelector('[data-act="again"]').addEventListener("click", () => { close(); setTimeout(spin, 120); });
  box.querySelector('[data-act="go"]').addEventListener("click", () => { updateSpot(spot.id, { visited: true }); close(); });
}

function confetti() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const cols = ["#e0912f", "#3f9d8f", "#c9557b", "#6a3fa0", "#ff7a59"];
  for (let i = 0; i < 28; i++) {
    const d = document.createElement("div");
    d.className = "confetti";
    d.style.background = cols[i % cols.length];
    d.style.left = (50 + (Math.random() * 40 - 20)) + "vw";
    d.style.top = "40vh";
    document.body.appendChild(d);
    const dx = (Math.random() * 2 - 1) * 240;
    const dy = -(120 + Math.random() * 220);
    const rot = Math.random() * 720 - 360;
    d.animate(
      [
        { transform: "translate(0,0) rotate(0)", opacity: 1 },
        { transform: `translate(${dx}px,${dy + 520}px) rotate(${rot}deg)`, opacity: 0 },
      ],
      { duration: 1100 + Math.random() * 700, easing: "cubic-bezier(.15,.6,.4,1)" }
    ).onfinish = () => d.remove();
  }
}

/* ---------- イベント ---------- */
document.getElementById("addBtn").addEventListener("click", () => {
  const inp = document.getElementById("addInput");
  addSpot(inp.value, state.activeCat);
  inp.value = ""; inp.focus();
});
document.getElementById("addInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") { addSpot(e.target.value, state.activeCat); e.target.value = ""; }
});
document.getElementById("spinBtn").addEventListener("click", spin);
document.getElementById("allScope").addEventListener("change", (e) => {
  state.allScope = e.target.checked; render();
});
document.getElementById("editName").addEventListener("click", () => askName(false));

let resizeRaf;
window.addEventListener("resize", () => {
  cancelAnimationFrame(resizeRaf);
  resizeRaf = requestAnimationFrame(() => { if (!state.spinning) drawWheel(wheelRot); });
});
const darkMq = window.matchMedia("(prefers-color-scheme: dark)");
darkMq.addEventListener("change", () => { if (!state.spinning) drawWheel(wheelRot); });

start();
