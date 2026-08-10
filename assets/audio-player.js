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

  // If a page load's silent auto-resume gets blocked by the browser's autoplay policy (no user
  // gesture yet on this fresh page), retry once on the visitor's very next click/key/touch
  // anywhere on the page — that gesture is enough to unblock playback, so this makes the resume
  // land on the first interaction instead of leaving the track stopped until the music icon
  // itself happens to be clicked again.
  var gestureRetryCleanup = null;

  function clearGestureRetry() {
    if (gestureRetryCleanup) {
      gestureRetryCleanup();
      gestureRetryCleanup = null;
    }
  }

  function armGestureRetry() {
    function retry() {
      clearGestureRetry();
      start();
    }
    document.addEventListener('click', retry, { once: true });
    document.addEventListener('keydown', retry, { once: true });
    document.addEventListener('touchstart', retry, { once: true });
    gestureRetryCleanup = function () {
      document.removeEventListener('click', retry);
      document.removeEventListener('keydown', retry);
      document.removeEventListener('touchstart', retry);
    };
  }

  function start() {
    clearGestureRetry();
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
      armGestureRetry();
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
