/* Procedural music + SFX. No audio files: everything is synthesised so the
   tempo can follow the run's pressure in real time. */
(function () {
  'use strict';
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  function AudioEngine() {
    this.ctx = null;
    this.master = null;
    this.music = null;
    this.sfx = null;
    this.musicFilter = null;
    this.delay = null;
    this.noise = null;
    this.muted = false;
    this.volume = 0.72;
    this.intensity = 0;
    this.urgency = 0;
    this.musicOn = false;
    this.tempo = 96;
    this.step = 0;
    this.nextTime = 0;
    this.timer = null;
    this.onBeat = null;
  }

  AudioEngine.prototype = {
    init: function () {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      var ctx = new AC();
      this.ctx = ctx;

      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 26;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.22;
      comp.connect(ctx.destination);

      this.master = ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume * 0.8;
      this.master.connect(comp);

      this.musicFilter = ctx.createBiquadFilter();
      this.musicFilter.type = 'lowpass';
      this.musicFilter.frequency.value = 900;
      this.musicFilter.Q.value = 0.5;
      this.musicFilter.connect(this.master);

      this.music = ctx.createGain();
      this.music.gain.value = 0.48;
      this.music.connect(this.musicFilter);

      this.sfx = ctx.createGain();
      this.sfx.gain.value = 0.85;
      this.sfx.connect(this.master);

      this.delay = ctx.createDelay(1.2);
      this.delay.delayTime.value = 0.265;
      var feedback = ctx.createGain();
      feedback.gain.value = 0.24;
      var wet = ctx.createGain();
      wet.gain.value = 0.3;
      this.delay.connect(feedback);
      feedback.connect(this.delay);
      this.delay.connect(wet);
      wet.connect(this.master);

      var len = Math.floor(ctx.sampleRate);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var data = buf.getChannelData(0);
      for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buf;

      this.nextTime = ctx.currentTime + 0.08;
      var self = this;
      this.timer = setInterval(function () { self.schedule(); }, 25);
    },

    ready: function () { return this.ctx && this.ctx.state === 'running'; },

    setMuted: function (m) {
      this.muted = !!m;
      if (this.master) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume * 0.8, this.ctx.currentTime, 0.04);
      }
    },

    setVolume: function (v) {
      this.volume = clamp(v, 0, 1);
      if (this.master && !this.muted) {
        this.master.gain.setTargetAtTime(this.volume * 0.8, this.ctx.currentTime, 0.05);
      }
    },

    setIntensity: function (v) {
      this.intensity = clamp(v, 0, 1);
      if (this.musicFilter) {
        var f = 760 + this.intensity * 5200 + this.urgency * 1100;
        this.musicFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.5);
      }
    },

    setUrgency: function (v) { this.urgency = clamp(v, 0, 1); },

    startMusic: function () {
      this.init();
      if (!this.ctx) return;
      if (this.ctx.state === 'suspended') this.ctx.resume();
      this.musicOn = true;
      this.tempo = 96;
      this.step = 0;
      this.nextTime = this.ctx.currentTime + 0.06;
    },

    stopMusic: function () { this.musicOn = false; },

    schedule: function () {
      if (!this.musicOn || !this.ready()) return;
      var target = 92 + this.intensity * 46 + this.urgency * 28;
      this.tempo += (target - this.tempo) * 0.07;
      var sixteenth = 60 / this.tempo / 4;
      if (this.nextTime < this.ctx.currentTime) this.nextTime = this.ctx.currentTime + 0.02;
      while (this.nextTime < this.ctx.currentTime + 0.12) {
        this.stepAt(this.step, this.nextTime);
        this.nextTime += sixteenth;
        this.step = (this.step + 1) % 64;
      }
    },

    stepAt: function (step, t) {
      var bar = Math.floor(step / 16) % 4;
      var s = step % 16;
      var roots = [110, 87.31, 130.81, 98];
      var root = roots[bar];
      var inten = this.intensity;
      var urg = this.urgency;

      var kicks = inten > 0.55 ? [0, 4, 8, 12] : [0, 8];
      if (kicks.indexOf(s) !== -1) {
        this.kick(t);
        this.beat(t, s === 0 ? 1 : 0.6);
      }
      if (inten > 0.1 && (s === 4 || s === 12)) this.snare(t, false);
      if (inten > 0.82 && (s === 7 || s === 15)) this.snare(t, true);
      if (s % 2 === 1 || inten > 0.74) this.hat(t, s % 2 === 0 ? 0.45 : 1);

      if ([0, 3, 6, 8, 11, 14].indexOf(s) !== -1) {
        this.bass(t, root, s === 0 || s === 8 ? 0.25 : 0.13);
      }
      if (inten > 0.3 && [2, 5, 7, 10, 13, 15].indexOf(s) !== -1) {
        var degrees = [0, 3, 7, 12, 15, 19];
        var semi = degrees[(step * 3 + bar) % degrees.length];
        this.pluck(t, root * Math.pow(2, (semi + 24) / 12), 0.16, 0.055, this.music, true);
      }
      if (s === 0 && inten > 0.62) this.sweep(t, 0.12 + urg * 0.08);
    },

    beat: function (t, strength) {
      var self = this;
      var wait = Math.max(0, (t - this.ctx.currentTime) * 1000);
      setTimeout(function () { if (self.onBeat) self.onBeat(strength); }, wait);
    },

    tone: function (type, freq, t, dur, peak, dest, glide) {
      var ctx = this.ctx;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, glide), t + dur * 0.85);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g);
      g.connect(dest || this.music);
      o.start(t);
      o.stop(t + dur + 0.03);
      return g;
    },

    noiseHit: function (t, freq, q, peak, dur, type, dest) {
      var ctx = this.ctx;
      if (!this.noise) return;
      var src = ctx.createBufferSource();
      src.buffer = this.noise;
      var f = ctx.createBiquadFilter();
      f.type = type || 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(dest || this.music);
      src.start(t);
      src.stop(t + dur + 0.02);
    },

    kick: function (t) {
      this.tone('sine', 148, t, 0.26, 0.75, this.music, 44);
      this.noiseHit(t, 2200, 1, 0.05, 0.02, 'highpass', this.music);
    },

    snare: function (t, ghost) {
      this.noiseHit(t, 1900, 0.9, ghost ? 0.09 : 0.16, ghost ? 0.06 : 0.14, 'bandpass', this.music);
      this.tone('triangle', 190, t, 0.09, ghost ? 0.04 : 0.07, this.music, 120);
    },

    hat: function (t, level) {
      this.noiseHit(t, 8600, 0.6, 0.045 * level, 0.035, 'highpass', this.music);
    },

    bass: function (t, freq, dur) {
      var ctx = this.ctx;
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      var f = ctx.createBiquadFilter();
      o.type = 'triangle';
      o.frequency.value = freq;
      f.type = 'lowpass';
      f.frequency.value = 380;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(this.music);
      o.start(t); o.stop(t + dur + 0.02);
    },

    pluck: function (t, freq, dur, peak, dest, wet) {
      var g = this.tone('triangle', freq, t, dur, peak, dest);
      this.tone('sine', freq * 2, t, dur * 0.5, peak * 0.25, dest);
      if (wet && this.delay) g.connect(this.delay);
    },

    sweep: function (t, peak) {
      var ctx = this.ctx;
      var src = ctx.createBufferSource();
      if (!this.noise) return;
      src.buffer = this.noise;
      var f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 1.4;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(4200, t + 0.36);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.42);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + 0.45);
    },

    /* ---- one-shots ------------------------------------------------ */
    correct: function (streak) {
      if (!this.ready() || this.muted) return;
      var t = this.ctx.currentTime + 0.005;
      var scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
      var semi = scale[Math.min(streak, scale.length - 1)];
      var f = 523.25 * Math.pow(2, semi / 12);
      this.pluck(t, f, 0.18, 0.16, this.sfx, true);
      this.pluck(t + 0.055, f * 1.5, 0.14, 0.08, this.sfx, true);
    },

    wrong: function () {
      if (!this.ready() || this.muted) return;
      var t = this.ctx.currentTime + 0.005;
      this.tone('sawtooth', 150, t, 0.22, 0.16, this.sfx, 62);
      this.noiseHit(t, 700, 0.7, 0.09, 0.16, 'bandpass', this.sfx);
    },

    deal: function () {
      if (!this.ready() || this.muted) return;
      var t = this.ctx.currentTime + 0.005;
      this.noiseHit(t, 2600, 1.2, 0.022, 0.05, 'bandpass', this.sfx);
    },

    tick: function (n) {
      if (!this.ready() || this.muted) return;
      var t = this.ctx.currentTime + 0.005;
      this.tone('square', 880 + (5 - n) * 90, t, 0.06, 0.05, this.sfx);
    },

    cycle: function () {
      if (!this.ready() || this.muted) return;
      var t = this.ctx.currentTime + 0.01;
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        this.pluck(t + i * 0.075, notes[i], 0.3, 0.13, this.sfx, true);
      }
      this.noiseHit(t, 5000, 0.8, 0.04, 0.3, 'highpass', this.sfx);
    },

    gameover: function () {
      if (!this.ready() || this.muted) return;
      var t = this.ctx.currentTime + 0.02;
      var notes = [392, 349.23, 293.66, 220];
      for (var i = 0; i < notes.length; i++) {
        this.tone('triangle', notes[i], t + i * 0.14, 0.5, 0.12, this.sfx);
      }
      this.tone('sine', 110, t, 1.5, 0.13, this.sfx, 55);
      this.noiseHit(t, 900, 0.6, 0.04, 0.9, 'lowpass', this.sfx);
    },

    countdown: function (n) {
      if (!this.ready() || this.muted) return;
      var t = this.ctx.currentTime + 0.005;
      var freq = n === 1 ? 880 : n === 2 ? 659.25 : 523.25;
      this.tone('sine', freq, t, 0.18, 0.09, this.sfx);
      this.tone('triangle', freq * 2, t, 0.09, 0.025, this.sfx);
    },

    start: function () {
      if (!this.ready() || this.muted) return;
      var t = this.ctx.currentTime + 0.01;
      this.tone('sine', 220, t, 0.5, 0.1, this.sfx, 880);
      this.pluck(t + 0.12, 880, 0.25, 0.1, this.sfx, true);
    }
  };

  window.AudioEngine = AudioEngine;
})();
