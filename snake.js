(() => {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");

  const overlay = document.getElementById("overlay");
  const startBtn = document.getElementById("startBtn");
  const lastScoreEl = document.getElementById("lastScore");
  const bestScoreEl = document.getElementById("bestScore");
  const scoreEl = document.getElementById("score");

  const BG = "#0b0f14";
  const FG = "#e7edf6";
  const MUTED = "#9aa7b5";

  // Snake colors (still fits Toy story palette)
  const SNAKE = "#22c55e";
  const FOOD = "#ef4444";

  let mode = "menu"; // menu | playing | gameover
  let lastScore = 0;
  let best = Number(localStorage.getItem("snakeBest") || 0);

  function setBest(v) {
    best = v;
    localStorage.setItem("snakeBest", String(best));
    bestScoreEl.textContent = String(best);
  }

  function formatScore(n) {
    return String(Math.max(0, Math.floor(n))).padStart(5, "0");
  }

  function setScore(n) {
    scoreEl.textContent = formatScore(n);
    if (n > best) setBest(n);
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
  function randInt(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }

  // ---- Game state ----
  let field, grid, snake, dir, nextDir, food, score;

  // Constant speed (moves per second)
  const MOVES_PER_SEC = 8; // tweak if you want 7/9 etc.
  const STEP_MS = 1000 / MOVES_PER_SEC;

  let accMs = 0;
  let lastT = performance.now();

  // Create a centered rectangle playfield to avoid rounded corners
  function computeField() {
    const W = canvas.width;
    const H = canvas.height;

  // keep safe margins from rounded corners
    const marginX = Math.floor(W * 0.10);
    const marginY = Math.floor(H * 0.14);

    const maxW = W - 2 * marginX;
    const maxH = H - 2 * marginY;

  // "divide the length by two" = half the width
    const fw = maxW;
    const fh = Math.floor(maxH / 2);

  // center it
    const fx = Math.floor((W - fw) / 2);
    const fy = Math.floor((H - fh) / 2);

    return { x: fx, y: fy, w: fw, h: fh };
  }

  // Choose grid size based on field size and a comfortable cell size
  function computeGrid(field) {
    // aim for cell size between 18 and 28 device pixels (in canvas pixels)
    let cell = Math.floor(Math.min(field.w / 22, field.h / 14));
    cell = Math.floor(cell * 1.35);     // ~×1.3–×1.4 bigger squares
    cell = clamp(cell, 22, 46);

    // cols/rows fit inside field
    const cols = Math.floor(field.w / cell);
    const rows = Math.floor(field.h / cell);

    // recenter grid inside field
    const gw = cols * cell;
    const gh = rows * cell;
    const gx = Math.floor(field.x + (field.w - gw) / 2);
    const gy = Math.floor(field.y + (field.h - gh) / 2);

    return { x: gx, y: gy, w: gw, h: gh, cols, rows, cell };
  }

  function resetGame() {
    field = computeField();
    grid = computeGrid(field);

    score = 0;
    setScore(score);

    // start snake in middle
    const cx = Math.floor(grid.cols / 2);
    const cy = Math.floor(grid.rows / 2);

    snake = [
      { x: cx - 1, y: cy },
      { x: cx, y: cy },
      { x: cx + 1, y: cy },
    ];

    dir = { x: 1, y: 0 };
    nextDir = { x: 1, y: 0 };

    food = spawnFood();

    accMs = 0;
  }

  function cellKey(p) { return `${p.x},${p.y}`; }

  function spawnFood() {
    const occupied = new Set(snake.map(cellKey));
    for (let tries = 0; tries < 5000; tries++) {
      const x = randInt(0, grid.cols - 1);
      const y = randInt(0, grid.rows - 1);
      const k = `${x},${y}`;
      if (!occupied.has(k)) return { x, y };
    }
    // fallback (should never happen)
    return { x: 0, y: 0 };
  }

  function wrapCoord(v, max) {
    if (v < 0) return max - 1;
    if (v >= max) return 0;
    return v;
  }

  function isOpposite(a, b) {
    return a.x === -b.x && a.y === -b.y;
  }

  function step() {
    // apply queued direction (prevents reversing into yourself)
    if (!isOpposite(nextDir, dir)) dir = nextDir;

    const head = snake[snake.length - 1];
    let nx = head.x + dir.x;
    let ny = head.y + dir.y;

    // wrap-around
    nx = wrapCoord(nx, grid.cols);
    ny = wrapCoord(ny, grid.rows);

    const newHead = { x: nx, y: ny };

    // self collision (note: allow moving into the tail if it is going to move away)
    const willEat = (nx === food.x && ny === food.y);
    const tail = snake[0];

    for (let i = 0; i < snake.length; i++) {
      const s = snake[i];
      const isTail = (s.x === tail.x && s.y === tail.y);
      if (!willEat && isTail) continue; // tail moves away
      if (s.x === nx && s.y === ny) {
        gameOver();
        return;
      }
    }

    snake.push(newHead);

    if (willEat) {
      score += 1;
      setScore(score);
      food = spawnFood();
    } else {
      snake.shift(); // move forward
    }
  }

  function gameOver() {
    lastScore = score;
    if (lastScore > best) setBest(lastScore);
    mode = "gameover";
    showOverlay(true);
  }

  // ---- Drawing ----
  function drawCell(x, y, color, inset = 0) {
    const cs = grid.cell;
    const px = grid.x + x * cs + inset;
    const py = grid.y + y * cs + inset;
    const size = cs - 2 * inset;
    ctx.fillStyle = color;
    ctx.fillRect(px, py, size, size);
  }

  function draw() {
    // background
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // field border rectangle
    ctx.save();
    ctx.strokeStyle = FG;
    ctx.globalAlpha = 0.6;
    ctx.lineWidth = Math.max(4, Math.floor(grid.cell * 0.25));
    ctx.strokeRect(grid.x - ctx.lineWidth / 2, grid.y - ctx.lineWidth / 2, grid.w + ctx.lineWidth, grid.h + ctx.lineWidth);
    ctx.restore();

    // food
    drawCell(food.x, food.y, FOOD, Math.floor(grid.cell * 0.22));

    // snake
    const inset = Math.floor(grid.cell * 0.12);
    for (let i = 0; i < snake.length; i++) {
      const s = snake[i];
      drawCell(s.x, s.y, SNAKE, inset);
    }

    // head highlight
    const head = snake[snake.length - 1];
    drawCell(head.x, head.y, FG, Math.floor(grid.cell * 0.34));
  }

  // ---- Controls: swipe to turn ----
  let touchStart = null;

  function onPointerDown(e) {
    if (mode !== "playing") return;
    e.preventDefault();
    touchStart = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  function onPointerUp(e) {
    if (mode !== "playing") return;
    if (!touchStart) return;

    const dx = e.clientX - touchStart.x;
    const dy = e.clientY - touchStart.y;
    const adx = Math.abs(dx);
    const ady = Math.abs(dy);

    // require a minimum swipe distance
    const minSwipe = 18;
    if (Math.max(adx, ady) < minSwipe) {
      touchStart = null;
      return;
    }

    if (adx > ady) {
      // left/right
      nextDir = dx > 0 ? { x: 1, y: 0 } : { x: -1, y: 0 };
    } else {
      // up/down
      nextDir = dy > 0 ? { x: 0, y: 1 } : { x: 0, y: -1 };
    }

    touchStart = null;
  }

  canvas.addEventListener("pointerdown", onPointerDown, { passive: false });
  canvas.addEventListener("pointerup", onPointerUp, { passive: false });
  canvas.addEventListener("pointercancel", () => { touchStart = null; });

  // ---- Start (robust on iPhone) ----
  function startGame(e) {
    if (e) e.preventDefault();
    resetGame();
    mode = "playing";
    showOverlay(false);
  }

  const delegated = (e) => { if (e.target && e.target.id === "startBtn") startGame(e); };
  overlay.addEventListener("click", delegated, { passive: false });
  overlay.addEventListener("touchend", delegated, { passive: false });
  overlay.addEventListener("pointerup", delegated, { passive: false });

  if (startBtn) {
    startBtn.addEventListener("click", startGame, { passive: false });
    startBtn.addEventListener("touchend", startGame, { passive: false });
    startBtn.addEventListener("pointerup", startGame, { passive: false });
  }

  // ---- Loop ----
  function loop(now) {
    resizeCanvasToDisplaySize();

    // rebuild if orientation/size changes
    if (!grid || canvas.width !== (grid._cw || 0) || canvas.height !== (grid._ch || 0)) {
      // store last size
      // reset keeps game consistent; simplest + avoids misalignment
      resetGame();
      grid._cw = canvas.width;
      grid._ch = canvas.height;
      if (mode === "playing") {
        // keep playing after resize
      } else {
        // keep overlay visible if not playing
      }
    }

    const dtMs = now - lastT;
    lastT = now;

    if (mode === "playing") {
      accMs += dtMs;
      while (accMs >= STEP_MS) {
        step();
        accMs -= STEP_MS;
        if (mode !== "playing") break;
      }
    }

    draw();
    requestAnimationFrame(loop);
  }

  // init
  setBest(best);
  resetGame();
  showOverlay(true);
  requestAnimationFrame(loop);
})();
