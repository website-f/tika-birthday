/* Tiny WebAudio sound kit: a music-box "Happy Birthday" loop plus UI blips.
   Everything is synthesized, so there are no audio files to load. If an
   uploaded track is configured, it plays through an <audio> element instead. */
(function () {
  'use strict';

  const Ctx = window.AudioContext || window.webkitAudioContext;
  let ctx = null;
  let master = null;
  let musicGain = null;
  let loopTimer = null;
  let playing = false;
  let track = null;

  const NOTE = { C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.0, A4: 440.0, Bb4: 466.16, B4: 493.88, C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46, G5: 783.99, C3: 130.81, F3: 174.61, G3: 196.0 };

  // [note, beats]; 3/4 time.
  const MELODY = [
    ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['C5', 1], ['B4', 2],
    ['G4', 0.75], ['G4', 0.25], ['A4', 1], ['G4', 1], ['D5', 1], ['C5', 2],
    ['G4', 0.75], ['G4', 0.25], ['G5', 1], ['E5', 1], ['C5', 1], ['B4', 1], ['A4', 2.5],
    ['F5', 0.75], ['F5', 0.25], ['E5', 1], ['C5', 1], ['D5', 1], ['C5', 3],
  ];
  // Bass notes, one per bar (3 beats), starting on the pickup's downbeat.
  const BASS = ['C3', 'G3', 'G3', 'C3', 'C3', 'F3', 'C3', 'G3', 'C3'];
  const BEAT = 0.5; // seconds per beat

  function ensure() {
    if (!Ctx) return false;
    if (!ctx) {
      ctx = new Ctx();
      master = ctx.createGain();
      master.gain.value = 0.9;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.0;
      musicGain.connect(master);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function bell(freq, t, dur, vol, dest) {
    const o1 = ctx.createOscillator();
    const o2 = ctx.createOscillator();
    const g = ctx.createGain();
    o1.type = 'sine';
    o2.type = 'triangle';
    o1.frequency.value = freq;
    o2.frequency.value = freq * 2.01;
    const g2 = ctx.createGain();
    g2.gain.value = 0.18;
    o1.connect(g);
    o2.connect(g2);
    g2.connect(g);
    g.connect(dest || master);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o1.start(t);
    o2.start(t);
    o1.stop(t + dur + 0.05);
    o2.stop(t + dur + 0.05);
  }

  function scheduleSong(start) {
    let t = start;
    for (const [n, b] of MELODY) {
      bell(NOTE[n], t, Math.max(0.6, b * BEAT * 1.8), 0.22, musicGain);
      t += b * BEAT;
    }
    // Pickup is one beat; bars follow every 3 beats.
    let bt = start + BEAT;
    for (const n of BASS) {
      bell(NOTE[n], bt, 1.4, 0.1, musicGain);
      bell(NOTE[n] * 1.5, bt + BEAT, 0.8, 0.05, musicGain);
      bell(NOTE[n] * 2, bt + BEAT * 2, 0.8, 0.05, musicGain);
      bt += 3 * BEAT;
    }
    return t - start;
  }

  function loop() {
    if (!playing) return;
    const len = scheduleSong(ctx.currentTime + 0.1);
    loopTimer = setTimeout(loop, (len + 2.2) * 1000);
  }

  const Sound = {
    setTrack(src) {
      if (!src) return;
      track = new Audio(src);
      track.loop = true;
      track.preload = 'auto';
      track.setAttribute('playsinline', '');
      track.volume = 0.75;
    },

    // Must be called from inside a user gesture (iOS Safari rule).
    unlock() {
      ensure();
      if (track) {
        // Prime the element in the gesture so later play() calls are allowed.
        track.play().then(() => { if (!playing) track.pause(); }).catch(() => {});
      }
    },

    startMusic() {
      if (playing) return;
      playing = true;
      if (track) {
        track.play().catch(() => { playing = false; });
        return;
      }
      if (!ensure()) return;
      musicGain.gain.cancelScheduledValues(ctx.currentTime);
      musicGain.gain.setTargetAtTime(1, ctx.currentTime, 0.3);
      loop();
    },

    stopMusic() {
      playing = false;
      if (track) { track.pause(); return; }
      clearTimeout(loopTimer);
      if (ctx) musicGain.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
    },

    toggle() {
      if (playing) this.stopMusic();
      else {
        if (!track && ctx) {
          // Fresh gain node so notes still ringing from the stopped loop stay silent.
          musicGain.disconnect();
          musicGain = ctx.createGain();
          musicGain.gain.value = 0;
          musicGain.connect(master);
        }
        this.startMusic();
      }
      return playing;
    },

    get isPlaying() { return playing; },

    pop() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * 0.12);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 1400 + Math.random() * 800;
      const g = ctx.createGain();
      g.gain.value = 0.9;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
    },

    whoosh() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * 0.45);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(2400, t + 0.35);
      const g = ctx.createGain();
      g.gain.value = 0.35;
      src.connect(f);
      f.connect(g);
      g.connect(master);
      src.start(t);
    },

    chime() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.C5 * 2].forEach((f, i) => bell(f, t + i * 0.09, 0.9, 0.18));
    },

    blip(i = 0) {
      if (!ensure()) return;
      const scale = [NOTE.C5, NOTE.D5, NOTE.E5, NOTE.G5, NOTE.A4 * 2, NOTE.C5 * 2];
      bell(scale[i % scale.length], ctx.currentTime, 0.35, 0.16);
    },

    fanfare() {
      if (!ensure()) return;
      const t = ctx.currentTime;
      const seq = [NOTE.C5, NOTE.E5, NOTE.G5, NOTE.E5, NOTE.G5, NOTE.C5 * 2];
      seq.forEach((f, i) => bell(f, t + i * 0.11, 1.0, 0.2));
    },
  };

  window.Sound = Sound;
})();
