/* tema.js — R10-like full theme behavior (ES2025)
   BAŞTA SADECE BU 3 DEĞİŞKEN OLMALIDIR:
*/
const SUPABASE_URL = "https://erygxodyxjayxszxugwp.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyeWd4b2R5eGpheXhzenh1Z3dwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0NzUxMzIsImV4cCI6MjA5ODA1MTEzMn0.uz5tbIPBXNhupJu2xpf7eKyRSWKSAvZDiodj46qISaI";
const FORMSUBMIT_MAIL = "https://cepfixpayas.github.io/X/";

/* -------------------------
   NOT: Yukarıdaki değişkenleri doldurun.
   Başka elle ayar yoktur.
   ------------------------- */

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/esm/index.js';

/* Supabase client */
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  realtime: { params: { eventsPerSecond: 50 } }
});

/* Lightweight hash router */
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
    const hash = (location.hash || '').replace(/^#/, '') || '/';
    if (hash.startsWith('/id/')) {
      const parts = hash.split('/');
      const id = parts[2];
      await App.renderThread(id);
    } else {
      await App.renderIndex();
    }
  }
};

/* Utilities */
function debounce(fn, wait=250){ let t; return (...args)=>{ clearTimeout(t); t=setTimeout(()=>fn(...args), wait); }; }
function escapeHTML(s=''){ return String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }
function slugify(s){ return String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g,'').trim().replace(/\s+/g,'-').slice(0,120); }

/* Minimal Levenshtein */
function levenshtein(a,b){ if(a===b) return 0; const m=a.length,n=b.length; if(!m) return n; if(!n) return m;
  let v0=new Array(n+1), v1=new Array(n+1);
  for(let j=0;j<=n;j++) v0[j]=j;
  for(let i=0;i<m;i++){ v1[0]=i+1; for(let j=0;j<n;j++){ const cost = a[i]===b[j]?0:1; v1[j+1]=Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost); } [v0,v1]=[v1,v0]; }
  return v0[n];
}
function tfidfScore(q, doc){ const Q = q.toLowerCase().split(/\s+/); const W = doc.toLowerCase().split(/\s+/); let sc=0;
  for(const qw of Q) if(qw) for(const w of W){ if(w.includes(qw)) sc+=2; else if(levenshtein(qw,w)<=2) sc+=1; } return sc;
}

/* Accessibility announcer */
function announce(msg){ const el=document.getElementById('a11y-live'); if(el) el.textContent=msg; }

/* Small SVG helpers (inline minimal icons) */
const ICONS = {
  like: '<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path fill="#ff4b2b" d="M12 21s-7-4.35-9-7.09C-0.28 9.13 2.5 5 6 5c1.88 0 3.08 1.02 4 2.09C11.92 6.02 13.12 5 15 5c3.5 0 6.28 4.13 3 8.91C19 16.65 12 21 12 21z"/></svg>',
  share: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0b3d91" d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7a3.01 3.01 0 000-1.4l7.02-4.11A3 3 0 1014 4a3 3 0 001.96 2.25L9 10.36a3 3 0 10.02 3.28l7.02 4.11A3 3 0 1018 16.08z"/></svg>',
  edit: '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="#0b3d91" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 000-1.42l-2.34-2.34a1.003 1.003 0 00-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>'
};

