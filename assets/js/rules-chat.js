// Question box on the Pinellas Trail e-bike rules page.
// Sends the question to /api/ask-rules and shows the answer with its sources.
// Everything is inserted as plain text (never as HTML), so nothing in an answer can run as code.
(function () {
  var box = document.querySelector('.rules-chat');
  if (!box) return;
  var form = box.querySelector('form');
  var field = box.querySelector('textarea');
  var segment = box.querySelector('select');
  var button = form.querySelector('button[type="submit"]');
  var out = box.querySelector('.rules-chat-answer');
  var endpoint = box.getAttribute('data-endpoint');

  box.querySelectorAll('[data-q]').forEach(function (b) {
    b.addEventListener('click', function () {
      field.value = b.getAttribute('data-q');
      field.focus();
    });
  });

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function niceDate(iso) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return iso || '';
    var m = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return m[Number(p[1]) - 1] + ' ' + Number(p[2]) + ', ' + p[0];
  }

  function link(href, text) {
    var a = el('a', null, text);
    a.href = href;
    if (/^https?:/.test(href)) a.rel = 'noopener';
    return a;
  }

  function showError(q, data) {
    out.textContent = '';
    out.appendChild(el('p', 'rc-q', q));
    out.appendChild(el('p', 'rc-error', (data && data.error) || 'Something went wrong.'));
    var help = el('p', 'rc-meta');
    help.appendChild(document.createTextNode('Every answer we have is written out '));
    help.appendChild(link('#questions', 'further down this page'));
    help.appendChild(document.createTextNode('. You can also call Pinellas County Parks at (727) 582-2100, option 2.'));
    out.appendChild(help);
  }

  function showAnswer(q, data) {
    out.textContent = '';
    out.appendChild(el('p', 'rc-q', q));
    out.appendChild(el('p', 'rc-a', data.answer));

    var meta = el('div', 'rc-meta');
    if (data.covered && data.sources && data.sources.length) {
      meta.appendChild(el('p', null, (data.reported ? 'Based partly on news reports. ' : '') +
        'Sources, last checked ' + niceDate(data.last_verified) + ':'));
      var ul = el('ul');
      data.sources.forEach(function (s) {
        var li = el('li');
        li.appendChild(link(s.url, s.title));
        ul.appendChild(li);
      });
      meta.appendChild(ul);
    }
    if (data.links && data.links.length) {
      var more = el('p', null, 'Read more on this page: ');
      data.links.forEach(function (l, i) {
        if (i) more.appendChild(document.createTextNode(' · '));
        more.appendChild(link(l.href, l.label));
      });
      meta.appendChild(more);
    }
    if (data.agencies && data.agencies.length) {
      var who = el('p', null, data.covered ? 'To confirm, contact: ' : 'For an answer, contact: ');
      who.appendChild(document.createTextNode(data.agencies.map(function (a) {
        return a.name + (a.phone ? ' at ' + a.phone : '');
      }).join('; ') + '.'));
      meta.appendChild(who);
    }
    if (data.disclaimer) meta.appendChild(el('p', null, data.disclaimer));
    out.appendChild(meta);
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var q = field.value.trim();
    if (!q) { field.focus(); return; }
    var tokenField = form.querySelector('[name="cf-turnstile-response"]');
    button.disabled = true;
    button.textContent = 'Checking…';
    out.textContent = '';
    out.appendChild(el('p', 'rc-meta', 'Looking that up…'));

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: q,
        segment: segment ? segment.value : '',
        turnstileToken: tokenField ? tokenField.value : ''
      })
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (data) { (data && data.ok) ? showAnswer(q, data) : showError(q, data); })
      .catch(function () { showError(q, { error: 'We couldn\'t reach the question box.' }); })
      .then(function () {
        button.disabled = false;
        button.textContent = 'Ask';
        if (window.turnstile && box.querySelector('.cf-turnstile')) {
          try { window.turnstile.reset(); } catch (err) {}
        }
      });
  });
})();
