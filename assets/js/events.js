// Pedal & Pause events calendar
// Reads /events/events.json and renders either the full calendar (#events-app)
// or the homepage strip (#events-strip). To add an event, edit events.json only.
(function () {
  var app = document.getElementById('events-app');
  var strip = document.getElementById('events-strip');
  if (!app && !strip) return;

  var TOWNS = ['Clearwater', 'Dunedin', 'Palm Harbor', 'Tarpon Springs'];
  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  function parse(s) { // "2026-11-21T11:00" as local time
    var p = s.split(/[-T:]/).map(Number);
    return new Date(p[0], p[1] - 1, p[2], p[3] || 0, p[4] || 0);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function time(d) {
    var h = d.getHours(), m = d.getMinutes();
    var ap = h >= 12 ? 'p.m.' : 'a.m.';
    h = h % 12 || 12;
    if (h === 12 && m === 0 && ap === 'p.m.') return 'noon';
    return h + (m ? ':' + String(m).padStart(2, '0') : '') + ' ' + ap;
  }
  function sameDay(a, b) { return a.toDateString() === b.toDateString(); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function icsStamp(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + 'T' + pad(d.getHours()) + pad(d.getMinutes()) + '00';
  }

  // Turn each event into one or more dated occurrences.
  function occurrences(ev) {
    var list = ev.dates ? ev.dates.slice() : [{ start: ev.start, end: ev.end }];
    return list.map(function (o) {
      return { ev: ev, start: parse(o.start), end: parse(o.end || o.start) };
    });
  }
  function nextWeekly(ev, now) {
    var s = parse(ev.start), e = parse(ev.end || ev.start), until = parse(ev.until + 'T23:59');
    var len = e - s;
    while (s.getTime() + len < now.getTime()) s = new Date(s.getFullYear(), s.getMonth(), s.getDate() + 7, s.getHours(), s.getMinutes());
    if (s > until) return null;
    return { ev: ev, start: s, end: new Date(s.getTime() + len) };
  }

  function mapUrl(ev) {
    return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent((ev.venue ? ev.venue + ', ' : '') + ev.address);
  }
  function googleCalUrl(o) {
    var ev = o.ev;
    var u = 'https://calendar.google.com/calendar/render?action=TEMPLATE' +
      '&text=' + encodeURIComponent(ev.title) +
      '&dates=' + icsStamp(o.start) + '/' + icsStamp(o.end) +
      '&ctz=America/New_York' +
      '&location=' + encodeURIComponent((ev.venue ? ev.venue + ', ' : '') + ev.address) +
      '&details=' + encodeURIComponent(ev.summary + (ev.link ? '\n\n' + ev.link : '') + '\n\nFound on pedalpause.com/events');
    if (ev.repeat === 'weekly' && ev.until) u += '&recur=' + encodeURIComponent('RRULE:FREQ=WEEKLY;UNTIL=' + ev.until.replace(/-/g, '') + 'T235959');
    return u;
  }
  function icsFile(o) {
    var ev = o.ev;
    function fold(t) { return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
    var lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pedal & Pause//Events//EN', 'CALSCALE:GREGORIAN',
      'BEGIN:VTIMEZONE', 'TZID:America/New_York',
      'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:19700308T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
      'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:19701101T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
      'END:VTIMEZONE',
      'BEGIN:VEVENT',
      'UID:' + ev.id + '-' + icsStamp(o.start) + '@pedalpause.com',
      'DTSTAMP:' + icsStamp(new Date()),
      'DTSTART;TZID=America/New_York:' + icsStamp(o.start),
      'DTEND;TZID=America/New_York:' + icsStamp(o.end),
      'SUMMARY:' + fold(ev.title),
      'LOCATION:' + fold((ev.venue ? ev.venue + ', ' : '') + ev.address),
      'DESCRIPTION:' + fold(ev.summary + (ev.link ? '\n\n' + ev.link : ''))
    ];
    if (ev.repeat === 'weekly' && ev.until) lines.push('RRULE:FREQ=WEEKLY;UNTIL=' + ev.until.replace(/-/g, '') + 'T235959');
    if (ev.link) lines.push('URL:' + ev.link);
    lines.push('END:VEVENT', 'END:VCALENDAR');
    return lines.join('\r\n');
  }

  function whenText(o) {
    var t = time(o.start) + (sameDay(o.start, o.end) && o.end > o.start ? ' to ' + time(o.end) : '');
    if (o.ev.repeat === 'weekly') return 'Every ' + DAYS[o.start.getDay()] + ', ' + t;
    return t;
  }

  function card(o, idx) {
    var ev = o.ev;
    var d = o.start;
    var repeat = ev.repeat === 'weekly';
    return '<article class="event' + (repeat ? ' event-weekly' : '') + '" data-town="' + esc(ev.town) + '">' +
      '<div class="event-date" aria-hidden="true">' +
        '<span class="ed-dow">' + DAYS[d.getDay()].slice(0, 3) + '</span>' +
        '<span class="ed-day">' + d.getDate() + '</span>' +
        '<span class="ed-mon">' + MONTHS[d.getMonth()].slice(0, 3) + '</span>' +
      '</div>' +
      '<div class="event-body">' +
        '<span class="tag">' + esc(ev.town) + ' · ' + esc(ev.type) + '</span>' +
        '<h3>' + esc(ev.title) + '</h3>' +
        '<p class="event-when"><span class="visually-hidden">' + DAYS[d.getDay()] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate() + ', </span>' +
          esc(whenText(o)) + (repeat ? ' <span class="event-next">Next: ' + DAYS[d.getDay()].slice(0, 3) + ', ' + MONTHS[d.getMonth()].slice(0, 3) + ' ' + d.getDate() + '</span>' : '') + '</p>' +
        '<p class="event-where">' + esc(ev.venue) + (ev.venue ? ', ' : '') + esc(ev.address.replace(/, FL$/, '')) + '</p>' +
        (app ? '<p class="event-summary">' + esc(ev.summary) + '</p>' : '') +
        '<p class="event-cost"><strong>Cost:</strong> ' + esc(ev.cost) + '</p>' +
        (app ? '<div class="event-actions">' +
          '<details class="addcal"><summary>Add to my calendar</summary><div class="addcal-menu">' +
            '<a href="' + googleCalUrl(o) + '" target="_blank" rel="noopener">Google Calendar</a>' +
            '<button type="button" data-ics="' + idx + '">iPhone, Mac or Outlook</button>' +
          '</div></details>' +
          '<a class="event-link" href="' + mapUrl(ev) + '" target="_blank" rel="noopener">Map</a>' +
          (ev.link ? '<a class="event-link" href="' + esc(ev.link) + '" target="_blank" rel="noopener">Organizer\'s page</a>' : '') +
        '</div>' : '') +
      '</div>' +
    '</article>';
  }

  function render(data) {
    var now = new Date();
    var dated = [], weekly = [];
    data.events.forEach(function (ev) {
      if (ev.repeat === 'weekly') {
        var n = nextWeekly(ev, now);
        if (n) weekly.push(n);
      } else {
        occurrences(ev).forEach(function (o) { if (o.end >= now) dated.push(o); });
      }
    });
    dated.sort(function (a, b) { return a.start - b.start; });

    if (strip) return renderStrip(dated);
    renderApp(dated, weekly, data);
  }

  function renderStrip(dated) {
    var next = dated.slice(0, 3);
    if (!next.length) {
      strip.innerHTML = '<p class="events-empty">Nothing on the calendar right now. <a href="/events/submit/">Know of something?</a></p>';
      return;
    }
    strip.innerHTML = '<div class="events-list compact">' + next.map(function (o) { return card(o); }).join('') + '</div>';
  }

  function renderApp(dated, weekly, data) {
    var all = weekly.concat(dated);
    var active = 'All';
    try { active = sessionStorage.getItem('pp-town') || 'All'; } catch (e) {}

    function counts(town) {
      return all.filter(function (o) { return town === 'All' || o.ev.town === town; }).length;
    }

    function draw() {
      var filt = function (o) { return active === 'All' || o.ev.town === active; };
      var w = weekly.filter(filt), d = dated.filter(filt);
      var html = '<div class="town-filter" role="group" aria-label="Show events in">' +
        ['All'].concat(TOWNS).map(function (t) {
          return '<button type="button" class="chip" aria-pressed="' + (t === active) + '" data-town="' + t + '">' +
            t + ' <span class="chip-count">' + counts(t) + '</span></button>';
        }).join('') + '</div>';

      var idx = 0, byIdx = [];
      if (d.length) {
        var month = '';
        html += '<div class="events-list">';
        d.forEach(function (o) {
          var m = MONTHS[o.start.getMonth()] + ' ' + o.start.getFullYear();
          if (m !== month) { html += '<h2 class="month-head">' + m + '</h2>'; month = m; }
          byIdx.push(o); html += card(o, idx++);
        });
        html += '</div>';
      }
      if (w.length) {
        html += '<h2 class="month-head">Every week</h2><div class="events-list">';
        w.forEach(function (o) { byIdx.push(o); html += card(o, idx++); });
        html += '</div>';
      }
      if (!d.length && !w.length) {
        html += '<div class="events-empty"><p>Nothing listed in ' + esc(active) + ' yet. That\'s a gap we\'d like to fill.</p>' +
          '<p><a class="btn" href="/events/submit/">Tell us about an event</a></p></div>';
      }
      app.innerHTML = html;

      app.querySelectorAll('.chip').forEach(function (b) {
        b.addEventListener('click', function () {
          active = b.getAttribute('data-town');
          try { sessionStorage.setItem('pp-town', active); } catch (e) {}
          draw();
          var first = app.querySelector('.chip[aria-pressed="true"]');
          if (first) first.focus();
        });
      });
      app.querySelectorAll('[data-ics]').forEach(function (b) {
        b.addEventListener('click', function () {
          var o = byIdx[Number(b.getAttribute('data-ics'))];
          var blob = new Blob([icsFile(o)], { type: 'text/calendar;charset=utf-8' });
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = o.ev.id + '.ics';
          document.body.appendChild(a); a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        });
      });
    }
    draw();

    var upd = document.getElementById('events-updated');
    if (upd && data.updated) {
      var u = parse(data.updated + 'T12:00');
      upd.textContent = MONTHS[u.getMonth()] + ' ' + u.getDate() + ', ' + u.getFullYear();
    }
  }

  fetch('/events/events.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function () {
      var el = app || strip;
      el.innerHTML = '<p class="events-empty">The calendar didn\'t load. Try refreshing the page.</p>';
    });
})();
