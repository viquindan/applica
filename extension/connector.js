// Runs on the Applica site (same origin), so the session cookie is available.
// Auto-fetches the user's extension token and stores it - the user never pastes
// anything: install the extension, open Applica, and it self-connects.
(async () => {
  try {
    const res = await fetch(`${APPLICA_BASE_URL}/api/extension/token`, { credentials: 'include' });
    if (!res.ok) return;
    const { token } = await res.json();
    if (token) {
      await chrome.storage.local.set({ applicaToken: token });
      // Small confirmation so the user knows it linked.
      const el = document.createElement('div');
      el.textContent = 'Extension Applica conectada';
      el.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;background:#2A4A4F;color:#fff;padding:10px 14px;border-radius:10px;font:600 13px Inter,system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.2)';
      document.body.appendChild(el);
      setTimeout(() => { el.style.transition = 'opacity .4s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 500); }, 2500);
    }
  } catch (_) { /* Applica not reachable or not logged in; ignore */ }
})();
