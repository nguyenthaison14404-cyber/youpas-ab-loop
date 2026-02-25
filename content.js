(() => {
  // ===== Helpers =====
  const fmt = (sec) => {
    if (!isFinite(sec) || sec < 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const isValidDuration = (d) => isFinite(d) && d > 0;

  function findActiveMedia() {
    const medias = Array.from(document.querySelectorAll("audio, video"));
    if (!medias.length) return null;
    const playing = medias.find((m) => !m.paused && !m.ended && m.readyState >= 2);
    return playing || medias[0];
  }

  function pctFromTime(t, d) {
    if (!isValidDuration(d)) return 0;
    return clamp((t / d) * 100, 0, 100);
  }

  function timeFromPct(p, d) {
    if (!isValidDuration(d)) return 0;
    return clamp((p / 100) * d, 0, d);
  }

  // ===== Icons (SVG) =====
  const Icons = {
    play: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 5v14l11-7z"></path>
      </svg>`,
    pause: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 5h4v14H7z"></path>
        <path d="M13 5h4v14h-4z"></path>
      </svg>`,
    rewind: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 19l-9-7 9-7v14z"></path>
        <path d="M22 19l-9-7 9-7v14z"></path>
      </svg>`,
    forward: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M13 5l9 7-9 7V5z"></path>
        <path d="M2 5l9 7-9 7V5z"></path>
      </svg>`,
    speaker: `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M11 5L6 9H3v6h3l5 4z"></path>
        <path d="M15.5 8.5a4 4 0 0 1 0 7"></path>
        <path d="M18 6a7 7 0 0 1 0 12"></path>
      </svg>`
  };

  // ===== State =====
  let media = null;
  let A = null;
  let B = null;
  let loop = true;

  let timer = null;
  let isPlaying = false;
  let dragging = null; // "A" | "B" | null

  // ===== UI: main box =====
  const box = document.createElement("div");
  box.id = "abloop-box";
  box.innerHTML = `
    <div class="top">
      <div class="title">
        <span id="abloop-badge" class="abloop-badge"></span>
        <span>A–B Loop</span>
      </div>
      <button id="ab-min" class="abloop-iconbtn" title="Thu nhỏ">–</button>
    </div>

    <div class="row">
      <button id="ab-setA">Set A</button>
      <button id="ab-setB">Set B</button>
      <button id="ab-clear">Clear</button>
    </div>

    <div class="row" style="justify-content:space-between;">
      <div class="mono">A: <b id="ab-a">--:--</b></div>
      <div class="mono">B: <b id="ab-b">--:--</b></div>
    </div>

    <div class="row" style="justify-content:space-between;">
      <label style="display:flex;align-items:center;gap:8px;">
        <input id="ab-loop" type="checkbox" checked />
        Loop
      </label>
      <div class="mono"><span id="ab-cur">--:--</span></div>
    </div>

    <div class="row" id="abloop-transport">
      <button id="ab-back" class="abloop-icbtn" title="Lùi 5s">
        ${Icons.rewind}
      </button>

      <button id="ab-play" class="abloop-icbtn" title="Play/Pause">
        <span id="ab-play-icon">${Icons.play}</span>
      </button>

      <button id="ab-forward" class="abloop-icbtn" title="Tới 5s">
       ${Icons.forward}
      </button>
    </div>

    <div class="abloop-card" style="margin-top:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <b>Loop Range</b>
        <small class="mono" id="ab-dur" style="color:rgba(31,41,55,0.65)">dur: --:--</small>
      </div>

      <div id="abloop-bar" title="Click to seek / Drag A-B handles">
        <div id="abloop-fill"></div>
        <div id="abloop-range"></div>
        <div id="abloop-cursor"></div>
        <div class="abloop-handle abloop-handleA" id="abloop-handleA" title="Drag A"></div>
        <div class="abloop-handle abloop-handleB" id="abloop-handleB" title="Drag B"></div>
      </div>

      <div id="abloop-time-row" class="mono">
        <div>0: <b id="ab-t0">00:00</b></div>
        <div>cur: <b id="ab-tc">--:--</b></div>
        <div>end: <b id="ab-t1">--:--</b></div>
      </div>
    </div>

    <div class="abloop-card" style="margin-top:10px;">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <b>Speed</b>
        <span class="mono" id="ab-rate">1.00x</span>
      </div>
      <input id="ab-speed" type="range" min="0.5" max="2" step="0.05" value="1" />
      <div class="row">
        <button id="ab-slow">−</button>
        <button id="ab-reset">Reset</button>
        <button id="ab-fast">+</button>
      </div>
    </div>
  `;
  document.documentElement.appendChild(box);

  // ensure badge has correct styles even if page CSS conflicts
  const badge = box.querySelector("#abloop-badge");
  badge.style.width = "10px";
  badge.style.height = "10px";
  badge.style.borderRadius = "999px";
  badge.style.background = "#68d7c3";
  badge.style.boxShadow = "0 0 0 6px rgba(104, 215, 195, 0.22)";

  // ===== Mini bubble (speaker icon) =====
  const mini = document.createElement("div");
  mini.id = "abloop-mini";
  mini.innerHTML = Icons.speaker;
  document.documentElement.appendChild(mini);

  function minimize() {
    box.style.display = "none";
    mini.style.display = "flex";
  }

  function restore() {
    mini.style.display = "none";
    box.style.display = "block";
  }

  box.querySelector("#ab-min").addEventListener("click", minimize);
  mini.addEventListener("click", restore);

  minimize();

  // ===== Refs =====
  const elA = box.querySelector("#ab-a");
  const elB = box.querySelector("#ab-b");
  const elCur = box.querySelector("#ab-cur");
  const elLoop = box.querySelector("#ab-loop");

  const btnPlay = box.querySelector("#ab-play");
  const btnBack = box.querySelector("#ab-back");
  const btnForward = box.querySelector("#ab-forward");

  const elPlayIcon = box.querySelector("#ab-play-icon");
  const elPlayLabel = box.querySelector("#ab-play-label");

  const elSpeed = box.querySelector("#ab-speed");
  const elRate = box.querySelector("#ab-rate");

  const elDur = box.querySelector("#ab-dur");
  const elFill = box.querySelector("#abloop-fill");
  const elRange = box.querySelector("#abloop-range");
  const elCursor = box.querySelector("#abloop-cursor");
  const elHandleA = box.querySelector("#abloop-handleA");
  const elHandleB = box.querySelector("#abloop-handleB");
  const elBar = box.querySelector("#abloop-bar");

  const elT0 = box.querySelector("#ab-t0");
  const elTC = box.querySelector("#ab-tc");
  const elT1 = box.querySelector("#ab-t1");

  // ===== UI Update =====
  function updatePlayButton() {
    if (isPlaying) {
      elPlayIcon.innerHTML = Icons.pause;
      btnPlay.title = "Pause";
    } else {
      elPlayIcon.innerHTML = Icons.play;
      btnPlay.title = "Play";
    }
  }

  function updateTimeline() {
    if (!media) {
      elDur.textContent = "dur: --:--";
      elFill.style.width = "0%";
      elRange.style.display = "none";
      elCursor.style.left = "0%";
      elHandleA.style.display = "none";
      elHandleB.style.display = "none";
      elT0.textContent = "00:00";
      elTC.textContent = "--:--";
      elT1.textContent = "--:--";
      return;
    }

    const d = media.duration;
    const cur = media.currentTime || 0;
    const hasDur = isValidDuration(d);

    elDur.textContent = hasDur ? `dur: ${fmt(d)}` : "dur: --:--";
    elT0.textContent = "00:00";
    elTC.textContent = fmt(cur);
    elT1.textContent = hasDur ? fmt(d) : "--:--";

    if (hasDur) {
      const curPct = pctFromTime(cur, d);
      elFill.style.width = curPct + "%";
      elCursor.style.left = curPct + "%";
    } else {
      elFill.style.width = "0%";
      elCursor.style.left = "0%";
    }

    // A/B handles (display must be block to override CSS display:none)
    if (A != null) {
      elHandleA.style.display = "block";
      elHandleA.style.left = hasDur ? pctFromTime(A, d) + "%" : "0%";
    } else {
      elHandleA.style.display = "none";
    }

    if (B != null) {
      elHandleB.style.display = "block";
      elHandleB.style.left = hasDur ? pctFromTime(B, d) + "%" : "0%";
    } else {
      elHandleB.style.display = "none";
    }

    if (hasDur && A != null && B != null && B > A) {
      const left = pctFromTime(A, d);
      const right = pctFromTime(B, d);
      elRange.style.display = "block";
      elRange.style.left = left + "%";
      elRange.style.width = Math.max(0, right - left) + "%";
    } else {
      elRange.style.display = "none";
    }
  }

  function updateUI() {
    elA.textContent = A == null ? "--:--" : fmt(A);
    elB.textContent = B == null ? "--:--" : fmt(B);
    elLoop.checked = loop;

    if (media) {
      elCur.textContent = fmt(media.currentTime || 0);
      elRate.textContent = (media.playbackRate || 1).toFixed(2) + "x";
      elSpeed.value = String(media.playbackRate || 1);
      btnBack.disabled = false;
      btnForward.disabled = false;
      btnPlay.disabled = false;
    } else {
      elCur.textContent = "--:--";
      elRate.textContent = "—";
      btnBack.disabled = true;
      btnForward.disabled = true;
      btnPlay.disabled = true;
    }

    updatePlayButton();
    updateTimeline();
  }

  // ===== Loop rule (only while playing) =====
  function enforceLoopIfPlaying() {
    if (!media) return;
    if (!isPlaying) return;
    if (!loop || A == null || B == null || !(B > A)) return;

    const t = media.currentTime || 0;
    const eps = 0.02;

    if (t < A - eps || t > B + eps) {
      media.currentTime = A;
      return;
    }
    if (t >= B - eps) media.currentTime = A;
  }

  function startTicker() {
    if (timer) clearInterval(timer);
    timer = setInterval(() => {
      if (!media) return;

      isPlaying = !media.paused && !media.ended;
      updatePlayButton();

      elCur.textContent = fmt(media.currentTime || 0);
      elRate.textContent = (media.playbackRate || 1).toFixed(2) + "x";

      updateTimeline();
      enforceLoopIfPlaying();
    }, 120);
  }

  // ===== Attach =====
  function attach() {
    media = findActiveMedia();
    if (!media) {
      updateUI();
      return;
    }

    media.playbackRate = Number(elSpeed.value);

    media.addEventListener("loadedmetadata", () => updateUI());
    media.addEventListener("play", () => { isPlaying = true; enforceLoopIfPlaying(); updateUI(); });
    media.addEventListener("pause", () => { isPlaying = false; updateUI(); });
    media.addEventListener("seeking", () => updateUI());

    startTicker();
    updateUI();
  }

  // ===== Actions =====
  function setMarkA() { if (!media) attach(); if (media) { A = media.currentTime || 0; updateUI(); } }
  function setMarkB() { if (!media) attach(); if (media) { B = media.currentTime || 0; updateUI(); } }
  function clearMarks() { A = null; B = null; updateUI(); }

  function jump(seconds) {
    if (!media) attach();
    if (!media) return;
    const d = media.duration;
    const next = (media.currentTime || 0) + seconds;
    media.currentTime = isValidDuration(d) ? clamp(next, 0, d) : Math.max(0, next);
    updateUI();
  }

  async function togglePlay() {
    if (!media) attach();
    if (!media) return;

    if (media.paused) {
      if (loop && A != null && B != null && B > A) {
        const t = media.currentTime || 0;
        if (t < A || t > B) media.currentTime = A;
      }
      await media.play();
    } else {
      media.pause();
    }
  }

  function seekByClientX(clientX) {
    if (!media) attach();
    if (!media) return;

    const d = media.duration;
    if (!isValidDuration(d)) return;

    const rect = elBar.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const pct = (x / rect.width) * 100;
    const t = timeFromPct(pct, d);

    if (!isPlaying) {
      media.currentTime = t;
    } else {
      if (loop && A != null && B != null && B > A) {
        media.currentTime = (t < A || t > B) ? A : t;
      } else {
        media.currentTime = t;
      }
    }
    updateUI();
  }

  // Drag handles
  function beginDrag(which, e) {
    if (!media) attach();
    if (!media) return;
    const d = media.duration;
    if (!isValidDuration(d)) return;

    dragging = which;
    e.preventDefault();
  }

  function updateDrag(clientX) {
    if (!dragging || !media) return;
    const d = media.duration;
    if (!isValidDuration(d)) return;

    const rect = elBar.getBoundingClientRect();
    const x = clamp(clientX - rect.left, 0, rect.width);
    const pct = (x / rect.width) * 100;
    const t = timeFromPct(pct, d);

    if (dragging === "A") {
      A = t;
      if (B != null && A >= B) A = Math.max(0, B - 0.05);
    } else {
      B = t;
      if (A != null && B <= A) B = Math.min(d, A + 0.05);
    }
    updateUI();
  }

  function endDrag() { dragging = null; }

  // ===== Events =====
  box.querySelector("#ab-setA").addEventListener("click", setMarkA);
  box.querySelector("#ab-setB").addEventListener("click", setMarkB);
  box.querySelector("#ab-clear").addEventListener("click", clearMarks);

  elLoop.addEventListener("change", () => { loop = elLoop.checked; enforceLoopIfPlaying(); updateUI(); });

  btnBack.addEventListener("click", () => jump(-5));
  btnForward.addEventListener("click", () => jump(5));
  btnPlay.addEventListener("click", togglePlay);

  elSpeed.addEventListener("input", () => {
    if (!media) attach();
    if (!media) return;
    media.playbackRate = Number(elSpeed.value);
    updateUI();
  });

  box.querySelector("#ab-slow").addEventListener("click", () => {
    if (!media) attach();
    if (!media) return;
    media.playbackRate = Math.max(0.5, Number((media.playbackRate - 0.1).toFixed(2)));
    updateUI();
  });

  box.querySelector("#ab-fast").addEventListener("click", () => {
    if (!media) attach();
    if (!media) return;
    media.playbackRate = Math.min(2.0, Number((media.playbackRate + 0.1).toFixed(2)));
    updateUI();
  });

  box.querySelector("#ab-reset").addEventListener("click", () => {
    if (!media) attach();
    if (!media) return;
    media.playbackRate = 1.0;
    updateUI();
  });

  elBar.addEventListener("click", (e) => { if (!dragging) seekByClientX(e.clientX); });

  elHandleA.addEventListener("mousedown", (e) => beginDrag("A", e));
  elHandleB.addEventListener("mousedown", (e) => beginDrag("B", e));
  window.addEventListener("mousemove", (e) => updateDrag(e.clientX));
  window.addEventListener("mouseup", endDrag);

  elHandleA.addEventListener("touchstart", (e) => beginDrag("A", e), { passive: false });
  elHandleB.addEventListener("touchstart", (e) => beginDrag("B", e), { passive: false });

  window.addEventListener("touchmove", (e) => {
    if (!dragging) return;
    const t = e.touches?.[0];
    if (t) updateDrag(t.clientX);
  }, { passive: false });

  window.addEventListener("touchend", endDrag);

  window.addEventListener("keydown", (e) => {
    const tag = e.target?.tagName?.toLowerCase?.() || "";
    if (tag === "input" || tag === "textarea") return;

    if (e.key === "[") setMarkA();
    if (e.key === "]") setMarkB();

    if (e.key.toLowerCase() === "l") {
      loop = !loop;
      elLoop.checked = loop;
      enforceLoopIfPlaying();
      updateUI();
    }

    if (e.code === "Space") { e.preventDefault(); togglePlay(); }
  });

  // ===== Boot =====
  attach();

  // SPA retry
  let tries = 0;
  const retry = setInterval(() => {
    tries++;
    if (media) { clearInterval(retry); return; }
    attach();
    if (tries >= 15) clearInterval(retry);
  }, 800);
})();
