/* Original floating robot mascot — Emerging Tech homepage hero.
   Built entirely from Three.js primitives (no external model files) using
   the classic (non-module) three.js build already loaded site-wide for the
   Vanta.js backgrounds, so this adds zero extra network dependencies.
   Design: dark-cinematic — navy/slate chassis, glowing blue visor,
   brass antenna + hover ring, soft additive glow sprites standing in for
   real bloom (this three.js build predates the built-in bloom pass).
   Falls back silently to the static photo if THREE / WebGL is unavailable. */

(function () {
  var mount = document.getElementById('heroRobot');
  if (!mount) return;
  if (mount.querySelector('canvas')) return; // the react-three-fiber robot already mounted here
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof THREE === 'undefined') return;
  // the homepage already runs two Vanta.js WebGL scenes (hero net + serve
  // band); skip this third GPU-heavy scene on small/mobile screens to avoid
  // stacking three live WebGL contexts on one page — static photo shows instead
  if (window.innerWidth < 820) return;

  try {
    var testCanvas = document.createElement('canvas');
    var testGl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    if (!testGl) return;
  } catch (e) { return; }

  try {
    var SLATE = 0x1b2740;
    var SLATE_L = 0x2c3b5c;
    var BLUE = 0x3d7dff;
    var BRASS = 0xd9ae55;

    var width = mount.clientWidth, height = mount.clientHeight;
    if (!width || !height) return;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 100);
    camera.position.set(0, 0.15, 6.4);

    // lighting — sparse and cool, since the robot's own glow does most of the work
    scene.add(new THREE.AmbientLight(0x1a2440, 0.9));
    var key = new THREE.DirectionalLight(0x9fc3ff, 0.55);
    key.position.set(2.2, 3, 3.5);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0x3d7dff, 0.5);
    rim.position.set(-3, 1.5, -3);
    scene.add(rim);

    // ---- reusable soft glow sprite texture, drawn at runtime ----
    function glowTexture(hex) {
      var c = document.createElement('canvas');
      c.width = c.height = 128;
      var ctx = c.getContext('2d');
      var col = new THREE.Color(hex);
      var r = Math.round(col.r * 255), g = Math.round(col.g * 255), b = Math.round(col.b * 255);
      var grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
      grad.addColorStop(0, 'rgba(' + r + ',' + g + ',' + b + ',1)');
      grad.addColorStop(0.4, 'rgba(' + r + ',' + g + ',' + b + ',.55)');
      grad.addColorStop(1, 'rgba(' + r + ',' + g + ',' + b + ',0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 128);
      return new THREE.CanvasTexture(c);
    }
    var blueGlowTex = glowTexture(BLUE);
    var brassGlowTex = glowTexture(BRASS);

    function glowSprite(tex, scale, opacity) {
      var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: opacity });
      var s = new THREE.Sprite(mat);
      s.scale.set(scale, scale, 1);
      return s;
    }

    var bot = new THREE.Group();
    scene.add(bot);

    function stdMat(color, opts) {
      opts = opts || {};
      return new THREE.MeshStandardMaterial(Object.assign({
        color: color, roughness: 0.45, metalness: 0.35
      }, opts));
    }

    // ---- body ---- (r121 three.js has no CapsuleGeometry, so build a
    // rounded capsule shape by hand from a cylinder + two sphere caps)
    var bodyGroup = new THREE.Group();
    var bodyMat = stdMat(SLATE);
    var bodyCyl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.62, 20), bodyMat);
    bodyGroup.add(bodyCyl);
    var bodyTopCap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), bodyMat);
    bodyTopCap.position.y = 0.31;
    bodyGroup.add(bodyTopCap);
    var bodyBotCap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), bodyMat);
    bodyBotCap.position.y = -0.31;
    bodyGroup.add(bodyBotCap);
    bodyGroup.position.y = -0.35;
    bot.add(bodyGroup);

    var chest = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), stdMat(BLUE, { emissive: new THREE.Color(BLUE), emissiveIntensity: 0.9, roughness: 0.2, metalness: 0.1 }));
    chest.position.set(0, -0.28, 0.5);
    bot.add(chest);
    bot.add((function () { var s = glowSprite(blueGlowTex, 0.9, 0.55); s.position.set(0, -0.28, 0.52); return s; })());

    // ---- neck + head ----
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.18, 12), stdMat(SLATE_L));
    neck.position.y = 0.32;
    bot.add(neck);

    var head = new THREE.Mesh(new THREE.SphereGeometry(0.44, 24, 24), stdMat(SLATE_L, { roughness: 0.35 }));
    head.position.y = 0.78;
    bot.add(head);

    // visor: a slightly recessed glowing bar across the face (rounded box —
    // no bevel geometry needed, the glow sprite behind it softens the edges)
    var visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.10, 0.08),
      stdMat(BLUE, { emissive: new THREE.Color(BLUE), emissiveIntensity: 1.1, roughness: 0.15, metalness: 0.1 })
    );
    visor.position.set(0, 0.80, 0.40);
    bot.add(visor);
    var visorGlow = glowSprite(blueGlowTex, 1.15, 0.6);
    visorGlow.position.set(0, 0.80, 0.43);
    bot.add(visorGlow);

    // antenna
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.34, 6), stdMat(SLATE_L));
    stem.position.set(0, 1.25, 0);
    bot.add(stem);
    var tip = new THREE.Mesh(new THREE.SphereGeometry(0.06, 12, 12), stdMat(BRASS, { emissive: new THREE.Color(BRASS), emissiveIntensity: 1, roughness: 0.2 }));
    tip.position.set(0, 1.44, 0);
    bot.add(tip);
    var tipGlow = glowSprite(brassGlowTex, 0.5, 0.7);
    tipGlow.position.copy(tip.position);
    bot.add(tipGlow);

    // ---- arms ----
    function makeArm(sign) {
      var arm = new THREE.Group();
      var upper = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.075, 0.5, 10), stdMat(SLATE));
      upper.position.y = -0.25;
      arm.add(upper);
      var hand = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), stdMat(SLATE_L, { emissive: new THREE.Color(BRASS), emissiveIntensity: 0.15 }));
      hand.position.y = -0.52;
      arm.add(hand);
      arm.position.set(sign * 0.58, 0.08, 0.02);
      arm.rotation.z = sign * 0.14;
      return arm;
    }
    var armL = makeArm(-1), armR = makeArm(1);
    bot.add(armL, armR);

    // ---- hover ring (replaces legs — floating mascot) ----
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.5, 0.028, 10, 40),
      stdMat(BRASS, { emissive: new THREE.Color(BRASS), emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.5 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.02;
    bot.add(ring);
    var ringGlow = glowSprite(brassGlowTex, 1.5, 0.4);
    ringGlow.rotation.x = Math.PI / 2;
    ringGlow.position.y = -1.02;
    bot.add(ringGlow);

    // rising embers drifting up from the hover ring
    var EMBER_COUNT = 18;
    var emberGeo = new THREE.BufferGeometry();
    var emberPos = new Float32Array(EMBER_COUNT * 3);
    var emberSeed = [];
    for (var i = 0; i < EMBER_COUNT; i++) {
      var a = Math.random() * Math.PI * 2, r = 0.3 + Math.random() * 0.3;
      emberPos[i * 3] = Math.cos(a) * r;
      emberPos[i * 3 + 1] = -1.0;
      emberPos[i * 3 + 2] = Math.sin(a) * r;
      emberSeed.push({ a: a, r: r, speed: 0.15 + Math.random() * 0.25, offset: Math.random() * 10 });
    }
    emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
    var emberMat = new THREE.PointsMaterial({ size: 0.05, map: brassGlowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: BRASS, opacity: 0.8 });
    var embers = new THREE.Points(emberGeo, emberMat);
    bot.add(embers);

    bot.scale.setScalar(1.5);
    bot.position.y = -0.1;

    // ---- interaction ----
    var pointer = { x: 0, y: 0 };
    var pointerT = { x: 0, y: 0 };
    mount.addEventListener('pointermove', function (ev) {
      var rect = mount.getBoundingClientRect();
      pointerT.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointerT.y = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
    });
    mount.addEventListener('pointerleave', function () { pointerT.x = 0; pointerT.y = 0; });

    function onResize() {
      var w = mount.clientWidth, h = mount.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    }
    window.addEventListener('resize', onResize);

    var clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      var t = clock.getElapsedTime();
      var dt = Math.min(clock.getDelta(), 0.05);

      // smooth pointer follow (faster catch-up so the roll feels snappier)
      pointer.x += (pointerT.x - pointer.x) * Math.min(dt * 6.5, 1);
      pointer.y += (pointerT.y - pointer.y) * Math.min(dt * 6.5, 1);

      bot.position.y = -0.1 + Math.sin(t * 1.3) * 0.09;
      bot.rotation.y = pointer.x * 0.55;
      bot.rotation.z = -pointer.x * 0.35; // visible rolling-ball tilt as it tracks the cursor
      head.rotation.y = pointer.x * 0.22;
      head.rotation.x = -pointer.y * 0.14;
      visor.rotation.y = head.rotation.y;

      armL.rotation.z = -0.14 + Math.sin(t * 1.3) * 0.05;
      armR.rotation.z = 0.14 - Math.sin(t * 1.3 + 0.7) * 0.05;

      ring.rotation.z = t * 0.85;
      ringGlow.material.opacity = 0.32 + Math.sin(t * 1.6) * 0.1;

      // blink: visor dims briefly on a repeating cycle
      var blinkCycle = 3.4, cyclePos = t % blinkCycle;
      var blinkAmt = cyclePos < 0.14 ? Math.sin((cyclePos / 0.14) * Math.PI) : 0;
      var baseGlow = 1.1 - blinkAmt * 0.85;
      visor.material.emissiveIntensity = baseGlow;
      visorGlow.material.opacity = 0.6 - blinkAmt * 0.45;
      visorGlow.scale.setScalar(1.15 - blinkAmt * 0.3);

      tipGlow.material.opacity = 0.55 + Math.sin(t * 2.4) * 0.15;

      // drift embers upward, loop back to the ring when they rise too far
      var pos = emberGeo.attributes.position.array;
      for (var i2 = 0; i2 < EMBER_COUNT; i2++) {
        var seed = emberSeed[i2];
        var travel = ((t + seed.offset) * seed.speed) % 1.1;
        pos[i2 * 3 + 1] = -1.02 + travel;
        var shrink = 1 - travel / 1.1;
        var a2 = seed.a + t * 0.15;
        pos[i2 * 3] = Math.cos(a2) * seed.r * shrink;
        pos[i2 * 3 + 2] = Math.sin(a2) * seed.r * shrink;
      }
      emberGeo.attributes.position.needsUpdate = true;
      emberMat.opacity = 0.7;

      renderer.render(scene, camera);
    }
    animate();

    mount.classList.add('is-live');
    var fallbackImg = mount.parentElement && mount.parentElement.querySelector('img');
    if (fallbackImg) {
      fallbackImg.style.transition = 'opacity 1s ease';
      fallbackImg.style.opacity = '0';
    }
  } catch (e) {
    try { mount.innerHTML = ''; } catch (e2) {}
  }
})();
