(function () {
  'use strict';
  var form = document.getElementById('nrCommentForm');
  if (!form) return;
  var status = document.getElementById('nrCommentStatus');
  var replying = document.getElementById('nrCommentReplying');
  function say(t) { status.textContent = t; }
  document.addEventListener('click', function (e) {
    var b = e.target.closest ? e.target.closest('.nr-comment-reply') : null;
    if (!b) return;
    form.elements.parent_id.value = b.getAttribute('data-id');
    replying.textContent = 'Replying to ' + b.getAttribute('data-name') + ' ';
    var cancel = document.createElement('button');
    cancel.type = 'button'; cancel.textContent = 'Cancel'; cancel.style.cssText = 'background:none;border:0;padding:0;text-decoration:underline;cursor:pointer';
    cancel.addEventListener('click', function () { form.elements.parent_id.value = ''; replying.hidden = true; });
    replying.appendChild(cancel); replying.hidden = false;
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = form.elements;
    say('Sending…');
    fetch('/en/api/v1/news/comments', {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: form.getAttribute('data-slug'), name: f.name.value, email: f.email.value, body: f.body.value, parent_id: f.parent_id.value || null, website: f.website.value })
    }).then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        if (d && d.success) {
          say(d.state === 'approved' ? 'Thank you. Your comment is published and will appear when the page refreshes.' : 'Thank you. Your comment is waiting for a moderator and will appear once approved.');
          f.body.value = ''; f.parent_id.value = ''; replying.hidden = true;
        } else say((d && d.error) || 'Could not send your comment. Please try again.');
      })
      .catch(function () { say('Could not send your comment. Please try again.'); });
  });
})();
