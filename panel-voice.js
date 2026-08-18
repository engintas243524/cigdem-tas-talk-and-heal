// --- Voice input (native Web Speech API — Chrome) — shared by panel.html and rakip-analizi.html ---
// Rewritten from scratch (2026-08-18) to match, as closely as possible, the structure of a known-
// working reference implementation (MDN's speech-color-changer demo — confirmed working live on
// the same machine/browser where every previous version of this file produced zero transcription).
// One SpeechRecognition instance per recording session (click to click), continuous:true so it
// keeps listening across pauses without needing a manual restart-on-end chain — no per-utterance
// instance recreation, no session-id bookkeeping. Simpler surface, fewer places for a mystery bug
// to hide.
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

  var recognizing = false;
  var recognition = null;

  micBtnEl.addEventListener('click', function () {
    if (recognizing) {
      if (recognition) { try { recognition.stop(); } catch (e) {} }
      return;
    }

    var pos = textareaEl.selectionStart != null ? textareaEl.selectionStart : textareaEl.value.length;
    var before = textareaEl.value.slice(0, pos);
    var after = textareaEl.value.slice(pos);
    var finalText = '';

    recognition = new SR();
    recognition.lang = micLang === 'en' ? 'en-GB' : 'tr-TR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = function () {
      recognizing = true;
      micBtnEl.classList.add('recording');
      micHintEl.textContent = LISTENING_TEXT;
    };
    recognition.onresult = function (e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      textareaEl.value = before + finalText + interim + after;
    };
    recognition.onerror = function (e) {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        micHintEl.textContent = 'Mikrofon hatası. İzin verildiğinden emin olun.';
      }
    };
    recognition.onend = function () {
      recognizing = false;
      micBtnEl.classList.remove('recording');
      if (micHintEl.textContent === LISTENING_TEXT) micHintEl.textContent = '';
    };

    try { recognition.start(); } catch (e) { /* ignore — button click already gated by recognizing */ }
  });
}
