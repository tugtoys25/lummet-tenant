(function () {
  'use strict';
  var form = document.getElementById('nrMemberForm');
  if (!form) return;
  var status = document.getElementById('nrMemberStatus');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    status.textContent = 'Sending…';
    fetch('/en/api/v1/news/member/login', {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: form.elements.email.value, website: form.elements.website.value, next: form.getAttribute('data-next') })
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) { status.textContent = d && d.success ? 'If that address is a subscriber or member, a sign-in link is on its way. Check your inbox.' : ((d && d.error) || 'Could not send the link. Please try again.'); })
      .catch(function () { status.textContent = 'Could not send the link. Please try again.'; });
  });
})();
