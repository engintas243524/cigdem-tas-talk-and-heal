(function () {
  var CROSSFADE_MS = 2500;
  var STORAGE_KEY = 'talkandheal-music';
  var POS_KEY = 'talkandheal-music-pos';
  var VOL_KEY = 'talkandheal-music-vol';
  var btn = document.querySelector('.music-toggle');
  if (!btn) return;

  var src = btn.getAttribute('data-src');
  var a = new Audio(src);
  var b = new Audio(src);
  a.preload = b.preload = 'auto';
  a.volume = b.volume = 0;

  var active = a, idle = b, swapping = false;

  var targetVolume = parseFloat(localStorage.getItem(VOL_KEY));
  if (!(targetVolume >= 0 && targetVolume <= 1)) targetVolume = 1;

  function fade(el, to, ms) {
    var from = el.volume, start = performance.now();
    (function step(now) {
      var p = Math.min(1, (now - start) / ms);
      el.volume = from + (to - from) * p;
      if (p < 1) requestAnimationFrame(step);
    })(start);
  }

  // Crossfades ~2.5s before a track ends into a second copy already queued at
  // the start, masking the seam regardless of how clean the source loop point is.
  function onTime() {
    if (swapping || !active.duration) return;
    if (active.currentTime >= active.duration - CROSSFADE_MS / 1000) {
      swapping = true;
      var finishing = active, incoming = idle;
      incoming.currentTime = 0;
      incoming.play();
      fade(incoming, targetVolume, CROSSFADE_MS);
      fade(finishing, 0, CROSSFADE_MS);
      active = incoming;
      idle = finishing;
      setTimeout(function () {
        finishing.pause();
        swapping = false;
      }, CROSSFADE_MS);
    }
  }
  a.addEventListener('timeupdate', onTime);
  b.addEventListener('timeupdate', onTime);

  // Resumes at the position saved when the previous page unloaded, so navigating
  // between pages continues the track instead of restarting it.
  function seekToStored() {
    var pos = parseFloat(localStorage.getItem(POS_KEY));
    if (!(pos > 0)) return;
    try { active.currentTime = pos; } catch (e) {}
  }

  function start() {
    btn.classList.add('playing');
    if (active.readyState >= 1) {
      seekToStored();
    } else {
      active.addEventListener('loadedmetadata', seekToStored, { once: true });
    }
    active.play().then(function () {
      fade(active, targetVolume, 800);
    }).catch(function () {
      btn.classList.remove('playing');
    });
  }

  function stop() {
    try { localStorage.setItem(POS_KEY, active.currentTime); } catch (e) {}
    fade(active, 0, 400);
    fade(idle, 0, 400);
    setTimeout(function () { a.pause(); b.pause(); }, 400);
    btn.classList.remove('playing');
  }

  btn.addEventListener('click', function () {
    if (btn.classList.contains('playing')) {
      stop();
      localStorage.removeItem(STORAGE_KEY);
    } else {
      start();
      localStorage.setItem(STORAGE_KEY, '1');
    }
  });

  var slider = document.querySelector('.music-volume');
  if (slider) {
    slider.value = targetVolume;
    slider.addEventListener('input', function () {
      targetVolume = parseFloat(slider.value);
      localStorage.setItem(VOL_KEY, targetVolume.toFixed(2));
      active.volume = targetVolume;
    });
  }

  window.addEventListener('pagehide', function () {
    if (btn.classList.contains('playing')) {
      try { localStorage.setItem(POS_KEY, active.currentTime); } catch (e) {}
    }
  });

  // Preference is shared across every page via localStorage: starting music on
  // one page and navigating to another (same site, same gesture-engaged origin)
  // resumes it there; toggling off anywhere clears the flag for every page.
  if (localStorage.getItem(STORAGE_KEY) === '1') start();
})();
