(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const lastScoreEl = document.getElementById("lastScore");
  const bestScoreEl = document.getElementById("bestScore");
  const distEl = document.getElementById("dist");

  let mode = "menu";
  let lastT = performance.now();

  let distance = 0;
  let lastScore = 0;
  let best = Number(localStorage.getItem("jumperBest") || 0);
  const input = { pressed: false };

  function setBest(v) {
    best = v;
    localStorage.setItem("jumperBest", String(best));
    bestScoreEl.textContent = String(best);
  }
  function setDistance(v) {
    distance = v;
    const d = Math.floor(distance);
    distEl.textContent = String(d);
    if (d > best) setBest(d);
  }
  function showOverlay(show) {
    overlay.classList.toggle("hidden", !show);
    lastScoreEl.textContent = String(lastScore);
    bestScoreEl.textContent = String(best);
  }

  function resizeCanvasToDisplaySize() {
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    const rect = canvas.getBoundingClientRect();
    const w = Math.floor(rect.width * dpr);
    const h = Math.floor(rect.height * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  let world;

  function resetWorld() {
    const W = canvas.width, H = canvas.height;
    const groundY = Math.floor(H * 0.78);
    const groundThickness = Math.max(10, Math.floor(H * 0.016));

    world = {
      W, H,
      groundY,
      groundThickness,
      speed: Math.max(360, W * 0.55),
      accel: 12,
      gravity: Math.max(1800, H * 3.2),
      jumpV: Math.max(720, H * 1.25),
      holdBoost: 0.55,
      maxHold: 0.16,
      runner: {
        x: Math.floor(W * 0.18),
        y: groundY,
        w: Math.max(34, Math.floor(W * 0.05)),
        h: Math.max(42, Math.floor(H * 0.08)),
        vy: 0,
        onGround: true,
        jumpHold: 0
      },
      obstacles: [],
      spawnTimer: 0,
      nextSpawn: 0.9
    };

    setDistance(0);
  }

  function spawnObstacle() {
    const { W, groundY } = world;
    const baseW = Math.max(22, Math.floor(W * 0.03));
    const baseH = Math.max(35, Math.floor(world.H * 0.08));

    const w = baseW * (0.9 + Math.random() * 1.3);
    const h = baseH * (0.8 + Math.random() * 1.2);

    world.obstacles.push({ x: W + w + 10, y: groundY - h, w, h });

    const minGap = 0.65, maxGap = 1.25;
    world.nextSpawn = clamp((minGap + Math.random() * (maxGap - minGap)) * (420 / world.speed), 0.45, 1.2);
    world.spawnTimer = 0;
  }

  function aabbHit(a, b) {
    return (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
  }

  function jump() {
    const r = world.runner;
    if (!r.onGround) return;
    r.onGround = false;
    r.vy = -world.jumpV;
    r.jumpHold = 0;
  }

  function gameOver() {
    lastScore = Math.floor(distance);
    if (lastScore > best) setBest(lastScore);
    mode = "gameover";
    showOverlay(true);
  }

  canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "playing") return;
    e.preventDefault();
    input.pressed = true;
    jump();
  }, { passive: false });

  canvas.addEventListener("pointerup", () => { input.pressed = false; });
  canvas.addEventListener("pointercancel", () => { input.pressed = false; });

  function update(dt) {
    const { runner, gravity, groundY, maxHold, holdBoost } = world;

    world.speed += world.accel * dt;
    setDistance(distance + dt * (world.speed / 18));

    if (input.pressed && !runner.onGround && runner.jumpHold < maxHold && runner.vy < 0) {
      runner.vy -= gravity * holdBoost * dt;
      runner.jumpHold += dt;
    }

    runner.vy += gravity * dt;
    runner.y += runner.vy * dt;

    if (runner.y >= groundY) {
      runner.y = groundY;
      runner.vy = 0;
      runner.onGround = true;
    }

    world.spawnTimer += dt;
    if (world.obstacles.length === 0 && world.spawnTimer > 0.35) spawnObstacle();
    if (world.spawnTimer >= world.nextSpawn) spawnObstacle();

    for (const ob of world.obstacles) ob.x -= world.speed * dt;
    world.obstacles = world.obstacles.filter(ob => ob.x + ob.w > -80);

    const runnerBox = { x: runner.x, y: runner.y - runner.h, w: runner.w, h: runner.h };
    for (const ob of world.obstacles) {
      if (aabbHit(runnerBox, ob)) { gameOver(); break; }
    }
  }

  function roundRect(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw() {
    const { W, H, groundY, groundThickness, runner, obstacles } = world;

    ctx.fillStyle = "#0b0f14";
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "#e7edf6";
    ctx.fillRect(0, groundY, W, groundThickness);

    ctx.fillStyle = "#e7edf6";
    roundRect(runner.x, runner.y - runner.h, runner.w, runner.h, Math.max(6, Math.floor(runner.w * 0.25)));
    ctx.fill();

    for (const ob of obstacles) {
      roundRect(ob.x, ob.y, ob.w, ob.h, Math.max(4, Math.floor(ob.w * 0.2)));
      ctx.fill();
    }
  }

  function loop(now) {
    resizeCanvasToDisplaySize();
    if (!world || world.W !== canvas.width || world.H !== canvas.height) resetWorld();

    const dt = Math.min(0.02, (now - lastT) / 1000);
    lastT = now;

    if (mode === "playing") update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  function startGame(e) {
    if (e) e.preventDefault();
    resetWorld();
    mode = "playing";
    showOverlay(false);
  }
  ["click", "pointerup", "touchend"].forEach((ev) => {
    startBtn.addEventListener(ev, startGame, { passive: false });
  });

  setBest(best);
  showOverlay(true);
  requestAnimationFrame(loop);
})();
