(() => {
  if (window.__aiFinopsLoaded) return;
  window.__aiFinopsLoaded = true;

  // Selectors are arrays so each site can fall through alternatives. Sites
  // redesign frequently; ordering goes most-stable first.
  const SITE_CONFIG = {
    'chat.openai.com': {
      provider: 'gpt',
      model: 'gpt-4o-mini',
      label: 'ChatGPT',
      selectors: ['#prompt-textarea', 'textarea[data-id="root"]']
    },
    'chatgpt.com': {
      provider: 'gpt',
      model: 'gpt-4o-mini',
      label: 'ChatGPT',
      selectors: ['#prompt-textarea', 'textarea[data-id="root"]']
    },
    'claude.ai': {
      provider: 'claude',
      model: 'claude-3-5-sonnet-latest',
      label: 'Claude',
      selectors: ['div[contenteditable="true"][role="textbox"]', '.ProseMirror']
    },
    'gemini.google.com': {
      provider: 'gemini',
      model: 'gemini-1.5-pro',
      label: 'Gemini',
      selectors: ['div.ql-editor[contenteditable="true"]', 'rich-textarea div[contenteditable="true"]']
    },
    'www.perplexity.ai': {
      provider: 'perplexity',
      model: 'sonar',
      label: 'Perplexity',
      selectors: ['textarea[placeholder*="Ask"]', 'textarea']
    },
    'perplexity.ai': {
      provider: 'perplexity',
      model: 'sonar',
      label: 'Perplexity',
      selectors: ['textarea[placeholder*="Ask"]', 'textarea']
    }
  };

  const site = SITE_CONFIG[location.hostname];
  if (!site) return;

  let panel = null;
  let lastTarget = null;
  let lastCaptured = '';
  let lastOptimized = '';

  function findActiveTarget() {
    for (const sel of site.selectors) {
      const els = document.querySelectorAll(sel);
      for (const el of els) {
        const text = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
          ? el.value
          : el.innerText;
        if (text && text.trim().length > 0) return { el, text: text.trim() };
      }
    }
    for (const sel of site.selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
          ? el.value
          : el.innerText;
        return { el, text: (text || '').trim() };
      }
    }
    return null;
  }

  function applyTextToTarget(el, text) {
    try {
      el.focus();
      if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
        const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')
          || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
        if (setter && setter.set) {
          // React tracks the input's value via a setter on the prototype; using
          // the native setter ensures React picks up the change.
          setter.set.call(el, text);
        } else {
          el.value = text;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      } else {
        // contenteditable path: select all then execCommand insertText so the
        // host editor (ProseMirror, Quill, Lexical) sees a normal input event.
        const range = document.createRange();
        range.selectNodeContents(el);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        let inserted = false;
        try { inserted = document.execCommand('insertText', false, text); } catch (_) {}
        if (!inserted) {
          el.innerText = text;
          el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertText', data: text }));
        }
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.startsWith('on') && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else node.setAttribute(k, attrs[k]);
      }
    }
    if (children) {
      for (const c of children) if (c) node.appendChild(c);
    }
    return node;
  }

  function sendBg(type, payload) {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type, payload }, (resp) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, error: chrome.runtime.lastError.message });
            return;
          }
          resolve(resp || { ok: false, error: 'No response from background' });
        });
      } catch (e) {
        resolve({ ok: false, error: (e && e.message) || String(e) });
      }
    });
  }

  function buildFab() {
    const fab = el('a', { id: 'ai-finops-fab', class: 'aifo-fab', title: 'AI FinOps Optimize', href: '#' });
    fab.innerHTML = '<span class="aifo-bolt">&#9889;</span>';
    fab.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openPanel();
    });
    return fab;
  }

  function ensureFab() {
    if (document.getElementById('ai-finops-fab')) return;
    try {
      document.body.appendChild(buildFab());
    } catch (_) {}
  }

  function closePanel() {
    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
    panel = null;
  }

  function onKeyDown(ev) {
    if (ev.key === 'Escape' && panel) closePanel();
  }

  function setBody(content) {
    const body = panel.querySelector('.aifo-panel-body');
    body.innerHTML = '';
    body.appendChild(content);
  }

  function renderError(message) {
    return el('div', { class: 'aifo-error', text: message });
  }

  function renderLoading(text) {
    return el('div', { class: 'aifo-loading' }, [
      el('span', { class: 'aifo-dots', html: '<span></span><span></span><span></span>' }),
      el('span', { text: text || 'Working...' })
    ]);
  }

  function renderCapturePanel() {
    const wrap = el('div');
    const chipRow = el('div', { class: 'aifo-row' }, [
      el('span', { class: 'aifo-chip', text: site.label }),
      el('span', { class: 'aifo-chip aifo-chip-muted', text: site.model })
    ]);
    const ta = el('textarea', { class: 'aifo-textarea', rows: '6', placeholder: 'Paste or type your prompt here...' });
    ta.value = lastCaptured || '';
    ta.addEventListener('input', () => { lastCaptured = ta.value; });

    const actions = el('div', { class: 'aifo-row aifo-row-end' }, [
      el('button', {
        class: 'aifo-btn',
        text: 'Studio mode',
        onclick: () => openStudio(ta.value)
      }),
      el('button', {
        class: 'aifo-btn aifo-btn-primary',
        text: 'Optimize',
        onclick: () => runOptimize(ta.value)
      })
    ]);

    wrap.appendChild(chipRow);
    wrap.appendChild(el('div', { class: 'aifo-label', text: 'Captured prompt' }));
    wrap.appendChild(ta);
    wrap.appendChild(actions);
    return wrap;
  }

  async function openStudio(promptText) {
    const text = (promptText || '').trim();
    const resp = await sendBg('getBaseUrl', {});
    const baseUrl = (resp && resp.ok && resp.data && resp.data.baseUrl) || 'http://localhost:3000';
    const url = `${baseUrl.replace(/\/$/, '')}/studio?problem=${encodeURIComponent(text)}&targetProvider=${encodeURIComponent(site.provider)}`;
    try { window.open(url, '_blank', 'noopener'); } catch (_) { location.assign(url); }
  }

  async function runOptimize(promptText) {
    const text = (promptText || '').trim();
    if (!text) {
      setBody(renderError('Prompt is empty. Type something into the page or this box first.'));
      return;
    }
    setBody(renderLoading('Optimizing prompt...'));
    const resp = await sendBg('optimize', { prompt: text, model: site.model });
    if (!resp || !resp.ok) {
      const msg = (resp && resp.error) || 'Unknown error';
      const isNet = /failed to fetch|networkerror|load failed/i.test(msg);
      const friendly = isNet
        ? 'Could not reach AI FinOps. Make sure http://localhost:3000 is running and CORS is enabled. See INSTALL.md.'
        : `Could not reach AI FinOps: ${msg}. See INSTALL.md.`;
      setBody(renderError(friendly));
      return;
    }
    renderOptimizeResult(resp.data, text);
  }

  function renderOptimizeResult(data, originalText) {
    lastOptimized = (data && data.optimizedPrompt) || '';
    const saved = (data && (data.originalTokens - data.optimizedTokens)) || 0;
    const savings = (data && data.estimatedCostSavings) != null ? data.estimatedCostSavings : null;
    const pct = (data && data.savedPercent) != null ? data.savedPercent : null;

    const wrap = el('div');

    const chipRow = el('div', { class: 'aifo-row' }, [
      el('span', { class: 'aifo-chip', text: site.label }),
      el('span', { class: 'aifo-chip aifo-chip-success', text: `Saves ${saved} tokens` + (savings != null ? ` · $${Number(savings).toFixed(4)}` : '') + (pct != null ? ` · ${pct}%` : '') })
    ]);

    const out = el('div', { class: 'aifo-result' });
    out.textContent = lastOptimized;

    const actions = el('div', { class: 'aifo-row aifo-row-end' }, [
      el('button', {
        class: 'aifo-btn',
        text: 'Copy',
        onclick: async () => {
          try {
            await navigator.clipboard.writeText(lastOptimized);
            flashChip(actions, 'Copied');
          } catch (_) {
            flashChip(actions, 'Copy failed');
          }
        }
      }),
      el('button', {
        class: 'aifo-btn',
        text: 'Back',
        onclick: () => setBody(renderCapturePanel())
      }),
      el('button', {
        class: 'aifo-btn aifo-btn-primary',
        text: 'Apply',
        onclick: () => {
          const target = lastTarget && lastTarget.el && document.contains(lastTarget.el) ? lastTarget.el : (findActiveTarget() || {}).el;
          if (!target) {
            flashChip(actions, 'No textarea found');
            return;
          }
          const ok = applyTextToTarget(target, lastOptimized);
          flashChip(actions, ok ? 'Applied' : 'Apply failed');
        }
      })
    ]);

    wrap.appendChild(chipRow);
    wrap.appendChild(el('div', { class: 'aifo-label', text: 'Optimized prompt' }));
    wrap.appendChild(out);

    const suggestions = (data && Array.isArray(data.suggestions)) ? data.suggestions : [];
    if (suggestions.length) {
      const details = el('details', { class: 'aifo-suggestions' });
      const summary = el('summary', { text: `Suggestions (${suggestions.length})` });
      details.appendChild(summary);
      const ul = el('ul');
      for (const s of suggestions) {
        const title = (s && (s.title || s.name || s.label)) || (typeof s === 'string' ? s : 'Suggestion');
        ul.appendChild(el('li', { text: title }));
      }
      details.appendChild(ul);
      wrap.appendChild(details);
    }

    wrap.appendChild(actions);
    setBody(wrap);
  }

  function flashChip(host, text) {
    const note = el('span', { class: 'aifo-chip aifo-chip-flash', text });
    host.appendChild(note);
    setTimeout(() => { try { note.remove(); } catch (_) {} }, 1500);
  }

  function openPanel() {
    if (panel) { closePanel(); return; }
    const captured = findActiveTarget();
    lastTarget = captured || null;
    lastCaptured = (captured && captured.text) || lastCaptured || '';

    panel = el('div', { id: 'ai-finops-panel', class: 'aifo-panel', role: 'dialog', 'aria-label': 'AI FinOps' });
    const header = el('div', { class: 'aifo-panel-header' }, [
      el('span', { class: 'aifo-title', text: 'AI FinOps' }),
      el('button', { class: 'aifo-close', text: '×', onclick: closePanel, 'aria-label': 'Close' })
    ]);
    const body = el('div', { class: 'aifo-panel-body' });
    panel.appendChild(header);
    panel.appendChild(body);

    try { document.body.appendChild(panel); } catch (_) {}
    setBody(renderCapturePanel());

    document.addEventListener('keydown', onKeyDown, { once: false });
  }

  // Some target sites re-render aggressively and may strip injected nodes;
  // observing body lets us re-attach the FAB without polling on a timer.
  function observe() {
    const mo = new MutationObserver(() => {
      ensureFab();
    });
    try { mo.observe(document.body, { childList: true, subtree: false }); } catch (_) {}
  }

  function start() {
    try {
      ensureFab();
      observe();
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
