/* Yastahiq side panel: UI + LLM analysis. No inline handlers (MV3 CSP). */
const $ = s => document.querySelector(s);
const qs = new URLSearchParams(location.search);
const EMBED = qs.get('embed') === '1';
const MAX_CHARS = 24000;
const DEF_MODEL = { openai: 'gpt-4o-mini', gemini: 'gemini-2.0-flash' };

const T = {
  ar: {
    brand: 'يستحق', tag: 'هل يستحق هذا انتباهك؟', tabA: 'التحليل', tabS: 'الإعدادات',
    link: 'الصق رابطًا (اختياري) أو اتركه لقراءة الصفحة الحالية', read: 'اقرأ الصفحة', analyze: 'حلّل الآن',
    none: 'لم تُقرأ أي صفحة بعد', reading: 'جارٍ قراءة المحتوى…', analyzing: 'جارٍ التحليل بالذكاء الاصطناعي…',
    ok: 'كلمة', noKey: 'أضف مفتاح API في الإعدادات أولًا.', unsupported: 'لا يمكن قراءة هذه الصفحة (صفحة نظام أو محمية).',
    empty: 'لم أجد نصًا كافيًا. في يوتيوب تأكد من وجود ترجمة/تفريغ للفيديو.', ytLink: 'روابط يوتيوب: افتح الفيديو في تبويب ثم اضغط «اقرأ الصفحة».',
    fetchFail: 'تعذّر جلب الرابط: ', err: 'حدث خطأ: ', trunc: 'قُصّ المحتوى الطويل للتحليل.',
    q: 'الجودة', o: 'الموضوعية', s: 'الأسلوب', ov: 'التقييم العام', why: 'لماذا هذه الدرجات؟',
    pProv: 'مزوّد الذكاء الاصطناعي', pModel: 'النموذج (يمكن تعديله)', pKey: 'مفتاح API', pInt: 'اهتماماتك (تُستخدم لقياس الصلة)', pLang: 'اللغة',
    intPh: 'مثال: الذكاء الاصطناعي، الاقتصاد، الصحة النفسية', save: 'حفظ', saved: 'تم الحفظ ✓',
    priv: 'يُخزَّن المفتاح محليًا في متصفحك فقط، ويُرسَل المحتوى إلى مزوّد النموذج الذي تختاره للتحليل.',
    types: { article: 'مقال', video: 'فيديو', tweet: 'تغريدات' }
  },
  en: {
    brand: 'Yastahiq', tag: 'Does this deserve your attention?', tabA: 'Analyze', tabS: 'Settings',
    link: 'Paste a link (optional), or leave empty to read this page', read: 'Read page', analyze: 'Analyze now',
    none: 'No page read yet', reading: 'Reading content…', analyzing: 'Analyzing with AI…',
    ok: 'words', noKey: 'Add your API key in Settings first.', unsupported: 'This page can’t be read (system or protected page).',
    empty: 'Not enough text found. On YouTube, make sure the video has captions/transcript.', ytLink: 'YouTube links: open the video in a tab, then press “Read page”.',
    fetchFail: 'Could not fetch the link: ', err: 'Something went wrong: ', trunc: 'Long content was trimmed for analysis.',
    q: 'Quality', o: 'Objectivity', s: 'Style', ov: 'Overall', why: 'Why these scores?',
    pProv: 'AI provider', pModel: 'Model (editable)', pKey: 'API key', pInt: 'Your interests (used for relevance)', pLang: 'Language',
    intPh: 'e.g. AI, economics, mental health', save: 'Save', saved: 'Saved ✓',
    priv: 'Your key is stored locally in your browser only. Content is sent to the model provider you choose for analysis.',
    types: { article: 'Article', video: 'Video', tweet: 'Tweets' }
  }
};

let S = {}, lang = 'en', page = null, last = null;
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const clamp = (n, a = 0, b = 100) => Math.max(a, Math.min(b, Math.round(Number(n) || 0)));
const col = v => v >= 75 ? 'var(--good)' : v >= 50 ? 'var(--mid)' : 'var(--bad)';
const t = k => T[lang][k];

