(function () {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const h = (tag, attrs = {}, ...kids) => {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
      else if (k === 'html') n.innerHTML = v;
      else n.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
    return n;
  };

  const getP = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setP = (o, path, v) => {
    const ks = path.split('.');
    let cur = o;
    ks.slice(0, -1).forEach((k) => { if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}; cur = cur[k]; });
    cur[ks[ks.length - 1]] = v;
  };

  let state = null;
  let dirty = false;

  // ------------------------------------------------------------------
  // API
  // ------------------------------------------------------------------
  async function api(method, url, body) {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
      credentials: 'same-origin',
    });
    let data = {};
    try { data = await res.json(); } catch {}
    if (res.status === 401 && url !== '/api/admin/login') { showLogin(); throw new Error('Session expired, please log in again'); }
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  // ------------------------------------------------------------------
  // UI helpers
  // ------------------------------------------------------------------
  let toastTimer;
  function toast(msg, err) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.toggle('is-err', !!err);
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), err ? 4500 : 2200);
  }

  function markDirty() {
    dirty = true;
    $('#savebar').classList.add('is-dirty');
    $('#saveStatus').textContent = 'Unsaved changes';
    $('#saveBtn').disabled = false;
  }

  window.addEventListener('beforeunload', (e) => {
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  function field(path, label, opts = {}) {
    const type = opts.type || 'text';
    const val = getP(state, path);
    let input;
    if (type === 'textarea') {
      input = h('textarea', { rows: opts.rows || 4, placeholder: opts.placeholder || '' });
      input.value = val ?? '';
    } else if (type === 'checkbox') {
      input = h('input', { type: 'checkbox' });
      input.checked = val !== false;
      input.addEventListener('change', () => { setP(state, path, input.checked); markDirty(); });
      return h('label', { class: 'check' }, input, label);
    } else if (type === 'lines') {
      input = h('textarea', { rows: opts.rows || 5, placeholder: 'One per line' });
      input.value = (val || []).join('\n');
      input.addEventListener('input', () => { setP(state, path, input.value.split('\n').map((s) => s.trim()).filter(Boolean)); markDirty(); });
      return h('label', { class: 'field' }, h('span', {}, label), input, opts.help ? h('small', {}, opts.help) : null);
    } else {
      input = h('input', { type, placeholder: opts.placeholder || '', inputmode: opts.inputmode, min: opts.min, max: opts.max });
      input.value = val ?? '';
    }
    input.addEventListener('input', () => {
      setP(state, path, type === 'number' ? Number(input.value) : input.value);
      markDirty();
    });
    return h('label', { class: 'field' }, h('span', {}, label), input, opts.help ? h('small', { html: opts.help }) : null);
  }

  function box(title, help, ...kids) {
    return h('section', { class: 'box' }, h('h2', {}, title), help ? h('p', { class: 'help' }, help) : null, ...kids);
  }

  // ------------------------------------------------------------------
  // Uploads (images are resized in the browser first)
  // ------------------------------------------------------------------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve({ img, url });
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('decode')); };
      img.src = url;
    });
  }

  async function compress(file) {
    const isImg = /^image\//.test(file.type) || /\.(heic|heif)$/i.test(file.name);
    if (!isImg || file.type === 'image/gif') return file;
    try {
      const { img, url } = await loadImage(file);
      const MAX = 2000;
      const scale = Math.min(1, MAX / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.round(img.naturalWidth * scale);
      const hgt = Math.round(img.naturalHeight * scale);
      const cv = document.createElement('canvas');
      cv.width = w;
      cv.height = hgt;
      cv.getContext('2d').drawImage(img, 0, 0, w, hgt);
      URL.revokeObjectURL(url);
      const blob = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.86));
      if (!blob) return file;
      if (blob.size > file.size && /^image\/(jpeg|png|webp)$/.test(file.type) && scale === 1) return file;
      return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' });
    } catch {
      if (/heic|heif/i.test(file.type + file.name)) {
        throw new Error('This browser cannot read HEIC photos. Upload from iPhone Safari, or convert to JPG first.');
      }
      return file;
    }
  }

  function uploadFile(file, onProgress) {
    return compress(file).then((f) => new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append('file', f, f.name);
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/admin/upload');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch {}
        if (xhr.status === 401) { showLogin(); return reject(new Error('Session expired')); }
        if (xhr.status >= 200 && xhr.status < 300 && data.url) resolve(data.url);
        else reject(new Error(data.error || `Upload failed (${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network error while uploading'));
      xhr.send(fd);
    }));
  }

  function progressRow(container, name) {
    const row = h('div', { class: 'up' }, h('span', {}, name), h('span', { class: 'pct' }, '0%'), h('div', { class: 'up__bar' }, h('i')));
    container.appendChild(row);
    return {
      set: (p) => { $('i', row).style.width = `${Math.round(p * 100)}%`; $('.pct', row).textContent = `${Math.round(p * 100)}%`; },
      done: () => { row.remove(); },
      fail: (msg) => { row.classList.add('is-err'); $('.pct', row).textContent = 'failed'; row.title = msg; setTimeout(() => row.remove(), 6000); },
    };
  }

  function pickFiles(accept, multiple) {
    return new Promise((resolve) => {
      const input = h('input', { type: 'file', accept, multiple: multiple || null, style: 'position:fixed;left:-9999px' });
      document.body.appendChild(input);
      input.addEventListener('change', () => { resolve(Array.from(input.files || [])); input.remove(); });
      input.click();
    });
  }

  // ------------------------------------------------------------------
  // Generic list editor
  // ------------------------------------------------------------------
  function listEditor(path, fields, opts = {}) {
    const wrap = h('div');
    const render = () => {
      wrap.innerHTML = '';
      const arr = getP(state, path) || [];
      const list = h('div', { class: 'list' });
      arr.forEach((item, i) => {
        const tools = h('div', { class: 'item__tools' },
          h('button', { class: 'icon-btn', type: 'button', title: 'Move up', disabled: i === 0 || null, onclick: () => move(i, -1) }, '↑'),
          h('button', { class: 'icon-btn', type: 'button', title: 'Move down', disabled: i === arr.length - 1 || null, onclick: () => move(i, 1) }, '↓'),
          h('button', { class: 'icon-btn icon-btn--danger', type: 'button', title: 'Remove', onclick: () => remove(i) }, '✕'),
        );
        const body = fields.map((f) => {
          const p = `${path}.${i}.${f.key}`;
          if (f.type === 'media') return mediaField(p, f.label, f.accept || 'image/*', f.help);
          return field(p, f.label, f);
        });
        const grid = opts.grid ? h('div', { class: 'grid2' }, ...body.slice(0, opts.grid)) : null;
        list.appendChild(h('div', { class: 'item' },
          h('div', { class: 'item__bar' }, h('span', { class: 'item__num' }, `${opts.noun || 'Item'} ${i + 1}`), tools),
          grid, ...(grid ? body.slice(opts.grid) : body)));
      });
      if (!arr.length) list.appendChild(h('div', { class: 'empty' }, opts.empty || 'Nothing here yet.'));
      wrap.appendChild(list);
      wrap.appendChild(h('div', { class: 'add-row' },
        h('button', { class: 'btn btn--small', type: 'button', onclick: add }, `+ ${opts.addLabel || 'Add'}`)));
    };
    const move = (i, d) => {
      const arr = getP(state, path);
      [arr[i], arr[i + d]] = [arr[i + d], arr[i]];
      markDirty();
      render();
    };
    const remove = (i) => {
      getP(state, path).splice(i, 1);
      markDirty();
      render();
    };
    const add = () => {
      if (!getP(state, path)) setP(state, path, []);
      getP(state, path).push(typeof opts.newItem === 'function' ? opts.newItem() : { ...(opts.newItem || {}) });
      markDirty();
      render();
      const items = $$('.item', wrap);
      items[items.length - 1]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    render();
    return wrap;
  }

  // An image/GIF/audio slot: upload a file or paste a URL.
  function mediaField(path, label, accept, help) {
    const val = getP(state, path) || '';
    const thumb = h('div', { class: 'media__thumb' });
    const urlInput = h('input', { type: 'text', placeholder: 'Upload, or paste a GIF/image URL' });
    urlInput.value = val;
    const progress = h('div', { class: 'uploads' });
    const paint = () => {
      const v = getP(state, path);
      thumb.innerHTML = v ? `<img src="${esc(v)}" alt="" />` : '🖼️';
    };
    urlInput.addEventListener('input', () => { setP(state, path, urlInput.value.trim()); markDirty(); paint(); });
    const uploadBtn = h('button', {
      class: 'btn btn--small', type: 'button',
      onclick: async () => {
        const [file] = await pickFiles(accept, false);
        if (!file) return;
        const p = progressRow(progress, file.name);
        try {
          const url = await uploadFile(file, p.set);
          p.done();
          setP(state, path, url);
          urlInput.value = url;
          markDirty();
          paint();
        } catch (err) {
          p.fail(err.message);
          toast(err.message, true);
        }
      },
    }, '⬆ Upload');
    paint();
    return h('div', { class: 'field' },
      h('span', {}, label),
      h('div', { class: 'media' }, thumb, h('div', { class: 'media__fields' }, urlInput, h('div', {}, uploadBtn), progress)),
      help ? h('small', {}, help) : null);
  }

  // ------------------------------------------------------------------
  // Photos panel
  // ------------------------------------------------------------------
  function photosPanel() {
    if (!state.memories) state.memories = {};
    if (!Array.isArray(state.memories.photos)) state.memories.photos = [];
    const grid = h('div', { class: 'photo-grid' });
    const progress = h('div', { class: 'uploads' });
    const fileInput = h('input', { type: 'file', accept: 'image/*', multiple: true });
    const drop = h('label', { class: 'dropzone' },
      fileInput,
      h('div', { style: 'font-size:2rem' }, '📸'),
      h('b', {}, 'Tap to add photos'),
      h('span', {}, 'or drag & drop. Pick many at once. They are resized automatically.'));

    const render = () => {
      const photos = state.memories.photos;
      grid.innerHTML = '';
      if (!photos.length) grid.appendChild(h('div', { class: 'empty', style: 'grid-column:1/-1' }, 'No photos yet. Add your favourite memories together 💖'));
      photos.forEach((p, i) => {
        const cap = h('input', { type: 'text', placeholder: 'Caption' });
        cap.value = p.caption || '';
        cap.addEventListener('input', () => { p.caption = cap.value; markDirty(); });
        const date = h('input', { type: 'date' });
        date.value = p.date || '';
        date.addEventListener('input', () => { p.date = date.value; markDirty(); });
        const mv = (d) => { [photos[i], photos[i + d]] = [photos[i + d], photos[i]]; markDirty(); render(); };
        grid.appendChild(h('div', { class: 'photo' },
          h('div', { class: 'photo__img' }, h('img', { src: p.src, alt: '', loading: 'lazy' }), h('span', { class: 'photo__badge' }, String(i + 1))),
          h('div', { class: 'photo__body' }, cap, date,
            h('div', { class: 'photo__tools' },
              h('button', { class: 'icon-btn', type: 'button', title: 'Move earlier', disabled: i === 0 || null, onclick: () => mv(-1) }, '←'),
              h('button', { class: 'icon-btn', type: 'button', title: 'Move later', disabled: i === photos.length - 1 || null, onclick: () => mv(1) }, '→'),
              h('button', { class: 'icon-btn icon-btn--danger', type: 'button', title: 'Remove', onclick: () => { if (confirm('Remove this photo?')) { photos.splice(i, 1); markDirty(); render(); } } }, '✕')))));
      });
    };

    async function handle(files) {
      files = files.filter((f) => /^image\//.test(f.type) || /\.(heic|heif)$/i.test(f.name));
      // Upload two at a time to stay friendly with mobile connections.
      const queue = files.slice();
      let ok = 0;
      const worker = async () => {
        while (queue.length) {
          const f = queue.shift();
          const p = progressRow(progress, f.name);
          try {
            const url = await uploadFile(f, p.set);
            p.done();
            state.memories.photos.push({ src: url, caption: '', date: '' });
            ok++;
            markDirty();
            render();
          } catch (err) {
            p.fail(err.message);
            toast(`${f.name}: ${err.message}`, true);
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (ok) toast(`${ok} photo${ok > 1 ? 's' : ''} added. Add captions, then Save 💾`);
    }

    fileInput.addEventListener('change', () => { handle(Array.from(fileInput.files || [])); fileInput.value = ''; });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('is-over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('is-over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('is-over'); handle(Array.from(e.dataTransfer.files || [])); });

    render();
    return [
      box('Memories section', null, field('memories.title', 'Title'), field('memories.subtitle', 'Subtitle')),
      box('Photos', 'These appear in the swipeable polaroid stack and the scrolling film strip. Order here = order on the card.', drop, progress, grid),
    ];
  }

  // ------------------------------------------------------------------
  // RSVP log
  // ------------------------------------------------------------------
  function rsvpLog() {
    const wrap = h('div', { class: 'rsvp-log' }, h('div', { class: 'empty' }, 'Loading…'));
    const load = async () => {
      try {
        const list = await api('GET', '/api/admin/rsvps');
        wrap.innerHTML = '';
        if (!list.length) { wrap.appendChild(h('div', { class: 'empty' }, 'No answers yet. Fingers crossed 🤞')); return; }
        list.forEach((r) => {
          const when = new Date(r.at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
          wrap.appendChild(h('div', { class: 'rsvp-entry' },
            h('b', {}, `💚 She said ${String(r.answer).toUpperCase()}! `), when,
            r.food ? h('p', {}, `🍽️ ${r.food}`) : null,
            r.vibe ? h('p', {}, `✨ ${r.vibe}`) : null,
            r.note ? h('p', {}, `💌 “${r.note}”`) : null,
            r.noAttempts ? h('p', {}, `😂 Tried to press “No” ${r.noAttempts} time${r.noAttempts > 1 ? 's' : ''}`) : null));
        });
      } catch (err) {
        wrap.innerHTML = '';
        wrap.appendChild(h('div', { class: 'empty' }, err.message));
      }
    };
    load();
    return box('Answers received', 'Logged whenever the YES button is pressed (she still needs to send the WhatsApp message).',
      wrap,
      h('div', { class: 'add-row' },
        h('button', { class: 'btn btn--small', type: 'button', onclick: load }, '↻ Refresh'),
        h('button', { class: 'btn btn--small btn--danger', type: 'button', onclick: async () => { if (confirm('Clear all answers? (useful after testing)')) { await api('DELETE', '/api/admin/rsvps'); load(); } } }, 'Clear test answers')));
  }

  // ------------------------------------------------------------------
  // Music panel
  // ------------------------------------------------------------------
  function musicPanel() {
    if (!state.music) state.music = {};
    const wrap = h('div');
    const progress = h('div', { class: 'uploads' });
    const render = () => {
      wrap.innerHTML = '';
      const src = state.music.src;
      if (src) {
        wrap.append(
          h('p', { class: 'help', style: 'font-weight:800' }, '✅ Your song is set and will play when she opens the gift.'),
          h('audio', { controls: true, src, preload: 'none' }),
          h('div', { class: 'add-row' }, h('button', { class: 'btn btn--small btn--danger', type: 'button', onclick: () => { state.music.src = ''; markDirty(); render(); } }, 'Remove song')));
      } else {
        wrap.append(h('p', { class: 'help', style: 'font-weight:800' }, 'No song uploaded. The built-in music-box "Happy Birthday" will play instead (if enabled below).'));
      }
    };
    render();
    const up = h('button', {
      class: 'btn btn--primary', type: 'button',
      onclick: async () => {
        const [file] = await pickFiles('audio/*,.mp3,.m4a', false);
        if (!file) return;
        const p = progressRow(progress, file.name);
        try {
          state.music.src = await uploadFile(file, p.set);
          p.done();
          markDirty();
          render();
          toast('Song uploaded. Remember to Save 💾');
        } catch (err) {
          p.fail(err.message);
          toast(err.message, true);
        }
      },
    }, '🎵 Upload a song (MP3 / M4A)');
    return [
      box('Background music', 'Starts when she taps the gift (browsers block sound until a tap). Your song "our song" works great here.',
        h('div', { class: 'add-row', style: 'margin:0 0 14px' }, up), progress, wrap),
      box('Fallback', null, field('music.useMusicBox', 'Play the built-in music-box melody when no song is uploaded', { type: 'checkbox' })),
    ];
  }

  // ------------------------------------------------------------------
  // Panels
  // ------------------------------------------------------------------
  const PANELS = {
    general: () => [
      box('Names', null,
        h('div', { class: 'grid2' }, field('herName', 'Her name (big on the card)'), field('nickname', 'Nickname')),
        field('fromName', 'Your name'),
        field('pageTitle', 'Browser tab / link preview title')),
      box('Link preview', 'What shows up when you paste the link in WhatsApp, Instagram, Telegram… Best image size: 1200×630. Apps cache previews, so changes may take a while to appear in chats where the link was already sent.',
        mediaField('share.image', 'Preview image', 'image/*'),
        field('share.title', 'Preview title'),
        field('share.description', 'Preview description', { type: 'textarea', rows: 2 })),
      box('Opening screen', 'The gift box she taps first.',
        field('gate.title', 'Title'), field('gate.subtitle', 'Subtitle'), field('gate.button', 'Button text')),
      box('Hero', null,
        field('hero.eyebrow', 'Small label above'),
        field('hero.line', 'Big tile text', { help: 'Each letter becomes a colourful tile. Two words looks best.' }),
        field('hero.subtitle', 'Subtitle', { type: 'textarea', rows: 3 })),
      box('Fun stats', 'Numbers count up when she scrolls to them.',
        field('metDate', 'Date you got together (optional)', { type: 'date', help: 'If set, adds a live "days of us" counter.' }),
        listEditor('stats', [
          { key: 'value', label: 'Number', inputmode: 'numeric' },
          { key: 'suffix', label: 'Suffix (e.g. % or +)' },
          { key: 'label', label: 'Label' },
        ], { noun: 'Stat', addLabel: 'Add stat', grid: 2, newItem: { value: '', suffix: '', label: '' } })),
      box('Cake', null,
        field('cake.candles', 'Number of candles (1–9)', { type: 'number', min: 1, max: 9, inputmode: 'numeric' }),
        field('cake.title', 'Title'), field('cake.hint', 'Hint'),
        field('cake.done', 'Message after all candles are blown out', { type: 'textarea', rows: 2 })),
      box('Footer', null, field('footer', 'Footer text')),
    ],

    photos: photosPanel,

    memes: () => [
      box('Meme section', null, field('memes.title', 'Title'), field('memes.subtitle', 'Subtitle')),
      box('Memes', 'Upload your own GIFs/images, or paste a GIPHY link ending in .gif.',
        listEditor('memes.items', [
          { key: 'src', label: 'GIF / image', type: 'media', accept: 'image/*' },
          { key: 'caption', label: 'Caption' },
        ], { noun: 'Meme', addLabel: 'Add meme', newItem: { src: '', caption: '' } })),
      box('Special GIFs', 'Used in other parts of the card.',
        mediaField('letter.gif', 'Letter GIF', 'image/*'),
        mediaField('rsvp.waitingGif', 'RSVP "waiting for your answer" GIF', 'image/*'),
        field('rsvp.waitingCaption', 'Caption under that GIF'),
        mediaField('rsvp.successGif', 'Celebration GIF after she says YES', 'image/*')),
    ],

    letter: () => [
      box('Love letter', 'Leave an empty line between paragraphs.',
        field('letter.title', 'Section title'),
        field('letter.body', 'Letter', { type: 'textarea', rows: 14 }),
        field('letter.signoff', 'Sign-off')),
      box('Reasons (flip cards)', null,
        field('reasons.title', 'Title'), field('reasons.subtitle', 'Subtitle'),
        listEditor('reasons.items', [
          { key: 'emoji', label: 'Emoji' },
          { key: 'text', label: 'Reason' },
        ], { noun: 'Reason', addLabel: 'Add reason', newItem: { emoji: '💖', text: '' } })),
      box('Scratch card surprise', null,
        field('surprise.title', 'Title'), field('surprise.hint', 'Hint'),
        field('surprise.reveal', 'Hidden message', { type: 'textarea', rows: 2 })),
    ],

    plan: () => [
      box('Date plan', null,
        field('programme.title', 'Title'), field('programme.subtitle', 'Subtitle'),
        field('programme.dateLabel', 'When', { help: 'Shown as a badge and used for {date} in the WhatsApp message, e.g. "tomorrow, Sunday 1 November".' })),
      box('Programme', 'Add a place to show a Google Maps link.',
        listEditor('programme.items', [
          { key: 'time', label: 'Time' },
          { key: 'emoji', label: 'Emoji' },
          { key: 'title', label: 'Activity' },
          { key: 'desc', label: 'Description' },
          { key: 'place', label: 'Place (optional)' },
        ], { noun: 'Stop', addLabel: 'Add stop', grid: 2, newItem: { time: '', emoji: '💖', title: '', desc: '', place: '' } })),
    ],

    rsvp: () => [
      rsvpLog(),
      box('WhatsApp', 'Where her answer goes.',
        field('rsvp.whatsapp', 'Your WhatsApp number', { type: 'tel', inputmode: 'tel', help: 'Country code + number, no + or spaces. e.g. 601162316682' }),
        field('rsvp.message', 'Pre-made reply message', { type: 'textarea', rows: 10 }),
        h('div', { class: 'placeholders' }, ...['{name}', '{nickname}', '{date}', '{food}', '{vibe}', '{note}'].map((p) => h('code', {}, p))),
        h('small', { style: 'display:block;margin-top:6px;color:var(--ink-soft);font-weight:700' }, 'Lines with an empty placeholder (e.g. she skipped the note) are removed automatically.')),
      box('Question & buttons', null,
        field('rsvp.question', 'Question'),
        h('div', { class: 'grid2' }, field('rsvp.yesLabel', 'Yes button'), field('rsvp.noLabel', 'No button (it runs away 😂)')),
        field('rsvp.foodTitle', 'Food question'),
        field('rsvp.foodOptions', 'Food options', { type: 'lines' }),
        field('rsvp.vibeTitle', 'Vibe question'),
        field('rsvp.vibeOptions', 'Vibe options', { type: 'lines' }),
        field('rsvp.noteTitle', 'Note prompt'),
        field('rsvp.successTitle', 'Celebration title'),
        field('rsvp.successText', 'Celebration text')),
    ],

    music: musicPanel,
  };

  function renderPanels() {
    const host = $('#panels');
    host.innerHTML = '';
    for (const [key, build] of Object.entries(PANELS)) {
      const panel = h('div', { class: 'panel', 'data-panel': key });
      panel.append(...[].concat(build()));
      host.appendChild(panel);
    }
    selectTab(sessionStorageGet('tab') || 'general');
  }

  function sessionStorageGet(k) { try { return sessionStorage.getItem(k); } catch { return null; } }
  function sessionStorageSet(k, v) { try { sessionStorage.setItem(k, v); } catch {} }

  function selectTab(key) {
    if (!PANELS[key]) key = 'general';
    $$('#tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === key)));
    $$('.panel').forEach((p) => p.classList.toggle('is-active', p.dataset.panel === key));
    sessionStorageSet('tab', key);
    $(`#tabs [data-tab="${key}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }

  // ------------------------------------------------------------------
  // Boot / auth
  // ------------------------------------------------------------------
  function showLogin() {
    $('#app').hidden = true;
    $('#login').hidden = false;
    setTimeout(() => $('#password').focus(), 50);
  }

  async function showApp() {
    const data = await api('GET', '/api/admin/content');
    state = data.content;
    dirty = false;
    $('#login').hidden = true;
    $('#app').hidden = false;
    $('#saveBtn').disabled = true;
    $('#savebar').classList.remove('is-dirty');
    $('#saveStatus').textContent = 'All changes saved';
    renderPanels();
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#loginErr').textContent = '';
    try {
      await api('POST', '/api/admin/login', { password: $('#password').value });
      $('#password').value = '';
      await showApp();
    } catch (err) {
      $('#loginErr').textContent = err.message;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    if (dirty && !confirm('You have unsaved changes. Log out anyway?')) return;
    await api('POST', '/api/admin/logout').catch(() => {});
    dirty = false;
    showLogin();
  });

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-tab]');
    if (b) selectTab(b.dataset.tab);
  });

  $('#saveBtn').addEventListener('click', async () => {
    const btn = $('#saveBtn');
    btn.disabled = true;
    $('#saveStatus').textContent = 'Saving…';
    try {
      await api('PUT', '/api/admin/content', state);
      dirty = false;
      $('#savebar').classList.remove('is-dirty');
      $('#saveStatus').textContent = `Saved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      toast('Saved! Refresh the card to see it 🎉');
    } catch (err) {
      btn.disabled = false;
      $('#saveStatus').textContent = 'Save failed';
      toast(err.message, true);
    }
  });

  // Ctrl/Cmd+S saves.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (dirty) $('#saveBtn').click();
    }
  });

  api('GET', '/api/admin/me').then(showApp).catch(showLogin);
})();
