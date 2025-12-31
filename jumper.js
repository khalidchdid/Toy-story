(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const lastScoreEl = document.getElementById("lastScore");
  const bestScoreEl = document.getElementById("bestScore");
  const distEl = document.getElementById("dist");

  const BG = "#0b0f14";
  const FG = "#e7edf6";
  const MUTED = "#9aa7b5";

  let mode = "menu"; // menu | playing | gameover
  let lastT = performance.now();

  let score = 0;
  let lastScore = 0;
  let best = Number(localStorage.getItem("jumperBest") || 0);

  const input = { pressed: false };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function setBest(v) {
    best = v;
    localStorage.setItem("jumperBest", String(best));
    bestScoreEl.textContent = String(best);
  }

  function formatScore(n) {
    return String(Math.max(0, Math.floor(n))).padStart(5, "0");
  }

  function setScore(v) {
    score = v;
    distEl.textContent = formatScore(score);
    if (Math.floor(score) > best) setBest(Math.floor(score));
  }

  function showOverlay(show) {
    overlay.classList.toggle("hidden", !show);
    lastScoreEl.textContent = String(Math.floor(lastScore));
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

  function isPortrait() {
    const rect = canvas.getBoundingClientRect();
    return rect.height > rect.width;
  }

  // Rotate overlay (never blocks Start)
  let rotateOverlay = document.getElementById("rotateOverlay");
  function ensureRotateOverlay() {
    if (!rotateOverlay) {
      rotateOverlay = document.createElement("div");
      rotateOverlay.id = "rotateOverlay";
      document.body.appendChild(rotateOverlay);
    }
    rotateOverlay.style.position = "fixed";
    rotateOverlay.style.inset = "0";
    rotateOverlay.style.zIndex = "10";
    rotateOverlay.style.display = "none";
    rotateOverlay.style.alignItems = "center";
    rotateOverlay.style.justifyContent = "center";
    rotateOverlay.style.background = "rgba(11,15,20,0.75)";
    rotateOverlay.style.color = FG;
    rotateOverlay.style.fontFamily =
      "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
    rotateOverlay.style.pointerEvents = "none";

    rotateOverlay.innerHTML = `
      <div style="
        width:min(420px,92vw);
        background:rgba(255,255,255,0.08);
        border:1px solid rgba(255,255,255,0.14);
        border-radius:18px;
        padding:18px;
        backdrop-filter: blur(14px);
        text-align:center;">
        <div style="font-size:22px;font-weight:950;">Rotate your phone</div>
        <div style="margin-top:10px;color:${MUTED};font-weight:700;font-size:13px;">
          Jumper is best in landscape mode.
        </div>
      </div>`;
  }

  // Pixel sprites
  function pxSize() { return Math.max(2, Math.floor(canvas.height / 180)); }

  function drawPixels(map, x, y, scale, color) {
    ctx.fillStyle = color;
    for (let j = 0; j < map.length; j++) {
      const row = map[j];
      for (let i = 0; i < row.length; i++) {
        if (row[i] === "X") ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
      }
    }
  }

  const DINO_A = [
    "....XXXXXX....",
    "...XXXXXXXX...",
    "..XXXXXXXXXX..",
    "..XXX..XXXXXX.",
    "..XXX..XXXXXX.",
    "..XXXXXXXXXX..",
    "..XXXXXXXX....",
    "...XXXXXX.....",
    "....XXXX......",
    "....XXXX......",
    "....XXXX......",
    "....XXXX......",
    "...XX..XX.....",
    "..XX....XX....",
    "..............",
  ];

  const DINO_B = [
    "....XXXXXX....",
    "...XXXXXXXX...",
    "..XXXXXXXXXX..",
    "..XXX..XXXXXX.",
    "..XXX..XXXXXX.",
    "..XXXXXXXXXX..",
    "..XXXXXXXX....",
    "...XXXXXX.....",
    "....XXXX......",
    "....XXXX......",
    "....XXXX......",
    "....XXXX......",
    "..XX..XX......",
    "...XX..XX.....",
    "..............",
  ];

  const CACTUS_SMALL = [
    "...XX....",
    "...XX....",
    ".XXXXXX..",
    "...XX....",
    "...XX....",
    "...XX....",
    ".XXXXXX..",
    "...XX....",
    "...XX....",
    "...XX....",
  ];

  const CACTUS_BIG = [
    "....XX.....",
    "....XX.....",
    "..XXXXXX...",
    "....XX.....",
    "....XX..XX.",
    "....XXXXXX.",
    "....XX..XX.",
    "..XXXXXX...",
    "....XX.....",
    "....XX.....",
    "....XX.....",
    "..XXXXXX...",
  ];

  const CACTUS_DOUBLE = [
    "....XX......XX....",
    "....XX......XX....",
    "..XXXXXX..XXXXXX..",
    "....XX......XX....",
    "....XX......XX....",
    "....XX......XX....",
    "..XXXXXX..XXXXXX..",
    "....XX......XX....",
    "....XX......XX....",
    "....XX......XX....",
  ];

  // World
  let world;

  function resetWorld() {
    const W = canvas.width, H = canvas.height;
    const px = pxSize();

    const groundY = Math.floor(H * 0.78);
    const groundThickness = Math.max(px * 2, Math.floor(H * 0.012));

    world = {
      W, H, px,
      groundY,
      groundThickness,

      // ✅ Harder start + quicker rhythm (but still fair)
      speed: Math.max(220, W * 0.26),
      accel: 9.5,

      // ✅ Your chosen jump feel
      gravity: Math.max(2400, H * 4.0),
      jumpV: Math.max(820, H * 1.35),
      holdBoost: 0.24,
      maxHold: 0.09,

      runner: {
        x: Math.floor(W * 0.14),
        y: groundY,
        vy: 0,
        onGround: true,
        holdT: 0,
        animT: 0,
        frame: 0,
        scale: px,
      },

      obstacles: [],
      spawnT: 0,
      nextSpawn: 1.05,
      lastGap: 0,

      clouds: [],
      cloudT: 0,

      bumps: [],
      bumpT: 0,
    };

    for (let i = 0; i < 3; i++) spawnCloud(true);
    setScore(0);
  }

  function spawnCloud(initial = false) {
    const H = world.H, W = world.W;
    const y = Math.floor(H * (0.18 + Math.random() * 0.25));
    const s = 0.6 + Math.random() * 1.1;
    const x = initial ? Math.random() * W : W + 80 + Math.random() * 120;
    world.clouds.push({ x, y, s });
  }

  function spawnBump() {
    const x = world.W + 40 + Math.random() * 140;
    const w = 22 + Math.random() * 40;
    const h = 4 + Math.random() * 10;
    world.bumps.push({ x, w, h });
  }

  // ✅ Variable frequency: mixture of short/medium/long gaps + anti-repetition
  function computeNextSpawn() {
    const speedFactor = clamp(520 / world.speed, 0.70, 1.10);

    // mixture distribution (unpredictable rhythm)
    const r = Math.random();
    let base;
    if (r < 0.22) {
      // short gap (hard)
      base = 0.70 + Math.random() * 0.28; // 0.70..0.98
    } else if (r < 0.80) {
      // medium gap
      base = 0.95 + Math.random() * 0.55; // 0.95..1.50
    } else {
      // long gap (breather)
      base = 1.45 + Math.random() * 0.70; // 1.45..2.15
    }

    // jitter so it doesn't feel periodic
    base *= (0.88 + Math.random() * 0.28); // 0.88..1.16

    // anti-repeat: if too close to previous, push it away
    if (world.lastGap > 0 && Math.abs(base - world.lastGap) < 0.12) {
      base *= (Math.random() < 0.5 ? 0.78 : 1.28);
    }

    const gap = clamp(base * speedFactor, 0.55, 2.0);
    world.lastGap = gap;
    return gap;
  }

  // ✅ max 2 cacti, a bit taller (slightly), can differ in height when 2
  function spawnObstacle() {
    const W = world.W;

    const count = Math.random() < 0.70 ? 1 : 2;
    const gap = Math.max(world.px * 3, Math.floor(world.W * 0.008));

    const cacti = [];
    let dx = 0;

    for (let k = 0; k < count; k++) {
      // slightly more "big" cacti as speed grows (challenge ramps naturally)
      const speed01 = clamp((world.speed - 220) / 600, 0, 1);
      const r = Math.random();

      let map = CACTUS_SMALL;
      if (r > (0.62 - 0.10 * speed01)) map = CACTUS_BIG;      // more likely as speed increases
      if (r > (0.93 - 0.04 * speed01)) map = CACTUS_DOUBLE;   // still rare

      // height scale bumped a bit (NOT too much)
      const heightScale = 0.98 + Math.random() * 0.58; // 0.98..1.56 (slightly taller than before)
      const scale = Math.max(1, Math.floor(world.px * heightScale));

      const w = map[0].length * scale;
      const h = map.length * scale;

      cacti.push({ dx, map, scale, w, h, y: world.groundY - h });
      dx += w + gap;
    }

    world.obstacles.push({ x: W + 30, cacti, right: dx });

    world.nextSpawn = computeNextSpawn();
    world.spawnT = 0;
  }

  function aabbHit(a, b) {
    return (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y);
  }

  function jump() {
    const r = world.runner;
    if (!r.onGround) return;
    r.onGround = false;
    r.vy = -world.jumpV;
    r.holdT = 0;
  }

  function gameOver() {
    lastScore = score;
    if (Math.floor(lastScore) > best) setBest(Math.floor(lastScore));
    mode = "gameover";
    showOverlay(true);
  }

  // Input
  canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "playing") return;
    e.preventDefault();
    input.pressed = true;
    jump();
  }, { passive: false });
  canvas.addEventListener("pointerup", () => { input.pressed = false; });
  canvas.addEventListener("pointercancel", () => { input.pressed = false; });

  function update(dt) {
    // Speed ramps (quicker rhythm over time)
    world.speed += world.accel * dt;

    // Score increases with survival time
    setScore(score + dt * (world.speed / 105));

    // Clouds
    world.cloudT += dt;
    if (world.cloudT > 1.15) {
      world.cloudT = 0;
      if (Math.random() < 0.78) spawnCloud(false);
    }
    for (const c of world.clouds) c.x -= (world.speed * 0.18) * dt;
    world.clouds = world.clouds.filter(c => c.x > -200);

    // Ground bumps
    world.bumpT += dt;
    if (world.bumpT > 0.50) {
      world.bumpT = 0;
      if (Math.random() < 0.9) spawnBump();
    }
    for (const b of world.bumps) b.x -= world.speed * dt;
    world.bumps = world.bumps.filter(b => b.x + b.w > -80);

    // Obstacles
    world.spawnT += dt;
    if (world.obstacles.length === 0 && world.spawnT > 0.40) spawnObstacle();
    if (world.spawnT >= world.nextSpawn) spawnObstacle();

    for (const g of world.obstacles) g.x -= world.speed * dt;
    world.obstacles = world.obstacles.filter(g => g.x + g.right > -160);

    // Runner physics + animation
    const r = world.runner;

    if (r.onGround) {
      r.animT += dt;
      const stepRate = clamp(world.speed / 420, 0.95, 2.0);
      if (r.animT > (0.14 / stepRate)) {
        r.animT = 0;
        r.frame = 1 - r.frame;
      }
    } else {
      r.frame = 0;
    }

    if (input.pressed && !r.onGround && r.holdT < world.maxHold && r.vy < 0) {
      r.vy -= world.gravity * world.holdBoost * dt;
      r.holdT += dt;
    }

    r.vy += world.gravity * dt;
    r.y += r.vy * dt;

    if (r.y >= world.groundY) {
      r.y = world.groundY;
      r.vy = 0;
      r.onGround = true;
    }

    // Collision
    const dinoMap = (r.frame === 0 ? DINO_A : DINO_B);
    const dinoW = dinoMap[0].length * r.scale;
    const dinoH = dinoMap.length * r.scale;
    const runnerBox = { x: r.x, y: r.y - dinoH, w: dinoW, h: dinoH };

    for (const g of world.obstacles) {
      for (const c of g.cacti) {
        const box = { x: g.x + c.dx, y: c.y, w: c.w, h: c.h };
        if (aabbHit(runnerBox, box)) { gameOver(); return; }
      }
    }
  }

  function drawCloud(x, y, s) {
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = FG;
    ctx.lineWidth = Math.max(2, Math.floor(world.px * 0.8));
    ctx.beginPath();
    const w = 40 * s;
    const h = 16 * s;
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + w * 0.2, y - h, x + w * 0.55, y - h, x + w * 0.62, y);
    ctx.bezierCurveTo(x + w * 0.7, y - h * 0.3, x + w, y - h * 0.3, x + w, y);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    ctx.imageSmoothingEnabled = false;
    const W = world.W, H = world.H;

    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // dino-like score text (in addition to HUD)
    ctx.save();
    ctx.fillStyle = FG;
    ctx.globalAlpha = 0.9;
    ctx.font = `${Math.max(14, Math.floor(H * 0.045))}px ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillText(formatScore(score), W - 18, 12);
    ctx.restore();

    for (const c of world.clouds) drawCloud(c.x, c.y, c.s);

    // ground
    ctx.fillStyle = FG;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(0, world.groundY, W, world.groundThickness);

    // bumps
    ctx.globalAlpha = 0.35;
    for (const b of world.bumps) ctx.fillRect(b.x, world.groundY - b.h, b.w, world.px);
    ctx.globalAlpha = 1.0;

    // obstacles
    for (const g of world.obstacles) {
      for (const c of g.cacti) {
        drawPixels(c.map, Math.floor(g.x + c.dx), Math.floor(c.y), c.scale, FG);
      }
    }

    // dino
    const r = world.runner;
    const dinoMap = (r.frame === 0 ? DINO_A : DINO_B);
    const dinoH = dinoMap.length * r.scale;
    drawPixels(dinoMap, Math.floor(r.x), Math.floor(r.y - dinoH), r.scale, FG);
  }

  function loop(now) {
    resizeCanvasToDisplaySize();
    ensureRotateOverlay();

    const portrait = isPortrait();
    rotateOverlay.style.display = (portrait && mode === "playing") ? "flex" : "none";

    if (!world || world.W !== canvas.width || world.H !== canvas.height) resetWorld();

    const dt = Math.min(0.02, (now - lastT) / 1000);
    lastT = now;

    if (!portrait && mode === "playing") update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  function startGame(e) {
    if (e) e.preventDefault();
    resetWorld();
    mode = "playing";
    showOverlay(false);
  }

  // robust start binding (iPhone PWA safe)
  const delegated = (e) => { if (e.target && e.target.id === "startBtn") startGame(e); };
  overlay.addEventListener("click", delegated, { passive: false });
  overlay.addEventListener("touchend", delegated, { passive: false });
  overlay.addEventListener("pointerup", delegated, { passive: false });

  if (startBtn) {
    startBtn.addEventListener("click", startGame, { passive: false });
    startBtn.addEventListener("touchend", startGame, { passive: false });
    startBtn.addEventListener("pointerup", startGame, { passive: false });
  }

  // init
  setBest(best);
  setScore(0);
  showOverlay(true);
  requestAnimationFrame(loop);
})();
