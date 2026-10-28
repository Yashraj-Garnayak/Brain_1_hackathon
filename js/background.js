/* Moving backdrop: perspective floor + radial speed lines.
   Speed and warmth are driven by the game's pressure / urgency. */
(function () {
  'use strict';
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var mix = function (a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  };
  var rgba = function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };

  function Backdrop(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = 0;
    this.h = 0;
    this.dpr = 1;
    this.intensity = 0.22;
    this.urgency = 0;
    this.pulseAmt = 0;
    this.scroll = 0;
    this.lines = [];
    this.last = 0;
    this.reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.resize();
    var self = this;
    window.addEventListener('resize', function () { self.resize(); });
    if (this.reduced) {
      this.staticFrame();
    } else {
      requestAnimationFrame(function (t) { self.loop(t); });
    }
  }

  Backdrop.prototype = {
    resize: function () {
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = window.innerWidth;
      var h = window.innerHeight;
      this.w = w; this.h = h; this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!this.lines.length) this.seed();
      if (this.reduced) this.staticFrame();
    },

    seed: function () {
      this.lines = [];
      var n = window.innerWidth < 700 ? 46 : 82;
      for (var i = 0; i < n; i++) {
        this.lines.push({
          a: Math.random() * Math.PI * 2,
          r: Math.random(),
          speed: 0.035 + Math.random() * 0.13,
          len: 0.05 + Math.random() * 0.17,
          width: Math.random() < 0.14 ? 2 : 1,
          warm: Math.random()
        });
      }
    },

    setIntensity: function (v) { this.intensity = clamp(v, 0, 1); },
    setUrgency: function (v) { this.urgency = clamp(v, 0, 1); },
    pulse: function (strength) { this.pulseAmt = Math.min(1.4, this.pulseAmt + (strength || 0.6)); },

    colors: function () {
      var u = clamp(this.urgency * 0.85 + this.intensity * 0.1, 0, 1);
      return {
        a: mix([94, 234, 212], [251, 146, 60], u),
        b: mix([129, 140, 248], [251, 113, 133], u),
        u: u
      };
    },

    loop: function (t) {
      var self = this;
      requestAnimationFrame(function (nt) { self.loop(nt); });
      if (!this.last) this.last = t;
      var dt = clamp((t - this.last) / 1000, 0, 0.05);
      this.last = t;
      this.pulseAmt += (0 - this.pulseAmt) * Math.min(1, dt * 5.5);
      this.scroll = (this.scroll + dt * (0.035 + this.intensity * 0.16 + this.urgency * 0.1)) % 1;
      this.draw(dt);
    },

    draw: function (dt) {
      var ctx = this.ctx;
      var w = this.w, h = this.h;
      if (!w || !h) return;
      var c = this.colors();
      var intensity = this.intensity;
      var pulse = this.pulseAmt;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter';

      /* --- radial speed lines ------------------------------------- */
      var cx = w * 0.5;
      var cy = h * 0.46;
      var maxR = Math.hypot(w, h) * 0.62;
      var speedMul = 0.35 + intensity * 2.4 + pulse * 1.1;
      for (var i = 0; i < this.lines.length; i++) {
        var L = this.lines[i];
        L.r += L.speed * dt * speedMul;
        if (L.r > 1.05) {
          L.r = Math.random() * 0.05;
          L.a = Math.random() * Math.PI * 2;
        }
        var r0 = L.r * maxR;
        var r1 = r0 + L.len * maxR * (0.5 + intensity * 0.9);
        var fade = Math.sin(clamp(L.r, 0, 1) * Math.PI);
        var alpha = fade * (0.2 + intensity * 0.22) * (0.5 + pulse * 0.5);
        if (alpha < 0.004) continue;
        var col = L.warm > 0.5 + c.u * 0.2 ? c.b : c.a;
        ctx.strokeStyle = rgba(col, alpha);
        ctx.lineWidth = L.width;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(L.a) * r0, cy + Math.sin(L.a) * r0);
        ctx.lineTo(cx + Math.cos(L.a) * r1, cy + Math.sin(L.a) * r1);
        ctx.stroke();
      }

      /* --- perspective floor -------------------------------------- */
      var horizon = h * 0.66;
      var gridA = (0.09 + intensity * 0.07 + pulse * 0.03) * (0.7 + c.u * 0.3);
      ctx.lineWidth = 1;
      ctx.strokeStyle = rgba(c.a, gridA);
      var spread = Math.max(w * 0.12, 140);
      ctx.beginPath();
      for (var v = -9; v <= 9; v++) {
        var topX = cx + v * (spread * 0.06);
        var botX = cx + v * (spread / 2.1);
        ctx.moveTo(topX, horizon);
        ctx.lineTo(botX, h + 2);
      }
      ctx.stroke();

      ctx.strokeStyle = rgba(c.b, gridA * 0.85);
      ctx.beginPath();
      var rows = 13;
      for (var k = 0; k <= rows; k++) {
        var p = (k + this.scroll) / rows;
        if (p <= 0) continue;
        var y = horizon + (h - horizon) * Math.pow(p, 2.25);
        if (y > h + 2) continue;
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      /* --- centre bloom ------------------------------------------- */
      var bloom = ctx.createRadialGradient(cx, h * 0.4, 0, cx, h * 0.4, Math.max(w, h) * 0.55);
      bloom.addColorStop(0, rgba(c.a, 0.075 + intensity * 0.05 + pulse * 0.055));
      bloom.addColorStop(0.5, rgba(c.b, 0.02 + pulse * 0.02));
      bloom.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bloom;
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'source-over';
    },

    staticFrame: function () {
      var ctx = this.ctx;
      var w = this.w, h = this.h;
      if (!w || !h) return;
      ctx.clearRect(0, 0, w, h);
      var c = { a: [94, 234, 212], b: [129, 140, 248], u: 0 };
      var g = ctx.createRadialGradient(w * 0.5, h * 0.4, 0, w * 0.5, h * 0.4, Math.max(w, h) * 0.6);
      g.addColorStop(0, rgba(c.a, 0.05));
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
  };

  window.Backdrop = Backdrop;
})();
