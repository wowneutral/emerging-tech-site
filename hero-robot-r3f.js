/* Hero robot — real react-three-fiber port of the user-supplied RobotPrototype
   component (originally a Next.js/@react-three/fiber/@react-three/drei
   component). Loaded here as native browser ES modules via esm.sh (which
   pre-bundles the npm packages server-side), with an import map for clean
   bare-specifier imports — no npm install or build step required.

   This is a faithful, mechanical JSX -> React.createElement port of:
     HeartCurve, GlassCapsule, RobotEar, RobotEye, generatePbrTexturesAsync,
     RobotPrototype, ResponsiveGroup
   from the pasted component. The outer marketing page (AntennaNavbar,
   giant background text, page-level light-gray gradient, framer-motion,
   react-icons) is intentionally dropped — it isn't the robot, and this
   version mounts into the existing dark hero photo panel instead of taking
   over the full viewport.

   Every dependency is loaded via dynamic import() inside a try/catch, so if
   any CDN module fails (network hiccup, version mismatch, blocked request)
   this fails silently and the static fallback photo already in the DOM
   stays visible — nothing breaks for the visitor either way. */

(async function () {
  var mount = document.getElementById('heroRobot');
  if (!mount) return;
  if (mount.querySelector('canvas')) return; // the watchdog in script.js already fell back to the vanilla robot
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.innerWidth < 820) return; // same perf guard as the primitive fallback build

  try {
    var testCanvas = document.createElement('canvas');
    var testGl = testCanvas.getContext('webgl2') || testCanvas.getContext('webgl');
    if (!testGl) return;
  } catch (e) { return; }

  try {
    var React = await import('react');
    var ReactDOMClient = await import('react-dom/client');
    var THREE = await import('three');
    var Fiber = await import('@react-three/fiber');
    var Drei = await import('@react-three/drei');

    var useRef = React.useRef, useState = React.useState, useMemo = React.useMemo, useEffect = React.useEffect;
    var Canvas = Fiber.Canvas, useFrame = Fiber.useFrame, useThree = Fiber.useThree;
    var ContactShadows = Drei.ContactShadows;
    var h = React.createElement;

    // ---------------- cyber-logo eyes: the actual Emerging Tech mark
    // (brand/logo-mark-official.png, transparent-background circuit "T"),
    // textured onto a small plane and pushed bright cyan so it reads as a
    // glowing HUD icon — swapped in for a couple seconds after the robot is
    // clicked, instead of the old heart-eyes. ----------------
    var cyberLogoTex = new THREE.TextureLoader().load('brand/logo-mark-official.png');
    if ('colorSpace' in cyberLogoTex) cyberLogoTex.colorSpace = THREE.SRGBColorSpace;
    cyberLogoTex.magFilter = THREE.LinearFilter;
    cyberLogoTex.minFilter = THREE.LinearMipmapLinearFilter;
    cyberLogoTex.anisotropy = 16;
    cyberLogoTex.generateMipmaps = true;
    var cyberLogoMat = new THREE.MeshBasicMaterial({
      map: cyberLogoTex, color: new THREE.Color(0.5, 2.6, 2.9),
      transparent: true, alphaTest: 0.35, toneMapped: false, side: THREE.DoubleSide, depthWrite: false
    });
    var CYBER_LOGO_W = 0.15, CYBER_LOGO_H = CYBER_LOGO_W / 2.19;

    // ---------------- ResponsiveGroup ----------------
    function ResponsiveGroup(props) {
      var viewport = useThree(function (s) { return s.viewport; });
      var scale = Math.min(1.1, viewport.width / 3.5);
      return h('group', { scale: scale }, props.children);
    }

    // ---------------- GlassCapsule (fresnel glass shader over the head) ----------------
    function GlassCapsule(props) {
      var materialRef = useRef(null);
      var uniforms = useMemo(function () {
        return {
          color: { value: new THREE.Color('#ffffff') },
          power: { value: 2.5 },
          intensity: { value: 0.6 }
        };
      }, []);
      useFrame(function () {
        if (materialRef.current) {
          materialRef.current.uniforms.color.value.set(props.color);
          materialRef.current.uniforms.power.value = props.power;
          materialRef.current.uniforms.intensity.value = props.intensity;
        }
      });
      return h('mesh', null,
        h('sphereGeometry', { args: [0.30, 64, 64, 0, Math.PI * 2, 0, Math.PI] }),
        h('shaderMaterial', {
          ref: materialRef,
          uniforms: uniforms,
          vertexShader: [
            'varying vec3 vNormal;',
            'varying vec3 vViewPosition;',
            'void main() {',
            '  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);',
            '  vViewPosition = -mvPosition.xyz;',
            '  vNormal = normalize(normalMatrix * normal);',
            '  gl_Position = projectionMatrix * mvPosition;',
            '}'
          ].join('\n'),
          fragmentShader: [
            'uniform vec3 color;',
            'uniform float power;',
            'uniform float intensity;',
            'varying vec3 vNormal;',
            'varying vec3 vViewPosition;',
            'void main() {',
            '  vec3 normal = normalize(vNormal);',
            '  vec3 viewDir = normalize(vViewPosition);',
            '  float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);',
            '  fresnel = pow(fresnel, power);',
            '  gl_FragColor = vec4(color, fresnel * intensity);',
            '}'
          ].join('\n'),
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      );
    }

    // ---------------- ears / antenna ----------------
    var earBaseMat = new THREE.MeshStandardMaterial({ color: '#f0f0f0', roughness: 0.5 });
    var earRingMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.3 });
    var earCenterMat = new THREE.MeshStandardMaterial({ color: '#cccccc', roughness: 0.8 });
    var antennaBaseMat = new THREE.MeshStandardMaterial({ color: '#999999', roughness: 0.4, metalness: 0.5 });
    var antennaStickMat = new THREE.MeshStandardMaterial({ color: '#d0d0d0', roughness: 0.4, metalness: 0.2 });
    var antennaTipMat = new THREE.MeshStandardMaterial({ color: '#3d7dff', roughness: 0.2, toneMapped: false });

    function RobotEar(props) {
      var isLeft = !!props.isLeft;
      var scale = props.scale == null ? 1 : props.scale;
      var dir = isLeft ? -1 : 1;
      return h('group', { position: props.position, scale: scale },
        h('mesh', { rotation: [0, 0, Math.PI / 2], castShadow: true, receiveShadow: true, material: earBaseMat },
          h('cylinderGeometry', { args: [0.04, 0.04, 0.025, 32] })
        ),
        h('mesh', { position: [dir * 0.012, 0, 0], rotation: [0, 0, Math.PI / 2], castShadow: true, receiveShadow: true, material: earRingMat },
          h('torusGeometry', { args: [0.032, 0.008, 16, 32] })
        ),
        h('mesh', { position: [dir * 0.012, 0, 0], rotation: [0, 0, Math.PI / 2], castShadow: true, receiveShadow: true, material: earCenterMat },
          h('cylinderGeometry', { args: [0.03, 0.03, 0.005, 32] })
        ),
        h('group', { position: [dir * 0.015, 0.035, 0], rotation: [-0.4, 0, 0] },
          h('mesh', { position: [0, 0.01, 0], castShadow: true, receiveShadow: true, material: antennaBaseMat },
            h('cylinderGeometry', { args: [0.006, 0.008, 0.02, 16] })
          ),
          h('mesh', { position: [0, 0.06, 0], castShadow: true, receiveShadow: true, material: antennaStickMat },
            h('cylinderGeometry', { args: [0.003, 0.003, 0.1, 8] })
          ),
          h('mesh', { position: [0, 0.11, 0], castShadow: true, receiveShadow: true, material: antennaTipMat },
            h('sphereGeometry', { args: [0.006, 16, 16] })
          )
        )
      );
    }

    // ---------------- eyes (blink cycle + glowing cyber-logo eyes on click) ---
    var eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 2, 2), toneMapped: false, transparent: true });

    function RobotEye(props) {
      var scale = props.scale == null ? 1 : props.scale;
      var blinkDuration = props.blinkDuration == null ? 0.15 : props.blinkDuration;
      var blinkCycle = props.blinkCycle == null ? 3.0 : props.blinkCycle;
      var groupRef = useRef(null);
      var normalEyesRef = useRef(null);
      var heartEyeRef = useRef(null);

      useFrame(function (state) {
        if (!groupRef.current || !normalEyesRef.current || !heartEyeRef.current) return;
        var isHeart = props.isLovedRef.current;
        normalEyesRef.current.visible = !isHeart;
        heartEyeRef.current.visible = isHeart;
        var cycle = state.clock.getElapsedTime() % blinkCycle;
        var targetScaleY = 1;
        if (cycle < blinkDuration && !isHeart) {
          var progress = cycle / blinkDuration;
          var blinkClose = Math.sin(progress * Math.PI);
          targetScaleY = Math.max(0.05, 1.0 - blinkClose);
        }
        groupRef.current.scale.set(scale, scale * targetScaleY, scale);
      });

      var paths = useMemo(function () {
        var w = 0.025, hgt = 0.035, r = 0.02, g = 0.005;
        var tPath = new THREE.CurvePath();
        tPath.add(new THREE.LineCurve3(new THREE.Vector3(-w, g, 0), new THREE.Vector3(-w, hgt - r, 0)));
        tPath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-w, hgt - r, 0), new THREE.Vector3(-w, hgt, 0), new THREE.Vector3(-w + r, hgt, 0)));
        tPath.add(new THREE.LineCurve3(new THREE.Vector3(-w + r, hgt, 0), new THREE.Vector3(w - r, hgt, 0)));
        tPath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(w - r, hgt, 0), new THREE.Vector3(w, hgt, 0), new THREE.Vector3(w, hgt - r, 0)));
        tPath.add(new THREE.LineCurve3(new THREE.Vector3(w, hgt - r, 0), new THREE.Vector3(w, g, 0)));
        var bPath = new THREE.CurvePath();
        bPath.add(new THREE.LineCurve3(new THREE.Vector3(-w, -g, 0), new THREE.Vector3(-w, -(hgt - r), 0)));
        bPath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-w, -(hgt - r), 0), new THREE.Vector3(-w, -hgt, 0), new THREE.Vector3(-w + r, -hgt, 0)));
        bPath.add(new THREE.LineCurve3(new THREE.Vector3(-w + r, -hgt, 0), new THREE.Vector3(w - r, -hgt, 0)));
        bPath.add(new THREE.QuadraticBezierCurve3(new THREE.Vector3(w - r, -hgt, 0), new THREE.Vector3(w, -hgt, 0), new THREE.Vector3(w, -(hgt - r), 0)));
        bPath.add(new THREE.LineCurve3(new THREE.Vector3(w, -(hgt - r), 0), new THREE.Vector3(w, -g, 0)));
        return { topPath: tPath, bottomPath: bPath };
      }, []);

      return h('group', { ref: groupRef, position: props.position, rotation: props.rotation, scale: scale },
        h('mesh', { ref: heartEyeRef, visible: false, material: cyberLogoMat },
          h('planeGeometry', { args: [CYBER_LOGO_W, CYBER_LOGO_H] })
        ),
        h('group', { ref: normalEyesRef },
          h('mesh', { material: eyeMat }, h('tubeGeometry', { args: [paths.topPath, 20, 0.0035, 8, false] })),
          h('mesh', { material: eyeMat }, h('tubeGeometry', { args: [paths.bottomPath, 20, 0.0035, 8, false] }))
        )
      );
    }

    // ---------------- procedural ceramic PBR texture (no image assets) ----------------
    function generatePbrTexturesAsync() {
      return new Promise(function (resolve) {
        setTimeout(function () {
          var size = 512;
          var canvasC = document.createElement('canvas');
          var canvasB = document.createElement('canvas');
          canvasC.width = canvasB.width = size;
          canvasC.height = canvasB.height = size;
          var ctxC = canvasC.getContext('2d');
          var ctxB = canvasB.getContext('2d');
          if (ctxC && ctxB) {
            ctxC.fillStyle = '#dcdcdc'; ctxC.fillRect(0, 0, size, size);
            ctxB.fillStyle = '#808080'; ctxB.fillRect(0, 0, size, size);
            for (var i = 0; i < 10000; i++) {
              var x = Math.random() * size, y = Math.random() * size;
              var r = 0.5 + Math.random() * 1.5;
              var isDark = Math.random() > 0.15;
              ctxC.beginPath(); ctxC.arc(x, y, r, 0, Math.PI * 2);
              ctxC.fillStyle = isDark ? '#222222' : '#dddddd'; ctxC.fill();
              ctxB.beginPath(); ctxB.arc(x, y, r, 0, Math.PI * 2);
              ctxB.fillStyle = isDark ? '#000000' : '#ffffff'; ctxB.fill();
            }
          }
          var texC = new THREE.CanvasTexture(canvasC);
          var texB = new THREE.CanvasTexture(canvasB);
          texC.wrapS = texB.wrapS = THREE.RepeatWrapping;
          texC.wrapT = texB.wrapT = THREE.RepeatWrapping;
          texC.repeat.set(6, 3); texB.repeat.set(6, 3);
          texC.needsUpdate = true; texB.needsUpdate = true;
          resolve({ colorMap: texC, bumpMap: texB });
        }, 0);
      });
    }

    // ---------------- the robot itself ----------------
    function RobotPrototype(props) {
      var neckParams = props.neckParams || { baseR: 0.215, baseH: -0.050, midR: 0.280, midH: 0.020, lipBottomR: 0.295, lipBottomH: 0.045, lipTopR: 0.270, lipTopH: 0.055, innerR: 0.100, innerDropH: 0.000 };
      var bodyParams = props.bodyParams || { bodyBevelR: 0.235, bodyBevelY: 0.340, bodyBevelT: 0.025 };
      var isLovedRef = useRef(false);
      var timeoutRef = useRef(null);
      var bodyRef = useRef(null);
      var headRef = useRef(null);
      var texState = useState({ colorMap: null, bumpMap: null });
      var textures = texState[0], setTextures = texState[1];

      var design = {
        pantallaColor: '#3d7dff', pantallaGrosor: 3.8, pantallaBrillo: 1.2,
        separacionOjos: 0.088, tamañoOrejas: 1.3, escalaOjos: 1.1,
        parpadeoFrecuencia: 3.0, parpadeoDuracion: 0.45,
        colorChasis: '#c9ccd3', alturaCabeza: 0.60
      };
      var config = {
        moveSpeed: 0.62, bodyRotSpeed: 16.0, headRotSpeed: 26.0,
        bodyTiltX: 0.0, bodyTiltY: 0.95, headLookX: 0.30, headLookY: 1.80,
        rollAmount: 0.55 // how much the body visibly spins like a rolling ball as it moves
      };

      useFrame(function (state, delta) {
        if (!bodyRef.current || !headRef.current) return;
        var dt = Math.min(delta, 0.1);
        var tx = state.pointer.x, ty = state.pointer.y;
        var maxMoveX = state.viewport.width / 3.5;
        var targetPosX = tx * maxMoveX;
        bodyRef.current.position.x = THREE.MathUtils.lerp(bodyRef.current.position.x, targetPosX, config.moveSpeed * dt);
        var relativeX = tx - (bodyRef.current.position.x / 2.5);
        var bodyTargetRotY = -relativeX * config.bodyTiltY;
        var bodyTargetRotX = (relativeX * relativeX * config.bodyTiltX) - (ty * 0.25);
        var bodyTargetRotZ = -relativeX * config.rollAmount;
        bodyRef.current.rotation.y = THREE.MathUtils.lerp(bodyRef.current.rotation.y, bodyTargetRotY, config.bodyRotSpeed * dt);
        bodyRef.current.rotation.x = THREE.MathUtils.lerp(bodyRef.current.rotation.x, bodyTargetRotX, config.bodyRotSpeed * dt);
        bodyRef.current.rotation.z = THREE.MathUtils.lerp(bodyRef.current.rotation.z, bodyTargetRotZ, config.bodyRotSpeed * dt);
        var headTargetRotY = relativeX * config.headLookY;
        var headTargetRotX = -ty * config.headLookX;
        headRef.current.rotation.y = THREE.MathUtils.lerp(headRef.current.rotation.y, headTargetRotY, config.headRotSpeed * dt);
        headRef.current.rotation.x = THREE.MathUtils.lerp(headRef.current.rotation.x, headTargetRotX, config.headRotSpeed * dt);
      });

      useEffect(function () {
        var mounted = true, generatedMaps = null;
        generatePbrTexturesAsync().then(function (res) {
          if (mounted) { generatedMaps = res; setTextures(res); }
          else { res.colorMap.dispose(); res.bumpMap.dispose(); }
        });
        return function () {
          mounted = false;
          if (generatedMaps) { generatedMaps.colorMap.dispose(); generatedMaps.bumpMap.dispose(); }
        };
      }, []);

      function handlePointerDown(e) {
        e.stopPropagation();
        isLovedRef.current = true;
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(function () { isLovedRef.current = false; }, 3200);
      }

      var neckProfile = useMemo(function () {
        return [
          new THREE.Vector2(neckParams.innerR, neckParams.baseH),
          new THREE.Vector2(neckParams.baseR, neckParams.baseH),
          new THREE.Vector2(neckParams.midR, neckParams.midH),
          new THREE.Vector2(neckParams.lipBottomR, neckParams.lipBottomH),
          new THREE.Vector2(neckParams.lipTopR, neckParams.lipTopH),
          new THREE.Vector2(neckParams.innerR, neckParams.lipTopH),
          new THREE.Vector2(neckParams.innerR, neckParams.lipTopH - neckParams.innerDropH)
        ];
      }, [neckParams]);

      var headMat = useMemo(function () {
        return new THREE.MeshStandardMaterial({ color: '#12182a', roughness: 1.0, metalness: 0.0 });
      }, []);

      if (!textures.colorMap) return null;

      var chassisProps = { color: design.colorChasis, map: textures.colorMap || undefined, bumpMap: textures.bumpMap || undefined, bumpScale: 0.005, roughness: 1.0, metalness: 0.0, envMapIntensity: 0.6 };

      return h('group', {
        ref: bodyRef, position: [0, -0.3, 0],
        onPointerDown: handlePointerDown,
        onPointerOver: function () { document.body.style.cursor = 'pointer'; },
        onPointerOut: function () { document.body.style.cursor = 'auto'; }
      },
        h('mesh', { castShadow: true, receiveShadow: true },
          h('sphereGeometry', { args: [0.43, 64, 64, 0, Math.PI * 2, Math.PI * 0.15, Math.PI * 0.85] }),
          h('meshStandardMaterial', chassisProps)
        ),
        bodyParams.bodyBevelT > 0 ? h('mesh', { position: [0, bodyParams.bodyBevelY, 0], rotation: [Math.PI / 2, 0, 0], castShadow: true, receiveShadow: true },
          h('torusGeometry', { args: [bodyParams.bodyBevelR, bodyParams.bodyBevelT, 32, 64] }),
          h('meshStandardMaterial', chassisProps)
        ) : null,
        h('mesh', { position: [0, 0.38, 0], receiveShadow: true, castShadow: true },
          h('latheGeometry', { args: [neckProfile, 64] }),
          h('meshStandardMaterial', chassisProps)
        ),
        h('group', { ref: headRef, position: [0, design.alturaCabeza, 0] },
          h('mesh', { material: headMat, castShadow: true, receiveShadow: true },
            h('sphereGeometry', { args: [0.28, 64, 64, 0, Math.PI * 2, 0, Math.PI] })
          ),
          h(GlassCapsule, { color: design.pantallaColor, power: design.pantallaGrosor, intensity: design.pantallaBrillo }),
          h('group', { position: [0, -0.02, 0.29] },
            h(RobotEye, { position: [-design.separacionOjos, 0, 0], rotation: [0, -0.2, 0], scale: design.escalaOjos, blinkDuration: design.parpadeoDuracion, blinkCycle: design.parpadeoFrecuencia, isLovedRef: isLovedRef }),
            h(RobotEye, { position: [design.separacionOjos, 0, 0], rotation: [0, 0.2, 0], scale: design.escalaOjos, blinkDuration: design.parpadeoDuracion, blinkCycle: design.parpadeoFrecuencia, isLovedRef: isLovedRef })
          ),
          h(RobotEar, { position: [-0.29, 0, 0], isLeft: true, scale: design.tamañoOrejas }),
          h(RobotEar, { position: [0.29, 0, 0], isLeft: false, scale: design.tamañoOrejas })
        )
      );
    }

    // ---------------- scene root mounted into the existing dark hero panel ----------------
    // Note: the original component used drei's <Environment preset="studio">
    // here, which fetches an HDRI image from an external asset CDN at
    // runtime purely for lighting/reflections. That's an extra network
    // dependency with no graceful failure path (a failed fetch throws a real
    // error, which React Suspense does not catch — only loading states are
    // caught by Suspense, not thrown errors), so it's swapped for a few
    // extra static lights approximating the same soft studio look instead.
    function SceneRoot() {
      return h(React.Fragment, null,
        h('ambientLight', { intensity: 0.6, color: '#8fb0ff' }),
        h('directionalLight', { position: [0, 6, 3], intensity: 0.9, color: '#dfe8ff', castShadow: true, 'shadow-mapSize': [1024, 1024], 'shadow-bias': -0.0005 }),
        h('directionalLight', { position: [-5, 2, -5], intensity: 0.5, color: '#3d7dff' }),
        h('directionalLight', { position: [4, -2, 4], intensity: 0.25, color: '#f0cc7e' }),
        h('pointLight', { position: [0, 1.5, 3], intensity: 0.4, color: '#ffffff', distance: 8 }),
        h(ResponsiveGroup, null,
          h(ContactShadows, { position: [0, -0.79, 0], opacity: 0.7, scale: 12, resolution: 512, blur: 1.8, far: 2.5, color: '#000000' }),
          h(RobotPrototype, null)
        )
      );
    }

    // re-check right before mounting: if the CDN fetches above were slow, the
    // script.js watchdog may have already fallen back to the vanilla robot
    if (mount.querySelector('canvas')) return;

    var root = ReactDOMClient.createRoot(mount);
    root.render(
      h(Canvas, { shadows: true, camera: { position: [0, 0.2, 6], fov: 40 }, gl: { alpha: true, antialias: true }, onCreated: function (state) { state.scene.background = null; } },
        h(SceneRoot)
      )
    );

    // give it a couple of frames to actually mount a <canvas>, then fade the photo
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        if (mount.querySelector('canvas')) {
          mount.classList.add('is-live');
          var fallbackImg = mount.parentElement && mount.parentElement.querySelector('img');
          if (fallbackImg) {
            fallbackImg.style.transition = 'opacity 1s ease';
            fallbackImg.style.opacity = '0';
          }
        }
      });
    });
  } catch (e) {
    console.warn('[hero robot] react-three-fiber build failed to load, falling back to the vanilla Three.js robot:', e);
    try {
      var fallbackScript = document.createElement('script');
      fallbackScript.src = 'hero-robot.js';
      document.body.appendChild(fallbackScript);
    } catch (e2) {}
  }
})();
