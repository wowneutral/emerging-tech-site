(function(){
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* page enter fade */
  if(!reduce){
    document.body.classList.add('entering');
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ document.body.classList.remove('entering'); }); });
  }

  /* back/forward cache fix — when a visitor uses the browser's back button,
     Chrome/Safari can restore this exact page from bfcache with the
     "leaving" class (opacity:0, set right before we navigated away) still
     attached to <body>, since bfcache snapshots the DOM as it was at that
     instant and this script does not re-run. That produced the blank white
     screen on back-navigation. Clearing both classes on pageshow guarantees
     the page is always visible again, whether it was freshly loaded or
     restored from cache. */
  addEventListener('pageshow', function(){
    document.body.classList.remove('leaving');
    document.body.classList.remove('entering');
  });

  /* scroll progress */
  var prog = document.getElementById('progress');
  if(prog){
    addEventListener('scroll', function(){
      var h = document.documentElement;
      prog.style.width = (h.scrollTop / (h.scrollHeight - h.clientHeight || 1) * 100) + '%';
    }, {passive:true});
  }

  /* intro shutter (home) */
  var intro = document.getElementById('intro');
  if(intro){
    if(reduce){ intro.remove(); }
    else{
      requestAnimationFrame(function(){ intro.classList.add('go'); });
      setTimeout(function(){ intro.classList.add('open'); }, 300);
      setTimeout(function(){ intro.remove(); }, 2700);
    }
  }

  /* page-leave fade */
  if(!reduce){
    document.querySelectorAll('a[href$=".html"], a[href*=".html#"]').forEach(function(a){
      a.addEventListener('click', function(ev){
        if(ev.metaKey||ev.ctrlKey||ev.shiftKey||a.target==='_blank') return;
        ev.preventDefault();
        document.body.classList.add('leaving');
        setTimeout(function(){ location.href = a.getAttribute('href'); }, 240);
      });
    });
  }

  /* broken-image fallbacks */
  document.querySelectorAll('img').forEach(function(img){
    img.addEventListener('error', function(){
      img.classList.add('broken');
      var host = img.closest('.brandlink, .flogo, .seal, .hero-visual, .photo');
      if(host) host.classList.add('broken');
    });
  });

  /* parallax on interior hero image */
  var bgimg = document.querySelector('.phero .bgimg');
  if(bgimg && !reduce){
    addEventListener('scroll', function(){
      var y = Math.min(window.scrollY, 600);
      bgimg.style.transform = 'scale(1.05) translateY(' + (y * 0.18) + 'px)';
    }, {passive:true});
  }

  /* hero rotator */
  var slides = Array.prototype.slice.call(document.querySelectorAll('#rotator .slide'));
  if(slides.length){
    var dots = Array.prototype.slice.call(document.querySelectorAll('#heroDots button'));
    var cur = 0, timer = null;
    var show = function(i){
      slides[cur].classList.remove('on'); dots[cur].classList.remove('on');
      cur = i % slides.length;
      slides[cur].classList.add('on'); dots[cur].classList.add('on');
    };
    if(!reduce){
      timer = setInterval(function(){ show(cur+1); }, 5200);
      dots.forEach(function(d,i){ d.addEventListener('click', function(){ clearInterval(timer); show(i); timer = setInterval(function(){ show(cur+1); }, 5200); }); });
    } else {
      dots.forEach(function(d,i){ d.addEventListener('click', function(){ show(i); }); });
    }
  }

  /* marquee duplicate */
  var track = document.getElementById('sealTrack');
  if(track && !reduce){ track.innerHTML += track.innerHTML; }

  /* robot speech bubble — badge pills (SDVOSB, 8(a), HUBZone, CMMI Level 3)
     aren't links; clicking one makes the robot "explain" the acronym in a
     speech bubble that fades itself out a few seconds later. */
  var robotBubble = document.getElementById('robotBubble');
  var badgeSpans = document.querySelectorAll('.robot-hero .badges span[data-msg]');
  if(robotBubble && badgeSpans.length){
    var bubbleTimer = null;
    badgeSpans.forEach(function(span){
      span.addEventListener('click', function(){
        var msg = span.getAttribute('data-msg');
        if(!msg) return;
        robotBubble.textContent = msg;
        robotBubble.classList.add('show');
        if(bubbleTimer) clearTimeout(bubbleTimer);
        bubbleTimer = setTimeout(function(){ robotBubble.classList.remove('show'); }, 4200);
      });
    });
  }

  /* reveals with per-parent stagger */
  var sel = '.reveal,.reveal-l,.reveal-r,.reveal-s';
  var els = Array.prototype.slice.call(document.querySelectorAll(sel));
  if(!reduce){
    var groups = new Map();
    els.forEach(function(el){
      var p = el.parentElement;
      if(!groups.has(p)) groups.set(p, 0);
      var n = groups.get(p);
      el.style.transitionDelay = (Math.min(n,7) * 80) + 'ms';
      groups.set(p, n+1);
    });
  }
  var io = new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target); } });
  }, {threshold:.12, rootMargin:'0px 0px -36px 0px'});
  els.forEach(function(el){ io.observe(el); });
  /* headline underline draw */
  var hio = new IntersectionObserver(function(es){
    es.forEach(function(e){ if(e.isIntersecting){ e.target.classList.add('in'); hio.unobserve(e.target); } });
  }, {threshold:.4});
  document.querySelectorAll('.sec-head, .split .body, .split > div').forEach(function(el){ hio.observe(el); });

  /* count-up */
  var counters = document.querySelectorAll('[data-count]');
  if(counters.length){
    var done = false;
    var cio = new IntersectionObserver(function(es){
      es.forEach(function(e){
        if(e.isIntersecting && !done){
          done = true;
          counters.forEach(function(el){
            var t = parseInt(el.getAttribute('data-count'),10);
            var sup = el.querySelector('sup'); var supHTML = sup ? sup.outerHTML : '';
            if(reduce){ el.innerHTML = t + supHTML; return; }
            var start = null;
            var step = function(ts){
              if(!start) start = ts;
              var p = Math.min((ts-start)/900,1), ez = 1-Math.pow(1-p,3);
              el.innerHTML = Math.round(ez*t) + supHTML;
              if(p<1) requestAnimationFrame(step);
            };
            requestAnimationFrame(step);
          });
          cio.disconnect();
        }
      });
    }, {threshold:.5});
    cio.observe(counters[0]);
  }

  /* mobile menu */
  var mm = document.getElementById('mobileMenu');
  var mo = document.getElementById('menuOpen'), mc = document.getElementById('menuClose');
  if(mo){ mo.addEventListener('click', function(){ mm.classList.add('open'); }); }
  if(mc){ mc.addEventListener('click', function(){ mm.classList.remove('open'); }); }
  if(mm){ mm.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ mm.classList.remove('open'); }); }); }

  /* contact form -> mailto */
  var cf = document.getElementById('contactForm');
  if(cf){
    cf.addEventListener('submit', function(ev){
      ev.preventDefault();
      var f = new FormData(cf);
      var body = 'Name: '+f.get('name')+'%0AOrganization: '+(f.get('org')||'—')+'%0AReason: '+f.get('reason')+'%0A%0A'+encodeURIComponent(f.get('msg'));
      location.href = 'mailto:collaborate@emergingtech.co?subject='+encodeURIComponent('['+f.get('reason')+'] Inquiry from '+f.get('name'))+'&body='+body;
    });
  }

  /* job application forms (preview site — does not transmit data anywhere) */
  var af = document.getElementById('applyForm');
  if(af){
    af.addEventListener('submit', function(ev){
      ev.preventDefault();
      var note = document.getElementById('applySubmitted');
      var btn = af.querySelector('button[type="submit"]');
      if(btn){ btn.disabled = true; btn.textContent = 'Preview only — not submitted'; }
      if(note){ note.classList.add('show'); note.scrollIntoView({behavior: reduce ? 'auto' : 'smooth', block:'center'}); }
    });
  }

  /* cinematic dark-theme backgrounds: Vanta.js NET, wired once here so every
     page that loads three.js + vanta-net.js + script.js gets the right
     treatment automatically — no per-page markup needed beyond the mount el. */
  if(!reduce && typeof VANTA !== 'undefined' && VANTA.NET && typeof THREE !== 'undefined'){
    var vantaJobs = [];

    var heroNetEl = document.getElementById('heroNet');
    if(heroNetEl) vantaJobs.push({el:heroNetEl, opts:{color:0x3d7dff,backgroundAlpha:0,points:9,maxDistance:23,spacing:19,showDots:true}});

    var serveNetEl = document.getElementById('vantaNet');
    if(serveNetEl) vantaJobs.push({el:serveNetEl, opts:{color:0x3d7dff,backgroundColor:0x0b1f3a,backgroundAlpha:1,points:8,maxDistance:22,spacing:17,showDots:true}});

    var pheroEl = document.querySelector('.phero');
    if(pheroEl){
      var pheroNet = document.createElement('div');
      pheroNet.setAttribute('aria-hidden','true');
      pheroNet.style.cssText = 'position:absolute;inset:0;z-index:0';
      pheroEl.insertBefore(pheroNet, pheroEl.firstChild);
      vantaJobs.push({el:pheroNet, opts:{color:0x3d7dff,backgroundAlpha:0,points:7,maxDistance:20,spacing:20,showDots:true}});
    }

    vantaJobs.forEach(function(job){
      try{
        VANTA.NET(Object.assign({
          el: job.el, THREE: window.THREE, mouseControls:true, touchControls:true,
          gyroControls:false, minHeight:200, minWidth:200, scale:1, scaleMobile:1
        }, job.opts));
      }catch(e){}
    });
  }

  /* hero robot watchdog — hero-robot-r3f.js loads as a <script type="module">,
     which browsers refuse to execute at all on file:// pages (a security
     restriction on module scripts specifically; regular scripts like this one
     are unaffected). When that happens the module's own try/catch never even
     runs, so its fallback-to-vanilla-robot logic never fires either. This
     watchdog lives in a normal script instead, so it always runs, and swaps
     in the vanilla Three.js robot (hero-robot.js) if the R3F version never
     managed to mount a <canvas> after a while — whether that's because of the
     file:// module block, a slow/blocked CDN, or anything else.
     Timeout is intentionally generous (9s, once): esm.sh compiles packages
     like @react-three/drei on-demand on a cold cache, which can genuinely
     take several seconds on first load — a short timeout here would race
     the real robot and declare it "failed" before it ever got a chance,
     which is exactly what happened at 2.5s. Browsers cache the compiled
     modules after the first successful load, so repeat visits are fast. */
  var heroRobotMount = document.getElementById('heroRobot');
  if(heroRobotMount){
    if(reduce){
      /* both robot scripts intentionally skip themselves when the visitor
         prefers reduced motion, so nothing will ever mount here — reveal
         the static photo immediately instead of showing a loading state
         that would otherwise spin forever */
      heroRobotMount.classList.add('load-failed');
    } else {
      setTimeout(function(){
        if(!heroRobotMount.querySelector('canvas')){
          var fallback = document.createElement('script');
          fallback.src = 'hero-robot.js';
          document.body.appendChild(fallback);
          // give the vanilla fallback a moment to mount; if even that never
          // manages it (WebGL unsupported, script blocked), give up on the
          // loading state entirely and reveal the original photo
          setTimeout(function(){
            if(!heroRobotMount.querySelector('canvas')) heroRobotMount.classList.add('load-failed');
          }, 1500);
        }
      }, 9000);
    }
  }
})();