/* ---------- init & i18n ---------- */
async function init() {
  S = await chrome.storage.local.get(['provider', 'model', 'key', 'interests', 'lang']);
  document.body.classList.add(qs.get('side') === 'l' ? 'side-l' : 'side-r');
  if (EMBED) { $('#collapse').hidden = false; $('#collapse').addEventListener('click', () => parent.postMessage({ yastahiq: 'collapse' }, '*')); }
  $('#provider').value = S.provider || 'openai';
  $('#model').value = S.model || ''; $('#key').value = S.key || ''; $('#interests').value = S.interests || ''; $('#lang').value = S.lang || 'auto';
  applyLang();
  document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => tab(b.dataset.tab)));
  $('#provider').addEventListener('change', () => $('#model').placeholder = DEF_MODEL[$('#provider').value]);
  $('#save').addEventListener('click', save);
  $('#read').addEventListener('click', () => readPage().catch(showErr));
  $('#analyze').addEventListener('click', analyze);
}
function applyLang() {
  const l = S.lang;
  lang = (l === 'ar' || l === 'en') ? l : ((chrome.i18n.getUILanguage() || '').toLowerCase().startsWith('ar') ? 'ar' : 'en');
  document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  const m = { brand: 'brand', tag: 'tag', tabA: 'tabA', tabS: 'tabS', read: 'read', analyze: 'analyze', lProv: 'pProv', lModel: 'pModel', lKey: 'pKey', lInt: 'pInt', lLang: 'pLang', save: 'save', privacy: 'priv' };
  for (const [id, k] of Object.entries(m)) $('#' + id).textContent = t(k);
  $('#link').placeholder = t('link'); $('#interests').placeholder = t('intPh'); $('#model').placeholder = DEF_MODEL[$('#provider').value];
  if (!page) $('#srcTitle').textContent = t('none');
  if (last) render(last);
}
function tab(n) {
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === n));
  $('#tab-analyze').hidden = n !== 'analyze'; $('#tab-settings').hidden = n !== 'settings';
}
async function save() {
  S = { provider: $('#provider').value, model: $('#model').value.trim(), key: $('#key').value.trim(), interests: $('#interests').value.trim(), lang: $('#lang').value };
  await chrome.storage.local.set(S);
  applyLang(); $('#save').textContent = t('saved'); setTimeout(() => $('#save').textContent = t('save'), 1500);
}
function status(msg, kind = '') { const e = $('#status'); e.hidden = !msg; e.className = 'status ' + kind; e.textContent = msg || ''; }
function showErr(e) {
  const m = e && e.message;
  status(m === 'unsupported' ? t('unsupported') : m === 'yt' ? t('ytLink') : m === 'empty' ? t('empty') : (m?.startsWith('fetch:') ? t('fetchFail') + m.slice(6) : t('err') + (m || e)), 'err');
}

/* ---------- reading content ---------- */
async function readPage() {
  status(t('reading'), 'busy'); $('#result').hidden = true;
  const link = $('#link').value.trim();
  page = link ? await fetchLink(link) : await fromTab();
  if (!page.text || page.text.length < 200) { page = null; throw new Error('empty'); }
  page.chars = page.text.length;
  if (page.text.length > MAX_CHARS) { page.text = page.text.slice(0, 17000) + '\n[…]\n' + page.text.slice(-5000); page.trimmed = true; }
  const words = page.text.split(/\s+/).length;
  $('#srcTitle').textContent = page.title || page.url;
  $('#srcMeta').textContent = `${t('types')[page.type] || page.type} · ${words} ${t('ok')}${page.trimmed ? ' · ' + t('trunc') : ''}`;
  status('');
}
async function fromTab() {
  const [tb] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tb || !/^https?:/.test(tb.url || '')) throw new Error('unsupported');
  const ask = () => chrome.tabs.sendMessage(tb.id, { type: 'EXTRACT' });
  let r;
  try { r = await ask(); }
  catch { await chrome.scripting.executeScript({ target: { tabId: tb.id }, files: ['content.js'] }); r = await ask(); }
  if (!r || r.error) throw new Error('unsupported');
  return r;
}
async function fetchLink(u) {
  if (/youtu(\.be|be\.com)/.test(u)) throw new Error('yt');
  let html;
  try { const r = await fetch(u, { credentials: 'omit' }); if (!r.ok) throw new Error(r.status); html = await r.text(); }
  catch (e) { throw new Error('fetch:' + e.message); }
  const d = new DOMParser().parseFromString(html, 'text/html');
  d.querySelectorAll('script,style,noscript,nav,footer,aside,form,iframe,svg').forEach(e => e.remove());
  const root = d.querySelector('article') || d.querySelector('main') || d.body;
  const nodes = [...root.querySelectorAll('h1,h2,h3,h4,p,li,blockquote')];
  const text = nodes.map(e => e.textContent.replace(/\s+/g, ' ').trim()).filter(x => x.length > 25).join('\n');
  return {
    type: 'article', url: u, title: d.title, text,
    published: d.querySelector('meta[property="article:published_time"]')?.content || d.querySelector('time')?.getAttribute('datetime') || '',
    signals: { headings: root.querySelectorAll('h1,h2,h3,h4').length, paragraphs: root.querySelectorAll('p').length, images: root.querySelectorAll('img').length, yearsMentioned: [...new Set(text.match(/\b20[0-3]\d\b/g) || [])].sort().slice(-10) }
  };
}

