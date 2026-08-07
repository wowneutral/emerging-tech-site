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
      var host = img.closest('.brandlink, .flogo, .seal, .client-seal, .hero-visual, .photo, .plat-rail');
      if(host) host.classList.add('broken');
    });
  });

  /* The interior-hero parallax lived here. It scrolled .phero .bgimg, the
     photograph behind the page headings, which no longer exists — every page
     header is now the one checkered treatment. Removed rather than left
     inert: it bound an unthrottled scroll listener on every page, which is a
     real cost to keep paying for an element that is never in the document. */

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

  /* Marquee.
   *
   * WHAT THIS REPLACED, AND WHY IT WAS THE LAG.
   *
   * The previous version ran a requestAnimationFrame loop that, every
   * single frame, called getBoundingClientRect() on the first seal to
   * decide whether to recycle it. That is a forced synchronous layout,
   * sixty times a second, and it happened immediately after the previous
   * frame had written track.style.transform. Write style, read layout,
   * write style, read layout: the browser cannot batch any of it, so it
   * recalculates the page on every frame forever. That is why the page
   * hitched exactly when you scrolled to this section, and it is why
   * shrinking the images helped but did not fix it. The setup was no
   * better: it called track.scrollWidth inside a while condition while
   * doubling innerHTML, which is another forced layout per iteration.
   *
   * It also never stopped. No intersection check, so it kept thrashing
   * while the row was three screens away.
   *
   * THE REWORK. Travel is a CSS animation on a transform, which the
   * compositor runs on its own without touching layout or JavaScript at
   * all. Zero work per frame on the main thread. The seam problem that
   * drove the original author to JS is solved by construction rather
   * than by measurement: the track holds an exact even number of copies
   * and translates by exactly -50%, so the second half lands precisely
   * where the first half began. There is no distance to measure and
   * therefore nothing to measure wrong.
   *
   * The only layout reads left happen once, at setup. */
  var track = document.getElementById('sealTrack');
  var marquee = track && track.parentElement;
  if(track && marquee && !reduce){
    /* One measurement, once. Enough copies that a single set is wider
       than the viewport, so the row is never short on a wide screen. */
    var setHTML = track.innerHTML;
    var setWidth = track.scrollWidth;
    var guard = 0;
    while(setWidth < window.innerWidth && guard < 6){
      track.insertAdjacentHTML('beforeend', setHTML);
      setWidth = track.scrollWidth;
      guard++;
    }
    /* Then duplicate the whole thing exactly once. -50% is now precisely
       one full set, whatever that turned out to be. */
    track.insertAdjacentHTML('beforeend', track.innerHTML);
    track.classList.add('is-rolling');

    /* Stop the animation when the row is not on screen. Toggling
       animation-play-state costs nothing and the compositor simply stops
       producing frames, rather than us cancelling a loop that should not
       have been running in the first place. */
    if('IntersectionObserver' in window){
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(e){
          track.style.animationPlayState = e.isIntersecting ? 'running' : 'paused';
        });
      }, { rootMargin: '150px' });
      io.observe(marquee);
    }
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
  /* Pause decorative background animations once they scroll out of view.
     The hero net and the grid drift run on infinite loops; off screen they
     still cost compositing every frame for something nobody can see. This
     also stops the sticky nav's backdrop-filter from re-blurring animated
     content once the hero is gone. */
  var bgAnimated = document.querySelectorAll('#heroNet, .gridbg');
  if(bgAnimated.length && 'IntersectionObserver' in window){
    var bgio = new IntersectionObserver(function(es){
      es.forEach(function(e){ e.target.classList.toggle('is-paused', !e.isIntersecting); });
    }, {threshold:0});
    bgAnimated.forEach(function(el){ bgio.observe(el); });
  }

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
  /* Contact form.
     Posts to Emerging Tech's own Worker (see worker/README.md) rather than a
     third-party form relay. Until that endpoint is deployed, leave
     CONTACT_ENDPOINT empty: the form then opens the visitor's mail client with
     everything they typed already filled in, so it degrades instead of
     failing silently to an unverified mailbox. */
  var CONTACT_ENDPOINT = '';
  var CONTACT_EMAIL = 'collaborate@emergingtech.co';

  var cf = document.getElementById('contactForm');
  if(cf){
    var cfStatus = document.getElementById('cfStatus');
    var cfBtn = cf.querySelector('button[type="submit"]');
    var say = function(text, colour){
      if(cfStatus){ cfStatus.textContent = text; cfStatus.style.color = colour; }
    };
    var reset = function(){
      if(cfBtn){ cfBtn.disabled = false; cfBtn.style.opacity = ''; }
    };

    cf.addEventListener('submit', function(ev){
      ev.preventDefault();
      var f = new FormData(cf);

      if(f.get('_honey')){ return; }

      if(!CONTACT_ENDPOINT){
        var body = 'Name: ' + (f.get('name')||'') +
                   '\nEmail: ' + (f.get('email')||'') +
                   '\nOrganization: ' + (f.get('org')||'') +
                   '\nReason: ' + (f.get('reason')||'') +
                   '\n\n' + (f.get('msg')||'');
        window.location.href = 'mailto:' + CONTACT_EMAIL +
          '?subject=' + encodeURIComponent('Website enquiry from ' + (f.get('name')||'')) +
          '&body=' + encodeURIComponent(body);
        say('Opening your email app. If nothing happens, write to ' + CONTACT_EMAIL + '.', 'var(--slate-2)');
        return;
      }

      if(cfBtn){ cfBtn.disabled = true; cfBtn.style.opacity = '.6'; }
      say('Sending\u2026', 'var(--slate-2)');
      fetch(CONTACT_ENDPOINT, {
        method: 'POST',
        headers: { 'Accept': 'application/json' },
        body: f
      })
        .then(function(res){
          if(res.status === 429) throw new Error('rate');
          if(!res.ok) throw new Error('bad status');
          return res.json();
        })
        .then(function(){
          say('Thanks, your message was sent. We\u2019ll be in touch soon.', 'var(--blue-2)');
          cf.reset();
        })
        .catch(function(err){
          say(err && err.message === 'rate'
            ? 'That is a few messages in a short time. Please try again shortly, or email ' + CONTACT_EMAIL + '.'
            : 'Something went wrong sending your message. Please email us directly at ' + CONTACT_EMAIL + '.',
            '#B3452C');
        })
        .finally(reset);
    });
  }

  /* job application forms (preview site — does not transmit data anywhere) */
  /* The job application forms were removed. They collected resumes, home
     addresses and EEO demographic data into a handler that never
     transmitted anything; applications now go by email instead. */

  /* Note: the old cinematic net background (formerly Vanta.js/three.js — a
     full WebGL render loop running on every page load just for a
     background flourish) has been replaced by a plain CSS/SVG animated
     background on #heroNet (see styles.css). No JS needed to drive it
     anymore, which removes the main source of the reported lag. */

})();
