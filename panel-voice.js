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
    console.log('[mic] click, recognizing=', recognizing);
    if (recognizing) {
      if (recognition) { try { recognition.stop(); console.log('[mic] stop() called'); } catch (e) { console.log('[mic] stop() threw', e); } }
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
    console.log('[mic] created recognition, lang=', recognition.lang);

    recognition.onstart = function () {
      console.log('[mic] onstart');
      recognizing = true;
      micBtnEl.classList.add('recording');
      micHintEl.textContent = LISTENING_TEXT;
    };
    recognition.onaudiostart = function () { console.log('[mic] onaudiostart'); };
    recognition.onsoundstart = function () { console.log('[mic] onsoundstart'); };
    recognition.onspeechstart = function () { console.log('[mic] onspeechstart'); };
    recognition.onspeechend = function () { console.log('[mic] onspeechend'); };
    recognition.onresult = function (e) {
      console.log('[mic] onresult, resultIndex=', e.resultIndex, 'len=', e.results.length);
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        console.log('[mic] result[' + i + ']', JSON.stringify(t), 'isFinal=', e.results[i].isFinal);
        if (e.results[i].isFinal) finalText += t; else interim += t;
      }
      textareaEl.value = before + finalText + interim + after;
    };
    recognition.onerror = function (e) {
      console.log('[mic] onerror', e.error, e.message);
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        micHintEl.textContent = 'Mikrofon hatası. İzin verildiğinden emin olun.';
      }
    };
    recognition.onend = function () {
      console.log('[mic] onend');
      recognizing = false;
      micBtnEl.classList.remove('recording');
      if (micHintEl.textContent === LISTENING_TEXT) micHintEl.textContent = '';
    };

    try { recognition.start(); console.log('[mic] start() called OK'); } catch (e) { console.log('[mic] start() threw', e); }
  });
}