/* ---------- LLM ---------- */
const SYSTEM = `You are Yastahiq (يستحق), an attention-management analyst. Decide whether the given content deserves the reader's attention.
Return ONLY a JSON object, no markdown, with exactly this shape:
{"scores":{"quality":0-100,"objectivity":0-100,"style":0-100,"overall":0-100},
"explanations":{"quality_ar":"","quality_en":"","objectivity_ar":"","objectivity_en":"","style_ar":"","style_en":"","overall_recommendation_ar":"","overall_recommendation_en":""}}
All scores are integers where HIGHER IS BETTER.
QUALITY: recency of cited sources and data (compare with today's date; undated or uncited claims score lower), structural organization (consistent formatting for text; for video transcripts infer pacing/organization from structure and timestamps, you cannot hear audio, so state when evidence is limited), depth and polish (well-built argument vs chaotic).
OBJECTIVITY: user relevance to the stated interests (if none given, ignore relevance and say so), focus and scope (single focused topic vs rambling or fragmented), neutrality (balanced narrative vs explicit bias).
STYLE: toxicity and profanity (insults, hate speech, abuse), incitement (violent, inflammatory, rage-bait), tone sanity (calm logical framing vs exaggerated clickbait emotionalism).
OVERALL: composite worthiness from the three scores.
Rules: be strict and evidence-based, do not inflate (typical average content scores 55-70). Each explanation is 1-3 short sentences that name concrete evidence from the content and the sub-rules that drove the score. *_ar fields must be Modern Standard Arabic, *_en fields English. overall_recommendation must start with a verdict (Worth reading/watching, Skim only, or Skip) and say why.`;

async function callLLM(user) {
  const p = S.provider || 'openai', m = S.model || DEF_MODEL[p];
  if (p === 'openai') {
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + S.key },
      body: JSON.stringify({ model: m, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: user }] })
    });
    const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.status);
    return j.choices[0].message.content;
  }
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': S.key },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } })
  });
  const j = await r.json(); if (!r.ok) throw new Error(j.error?.message || r.status);
  return j.candidates[0].content.parts.map(x => x.text || '').join('');
}
function parse(txt) {
  const j = JSON.parse(txt.slice(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  const s = j.scores || {}, e = j.explanations || {};
  const q = clamp(s.quality), o = clamp(s.objectivity), st = clamp(s.style);
  // Overall recomputed deterministically so the master gauge always matches the three circles.
  return { scores: { quality: q, objectivity: o, style: st, overall: clamp(q * 0.4 + o * 0.35 + st * 0.25) }, explanations: e };
}

async function analyze() {
  try {
    await chrome.storage.local.get(['key']).then(x => S.key = x.key || S.key);
    if (!S.key) { tab('settings'); status(t('noKey'), 'err'); return; }
    if (!page || $('#link').value.trim() && page.url !== $('#link').value.trim()) await readPage();
    $('#analyze').disabled = true; status(t('analyzing'), 'busy'); $('#result').hidden = true;
    const payload = {
      today: new Date().toISOString().slice(0, 10), user_interests: S.interests || '(none provided)',
      page: { type: page.type, url: page.url, title: page.title, published: page.published || 'unknown', signals: page.signals },
      content: page.text
    };
    last = parse(await callLLM(JSON.stringify(payload)));
    status(''); render(last);
  } catch (e) { showErr(e); }
  finally { $('#analyze').disabled = false; }
}

/* ---------- rendering ---------- */
const gauge = (v, label, big) => `<div class="g${big ? ' big' : ''}"><div class="ring"><svg viewBox="0 0 100 100"><circle class="trk" cx="50" cy="50" r="42"/><circle class="arc" data-v="${v}" cx="50" cy="50" r="42" style="stroke:${col(v)}"/></svg><b style="color:${col(v)}">${v}</b></div><span>${label}</span></div>`;
function bullets(txt) { return (String(txt || '').split(/(?<=[.!?؟])\s+/).filter(Boolean)).map(s => `<li>${esc(s)}</li>`).join(''); }
function render(r) {
  const { scores: s, explanations: e } = r, L = lang;
  $('#verdict').style.borderColor = col(s.overall);
  $('#verdict').textContent = e['overall_recommendation_' + L] || '';
  $('#gauges').innerHTML = gauge(s.overall, t('ov'), true) + `<div class="three">${gauge(s.quality, t('q'))}${gauge(s.objectivity, t('o'))}${gauge(s.style, t('s'))}</div>`;
  const row = (k, lbl, v) => `<h4><i style="background:${col(v)}"></i>${lbl} · ${v}</h4><ul>${bullets(e[k + '_' + L])}</ul>`;
  $('#why').innerHTML = `<h3>${t('why')}</h3>` + row('quality', t('q'), s.quality) + row('objectivity', t('o'), s.objectivity) + row('style', t('s'), s.style);
  $('#result').hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelectorAll('.arc').forEach(a => a.style.strokeDashoffset = 264 * (1 - a.dataset.v / 100))));
}
init();
