/* ============================================================
   DRAGONFLY — a banded demoiselle drawn in code.
   • Flies in short darts and hovers, in any direction, and banks
     into its turns.
   • After a few seconds of flying it lands somewhere new each time:
       – on the page itself (seen from above, wings folded)
       – on a side of the screen (seen from the side)
       – on top of one of the rotating cards — and rides along with it
   • Never lets the cursor touch it — it darts away.
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
    S = Math.max(54, Math.min(96, Math.min(W, H) * 0.09));
  }
  resize();
  addEventListener('resize', resize);

  /* ---------- tuning ---------- */
  const FLEE_R = () => S * 2.0;        // cursor closer than this → fly away
  const FLY_TIME = [2.5, 5];           // seconds of flying before it looks for a place to sit
  const SIT_TIME = [3.5, 8];           // seconds it sits
  const TOP_SAFE = 110;                // keep below the top bar
  const MARGIN = 40;

  /* ---------- helpers ---------- */
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const normAng = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
  function stageRect() {
    const r = stageEl.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  }
  function centerOf(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /* ---------- cursor ---------- */
  const mouse = { x: -9999, y: -9999, seen: false };
  function onMove(e) {
    const p = e.touches ? e.touches[0] : e;
    mouse.x = p.clientX; mouse.y = p.clientY; mouse.seen = true;
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
    bank: 0,                 // banking into turns (-1 … 1)
    state: 'hover',          // hover | dart | toPerch | land | perch
    timer: 0.6,
    flyLeft: rand(...FLY_TIME),
    tx: 0, ty: 0,
    speed: 420,
    view: 0,                 // 0 = flying drawing, 1 = sitting drawing
    perch: null,             // where it sits (see choosePerch)
    pose: null,              // current { x, y, rot, flip, valid } of the perch
    lastPerch: { x: -999, y: -999 },
    wingPhase: 0,
    clap: 0, clapT: rand(1.5, 4), clapAmp: 0.5,
    t: 0,
  };

  function farFromCursor(x, y, k = 1.8) {
    return Math.hypot(x - mouse.x, y - mouse.y) > FLEE_R() * k;
  }

  function insideStage(x, y, pad = 30) {
    const st = stageRect();
    return x > st.x - pad && x < st.x + st.w + pad && y > st.y - pad && y < st.y + st.h + pad;
  }

  function pickTarget() {
    const st = stageRect();
    for (let i = 0; i < 30; i++) {
      let x, y;
      if (Math.random() < 0.3) {                 // sometimes over the images
        x = rand(st.x + st.w * 0.15, st.x + st.w * 0.85);
        y = rand(st.y + st.h * 0.15, st.y + st.h * 0.85);
      } else {                                    // empty space
        x = rand(MARGIN, W - MARGIN);
        y = rand(TOP_SAFE, H - MARGIN);
        if (insideStage(x, y)) continue;
      }
      const d = Math.hypot(x - df.x, y - df.y);
      if (d < 90 || d > Math.max(W, H) * 0.55) continue;
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

  /* ---------- places to sit ---------- */

  // the top edge of a card, read from two tiny markers in its top corners
  function cardPose(p) {
    const a = centerOf(p.anc.l), b = centerOf(p.anc.r);
    let vx = b.x - a.x, vy = b.y - a.y;
    const len = Math.hypot(vx, vy);
    let ang = Math.atan2(vy, vx);
    let ux = p.u;
    // seen from the back the edge runs right-to-left: sit on it the other way round
    if (Math.abs(ang) > Math.PI / 2) { ang = normAng(ang + Math.PI); ux = 1 - p.u; }
    const x = lerp(a.x, b.x, p.u), y = lerp(a.y, b.y, p.u);
    const valid = len > S * 0.55 && Math.abs(ang) < 0.85 &&
                  x > 20 && x < W - 20 && y > 30 && y < H - 20;
    return { x, y, rot: ang, flip: p.flip, valid, ux };
  }

  function poseOf(p) {
    if (p.type === 'card') return cardPose(p);
    return { x: p.x, y: p.y, rot: p.rot, flip: p.flip, valid: true };
  }

  function choosePerch() {
    const far = (x, y) => Math.hypot(x - df.lastPerch.x, y - df.lastPerch.y) > 220 && farFromCursor(x, y, 2.2);
    const r = Math.random();

    // 1) a card (about 4 in 10 landings)
    const cards = window.CARD_ANCHORS || [];
    if (r < 0.42 && cards.length) {
      const order = cards.slice().sort(() => Math.random() - 0.5);
      for (const c of order) {
        const p = { type: 'card', anc: c, u: rand(0.45, 0.85), flip: Math.random() < 0.5 ? 1 : -1, view: 'side' };
        const pose = cardPose(p);
        if (pose.valid && far(pose.x, pose.y)) return p;
      }
    }
    // 2) a side of the screen (about 1 in 4)
    if (r < 0.67) {
      for (let i = 0; i < 12; i++) {
        const side = ['left', 'right', 'bottom'][Math.floor(Math.random() * 3)];
        let p;
        if (side === 'left')  p = { type: 'edge', x: 1, y: rand(TOP_SAFE + 30, H - 70), rot: Math.PI / 2, flip: -1 };
        if (side === 'right') p = { type: 'edge', x: W - 1, y: rand(TOP_SAFE + 30, H - 70), rot: -Math.PI / 2, flip: 1 };
        if (side === 'bottom') { const x = rand(90, W - 90); p = { type: 'edge', x, y: H - 1, rot: 0, flip: x > W / 2 ? -1 : 1 }; }
        p.view = 'side';
        if (far(p.x, p.y)) return p;
      }
    }
    // 3) on the page itself, seen from above
    for (let i = 0; i < 30; i++) {
      const x = rand(MARGIN + 20, W - MARGIN - 20), y = rand(TOP_SAFE + 20, H - MARGIN - 20);
      if (insideStage(x, y, 50) || !far(x, y)) continue;
      return { type: 'surface', x, y, rot: rand(-Math.PI, Math.PI), flip: 1, view: 'top' };
    }
    return { type: 'surface', x: clamp(W - df.x, 80, W - 80), y: clamp(H - df.y, TOP_SAFE + 40, H - 60), rot: rand(-3, 3), flip: 1, view: 'top' };
  }

  // a point a little "above" the perch to fly in from
  function approachPoint(p, pose) {
    if (p.view === 'top') return { x: pose.x, y: pose.y };
    const ux = Math.sin(pose.rot), uy = -Math.cos(pose.rot);     // the side's "up"
    return { x: pose.x + ux * S * 0.8, y: pose.y + uy * S * 0.8 };
  }

  function goPerch() {
    df.perch = choosePerch();
    df.pose = poseOf(df.perch);
    const a = approachPoint(df.perch, df.pose);
    startDart(a.x, a.y, rand(360, 460));
    df.state = 'toPerch';
  }

  function takeoff() {
    df.state = 'hover';
    df.timer = 0.05;
    df.perch = null;
    df.flyLeft = rand(...FLY_TIME);
  }

  function flee() {
    const a = Math.atan2(df.y - mouse.y, df.x - mouse.x) + rand(-0.6, 0.6);
    const dist = rand(180, 300);
    let x = clamp(df.x + Math.cos(a) * dist, MARGIN, W - MARGIN);
    let y = clamp(df.y + Math.sin(a) * dist, TOP_SAFE * 0.6, H - MARGIN);
    if (Math.hypot(x - mouse.x, y - mouse.y) < FLEE_R() * 1.4) {   // cornered: slip out sideways
      const b = a + (Math.random() < 0.5 ? 1.6 : -1.6);
      x = clamp(df.x + Math.cos(b) * dist, MARGIN, W - MARGIN);
      y = clamp(df.y + Math.sin(b) * dist, TOP_SAFE * 0.6, H - MARGIN);
    }
    if (df.state === 'perch' || df.state === 'land') {
      if (df.pose && df.perch && df.perch.view === 'top') df.heading = df.pose.rot;
      takeoff();
    }
    df.perch = null;
    startDart(x, y, rand(650, 850));
    df.flyLeft = rand(2, 3.5);
  }

  /* ---------- update ---------- */
  function update(dt) {
    df.t += dt;
    const cursorD = Math.hypot(df.x - mouse.x, df.y - mouse.y);
    const prevHeading = df.heading;

    // never let the cursor touch it
    if (mouse.seen && cursorD < FLEE_R() && !(df.state === 'dart' && df.speed > 600)) flee();

    switch (df.state) {
      case 'hover': {
        df.vx *= Math.pow(0.02, dt); df.vy *= Math.pow(0.02, dt);
        df.vx += Math.sin(df.t * 7.3) * 30 * dt;
        df.vy += Math.cos(df.t * 5.1) * 30 * dt;
        df.timer -= dt;
        df.flyLeft -= dt;
        if (df.timer <= 0) {
          if (df.flyLeft <= 0) { goPerch(); break; }          // time to sit somewhere
          if (farFromCursor(df.tx, df.ty)) startDart(df.tx, df.ty);
          else { const t = pickTarget(); startDart(t.x, t.y); }
        } else {
          const want = Math.atan2(df.ty - df.y, df.tx - df.x);
          df.heading += angDiff(df.heading, want) * Math.min(1, dt * 1.5);
        }
        break;
      }
      case 'dart':
      case 'toPerch': {
        df.flyLeft -= dt;
        if (df.state === 'toPerch') {
          // the perch may be moving (a card) — keep aiming at it
          df.pose = poseOf(df.perch);
          if (!df.pose.valid) { takeoff(); df.flyLeft = 0.6; break; }
          const a = approachPoint(df.perch, df.pose);
          df.tx = a.x; df.ty = a.y;
        }
        const dx = df.tx - df.x, dy = df.ty - df.y;
        const d = Math.hypot(dx, dy);
        const want = Math.atan2(dy, dx);
        df.heading += angDiff(df.heading, want) * Math.min(1, dt * 9);
        const sp = df.speed * clamp(d / 120, 0.15, 1);
        df.vx += (Math.cos(df.heading) * sp - df.vx) * Math.min(1, dt * 6);
        df.vy += (Math.sin(df.heading) * sp - df.vy) * Math.min(1, dt * 6);
        if (d < 14) {
          if (df.state === 'toPerch') { df.state = 'land'; df.timer = 0; }
          else { df.state = 'hover'; df.timer = rand(0.35, 1.4); const t = pickTarget(); df.tx = t.x; df.ty = t.y; }
        }
        break;
      }
      case 'land': {
        df.pose = poseOf(df.perch);
        if (!df.pose.valid) { takeoff(); break; }
        df.timer += dt;
        const k = Math.min(1, dt * 6);
        df.x = lerp(df.x, df.pose.x, k); df.y = lerp(df.y, df.pose.y, k);
        if (df.perch.view === 'top') df.heading += angDiff(df.heading, df.pose.rot) * k;
        df.vx = df.vy = 0;
        if (df.timer > 0.45) { df.state = 'perch'; df.timer = rand(...SIT_TIME); df.lastPerch = { x: df.pose.x, y: df.pose.y }; }
        break;
      }
      case 'perch': {
        df.pose = poseOf(df.perch);
        df.vx = df.vy = 0;
        if (!df.pose.valid) {                       // the card turned away — hop off
          takeoff(); const t = pickTarget(); startDart(t.x, t.y); break;
        }
        df.x = df.pose.x; df.y = df.pose.y;         // ride along with a moving card
        if (df.perch.view === 'top') df.heading = df.pose.rot;
        df.timer -= dt;
        if (df.timer <= 0) { takeoff(); const t = pickTarget(); startDart(t.x, t.y); }
        break;
      }
    }

    if (df.state !== 'land' && df.state !== 'perch') {
      df.x += df.vx * dt; df.y += df.vy * dt;
      df.x = clamp(df.x, 10, W - 10); df.y = clamp(df.y, 10, H - 10);
    }

    // bank into turns
    const turn = dt > 0 ? angDiff(prevHeading, df.heading) / dt : 0;
    df.bank += (clamp(turn * 0.25, -1, 1) - df.bank) * Math.min(1, dt * 6);

    const sitting = df.state === 'perch' || (df.state === 'land' && df.timer > 0.15);
    df.view += ((sitting ? 1 : 0) - df.view) * Math.min(1, dt * 10);

    df.wingPhase += dt * (df.state === 'dart' || df.state === 'toPerch' ? 60 : 46);

    // when sitting, now and then slowly open and close the wings
    df.clapT -= dt;
    if (df.clapT <= 0) { df.clap = 1; df.clapAmp = rand(0.25, 1); df.clapT = rand(2.5, 6); }
    df.clap = Math.max(0, df.clap - dt * 0.9);
  }

  /* ---------- drawing ---------- */
  const WING_RES = 4;
  let foreSprite = null, hindSprite = null, spriteS = 0;
  function seeded(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

  // demoiselle paddle-shaped wing along +x, root at (0, 0)
  function wingOutline(c, l, w, hind) {
    const b = hind ? 1.06 : 1;
    c.beginPath();
    c.moveTo(0, -w * 0.05);
    c.bezierCurveTo(l * 0.2, -w * 0.12, l * 0.45, -w * 0.5 * b, l * 0.75, -w * 0.55 * b);
    c.bezierCurveTo(l * 0.95, -w * 0.58 * b, l * 1.03, -w * 0.25, l * 1.0, w * 0.05);
    c.bezierCurveTo(l * 0.97, w * 0.38 * b, l * 0.8, w * 0.5 * b, l * 0.6, w * 0.45 * b);
    c.bezierCurveTo(l * 0.38, w * 0.38 * b, l * 0.18, w * 0.12, 0, w * 0.05);
    c.closePath();
  }

  // pre-drawn, detailed wing: clear base → deep metallic blue with dark veins → darker tip
  function makeWingSprite(l, w, hind, seed) {
    const r = seeded(seed);
    const pad = 4;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((l * 1.06 + pad * 2) * WING_RES);
    cv.height = Math.ceil((w * 1.3 + pad * 2) * WING_RES);
    const c = cv.getContext('2d');
    c.scale(WING_RES, WING_RES);
    c.translate(pad, w * 0.65 + pad);

    wingOutline(c, l, w, hind);
    const g = c.createLinearGradient(0, 0, l, 0);
    g.addColorStop(0, 'rgba(170,220,235,0.25)');
    g.addColorStop(0.16, 'rgba(120,190,225,0.35)');
    g.addColorStop(0.3, 'rgba(25,120,200,0.9)');
    g.addColorStop(0.6, 'rgba(14,82,170,0.96)');
    g.addColorStop(0.88, 'rgba(10,40,95,0.97)');
    g.addColorStop(1, 'rgba(8,28,60,0.95)');
    c.fillStyle = g; c.fill();

    c.save(); c.clip();
    // metallic sheen band
    const ib = c.createLinearGradient(0, -w * 0.5, 0, w * 0.5);
    ib.addColorStop(0, 'rgba(60,200,255,0)');
    ib.addColorStop(0.45, 'rgba(90,215,255,0.45)');
    ib.addColorStop(1, 'rgba(60,200,255,0)');
    c.fillStyle = ib; c.fillRect(l * 0.25, -w, l * 0.6, w * 2);
    // fan of dark curved veins
    const n = 44;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const yEnd = lerp(-w * 0.58, w * 0.5, f);
      const bow = (f - 0.5) * w * 0.25;
      c.strokeStyle = `rgba(4,18,50,${0.45 + r() * 0.3})`;
      c.lineWidth = Math.max(0.25, l / 480);
      c.beginPath();
      c.moveTo(l * 0.02, yEnd * 0.08);
      c.bezierCurveTo(l * 0.35, yEnd * 0.5 + bow, l * 0.7, yEnd * 0.95 + bow * 0.5, l * 1.02, yEnd * 0.95);
      c.stroke();
      if (i % 2 === 0) {                          // a few bright veins catching the light
        c.strokeStyle = 'rgba(160,230,255,0.38)';
        c.stroke();
      }
    }
    // fine cross-veins
    c.strokeStyle = 'rgba(4,18,50,0.28)';
    c.lineWidth = Math.max(0.2, l / 700);
    for (let x = l * 0.06; x < l; x += l / 110) {
      c.beginPath(); c.moveTo(x, -w * 0.6); c.lineTo(x + l * 0.012, w * 0.6); c.stroke();
    }
    // glossy highlight
    const gl = c.createLinearGradient(0, -w * 0.6, l * 0.5, w * 0.4);
    gl.addColorStop(0, 'rgba(255,255,255,0.5)');
    gl.addColorStop(0.18, 'rgba(255,255,255,0.12)');
    gl.addColorStop(0.45, 'rgba(255,255,255,0)');
    c.fillStyle = gl; c.fillRect(0, -w, l, w * 2);
    c.restore();

    // thin rim + metallic front vein
    wingOutline(c, l, w, hind);
    c.lineWidth = Math.max(0.5, l / 260); c.strokeStyle = 'rgba(6,20,45,0.85)'; c.stroke();
    c.strokeStyle = 'rgba(60,210,200,0.7)'; c.lineWidth = Math.max(0.5, l / 220);
    c.beginPath(); c.moveTo(0, -w * 0.04);
    c.bezierCurveTo(l * 0.3, -w * 0.22, l * 0.6, -w * 0.46, l * 0.9, -w * 0.5); c.stroke();

    return { cv, ox: pad, oy: w * 0.65 + pad };
  }

  function ensureSprites() {
    if (spriteS === S && foreSprite) return;
    spriteS = S;
    foreSprite = makeWingSprite(S * 0.6, S * 0.19, false, 11);
    hindSprite = makeWingSprite(S * 0.57, S * 0.2, true, 29);
  }

  // shine (0…1): the wing flashes brighter as it catches the light
  function drawWingSprite(sp, sx, sy, alpha, shine = 0.25) {
    if (Math.abs(sx) <= 0.02 || Math.abs(sy) <= 0.01) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.scale(sx, sy);
    const w = sp.cv.width / WING_RES, h = sp.cv.height / WING_RES;
    ctx.drawImage(sp.cv, -sp.ox, -sp.oy, w, h);
    if (shine > 0.01) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= shine * 0.55;
      ctx.drawImage(sp.cv, -sp.ox, -sp.oy, w, h);
    }
    ctx.restore();
  }

  // long, thin, metallic blue-green abdomen along -x from the origin
  function drawAbdomen(len, w0, w1, bend) {
    ctx.beginPath();
    ctx.moveTo(0, -w0);
    ctx.quadraticCurveTo(-len * 0.5, -w0 * 0.85 + bend * 0.4, -len * 0.9, bend - w1);
    ctx.quadraticCurveTo(-len * 0.97, bend - w1 * 1.5, -len, bend - w1 * 0.6);   // slightly swollen tip
    ctx.lineTo(-len, bend + w1 * 0.6);
    ctx.quadraticCurveTo(-len * 0.97, bend + w1 * 1.5, -len * 0.9, bend + w1);
    ctx.quadraticCurveTo(-len * 0.5, w0 * 0.85 + bend * 0.4, 0, w0);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, -w0, 0, w0);
    const s = Math.sin(df.t * 0.8) * 6;
    g.addColorStop(0, `hsl(${178 + s}, 85%, 58%)`);
    g.addColorStop(0.45, `hsl(${188 + s}, 90%, 38%)`);
    g.addColorStop(1, `hsl(${200 + s}, 85%, 20%)`);
    ctx.fillStyle = g; ctx.fill();
    // highlight line
    ctx.beginPath();
    ctx.moveTo(-len * 0.02, -w0 * 0.4);
    ctx.quadraticCurveTo(-len * 0.5, -w0 * 0.4 + bend * 0.4, -len * 0.97, bend - w1 * 0.4);
    ctx.lineWidth = Math.max(0.5, w0 * 0.4);
    ctx.strokeStyle = 'rgba(190,255,250,0.55)'; ctx.stroke();
    // segment rings
    ctx.strokeStyle = 'rgba(0,40,55,0.35)'; ctx.lineWidth = 0.5;
    for (let i = 1; i < 10; i++) {
      const f = i / 10, x = -len * f, y = bend * (f * f * 0.6 + f * 0.4) * 0.95, ww = lerp(w0, w1, f);
      ctx.beginPath(); ctx.moveTo(x, y - ww); ctx.lineTo(x, y + ww); ctx.stroke();
    }
    // bright tip (as in the photos)
    ctx.fillStyle = 'rgba(150,255,230,0.6)';
    ctx.beginPath(); ctx.ellipse(-len * 0.95, bend, len * 0.04, w1 * 0.9, 0, 0, Math.PI * 2); ctx.fill();
  }

  function drawEye(x, y, r) {
    const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r);
    g.addColorStop(0, '#6f9fb8'); g.addColorStop(0.35, '#1b2b38'); g.addColorStop(1, '#05080c');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.4, r * 0.18, 0, Math.PI * 2); ctx.fill();
  }

  function metalGreen(x0, y0, x1, y1) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, '#9dfacb'); g.addColorStop(0.35, '#22c89a'); g.addColorStop(0.7, '#0c8a86'); g.addColorStop(1, '#064a52');
    return g;
  }

  function drawLeg(pts, w) {
    ctx.strokeStyle = '#3b434b'; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
    // little spines
    ctx.save(); ctx.lineWidth = w * 0.45; ctx.strokeStyle = 'rgba(60,68,76,0.7)';
    const [a, b] = [pts[pts.length - 2], pts[pts.length - 1]];
    for (let i = 1; i < 5; i++) {
      const f = i / 5, x = lerp(a[0], b[0], f), y = lerp(a[1], b[1], f);
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - S * 0.012, y - S * 0.006); ctx.stroke();
    }
    ctx.restore();
  }

  // ---- FLYING, seen from above, head pointing +x ----
  function drawFlying(t, phase, bank) {
    ensureSprites();
    const L = S;
    const pairs = [
      { sp: foreSprite, rx: L * 0.045, off: 0, base: -0.06 },
      { sp: hindSprite, rx: -L * 0.01, off: 1.8, base: 0.16 },
    ];
    for (const p of pairs) {
      const sweep = 0.26 * Math.sin(phase + p.off);
      const shine = 0.15 + 0.85 * Math.pow(Math.max(0, Math.sin(phase + p.off + 0.6)), 3);
      for (const side of [-1, 1]) {
        // both wings of a pair always the same size, moving together
        ctx.save();
        ctx.translate(p.rx, side * L * 0.018);
        ctx.rotate(side * (Math.PI / 2 + p.base) - side * sweep);
        drawWingSprite(p.sp, 1, side, 1, shine);
        ctx.restore();
      }
    }
    // abdomen
    ctx.save(); ctx.translate(-L * 0.045, 0);
    drawAbdomen(L * 0.74, L * 0.018, L * 0.013, Math.sin(t * 2) * L * 0.01);
    ctx.restore();
    // legs tucked under, just tips showing
    for (const side of [-1, 1]) {
      drawLeg([[L * 0.03, side * L * 0.02], [L * 0.06, side * L * 0.05], [L * 0.11, side * L * 0.055]], Math.max(0.5, L / 150));
    }
    // thorax
    ctx.fillStyle = metalGreen(0, -L * 0.04, 0, L * 0.04);
    ctx.beginPath(); ctx.ellipse(L * 0.02, 0, L * 0.07, L * 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(120,60,90,0.6)';
    ctx.beginPath(); ctx.ellipse(-L * 0.005, 0, L * 0.02, L * 0.018, 0, 0, Math.PI * 2); ctx.fill();
    // head: wide, with an eye on each side
    ctx.fillStyle = '#0f7f86';
    ctx.beginPath(); ctx.ellipse(L * 0.105, 0, L * 0.022, L * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    drawEye(L * 0.108, -L * 0.045, L * 0.026);
    drawEye(L * 0.108, L * 0.045, L * 0.026);
  }

  // ---- SITTING on the page, seen from above: wings folded together over the back ----
  function drawRestingTop(t, clap) {
    ensureSprites();
    const L = S;
    const open = Math.sin(clap * Math.PI) * df.clapAmp;
    // legs splayed on the surface
    const lw = Math.max(0.6, L / 130);
    for (const side of [-1, 1]) {
      drawLeg([[L * 0.05, side * L * 0.02], [L * 0.1, side * L * 0.07], [L * 0.17, side * L * 0.1]], lw);
      drawLeg([[L * 0.02, side * L * 0.025], [L * 0.03, side * L * 0.09], [L * 0.05, side * L * 0.14]], lw);
      drawLeg([[0, side * L * 0.025], [-L * 0.05, side * L * 0.08], [-L * 0.1, side * L * 0.12]], lw);
    }
    // abdomen
    ctx.save(); ctx.translate(-L * 0.045, 0);
    drawAbdomen(L * 0.74, L * 0.018, L * 0.013, 0);
    ctx.restore();
    // folded wings: held upright over the back, so from above they look narrow;
    // they part slightly when it slowly opens them
    for (const [sp, side, k] of [[hindSprite, -1, 0.9], [hindSprite, 1, 0.9], [foreSprite, -1, 1], [foreSprite, 1, 1]]) {
      ctx.save();
      ctx.translate(-L * 0.005, side * L * 0.006);
      ctx.rotate(Math.PI + side * (0.04 + open * 0.35 * k));
      drawWingSprite(sp, 1, side * (0.22 + open * 0.5), 0.96, 0.25 + 0.2 * Math.sin(t * 1.7));
      ctx.restore();
    }
    // thorax + head
    ctx.fillStyle = metalGreen(0, -L * 0.04, 0, L * 0.04);
    ctx.beginPath(); ctx.ellipse(L * 0.02, 0, L * 0.07, L * 0.035, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath(); ctx.ellipse(L * 0.03, -L * 0.012, L * 0.03, L * 0.008, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#0f7f86';
    ctx.beginPath(); ctx.ellipse(L * 0.105, 0, L * 0.022, L * 0.04, 0, 0, Math.PI * 2); ctx.fill();
    drawEye(L * 0.108, -L * 0.045, L * 0.026);
    drawEye(L * 0.108, L * 0.045, L * 0.026);
  }

  // ---- SITTING on an edge, seen from the side: head +x, feet reach y = S * 0.26 ----
  function drawRestingSide(t, clap) {
    ensureSprites();
    const L = S;
    const groundY = L * 0.26;
    const open = Math.sin(clap * Math.PI) * df.clapAmp;
    const root = () => ctx.translate(-L * 0.005, -L * 0.035);

    // far wings (behind the body) — the hind pair drops down a little when the wings open
    ctx.save(); root(); ctx.rotate(Math.PI + 0.24 - open * 0.55);
    ctx.save(); ctx.filter = 'brightness(0.75)'; drawWingSprite(hindSprite, 1, -1, 0.95); ctx.restore(); ctx.restore();

    // long thin legs
    const lw = Math.max(0.6, L / 120);
    drawLeg([[L * 0.06, L * 0.025], [L * 0.15, -L * 0.01], [L * 0.21, groundY]], lw);
    drawLeg([[L * 0.03, L * 0.03], [L * 0.07, L * 0.0], [L * 0.1, groundY]], lw);
    drawLeg([[0, L * 0.03], [-L * 0.06, -L * 0.005], [-L * 0.09, groundY]], lw);

    // abdomen, held out level behind
    ctx.save(); ctx.translate(-L * 0.055, 0); ctx.rotate(0.05 + Math.sin(t * 1.2) * 0.01);
    drawAbdomen(L * 0.75, L * 0.017, L * 0.012, -L * 0.012);
    ctx.restore();

    // thorax: metallic green with a bronze shoulder
    ctx.fillStyle = metalGreen(0, -L * 0.06, 0, L * 0.06);
    ctx.beginPath(); ctx.ellipse(L * 0.015, 0, L * 0.08, L * 0.055, -0.25, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(220,130,120,0.6)';
    ctx.beginPath(); ctx.ellipse(-L * 0.01, -L * 0.04, L * 0.022, L * 0.012, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(L * 0.03, -L * 0.028, L * 0.028, L * 0.009, -0.25, 0, Math.PI * 2); ctx.fill();

    // near wings (in front) — the fore pair lifts up when the wings open, like the photo
    ctx.save(); root(); ctx.rotate(Math.PI + 0.3 + open * 0.75);
    drawWingSprite(foreSprite, 1, -1, 0.97, 0.25 + 0.2 * Math.sin(t * 1.7)); ctx.restore();
    ctx.save(); root(); ctx.rotate(Math.PI + 0.34 + open * 1.05);
    drawWingSprite(foreSprite, 0.98, -1, 0.97, 0.25 + 0.2 * Math.sin(t * 1.7 + 1)); ctx.restore();

    // head + big dark eye
    ctx.fillStyle = '#0f7f86';
    ctx.beginPath(); ctx.ellipse(L * 0.1, L * 0.008, L * 0.026, L * 0.034, 0, 0, Math.PI * 2); ctx.fill();
    drawEye(L * 0.112, -L * 0.006, L * 0.036);
  }

  function drawShadow(x, y, rot, height) {
    ctx.save();
    ctx.translate(x + height * 0.4, y + height);
    ctx.rotate(rot);
    const g = ctx.createRadialGradient(-S * 0.25, 0, 1, -S * 0.25, 0, S * 0.45);
    g.addColorStop(0, `rgba(20,40,50,${height > S * 0.1 ? 0.05 : 0.1})`);
    g.addColorStop(1, 'rgba(20,40,50,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(-S * 0.25, 0, S * 0.45, S * (height > S * 0.1 ? 0.22 : 0.09), 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const t = df.t;
    const bob = df.state === 'hover' ? Math.sin(t * 9) * 1.5 : 0;

    // flying
    if (df.view < 0.99) {
      drawShadow(df.x, df.y, df.heading, S * 0.35);
      ctx.save();
      ctx.globalAlpha = 1 - df.view;
      ctx.translate(df.x, df.y + bob);
      ctx.rotate(df.heading);
      ctx.save(); ctx.globalAlpha *= 0.18; drawFlying(t, df.wingPhase - 0.9, df.bank); ctx.restore();   // wing blur
      drawFlying(t, df.wingPhase, df.bank);
      ctx.restore();
    }
    // sitting
    if (df.view > 0.01 && df.perch && df.pose) {
      const p = df.perch, pose = df.pose;
      ctx.save();
      ctx.globalAlpha = df.view;
      if (p.view === 'top') {
        drawShadow(df.x, df.y, df.heading, S * 0.04);
        ctx.translate(df.x, df.y);
        ctx.rotate(df.heading);
        drawRestingTop(t, df.clap);
      } else {
        ctx.translate(df.x, df.y);
        ctx.rotate(pose.rot);
        ctx.scale(pose.flip, 1);
        ctx.translate(0, -S * 0.26);           // feet on the edge
        drawRestingSide(t, df.clap);
      }
      ctx.restore();
    }
  }

  /* ---------- loop ---------- */
  let last = performance.now();
  df.tx = df.x + 100; df.ty = df.y - 60;
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
