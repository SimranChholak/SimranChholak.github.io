/* ============================================================
   DRAGONFLY — a banded-demoiselle style dragonfly drawn in code.
   • Flies in short darts and hovers, in any direction.
   • Wanders the empty space, sometimes over the images.
   • Never lets the cursor touch it — it darts away.
   • If it is near a corner when the cursor stops, it flies to the
     nearest side and sits there in side profile.
   ============================================================ */
(() => {
  const canvas = document.getElementById('dragonfly');
  const ctx = canvas.getContext('2d');
  const stageEl = document.getElementById('stage');

  let W = 0, H = 0, DPR = 1, S = 70;           // S = body length in px
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = innerWidth; H = innerHeight;
    canvas.width = W * DPR; canvas.height = H * DPR;
    S = Math.max(52, Math.min(92, Math.min(W, H) * 0.085));
  }
  resize();
  addEventListener('resize', resize);

  /* ---------- tuning ---------- */
  const IDLE_MS = 1100;          // cursor counts as "stopped" after this
  const FLEE_R = () => S * 2.0;  // cursor closer than this → fly away
  const TOP_SAFE = 110;          // keep wandering below the top bar
  const MARGIN = 40;

  /* ---------- helpers ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const lerp = (a, b, t) => a + (b - a) * t;
  function stageRect() {
    const r = stageEl.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }

  /* ---------- cursor ---------- */
  const mouse = { x: -9999, y: -9999, lastMove: -99999, seen: false };
  function onMove(e) {
    const p = e.touches ? e.touches[0] : e;
    mouse.x = p.clientX; mouse.y = p.clientY;
    mouse.lastMove = performance.now(); mouse.seen = true;
  }
  addEventListener('mousemove', onMove, { passive: true });
  addEventListener('touchstart', onMove, { passive: true });
  addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('mouseleave', () => { mouse.x = mouse.y = -9999; });

  /* ---------- the dragonfly ---------- */
  const df = {
    x: rand(W * 0.15, W * 0.3), y: rand(H * 0.6, H * 0.8),
    vx: 0, vy: 0,
    heading: -Math.PI / 4,
    state: 'hover',        // hover | dart | land | perch | takeoff
    timer: 0.6,
    tx: 0, ty: 0,           // dart target
    speed: 420,
    view: 0,               // 0 = top view (flying), 1 = side view (perched)
    perch: null,           // { x, y, rot, flip }
    perchCooldown: 0,
    wingPhase: 0,
    clap: 0, clapT: rand(2, 5),
    t: 0,
    wasIdle: false,
  };

  function farFromCursor(x, y) {
    return Math.hypot(x - mouse.x, y - mouse.y) > FLEE_R() * 1.8;
  }

  function pickTarget() {
    const st = stageRect();
    for (let i = 0; i < 30; i++) {
      let x, y;
      if (Math.random() < 0.3) {          // sometimes over the images
        x = rand(st.x + st.w * 0.15, st.x + st.w * 0.85);
        y = rand(st.y + st.h * 0.15, st.y + st.h * 0.85);
      } else {                             // empty space
        x = rand(MARGIN, W - MARGIN);
        y = rand(TOP_SAFE, H - MARGIN);
        const pad = 30;
        if (x > st.x - pad && x < st.x + st.w + pad && y > st.y - pad && y < st.y + st.h + pad) continue;
      }
      const d = Math.hypot(x - df.x, y - df.y);
      if (d < 90 || d > Math.max(W, H) * 0.55) continue;   // short-ish darts
      if (!farFromCursor(x, y)) continue;
      return { x, y };
    }
    return { x: clamp(W - df.x, MARGIN, W - MARGIN), y: clamp(rand(TOP_SAFE, H - MARGIN), TOP_SAFE, H - MARGIN) };
  }

  function startDart(x, y, speed) {
    df.tx = x; df.ty = y;
    df.speed = speed || rand(320, 520);
    df.state = 'dart';
  }

  function flee() {
    // dart directly away from the cursor, with a bit of sideways randomness
    const a = Math.atan2(df.y - mouse.y, df.x - mouse.x) + rand(-0.6, 0.6);
    const dist = rand(180, 300);
    let x = clamp(df.x + Math.cos(a) * dist, MARGIN, W - MARGIN);
    let y = clamp(df.y + Math.sin(a) * dist, TOP_SAFE * 0.6, H - MARGIN);
    // if cornered, slip out sideways
    if (Math.hypot(x - mouse.x, y - mouse.y) < FLEE_R() * 1.4) {
      const b = a + (Math.random() < 0.5 ? 1.6 : -1.6);
      x = clamp(df.x + Math.cos(b) * dist, MARGIN, W - MARGIN);
      y = clamp(df.y + Math.sin(b) * dist, TOP_SAFE * 0.6, H - MARGIN);
    }
    if (df.state === 'perch' || df.state === 'land') takeoff();
    startDart(x, y, rand(650, 850));
    df.perchCooldown = 2.5;
  }

  function nearCorner() {
    const cx = df.x < W * 0.28 || df.x > W * 0.72;
    const cy = df.y < H * 0.32 || df.y > H * 0.68;
    return cx && cy;
  }

  function choosePerch() {
    const options = [
      { d: df.x, x: 1, y: clamp(df.y, TOP_SAFE + 20, H - 60), rot: Math.PI / 2, flip: -1 },       // left wall
      { d: W - df.x, x: W - 1, y: clamp(df.y, TOP_SAFE + 20, H - 60), rot: -Math.PI / 2, flip: 1 }, // right wall
      { d: H - df.y, x: clamp(df.x, 80, W - 80), y: H - 1, rot: 0, flip: df.x > W / 2 ? -1 : 1 },  // bottom
    ];
    options.sort((a, b) => a.d - b.d);
    return options[0];
  }

  function goPerch() {
    const p = choosePerch();
    // approach point a little away from the wall
    let ax = p.x, ay = p.y;
    if (p.rot > 0.1) ax += S * 0.9;            // left wall → approach from the right
    else if (p.rot < -0.1) ax -= S * 0.9;      // right wall → approach from the left
    else ay -= S * 0.9;                         // bottom → approach from above
    df.perch = p;
    startDart(ax, ay, rand(380, 480));
    df.state = 'toPerch';
  }

  function takeoff() {
    df.state = 'hover';
    df.timer = 0.05;
    df.perch = null;
  }

  /* ---------- update ---------- */
  function update(dt, now) {
    df.t += dt;
    const idle = now - mouse.lastMove > IDLE_MS;
    const cursorD = Math.hypot(df.x - mouse.x, df.y - mouse.y);
    df.perchCooldown = Math.max(0, df.perchCooldown - dt);

    // 1. never let the cursor touch it
    if (mouse.seen && cursorD < FLEE_R()) {
      if (!(df.state === 'dart' && df.speed > 600)) flee();
    }

    // 2. cursor just stopped: if near a corner, go sit on the nearest side
    if (idle && !df.wasIdle && (df.state === 'hover' || df.state === 'dart') && nearCorner() && df.perchCooldown <= 0) {
      goPerch();
    }
    df.wasIdle = idle;

    switch (df.state) {
      case 'hover': {
        df.vx *= Math.pow(0.02, dt); df.vy *= Math.pow(0.02, dt);
        // tiny hovering drift
        df.vx += Math.sin(df.t * 7.3) * 30 * dt;
        df.vy += Math.cos(df.t * 5.1) * 30 * dt;
        df.timer -= dt;
        if (df.timer <= 0) {
          // while wandering idle, sometimes decide to rest if near a corner
          if (idle && nearCorner() && df.perchCooldown <= 0 && Math.random() < 0.35) { goPerch(); break; }
          if (farFromCursor(df.tx, df.ty)) startDart(df.tx, df.ty);
          else { const t = pickTarget(); startDart(t.x, t.y); }
        } else {
          // turn to face the next direction slowly while hovering
          const want = Math.atan2(df.ty - df.y, df.tx - df.x);
          df.heading += angDiff(df.heading, want) * Math.min(1, dt * 1.5);
        }
        break;
      }
      case 'dart':
      case 'toPerch': {
        const dx = df.tx - df.x, dy = df.ty - df.y;
        const d = Math.hypot(dx, dy);
        const want = Math.atan2(dy, dx);
        df.heading += angDiff(df.heading, want) * Math.min(1, dt * 9);
        const sp = df.speed * clamp(d / 120, 0.15, 1);
        const ax = (Math.cos(df.heading) * sp - df.vx) * Math.min(1, dt * 6);
        const ay = (Math.sin(df.heading) * sp - df.vy) * Math.min(1, dt * 6);
        df.vx += ax; df.vy += ay;
        if (d < 14) {
          if (df.state === 'toPerch' && df.perch) { df.state = 'land'; df.timer = 0; }
          else { df.state = 'hover'; df.timer = rand(0.35, 1.6); const t = pickTarget(); df.tx = t.x; df.ty = t.y; }
        }
        break;
      }
      case 'land': {
        const p = df.perch;
        df.timer += dt;
        const k = Math.min(1, dt * 5);
        df.x = lerp(df.x, p.x, k); df.y = lerp(df.y, p.y, k);
        df.vx = df.vy = 0;
        if (df.timer > 0.45) { df.state = 'perch'; df.timer = rand(7, 14); }
        break;
      }
      case 'perch': {
        df.vx = df.vy = 0;
        df.timer -= dt;
        // fly off on its own after a while, or when the cursor starts moving nearby
        const cursorActive = !idle && cursorD < FLEE_R() * 3;
        if (df.timer <= 0 || cursorActive) {
          takeoff();
          df.perchCooldown = 4;
          const t = pickTarget();
          startDart(t.x, t.y);
        }
        break;
      }
    }

    if (df.state !== 'land' && df.state !== 'perch') {
      df.x += df.vx * dt; df.y += df.vy * dt;
      df.x = clamp(df.x, 10, W - 10); df.y = clamp(df.y, 10, H - 10);
    }

    // blend between flying (top) and sitting (side) drawings
    const wantView = (df.state === 'perch' || (df.state === 'land' && df.timer > 0.15)) ? 1 : 0;
    df.view += (wantView - df.view) * Math.min(1, dt * 10);

    // wing speed: fast in flight, still when sitting
    df.wingPhase += dt * (df.state === 'dart' || df.state === 'toPerch' ? 62 : 48);

    // occasional slow wing "clap" when sitting, like real demoiselles
    df.clapT -= dt;
    if (df.clapT <= 0) { df.clap = 1; df.clapT = rand(2.5, 6); }
    df.clap = Math.max(0, df.clap - dt * 1.4);
  }

  /* ---------- drawing ---------- */
  function bodyGrad(x0, y0, x1, y1, t) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    const s = Math.sin(t) * 6;
    g.addColorStop(0, `hsl(${182 + s}, 80%, 40%)`);
    g.addColorStop(0.45, `hsl(${196 + s}, 88%, 27%)`);
    g.addColorStop(1, `hsl(${212 + s}, 80%, 14%)`);
    return g;
  }

  // a single demoiselle wing pointing along +x from (0,0), length l, width w
  function wingPath(l, w) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(l * 0.25, -w * 0.18, l * 0.55, -w * 0.62, l * 0.82, -w * 0.55);
    ctx.bezierCurveTo(l * 1.02, -w * 0.48, l * 1.03, w * 0.32, l * 0.84, w * 0.42);
    ctx.bezierCurveTo(l * 0.6, w * 0.5, l * 0.25, w * 0.2, 0, 0);
    ctx.closePath();
  }

  function drawWing(l, w, alpha, sheen) {
    if (l < 1) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    wingPath(l, w);
    const g = ctx.createLinearGradient(0, 0, l, 0);
    g.addColorStop(0, 'rgba(120,190,200,0.18)');
    g.addColorStop(0.28, 'rgba(70,140,180,0.35)');
    g.addColorStop(0.42, `hsla(${215 + sheen * 10}, 85%, 26%, 0.92)`);
    g.addColorStop(0.75, `hsla(${222 + sheen * 8}, 90%, 16%, 0.96)`);
    g.addColorStop(1, 'rgba(12,22,55,0.9)');
    ctx.fillStyle = g;
    ctx.fill();
    // veins
    ctx.clip();
    ctx.lineWidth = Math.max(0.4, l / 220);
    ctx.strokeStyle = `hsla(${200 + sheen * 20}, 90%, 70%, 0.28)`;
    for (let i = -4; i <= 4; i++) {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(l * 0.5, (i / 4) * w * 0.55, l * 1.05, (i / 4) * w * 0.48);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(140,210,255,0.12)';
    for (let i = 1; i < 14; i++) {
      const x = (i / 14) * l;
      ctx.beginPath(); ctx.moveTo(x, -w); ctx.lineTo(x + l * 0.02, w); ctx.stroke();
    }
    ctx.restore();
    // edge
    ctx.save();
    ctx.globalAlpha *= alpha * 0.6;
    wingPath(l, w);
    ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(10,25,60,0.8)';
    ctx.stroke();
    ctx.restore();
  }

  function drawAbdomen(len, w0, w1, bend, t) {
    // along -x from origin, with a gentle bend (bend = y offset at tip)
    ctx.beginPath();
    ctx.moveTo(0, -w0);
    ctx.quadraticCurveTo(-len * 0.5, -w0 + bend * 0.4, -len, bend - w1);
    ctx.lineTo(-len - w1 * 1.4, bend);
    ctx.lineTo(-len, bend + w1);
    ctx.quadraticCurveTo(-len * 0.5, w0 + bend * 0.4, 0, w0);
    ctx.closePath();
    ctx.fillStyle = bodyGrad(0, -w0, 0, w0, t);
    ctx.fill();
    // metallic highlight
    ctx.beginPath();
    ctx.moveTo(-len * 0.02, -w0 * 0.35);
    ctx.quadraticCurveTo(-len * 0.5, -w0 * 0.35 + bend * 0.4, -len * 0.98, bend - w1 * 0.3);
    ctx.lineWidth = Math.max(0.6, w0 * 0.45);
    ctx.strokeStyle = 'rgba(160,250,240,0.35)';
    ctx.stroke();
    // segments
    ctx.strokeStyle = 'rgba(5,25,40,0.3)';
    ctx.lineWidth = 0.5;
    for (let i = 1; i < 10; i++) {
      const f = i / 10, x = -len * f, y = bend * (f * f * 0.6 + f * 0.4) * 0.95;
      const ww = lerp(w0, w1, f);
      ctx.beginPath(); ctx.moveTo(x, y - ww); ctx.lineTo(x, y + ww); ctx.stroke();
    }
  }

  function drawEye(x, y, r) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#5a7f9a');
    g.addColorStop(0.35, '#13202c');
    g.addColorStop(1, '#05080c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  // ---- seen from above, head pointing +x ----
  function drawTop(t, phase) {
    const L = S;
    // wings (behind the body)
    const wl = L * 0.56, ww = L * 0.15;
    const pairs = [
      { rx: L * 0.05, off: 0 },          // fore wings
      { rx: -L * 0.015, off: 1.9 },      // hind wings, out of phase
    ];
    for (const p of pairs) {
      const s = Math.sin(phase + p.off);
      const sweep = 0.55 * s;                       // forward / back swing
      const fore = 0.5 + 0.5 * Math.abs(Math.cos(phase + p.off)); // foreshortening
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(p.rx, side * L * 0.025);
        // wings angled slightly back, swinging forward and back as they beat
        ctx.rotate(side * (Math.PI / 2 + 0.6) - side * sweep);
        drawWing(wl * fore, ww, 0.95, Math.sin(t * 1.3 + side));
        ctx.restore();
      }
    }
    // abdomen
    ctx.save();
    ctx.translate(-L * 0.04, 0);
    drawAbdomen(L * 0.74, L * 0.019, L * 0.012, Math.sin(t * 2) * L * 0.015, t);
    ctx.restore();
    // thorax
    const g = ctx.createRadialGradient(L * 0.01, -L * 0.02, 1, L * 0.02, 0, L * 0.08);
    g.addColorStop(0, '#7ff0c8'); g.addColorStop(0.5, '#139a8a'); g.addColorStop(1, '#0a4f5c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(L * 0.02, 0, L * 0.08, L * 0.045, 0, 0, Math.PI * 2); ctx.fill();
    // head + eyes
    ctx.fillStyle = '#0d5566';
    ctx.beginPath(); ctx.ellipse(L * 0.115, 0, L * 0.035, L * 0.05, 0, 0, Math.PI * 2); ctx.fill();
    drawEye(L * 0.125, -L * 0.045, L * 0.035);
    drawEye(L * 0.125, L * 0.045, L * 0.035);
  }

  // ---- seen from the side, head pointing +x, legs reaching down to y = S*0.17 ----
  function drawSide(t, clap) {
    const L = S;
    const groundY = L * 0.22;
    // legs (behind body)
    ctx.strokeStyle = '#1a1f24';
    ctx.lineWidth = Math.max(0.6, L / 120);
    ctx.lineCap = 'round';
    const legs = [
      { hx: L * 0.06, kx: L * 0.15, ky: -L * 0.04, fx: L * 0.2 },
      { hx: L * 0.03, kx: L * 0.07, ky: -L * 0.05, fx: L * 0.09 },
      { hx: 0, kx: -L * 0.05, ky: -L * 0.045, fx: -L * 0.08 },
    ];
    for (const lg of legs) {
      ctx.beginPath();
      ctx.moveTo(lg.hx, L * 0.03);
      ctx.lineTo(lg.kx, L * 0.03 + lg.ky + L * 0.05);
      ctx.lineTo(lg.fx, groundY);
      ctx.stroke();
      // tiny spines
      ctx.save(); ctx.lineWidth *= 0.5;
      for (let i = 1; i < 4; i++) {
        const f = i / 4;
        const x = lerp(lg.kx, lg.fx, f), y = lerp(L * 0.08 + lg.ky, groundY, f);
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - L * 0.008, y - L * 0.006); ctx.stroke();
      }
      ctx.restore();
    }

    // abdomen going back and slightly up
    ctx.save();
    ctx.translate(-L * 0.06, -L * 0.005);
    ctx.rotate(0.12 + Math.sin(t * 1.2) * 0.01);
    drawAbdomen(L * 0.74, L * 0.017, L * 0.011, -L * 0.02, t);
    ctx.restore();

    // closed wings held above the abdomen; they part a little when "clapping"
    const open = Math.sin(clap * Math.PI) * 0.35;
    const wl = L * 0.6, ww = L * 0.13;
    ctx.save();
    ctx.translate(-L * 0.01, -L * 0.04);
    ctx.save(); ctx.rotate(Math.PI + 0.42 + open); drawWing(wl, ww, 0.9, Math.sin(t)); ctx.restore();
    ctx.save(); ctx.rotate(Math.PI + 0.32 - open * 0.4); drawWing(wl * 0.98, ww, 0.95, Math.cos(t)); ctx.restore();
    ctx.restore();

    // thorax (metallic green with a bronze shoulder)
    const g = ctx.createLinearGradient(0, -L * 0.06, 0, L * 0.06);
    g.addColorStop(0, '#2fd39a'); g.addColorStop(0.45, '#0f9b86'); g.addColorStop(1, '#0a5560');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(L * 0.01, 0, L * 0.085, L * 0.058, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(190,120,80,0.55)';
    ctx.beginPath(); ctx.ellipse(-L * 0.01, -L * 0.04, L * 0.025, L * 0.012, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(200,255,235,0.5)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.ellipse(L * 0.01, -L * 0.005, L * 0.06, L * 0.03, -0.25, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();

    // head
    ctx.fillStyle = '#0e4f60';
    ctx.beginPath(); ctx.ellipse(L * 0.105, L * 0.005, L * 0.03, L * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    drawEye(L * 0.12, -L * 0.005, L * 0.042);
  }

  function drawShadow(x, y, rot, flying) {
    ctx.save();
    const off = flying ? S * 0.35 : S * 0.05;
    ctx.translate(x + off * 0.4, y + off);
    ctx.rotate(rot);
    const g = ctx.createRadialGradient(-S * 0.25, 0, 1, -S * 0.25, 0, S * 0.45);
    g.addColorStop(0, `rgba(20,40,50,${flying ? 0.05 : 0.08})`);
    g.addColorStop(1, 'rgba(20,40,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-S * 0.25, 0, S * 0.45, S * (flying ? 0.22 : 0.06), 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const t = df.t;
    const bob = df.state === 'hover' ? Math.sin(t * 9) * 1.5 : 0;

    // flying view
    if (df.view < 0.99) {
      drawShadow(df.x, df.y, df.heading, true);
      ctx.save();
      ctx.globalAlpha = 1 - df.view;
      ctx.translate(df.x, df.y + bob);
      ctx.rotate(df.heading);
      // motion-blur ghost of the wings
      ctx.save(); ctx.globalAlpha *= 0.35; drawTop(t, df.wingPhase - 0.9); ctx.restore();
      drawTop(t, df.wingPhase);
      ctx.restore();
    }
    // sitting view
    if (df.view > 0.01 && df.perch) {
      const p = df.perch;
      ctx.save();
      ctx.globalAlpha = df.view;
      ctx.translate(df.x, df.y);
      ctx.rotate(p.rot);
      ctx.scale(p.flip, 1);
      ctx.translate(0, -S * 0.22);       // so the feet touch the edge
      drawSide(t, df.clap);
      ctx.restore();
    }
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  df.tx = df.x + 100; df.ty = df.y - 60;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt, now);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
