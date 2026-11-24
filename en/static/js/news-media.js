(function () {
  'use strict';
  // Click-to-play video: nothing from YouTube loads until the reader asks for it.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.nr-video-play') : null;
    if (!btn) return;
    var box = btn.closest('.nr-video'), id = box && box.getAttribute('data-yt');
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return;
    var f = document.createElement('iframe');
    f.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    f.title = 'Video player'; f.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen'; f.allowFullscreen = true; f.referrerPolicy = 'strict-origin-when-cross-origin';
    box.replaceChildren(f); f.focus();
  });

  // Photo gallery lightbox with keyboard support (Esc, arrows) and focus return.
  var galleries = document.querySelectorAll('.nr-gallery');
  if (!galleries.length) return;
  var box = null, imgs = [], idx = 0, opener = null;
  function show(i) { idx = (i + imgs.length) % imgs.length; box.querySelector('img').src = imgs[idx].currentSrc || imgs[idx].src; box.querySelector('img').alt = imgs[idx].alt || ''; }
  function close() { if (!box) return; document.removeEventListener('keydown', onKey); box.remove(); box = null; if (opener && opener.focus) opener.focus(); }
  function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') show(idx + 1); else if (e.key === 'ArrowLeft') show(idx - 1); }
  function btn(cls, label, text, fn) { var b = document.createElement('button'); b.type = 'button'; b.className = cls; b.setAttribute('aria-label', label); b.textContent = text; b.addEventListener('click', fn); return b; }
  function open(list, i, from) {
    imgs = list; opener = from;
    box = document.createElement('div'); box.className = 'nr-lightbox'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Photo viewer');
    box.appendChild(document.createElement('img'));
    box.appendChild(btn('nr-lb-close', 'Close', '×', close));
    if (list.length > 1) { box.appendChild(btn('nr-lb-prev', 'Previous photo', '‹', function () { show(idx - 1); })); box.appendChild(btn('nr-lb-next', 'Next photo', '›', function () { show(idx + 1); })); }
    box.addEventListener('click', function (e) { if (e.target === box) close(); });
    document.body.appendChild(box); show(i); document.addEventListener('keydown', onKey); box.querySelector('.nr-lb-close').focus();
  }
  galleries.forEach(function (g) {
    var list = Array.prototype.slice.call(g.querySelectorAll('img'));
    list.forEach(function (im, i) {
      im.tabIndex = 0; im.setAttribute('role', 'button');
      im.addEventListener('click', function () { open(list, i, im); });
      im.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(list, i, im); } });
    });
  });
})();
