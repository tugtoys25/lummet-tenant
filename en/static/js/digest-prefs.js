(function () {
  'use strict';
  var form = document.getElementById('digestPrefsForm');
  var status = document.getElementById('dp-status');
  if (!form) return;
  var token = new URLSearchParams(location.search).get('token') || '';
  function say(t) { status.textContent = t; }
  if (!token) { say('This link is missing its code. Open the link from one of our emails.'); return; }
  fetch('/en/api/v1/news/digest-prefs?token=' + encodeURIComponent(token), { credentials: 'omit' })
    .then(function (r) { return r.json().catch(function () { return {}; }); })
    .then(function (d) {
      if (!d || !d.success) { say('This link is no longer valid. Use the link in a recent email.'); return; }
      var box = document.getElementById('dp-sections');
      if (!d.sections.length) { say('No sections are available yet.'); return; }
      d.sections.forEach(function (s) {
        var label = document.createElement('label');
        label.style.cssText = 'display:block;margin:6px 0';
        var cb = document.createElement('input');
        cb.type = 'checkbox'; cb.value = s.slug; cb.checked = d.selected.indexOf(s.slug) !== -1;
        label.appendChild(cb); label.appendChild(document.createTextNode(' ' + s.name));
        box.appendChild(label);
      });
      document.getElementById('dp-frequency').value = d.frequency || 'weekly';
      form.hidden = false;
    })
    .catch(function () { say('Could not load your choices. Please try again later.'); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var picked = Array.prototype.map.call(form.querySelectorAll('input[type=checkbox]:checked'), function (c) { return c.value; });
    say('Saving…');
    fetch('/en/api/v1/news/digest-prefs', {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: token, sections: picked, frequency: document.getElementById('dp-frequency').value })
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) { say(d && d.success ? (picked.length ? 'Saved. You will get an email when there is something new.' : 'Saved. You will not get section emails.') : (d.error || 'Could not save.')); })
      .catch(function () { say('Could not save. Please try again.'); });
  });
})();
