/* Original animated 3D robot — Emerging Tech homepage hero.
   A stylized, low-poly hover-bot built entirely from Three.js primitives
   (no external model files), loaded via classic (non-module) CDN script so
   it also renders from file:// during local preview. Light theme: pale
   card backdrop, navy/slate chassis, blue visor glow, brass accents.
   Falls back silently to the static photo if THREE / WebGL is unavailable. */

(function () {
  var mount = document.getElementById('hero3d');
  if (!mount) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (typeof THREE === 'undefined') return;

  try {
    var testCanvas = document.createElement('canvas');
    var testGl = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
    if (!testGl) return;
  } catch (e) { return; }

  try {
    var NAVY = 0x14304f;
    var SLATE = 0x7a8794;
    var PALE = 0xe9ebe5;
    var BLUE = 0x1655c0;
    var BRASS = 0xb98a2f;

    var width = mount.clientWidth, height = mount.clientHeight;
    if (!width || !height) return;

    var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, width / height, 0.1, 100);
    camera.position.set(0, 0.2, 6.2);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x2a3b52, 1.05));
    var key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(2.5, 3.5, 4);
    scene.add(key);
    var rim = new THREE.DirectionalLight(0xbcd4ff, 0.4);
    rim.position.set(-3, 1, -2);
    scene.add(rim);

    var bot = new THREE.Group();
    scene.add(bot);

    function mat(color, opts) {
      opts = opts || {};
      return new THREE.MeshStandardMaterial(Object.assign({
        color: color, flatShading: true, roughness: 0.55, metalness: 0.18
      }, opts));
    }

    // body
    var body = new THREE.Mesh(new THREE.BoxGeometry(1.15, 1.3, 0.85), mat(NAVY));
    body.position.y = -0.35;
    bot.add(body);

    // chest panel glow
    var chest = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.42, 0.06),
      mat(BLUE, { emissive: 0x0c2e6b, emissiveIntensity: 0.6, roughness: 0.3 })
    );
    chest.position.set(0, -0.3, 0.46);
    bot.add(chest);

    // neck
    var neck = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.22, 8), mat(SLATE));
    neck.position.y = 0.42;
    bot.add(neck);

    // head
    var head = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.72, 0.78), mat(PALE, { roughness: 0.4 }));
    head.position.y = 0.92;
    bot.add(head);

    // visor
    var visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.66, 0.24, 0.06),
      mat(BLUE, { emissive: 0x2e6fe0, emissiveIntensity: 0.9, roughness: 0.25 })
    );
    visor.position.set(0, 0.94, 0.42);
    bot.add(visor);

    // antenna
    var stem = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6), mat(SLATE));
    stem.position.set(0, 1.5, 0);
    bot.add(stem);
    var tip = new THREE.Mesh(
      new THREE.SphereGeometry(0.075, 10, 10),
      mat(BRASS, { emissive: 0x7a5a1e, emissiveIntensity: 0.7, roughness: 0.3 })
    );
    tip.position.set(0, 1.73, 0);
    bot.add(tip);

    // arms (hang from shoulders, gently swing)
    function makeArm(sign) {
      var arm = new THREE.Group();
      var upper = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.1, 0.62, 8), mat(SLATE));
      upper.position.y = -0.31;
      arm.add(upper);
      var joint = new THREE.Mesh(
        new THREE.SphereGeometry(0.11, 10, 10),
        mat(BRASS, { emissive: 0x7a5a1e, emissiveIntensity: 0.35 })
      );
      joint.position.y = -0.62;
      arm.add(joint);
      arm.position.set(sign * 0.72, 0.18, 0);
      arm.rotation.z = sign * 0.12;
      return arm;
    }
    var armL = makeArm(-1), armR = makeArm(1);
    bot.add(armL, armR);

    // hover ring beneath the body (suggests it's floating, not standing)
    var ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.62, 0.035, 8, 32),
      mat(BRASS, { emissive: 0x8a6423, emissiveIntensity: 0.7, roughness: 0.3, metalness: 0.4 })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -1.15;
    bot.add(ring);

    bot.scale.setScalar(1.55);
    bot.position.y = -0.15;

    var pointer = { x: 0, y: 0 };
    mount.addEventListener('pointermove', function (ev) {
      var rect = mount.getBoundingClientRect();
      pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = ((ev.clientY - rect.top) / rect.height) * 2 - 1;
    });

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

      bot.position.y = -0.15 + Math.sin(t * 1.15) * 0.09;
      bot.rotation.y = pointer.x * 0.35;
      head.rotation.y = pointer.x * 0.18;
      head.rotation.x = -pointer.y * 0.12;

      armL.rotation.z = -0.12 + Math.sin(t * 1.4) * 0.05;
      armR.rotation.z = 0.12 - Math.sin(t * 1.4 + 0.6) * 0.05;

      ring.rotation.z = t * 0.6;
      ring.material.emissiveIntensity = 0.55 + Math.sin(t * 2.2) * 0.2;
      visor.material.emissiveIntensity = 0.8 + Math.sin(t * 3) * 0.15;

      renderer.render(scene, camera);
    }
    animate();

    mount.classList.add('is-live');
    var fallbackImg = mount.parentElement && mount.parentElement.querySelector('img');
    if (fallbackImg) {
      fallbackImg.style.transition = 'opacity .9s ease';
      fallbackImg.style.opacity = '0';
    }
  } catch (e) {
    try { mount.innerHTML = ''; } catch (e2) {}
  }
})();
