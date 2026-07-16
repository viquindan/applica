// Logic port (NOT an import - Playwright can't run in a phone WebView) of
// src/core/automation/linkedinApplyEngine.ts's fillStep/isCheckpoint/matchAnswer
// (see that file, lines ~112-226, for the source of truth this must stay in
// sync with by hand). Runs as a plain JS string injected into a
// react-native-webview pointed at a REAL, live, logged-in linkedin.com
// session - it drives the DOM directly instead of Playwright locators, and
// talks back to React Native via window.ReactNativeWebView.postMessage.
//
// Safety contract identical to the desktop engine: NEVER clicks Submit while
// any required field is unanswered, and freezes (posts 'checkpoint', stops
// interacting) the instant a security challenge is detected - checked first,
// every tick, before anything else.
export function buildInjectedScript(answers: Record<string, string>): string {
  const answersJson = JSON.stringify(answers ?? {});

  return `
(function () {
  if (window.__applicaLinkedInRunning) {
    window.__applicaAnswers = ${answersJson};
    return true;
  }
  window.__applicaLinkedInRunning = true;
  window.__applicaAnswers = ${answersJson};
  window.__applicaPaused = false;

  function post(type, payload) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify({ type: type, payload: payload || null })); } catch (e) {}
  }
  function normalize(s) { return (s || '').toLowerCase().replace(/\\s+/g, ' ').trim(); }
  function matchAnswer(label) {
    var nl = normalize(label);
    if (!nl) return null;
    var answers = window.__applicaAnswers || {};
    for (var q in answers) {
      if (!Object.prototype.hasOwnProperty.call(answers, q)) continue;
      var nq = normalize(q);
      if (nq && (nl.indexOf(nq) !== -1 || nq.indexOf(nl) !== -1)) return answers[q];
    }
    return null;
  }
  function isCheckpoint() {
    if (/checkpoint|challenge|captcha|security-verification|add-phone/i.test(location.href)) return true;
    var sels = ['iframe[src*="captcha" i]', 'iframe[src*="recaptcha"]', 'iframe[title*="captcha" i]',
      '#captcha-internal', '.challenge-dialog', '[data-test-checkpoint]', 'form[action*="checkpoint"]'];
    for (var i = 0; i < sels.length; i++) {
      if (document.querySelector(sels[i])) return true;
    }
    return false;
  }
  function fieldIsRequired(group) {
    if (group.querySelector('[aria-required="true"], [required]')) return true;
    var txt = (group.innerText || '');
    return /\\*\\s*$/m.test(txt) || /required/i.test(txt);
  }
  function fireInput(el) {
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function fillStep(modal) {
    var unanswered = [];
    try {
      var phone = modal.querySelector('input[id*="phoneNumber" i], input[name*="phoneNumber" i]');
      if (phone && !phone.value) {
        var savedPhone = matchAnswer('phone');
        if (savedPhone) { phone.value = savedPhone; fireInput(phone); }
      }
    } catch (e) {}

    try {
      var resumeRadios = modal.querySelectorAll('input[type="radio"][name*="resume" i], input[type="radio"][id*="resume" i]');
      if (resumeRadios.length) {
        var anyChecked = false;
        for (var r = 0; r < resumeRadios.length; r++) if (resumeRadios[r].checked) anyChecked = true;
        if (!anyChecked) { resumeRadios[0].click(); }
      }
    } catch (e) {}

    var groups = modal.querySelectorAll('div.fb-dash-form-element, div[data-test-form-element], .jobs-easy-apply-form-section__grouping, fieldset[data-test-form-builder-radio-button-form-component]');
    for (var i = 0; i < groups.length; i++) {
      var g = groups[i];
      var labelEl = g.querySelector('label, legend, .fb-dash-form-element__label');
      var label = labelEl ? (labelEl.innerText || '').trim() : '';
      if (!label) continue;
      var answer = matchAnswer(label);
      var required = fieldIsRequired(g);

      var select = g.querySelector('select');
      if (select) {
        if (answer) {
          var opt = Array.prototype.find.call(select.options, function (o) { return normalize(o.textContent) === normalize(answer); });
          if (opt) { select.value = opt.value; fireInput(select); }
        } else if (required) unanswered.push(label);
        continue;
      }
      var radios = g.querySelectorAll('input[type="radio"]');
      if (radios.length) {
        if (answer) {
          var matched = null;
          for (var ri = 0; ri < radios.length; ri++) {
            var rLabel = g.querySelector('label[for="' + radios[ri].id + '"]');
            if (rLabel && normalize(rLabel.innerText).indexOf(normalize(answer)) !== -1) { matched = radios[ri]; break; }
          }
          if (matched) matched.click();
          else if (required) unanswered.push(label);
        } else if (required) unanswered.push(label);
        continue;
      }
      var textarea = g.querySelector('textarea');
      if (textarea) {
        if (!textarea.value && answer) { textarea.value = answer; fireInput(textarea); }
        else if (!textarea.value && required) unanswered.push(label);
        continue;
      }
      var text = g.querySelector('input[type="text"], input[type="number"], input:not([type])');
      if (text) {
        if (!text.value && answer) { text.value = answer; fireInput(text); }
        else if (!text.value && required) unanswered.push(label);
        continue;
      }
    }
    return unanswered;
  }

  function findEasyApplyButton() {
    var btns = document.querySelectorAll('button.jobs-apply-button, button[aria-label*="Easy Apply" i]');
    for (var i = 0; i < btns.length; i++) {
      if (/easy apply/i.test(btns[i].innerText || btns[i].getAttribute('aria-label') || '')) return btns[i];
    }
    return null;
  }

  var lastUnanswered = [];
  function tick() {
    try {
      var checkpointNow = isCheckpoint();
      if (checkpointNow && !window.__applicaPaused) {
        window.__applicaPaused = true;
        post('checkpoint', { url: location.href });
        return;
      }
      if (!checkpointNow && window.__applicaPaused) {
        window.__applicaPaused = false;
        post('resumed', null);
      }
      if (window.__applicaPaused) return;

      var modal = document.querySelector('div.jobs-easy-apply-modal, div[role="dialog"]');
      if (!modal) {
        var easyBtn = findEasyApplyButton();
        if (easyBtn) { post('progress', { step: 'opening_easy_apply' }); easyBtn.click(); }
        else post('no_easy_apply', null);
        return;
      }

      var unanswered = fillStep(modal);
      lastUnanswered = unanswered;

      var submitBtn = modal.querySelector('button[aria-label="Submit application"]') ||
        Array.prototype.find.call(modal.querySelectorAll('button'), function (b) { return /submit application/i.test(b.innerText || ''); });
      if (submitBtn) {
        if (unanswered.length) { post('unanswered', { fields: unanswered }); return; }
        post('progress', { step: 'submitting' });
        submitBtn.click();
        setTimeout(function () { post('submitted', null); }, 2000);
        return;
      }

      var nextBtn = modal.querySelector('button[aria-label="Continue to next step"], button[aria-label="Review your application"]') ||
        Array.prototype.find.call(modal.querySelectorAll('button'), function (b) { return /review|next/i.test(b.innerText || ''); });
      if (nextBtn && !unanswered.length) {
        post('progress', { step: 'next' });
        nextBtn.click();
      } else if (unanswered.length) {
        post('unanswered', { fields: unanswered });
      }
    } catch (e) {
      post('error', { message: String(e && e.message || e) });
    }
  }

  window.__applicaLinkedInInterval = setInterval(tick, 2000);
  tick();
  post('started', null);
  return true;
})();
`;
}
