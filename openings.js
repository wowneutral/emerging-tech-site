/* Current Openings: live from JazzHR via /jobs.php.
 * Renders into [data-openings] (or, failing that, the "Loading current openings…" placeholder).
 * If anything fails, visitors still get a working link to the JazzHR board, never a stuck "Loading". */
(function () {
  var BOARD = 'https://emergingtech.applytojob.com/apply';
  var SOURCES = ['/jobs.php'];

  function findTarget() {
    var el = document.querySelector('[data-openings]');
    if (el) return el;
    var all = document.querySelectorAll('main *');
    for (var i = 0; i < all.length; i++) {
      var n = all[i];
      if (n.children.length === 0 && /^\s*Loading current openings/i.test(n.textContent)) return n;
    }
    // The page's old loader may already have drawn the stale list: replace that list instead.
    var hs = document.querySelectorAll('main h2');
    for (var k = 0; k < hs.length; k++) {
      if (!/current openings/i.test(hs[k].textContent)) continue;
      var sec = hs[k].closest('section') || hs[k].parentNode;
      var list = sec && sec.querySelector('.cards2, .cards3, ul, ol');
      if (list) return list;
    }
    return null;
  }

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(u) {
    return /^https:\/\/emergingtech\.applytojob\.com\/apply\//i.test(u || '') ? u : BOARD;
  }

  function place(j) {
    var city = (j.city || '').trim(), state = (j.state || '').trim();
    if (/^remote$/i.test(city)) return 'Remote';
    if (city && state && city.toUpperCase().indexOf(', ' + state.toUpperCase()) > -1) return city;
    return [city, state].filter(Boolean).join(', ') || 'Location listed on posting';
  }

  function card(j) {
    var meta = [place(j), j.employment_type, j.department].filter(function (x) { return x && String(x).trim(); });
    return '<div class="vcard">' +
      '<div class="vh"><h3>' + esc(j.title) + '</h3></div>' +
      '<div class="period">' + meta.map(esc).join(' &middot; ') + '</div>' +
      '<div class="cta-row" style="margin-top:18px"><a class="btn btn-navy" href="' + esc(safeUrl(j.url)) +
      '" target="_blank" rel="noopener">View details &amp; apply <span class="ar">&rarr;</span></a></div>' +
      '</div>';
  }

  function setCount(n) {
    var hs = document.querySelectorAll('main h2');
    for (var i = 0; i < hs.length; i++) {
      if (/current openings/i.test(hs[i].textContent)) {
        hs[i].textContent = n ? n + ' current opening' + (n === 1 ? '' : 's') + '.' : 'Current openings.';
        return;
      }
    }
  }

  function render(target, jobs) {
    var box = document.createElement('div');
    box.setAttribute('data-openings', '');
    box.setAttribute('aria-live', 'polite');
    if (!jobs.length) {
      box.innerHTML = '<p>There are no open positions listed right now. New roles are posted on ' +
        '<a href="' + BOARD + '" target="_blank" rel="noopener">our JazzHR careers board</a>.</p>';
    } else {
      jobs.sort(function (a, b) { return String(b.id).localeCompare(String(a.id)); }); // newest first (ids carry the open date)
      box.innerHTML = '<div class="cards2">' + jobs.map(card).join('') + '</div>' +
        '<p style="margin-top:18px;font-size:13px">Every opening is also on <a href="' + BOARD +
        '" target="_blank" rel="noopener">our JazzHR careers board</a>.</p>';
    }
    target.replaceWith(box);
    setCount(jobs.length);
  }

  function fail(target) {
    var box = document.createElement('div');
    box.setAttribute('data-openings', '');
    box.innerHTML = '<p>Our current openings are listed on <a class="btn btn-navy" href="' + BOARD +
      '" target="_blank" rel="noopener">our JazzHR careers board <span class="ar">&rarr;</span></a></p>';
    target.replaceWith(box);
  }

  function load(target, i) {
    if (i >= SOURCES.length) return fail(target);
    fetch(SOURCES[i], { cache: 'no-cache' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (jobs) { if (!Array.isArray(jobs)) throw new Error('shape'); render(target, jobs); })
      .catch(function () { load(target, i + 1); });
  }

  function start() {
    var t = findTarget();
    if (t) load(t, 0);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
