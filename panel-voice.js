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

  // A separate getUserMedia+AudioContext stream used to run here purely to watch input level
  // for a live "speak louder" warning. Confirmed by live testing (2026-08-18) that running that
  // second, independent microphone capture ALONGSIDE SpeechRecognition's own internal capture
  // caused SpeechRecognition to get zero real audio (every attempt ended in a silent 'no-speech'
  // error, on a machine where an unrelated reference page using ONLY SpeechRecognition — no
  // second stream — worked immediately). Dictation is the feature that matters; the volume
  // warning is a nice-to-have. So: no second stream anymore. "Too quiet" is now inferred purely
  // from SpeechRecognition's own behavior (repeated no-speech cycles with nothing transcribed),
  // not from a live level meter — less precise, but doesn't fight the recognizer for the mic.
  var NO_SPEECH_HINT_THRESHOLD = 2;

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
  var noSpeechStreak = 0;
  var activeRecog = null;  // instance the "stop" click should act on
  var currentSession = 0;  // bumped on every (re)start; a stray late event checks this and bails

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
      recognizing = true;
      micBtnEl.classList.add('recording');
      micHintEl.textContent = LISTENING_TEXT;
    };
    r.onresult = function (e) {
      if (mySession !== currentSession) return;
      noSpeechStreak = 0;
      if (micHintEl.textContent === TOO_QUIET_TEXT) micHintEl.textContent = LISTENING_TEXT;
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) committed += t; else interim += t;
      }
      textareaEl.value = before + committed + interim + after;
    };
    r.onerror = function (e) {
      if (mySession !== currentSession) return;
      // 'no-speech' is the normal "nothing heard in this stretch" case — onend still restarts
      // the next utterance below, same as always. Every OTHER error (network, aborted, etc.)
      // used to fall through unhandled: onend still fired, stoppedByUser was still false, so
      // beginSession() ran again, hit the same error again, and looped silently forever —
      // mic showed as "listening" with zero feedback and zero transcription ever appearing.
      if (e.error === 'no-speech') {
        noSpeechStreak++;
        if (noSpeechStreak >= NO_SPEECH_HINT_THRESHOLD) micHintEl.textContent = TOO_QUIET_TEXT;
        return;
      }
      var permission = { 'not-allowed': 1, 'service-not-allowed': 1 };
      stoppedByUser = true;
      micHintEl.textContent = permission[e.error]
        ? 'Mikrofon hatası. İzin verildiğinden emin olun.'
        : 'Ses tanıma hatası (' + e.error + '). Lütfen tekrar deneyin.';
    };
    r.onend = function () {
      if (mySession !== currentSession) return;
      recognizing = false;
      micBtnEl.classList.remove('recording');
      if (stoppedByUser) {
        micHintEl.textContent = '';
        noSpeechStreak = 0;
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
      noSpeechStreak = 0;
      return;
    }
    stoppedByUser = false;
    var pos = textareaEl.selectionStart != null ? textareaEl.selectionStart : textareaEl.value.length;
    beginSession(textareaEl.value.slice(0, pos), textareaEl.value.slice(pos), micLang === 'en' ? 'en-GB' : 'tr-TR');
  });
}
