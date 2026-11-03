(() => {
  if (window.__yastahiq) return;
  window.__yastahiq = true;

  /* ---------- 1) Page / transcript extraction ---------- */
  const JUNK = 'script,style,noscript,nav,footer,aside,header,form,iframe,svg,[role=navigation],[aria-hidden=true],[class*=advert],[id*=advert],[class*=cookie]';
  const fmt = s => { s = Math.floor(s); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };

  async function ytTranscript() {
    try {
      const html = await (await fetch(location.href)).text();
      const m = html.match(/"captionTracks":(\[.*?\])/);
      if (!m) return '';
      const tracks = JSON.parse(m[1]);
      const pref = (document.documentElement.lang || 'en').slice(0, 2);
      const t = tracks.find(x => (x.languageCode || '').startsWith(pref)) || tracks[0];
      const j = await (await fetch(t.baseUrl + '&fmt=json3')).json();
      const lines = []; let last = -99;
      for (const e of j.events || []) {
        if (!e.segs) continue;
        const sec = e.tStartMs / 1000, txt = e.segs.map(s => s.utf8).join('').replace(/\s+/g, ' ').trim();
        if (!txt) continue;
        if (sec - last >= 20 || !lines.length) { lines.push(`[${fmt(sec)}] ${txt}`); last = sec; }
        else lines[lines.length - 1] += ' ' + txt;
      }
      return lines.join('\n');
    } catch { return ''; }
  }

  async function extract() {
    const h = location.hostname;
    let type = 'article', text = '';
    if (/(^|\.)youtube\.com$/.test(h) && location.pathname === '/watch') { type = 'video'; text = await ytTranscript(); }
    else if (/(^|\.)(x|twitter)\.com$/.test(h)) {
      type = 'tweet';
      text = [...document.querySelectorAll('article[data-testid="tweet"]')].slice(0, 12).map(a => a.innerText).join('\n---\n');
    }
    const root = document.querySelector('article') || document.querySelector('main') || document.body;
    const nodes = [...root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote')].filter(e => !e.closest(JUNK));
    if (!text) {
      text = nodes.filter(e => /^H/.test(e.tagName) || e.textContent.trim().length > 25).map(e => e.textContent.replace(/\s+/g, ' ').trim()).join('\n');
      if (text.length < 300) text = document.body.innerText.trim();
    }
    const years = [...new Set((text.match(/\b(?:19[89]\d|20[0-3]\d)\b/g) || []))].sort().slice(-10);
    const pub = document.querySelector('meta[property="article:published_time"],meta[name="date"],meta[itemprop="datePublished"]')?.content
      || document.querySelector('time[datetime]')?.getAttribute('datetime') || '';
    return {
      type, url: location.href, title: document.title, published: pub, text,
      signals: {
        headings: root.querySelectorAll('h1,h2,h3,h4').length, paragraphs: root.querySelectorAll('p').length,
        images: root.querySelectorAll('img').length, adLike: document.querySelectorAll('[class*=advert],[id*=advert],[class*=sponsor],ins.adsbygoogle').length,
        yearsMentioned: years
      }
    };
  }

  /* ---------- 2) Injected drawer + floating badge ---------- */
  const isAr = l => (l === 'ar') || ((!l || l === 'auto') && (chrome.i18n.getUILanguage() || '').toLowerCase().startsWith('ar'));
  const host = document.createElement('div');
  host.style.cssText = 'all:initial';
  const root = host.attachShadow({ mode: 'open' });
  root.innerHTML = `<style>
    #w{--p:#0f6b57}
    #drawer{position:fixed;top:0;bottom:0;width:410px;max-width:92vw;z-index:2147483647;background:#fff;box-shadow:0 0 28px rgba(0,0,0,.28);transition:transform .32s cubic-bezier(.2,.8,.2,1)}
    iframe{width:100%;height:100%;border:0;display:block;color-scheme:normal}
    .r #drawer{right:0}.r.closed #drawer{transform:translateX(110%)}
    .l #drawer{left:0}.l.closed #drawer{transform:translateX(-110%)}
    #badge{position:fixed;top:42%;width:30px;height:60px;border:0;cursor:pointer;z-index:2147483646;background:var(--p);color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.3);transition:width .15s,opacity .2s}
    #badge:hover{width:38px}
    .r #badge{right:0;border-radius:12px 0 0 12px}.l #badge{left:0;border-radius:0 12px 12px 0}
    #w:not(.closed) #badge{opacity:0;pointer-events:none}
    svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2.6;stroke-linecap:round;stroke-linejoin:round}
    .r #badge svg{transform:scaleX(-1)} /* badge on the right: arrow points outward (left) */
  </style>
  <div id="w" class="r closed"><button id="badge" title="Yastahiq | يستحق"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button><div id="drawer"></div></div>`;
  const w = root.getElementById('w'), drawer = root.getElementById('drawer');
  let frame = null, side = 'r';

  function build(l) {
    side = isAr(l) ? 'l' : 'r';
    w.classList.toggle('r', side === 'r'); w.classList.toggle('l', side === 'l');
    if (frame) frame.remove();
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL(`sidepanel.html?embed=1&side=${side}`);
    drawer.appendChild(frame);
  }
  const setOpen = o => { w.classList.toggle('closed', !o); };
  root.getElementById('badge').addEventListener('click', () => setOpen(true));
  window.addEventListener('message', e => {
    if (frame && e.source === frame.contentWindow && e.data && e.data.yastahiq === 'collapse') setOpen(false);
  });
  chrome.storage.local.get(['lang'], s => { build(s.lang); document.documentElement.appendChild(host); });
  chrome.storage.onChanged.addListener(c => { if (c.lang) build(c.lang.newValue); });

  chrome.runtime.onMessage.addListener((msg, _s, send) => {
    if (msg.type === 'TOGGLE') { setOpen(w.classList.contains('closed')); send({ ok: true }); }
    if (msg.type === 'EXTRACT') { extract().then(send).catch(e => send({ error: String(e) })); return true; }
  });
})();
