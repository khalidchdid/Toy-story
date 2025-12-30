(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const lastScoreEl = document.getElementById("lastScore");
  const bestScoreEl = document.getElementById("bestScore");
  const distEl = document.getElementById("dist");

  // Optional rotate overlay (we'll create it from JS if not present)
  let rotateOverlay = document.getElementById("rotateOverlay");

  const BG = "#0b0f14";
  const FG = "#e7edf6";
  const MUTED = "#9aa7b5";

  let mode = "menu"; // menu | playing | gameover
  let lastT = performance.now();

  let score = 0;
  let lastScore = 0;
  let best = Number(localStorage.getItem("jumperBest") || 0);

  const input = { pressed: false };

  function setBest(v) {
    best = v;
    localStorage.setItem("jumperBest", String(best));
    bestScoreEl.textContent = String(best);
  }

  function formatScore(n) {
    const s = String(Math.max(0, Math.floor(n)));
    return s.padStart(5, "0");
  }

  function setScore(v) {
    score = v;
    const s = formatScore(score);
    distEl.textContent = s;
    if (Math.floor(score) > best) setBest(Math.floor(score));
  }

  function showOverlay(show) {
    overlay.classList.toggle("hidden", !show);
    lastScoreEl.textContent = String(Math.floor(lastScore));
    bestScoreEl.textContent = String(best);
  }

  function ensureRotateOverlay() {
    if (rotateOverlay) return;
    rotateOverlay = document.createElement("div");
    rotateOverlay.id = "rotateOverlay";
    rotateOverlay.style.position = "fixed";
    rotateOverlay.style.inset = "0";
    rotateOverlay.style.zIndex = "10";
    rotateOverlay.style.display = "none";
    rotateOverlay.style.alignItems = "center";
    rotateOverlay.style.justifyContent = "center";
    rotateOverlay.style.background = "rgba(11,15,20,0.75)";
    rotateOverlay.style.color = FG;
    rotateOverlay.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial";
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
    document.body.appendChild(rotateOverlay);
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

  // --- Pixel helpers (for dino/cactus style) ---
  function pxSize() {
    // pixel block size in canvas pixels
    return Math.max(2, Math.floor(canvas.height / 180));
  }

  function drawPixels(map, x, y, scale, color) {
    ctx.fillStyle = color;
    for (let j = 0; j < map.length; j++) {
      const row = map[j];
      for (let i = 0; i < row.length; i++) {
        if (row[i] === "X") ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
      }
    }
  }

  // Two simple running frames (pixel-ish)
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

  // --- World ---
  let world;

  function resetWorld() {
    const W = canvas.width, H = canvas.height;
    const px = pxSize();

    // Landscape feels best when ground is higher and play area wide
    const groundY = Math.floor(H * 0.78);
    const groundThickness = Math.max(px * 2, Math.floor(H * 0.012));

    world = {
      W, H, px,
      groundY,
      groundThickness,

      speed: Math.max(220, W * 0.28), // much slower start
      accel: 10,                      // gentle ramp,                        // ramps speed over time

      gravity: Math.max(2600, H * 4.4),   // stronger gravity = less float
      jumpV: Math.max(560, H * 0.95),     // smaller jump impulse = lower jump
      holdBoost: 0.22,                    // holding helps a bit, not too much
      maxHold: 0.08,                      // shorter hold window

      runner: {
        x: Math.floor(W * 0.14),
        y: groundY,
        vy: 0,
        onGround: true,
        holdT: 0,
        animT: 0,
        frame: 0,
        // pixel sprite size
        scale: px,
      },

      obstacles: [],
      spawnT: 0,
      nextSpawn: 0.9,

      clouds: [],
      cloudT: 0,

      // slight ground bumps
      bumps: [],
      bumpT: 0,
    };

    // initial clouds
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

  function spawnObstacle() {
    const W = world.W;

  // How many cacti in the group: 1..4
    const countRoll = Math.random();
    const count = countRoll < 0.60 ? 1 : countRoll < 0.82 ? 2 : countRoll < 0.94 ? 3 : 4;

  // Base spacing between cacti (in pixels)
    const baseGap = Math.max(world.px * 2, Math.floor(world.W * 0.006));

    const cacti = [];
    let dx = 0;
    let groupRight = 0;

    for (let k = 0; k < count; k++) {
    // pick a shape
      const r = Math.random();
      let map = CACTUS_SMALL;
      if (r > 0.72) map = CACTUS_BIG;
      if (r > 0.90) map = CACTUS_DOUBLE; // rare (wider)

    // random height: scale factor (affects both width & height slightly, but height more via map choice)
    // keep it subtle like real game
      const heightScale = 0.85 + Math.random() * 0.55; // 0.85..1.40
      const scale = Math.max(1, Math.floor(world.px * heightScale));

      const w = map[0].length * scale;
      const h = map.length * scale;

    // place cactus with its own size
      cacti.push({
        dx,
        y: world.groundY - h,
        w,
        h,
        map,
        scale,
      });

      dx += w + baseGap;
      groupRight = dx;
    }

  world.obstacles.push({
    x: W + 30,
    cacti,
    right: groupRight, // total width for offscreen removal
  });

  // spawn gap depends on speed (slower start => larger gaps)
  const speed = world.speed;
  const baseMin = 0.85, baseMax = 1.55;
  const speedFactor = clamp(520 / speed, 0.65, 1.25);
  world.nextSpawn = clamp((baseMin + Math.random() * (baseMax - baseMin)) * speedFactor, 0.55, 1.8);
  world.spawnT = 0;
}
  function aabbHit(a, b) {
    return (
      a.x < b.x + b.w &&
      a.x + a.w > b.x &&
      a.y < b.y + b.h &&
      a.y + a.h > b.y
    );
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

  // Landscape enforcement (pause in portrait)
  function isPortrait() {
    const rect = canvas.getBoundingClientRect();
    return rect.height > rect.width; // portrait
  }

  function update(dt) {
    // speed ramps up
    world.speed += world.accel * dt;

    // score grows with survival time (scaled so it looks like the dino counter)
    setScore(score + dt * (world.speed / 90));

    // clouds
    world.cloudT += dt;
    if (world.cloudT > 1.25) {
      world.cloudT = 0;
      if (Math.random() < 0.75) spawnCloud(false);
    }
    for (const c of world.clouds) c.x -= (world.speed * 0.18) * dt;
    world.clouds = world.clouds.filter(c => c.x > -200);

    // ground bumps
    world.bumpT += dt;
    if (world.bumpT > 0.55) {
      world.bumpT = 0;
      if (Math.random() < 0.9) spawnBump();
    }
    for (const b of world.bumps) b.x -= world.speed * dt;
    world.bumps = world.bumps.filter(b => b.x + b.w > -80);

    // obstacles spawn
    world.spawnT += dt;
    if (world.obstacles.length === 0 && world.spawnT > 0.35) spawnObstacle();
    if (world.spawnT >= world.nextSpawn) spawnObstacle();

    for (const ob of world.obstacles) ob.x -= world.speed * dt;
    world.obstacles = world.obstacles.filter(ob => ob.x + ob.w > -120);

    // runner physics
    const r = world.runner;

    // run animation (only when on ground)
    if (r.onGround) {
      r.animT += dt;
      const stepRate = clamp(world.speed / 520, 0.8, 1.8);
      if (r.animT > (0.14 / stepRate)) {
        r.animT = 0;
        r.frame = 1 - r.frame;
      }
    } else {
      r.frame = 0;
    }

    // hold to jump higher early in jump
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

    // collisions
    const dinoMap = (r.frame === 0 ? DINO_A : DINO_B);
    const dinoW = dinoMap[0].length * r.scale;
    const dinoH = dinoMap.length * r.scale;

    const runnerBox = {
      x: r.x,
      y: r.y - dinoH,
      w: dinoW,
      h: dinoH,
    };

    for (const ob of world.obstacles) {
      if (aabbHit(runnerBox, ob)) {
        gameOver();
        break;
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

    // background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);

    // score top-right like dino
    ctx.save();
    ctx.fillStyle = FG;
    ctx.globalAlpha = 0.9;
    ctx.font = `${Math.max(14, Math.floor(H * 0.045))}px ui-monospace, Menlo, Monaco, Consolas, "Courier New", monospace`;
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    // HUD already shows it, but this makes it look like the real game
    ctx.fillText(formatScore(score), W - Math.floor(18 * (window.devicePixelRatio || 1)), Math.floor(12 * (window.devicePixelRatio || 1)));
    ctx.restore();

    // clouds
    for (const c of world.clouds) drawCloud(c.x, c.y, c.s);

    // ground line
    ctx.fillStyle = FG;
    ctx.globalAlpha = 0.75;
    ctx.fillRect(0, world.groundY, W, world.groundThickness);

    // tiny ground dots (like dino)
    ctx.globalAlpha = 0.18;
    const dotY = world.groundY + world.groundThickness + world.px * 2;
    for (let x = 0; x < W; x += world.px * 6) {
      if (Math.random() < 0.35) ctx.fillRect(x, dotY + (Math.random() * world.px * 2), world.px, world.px);
    }

    // bumps
    ctx.globalAlpha = 0.35;
    for (const b of world.bumps) {
      ctx.fillRect(b.x, world.groundY - b.h, b.w, world.px);
    }
    ctx.globalAlpha = 1.0;

    // obstacles
    for (const ob of world.obstacles) {
      drawPixels(ob.map, Math.floor(ob.x), Math.floor(ob.y), ob.scale, FG);
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

    // show rotate overlay in portrait and pause updates
    const portrait = isPortrait();
    rotateOverlay.style.display = portrait ? "flex" : "none";

    // rebuild world on resize
    if (!world || world.W !== canvas.width || world.H !== canvas.height) {
      resetWorld();
    }

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

  ["click", "pointerup", "touchend"].forEach((ev) => {
    startBtn.addEventListener(ev, startGame, { passive: false });
  });

  // init
  setBest(best);
  setScore(0);
  showOverlay(true);
  requestAnimationFrame(loop);
})();
