/* tema.js
   Tek elden çalışan, ES2025 vanilla forum uygulaması.
   DOSYANIN BAŞINDA SADECE AŞAĞIDAKİ 3 DEĞİŞKEN OLMALIDIR:
*/
const SUPABASE_URL = "";
const SUPABASE_ANON_KEY = "";
const FORMSUBMIT_MAIL = "";

/* -------------------------
   NOT: Yukarıdaki değişkenleri doldurun.
   Başka elle ayar yoktur.
   ------------------------- */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/esm/index.js';

/* App singletons */
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 50 } } });

/* Lightweight router (hash-based) */
const Router = {
  init() {
    window.addEventListener('hashchange', () => this.render());
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[data-nav]');
      if (a) { e.preventDefault(); location.hash = a.getAttribute('href'); }
    });
    this.render();
  },
  async render() {
    const hash = location.hash.replace(/^#/, '') || '/';
    if (hash.startsWith('/id/')) {
      const parts = hash.split('/');
      const id = parts[2];
      await App.renderThread(id);
    } else {
      await App.renderIndex();
    }
  }
};

/* Utility functions */

/* Debounce / Throttle */
function debounce(fn, wait=250) { let t; return (...args) => { clearTimeout(t); t = setTimeout(()=>fn(...args), wait); }; }
function throttle(fn, wait=150) { let last=0; return (...args) => { const now = Date.now(); if(now-last>wait){ last=now; fn(...args); } }; }

/* Simple sanitize (XSS protection) */
function escapeHTML(s='') {
  return String(s)
    .replaceAll('&','&amp;')
    .replaceAll('<','&lt;')
    .replaceAll('>','&gt;')
    .replaceAll('"','&quot;')
    .replaceAll("'",'&#39;');
}

/* Slugify */
function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD')
    .replace(/[^\w\s-]/g,'')
    .trim().replace(/\s+/g,'-').slice(0,120);
}

/* Levenshtein distance (optimized) */
function levenshtein(a,b){
  if(a===b) return 0;
  const m = a.length, n = b.length;
  if(m===0) return n;
  if(n===0) return m;
  let v0 = new Array(n+1), v1 = new Array(n+1);
  for(let j=0;j<=n;j++) v0[j]=j;
  for(let i=0;i<m;i++){
    v1[0]=i+1;
    for(let j=0;j<n;j++){
      const cost = a[i]===b[j] ? 0:1;
      v1[j+1] = Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost);
    }
    [v0,v1]=[v1,v0];
  }
  return v0[n];
}

/* TF-IDF simple scorer for suggestions */
function tfidfScore(query, doc) {
  const q = query.toLowerCase().split(/\s+/);
  const words = doc.toLowerCase().split(/\s+/);
  let score = 0;
  for (const qw of q) {
    if (!qw) continue;
    for (const w of words) {
      if (w.includes(qw)) score += 2;
      else if (levenshtein(qw, w) <= 2) score += 1;
    }
  }
  return score;
}

/* Accessibility announcer */
function announce(msg) {
  const el = document.getElementById('a11y-live');
  if (el) el.textContent = msg;
}

