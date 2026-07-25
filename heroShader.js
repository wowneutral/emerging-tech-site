/* Original animated mesh-gradient shader — Emerging Tech hero background.
   Raw WebGL (no libraries), classic script (works from file:// too).
   Renders slow-drifting pale blue/brass color blobs on a paper base,
   sitting behind the hero copy. Silently no-ops if WebGL is unavailable —
   the existing solid --paper background shows through instead. */

(function () {
  var canvas = document.getElementById('heroShader');
  if (!canvas) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) return;

  var VERT = [
    'attribute vec2 aPos;',
    'void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }'
  ].join('\n');

  var FRAG = [
    'precision mediump float;',
    'uniform vec2 uRes;',
    'uniform float uTime;',
    '',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }',
    '',
    'void main(){',
    '  vec2 uv = gl_FragCoord.xy / uRes;',
    '  uv.x *= uRes.x / uRes.y;',
    '  float ar = uRes.x / uRes.y;',
    '',
    '  vec3 paper = vec3(0.980, 0.980, 0.973);',
    '  vec3 wash  = vec3(0.933, 0.937, 0.918);',
    '  vec3 blue  = vec3(0.086, 0.333, 0.753);',
    '  vec3 brass = vec3(0.851, 0.682, 0.335);',
    '',
    '  vec2 p1 = vec2(0.30 + 0.15*sin(uTime*0.150), 0.62 + 0.12*cos(uTime*0.110)) * vec2(ar,1.0);',
    '  vec2 p2 = vec2(0.78 + 0.12*cos(uTime*0.130+1.0), 0.70 + 0.15*sin(uTime*0.090+2.0)) * vec2(ar,1.0);',
    '  vec2 p3 = vec2(0.55 + 0.18*sin(uTime*0.080+3.0), 0.20 + 0.13*cos(uTime*0.120+1.5)) * vec2(ar,1.0);',
    '  vec2 p4 = vec2(0.10 + 0.10*cos(uTime*0.100+4.0), 0.30 + 0.10*sin(uTime*0.140+0.5)) * vec2(ar,1.0);',
    '',
    '  float d1 = distance(uv, p1);',
    '  float d2 = distance(uv, p2);',
    '  float d3 = distance(uv, p3);',
    '  float d4 = distance(uv, p4);',
    '',
    '  float b1 = smoothstep(0.62, 0.0, d1);',
    '  float b2 = smoothstep(0.55, 0.0, d2);',
    '  float b3 = smoothstep(0.68, 0.0, d3);',
    '  float b4 = smoothstep(0.50, 0.0, d4);',
    '',
    '  vec3 col = paper;',
    '  col = mix(col, wash,  b3 * 0.55);',
    '  col = mix(col, blue,  b1 * 0.16);',
    '  col = mix(col, brass, b2 * 0.14);',
    '  col = mix(col, blue,  b4 * 0.10);',
    '',
    '  float grain = (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.02;',
    '  col += grain;',
    '',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  function compile(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      gl.deleteShader(s);
      return null;
    }
    return s;
  }

  var vs = compile(gl.VERTEX_SHADER, VERT);
  var fs = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vs || !fs) return;

  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
  gl.useProgram(prog);

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  var aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  var uRes = gl.getUniformLocation(prog, 'uRes');
  var uTime = gl.getUniformLocation(prog, 'uTime');

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  }
  window.addEventListener('resize', resize);
  resize();

  function draw(t) {
    gl.uniform1f(uTime, t);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  if (reduce) {
    draw(0);
  } else {
    var start = null;
    (function frame(ts) {
      if (start === null) start = ts;
      draw((ts - start) / 1000);
      requestAnimationFrame(frame);
    })(0);
  }
})();
