const $ = (id) => document.getElementById(id);
const baseUrlInput = $('baseUrl');
const tokenInput = $('ingestToken');
const statusEl = $('status');
const openDashLink = $('openDash');

function setStatus(text, kind) {
  statusEl.textContent = text;
  statusEl.classList.remove('ok', 'err');
  if (kind === 'ok') statusEl.classList.add('ok');
  if (kind === 'err') statusEl.classList.add('err');
}

function refreshDashLink() {
  const url = (baseUrlInput.value || 'http://localhost:3000').replace(/\/$/, '');
  openDashLink.href = url;
}

function load() {
  chrome.storage.local.get(['finopsBaseUrl', 'ingestToken'], (r) => {
    baseUrlInput.value = r.finopsBaseUrl || 'http://localhost:3000';
    tokenInput.value = r.ingestToken || '';
    refreshDashLink();
  });
}

function save() {
  const baseUrl = (baseUrlInput.value || '').trim() || 'http://localhost:3000';
  const ingestToken = (tokenInput.value || '').trim();
  chrome.storage.local.set({ finopsBaseUrl: baseUrl, ingestToken }, () => {
    setStatus('Saved.', 'ok');
    refreshDashLink();
  });
}

function test() {
  setStatus('Testing connection...', null);
  // Save first so the SW ping uses the value the user just typed.
  save();
  try {
    chrome.runtime.sendMessage({ type: 'ping' }, (resp) => {
      if (chrome.runtime.lastError) {
        setStatus(`Error: ${chrome.runtime.lastError.message}`, 'err');
        return;
      }
      if (!resp || !resp.ok) {
        const msg = (resp && resp.error) || 'Unknown error';
        setStatus(`✗ Could not reach dashboard. ${msg}`, 'err');
        return;
      }
      const status = resp.data && resp.data.status;
      const ok = resp.data && resp.data.ok;
      if (ok) setStatus(`✓ Connected (HTTP ${status}).`, 'ok');
      else setStatus(`✗ Dashboard responded with HTTP ${status}.`, 'err');
    });
  } catch (e) {
    setStatus(`✗ ${e && e.message ? e.message : String(e)}`, 'err');
  }
}

$('save').addEventListener('click', save);
$('test').addEventListener('click', test);
baseUrlInput.addEventListener('input', refreshDashLink);
openDashLink.addEventListener('click', (ev) => {
  ev.preventDefault();
  refreshDashLink();
  chrome.tabs.create({ url: openDashLink.href });
});

load();
