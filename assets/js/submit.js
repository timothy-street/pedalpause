// Submit-an-event form: checks required fields, posts to /api/submit-event,
// and shows a plain-English result. Nothing goes live until it's approved.
(function () {
  var form = document.getElementById('event-form');
  if (!form) return;
  var status = document.getElementById('form-status');
  var button = form.querySelector('button[type="submit"]');

  function say(msg, kind) {
    status.textContent = msg;
    status.className = 'form-status ' + (kind || '');
  }

  // Clear the red highlight as soon as someone edits a flagged box
  form.addEventListener('input', function (e) {
    if (e.target.getAttribute('aria-invalid')) e.target.removeAttribute('aria-invalid');
    if (e.target.name === 'link') e.target.setCustomValidity('');
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    // Accept links typed without http:// (www.example.com) by adding https://
    var link = form.elements.link;
    if (link) {
      var v = link.value.trim();
      if (v && !/^https?:\/\//i.test(v)) v = 'https://' + v.replace(/^\/+/, '');
      link.value = v;
      link.setCustomValidity(v && !/^https?:\/\/[^\s\/]+\.[^\s]+/i.test(v) ? 'Enter a web address, like www.example.com' : '');
    }
    var bad = Array.prototype.filter.call(form.elements, function (el) {
      el.removeAttribute('aria-invalid');
      return el.willValidate && !el.checkValidity();
    });
    if (bad.length) {
      bad.forEach(function (el) { el.setAttribute('aria-invalid', 'true'); });
      bad[0].focus();
      say('A few things need filling in. Check the highlighted boxes.', 'error');
      return;
    }

    button.disabled = true;
    say('Sending...', '');
    fetch(form.action, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          say('Got it, thank you. We\'ll check the details and add it to the calendar if it fits. If we have a question, we\'ll email you.', 'ok');
        } else {
          say(res.body.error || 'That didn\'t go through. Please try again in a few minutes.', 'error');
        }
      })
      .catch(function () { say('That didn\'t go through. Check your connection and try again.', 'error'); })
      .then(function () { button.disabled = false; });
  });
})();
