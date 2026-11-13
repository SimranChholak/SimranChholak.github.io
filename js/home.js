/* ============================================================
   HOME PAGE — rotating images + clock
   To change the images: put your files in assets/work/ and edit
   this list. Videos work too (.mp4 / .webm), they autoplay muted.
   ============================================================ */
const WORKS = [
  'assets/work/01.jpg',
  'assets/work/02.mp4',
  'assets/work/03.jpg',
  'assets/work/04.jpg',
  'assets/work/05.jpg',
  'assets/work/06.mp4',
  'assets/work/07.jpg',
  'assets/work/08.jpg',
  'assets/work/09.mp4',
  'assets/work/11.mp4',
];

const MEDIA_VERSION = 8;   // bump this number whenever you replace a file with the same name
const CARD_COUNT = WORKS.length;   // one page for each work
const SPIN_SPEED = 16;      // degrees per second around the spine

/* ---------- build the cluster ---------- */
const rotor = document.getElementById('rotor');
for (let i = 0; i < CARD_COUNT; i++) {
  const src = `${WORKS[i % WORKS.length]}?v=${MEDIA_VERSION}`;
  const card = document.createElement('div');
  card.className = 'card';
  card.style.transform = `rotateY(${(i * 360) / CARD_COUNT}deg) translateX(var(--gap)) translateY(-50%)`;

  let media;
  if (/\.(mp4|webm|mov)(\?|$)/i.test(src)) {
    media = document.createElement('video');
    media.muted = true; media.loop = true; media.autoplay = true; media.playsInline = true;
    media.setAttribute('muted', ''); media.setAttribute('playsinline', '');
    media.preload = 'auto';
    media.src = src;
  } else {
    media = document.createElement('img');
    media.src = src;
    media.alt = '';
    media.draggable = false;
    media.decoding = 'async';
  }
  card.appendChild(media);
  rotor.appendChild(card);
  if (media.play) media.play().catch(() => {});
}

/* ---------- rotation + mouse ---------- */
let target = { x: 0, y: 0 };      // mouse, -0.5 … 0.5
let cur = { x: 0, y: 0 };
let spin = 0;
let last = performance.now();

function onPointer(e) {
  const p = e.touches ? e.touches[0] : e;
  target.x = p.clientX / innerWidth - 0.5;
  target.y = p.clientY / innerHeight - 0.5;
}
addEventListener('mousemove', onPointer, { passive: true });
addEventListener('touchmove', onPointer, { passive: true });

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  spin += SPIN_SPEED * dt;
  // soft, weighty follow — the cluster lags behind the cursor a little
  const k = 1 - Math.pow(0.08, dt);
  cur.x += (target.x - cur.x) * k;
  cur.y += (target.y - cur.y) * k;

  // cursor up/down tumbles the cluster forward/back (all the way to the
  // edge-on "star" view at the top/bottom of the screen);
  // cursor left/right leans the spine and turns it.
  const tilt = 6 - cur.y * 170;
  const lean = -cur.x * 70;
  const turn = spin + cur.x * 90;
  rotor.style.transform = `rotateZ(${lean}deg) rotateX(${tilt}deg) rotateY(${turn}deg)`;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- India time ---------- */
const timeEl = document.getElementById('time');
const fmt = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
});
function tick() { timeEl.textContent = `${fmt.format(new Date())} GMT+5:30`; }
tick();
setInterval(tick, 1000);
