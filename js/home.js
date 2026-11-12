/* ============================================================
   HOME PAGE — rotating images + clock
   To change the images: put your files in assets/work/ and edit
   this list. Videos work too (.mp4 / .webm), they autoplay muted.
   ============================================================ */
const WORKS = [
  'assets/work/01.jpg',
  'assets/work/02.jpg',
  'assets/work/03.jpg',
  'assets/work/04.jpg',
  'assets/work/05.jpg',
  'assets/work/06.jpg',
  'assets/work/07.jpg',
  'assets/work/08.jpg',
  'assets/work/09.jpg',
  'assets/work/10.jpg',
];

const CARD_COUNT = 14;      // how many "pages" in the fan
const SPIN_SPEED = 12;      // degrees per second when the mouse is still

/* ---------- build the fan ---------- */
const rotor = document.getElementById('rotor');
for (let i = 0; i < CARD_COUNT; i++) {
  const src = WORKS[i % WORKS.length];
  const card = document.createElement('div');
  card.className = 'card';
  card.style.transform = `rotateY(${(i * 360) / CARD_COUNT}deg)`;

  let media;
  if (/\.(mp4|webm|mov)$/i.test(src)) {
    media = document.createElement('video');
    Object.assign(media, { src, muted: true, loop: true, autoplay: true, playsInline: true });
  } else {
    media = document.createElement('img');
    media.src = src;
    media.alt = '';
    media.draggable = false;
  }
  card.appendChild(media);
  rotor.appendChild(card);
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
  cur.x += (target.x - cur.x) * Math.min(1, dt * 3);
  cur.y += (target.y - cur.y) * Math.min(1, dt * 3);

  const turn = spin + cur.x * 120;          // mouse left/right turns the fan
  const tilt = 10 - cur.y * 40;             // mouse up/down tilts it
  const lean = -18 + cur.x * 10;
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