/* Main App */
const App = {
  state: {
    user: null,
    categories: [],
    topicsPage: 0,
    topicsPerPage: 10,
    subscriptions: [],
  },

  async init() {
    this.cacheDOM();
    this.bindUI();
    await this.initAuthListener();
    await this.loadInitialData();
    Router.init();
    this.initRealtime();
    document.getElementById('copy-year').textContent = new Date().getFullYear();
    this.applySavedTheme();
  },

  cacheDOM() {
    this.app = document.getElementById('app');
    this.topicsEl = document.getElementById('topic-list');
    this.trendingEl = document.getElementById('trending-list');
    this.top10El = document.getElementById('top10-list');
    this.statTopics = document.getElementById('stat-topics');
    this.statPosts = document.getElementById('stat-posts');
    this.statUsers = document.getElementById('stat-users');
    this.statToday = document.getElementById('stat-today');
    this.statOnline = document.getElementById('stat-online');
    this.searchInput = document.getElementById('live-search');
    this.searchSuggestions = document.getElementById('search-suggestions');
    this.newTopicModal = document.getElementById('new-topic-modal');
    this.newTopicForm = document.getElementById('new-topic-form');
    this.setupWizard = document.getElementById('setup-wizard');
    this.setupForm = document.getElementById('setup-form');
  },

  bindUI() {
    document.getElementById('btn-new-topic').addEventListener('click', ()=> this.openNewTopic());
    document.getElementById('btn-theme-switcher').addEventListener('click', ()=> this.cycleTheme());
    document.getElementById('mobile-menu-toggle').addEventListener('click',(e)=>{
      const mm = document.getElementById('mobile-menu');
      const expanded = e.currentTarget.getAttribute('aria-expanded') === 'true';
      e.currentTarget.setAttribute('aria-expanded', !expanded);
      mm.style.display = expanded ? 'none' : 'block';
    });
    document.getElementById('load-more').addEventListener('click', ()=> this.loadMoreTopics());
    this.searchInput.addEventListener('input', debounce((e)=> this.onSearch(e.target.value), 220));
    this.searchInput.addEventListener('focus', ()=> this.searchSuggestions.classList.add('visible'));
    document.addEventListener('click', (e) => {
      if(!e.target.closest('.search-wrap')) this.searchSuggestions.classList.remove('visible');
    });

    this.newTopicForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const title = document.getElementById('new-topic-title').value.trim();
      const body = document.getElementById('new-topic-body').value.trim();
      const cat = document.getElementById('new-topic-category').value;
      if(!title || !body) return alert('Başlık ve içerik gerekli.');
      await this.createTopic({ title, body, category_id: cat });
      this.closeNewTopic();
    });

    this.setupForm?.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = fd.get('email');
      const password = fd.get('password');
      const { user, error } = await supabase.auth.signUp({ email, password }, { data: { role:'admin' } });
      if (error) { alert(error.message); return; }
      // mark setup complete in localStorage
      localStorage.setItem('forum_setup_done','1');
      announce('Yönetici oluşturuldu. Giriş yapıldı.');
      setTimeout(()=> location.reload(), 800);
    });
  },

  async initAuthListener() {
    const { data: { user } } = await supabase.auth.getUser();
    this.state.user = user;
    this.renderProfileArea();
    supabase.auth.onAuthStateChange((e, session) => {
      this.state.user = session?.user ?? null;
      this.renderProfileArea();
    });
  },

  async loadInitialData() {
    // categories, stats, top10, recent topics (first page)
    await Promise.all([this.loadCategories(), this.loadStats(), this.loadTop10(), this.loadTopics(true)]);
    // Setup wizard show logic
    const setupDone = localStorage.getItem('forum_setup_done') || (await this.checkAdminExistence());
    if(!setupDone) {
      this.openSetupWizard();
    }
  },

  async checkAdminExistence(){
    // Query users table existence via Supabase auth.users requires service role; fallback to skipping
    // For a static client, we'll rely on localStorage for first-run.
    return !!localStorage.getItem('forum_setup_done');
  },

  openSetupWizard() {
    this.setupWizard.setAttribute('aria-hidden','false');
  },

  closeSetupWizard() {
    this.setupWizard.setAttribute('aria-hidden','true');
  },

  async loadCategories() {
    // categories table should exist in Supabase with (id,name,slug,description,parent_id,order)
    const { data, error } = await supabase.from('categories').select('*').order('order',{ascending:true});
    if (error) { console.warn('loadCategories', error); this.state.categories = []; return; }
    this.state.categories = data;
    // fill category select in new topic modal
    const sel = document.getElementById('new-topic-category');
    if (sel) {
      sel.innerHTML = data.map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');
    }
  },

  async loadStats() {
    // A single RPC or counts; fallback to simple selects
    try {
      const [{ count: topics=[]}, { count: posts=[]}, { count: users=[]}] = await Promise.all([
        supabase.from('topics').select('id', { count:'exact' }),
        supabase.from('posts').select('id', { count:'exact' }),
        supabase.from('profiles').select('id', { count:'exact' })
      ]);
      this.statTopics.textContent = topics ?? 0;
      this.statPosts.textContent = posts ?? 0;
      this.statUsers.textContent = users ?? 0;
      // today's opened
      const { data:todayData } = await supabase.rpc('count_topics_today');
      this.statToday.textContent = (todayData && todayData.count) || 0;
      // online approximation
      const { data:onlineData } = await supabase.rpc('get_online_count');
      this.statOnline.textContent = (onlineData && onlineData.count) || 0;
    } catch(e){ console.warn(e); }
  },

  async loadTop10() {
    const { data, error } = await supabase.from('topics').select('id,title,views,slug').order('views',{ascending:false}).limit(10);
    if (error) { console.warn(error); return; }
    this.top10El.innerHTML = data.map((t,i)=>`<li><a href="#/id/${t.id}/${t.slug || ''}">${i+1}. ${escapeHTML(t.title)}</a></li>`).join('');
  },

  async loadTopics(reset=false) {
    if (reset) this.state.topicsPage = 0;
    const page = this.state.topicsPage;
    const per = this.state.topicsPerPage;
    const from = page*per;
    const to = from + per -1;
    const { data, error } = await supabase.from('topics').select('id,title,slug,excerpt,created_at,updated_at,latest_post_by,category_id,views').order('updated_at',{ascending:false}).range(from,to);
    if (error) { console.warn('loadTopics', error); return; }
    if (reset) this.topicsEl.innerHTML = '';
    for (const t of data) {
      const card = document.createElement('div');
      card.className = 'topic-card';
      card.innerHTML = `
        <div class="topic-avatar" aria-hidden="true">${escapeHTML((t.title||'')[0]||'?')}</div>
        <div class="topic-body">
          <a href="#/id/${t.id}/${t.slug || slugify(t.title)}" class="topic-title">${escapeHTML(t.title)}</a>
          <div class="topic-meta">${escapeHTML(t.excerpt || '')} • ${new Date(t.updated_at).toLocaleString()}</div>
        </div>
      `;
      this.topicsEl.appendChild(card);
    }
    this.state.topicsPage++;
  },

  loadMoreTopics() { this.loadTopics(); }

  ,

  async renderIndex() {
    document.body.setAttribute('data-page','index');
    // ensure topics loaded
    if(!this.topicsEl?.children.length) await this.loadTopics(true);
  },

  async renderThread(threadId) {
    document.body.setAttribute('data-page','thread');
    // fetch topic + posts
    const { data: topics } = await supabase.from('topics').select('*').eq('id', threadId).limit(1);
    if (!topics || !topics.length) {
      this.app.innerHTML = `<div class="card"><h2>Konu bulunamadı</h2></div>`;
      return;
    }
    const t = topics[0];
    // increment view (race tolerant)
    supabase.from('topics').update({ views: (t.views||0)+1 }).eq('id', t.id).then(()=>{});
    const { data: posts } = await supabase.from('posts').select('*').eq('topic_id', threadId).order('created_at',{ascending:true});
    // render thread template
    const tpl = document.getElementById('thread-template').content.cloneNode(true);
    tpl.querySelector('.thread-title').textContent = t.title;
    tpl.querySelector('.thread-meta').innerHTML = `${new Date(t.created_at).toLocaleString()} • ${escapeHTML(t.latest_post_by || '')}`;
    const postsEl = tpl.getElementById('posts');
    for (const p of posts) {
      const postEl = document.createElement('div');
      postEl.className = 'post';
      postEl.innerHTML = `
        <div class="postbit" role="complementary">
          <div class="post-avatar">${escapeHTML((p.user_display_name||'U')[0])}</div>
          <div class="post-info"><strong>${escapeHTML(p.user_display_name||'Anonim')}</strong><div class="muted">${new Date(p.created_at).toLocaleString()}</div></div>
        </div>
        <div class="post-content">${this.renderPostBody(p)}</div>
      `;
      postsEl.appendChild(postEl);
    }
    this.app.innerHTML = '';
    this.app.appendChild(tpl);
    this.attachComposer(threadId);
    this.generateThreadJSONLD(t, posts);
  },

  renderPostBody(p) {
    // support markdown basic + bbcode minimal + sanitize
    let body = escapeHTML(p.body || '');
    // markdown code block simple handling
    body = body.replaceAll(/```([\s\S]*?)```/g, (m,code)=>`<pre><code>${code}</code></pre>`);
    // inline code
    body = body.replaceAll(/`([^`]+)`/g, '<code>$1</code>');
    // bold/italic simple
    body = body.replaceAll(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replaceAll(/\*([^*]+)\*/g,'<em>$1</em>');
    // BBCode [quote] -> blockquote
    body = body.replaceAll(/\[quote\](.*?)\[\/quote\]/gis,'<blockquote>$1</blockquote>');
    // links
    body = body.replaceAll(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    return body;
  },

  attachComposer(threadId) {
    const btnSend = document.querySelector('#btn-send');
    const quickReply = document.querySelector('#quick-reply');
    btnSend?.addEventListener('click', async ()=>{
      const text = quickReply.value.trim();
      if (!text) return alert('Mesaj boş olamaz.');
      const user = this.state.user;
      const payload = {
        topic_id: threadId,
        body: text,
        user_id: user?.id || null,
        user_display_name: user?.email?.split('@')[0] || 'Anonim',
      };
      const { data, error } = await supabase.from('posts').insert([payload]).select().single();
      if (error) { alert('Gönderilemedi: '+error.message); return; }
      // Update topic latest info
      await supabase.from('topics').update({ latest_post_by: payload.user_display_name, updated_at: new Date().toISOString() }).eq('id', threadId);
      quickReply.value = '';
      announce('Cevabınız gönderildi.');
      // Re-render thread to include new post
      await this.renderThread(threadId);
    });
  },

  async createTopic({ title, body, category_id }) {
    const slug = slugify(title);
    const user = this.state.user;
    const payload = {
      title, slug, excerpt: body.slice(0,250), category_id, created_at: new Date().toISOString(),
      created_by: user?.id || null, latest_post_by: user?.email?.split('@')[0] || 'Anonim'
    };
    const { data, error } = await supabase.from('topics').insert([payload]).select().single();
    if (error) { alert('Konu oluşturulamadı: '+error.message); return; }
    // insert first post
    await supabase.from('posts').insert([{ topic_id: data.id, body, user_id: user?.id || null, user_display_name: payload.latest_post_by }]);
    announce('Konu oluşturuldu.');
    location.hash = `#/id/${data.id}/${data.slug}`;
  },

  openNewTopic() {
    this.newTopicModal.setAttribute('aria-hidden','false');
    document.getElementById('new-topic-title').focus();
  },

  closeNewTopic() {
    this.newTopicModal.setAttribute('aria-hidden','true');
  },

  renderProfileArea() {
    const pa = document.getElementById('profile-area');
    if (!this.state.user) {
      pa.innerHTML = `<button id="btn-login" class="btn">Giriş / Kayıt</button>`;
      document.getElementById('btn-login').addEventListener('click', ()=> this.openAuthModal());
    } else {
      pa.innerHTML = `<div class="profile-logged"><img alt="" class="avatar-mini" /> <span>${escapeHTML(this.state.user.email.split('@')[0])}</span> <button id="btn-logout" class="btn">Çıkış</button></div>`;
      document.getElementById('btn-logout').addEventListener('click', async ()=> {
        await supabase.auth.signOut(); announce('Çıkış yapıldı.'); location.reload();
      });
    }
  },

  openAuthModal() {
    const modal = document.createElement('div');
    modal.className='modal';
    modal.setAttribute('aria-hidden','false');
    modal.innerHTML = `<div class="modal-content"><h2>Giriş / Kayıt</h2>
      <form id="auth-form">
        <label>E-posta<input name="email" required type="email"/></label>
        <label>Şifre<input name="password" required type="password"/></label>
        <div class="modal-actions">
          <button type="submit" class="btn primary">Giriş</button>
          <button type="button" id="auth-register" class="btn">Kayıt Ol</button>
          <button type="button" id="auth-close" class="btn">Kapat</button>
        </div>
      </form></div>`;
    document.body.appendChild(modal);
    modal.querySelector('#auth-close').addEventListener('click', ()=> { modal.remove(); });
    modal.querySelector('#auth-register').addEventListener('click', async ()=>{
      const email = modal.querySelector('[name=email]').value;
      const password = modal.querySelector('[name=password]').value;
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) return alert(error.message);
      alert('Kayıt e-postası gönderildi. Onaylayınca giriş yapabilirsiniz.');
    });
    modal.querySelector('#auth-form').addEventListener('submit', async (e)=>{
      e.preventDefault();
      const email = modal.querySelector('[name=email]').value;
      const password = modal.querySelector('[name=password]').value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) return alert(error.message);
      modal.remove();
      announce('Giriş başarılı.');
      location.reload();
    });
  },

  initRealtime() {
    // Subscribe to new posts and topics for basic notifications
    const sub = supabase.channel('public:posts')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => {
        this.onNewPost(payload.new);
      })
      .subscribe();
    this.state.subscriptions.push(sub);
  },

  onNewPost(post) {
    // increment counts, show toast
    const el = document.getElementById('notif-count');
    const curr = Number(el.textContent || 0) + 1;
    el.textContent = curr; el.style.display = curr ? 'inline-block' : 'none';
    // If on thread, append dynamically
    const page = document.body.getAttribute('data-page');
    if (page === 'thread' && location.hash.includes(post.topic_id)) {
      this.renderThread(post.topic_id);
    }
  },

  applySavedTheme() {
    const t = localStorage.getItem('forum_theme') || 'default';
    this.applyTheme(t);
  },

  cycleTheme() {
    const themes = ['default','night','dmozg'];
    const cur = localStorage.getItem('forum_theme') || 'default';
    const idx = (themes.indexOf(cur) + 1) % themes.length;
    localStorage.setItem('forum_theme', themes[idx]);
    this.applyTheme(themes[idx]);
  },

  applyTheme(name) {
    document.body.classList.remove('theme-default','theme-night','theme-dmozg');
    if (name === 'night') document.body.classList.add('theme-night');
    else if (name === 'dmozg') document.body.classList.add('theme-dmozg');
    else document.body.classList.add('theme-default');
  },

  /* Search */
  async onSearch(q) {
    if (!q) { this.searchSuggestions.innerHTML = ''; return; }
    // quick local fuzzy search in topics table
    const { data } = await supabase.from('topics').select('id,title,slug,excerpt').ilike('title', `%${q}%`).limit(10);
    let results = data || [];
    // if not many results, fallback general scan first 50 topics and compute tfidf
    if (results.length < 5) {
      const { data:all } = await supabase.from('topics').select('id,title,slug,excerpt').limit(50);
      results = (all||[]).map(t => ({score: tfidfScore(q, (t.title+' '+(t.excerpt||''))), ...t}))
        .sort((a,b)=>b.score-a.score).slice(0,8);
    }
    this.searchSuggestions.innerHTML = results.map(r=>`<div role="option" class="suggestion-item"><a href="#/id/${r.id}/${r.slug || slugify(r.title)}">${escapeHTML(r.title)}</a></div>`).join('');
    this.searchSuggestions.setAttribute('aria-hidden','false');
  },

  /* SEO JSON-LD for thread */
  generateThreadJSONLD(topic, posts) {
    const ld = {
      "@context":"https://schema.org",
      "@type":"DiscussionForumPosting",
      "headline": topic.title,
      "datePublished": topic.created_at,
      "dateModified": topic.updated_at,
      "author": { "@type":"Person", "name": topic.created_by || "Anonim" },
      "discussionUrl": location.href,
      "commentCount": posts.length,
      "mainEntity": posts.map(p=>({
        "@type":"Comment",
        "author": {"@type":"Person","name":p.user_display_name||'Anonim'},
        "dateCreated": p.created_at,
        "text": (p.body||'').slice(0,300)
      }))
    };
    const script = document.createElement('script');
    script.type='application/ld+json';
    script.textContent = JSON.stringify(ld, null, 2);
    // remove existing JSON-LD if present
    document.querySelectorAll('script[type="application/ld+json"]').forEach(s=>s.remove());
    document.head.appendChild(script);
  }
};

/* Init app when Supabase client loaded */
window.addEventListener('DOMContentLoaded', async ()=>{
  try {
    await App.init();
  } catch(err){ console.error('App init failed', err); }
});

/* Export small debugging functions to window (dev only) */
window.ForumApp = { App, supabase, slugify };
