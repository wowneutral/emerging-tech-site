/* Team locations map (Our People).
   Built on Leaflet with CARTO Positron tiles so the map inherits the site's
   light palette instead of Google's chrome. Scroll wheel zoom is off by
   default so the map never traps page scroll; it turns on once the user
   clicks into the map, and off again when focus leaves. */
(function () {
  var el = document.getElementById('teamMap');
  if (!el || typeof L === 'undefined' || !window.ET_LOCATIONS) return;

  var NAVY = '#0b1f3a';
  var BRASS = getComputedStyle(document.documentElement)
    .getPropertyValue('--brass').trim() || '#b98b3d';

  var map = L.map(el, {
    scrollWheelZoom: false,
    zoomControl: true,
    attributionControl: true,
    minZoom: 3,
    maxZoom: 10
  });

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(map);

  var bounds = [];

  window.ET_LOCATIONS.forEach(function (row) {
    var name = row[0], lat = row[1], lon = row[2];
    bounds.push([lat, lon]);
    L.circleMarker([lat, lon], {
      radius: 5,
      color: NAVY,
      weight: 1.5,
      opacity: 0.55,
      fillColor: BRASS,
      fillOpacity: 0.85
    })
      .addTo(map)
      .bindTooltip(name, { direction: 'top', offset: [0, -6] });
  });

  var hq = window.ET_HQ;
  if (hq) {
    bounds.push([hq[1], hq[2]]);
    L.circleMarker([hq[1], hq[2]], {
      radius: 9,
      color: '#fff',
      weight: 2.5,
      fillColor: NAVY,
      fillOpacity: 1
    })
      .addTo(map)
      .bindTooltip('Home base &middot; ' + hq[0], {
        direction: 'top',
        offset: [0, -10],
        permanent: false
      });
  }

  map.fitBounds(bounds, { padding: [34, 34] });

  // Click to enable wheel zoom, click away to release it.
  map.on('focus', function () { map.scrollWheelZoom.enable(); });
  map.on('blur', function () { map.scrollWheelZoom.disable(); });

  // Leaflet measures the container on init. If the section was still
  // animating in, that measurement is wrong, so re-measure once settled.
  window.addEventListener('load', function () {
    setTimeout(function () {
      map.invalidateSize();
      map.fitBounds(bounds, { padding: [34, 34] });
    }, 120);
  });
})();
