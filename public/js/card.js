(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const el = (tag, cls, html) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const COARSE = window.matchMedia('(pointer: coarse)').matches;
  const PALETTE = ['#ff4f9a', '#ffcb3d', '#4fc3f7', '#34d399', '#8b5cf6', '#ff9f6b', '#ff9cc8'];
  const TILE_COLORS = ['#ff9cc8', '#ffcb3d', '#4fc3f7', '#34d399', '#ebe2ff', '#ff9f6b'];

  gsap.registerPlugin(ScrollTrigger);
  ScrollTrigger.config({ ignoreMobileResize: true });

  let C = {};

  // ---------------------------------------------------------------
  // FX helpers
  // ---------------------------------------------------------------
  const fxLayer = $('#fxLayer');
  const fire = (opts) => window.confetti && window.confetti({ colors: PALETTE, disableForReducedMotion: true, ...opts });

  function burstAt(x, y, power = 1) {
    fire({
      particleCount: Math.round(40 * power),
      spread: 70 + 30 * power,
      startVelocity: 28 + 10 * power,
      scalar: 0.9,
      origin: { x: x / window.innerWidth, y: y / window.innerHeight },
    });
  }

  function bigCelebration() {
    const end = Date.now() + 1400;
    (function frame() {
      fire({ particleCount: 6, angle: 60, spread: 60, origin: { x: 0, y: 0.75 } });
      fire({ particleCount: 6, angle: 120, spread: 60, origin: { x: 1, y: 0.75 } });
      if (Date.now() < end) requestAnimationFrame(frame);
    })();
    fire({ particleCount: 140, spread: 110, startVelocity: 45, origin: { y: 0.55 } });
  }

  let sparkCount = 0;
  function spark(x, y, glyph, big) {
    if (REDUCED || sparkCount > 60) return;
    sparkCount++;
    const s = el('span', 'fx-spark', glyph || pick(['✨', '💖', '⭐', '💕', '🌸', '💫']));
    fxLayer.appendChild(s);
    const size = big ? rand(22, 34) : rand(12, 20);
    gsap.set(s, { x: x - size / 2, y: y - size / 2, fontSize: size, rotation: rand(-30, 30) });
    gsap.to(s, {
      x: `+=${rand(-60, 60) * (big ? 1.8 : 1)}`,
      y: `+=${rand(-90, -20) * (big ? 1.6 : 1)}`,
      rotation: `+=${rand(-120, 120)}`,
      opacity: 0,
      scale: big ? 1.3 : 0.6,
      duration: rand(0.7, 1.2),
      ease: 'power2.out',
      onComplete: () => { s.remove(); sparkCount--; },
    });
  }

  function emojiRain(glyphs, count = 40) {
    if (REDUCED) return;
    for (let i = 0; i < count; i++) {
      const s = el('span', 'fx-spark', pick(glyphs));
      fxLayer.appendChild(s);
      const size = rand(22, 46);
      gsap.set(s, { x: rand(0, window.innerWidth), y: -60, fontSize: size, rotation: rand(-40, 40) });
      gsap.to(s, {
        y: window.innerHeight + 80,
        x: `+=${rand(-80, 80)}`,
        rotation: `+=${rand(-200, 200)}`,
        duration: rand(2.2, 4),
        delay: rand(0, 1.8),
        ease: 'power1.in',
        onComplete: () => s.remove(),
      });
    }
  }

  // Sparkle trail that follows the finger / cursor.
  function initTrail() {
    if (REDUCED) return;
    let last = 0;
    const move = (x, y) => {
      const now = performance.now();
      if (now - last < (COARSE ? 70 : 45)) return;
      last = now;
      spark(x, y);
    };
    window.addEventListener('pointermove', (e) => move(e.clientX, e.clientY), { passive: true });
    window.addEventListener('pointerdown', (e) => {
      if (e.target.closest('input, textarea, .scratch__canvas, .deck')) return;
      for (let i = 0; i < 5; i++) spark(e.clientX, e.clientY, null, true);
    }, { passive: true });
  }

  // ---------------------------------------------------------------
  // Text bindings
  // ---------------------------------------------------------------
  const getPath = (path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), C);

  function bindText() {
    $$('[data-bind]').forEach((n) => {
      const v = getPath(n.dataset.bind);
      if (v != null && v !== '') n.textContent = v;
    });
  }

  // Split a heading into word spans for the bouncy reveal.
  function splitWords(node) {
    const words = node.textContent.trim().split(/\s+/);
    node.innerHTML = words.map((w) => `<span class="w" style="display:inline-block;overflow:hidden;vertical-align:top;padding:0 0.04em 0.12em;margin-bottom:-0.12em"><span class="wi" style="display:inline-block">${esc(w)}</span></span>`).join(' ');
    return $$('.wi', node);
  }

  // ---------------------------------------------------------------
  // Gate
  // ---------------------------------------------------------------
  function initGate() {
    const gate = $('#gate');
    let opened = false;

    gsap.from('.gate__title', { y: -40, opacity: 0, duration: 0.8, ease: 'back.out(2)' });
    gsap.from('.gift', { scale: 0, rotation: -20, duration: 1, ease: 'elastic.out(1, 0.5)', delay: 0.15 });
    gsap.from(['.gate__sub', '.gate__cta'], { y: 30, opacity: 0, stagger: 0.12, duration: 0.6, delay: 0.5, ease: 'power3.out' });

    const open = () => {
      if (opened) return;
      opened = true;
      Sound.pop();
      Sound.fanfare();
      const gift = $('.gift');
      gift.style.animation = 'none';
      const r = gift.getBoundingClientRect();
      const tl = gsap.timeline();
      tl.to(gift, { scaleX: 1.15, scaleY: 0.85, duration: 0.12, ease: 'power2.out' })
        .to(gift, { scaleX: 1, scaleY: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' })
        .to('.gift__lid', { y: -220, x: -60, rotation: -40, duration: 0.8, ease: 'power3.out' }, '<')
        .add(() => {
          fire({ particleCount: 160, spread: 100, startVelocity: 48, origin: { x: (r.left + r.width / 2) / innerWidth, y: (r.top + 20) / innerHeight } });
          emojiRain(['🎉', '🎈', '💖', '🎂', '✨'], 26);
        }, '<0.1')
        .to(['.gate__title', '.gate__sub', '.gate__cta'], { opacity: 0, y: -20, duration: 0.3 }, '<')
        .to(gate, { yPercent: -100, duration: 0.9, ease: 'power4.inOut' }, '+=0.35')
        .add(() => {
          gate.remove();
          document.body.classList.remove('is-locked');
          window.scrollTo(0, 0);
          const mb = $('#musicBtn');
          if (mb) {
            Sound.startMusic();
            mb.hidden = false;
            mb.classList.toggle('is-off', !Sound.isPlaying);
            gsap.from(mb, { scale: 0, duration: 0.6, ease: 'back.out(3)' });
          }
          playHeroIntro();
          ScrollTrigger.refresh();
        });
    };

    openGate = open;
    if (gateRequested) open();
  }

  // Taps are listened for before the content has loaded, so an early tap on a
  // slow connection isn't lost. Audio is unlocked inside that same gesture
  // (iOS only allows it there); the gate opens as soon as the card is built.
  let openGate = null;
  let gateRequested = false;
  function requestOpen() {
    Sound.unlock();
    if (openGate) openGate();
    else gateRequested = true;
  }
  $('#giftBtn').addEventListener('click', requestOpen);
  $('#gateCta').addEventListener('click', requestOpen);

  // ---------------------------------------------------------------
  // Hero
  // ---------------------------------------------------------------
  let heroTiles = [];
  let heroChars = [];

  function buildHero() {
    const line = $('#heroLine');
    const words = (C.hero?.line || 'Happy Birthday').toUpperCase().split(/\s+/);
    let ci = 0;
    words.forEach((w, wi) => {
      if (wi > 0) line.appendChild(el('span', 'space'));
      for (const ch of w) {
        const t = el('span', 'tile', esc(ch));
        t.style.background = TILE_COLORS[ci++ % TILE_COLORS.length];
        line.appendChild(t);
        heroTiles.push(t);
      }
    });
    // One line per word, sized so the longest word fits the screen.
    const name = $('#heroName');
    name.innerHTML = String(C.herName || '').trim().split(/\s+/)
      .map((w) => `<span class="nm-word">${Array.from(w).map((ch) => `<span class="ch">${esc(ch)}</span>`).join('')}</span>`)
      .join('');
    heroChars = $$('.ch', name);
    fitName();
    let lastW = window.innerWidth;
    window.addEventListener('resize', () => { if (window.innerWidth !== lastW) { lastW = window.innerWidth; fitName(); } });
    gsap.set([heroTiles, heroChars, '.hero__eyebrow', '.hero__sub', '.hero__hint', '.scroll-cue'], { opacity: 0 });
  }

  function fitName() {
    const name = $('#heroName');
    name.style.fontSize = '';
    const avail = Math.min(name.parentElement.clientWidth, window.innerWidth - 32);
    const widest = Math.max(...$$('.nm-word', name).map((w) => w.scrollWidth));
    if (widest > avail) {
      const fs = parseFloat(getComputedStyle(name).fontSize);
      name.style.fontSize = `${Math.floor(fs * (avail / widest) * 0.96)}px`;
    }
  }

  function playHeroIntro() {
    const tl = gsap.timeline({ defaults: { ease: 'back.out(2.2)' } });
    tl.fromTo('.hero__eyebrow', { y: -30, opacity: 0, rotation: -8 }, { y: 0, opacity: 1, rotation: -2, duration: 0.6 })
      .fromTo(heroTiles, { y: -120, opacity: 0, rotation: () => rand(-40, 40), scale: 0.4 }, {
        y: 0, opacity: 1, rotation: () => rand(-7, 7), scale: 1, duration: 0.7, stagger: 0.05,
        onStart: () => heroTiles.forEach((_, i) => setTimeout(() => Sound.blip(i), i * 50)),
      }, '-=0.2')
      .fromTo(heroChars, { y: 160, opacity: 0, scale: 0.3, rotation: () => rand(-50, 50) }, {
        y: 0, opacity: 1, scale: 1, rotation: 0, duration: 1.1, stagger: 0.08, ease: 'elastic.out(1, 0.45)',
      }, '-=0.3')
      .add(() => {
        const r = $('#heroName').getBoundingClientRect();
        burstAt(r.left + r.width / 2, r.top + r.height / 2, 1.6);
      }, '-=0.7')
      .fromTo(['.hero__sub', '.hero__hint', '.scroll-cue'], { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.12, ease: 'power3.out' }, '-=0.5')
      .add(startHeroLoops);
    startBalloons();
  }

  function startHeroLoops() {
    if (REDUCED) return;
    gsap.to(heroChars, { y: -14, duration: 0.9, ease: 'sine.inOut', stagger: { each: 0.12, repeat: -1, yoyo: true } });
    heroTiles.forEach((t) => {
      gsap.to(t, { rotation: `+=${rand(-6, 6)}`, y: rand(-5, 5), duration: rand(1.2, 2), repeat: -1, yoyo: true, ease: 'sine.inOut' });
    });
    // Tiles bounce when tapped.
    heroTiles.forEach((t, i) => t.addEventListener('pointerdown', () => {
      Sound.blip(i);
      gsap.fromTo(t, { scale: 1.35 }, { scale: 1, duration: 0.6, ease: 'elastic.out(1.2, 0.35)' });
    }));
    $('.hero__line').style.pointerEvents = 'auto';

    // Parallax on scroll.
    gsap.to('.hero__content', { yPercent: 25, opacity: 0.2, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__blobs', { yPercent: 40, ease: 'none', scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true } });
  }

  // Poppable balloons
  let popped = 0;
  function startBalloons() {
    const wrap = $('#balloons');
    const n = window.innerWidth < 600 ? 7 : 11;
    for (let i = 0; i < n; i++) setTimeout(() => spawnBalloon(wrap, i), i * 650);
  }

  function spawnBalloon(wrap, i) {
    const b = el('button', 'balloon', '<span class="balloon__body"></span><span class="balloon__string"></span>');
    b.setAttribute('aria-label', 'Pop balloon');
    b.style.setProperty('--c', PALETTE[i % PALETTE.length]);
    const size = rand(0.75, 1.15);
    const w = window.innerWidth;
    b.style.left = `${rand(2, 88)}%`;
    wrap.appendChild(b);
    gsap.set(b, { scale: size });
    const h = wrap.offsetHeight || window.innerHeight;
    const rise = gsap.fromTo(b, { y: 0 }, {
      y: -(h + 260), duration: rand(9, 15), ease: 'none',
      onComplete: () => { b.remove(); spawnBalloon(wrap, i + 1); },
    });
    const sway = gsap.to(b, { x: rand(-40, 40) * (w < 600 ? 0.6 : 1), rotation: rand(-10, 10), duration: rand(1.6, 2.6), repeat: -1, yoyo: true, ease: 'sine.inOut' });
    if (REDUCED) rise.progress(rand(0.2, 0.6)).pause();

    b.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      rise.kill();
      sway.kill();
      Sound.pop();
      const r = b.getBoundingClientRect();
      burstAt(r.left + r.width / 2, r.top + r.height / 2, 0.8);
      for (let k = 0; k < 4; k++) spark(r.left + r.width / 2, r.top + r.height / 2, pick(['💥', '✨', '🎉']), true);
      popped++;
      const hint = $('.hero__hint');
      const lines = ['nice! 🎈', 'POP! 💥', 'you are on fire 🔥', 'balloon assassin 😂', 'okay pro popper 🏆', 'keep going!! 🎉'];
      hint.textContent = `${popped} popped · ${lines[popped % lines.length]}`;
      gsap.fromTo(hint, { scale: 1.3 }, { scale: 1, duration: 0.5, ease: 'back.out(3)' });
      gsap.to(b, {
        scale: size * 1.6, opacity: 0, duration: 0.18, ease: 'power2.out',
        onComplete: () => { b.remove(); setTimeout(() => spawnBalloon(wrap, i + 3), 1200); },
      });
    });
  }

  // ---------------------------------------------------------------
  // Marquees (speed reacts to scroll velocity)
  // ---------------------------------------------------------------
  function buildMarquee(id, words, dir) {
    const track = $(id);
    const chunk = words.map((w) => `<span>${esc(w)}</span>`).join('');
    track.innerHTML = chunk.repeat(4);
    const tween = gsap.fromTo(track, { xPercent: dir > 0 ? -50 : 0 }, { xPercent: dir > 0 ? 0 : -50, duration: 26, ease: 'none', repeat: -1 });
    if (REDUCED) { tween.pause(); return; }
    ScrollTrigger.create({
      trigger: track.parentElement,
      start: 'top bottom',
      end: 'bottom top',
      onUpdate: (self) => {
        const v = Math.min(Math.abs(self.getVelocity()) / 300, 6);
        gsap.to(tween, { timeScale: 1 + v, duration: 0.2, overwrite: true });
        gsap.to(tween, { timeScale: 1, duration: 1.2, delay: 0.2 });
      },
    });
  }

  // ---------------------------------------------------------------
  // Section heading reveals
  // ---------------------------------------------------------------
  function initHeadings() {
    $$('.sec-head').forEach((head) => {
      const title = $('.sec-title', head);
      const words = title ? splitWords(title) : [];
      const tl = gsap.timeline({ scrollTrigger: { trigger: head, start: 'top 82%' } });
      tl.from($('.sticker-tag', head), { scale: 0, rotation: -40, duration: 0.6, ease: 'back.out(3)' })
        .from(words, { yPercent: 110, rotation: 6, duration: 0.7, stagger: 0.06, ease: 'back.out(1.8)' }, '-=0.35')
        .from($$('.sec-sub', head), { y: 16, opacity: 0, duration: 0.5, stagger: 0.1 }, '-=0.4');
    });
  }

  // ---------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------
  function buildStats() {
    const list = [...(C.stats || [])];
    if (C.metDate) {
      const days = Math.floor((Date.now() - new Date(C.metDate).getTime()) / 86400000);
      if (days > 0) list.unshift({ value: String(days), suffix: '', label: 'days of us 💞' });
    }
    const wrap = $('#stats');
    if (!list.length) { wrap.closest('section').remove(); return; }
    list.forEach((s) => {
      const card = el('div', 'stat', `<div class="stat__num"><span class="n">0</span>${esc(s.suffix || '')}</div><div class="stat__label">${esc(s.label)}</div>`);
      wrap.appendChild(card);
      const target = parseFloat(String(s.value).replace(/[^\d.]/g, ''));
      const n = $('.n', card);
      if (!Number.isFinite(target)) { n.textContent = s.value; return; }
      const obj = { v: 0 };
      ScrollTrigger.create({
        trigger: card,
        start: 'top 88%',
        once: true,
        onEnter: () => gsap.to(obj, { v: target, duration: 2, ease: 'power2.out', onUpdate: () => { n.textContent = Math.round(obj.v).toLocaleString(); } }),
      });
    });
    gsap.from('.stat', { y: 80, opacity: 0, scale: 0.8, duration: 0.8, stagger: 0.12, ease: 'back.out(1.7)', scrollTrigger: { trigger: wrap, start: 'top 85%' } });
  }

  // ---------------------------------------------------------------
  // Cake
  // ---------------------------------------------------------------
  function buildCake() {
    const count = Math.max(1, Math.min(9, Number(C.cake?.candles) || 5));
    const wrap = $('#candles');
    let out = 0;
    for (let i = 0; i < count; i++) {
      const c = el('button', 'candle', '<span class="candle__wick"></span><span class="candle__flame"></span><span class="candle__smoke"></span>');
      c.setAttribute('aria-label', `Blow out candle ${i + 1}`);
      c.style.height = `${[64, 72, 58, 68, 62][i % 5]}px`;
      wrap.appendChild(c);
      c.addEventListener('click', () => {
        if (c.classList.contains('is-out')) return;
        c.classList.add('is-out');
        Sound.whoosh();
        out++;
        gsap.fromTo(c, { rotation: -6 }, { rotation: 0, duration: 0.6, ease: 'elastic.out(1.2, 0.3)' });
        if (out === count) wishMade();
      });
    }
    gsap.from('.cake', { y: 80, scale: 0.7, opacity: 0, duration: 1, ease: 'back.out(1.6)', scrollTrigger: { trigger: '.cake-stage', start: 'top 80%' } });
    gsap.from('.candle', { y: -60, opacity: 0, stagger: 0.08, duration: 0.6, ease: 'bounce.out', scrollTrigger: { trigger: '.cake-stage', start: 'top 75%' } });
  }

  function wishMade() {
    Sound.fanfare();
    bigCelebration();
    emojiRain(['🎂', '✨', '🌟', '💖', '🥳'], 30);
    const done = $('#cakeDone');
    done.hidden = false;
    gsap.fromTo(done, { scale: 0.4, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: -1.5, duration: 0.9, ease: 'elastic.out(1, 0.5)' });
    gsap.fromTo('.cake', { y: 0 }, { y: -18, duration: 0.25, yoyo: true, repeat: 3, ease: 'power1.inOut' });
    ScrollTrigger.refresh();
  }

  // ---------------------------------------------------------------
  // Memories: swipe deck + film strip
  // ---------------------------------------------------------------
  let photos = [];

  function buildMemories() {
    photos = (C.memories?.photos || []).filter((p) => p && p.src);
    const deck = $('#deck');
    const items = photos.length
      ? photos
      : [
          { emoji: '📸', caption: 'Our best memories go here' },
          { emoji: '🥰', caption: 'You + me = favourite' },
          { emoji: '🌸', caption: 'More adventures soon' },
        ];

    const cards = items.map((p, i) => {
      const card = el('div', `polaroid${p.src ? '' : ' polaroid--empty'}`);
      card.innerHTML = `
        <span class="polaroid__tape"></span>
        <div class="polaroid__img">${p.src ? `<img src="${esc(p.src)}" alt="${esc(p.caption || 'Memory')}" ${i > 2 ? 'loading="lazy"' : ''} decoding="async" draggable="false" />` : esc(p.emoji)}</div>
        <div class="polaroid__cap">${esc(p.caption || '')}${p.date ? `<span class="polaroid__date">${esc(formatDate(p.date))}</span>` : ''}</div>`;
      card._data = p;
      card._tilt = (i % 2 ? 1 : -1) * rand(2, 5);
      deck.appendChild(card);
      return card;
    });

    let order = cards.slice(); // order[0] is the top card
    let current = 0;
    const count = $('#deckCount');

    function layout(animate = true) {
      order.forEach((card, i) => {
        card.style.zIndex = String(order.length - i);
        const props = {
          x: 0,
          y: Math.min(i, 3) * 12,
          scale: 1 - Math.min(i, 3) * 0.05,
          rotation: i === 0 ? card._tilt * 0.4 : card._tilt,
          opacity: i < 4 ? 1 : 0,
        };
        if (animate) gsap.to(card, { ...props, duration: 0.5, ease: 'back.out(1.4)' });
        else gsap.set(card, props);
      });
      count.textContent = `${current + 1} / ${order.length}`;
    }

    function flingTop(dir) {
      if (order.length < 2) {
        gsap.fromTo(order[0], { x: dir * 30 }, { x: 0, duration: 0.6, ease: 'elastic.out(1, 0.3)' });
        return;
      }
      const top = order.shift();
      order.push(top);
      current = (current + 1) % order.length;
      Sound.whoosh();
      gsap.to(top, {
        x: dir * (window.innerWidth * 0.9),
        y: -40,
        rotation: dir * 35,
        duration: 0.4,
        ease: 'power2.in',
        onComplete: () => {
          top.style.zIndex = '0';
          gsap.set(top, { x: 0, y: 36, rotation: top._tilt, scale: 0.85, opacity: 0 });
          layout();
        },
      });
      count.textContent = `${current + 1} / ${order.length}`;
    }

    function prev() {
      if (order.length < 2) return;
      const last = order.pop();
      order.unshift(last);
      current = (current - 1 + order.length) % order.length;
      Sound.whoosh();
      last.style.zIndex = String(order.length + 1);
      gsap.fromTo(last, { x: -window.innerWidth * 0.8, rotation: -30, opacity: 1 }, { x: 0, rotation: last._tilt * 0.4, duration: 0.5, ease: 'back.out(1.2)', onComplete: () => layout() });
      layout();
    }

    $('#deckNext').addEventListener('click', () => flingTop(1));
    $('#deckPrev').addEventListener('click', prev);

    // Drag the top card.
    let drag = null;
    deck.addEventListener('pointerdown', (e) => {
      const card = e.target.closest('.polaroid');
      if (!card || card !== order[0]) return;
      drag = { card, x0: e.clientX, y0: e.clientY, dx: 0, t0: performance.now(), id: e.pointerId, moved: false };
      gsap.killTweensOf(card);
    });
    deck.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      drag.dx = e.clientX - drag.x0;
      const dy = e.clientY - drag.y0;
      if (!drag.moved && Math.abs(drag.dx) > 6 && Math.abs(drag.dx) > Math.abs(dy)) {
        drag.moved = true;
        try { deck.setPointerCapture(e.pointerId); } catch {}
      }
      if (drag.moved) gsap.set(drag.card, { x: drag.dx, y: dy * 0.2, rotation: drag.dx / 14 });
    });
    const end = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const { card, dx, moved, t0 } = drag;
      drag = null;
      if (!moved) {
        if (e.type === 'pointerup' && card._data.src) openLightbox(card._data);
        return;
      }
      const v = Math.abs(dx) / (performance.now() - t0);
      if (Math.abs(dx) > 90 || v > 0.6) flingTop(dx > 0 ? 1 : -1);
      else gsap.to(card, { x: 0, y: 0, rotation: card._tilt * 0.4, duration: 0.7, ease: 'elastic.out(1, 0.4)' });
    };
    deck.addEventListener('pointerup', end);
    deck.addEventListener('pointercancel', end);

    layout(false);
    gsap.from(cards.slice(0, 4), {
      y: 200, rotation: () => rand(-40, 40), opacity: 0, duration: 0.9, stagger: 0.1, ease: 'back.out(1.4)',
      scrollTrigger: { trigger: deck, start: 'top 80%' },
    });

    buildFilm();
  }

  function buildFilm() {
    const film = $('#film');
    if (photos.length < 3) { film.remove(); return; }
    const half = Math.ceil(photos.length / 2);
    const rowA = photos.length >= 8 ? photos.slice(0, half) : photos;
    const rowB = photos.length >= 8 ? photos.slice(half) : photos.slice().reverse();
    [[$('#filmA'), rowA, -1], [$('#filmB'), rowB, 1]].forEach(([track, list, dir]) => {
      // Repeat so one half of the track is always wider than the screen.
      let reps = Math.max(2, Math.ceil((window.innerWidth * 1.2) / (list.length * 146)) * 2);
      if (reps % 2) reps++;
      for (let r = 0; r < reps; r++) {
        list.forEach((p) => {
          const b = el('button', 'film__item', `<img src="${esc(p.src)}" alt="" loading="lazy" decoding="async" />`);
          b.tabIndex = -1;
          b.addEventListener('click', () => openLightbox(p));
          track.appendChild(b);
        });
      }
      const t = gsap.fromTo(track, { xPercent: dir < 0 ? 0 : -50 }, { xPercent: dir < 0 ? -50 : 0, duration: list.length * 4, ease: 'none', repeat: -1 });
      if (REDUCED) t.pause();
    });
    film.removeAttribute('aria-hidden');
  }

  function formatDate(d) {
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return d;
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  // Lightbox
  function openLightbox(p) {
    const lb = $('#lightbox');
    $('#lightboxImg').src = p.src;
    $('#lightboxCap').textContent = [p.caption, p.date ? formatDate(p.date) : ''].filter(Boolean).join(' · ');
    lb.hidden = false;
    gsap.fromTo(lb, { opacity: 0 }, { opacity: 1, duration: 0.25 });
    gsap.fromTo('#lightbox figure', { scale: 0.6, rotation: -8 }, { scale: 1, rotation: 0, duration: 0.6, ease: 'back.out(1.8)' });
  }
  function closeLightbox() {
    const lb = $('#lightbox');
    gsap.to(lb, { opacity: 0, duration: 0.2, onComplete: () => { lb.hidden = true; } });
  }

  // ---------------------------------------------------------------
  // Memes
  // ---------------------------------------------------------------
  function buildMemes() {
    const wrap = $('#memes');
    const items = (C.memes?.items || []).filter((m) => m && m.src);
    if (!items.length) { wrap.closest('section').remove(); return; }
    items.forEach((m) => {
      const f = el('figure', 'meme', `<div class="meme__img"><img src="${esc(m.src)}" alt="${esc(m.caption || 'meme')}" loading="lazy" decoding="async" /></div><figcaption>${esc(m.caption || '')}</figcaption>`);
      wrap.appendChild(f);
      f.addEventListener('click', (e) => {
        Sound.blip(Math.floor(rand(0, 6)));
        gsap.fromTo(f, { rotation: -6, scale: 1.06 }, { rotation: getComputedStyle(f).getPropertyValue('--tilt') || 0, scale: 1, duration: 0.9, ease: 'elastic.out(1.2, 0.3)' });
        for (let i = 0; i < 6; i++) spark(e.clientX, e.clientY, pick(['😂', '🤣', '💀', '🤡', '😭']), true);
      });
    });
    $$('.meme', wrap).forEach((m) => {
      const tilt = parseFloat(getComputedStyle(m).getPropertyValue('--tilt')) || 0;
      gsap.fromTo(m, { y: 120, rotation: tilt * 6, scale: 0.7, opacity: 0 }, {
        y: 0, rotation: tilt, scale: 1, opacity: 1, duration: 0.9, ease: 'back.out(1.6)',
        scrollTrigger: { trigger: m, start: 'top 90%' },
      });
    });
  }

  // ---------------------------------------------------------------
  // Letter
  // ---------------------------------------------------------------
  function buildLetter() {
    const body = $('#letterBody');
    const paras = String(C.letter?.body || '').split(/\n\s*\n/).filter(Boolean);
    body.innerHTML = paras.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    const gif = $('#letterGif');
    if (C.letter?.gif) gif.src = C.letter.gif;
    else gif.remove();

    const env = $('#envelope');
    gsap.from(env, { y: 100, rotation: -10, opacity: 0, duration: 1, ease: 'back.out(1.5)', scrollTrigger: { trigger: env, start: 'top 85%' } });
    // Explicit keyframes that always settle at 0deg, so the wiggle can never
    // leave the envelope tilted (e.g. if it fires mid slide-in).
    const wiggle = () => {
      if (REDUCED || env.classList.contains('is-open') || gsap.isTweening(env)) return;
      gsap.to(env, { keyframes: [{ rotation: 3 }, { rotation: -3 }, { rotation: 2 }, { rotation: -2 }, { rotation: 0 }], duration: 0.6, ease: 'none' });
    };
    const idle = setInterval(wiggle, 3000);

    let opened = false;
    const open = () => {
      if (opened) return;
      opened = true;
      clearInterval(idle);
      gsap.killTweensOf(env);
      gsap.set(env, { rotation: 0, y: 0, opacity: 1 });
      Sound.chime();
      const letter = $('#letter');
      const lines = $$('p, .letter__gif, .letter__sign', letter);
      gsap.set(lines, { opacity: 0, y: 14 });
      const tl = gsap.timeline();
      tl.to('.envelope__seal', { scale: 0, rotation: 180, duration: 0.35, ease: 'back.in(2)' })
        .to('.envelope__flap', { rotationX: 180, duration: 0.6, ease: 'power2.inOut' })
        .set('.envelope__flap', { zIndex: 1 })
        .to(letter, { y: -150, duration: 0.7, ease: 'power3.out' })
        .add(() => {
          const startH = letter.offsetHeight;
          env.classList.add('is-open');
          gsap.set(letter, { y: 0 });
          gsap.fromTo(env, { marginTop: 130 }, { marginTop: 24, duration: 0.9, ease: 'power3.inOut' });
          gsap.fromTo(letter, { height: startH }, {
            height: 'auto', duration: 0.9, ease: 'power3.inOut',
            onComplete: () => { gsap.set([env, letter], { clearProps: 'transform' }); ScrollTrigger.refresh(); },
          });
          const r = letter.getBoundingClientRect();
          burstAt(r.left + r.width / 2, r.top + 40, 1);
          emojiRain(['💌', '💖', '💕'], 16);
        })
        .to(lines, { opacity: 1, y: 0, duration: 0.7, stagger: 0.35, ease: 'power2.out' }, '+=0.3');
    };
    env.addEventListener('click', open);
    env.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  }

  // ---------------------------------------------------------------
  // Reasons (flip cards)
  // ---------------------------------------------------------------
  function buildReasons() {
    const wrap = $('#reasons');
    const items = (C.reasons?.items || []).filter((r) => r && r.text);
    if (!items.length) { wrap.closest('section').remove(); return; }
    items.forEach((r, i) => {
      const b = el('button', 'flip');
      b.style.setProperty('--c', TILE_COLORS[i % TILE_COLORS.length]);
      b.setAttribute('aria-label', `Reason ${i + 1}`);
      b.innerHTML = `<span class="flip__inner">
          <span class="flip__face flip__front"><b>#${i + 1}</b><small>tap me</small></span>
          <span class="flip__face flip__back"><span>${esc(r.emoji || '💖')}</span><p>${esc(r.text)}</p></span>
        </span>`;
      b.addEventListener('click', (e) => {
        const flipped = b.classList.toggle('is-flipped');
        b.setAttribute('aria-pressed', String(flipped));
        Sound.blip(i);
        if (flipped) for (let k = 0; k < 5; k++) spark(e.clientX || innerWidth / 2, e.clientY || innerHeight / 2, pick(['💖', '💕', '🥰']), true);
      });
      wrap.appendChild(b);
    });
    gsap.from('.flip', {
      y: 90, rotation: () => rand(-25, 25), scale: 0.6, opacity: 0, duration: 0.8, ease: 'back.out(1.7)',
      stagger: { each: 0.08, from: 'random' },
      scrollTrigger: { trigger: wrap, start: 'top 82%' },
    });
  }

  // ---------------------------------------------------------------
  // Scratch card
  // ---------------------------------------------------------------
  function buildScratch() {
    const box = $('#scratch');
    const cv = $('#scratchCanvas');
    const ctx = cv.getContext('2d');
    let done = false;
    let w = 0;
    let h = 0;

    function paint() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = box.clientWidth;
      h = box.clientHeight;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      const g = ctx.createLinearGradient(0, 0, w, h);
      g.addColorStop(0, '#f7c948');
      g.addColorStop(0.35, '#fff1a8');
      g.addColorStop(0.55, '#f4b625');
      g.addColorStop(1, '#ffdf6e');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      for (let i = 0; i < 70; i++) {
        ctx.beginPath();
        ctx.arc(Math.random() * w, Math.random() * h, Math.random() * 2.4 + 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#2b1740';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${Math.round(w / 12)}px Fredoka, sans-serif`;
      ctx.fillText('SCRATCH ME ✨', w / 2, h / 2 - 12);
      ctx.font = `600 ${Math.round(w / 22)}px Nunito, sans-serif`;
      ctx.fillText('there is a surprise underneath', w / 2, h / 2 + 24);
    }

    // Repaint once fonts are in so the canvas text uses Fredoka.
    paint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (!done) paint(); });

    let last = null;
    let moves = 0;
    function scratchTo(x, y) {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = Math.max(36, w / 9);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      if (last) ctx.moveTo(last.x, last.y);
      else ctx.moveTo(x - 0.1, y);
      ctx.lineTo(x, y);
      ctx.stroke();
      last = { x, y };
      if (++moves % 12 === 0) checkCleared();
      if (moves % 5 === 0) {
        const r = cv.getBoundingClientRect();
        spark(r.left + x, r.top + y, pick(['✨', '⭐', '💛']));
      }
    }

    function checkCleared() {
      const data = ctx.getImageData(0, 0, cv.width, cv.height).data;
      let clear = 0;
      let total = 0;
      for (let i = 3; i < data.length; i += 4 * 40) {
        total++;
        if (data[i] === 0) clear++;
      }
      if (clear / total > 0.5) reveal();
    }

    function reveal() {
      if (done) return;
      done = true;
      box.classList.add('is-done');
      Sound.fanfare();
      bigCelebration();
      emojiRain(['💘', '💖', '🥰', '✨'], 34);
      gsap.fromTo('.scratch__under', { scale: 0.85 }, { scale: 1, duration: 0.9, ease: 'elastic.out(1.1, 0.4)' });
      gsap.fromTo('.scratch__emoji', { scale: 0.2, rotation: -40 }, { scale: 1, rotation: 0, duration: 1.1, ease: 'elastic.out(1.2, 0.35)' });
    }

    const pos = (e) => {
      const r = cv.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    let down = false;
    cv.addEventListener('pointerdown', (e) => {
      down = true;
      last = null;
      try { cv.setPointerCapture(e.pointerId); } catch {}
      const p = pos(e);
      scratchTo(p.x, p.y);
    });
    cv.addEventListener('pointermove', (e) => {
      if (!down) return;
      const p = pos(e);
      scratchTo(p.x, p.y);
    });
    const up = () => { down = false; last = null; if (!done) checkCleared(); };
    cv.addEventListener('pointerup', up);
    cv.addEventListener('pointercancel', up);

    let rw = box.clientWidth;
    window.addEventListener('resize', () => {
      if (done || box.clientWidth === rw) return;
      rw = box.clientWidth;
      paint();
    });

    gsap.from(box, { scale: 0.6, rotation: 8, opacity: 0, duration: 1, ease: 'elastic.out(1, 0.55)', scrollTrigger: { trigger: box, start: 'top 85%' } });
  }

  // ---------------------------------------------------------------
  // Programme timeline
  // ---------------------------------------------------------------
  function buildProgramme() {
    const list = $('#timeline');
    const items = (C.programme?.items || []).filter((p) => p && (p.title || p.time));
    if (!items.length) { list.closest('section').remove(); return; }
    items.forEach((p, i) => {
      const li = el('li', 'tl-item');
      li.style.setProperty('--c', TILE_COLORS[i % TILE_COLORS.length]);
      const place = p.place
        ? `<p class="tl-item__place">📍 <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.place)}" target="_blank" rel="noopener">${esc(p.place)}</a></p>`
        : '';
      li.innerHTML = `
        <span class="tl-item__dot">${esc(p.emoji || '💖')}</span>
        <div class="tl-item__card">
          ${p.time ? `<span class="tl-item__time">${esc(p.time)}</span>` : ''}
          <h3 class="tl-item__title">${esc(p.title || '')}</h3>
          ${p.desc ? `<p class="tl-item__desc">${esc(p.desc)}</p>` : ''}
          ${place}
        </div>`;
      list.appendChild(li);
      gsap.from($('.tl-item__dot', li), { scale: 0, rotation: -180, duration: 0.7, ease: 'back.out(2.5)', scrollTrigger: { trigger: li, start: 'top 85%' } });
      gsap.from($('.tl-item__card', li), { x: 60, opacity: 0, rotation: 4, duration: 0.7, ease: 'back.out(1.5)', scrollTrigger: { trigger: li, start: 'top 85%' } });
    });

    // A wiggly dashed line that "draws" itself as you scroll.
    const svg = $('.timeline__path', list);
    const path = $('#timelinePath');
    function drawPath() {
      const dots = $$('.tl-item__dot', list);
      if (!dots.length) return;
      const lr = list.getBoundingClientRect();
      const y0 = dots[0].getBoundingClientRect().top - lr.top + 23;
      const y1 = dots[dots.length - 1].getBoundingClientRect().top - lr.top + 23;
      let d = `M 23 ${y0}`;
      const seg = 40;
      let flip = 1;
      for (let y = y0; y < y1; y += seg) {
        const ny = Math.min(y + seg, y1);
        d += ` Q ${23 + 12 * flip} ${(y + ny) / 2} 23 ${ny}`;
        flip *= -1;
      }
      path.setAttribute('d', d);
    }
    drawPath();
    if (window.ResizeObserver) new ResizeObserver(drawPath).observe(list);

    const clip = { p: 100 };
    const setClip = () => {
      const v = `inset(0 0 ${clip.p}% 0)`;
      svg.style.webkitClipPath = v;
      svg.style.clipPath = v;
    };
    setClip();
    gsap.to(clip, { p: 0, ease: 'none', onUpdate: setClip, scrollTrigger: { trigger: list, start: 'top 75%', end: 'bottom 70%', scrub: 0.6 } });
  }

  // ---------------------------------------------------------------
  // RSVP
  // ---------------------------------------------------------------
  function buildChips(id, options) {
    const wrap = $(id);
    let value = '';
    (options || []).forEach((opt) => {
      const c = el('button', 'chip', esc(opt));
      c.type = 'button';
      c.setAttribute('role', 'radio');
      c.setAttribute('aria-checked', 'false');
      c.addEventListener('click', () => {
        const on = c.getAttribute('aria-checked') !== 'true';
        $$('.chip', wrap).forEach((x) => x.setAttribute('aria-checked', 'false'));
        c.setAttribute('aria-checked', String(on));
        value = on ? opt : '';
        Sound.blip(Math.floor(rand(0, 6)));
        gsap.fromTo(c, { scale: 1.2 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' });
      });
      wrap.appendChild(c);
    });
    if (!options || !options.length) wrap.closest('.rsvp__field').remove();
    return () => value;
  }

  function waNumber(raw) {
    let n = String(raw || '').replace(/\D/g, '');
    if (n.startsWith('0')) n = `6${n}`; // Malaysian local format -> 60...
    return n;
  }

  function buildMessage(vals) {
    const tpl = String(C.rsvp?.message || '');
    const map = {
      name: C.herName || '',
      nickname: C.nickname || C.herName || '',
      date: C.programme?.dateLabel || 'tomorrow',
      food: vals.food,
      vibe: vals.vibe,
      note: vals.note,
    };
    return tpl
      .split('\n')
      .filter((line) => {
        const keys = [...line.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);
        return keys.every((k) => !(k in map) || String(map[k]).trim() !== '');
      })
      .join('\n')
      .replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m))
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function buildRsvp() {
    const waiting = $('#waitingGif');
    if (C.rsvp?.waitingGif) waiting.src = C.rsvp.waitingGif;
    else waiting.closest('.rsvp__waiting').remove();

    const getFood = buildChips('#foodChips', C.rsvp?.foodOptions);
    const getVibe = buildChips('#vibeChips', C.rsvp?.vibeOptions);
    const note = $('#rsvpNote');
    const yes = $('#yesBtn');
    const no = $('#noBtn');
    const card = $('.rsvp');
    const tease = $('#noTease');
    let attempts = 0;
    let answered = false;

    gsap.from(card, { y: 120, rotation: -6, opacity: 0, duration: 1, ease: 'back.out(1.4)', scrollTrigger: { trigger: card, start: 'top 85%' } });

    const lines = [
      'Nice try 😜',
      'Wrong button, sayang 🙈',
      'The No button is on vacation 🏖️',
      'Think about the food first 🍣',
      'Error 404: “No” not found',
      'Okay now it is just shy 🫣',
    ];

    function runAway() {
      attempts++;
      Sound.blip(attempts);
      tease.textContent = lines[(attempts - 1) % lines.length];
      gsap.fromTo(tease, { scale: 1.3, rotation: -4 }, { scale: 1, rotation: 0, duration: 0.5, ease: 'back.out(3)' });
      gsap.to(yes, { scale: Math.min(1 + attempts * 0.09, 1.55), duration: 0.4, ease: 'back.out(2)' });

      if (attempts >= 6) {
        no.classList.remove('is-runaway');
        no.style.left = '';
        no.style.top = '';
        $('#rsvpActions').appendChild(no);
        no.innerHTML = '<span>Fine, YES 😤💖</span>';
        no.classList.add('btn--yes');
        no.classList.remove('btn--no');
        no.onclick = sayYes;
        return;
      }

      if (!no.classList.contains('is-runaway')) {
        card.appendChild(no);
        no.classList.add('is-runaway');
      }
      const cw = card.clientWidth;
      const ch = card.clientHeight;
      const bw = no.offsetWidth;
      const bh = no.offsetHeight;
      const yr = yes.getBoundingClientRect();
      const cr = card.getBoundingClientRect();
      let x;
      let y;
      for (let tries = 0; tries < 20; tries++) {
        x = rand(10, cw - bw - 10);
        y = rand(10, ch - bh - 10);
        const ax = cr.left + x;
        const ay = cr.top + y;
        const overlaps = ax < yr.right + 10 && ax + bw > yr.left - 10 && ay < yr.bottom + 10 && ay + bh > yr.top - 10;
        if (!overlaps) break;
      }
      no.style.left = `${x}px`;
      no.style.top = `${y}px`;
      gsap.fromTo(no, { rotation: rand(-25, 25) }, { rotation: 0, duration: 0.5, ease: 'elastic.out(1, 0.4)' });
    }

    // Dodge before the tap lands; on desktop dodge on hover too.
    no.addEventListener('pointerdown', (e) => {
      if (attempts >= 6) return;
      e.preventDefault();
      runAway();
    });
    if (!COARSE) no.addEventListener('pointerenter', () => { if (attempts < 6) runAway(); });
    no.addEventListener('click', (e) => {
      if (attempts >= 6) return;
      e.preventDefault();
      if (e.detail === 0) runAway(); // keyboard activation
    });

    function sayYes() {
      if (answered) return;
      answered = true;
      const vals = { food: getFood(), vibe: getVibe(), note: note.value.trim() };
      try {
        fetch('/api/rsvp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ answer: 'yes', ...vals, noAttempts: attempts }),
          keepalive: true,
        }).catch(() => {});
      } catch {}

      const url = `https://wa.me/${waNumber(C.rsvp?.whatsapp)}?text=${encodeURIComponent(buildMessage(vals))}`;
      const link = $('#waLink');
      link.href = url;
      const sg = $('#successGif');
      if (C.rsvp?.successGif) sg.src = C.rsvp.successGif;
      else sg.remove();

      Sound.fanfare();
      bigCelebration();
      emojiRain(['💖', '💕', '🥰', '🎉', '💘', '🌹'], 60);
      const succ = $('#success');
      succ.hidden = false;
      gsap.fromTo(succ, { opacity: 0 }, { opacity: 1, duration: 0.3 });
      gsap.fromTo('.success__card', { scale: 0.3, rotation: -15, y: 100 }, { scale: 1, rotation: 0, y: 0, duration: 1, ease: 'elastic.out(1, 0.55)' });
      gsap.fromTo(link, { scale: 1 }, { scale: 1.05, duration: 0.7, repeat: -1, yoyo: true, ease: 'sine.inOut', delay: 1 });

      // Auto-open WhatsApp after a short celebration; the button works instantly.
      let n = 6;
      const counter = $('#successCount');
      const tick = () => {
        counter.textContent = n > 0 ? `Opening WhatsApp in ${n}…` : 'Tap the green button if WhatsApp did not open 💚';
        if (n === 0) { window.location.href = url; return; }
        n--;
        setTimeout(tick, 1000);
      };
      tick();
      link.addEventListener('click', () => { n = -1; counter.textContent = 'See you tomorrow 😘'; });
    }

    yes.addEventListener('click', sayYes);
  }

  // ---------------------------------------------------------------
  // Chrome: progress + music
  // ---------------------------------------------------------------
  function initChrome() {
    gsap.to('#progressBar', { scaleX: 1, ease: 'none', scrollTrigger: { trigger: document.documentElement, start: 'top top', end: 'bottom bottom', scrub: 0.3 } });
    const mb = $('#musicBtn');
    if (mb) mb.addEventListener('click', () => {
      const on = Sound.toggle();
      mb.classList.toggle('is-off', !on);
      gsap.fromTo(mb, { scale: 0.8 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' });
    });
    $('#lightboxClose').addEventListener('click', closeLightbox);
    $('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') closeLightbox(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#lightbox').hidden) closeLightbox(); });

    // Pause synth music when the tab is hidden (iOS keeps WebAudio alive otherwise).
    let resume = false;
    document.addEventListener('visibilitychange', () => {
      if (!mb) return;
      if (document.hidden && Sound.isPlaying) { resume = true; Sound.stopMusic(); mb.classList.add('is-off'); }
      else if (!document.hidden && resume) { resume = false; Sound.toggle(); mb.classList.remove('is-off'); }
    });

    gsap.from('.footer__heart', { scale: 0, duration: 0.8, ease: 'elastic.out(1, 0.4)', scrollTrigger: { trigger: '.footer', start: 'top 95%' } });
  }

  // ---------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------
  async function boot() {
    try {
      const res = await fetch('/api/content', { cache: 'no-store' });
      C = await res.json();
    } catch {
      C = {};
    }
    if (C.pageTitle) document.title = C.pageTitle;
    if (C.music?.src) Sound.setTrack(C.music.src);
    else if (C.music && C.music.useMusicBox === false) $('#musicBtn').remove();

    bindText();
    buildHero();
    const name = (C.herName || '').toUpperCase();
    buildMarquee('#marquee1', [`happy birthday ${name}`, '✦', 'birthday girl', '✦', 'main character energy', '✦', 'cake time', '✦'], -1);
    buildMarquee('#marquee2', ['memories', '♥', 'more adventures', '♥', 'you + me', '♥', 'favourite human', '♥'], 1);
    buildStats();
    buildCake();
    buildMemories();
    buildMemes();
    buildLetter();
    buildReasons();
    buildScratch();
    buildProgramme();
    buildRsvp();
    initHeadings();
    initChrome();
    initTrail();
    initGate();
    ScrollTrigger.refresh();
  }

  boot();
})();
