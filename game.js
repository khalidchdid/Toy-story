(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  // HUD (only streak during play)
  const streakEl = document.getElementById("streak");

  // Overlay (start / game over)
  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const lastScoreEl = document.getElementById("lastScore");
  const bestScoreEl = document.getElementById("bestScore");

  // ---------- Scores / Mode ----------
  let mode = "menu"; // "menu" | "playing" | "gameover"
  let streak = 0;
  let lastScore = 0;
  let best = Number(localStorage.getItem("pongBest") || 0);

  function setBest(v) {
    best = v;
    localStorage.setItem("pongBest", String(best));
    bestScoreEl.textContent = String(best);
  }

  function setStreak(v) {
    streak = v;
    streakEl.textContent = String(streak);
    if (streak > best) setBest(streak);
  }

  function showOverlay(show) {
    overlay.classList.toggle("hidden", !show);
    lastScoreEl.textContent = String(lastScore);
    bestScoreEl.textContent = String(best);
  }

  // ---------- Canvas sizing ----------
  function resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const displayW = Math.floor(rect.width * dpr);
    const displayH = Math.floor(rect.height * dpr);
    if (canvas.width !== displayW || canvas.height !== displayH) {
      canvas.width = displayW;
      canvas.height = displayH;
    }
  }

  // ---------- Helpers ----------
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function makeGame() {
    const W = canvas.width;
    const H = canvas.height;

    const paddleW = Math.max(10, Math.floor(W * 0.012));
    const paddleH = Math.max(70, Math.floor(H * 0.16));
    const ballR = Math.max(6, Math.floor(Math.min(W, H) * 0.012));

    const player = {
      x: Math.floor(W * 0.06),
      y: Math.floor(H * 0.5 - paddleH * 0.5),
      w: paddleW,
      h: paddleH,
      speed: H * 1.1,
      targetY: null,
    };

    const ai = {
      x: Math.floor(W * 0.94 - paddleW),
      y: Math.floor(H * 0.5 - paddleH * 0.5),
      w: paddleW,
      h: paddleH,
      speed: H * 0.85,
      reaction: 0.12,
      reactTimer: 0,
      aimY: H * 0.5,
    };

    const ball = { x: W * 0.5, y: H * 0.5, vx: 0, vy: 0, r: ballR };

    return { W, H, paddleW, paddleH, ballR, player, ai, ball };
  }

  let state = null;

  function resetBall(towardsPlayer = false) {
    const { W, H, ball } = state;
    ball.x = W * 0.5;
    ball.y = H * 0.5;

    const dir = towardsPlayer ? -1 : Math.random() < 0.5 ? -1 : 1;
    const base = Math.max(W, H) * 0.45;
    const angle = Math.random() * 0.8 - 0.4;
    ball.vx = dir * base * (0.9 + Math.random() * 0.2);
    ball.vy = base * angle;
  }

  function newRound() {
    state = makeGame();
    setStreak(0);
    resetBall(false);

    // Ensure paddle starts centered
    state.player.y = Math.floor(state.H * 0.5 - state.player.h * 0.5);
    state.ai.y = Math.floor(state.H * 0.5 - state.ai.h * 0.5);
  }

  // ---------- Touch controls ----------
  function canvasToLocalY(clientY) {
    const rect = canvas.getBoundingClientRect();
    const y01 = (clientY - rect.top) / rect.height;
    return y01 * canvas.height;
  }

  let dragging = false;

  canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "playing") return;
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    state.player.targetY = canvasToLocalY(e.clientY);
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging || mode !== "playing") return;
    state.player.targetY = canvasToLocalY(e.clientY);
  });

  canvas.addEventListener("pointerup", () => {
    dragging = false;
    if (state) state.player.targetY = null;
  });

  // ---------- Collisions ----------
  function paddleCollision(p, ball) {
    const left = p.x - ball.r;
    const right = p.x + p.w + ball.r;
    const top = p.y - ball.r;
    const bottom = p.y + p.h + ball.r;
    return (
      ball.x >= left &&
      ball.x <= right &&
      ball.y >= top &&
      ball.y <= bottom
    );
  }

  function bounceOffPaddle(p, isPlayer) {
    const { ball, H } = state;

    if (isPlayer) ball.x = p.x + p.w + ball.r + 1;
    else ball.x = p.x - ball.r - 1;

    const center = p.y + p.h / 2;
    const rel = clamp((ball.y - center) / (p.h / 2), -1, 1);

    const speed = Math.hypot(ball.vx, ball.vy);
    const bonus = 1 + Math.min(0.35, streak * 0.01);
    const newSpeed = speed * (0.98 + 0.06 * bonus);

    const dir = isPlayer ? 1 : -1;
    const maxAngle = 1.05;
    const angle = rel * maxAngle;

    ball.vx = dir * newSpeed * Math.cos(angle);
    ball.vy = newSpeed * Math.sin(angle);

    const cap = H * 1.2;
    ball.vy = clamp(ball.vy, -cap, cap);
  }

  // ---------- Game logic ----------
  function gameOver() {
    lastScore = streak;
    if (lastScore > best) setBest(lastScore);
    mode = "gameover";
    showOverlay(true);
  }

  function update(dt) {
    const { W, H, player, ai, ball } = state;

    // Player follows touch target
    if (player.targetY != null) {
      const target = player.targetY - player.h / 2;
      const dy = target - player.y;
      const maxStep = player.speed * dt;
      player.y += clamp(dy, -maxStep, maxStep);
    }
    player.y = clamp(player.y, 0, H - player.h);

    // AI follows ball with lag + noise
    ai.reactTimer -= dt;
    if (ai.reactTimer <= 0) {
      ai.reactTimer = ai.reaction;
      const noise = (Math.random() - 0.5) * ai.h * 0.25;
      ai.aimY = ball.y + noise;
    }
    const aiTarget = ai.aimY - ai.h / 2;
    const aiDy = aiTarget - ai.y;
    const aiStep = ai.speed * dt;
    ai.y += clamp(aiDy, -aiStep, aiStep);
    ai.y = clamp(ai.y, 0, H - ai.h);

    // Ball
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;

    // Wall bounce (top/bottom)
    if (ball.y - ball.r <= 0) {
      ball.y = ball.r + 1;
      ball.vy *= -1;
    } else if (ball.y + ball.r >= H) {
      ball.y = H - ball.r - 1;
      ball.vy *= -1;
    }

    // Paddle collisions
    if (ball.vx < 0 && paddleCollision(player, ball)) {
      bounceOffPaddle(player, true);
      setStreak(streak + 1);
    } else if (ball.vx > 0 && paddleCollision(ai, ball)) {
      bounceOffPaddle(ai, false);
    }

    // Miss: player loses -> show overlay
    if (ball.x + ball.r < 0) {
      gameOver();
    } else if (ball.x - ball.r > W) {
      // AI misses: reward +2 and keep playing
      setStreak(streak + 2);
      resetBall(false);
    }
  }

  // ---------- Rendering ----------
  function draw() {
    const { W, H, player, ai, ball } = state;

    // Background
    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(0, 0, W, H);

    // TOP + BOTTOM borders (clear)
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = "#e7edf6";
    const borderH = Math.max(3, Math.floor(H * 0.006));
    ctx.fillRect(0, 0, W, borderH);
    ctx.fillRect(0, H - borderH, W, borderH);
    ctx.restore();

    // Center dashed line
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "#ffffff";
    const dashH = Math.max(10, Math.floor(H * 0.03));
    const gap = dashH;
    for (let y = 0; y < H; y += dashH + gap) {
      ctx.fillRect(W / 2 - 2, y, 4, dashH);
    }
    ctx.restore();

    // Paddles + ball
    ctx.fillStyle = "#e7edf6";
    ctx.fillRect(player.x, player.y, player.w, player.h);
    ctx.fillRect(ai.x, ai.y, ai.w, ai.h);

    ctx.beginPath();
    ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function loop(now) {
    resizeCanvasToDisplaySize();

    if (!state || state.W !== canvas.width || state.H !== canvas.height) {
      state = makeGame();
      resetBall(false);
    }

    const dt = Math.min(0.02, (now - last) / 1000);
    last = now;

    if (mode === "playing") update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  // ---------- Start handling (iPhone-friendly) ----------
  function startGame(e) {
    if (e) e.preventDefault();
    mode = "playing";
    showOverlay(false);
    newRound();
  }

  ["click", "pointerup", "touchend"].forEach((ev) => {
    startBtn.addEventListener(ev, startGame, { passive: false });
  });

  // ---------- Init ----------
  setBest(best);
  lastScore = 0;
  setStreak(0);

  state = makeGame();
  showOverlay(true); // show start screen immediately

  requestAnimationFrame(loop);
})();
