// Applica extension service worker. Bridges content scripts (which run on ATS
// pages and have no cross-origin fetch to our backend) with the Applica API,
// attaching the user's saved token.
importScripts('config.js');

async function getToken() {
  const { applicaToken } = await chrome.storage.local.get('applicaToken');
  return applicaToken || '';
}

async function fetchMaterials(pageUrl) {
  const token = await getToken();
  if (!token) return { error: 'no_token' };
  try {
    const res = await fetch(`${APPLICA_BASE_URL}/api/extension/materials?url=${encodeURIComponent(pageUrl)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 401) return { error: 'invalid_token' };
    if (!res.ok) return { error: `http_${res.status}` };
    return await res.json();
  } catch (e) {
    return { error: 'network', detail: String(e) };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_MATERIALS') {
    fetchMaterials(msg.url).then(sendResponse);
    return true; // async response
  }
  if (msg?.type === 'GET_RESUME') {
    (async () => {
      try {
        const res = await fetch(`${APPLICA_BASE_URL}${msg.path}`);
        if (!res.ok) return sendResponse({ error: `http_${res.status}` });
        const bytes = new Uint8Array(await res.arrayBuffer());
        let bin = '';
        const CH = 0x8000;
        for (let i = 0; i < bytes.length; i += CH) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
        const cd = res.headers.get('content-disposition') || '';
        const m = cd.match(/filename="?([^"]+)"?/);
        sendResponse({ b64: btoa(bin), filename: m ? m[1] : 'cv.pdf' });
      } catch (e) {
        sendResponse({ error: String(e) });
      }
    })();
    return true;
  }
  if (msg?.type === 'DOWNLOAD_RESUME') {
    getToken().then((token) => {
      const url = `${APPLICA_BASE_URL}${msg.path}`;
      chrome.downloads.download({ url, saveAs: false }).then(
        () => sendResponse({ ok: true }),
        (e) => sendResponse({ ok: false, error: String(e) }),
      );
      void token;
    });
    return true;
  }
  return false;
});
