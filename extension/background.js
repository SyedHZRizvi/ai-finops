chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['finopsBaseUrl'], (r) => {
    if (!r.finopsBaseUrl) {
      chrome.storage.local.set({ finopsBaseUrl: 'http://localhost:3000' });
    }
  });
});

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['finopsBaseUrl', 'ingestToken'], (r) => {
      resolve({
        baseUrl: r.finopsBaseUrl || 'http://localhost:3000',
        ingestToken: r.ingestToken || ''
      });
    });
  });
}

// Service-worker fetch delegation: content scripts on chat sites are blocked
// from hitting localhost by strict CSP. The SW has host_permissions for
// localhost:3000 and can fetch without tripping the page's CSP.
async function doFetch(path, body) {
  const { baseUrl, ingestToken } = await getSettings();
  const headers = { 'Content-Type': 'application/json' };
  if (ingestToken) headers['Authorization'] = `Bearer ${ingestToken}`;

  const url = baseUrl.replace(/\/$/, '') + path;
  const init = { method: 'POST', headers, body: JSON.stringify(body || {}) };

  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) { json = { raw: text }; }
  if (!res.ok) {
    const msg = (json && (json.error || json.message)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function doPing() {
  const { baseUrl, ingestToken } = await getSettings();
  const headers = {};
  if (ingestToken) headers['Authorization'] = `Bearer ${ingestToken}`;
  const url = baseUrl.replace(/\/$/, '') + '/api/pricing';
  const res = await fetch(url, { method: 'GET', headers });
  return { ok: res.ok, status: res.status };
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      if (!msg || !msg.type) {
        sendResponse({ ok: false, error: 'Missing message type' });
        return;
      }
      if (msg.type === 'optimize') {
        const data = await doFetch('/api/optimize', msg.payload);
        sendResponse({ ok: true, data });
      } else if (msg.type === 'studio') {
        const data = await doFetch('/api/studio', msg.payload);
        sendResponse({ ok: true, data });
      } else if (msg.type === 'log') {
        const data = await doFetch('/api/log', msg.payload);
        sendResponse({ ok: true, data });
      } else if (msg.type === 'ping') {
        const data = await doPing();
        sendResponse({ ok: true, data });
      } else if (msg.type === 'getBaseUrl') {
        const { baseUrl } = await getSettings();
        sendResponse({ ok: true, data: { baseUrl } });
      } else {
        sendResponse({ ok: false, error: `Unknown message type: ${msg.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: (e && e.message) || String(e), status: e && e.status });
    }
  })();
  return true; // keep the message channel open for the async sendResponse
});
