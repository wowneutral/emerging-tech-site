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

  /* ---- Tabs and Stepper: both now render as cards ----------------------
   *
   * These were a tabbed panel and a numbered stepper. Both hid five or six
   * pieces of content behind one visible panel and made you click through
   * the rest.
   *
   * The objection was that you have to work to read the page. It is also
   * the worst possible shape for this particular content: these are
   * service areas, not steps in a process. Nothing about "Clinical Workflow
   * Optimization" comes after "EHR Modernization" — they are a list wearing
   * a sequence's clothes. And a federal buyer scanning for one capability
   * had to open every tab to find out whether it was there. On top of that,
   * five of six panels were hidden from find-in-page and shipped to search
   * engines as content nobody could see.
   *
   * The accordion on the Cyber Security page was liked, but copying it here
   * would keep the real problem — it is still click-to-read — and would
   * flatten three different components into one. Cards show everything at
   * once, which is what "don't make me click through stuff" actually means.
   *
   * WHY THE HIDING IS REMOVED HERE RATHER THAN OVERRIDDEN IN CSS. The old
   * code set p.hidden, which is a semantic hide, not just display:none.
   * Forcing the panels visible with CSS alone would leave the attribute in
   * place, so assistive tech would still be told the content is hidden
   * while it sits in plain sight — worse than either state on its own. No
   * attribute is set now, so there is nothing to contradict.
   *
   * The bar and the rail are hidden in CSS, and their click handlers are
   * gone with them. Markup on all five pages is untouched: this is one
   * component change, not five rewrites, so there is one place to undo it.
   */
  document.querySelectorAll('[data-module="tabs"]').forEach(function (root) {
    root.querySelectorAll('.tab-panel').forEach(function (p) { p.hidden = false; });
  });

  document.querySelectorAll('[data-module="stepper"]').forEach(function (root) {
    root.querySelectorAll('.step-pane').forEach(function (p) { p.hidden = false; });
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
