// --- Voice input (native Web Speech API — Chrome) — shared by panel.html and rakip-analizi.html ---
// recog.lang used to be hardcoded to 'tr-TR', so any English dictation was forced through
// Chrome's Turkish speech model and came out as phonetically-similar Turkish words. The
// TR/EN toggle below picks the model per recording; the same equal-quality dictation as
// booking.html's mic button, just driven by a manual toggle instead of the site's flag switcher
// (these internal tools have no EN/TR page language of their own).
function attachVoiceInput(config) {
  var textareaEl = config.textareaEl, micBtnEl = config.micBtnEl, micHintEl = config.micHintEl;
  var micLangToggleEl = config.micLangToggleEl, localStorageKey = config.localStorageKey;

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var micLang = localStorage.getItem(localStorageKey) || 'tr';
  if (micLangToggleEl) {
    var setMicLang = function (lang) {
      micLang = lang;
      localStorage.setItem(localStorageKey, lang);
      Array.prototype.forEach.call(micLangToggleEl.querySelectorAll('button'), function (b) {
        b.classList.toggle('active', b.getAttribute('data-lang') === lang);
      });
    };
    micLangToggleEl.addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-lang]');
      if (btn) setMicLang(btn.getAttribute('data-lang'));
    });
    setMicLang(micLang);
  }
  if (!SR) {
    micBtnEl.classList.add('hidden');
    micHintEl.textContent = 'Sesli giriş için Google Chrome kullanın.';
    return;
  }

  var LISTENING_TEXT = 'Dinleniyor... konuşun (durdurmak için mikrofona tekrar dokunun).';
  var TOO_QUIET_TEXT = 'Sesini net duyamıyoruz — lütfen biraz daha yüksek sesle konuş.';

  // Live "speak louder" warning: SpeechRecognition exposes no volume/confidence signal, so
  // a second getUserMedia stream feeds an AnalyserNode purely to watch input level while
  // recognition runs. autoGainControl/noiseSuppression/echoCancellation are explicitly OFF
  // on this stream — the browser's default AGC quietly boosts low input back up before it
  // reaches the AnalyserNode, which is why the warning never fired on genuinely quiet
  // speech: the volume was being auto-corrected out from under us.
  // ponytail: fixed RMS threshold, not per-device calibrated — mic gain still varies by
  // hardware even with AGC off; revisit with a noise-floor sample if it misfires.
  var QUIET_RMS = 0.02, QUIET_HOLD_MS = 1200;
  function startVolumeMonitor(onLow, onOk) {
    return navigator.mediaDevices.getUserMedia({
      audio: { autoGainControl: false, noiseSuppression: false, echoCancellation: false }
    }).then(function (stream) {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      // Created inside an async getUserMedia().then() — by the time this callback runs
      // (permission prompt + resolution can take a moment), Chrome may no longer count it
      // as still inside the original click's user-gesture window and leaves the context
      // 'suspended'. A suspended context produces no real audio data (silence, so RMS stays
      // near-zero forever) even though the mic itself is capturing fine — this is why the
      // "speak louder" warning could fire nonstop regardless of actual volume.
      if (ctx.state === 'suspended') ctx.resume();
      var source = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      var data = new Uint8Array(analyser.fftSize);
      var quietSince = null, raf;
      (function tick() {
        analyser.getByteTimeDomainData(data);
        var sum = 0;
        for (var i = 0; i < data.length; i++) { var v = (data[i] - 128) / 128; sum += v * v; }
        var rms = Math.sqrt(sum / data.length);
        if (rms < QUIET_RMS) {
          if (quietSince == null) quietSince = Date.now();
          else if (Date.now() - quietSince > QUIET_HOLD_MS) onLow();
        } else {
          quietSince = null;
          onOk();
        }
        raf = requestAnimationFrame(tick);
      })();
      return { stop: function () {
        cancelAnimationFrame(raf);
        stream.getTracks().forEach(function (t) { t.stop(); });
        ctx.close();
      }};
    });
  }

  // continuous:true was the root cause of the worse bugs (note text randomly overwritten,
  // a stray fragment from the other language bleeding into a freshly-started recording):
  // Chrome keeps one long-lived internal multi-utterance buffer under continuous mode
  // that's known to silently drop low-confidence stretches and occasionally deliver a late
  // event after the session has moved on. Instead, each utterance gets its own brand-new
  // SpeechRecognition instance (continuous:false) chained by restarting on every onend —
  // looks the same to the user (near-instant restart), but there's no shared internal buffer
  // left to get corrupted, and no stale object whose delayed event could land in the wrong
  // session (e.g. after switching the TR/EN toggle).
  var recognizing = false, stoppedByUser = false;
  var volMonitor = null, isQuiet = false;
  var activeRecog = null;  // instance the "stop" click should act on
  var currentSession = 0;  // bumped on every (re)start; a stray late event checks this and bails

  function onVolLow() { if (!isQuiet) { isQuiet = true; micHintEl.textContent = TOO_QUIET_TEXT; } }
  function onVolOk() { if (isQuiet) { isQuiet = false; micHintEl.textContent = LISTENING_TEXT; } }

  function beginSession(before, after, lang) {
    currentSession++;
    var mySession = currentSession;
    var committed = '';
    var r = new SR();
    r.lang = lang;
    r.interimResults = true;
    r.continuous = false;
    activeRecog = r;

    r.onstart = function () {
      if (mySession !== currentSession) return;
      console.log('[mic] onstart, session', mySession);
      recognizing = true;
      micBtnEl.classList.add('recording');
      micHintEl.textContent = LISTENING_TEXT;
    };
    r.onresult = function (e) {
      if (mySession !== currentSession) return;
      console.log('[mic] onresult, resultIndex', e.resultIndex, 'results.length', e.results.length);
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) committed += t; else interim += t;
      }
      textareaEl.value = before + committed + interim + after;
    };
    r.onerror = function (e) {
      console.log('[mic] onerror', e.error, 'session', mySession, 'current', currentSession);
      if (mySession !== currentSession) return;
      // 'no-speech' is the normal "user paused talking" case — onend will silently restart
      // the next utterance, same as always. Every OTHER error (network, aborted, etc.) used
      // to fall through unhandled: onend still fired, stoppedByUser was still false, so
      // beginSession() ran again, hit the same error again, and looped silently forever —
      // mic showed as "listening" with zero feedback and zero transcription ever appearing.
      if (e.error === 'no-speech') return;
      var permission = { 'not-allowed': 1, 'service-not-allowed': 1 };
      stoppedByUser = true;
      micHintEl.textContent = permission[e.error]
        ? 'Mikrofon hatası. İzin verildiğinden emin olun.'
        : 'Ses tanıma hatası (' + e.error + '). Lütfen tekrar deneyin.';
    };
    r.onend = function () {
      console.log('[mic] onend, session', mySession, 'current', currentSession, 'stoppedByUser', stoppedByUser);
      if (mySession !== currentSession) return;
      recognizing = false;
      micBtnEl.classList.remove('recording');
      if (stoppedByUser) {
        micHintEl.textContent = '';
        if (volMonitor) { volMonitor.stop(); volMonitor = null; }
        isQuiet = false;
        return;
      }
      // Fold whatever's already in the box back in as the next utterance's prefix — always
      // the true current text, never a possibly-stale local variable.
      beginSession(textareaEl.value, '', lang);
    };

    try { r.start(); } catch (e) { /* fresh instance — should never already be started */ }
  }

  micBtnEl.addEventListener('click', function () {
    if (recognizing) {
      stoppedByUser = true;
      currentSession++; // stray late onresult/onend'lerin bu oturumu artık "eski" görüp bailout etmesi için — stop()/abort() sonrası bazı Chrome sürümlerinde onend hiç ateşlenmeyebiliyor, o yüzden UI/state'i ASENKRON onend'i beklemeden burada, tıklama anında hemen sıfırlıyoruz (ikinci tıkta "kapanmıyor" şikayetinin kök nedeni: buton state'i onend'e bağımlıydı).
      if (activeRecog) { try { activeRecog.stop(); } catch (e) {} try { activeRecog.abort(); } catch (e) {} }
      recognizing = false;
      micBtnEl.classList.remove('recording');
      micHintEl.textContent = '';
      if (volMonitor) { volMonitor.stop(); volMonitor = null; }
      isQuiet = false;
      return;
    }
    stoppedByUser = false;
    var pos = textareaEl.selectionStart != null ? textareaEl.selectionStart : textareaEl.value.length;
    beginSession(textareaEl.value.slice(0, pos), textareaEl.value.slice(pos), micLang === 'en' ? 'en-GB' : 'tr-TR');
    // beginSession() already bumped currentSession, so this is the session the monitor
    // belongs to. If the user hits stop before getUserMedia resolves, currentSession moves
    // on and volMonitor is never assigned here — without this check the just-created stream
    // would keep running (mic never released) with nothing left holding a reference to stop it.
    var monitorSession = currentSession;
    if (!volMonitor) {
      startVolumeMonitor(onVolLow, onVolOk).then(function (m) {
        if (monitorSession !== currentSession) { m.stop(); return; }
        volMonitor = m;
      }).catch(function () {});
    }
  });
}
