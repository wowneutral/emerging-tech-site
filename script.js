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

  /* Marquee — two earlier approaches (CSS -50%, then a JS-measured pixel
     distance) both still relied on animating to a fixed endpoint and then
     resetting, which glitched at the seam no matter how precisely the
     distance was measured. Replacing that with a continuously-running
     scroll: every frame, nudge the track left by a small fixed amount, and
     the instant a seal has fully scrolled past the left edge, move that
     exact element to the end of the row and pull the offset back by
     precisely its width. There is no "loop point" to land on anymore —
     content just keeps recycling forever, so there's nothing left to
     glitch at. */
  var track = document.getElementById('sealTrack');
  if(track && !reduce){
    var GAP = 70; // must match .marquee .track{gap:70px} in styles.css
    track.style.animation = 'none';
    track.style.gap = GAP + 'px';
    /* Recycling only works if there's always enough content on screen to
       cover the full viewport width — otherwise the row runs out of seals
       before the recycled one scrolls back into view, showing blank space
       on wide screens. Duplicate the original set until the total width
       comfortably clears twice the widest reasonable viewport. */
    var safety = 0;
    while(track.scrollWidth < Math.max(window.innerWidth, 1600) * 2 && safety < 10){
      track.innerHTML += track.innerHTML;
      safety++;
    }
    var offset = 0;
    var speed = 0.5; // px per frame, ~30px/s at 60fps
    var raf;
    var tick = function(){
      offset += speed;
      var first = track.children[0];
      if(first){
        var w = first.getBoundingClientRect().width + GAP;
        if(w > 0 && offset >= w){
          offset -= w;
          track.appendChild(first);
        }
      }
      track.style.transform = 'translateX(' + (-offset) + 'px)';
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    document.addEventListener('visibilitychange', function(){
      if(document.hidden){ cancelAnimationFrame(raf); }
      else { raf = requestAnimationFrame(tick); }
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
      /* Two separate bugs were making hover feel "laggy," worse for cards
         further into a row/grid:
         1) the inline transition-delay above was never cleared once the
            reveal-in animation finished, so hover on a still-animating (or
            just-finished) card inherited that same stagger delay — up to
            560ms for the 8th+ item in a row.
         2) even after the entrance finished, the CSS rule that drives the
            entrance fade (.reveal.in / .reveal-s.in / etc, a 2-class
            selector) has equal-or-higher specificity than each card's own
            hover-transition rule (.card, .mcard, .plat — 1 class), so it
            permanently overrode hover to use its slow 1.05s entrance
            timing instead of the card's intended ~0.3s hover timing, on
            every page that uses reveal-in cards (i.e. nearly all of them).
         Fixing both: clear the delay, and set an inline transition (inline
         style always wins over any class, regardless of specificity) that
         restores fast, correct hover timing once the entrance is done. */
      el.addEventListener('transitionend', function handler(ev){
        if(ev.propertyName === 'opacity' || ev.propertyName === 'transform'){
          this.style.transitionDelay = '';
          this.style.transition = 'border-color .25s var(--ease), box-shadow .3s var(--ease), transform .3s var(--ease), background .25s var(--ease), padding .3s var(--ease)';
          this.removeEventListener('transitionend', handler);
        }
      });
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

  /* nav dropdown overlap fix — clicking a dropdown's button (e.g. "About Us")
     gives it real keyboard focus, and :focus-within then keeps that menu
     open indefinitely since the mouse moving away doesn't clear focus.
     Hovering a different dropdown then opens on top of it via :hover — two
     menus visible at once. Blurring the button on click releases the focus
     that was keeping it stuck, without affecting keyboard Tab navigation
     (which doesn't fire a "click" event). */
  document.querySelectorAll('.dd > button').forEach(function(btn){
    btn.addEventListener('click', function(){ btn.blur(); });
  });

  /* mobile menu */
  var mm = document.getElementById('mobileMenu');
  var mo = document.getElementById('menuOpen'), mc = document.getElementById('menuClose');
  if(mo){ mo.addEventListener('click', function(){ mm.classList.add('open'); }); }
  if(mc){ mc.addEventListener('click', function(){ mm.classList.remove('open'); }); }
  if(mm){ mm.querySelectorAll('a').forEach(function(a){ a.addEventListener('click', function(){ mm.classList.remove('open'); }); }); }

  /* contact form -> FormSubmit (submits directly, no email client needed) */
  var cf = document.getElementById('contactForm');
  if(cf){
    var cfStatus = document.getElementById('cfStatus');
    var cfBtn = cf.querySelector('button[type="submit"]');
    cf.addEventListener('submit', function(ev){
      ev.preventDefault();
      if(cfBtn){ cfBtn.disabled = true; cfBtn.style.opacity = '.6'; }
      if(cfStatus){ cfStatus.textContent = 'Sending…'; cfStatus.style.color = 'var(--slate-2)'; }
      var f = new FormData(cf);
      fetch(cf.action, { method: 'POST', body: f, headers: { 'Accept': 'application/json' } })
        .then(function(res){ if(!res.ok) throw new Error('bad status'); return res.json(); })
        .then(function(){
          if(cfStatus){ cfStatus.textContent = 'Thanks — your message was sent. We\'ll be in touch soon.'; cfStatus.style.color = 'var(--blue-2)'; }
          cf.reset();
        })
        .catch(function(){
          if(cfStatus){ cfStatus.textContent = 'Something went wrong sending your message — please email us directly at collaborate@emergingtech.co.'; cfStatus.style.color = '#B3452C'; }
        })
        .finally(function(){
          if(cfBtn){ cfBtn.disabled = false; cfBtn.style.opacity = '1'; }
        });
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

    /* Hero net: client asked to zoom in (fewer, bigger shapes instead of a
       dense small-scale weave) and make the motion more subtle — mouse/touch
       parallax turned off here so it's just a slow ambient drift, not
       something that visibly reacts to the cursor. */
    var heroNetEl = document.getElementById('heroNet');
    if(heroNetEl) vantaJobs.push({el:heroNetEl, opts:{color:0x3d7dff,backgroundAlpha:0,points:15,maxDistance:28,spacing:19,showDots:true,mouseControls:false,touchControls:false,speed:0.6}});

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

})();