/* Main App */
const App = {
  state: {
    user: null,
    categories: [],
    topicsPage: 0,
    topicsPerPage: 10,
    subs: []
  },

  async init(){
    this.cacheDOM();
    this.bindUI();
    await this.initAuth();
    await this.loadInitial();
    Router.init();
    this.initRealtime();
    document.getElementById('copy-year').textContent = new Date().getFullYear();
    this.applyTheme(localStorage.getItem('forum_theme') || 'r10-dark');
  },

  cacheDOM(){
    this.app = document.getElementById('app');
    this.topicsEl = document.getElementById('topic-list');
    this.top10El = document.getElementById('top10-list');
    this.trendingEl = document.getElementById('trending-list');
    this.searchInput = document.getElementById('live-search');
    this.searchSuggestions = document.getElementById('search-suggestions');
    this.newTopicModal = document.getElementById('new-topic-modal');
    this.newTopicForm = document.getElementById('new-topic-form');
    this.setupWizard = document.getElementById('setup-wizard');
    this.setupForm = document.getElementById('setup-form');
  },

  bindUI(){
    document.getElementById('btn-new-topic').addEventListener('click', ()=> this.openNewTopic());
    document.getElementById('btn-theme-switcher').addEventListener('click', ()=> this.cycleTheme());
    document.getElementById('mobile-menu-toggle').addEventListener('click', e=>{
      const mm = document.getElementById('mobile-menu');
      const expanded = e.currentTarget.getAttribute('aria-expanded') === 'true';
      e.currentTarget.setAttribute('aria-expanded', !expanded);
      mm.style.display = expanded ? 'none' : 'block';
    });

    document.getElementById('load-more')?.addEventListener('click', ()=> this.loadMoreTopics());
    this.searchInput?.addEventListener('input', debounce(e=> this.onSearch(e.target.value), 220));
    this.searchInput?.addEventListener('focus', ()=> this.searchSuggestions.classList.add('visible'));
    document.addEventListener('click', e=> { if(!e.target.closest('.search-wrap')) this.searchSuggestions.classList.remove('visible'); });

    this.newTopicForm?.addEventListener('submit', async e=>{
      e.preventDefault();
      const title = document.getElementById('new-topic-title').value.trim();
      const body = document.getElementById('new-topic-body').value.trim();
      const cat = document.getElementById('new-topic-category')?.value || null;
      if(!title || !body) return alert('Başlık ve içerik gerekli.');
      await this.createTopic({ title, body, category_id: cat });
      this.closeNewTopic();
    });

    this.setupForm?.addEventListener('submit', async e=>{
      e.preventDefault();
      const fd = new FormData(e.target);
      const email = fd.get('email'); const password = fd.get('password');
      const { error } = await supabase.auth.signUp({ email, password }, { data: { role:'admin' } });
      if(error) return alert(error.message);
      localStorage.setItem('forum_setup_done','1');
      announce('Yönetici oluşturuldu. Giriş başarılı.');
      setTimeout(()=> location.reload(), 700);
    });
  },

  async initAuth(){
    try {
      const { data } = await supabase.auth.getUser();
      this.state.user = data?.user ?? null;
      this.renderProfile();
      supabase.auth.onAuthStateChange((e, session)=>{ this.state.user = session?.user ?? null; this.renderProfile(); });
    } catch(err){ console.warn('auth init', err); }
  },

  async loadInitial(){
    await Promise.all([ this.loadCategories(), this.loadStats(), this.loadTop10(), this.loadTopics(true) ]);
    const setupDone = localStorage.getItem('forum_setup_done') || false;
    if(!setupDone) this.openSetupWizard();
  },

  openSetupWizard(){ this.setupWizard?.setAttribute('aria-hidden','false'); }
  closeSetupWizard(){ this.setupWizard?.setAttribute('aria-hidden','true'); }

  ,async loadCategories(){
    try {
      const { data } = await supabase.from('categories').select('*').order('position',{ascending:true});
      this.state.categories = data || [];
      const sel = document.getElementById('new-topic-category');
      if(sel) sel.innerHTML = (data||[]).map(c=>`<option value="${escapeHTML(c.id)}">${escapeHTML(c.name)}</option>`).join('');
    } catch(e){ console.warn(e); }
  },

  async loadStats(){
    try {
      const [{ count: topics }, { count: posts }, { count: users }] = await Promise.all([
        supabase.from('threads').select('id', { count:'exact' }),
        supabase.from('posts').select('id', { count:'exact' }),
        supabase.from('profiles').select('id', { count:'exact' })
      ]);
      document.getElementById('stat-topics').textContent = topics || 0;
      document.getElementById('stat-posts').textContent = posts || 0;
      document.getElementById('stat-users').textContent = users || 0;
      // optional RPCs — safe fallback to 0
      try { const { data:today } = await supabase.rpc('count_topics_today'); document.getElementById('stat-today').textContent = today?.count || 0; } catch{}
      try { const { data:online } = await supabase.rpc('get_online_count'); document.getElementById('stat-online').textContent = online?.count || 0; } catch{}
    } catch(e){ console.warn(e); }
  },

  async loadTop10(){
    try {
      const { data } = await supabase.from('threads').select('id,title,views,slug').order('views',{ascending:false}).limit(10);
      this.top10El.innerHTML = (data||[]).map((t,i)=>`<li><a href="#/id/${t.id}/${t.slug||slugify(t.title)}">${escapeHTML(t.title)}</a><span class="count">${i+1}</span></li>`).join('');
    } catch(e){ console.warn(e); }
  },

  async loadTopics(reset=false){
    if(reset) this.state.topicsPage = 0;
    const page = this.state.topicsPage, per = this.state.topicsPerPage, from = page*per, to = from+per-1;
    try {
      const { data } = await supabase.from('threads').select('id,title,slug,content,created_at,last_post_at,views').order('last_post_at',{ascending:false}).range(from,to);
      if(reset) this.topicsEl.innerHTML = '';
      for(const t of (data||[])){
        const card = document.createElement('article');
        card.className = 'topic-card';
        card.innerHTML = /* html */`
          <div class="topic-avatar" aria-hidden="true">${escapeHTML((t.title||'')[0]||'?')}</div>
          <div class="topic-body">
            <a class="topic-title" href="#/id/${t.id}/${t.slug||slugify(t.title)}">${escapeHTML(t.title)}</a>
            <div class="topic-meta">${escapeHTML((t.content||'').slice(0,120))}</div>
            <div class="topic-stats">
              <span class="stat-pill">Görüntü: ${t.views||0}</span>
              <span class="stat-pill">Tarih: ${new Date(t.last_post_at||t.created_at).toLocaleString()}</span>
            </div>
          </div>
        `;
        this.topicsEl.appendChild(card);
      }
      this.state.topicsPage++;
    } catch(e){ console.warn(e); }
  },

  loadMoreTopics(){ this.loadTopics(); },

  async renderIndex(){ document.body.setAttribute('data-page','index'); if(!this.topicsEl.children.length) await this.loadTopics(true); },

  /* Thread rendering — R10-like horizontal postbit + content area */
  async renderThread(threadId){
    document.body.setAttribute('data-page','thread');
    try {
      const { data: threads } = await supabase.from('threads').select('*').eq('id', threadId).limit(1);
      const thread = (threads||[])[0];
      if(!thread){ this.app.innerHTML = `<div class="card"><h2>Konu bulunamadı</h2></div>`; return; }
      // increment views safely (background)
      supabase.from('threads').update({ views: (thread.views||0)+1 }).eq('id', thread.id).then(()=>{});
      const { data: posts } = await supabase.from('posts').select('*').eq('thread_id', threadId).order('created_at',{ascending:true});
      const tpl = document.getElementById('thread-template').content.cloneNode(true);
      tpl.querySelector('.thread-title').textContent = thread.title;
      tpl.querySelector('.thread-meta').textContent = `${new Date(thread.created_at).toLocaleString()} • ${escapeHTML(thread.last_post_by || '')}`;
      const postsEl = tpl.getElementById('posts');
      for(const p of (posts||[])){
        const postEl = document.createElement('article');
        postEl.className = 'post';
        postEl.innerHTML = /* html */`
          <aside class="postbit" role="complementary" aria-label="Kullanıcı bilgileri">
            <div class="post-avatar" aria-hidden="true">${escapeHTML((p.user_display_name||'U')[0]||'U')}</div>
            <div class="post-info">
              <strong class="username">${escapeHTML(p.user_display_name||'Anonim')}</strong>
              <div class="muted small">${new Date(p.created_at).toLocaleString()}</div>
              <div class="post-stats">
                <span class="stat-pill">Mesaj: ${p.post_number||1}</span>
                <span class="stat-pill">Beğeni: ${p.likes||0}</span>
              </div>
            </div>
          </aside>
          <div class="post-content">${this.renderPostBody(p)}</div>
        `;
        postsEl.appendChild(postEl);
      }
      this.app.innerHTML = '';
      this.app.appendChild(tpl);
      this.attachComposer(threadId);
      this.generateThreadJSONLD(thread, posts||[]);
    } catch(e){ console.error(e); this.app.innerHTML = `<div class="card"><h2>Hata oluştu</h2></div>`; }
  },

  renderPostBody(p){
    // support markdown-ish + bbcode minimal + sanitize
    let body = escapeHTML(p.content || p.body || '');
    body = body.replaceAll(/```([\s\S]*?)```/g, (m,code)=>`<pre><code>${escapeHTML(code)}</code></pre>`);
    body = body.replaceAll(/`([^`]+)`/g, '<code>$1</code>');
    body = body.replaceAll(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replaceAll(/\*([^*]+)\*/g,'<em>$1</em>');
    body = body.replaceAll(/\[quote\](.*?)\[\/quote\]/gis,'<blockquote>$1</blockquote>');
    body = body.replaceAll(/(https?:\/\/[^\s<]+)/g,'<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
    // footer actions (like/share)
    return `${body}
      <div class="post-actions" role="group" aria-label="İşlemler">
        <button class="btn icon" data-action="like">${ICONS.like} Beğen</button>
        <button class="btn icon" data-action="share">${ICONS.share} Paylaş</button>
        <button class="btn icon" data-action="quote">${ICONS.edit} Alıntı</button>
      </div>`;
  },

  attachComposer(threadId){
    const btnSend = document.querySelector('#btn-send');
    const quickReply = document.querySelector('#quick-reply');
    btnSend?.addEventListener('click', async ()=>{
      const text = quickReply.value.trim();
      if(!text) return alert('Mesaj boş olamaz.');
      const user = this.state.user;
      const payload = {
        thread_id: threadId,
        content: text,
        user_id: user?.id || null,
        user_display_name: user?.email?.split('@')[0] || 'Anonim'
      };
      const { data, error } = await supabase.from('posts').insert([payload]).select().single();
      if(error) { alert('Gönderilemedi: '+error.message); return; }
      // update thread last post
      await supabase.from('threads').update({ last_post_at: new Date().toISOString() }).eq('id', threadId);
      quickReply.value = '';
      announce('Cevabınız gönderildi.');
      await this.renderThread(threadId);
    });
  },

  async createTopic({ title, body, category_id }){
    const slug = slugify(title);
    const user = this.state.user;
    const payload = {
      title, slug, content: body, category_id, created_at: new Date().toISOString(),
      created_by: user?.id || null, last_post_by: user?.email?.split('@')[0] || 'Anonim'
    };
    const { data, error } = await supabase.from('threads').insert([payload]).select().single();
    if(error) return alert('Konu oluşturulamadı: '+error.message);
    await supabase.from('posts').insert([{ thread_id: data.id, content: body, user_id: user?.id || null, user_display_name: payload.last_post_by }]);
    announce('Konu oluşturuldu.');
    location.hash = `#/id/${data.id}/${data.slug}`;
  },

  openNewTopic(){ this.newTopicModal?.setAttribute('aria-hidden','false'); document.getElementById('new-topic-title')?.focus(); },
  closeNewTopic(){ this.newTopicModal?.setAttribute('aria-hidden','true'); },

  renderProfile(){
    const pa = document.getElementById('profile-area');
    if(!this.state.user){
      pa.innerHTML = `<button id="btn-login" class="btn">Giriş / Kayıt</button>`;
      document.getElementById('btn-login')?.addEventListener('click', ()=> this.openAuth());
    } else {
      pa.innerHTML = `<div class="profile-logged"><span class="avatar-mini" aria-hidden="true">${escapeHTML(this.state.user.email.split('@')[0][0]||'U')}</span><span class="username">${escapeHTML(this.state.user.email.split('@')[0])}</span><button id="btn-logout" class="btn">Çıkış</button></div>`;
      document.getElementById('btn-logout')?.addEventListener('click', async ()=> { await supabase.auth.signOut(); announce('Çıkış yapıldı.'); location.reload(); });
    }
  },

  openAuth(){
    const modal = document.createElement('div');
    modal.className='modal'; modal.setAttribute('aria-hidden','false');
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
    modal.querySelector('#auth-close')?.addEventListener('click', ()=> modal.remove());
    modal.querySelector('#auth-register')?.addEventListener('click', async ()=>{
      const email = modal.querySelector('[name=email]').value, password = modal.querySelector('[name=password]').value;
      const { error } = await supabase.auth.signUp({ email, password });
      if(error) return alert(error.message);
      alert('Kayıt e-postası gönderildi. Onaylayınca giriş yapabilirsiniz.');
    });
    modal.querySelector('#auth-form')?.addEventListener('submit', async e=>{
      e.preventDefault();
      const email = modal.querySelector('[name=email]').value, password = modal.querySelector('[name=password]').value;
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if(error) return alert(error.message);
      modal.remove(); announce('Giriş başarılı.'); location.reload();
    });
  },

  initRealtime(){
    try {
      const ch = supabase.channel('public:posts')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'posts' }, payload => this.onNewPost(payload.new))
        .subscribe();
      this.state.subs.push(ch);
    } catch(e){ console.warn(e); }
  },

  onNewPost(post){
    const el = document.getElementById('notif-count');
    const curr = Number(el.textContent || 0) + 1; el.textContent = curr; el.style.display = curr ? 'inline-block' : 'none';
    const page = document.body.getAttribute('data-page');
    if(page === 'thread' && location.hash.includes(post.thread_id || post.topic_id)) this.renderThread(post.thread_id || post.topic_id);
  },

  async onSearch(q){
    if(!q){ this.searchSuggestions.innerHTML=''; return; }
    try {
      const { data } = await supabase.from('threads').select('id,title,slug,content').ilike('title', `%${q}%`).limit(10);
      let results = data || [];
      if(results.length < 5){
        const { data:all } = await supabase.from('threads').select('id,title,slug,content').limit(50);
        results = (all||[]).map(t => ({ score: tfidfScore(q, (t.title+' '+(t.content||''))), ...t })).sort((a,b)=>b.score-a.score).slice(0,8);
      }
      this.searchSuggestions.innerHTML = (results||[]).map(r=>`<div role="option" class="suggestion-item"><a href="#/id/${r.id}/${r.slug||slugify(r.title)}">${escapeHTML(r.title)}</a></div>`).join('');
      this.searchSuggestions.setAttribute('aria-hidden','false');
    } catch(e){ console.warn(e); }
  },

  generateThreadJSONLD(thread, posts){
    const ld = { "@context":"https://schema.org", "@type":"DiscussionForumPosting", "headline": thread.title, "datePublished": thread.created_at, "dateModified": thread.last_post_at || thread.created_at, "author": {"@type":"Person","name":thread.created_by||'Anonim'}, "discussionUrl": location.href, "commentCount": (posts||[]).length, "mainEntity": (posts||[]).map(p=>({"@type":"Comment","author":{"@type":"Person","name":p.user_display_name||'Anonim'},"dateCreated":p.created_at,"text":(p.content||'').slice(0,300)})) };
    document.querySelectorAll('script[type=\"application/ld+json\"]').forEach(s=>s.remove());
    const s = document.createElement('script'); s.type='application/ld+json'; s.textContent = JSON.stringify(ld, null, 2); document.head.appendChild(s);
  },

  /* theme helpers */
  applyTheme(name){
    document.body.classList.remove('theme-r10','theme-r10-alt','theme-contrast');
    if(name === 'r10-light') document.body.classList.add('theme-r10-alt');
    else if(name === 'contrast') document.body.classList.add('theme-contrast');
    else document.body.classList.add('theme-r10');
    localStorage.setItem('forum_theme', name);
  },
  cycleTheme(){ const themes=['r10-dark','r10-light','contrast']; const cur=localStorage.getItem('forum_theme')||'r10-dark'; const idx=(themes.indexOf(cur)+1)%themes.length; this.applyTheme(themes[idx]); }

}; /* App end */

/* start */
window.addEventListener('DOMContentLoaded', async ()=>{
  try { await App.init(); } catch(err){ console.error('App init failed', err); }
});

/* expose for debugging */
window.ForumApp = { App, supabase, slugify };
