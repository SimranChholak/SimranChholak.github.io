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
  /* Hawker-dragonfly look: clear wings with a dense dark vein mesh, silvery
     frosted flecks and an amber leading edge; big blue eyes; bronze thorax
     with turquoise spots; long dark abdomen with paired turquoise spots.
     Wings are pre-drawn once into small images so they can be very detailed. */

  const WING_RES = 4;            // sprite resolution multiplier
  let foreSprite = null, hindSprite = null, spriteS = 0;

  function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  // demoiselle-style paddle wing along +x, root at (0, 0)
  function wingOutline(c, l, w, hind) {
    const b = hind ? 1.08 : 1;
    c.beginPath();
    c.moveTo(0, -w * 0.06);
    c.bezierCurveTo(l * 0.2, -w * 0.14, l * 0.45, -w * 0.5 * b, l * 0.75, -w * 0.55 * b);
    c.bezierCurveTo(l * 0.95, -w * 0.58 * b, l * 1.03, -w * 0.25, l * 1.0, w * 0.05);
    c.bezierCurveTo(l * 0.97, w * 0.38 * b, l * 0.8, w * 0.5 * b, l * 0.6, w * 0.45 * b);
    c.bezierCurveTo(l * 0.38, w * 0.38 * b, l * 0.18, w * 0.14, 0, w * 0.06);
    c.closePath();
  }

  function makeWingSprite(l, w, hind, seed) {
    const r = seeded(seed);
    const pad = 4;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((l * 1.06 + pad * 2) * WING_RES);
    cv.height = Math.ceil((w * 1.3 + pad * 2) * WING_RES);
    const c = cv.getContext('2d');
    c.scale(WING_RES, WING_RES);
    c.translate(pad, w * 0.65 + pad);

    // membrane: teal at the root → deep iridescent blue/violet → bronze-brown at the tip
    wingOutline(c, l, w, hind);
    const g = c.createLinearGradient(0, 0, l, 0);
    g.addColorStop(0, 'rgba(60,170,170,0.55)');
    g.addColorStop(0.12, 'rgba(40,60,190,0.85)');
    g.addColorStop(0.45, 'rgba(48,40,200,0.95)');
    g.addColorStop(0.72, 'rgba(38,22,110,0.96)');
    g.addColorStop(0.9, 'rgba(70,40,30,0.95)');
    g.addColorStop(1, 'rgba(95,60,40,0.9)');
    c.fillStyle = g; c.fill();

    c.save(); c.clip();
    // brighter electric-blue band across the middle (iridescence)
    const ib = c.createLinearGradient(0, -w * 0.5, 0, w * 0.5);
    ib.addColorStop(0, 'rgba(90,80,255,0)');
    ib.addColorStop(0.55, 'rgba(90,110,255,0.35)');
    ib.addColorStop(1, 'rgba(90,80,255,0)');
    c.fillStyle = ib; c.fillRect(l * 0.08, -w, l * 0.7, w * 2);

    // fan of fine curved veins from the root
    const n = 46;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const yEnd = lerp(-w * 0.58, w * 0.5, f);
      const bow = (f - 0.5) * w * 0.25;
      c.strokeStyle = `rgba(${140 + r() * 60},${150 + r() * 60},255,${0.18 + r() * 0.2})`;
      c.lineWidth = Math.max(0.25, l / 520);
      c.beginPath();
      c.moveTo(l * 0.02, yEnd * 0.08);
      c.bezierCurveTo(l * 0.35, yEnd * 0.5 + bow, l * 0.7, yEnd * 0.95 + bow * 0.5, l * 1.02, yEnd * 0.95);
      c.stroke();
    }
    // dense cross-veins (fine dark hatching between the long veins)
    c.strokeStyle = 'rgba(10,5,40,0.35)';
    c.lineWidth = Math.max(0.2, l / 700);
    for (let x = l * 0.1; x < l; x += l / 120) {
      c.beginPath(); c.moveTo(x, -w * 0.6); c.lineTo(x + l * 0.012, w * 0.6); c.stroke();
    }
    // main veins along the front edge (teal-green, like the photo)
    c.strokeStyle = 'rgba(80,220,200,0.75)';
    c.lineWidth = Math.max(0.5, l / 200);
    for (const k of [0.02, 0.1]) {
      c.beginPath(); c.moveTo(0, -w * k);
      c.bezierCurveTo(l * 0.3, -w * (0.2 + k), l * 0.6, -w * (0.42 + k * 0.3), l * 0.95, -w * (0.45 + k * 0.4));
      c.stroke();
    }
    // tiny sparkles
    for (let s = 0; s < 40; s++) {
      c.fillStyle = `rgba(255,${230 + r() * 25},${200 + r() * 55},${0.4 + r() * 0.5})`;
      c.beginPath(); c.arc(r() * l, (r() - 0.5) * w, Math.max(0.3, l / 400) * (0.6 + r()), 0, Math.PI * 2); c.fill();
    }
    // glossy highlight
    const gl = c.createLinearGradient(0, -w * 0.6, l * 0.4, w * 0.4);
    gl.addColorStop(0, 'rgba(255,255,255,0.22)');
    gl.addColorStop(0.4, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(0, -w, l, w * 2);
    c.restore();

    // thin dark rim with a faint bronze edge
    wingOutline(c, l, w, hind);
    c.lineWidth = Math.max(0.5, l / 260); c.strokeStyle = 'rgba(20,10,30,0.85)'; c.stroke();
    c.lineWidth = Math.max(0.3, l / 500); c.strokeStyle = 'rgba(180,120,80,0.35)'; c.stroke();

    return { cv, ox: pad, oy: w * 0.65 + pad };
  }

  function ensureSprites() {
    if (spriteS === S && foreSprite) return;
    spriteS = S;
    foreSprite = makeWingSprite(S * 0.6, S * 0.2, false, 11);
    hindSprite = makeWingSprite(S * 0.56, S * 0.21, true, 29);
  }

  // draw a pre-rendered wing; sx = length scale (foreshortening when beating)
  function drawWingSprite(sp, sx, sy, alpha) {
    if (sx <= 0.02) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.scale(sx, sy);
    ctx.drawImage(sp.cv, -sp.ox, -sp.oy, sp.cv.width / WING_RES, sp.cv.height / WING_RES);
    ctx.restore();
  }

  // long abdomen along -x from the origin, dark with paired turquoise spots
  function drawAbdomen(len, w0, w1, bend, side) {
    const segs = 10;
    for (let i = 0; i < segs; i++) {
      const f0 = i / segs, f1 = (i + 1) / segs;
      const x0 = -len * f0, x1 = -len * f1;
      const y0 = bend * f0 * f0, y1 = bend * f1 * f1;
      // narrow "waist" at segment 3, like a hawker
      const waist = i === 2 ? 0.7 : 1;
      const ww = lerp(w0, w1, (f0 + f1) / 2) * waist;
      ctx.save();
      ctx.translate(x0, y0);
      ctx.rotate(Math.atan2(y1 - y0, x1 - x0) + Math.PI);
      const sl = Math.hypot(x1 - x0, y1 - y0);
      // segment body
      const g = ctx.createLinearGradient(0, -ww, 0, ww);
      g.addColorStop(0, '#5a3a24'); g.addColorStop(0.45, '#2a1c14'); g.addColorStop(1, '#120c09');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.roundRect(-sl * 1.04, -ww, sl * 1.06, ww * 2, ww * 0.25); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(-sl * 1.0, -ww, Math.max(0.5, sl * 0.04), ww * 2);
      // turquoise spots
      if (i < segs - 1) {
        ctx.fillStyle = '#4fd6e3';
        if (side) {
          ctx.beginPath(); ctx.ellipse(-sl * 0.35, -ww * 0.35, sl * 0.18, ww * 0.42, 0, 0, Math.PI * 2); ctx.fill();
        } else {
          for (const sgn of [-1, 1]) {
            ctx.beginPath(); ctx.ellipse(-sl * 0.35, sgn * ww * 0.45, sl * 0.17, ww * 0.32, 0, 0, Math.PI * 2); ctx.fill();
          }
          ctx.fillStyle = 'rgba(120,230,240,0.6)';
          ctx.beginPath(); ctx.ellipse(-sl * 0.75, 0, sl * 0.08, ww * 0.18, 0, 0, Math.PI * 2); ctx.fill();
        }
      }
      // sheen
      ctx.fillStyle = 'rgba(255,230,200,0.18)';
      ctx.fillRect(-sl * 0.95, -ww * 0.75, sl * 0.9, ww * 0.25);
      ctx.restore();
    }
    // claspers
    ctx.strokeStyle = '#2a1c14'; ctx.lineWidth = Math.max(0.7, w1 * 0.6);
    const tx = -len, ty = bend;
    for (const sgn of side ? [0] : [-1, 1]) {
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(tx - w1 * 2.6, ty + sgn * w1 * 0.9 + (side ? w1 * 0.4 : 0)); ctx.stroke();
    }
  }

  function drawEyeDome(x, y, rx, ry) {
    const g = ctx.createRadialGradient(x - rx * 0.3, y - ry * 0.35, rx * 0.1, x, y, Math.max(rx, ry));
    g.addColorStop(0, '#9cc8ff'); g.addColorStop(0.35, '#3d6fe0'); g.addColorStop(0.8, '#1d2f8a'); g.addColorStop(1, '#0d1440');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.ellipse(x - rx * 0.35, y - ry * 0.4, rx * 0.22, ry * 0.12, -0.4, 0, Math.PI * 2); ctx.fill();
  }

  function drawThorax(L, side) {
    const g = ctx.createRadialGradient(L * 0.02, -L * 0.02, 1, L * 0.02, 0, L * 0.09);
    g.addColorStop(0, '#c99a62'); g.addColorStop(0.55, '#7a5532'); g.addColorStop(1, '#3b2614');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(L * 0.02, 0, L * 0.085, L * (side ? 0.06 : 0.052), side ? -0.25 : 0, 0, Math.PI * 2); ctx.fill();
    // turquoise markings
    ctx.fillStyle = '#5fdde8';
    if (side) {
      ctx.beginPath(); ctx.ellipse(L * 0.0, L * 0.005, L * 0.05, L * 0.009, -0.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(L * 0.045, -L * 0.01, L * 0.04, L * 0.008, -0.6, 0, Math.PI * 2); ctx.fill();
    } else {
      for (const sgn of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(-L * 0.02, sgn * L * 0.028, L * 0.018, L * 0.008, sgn * 0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(L * 0.04, sgn * L * 0.02, L * 0.012, L * 0.006, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.fillStyle = 'rgba(255,240,220,0.4)';
    ctx.beginPath(); ctx.ellipse(L * 0.035, -L * 0.022, L * 0.03, L * 0.008, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---- seen from above, head pointing +x ----
  function drawTop(t, phase) {
    ensureSprites();
    const L = S;
    // wings: hawker wings beat up/down → seen from above they shorten and lengthen
    const pairs = [
      { sp: foreSprite, rx: L * 0.045, off: 0 },
      { sp: hindSprite, rx: -L * 0.015, off: 1.7 },
    ];
    for (const p of pairs) {
      const c = Math.cos(phase + p.off);
      const len = 0.45 + 0.55 * Math.abs(c);
      const sweep = 0.12 * Math.sin(phase + p.off);
      for (const side of [-1, 1]) {
        ctx.save();
        ctx.translate(p.rx, side * L * 0.02);
        ctx.rotate(side * (Math.PI / 2 + (p.sp === hindSprite ? 0.12 : -0.05)) - side * sweep);
        drawWingSprite(p.sp, len, side, 1);
        ctx.restore();
      }
    }
    // abdomen
    ctx.save(); ctx.translate(-L * 0.05, 0);
    drawAbdomen(L * 0.72, L * 0.024, L * 0.018, Math.sin(t * 2) * L * 0.01, false);
    ctx.restore();
    drawThorax(L, false);
    // head: two large blue eyes meeting in the middle, small face in front
    drawEyeDome(L * 0.12, 0, L * 0.05, L * 0.062);
    ctx.strokeStyle = 'rgba(10,20,60,0.6)'; ctx.lineWidth = Math.max(0.5, L / 160);
    ctx.beginPath(); ctx.moveTo(L * 0.09, 0); ctx.lineTo(L * 0.165, 0); ctx.stroke();
    ctx.fillStyle = '#4a7fd8';
    ctx.beginPath(); ctx.ellipse(L * 0.172, 0, L * 0.014, L * 0.026, 0, 0, Math.PI * 2); ctx.fill();
  }

  // ---- seen from the side, head pointing +x, legs reaching down to y = S*0.22 ----
  function drawSide(t, clap) {
    ensureSprites();
    const L = S;
    const groundY = L * 0.22;
    // folded wings, held together above the abdomen (seen from the side)
    const open = Math.sin(clap * Math.PI) * 0.22;   // occasional slow open-close
    const wingRoot = () => { ctx.translate(-L * 0.005, -L * 0.04); };
    // far pair (behind body), a touch lower and darker
    ctx.save(); wingRoot(); ctx.rotate(Math.PI + 0.2 + open * 0.5);
    ctx.save(); ctx.filter = 'brightness(0.7)'; drawWingSprite(hindSprite, 1, -1, 0.95); ctx.restore(); ctx.restore();
    // legs
    ctx.strokeStyle = '#1a1410';
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
    }

    // abdomen going back, very slightly down then level
    ctx.save();
    ctx.translate(-L * 0.06, 0);
    ctx.rotate(0.06 + Math.sin(t * 1.2) * 0.01);
    drawAbdomen(L * 0.74, L * 0.022, L * 0.016, -L * 0.02, true);
    ctx.restore();

    drawThorax(L, true);

    // near pair (in front), lifted slightly and fanning open a little when it claps
    ctx.save(); wingRoot(); ctx.rotate(Math.PI + 0.28 + open);
    drawWingSprite(foreSprite, 1, -1, 0.97); ctx.restore();
    ctx.save(); wingRoot(); ctx.rotate(Math.PI + 0.36 + open * 1.4);
    drawWingSprite(foreSprite, 0.98, -1, 0.97); ctx.restore();

    // head: big blue eye
    drawEyeDome(L * 0.115, -L * 0.005, L * 0.045, L * 0.048);
    ctx.fillStyle = '#4a7fd8';
    ctx.beginPath(); ctx.ellipse(L * 0.155, L * 0.015, L * 0.015, L * 0.025, 0, 0, Math.PI * 2); ctx.fill();
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
