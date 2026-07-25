/* Original hero background — combines three ambient-motion ideas into one
   light-theme layer: (1) slow floating SVG line paths, (2) a mouse-reactive
   fluid particle field, (3) a thin animated wave along the section's lower
   edge. Pure vanilla JS/SVG/Canvas, no libraries, works from file:// too. */

(function () {
  var mount = document.getElementById('heroBg');
  if (!mount) return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var NS = 'http://www.w3.org/2000/svg';
  var COLORS = ['#1655C0', '#14304F', '#B98A2F'];

  /* ---------- layer 1: floating bezier line paths ---------- */
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'heroBg-paths');
  svg.setAttribute('preserveAspectRatio', 'none');
  mount.appendChild(svg);

  var PATH_COUNT = 16;
  var paths = [];

  function buildPaths(w, h) {
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    svg.innerHTML = '';
    paths = [];
    for (var i = 0; i < PATH_COUNT; i++) {
      var y0 = (h / PATH_COUNT) * i + (Math.random() - 0.5) * (h / PATH_COUNT);
      var path = document.createElementNS(NS, 'path');
      var color = COLORS[i % COLORS.length];
      path.setAttribute('stroke', color);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke-width', (0.6 + Math.random() * 0.9).toFixed(2));
      path.setAttribute('opacity', (0.08 + Math.random() * 0.1).toFixed(2));
      svg.appendChild(path);
      paths.push({
        el: path,
        y0: y0,
        amp: 26 + Math.random() * 46,
        freq: 0.6 + Math.random() * 0.9,
        speed: 0.05 + Math.random() * 0.09,
        phase: Math.random() * Math.PI * 2,
        pulsePhase: Math.random() * Math.PI * 2
      });
    }
  }

  function drawPaths(w, h, t) {
    for (var i = 0; i < paths.length; i++) {
      var p = paths[i];
      var steps = 5, d = 'M0 ' + (p.y0);
      for (var s = 1; s <= steps; s++) {
        var x = (w / steps) * s;
        var y = p.y0 + Math.sin(t * p.speed + p.phase + s * p.freq) * p.amp;
        var cx = x - (w / steps) / 2;
        var cy = p.y0 + Math.sin(t * p.speed + p.phase + (s - 0.5) * p.freq) * p.amp;
        d += ' Q ' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + x.toFixed(1) + ' ' + y.toFixed(1);
      }
      p.el.setAttribute('d', d);
      var pulse = 0.5 + 0.5 * Math.sin(t * 0.35 + p.pulsePhase);
      p.el.setAttribute('opacity', (0.05 + pulse * 0.1).toFixed(3));
    }
  }

  /* ---------- layer 2: fluid, mouse-reactive particle field ---------- */
  var canvas = document.createElement('canvas');
  canvas.className = 'heroBg-particles';
  mount.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var particles = [];
  var pointer = { x: -9999, y: -9999 };
  var PARTICLE_COUNT = 46;

  function buildParticles(w, h) {
    particles = [];
    for (var i = 0; i < PARTICLE_COUNT; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.18,
        vy: (Math.random() - 0.5) * 0.18,
        r: 1.1 + Math.random() * 1.7,
        c: COLORS[i % COLORS.length]
      });
    }
  }

  function stepParticles(w, h) {
    ctx.clearRect(0, 0, w, h);
    for (var i = 0; i < particles.length; i++) {
      var a = particles[i];
      var dx = pointer.x - a.x, dy = pointer.y - a.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 130) {
        var f = (130 - dist) / 130 * 0.035;
        a.vx -= (dx / (dist || 1)) * f;
        a.vy -= (dy / (dist || 1)) * f;
      }
      a.vx *= 0.985; a.vy *= 0.985;
      a.x += a.vx; a.y += a.vy;
      if (a.x < 0 || a.x > w) a.vx *= -1;
      if (a.y < 0 || a.y > h) a.vy *= -1;
      a.x = Math.max(0, Math.min(w, a.x));
      a.y = Math.max(0, Math.min(h, a.y));
    }
    for (var i2 = 0; i2 < particles.length; i2++) {
      for (var j = i2 + 1; j < particles.length; j++) {
        var p1 = particles[i2], p2 = particles[j];
        var ddx = p1.x - p2.x, ddy = p1.y - p2.y;
        var d2 = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d2 < 110) {
          ctx.strokeStyle = 'rgba(22,85,192,' + ((1 - d2 / 110) * 0.12).toFixed(3) + ')';
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
        }
      }
    }
    for (var k = 0; k < particles.length; k++) {
      var b = particles[k];
      ctx.beginPath();
      ctx.fillStyle = b.c;
      ctx.globalAlpha = 0.34;
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  mount.addEventListener('pointermove', function (ev) {
    var rect = mount.getBoundingClientRect();
    pointer.x = ev.clientX - rect.left;
    pointer.y = ev.clientY - rect.top;
  });
  mount.addEventListener('pointerleave', function () { pointer.x = -9999; pointer.y = -9999; });

  /* ---------- layer 3: thin animated wave along the lower edge ---------- */
  var waveSvg = document.createElementNS(NS, 'svg');
  waveSvg.setAttribute('class', 'heroBg-wave');
  waveSvg.setAttribute('preserveAspectRatio', 'none');
  var wavePath = document.createElementNS(NS, 'path');
  wavePath.setAttribute('fill', 'none');
  wavePath.setAttribute('stroke', '#B98A2F');
  wavePath.setAttribute('stroke-width', '1.4');
  wavePath.setAttribute('opacity', '0.22');
  waveSvg.appendChild(wavePath);
  mount.appendChild(waveSvg);

  function drawWave(w, h, t) {
    waveSvg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    var baseY = h - 26, amp = 9, d = 'M0 ' + baseY;
    var steps = 10;
    for (var s = 1; s <= steps; s++) {
      var x = (w / steps) * s;
      var y = baseY + Math.sin(t * 0.6 + s * 0.9) * amp;
      d += ' L ' + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    wavePath.setAttribute('d', d);
  }

  /* ---------- sizing + loop ---------- */
  function resize() {
    var w = mount.clientWidth, h = mount.clientHeight;
    if (!w || !h) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = w * dpr; canvas.height = h * dpr;
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildPaths(w, h);
    buildParticles(w, h);
  }
  window.addEventListener('resize', resize);
  resize();

  if (reduce) {
    var w0 = mount.clientWidth, h0 = mount.clientHeight;
    drawPaths(w0, h0, 0);
    drawWave(w0, h0, 0);
    stepParticles(w0, h0);
    return;
  }

  var start = null;
  function frame(ts) {
    if (start === null) start = ts;
    var t = (ts - start) / 1000;
    var w = mount.clientWidth, h = mount.clientHeight;
    if (w && h) {
      drawPaths(w, h, t);
      drawWave(w, h, t);
      stepParticles(w, h);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
