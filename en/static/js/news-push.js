(function () {
  'use strict';
  var btn = document.getElementById('nrPushBtn');
  var note = document.getElementById('nrPushNote');
  if (!btn || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
  function say(t) { note.textContent = t; }
  function toBytes(s) {
    var p = '='.repeat((4 - (s.length % 4)) % 4), b = atob((s + p).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(b, function (c) { return c.charCodeAt(0); });
  }
  function post(path, body) {
    return fetch('/en/api/v1/news/push/' + path, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }); });
  }
  navigator.serviceWorker.register('/news-push-sw.js', { scope: '/' }).then(function (reg) {
    return reg.pushManager.getSubscription().then(function (sub) {
      function show(on) { btn.textContent = on ? 'Turn off notifications' : 'Get notifications for new stories'; btn.hidden = false; btn.setAttribute('data-on', on ? '1' : ''); }
      show(!!sub);
      btn.addEventListener('click', function () {
        if (btn.getAttribute('data-on')) {
          reg.pushManager.getSubscription().then(function (s) {
            if (!s) return show(false);
            var ep = s.endpoint;
            return s.unsubscribe().then(function () { return post('unsubscribe', { endpoint: ep }); }).then(function () { show(false); say('Notifications are off.'); });
          });
          return;
        }
        say('Asking your browser…');
        Notification.requestPermission().then(function (perm) {
          if (perm !== 'granted') { say('Notifications are blocked in your browser settings.'); return; }
          return fetch('/en/api/v1/news/push/key', { credentials: 'omit' }).then(function (r) { return r.json(); }).then(function (k) {
            if (!k || !k.key) throw new Error('no key');
            return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(k.key) });
          }).then(function (s) { return post('subscribe', { subscription: s.toJSON() }); })
            .then(function (d) { if (d && d.success) { show(true); say('You will get a notification for big stories.'); } else say('Could not turn notifications on.'); });
        }).catch(function () { say('Could not turn notifications on.'); });
      });
    });
  }).catch(function () { /* unsupported or blocked: button stays hidden */ });
})();
