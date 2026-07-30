---
layout: page
title: Search
permalink: /search/
---

<div class="site-search">
  <input id="site-search-input" type="search" placeholder="Search posts…" aria-label="Search posts" autocomplete="off">
  <div class="search-results" id="site-search-results" role="status" aria-live="polite"></div>
</div>

<style>
  .site-search { margin: 24px 0; }
  .site-search input[type="search"] {
    width: 100%; padding: 12px 16px; font-size: 1em;
    border: 1px solid #e5e7eb; border-radius: 10px;
    background: #fff; color: #1f2937;
    box-sizing: border-box; outline: none;
  }
  .site-search input[type="search"]:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.15); }
  .search-results { margin-top: 12px; }
  .search-result { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 16px 20px; margin-bottom: 12px; }
  .search-result .result-title { font-weight: 600; }
  .search-result .result-title a { color: #1f2937; text-decoration: none; }
  .search-result .result-title a:hover { color: #2563eb; }
  .search-result .result-excerpt { color: #6b7280; font-size: 0.95em; margin-top: 4px; line-height: 1.5; }
  .search-result .result-excerpt mark { background: #dbeafe; color: #1f2937; padding: 0 2px; border-radius: 2px; }
  .search-empty { color: #6b7280; font-style: italic; padding: 16px 0; }
</style>

<link rel="stylesheet" href="/pagefind/pagefind-modular-ui.css">
<script src="/pagefind/pagefind-modular-ui.js" type="module"></script>
<script type="module">
  const input = document.getElementById('site-search-input');
  const resultsEl = document.getElementById('site-search-results');
  let pagefind, debounce, reqId = 0;
  async function ensurePagefind() {
    if (!pagefind) {
      pagefind = await import('/pagefind/pagefind.js');
      await pagefind.options({ excerptLength: 25 });
      pagefind.init();
    }
    return pagefind;
  }
  function renderExcerpt(parent, excerpt) {
    const doc = new DOMParser().parseFromString('<div>' + (excerpt || '') + '</div>', 'text/html');
    const out = document.createElement('div');
    for (const node of doc.body.firstChild.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        out.appendChild(node.cloneNode());
      } else if (node.nodeType === Node.ELEMENT_NODE && node.tagName === 'MARK' && !node.attributes.length) {
        const m = document.createElement('mark');
        m.textContent = node.textContent;
        out.appendChild(m);
      }
    }
    parent.appendChild(out);
  }
  async function runSearch(query) {
    const myId = ++reqId;
    if (!query.trim()) {
      if (myId === reqId) { resultsEl.innerHTML = ''; }
      return;
    }
    const pf = await ensurePagefind();
    if (myId !== reqId) return;
    const search = await pf.search(query);
    if (myId !== reqId) return;
    if (!search.results.length) {
      resultsEl.innerHTML = '<div class="search-empty">No posts match "' + query.replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])) + '."</div>';
      return;
    }
    const top = await Promise.all(search.results.slice(0, 20).map(r => r.data()));
    if (myId !== reqId) return;
    resultsEl.innerHTML = '';
    for (const r of top) {
      const card = document.createElement('div');
      card.className = 'search-result';
      const titleRow = document.createElement('div');
      titleRow.className = 'result-title';
      const a = document.createElement('a');
      a.href = r.url;
      a.textContent = r.meta?.title || r.url;
      titleRow.appendChild(a);
      const ex = document.createElement('div');
      ex.className = 'result-excerpt';
      renderExcerpt(ex, r.excerpt);
      card.appendChild(titleRow);
      card.appendChild(ex);
      resultsEl.appendChild(card);
    }
  }
  input.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => runSearch(input.value), 180);
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { clearTimeout(debounce); runSearch(input.value); } });
</script>