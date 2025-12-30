(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const streakEl = document.getElementById("streak");
  const bestEl = document.getElementById("best");
  const restartBtn = document.getElementById("restart");

  // Handle retina / resizing while keeping internal resolution consistent
  function resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const displayW = Math.floor(rect.width * dpr);
    const displayH = Math.floor(rect.height * dpr);
    if (canvas.width !== displayW || canvas.height !== displayH) {
      canvas.width = displayW;
      canvas.height = displayH;
    }
    return dpr;
  }

  // Game constants (scale with canvas)
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
      speed: H * 1.1, // px/sec
      targetY: null
    };

    const ai = {
      x: Math.floor(W * 0.94 - paddleW),
      y: Math.floor(H * 0.5 - paddleH * 0.5),
      w: paddleW,
      h: paddleH,
      speed: H * 0.85, // slower than player to keep it beatable
      reaction: 0.12,  // seconds "lag"
      reactTimer: 0,
      aimY: H * 0.5
    };

    const ball = {
      x: W * 0.5,
      y: H * 0.5,
      vx: 0,
      vy: 0,
      r: ballR
    };

    return { W, H, paddleW, paddleH, ballR, player, ai, ball };
  }

  let dpr = 1;
  let state = null;

  let streak = 0;
  let best = Number(localStorage.getItem("pongBest") || 0);

  function setBest(v) {
    best = v;
    localStorage.setItem("pongBest", String(best));
    bestEl.textContent = String(best);
  }

  function setStreak(v) {
    streak = v;
    streakEl.textContent = String(streak);
    if (streak > best) setBest(streak);
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function resetBall(towardsPlayer = false) {
    const { W, H, ball } = state;
    ball.x = W * 0.5;
    ball.y = H * 0.5;

    // Random serve direction
    const dir = towardsPlayer ? -1 : (Math.random() < 0.5 ? -1 : 1);
    const base = Math.max(W, H) * 0.45; // px/sec
    const angle = (Math.random() * 0.8 - 0.4); // -0.4..0.4 radians-ish
    ball.vx = dir * base * (0.9 + Math.random() * 0.2);
    ball.vy = base * angle;
  }

  function resetGame() {
    state = makeGame();
    setStreak(0);
    resetBall(false);
  }

  // Controls: keyboard + touch drag
  const keys = new Set();
  window.addEventListener("keydown", (e) => {
    const k = e.key.toLowerCase();
    if (["arrowup", "arrowdown", "w", "s"].includes(k)) e.preventDefault();
    keys.add(k);
  }, { passive: false });

  window.addEventListener("keyup", (e) => {
    keys.delete(e.key.toLowerCase());
  });

  function canvasToLocalY(clientY) {
    const rect = canvas.getBoundingClientRect();
    const y = (clientY - rect.top) / rect.height; // 0..1
    return y * canvas.height;
  }

  let dragging = false;
  canvas.addEventListener("pointerdown", (e) => {
    dragging = true;
    canvas.setPointerCapture(e.pointerId);
    const y = canvasToLocalY(e.clientY);
    state.player.targetY = y;
  });

  canvas.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const y = canvasToLocalY(e.clientY);
    state.player.targetY = y;
  });

  canvas.addEventListener("pointerup", () => {
    dragging = false;
    state.player.targetY = null;
  });

  restartBtn.addEventListener("click", resetGame);

  function paddleCollision(p, ball) {
    // AABB vs circle (approx): treat as rect expanded by radius
    const left = p.x - ball.r;
    const right = p.x + p.w + ball.r;
    const top = p.y - ball.r;
    const bottom = p.y + p.h + ball.r;

    if (ball.x >= left && ball.x <= right && ball.y >= top && ball.y <= bottom) {
      return true;
    }
    return false;
  }

  function bounceOffPaddle(p, isPlayer) {
    const { ball, H } = state;

    // Move ball outside paddle to avoid sticking
    if (isPlayer) ball.x = p.x + p.w + ball.r + 1;
    else ball.x = p.x - ball.r - 1;

    // Compute hit position (-1..1)
    const center = p.y + p.h / 2;
    const rel = clamp((ball.y - center) / (p.h / 2), -1, 1);

    // Increase speed slightly with streak
    const speed = Math.hypot(ball.vx, ball.vy);
    const bonus = 1 + Math.min(0.35, streak * 0.01); // up to +35%
    const newSpeed = speed * (0.98 + 0.06 * bonus);

    // New direction
    const dir = isPlayer ? 1 : -1;
    const maxAngle = 1.05; // radians
    const angle = rel * maxAngle;

    ball.vx = dir * newSpeed * Math.cos(angle);
    ball.vy = newSpeed * Math.sin(angle);

    // Cap vertical speed a bit (avoid too vertical)
    const cap = H * 1.2;
    ball.vy = clamp(ball.vy, -cap, cap);
  }

  function update(dt) {
    const { W, H, player, ai, ball } = state;

    // --- Player movement ---
    if (player.targetY != null) {
      const target = player.targetY - player.h / 2;
      const dy = target - player.y;
      const maxStep = player.speed * dt;
      player.y += clamp(dy, -maxStep, maxStep);
    } else {
      let dir = 0;
      if (keys.has("arrowup") || keys.has("w")) dir -= 1;
      if (keys.has("arrowdown") || keys.has("s")) dir += 1;
      player.y += dir * player.speed * dt;
    }
    player.y = clamp(player.y, 0, H - player.h);

    // --- AI movement (reacts with lag) ---
    ai.reactTimer -= dt;
    if (ai.reactTimer <= 0) {
      ai.reactTimer = ai.reaction;

      // Aim for ball y, but add some imperfection
      const noise = (Math.random() - 0.5) * ai.h * 0.25;
      ai.aimY = ball.y + noise;
    }

    const aiTarget = ai.aimY - ai.h / 2;
    const aiDy = aiTarget - ai.y;
    const aiStep = ai.speed * dt;
    ai.y += clamp(aiDy, -aiStep, aiStep);
    ai.y = clamp(ai.y, 0, H - ai.h);

    // --- Ball physics ---
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

    // Miss conditions
    if (ball.x + ball.r < 0) {
      // Player missed -> streak resets, serve again
      setStreak(0);
      resetBall(false);
    } else if (ball.x - ball.r > W) {
      // AI missed -> give player a reward: +2 streak and serve back toward AI
      setStreak(streak + 2);
      resetBall(false);
    }
  }

  function draw() {
  const { W, H, player, ai, ball } = state;

  // Background (IMPORTANT: set fillStyle before fillRect)
  ctx.fillStyle = "#0b0f14";
  ctx.fillRect(0, 0, W, H);

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

  if (streak === 0) {
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.font = `${Math.floor(H * 0.035)}px system-ui`;
    ctx.textAlign = "center";
    ctx.fillText("Return the ball — your streak is your score.", W / 2, H * 0.80);
    ctx.restore();
  }
}

  // Main loop
  let last = performance.now();
  function loop(now) {
    dpr = resizeCanvasToDisplaySize();
    // Recreate state if canvas size changes drastically
    if (!state || state.W !== canvas.width || state.H !== canvas.height) {
      const prevBest = best;
      const prevStreak = streak;
      state = makeGame();
      setBest(prevBest);
      setStreak(prevStreak);
      resetBall(false);
    }

    const dt = Math.min(0.02, (now - last) / 1000); // cap dt for stability
    last = now;

    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  // Init
  bestEl.textContent = String(best);
  streakEl.textContent = "0";
  resetGame();
  requestAnimationFrame(loop);
})();
