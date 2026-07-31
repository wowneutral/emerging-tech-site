/* Per-page interactive modules.
   Each page converts one of its card grids into a different component, so the
   site stops reading as the same grid repeated. Every module degrades to plain
   readable content with JavaScript off: the markup ships expanded and is
   collapsed here, never the other way around. */
(function () {
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- Accordion ------------------------------------------------------ */
  document.querySelectorAll('[data-module="accordion"]').forEach(function (root) {
    var items = [].slice.call(root.querySelectorAll('.acc-item'));
    items.forEach(function (item, i) {
      var btn = item.querySelector('.acc-head');
      var body = item.querySelector('.acc-body');
      var open = i === 0;
      function set(o) {
        open = o;
        item.classList.toggle('is-open', o);
        btn.setAttribute('aria-expanded', o ? 'true' : 'false');
        body.style.height = o ? body.scrollHeight + 'px' : '0px';
      }
      body.style.overflow = 'hidden';
      if (reduce) body.style.transition = 'none';
      set(open);
      btn.addEventListener('click', function () {
        items.forEach(function (o) {
          if (o !== item) {
            o.classList.remove('is-open');
            o.querySelector('.acc-head').setAttribute('aria-expanded', 'false');
            o.querySelector('.acc-body').style.height = '0px';
          }
        });
        set(!open);
      });
      addEventListener('resize', function () { if (open) body.style.height = body.scrollHeight + 'px'; });
    });
  });

  /* ---- Tabs ------------------------------------------------------------ */
  document.querySelectorAll('[data-module="tabs"]').forEach(function (root) {
    var tabs = [].slice.call(root.querySelectorAll('.tab-btn'));
    var panels = [].slice.call(root.querySelectorAll('.tab-panel'));
    function show(i) {
      tabs.forEach(function (t, n) {
        t.classList.toggle('is-active', n === i);
        t.setAttribute('aria-selected', n === i ? 'true' : 'false');
        t.tabIndex = n === i ? 0 : -1;
      });
      panels.forEach(function (p, n) { p.hidden = n !== i; });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener('click', function () { show(i); });
      t.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        e.preventDefault();
        var n = (i + d + tabs.length) % tabs.length;
        show(n); tabs[n].focus();
      });
    });
    show(0);
  });

  /* ---- Stepper --------------------------------------------------------- */
  document.querySelectorAll('[data-module="stepper"]').forEach(function (root) {
    var dots = [].slice.call(root.querySelectorAll('.step-dot'));
    var panes = [].slice.call(root.querySelectorAll('.step-pane'));
    var fill = root.querySelector('.step-fill');
    function show(i) {
      dots.forEach(function (d, n) {
        d.classList.toggle('is-active', n === i);
        d.classList.toggle('is-done', n < i);
        d.setAttribute('aria-selected', n === i ? 'true' : 'false');
      });
      panes.forEach(function (p, n) { p.hidden = n !== i; });
      if (fill) {
        var pct = dots.length > 1 ? (i / (dots.length - 1)) * 100 : 0;
        fill.style.width = pct + '%';
        // the mobile rail is vertical and reads this instead
        fill.style.setProperty('--progress', pct + '%');
      }
    }
    dots.forEach(function (d, i) { d.addEventListener('click', function () { show(i); }); });
    show(0);
  });

  /* ---- Filter ---------------------------------------------------------- */
  document.querySelectorAll('[data-module="filter"]').forEach(function (root) {
    var chips = [].slice.call(root.querySelectorAll('.chip'));
    var items = [].slice.call(root.querySelectorAll('[data-tags]'));
    var count = root.querySelector('.filter-count');
    var search = root.querySelector('.filter-search');
    function apply() {
      var tag = (root.querySelector('.chip.is-active') || {}).dataset;
      tag = tag ? tag.tag : 'all';
      var q = (search && search.value || '').trim().toLowerCase();
      var shown = 0;
      items.forEach(function (it) {
        var okTag = tag === 'all' || it.dataset.tags.split(' ').indexOf(tag) > -1;
        var okQ = !q || it.textContent.toLowerCase().indexOf(q) > -1;
        var ok = okTag && okQ;
        it.hidden = !ok;
        if (ok) shown++;
      });
      if (count) count.textContent = shown + (shown === 1 ? ' result' : ' results');
    }
    chips.forEach(function (c) {
      c.addEventListener('click', function () {
        chips.forEach(function (o) { o.classList.remove('is-active'); o.setAttribute('aria-pressed', 'false'); });
        c.classList.add('is-active'); c.setAttribute('aria-pressed', 'true');
        apply();
      });
    });
    if (search) search.addEventListener('input', apply);
    apply();
  });
})();
