/* =================================================================
   Forum Engine Ultimate v10 — tema.js
   Vanilla JavaScript (ES2025) · Supabase · Hash Router · SPA
   -----------------------------------------------------------------
   Mimari (modüler):
     1) Config & State
     2) Utils (escape/sanitize/debounce/throttle/levenshtein/slug…)
     3) DB katmanı (Supabase  +  DEMO fallback)
     4) Auth
     5) Tema sistemi
     6) SEO (canonical / OG / JSON-LD / breadcrumb)
     7) Router
     8) Görünümler (home, kategori, thread, profil, üyeler, arama,
        bildirim, mesaj, admin, setup, statik sayfalar, 404)
     9) Postbit
    10) Realtime / Bildirim / PM
    11) Init
   ================================================================= */
(() => {
"use strict";

/* =========================================================
   1) CONFIG & STATE
   ========================================================= */
const CFG = window.CONFIG || {};
const PLACEHOLDER = (v) => !v || /^YOUR_/.test(v);
const SUPA_READY = !PLACEHOLDER(CFG.SUPABASE_URL) && !PLACEHOLDER(CFG.SUPABASE_ANON_KEY);
const DEMO = !SUPA_READY;            // Supabase ayarlı değilse demo modda çalışır
const SITE_ORIGIN = location.origin + location.pathname.replace(/index\.html$/, "");

let sb = null;                       // supabase client
if (SUPA_READY && window.supabase) {
  sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
    realtime: { params: { eventsPerSecond: 5 } }
  });
}

const State = {
  user: null,            // supabase auth user
  profile: null,         // profiles satırı
  settings: {            // admin ayarları (DB'den override edilir)
    home_limit: 10,
    similar_count: 5,
    site_name: "Forum Engine Ultimate",
    description: "Modern, hızlı, SEO uyumlu forum motoru.",
    default_theme: "midnight",
    rss_enabled: true
  },
  unread: { notif: 0, msg: 0 },
  channels: []           // realtime kanalları
};

/* =========================================================
   2) UTILS
   ========================================================= */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === "class") node.className = v;
    else if (k === "html") node.innerHTML = v;           // dikkat: yalnızca güvenli/escape edilmiş içerik
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(node.dataset, v);
    else node.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    node.append(c.nodeType ? c : document.createTextNode(c));
  }
  return node;
}

/* XSS koruması: kullanıcı içeriği her zaman escape edilir */
function escapeHTML(str = "") {
  return String(str).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* Çok temel BBCode/markdown -> güvenli HTML (önce escape, sonra izinli kalıplar) */
function renderContent(raw = "") {
  let s = escapeHTML(raw);
  s = s.replace(/\[b\]([\s\S]*?)\[\/b\]/gi, "<strong>$1</strong>")
       .replace(/\[i\]([\s\S]*?)\[\/i\]/gi, "<em>$1</em>")
       .replace(/\[u\]([\s\S]*?)\[\/u\]/gi, "<u>$1</u>")
       .replace(/\[quote(?:=([^\]]+))?\]([\s\S]*?)\[\/quote\]/gi,
                (_, who, txt) => `<blockquote>${who ? `<strong>${who}:</strong><br>` : ""}${txt}</blockquote>`)
       .replace(/\[url=(https?:\/\/[^\]\s]+)\]([\s\S]*?)\[\/url\]/gi,
                '<a href="$1" rel="nofollow noopener" target="_blank">$2</a>')
       .replace(/\[img\](https?:\/\/[^\]\s]+)\[\/img\]/gi, '<img src="$1" loading="lazy" alt="">')
       .replace(/\n/g, "<br>");
  return s;
}

function debounce(fn, ms = 300) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}
function throttle(fn, ms = 200) {
  let last = 0, timer; return (...a) => {
    const now = Date.now();
    if (now - last >= ms) { last = now; fn(...a); }
    else { clearTimeout(timer); timer = setTimeout(() => { last = Date.now(); fn(...a); }, ms - (now - last)); }
  };
}

/* Levenshtein mesafesi — benzer konu önerisi için */
function levenshtein(a = "", b = "") {
  a = a.toLowerCase(); b = b.toLowerCase();
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
    }
    prev = cur;
  }
  return prev[n];
}

function slugify(str = "") {
  const map = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", İ: "i" };
  return str.toLowerCase().replace(/[çğıöşüİ]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-").replace(/-+/g, "-").slice(0, 80) || "konu";
}

function timeAgo(date) {
  const d = new Date(date), s = (Date.now() - d.getTime()) / 1000;
  const u = [["yıl", 31536000], ["ay", 2592000], ["gün", 86400], ["saat", 3600], ["dakika", 60]];
  for (const [name, sec] of u) { const v = Math.floor(s / sec); if (v >= 1) return `${v} ${name} önce`; }
  return "az önce";
}
function fmtDate(date) { return new Date(date).toLocaleDateString("tr-TR", { year: "numeric", month: "short", day: "numeric" }); }
function nfmt(n) { return new Intl.NumberFormat("tr-TR").format(n || 0); }

function toast(msg, type = "info", ms = 3500) {
  const t = el("div", { class: `toast ${type}`, role: "status" }, msg);
  $("#toast-root").append(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 250); }, ms);
}

/* Basit istemci-taraflı rate limit (spam koruması) */
const RL = {};
function rateLimit(key, ms) {
  const now = Date.now();
  if (RL[key] && now - RL[key] < ms) return false;
  RL[key] = now; return true;
}

function avatarURL(p) {
  if (p?.avatar_url) return p.avatar_url;
  const seed = encodeURIComponent(p?.username || "user");
  return `https://api.dicebear.com/9.x/identicon/svg?seed=${seed}`;
}

/* =========================================================
   3) DB KATMANI  (Supabase  + DEMO fallback)
   ========================================================= */
const DemoStore = {
  key: "fe_demo_db_v1",
  load() {
    let db = null;
    try { db = JSON.parse(localStorage.getItem(this.key)); } catch {}
    if (!db) { db = this.seed(); this.save(db); }
    return db;
  },
  save(db) { localStorage.setItem(this.key, JSON.stringify(db)); },
  seed() {
    const now = Date.now();
    const iso = (h) => new Date(now - h * 3600e3).toISOString();
    const users = [
      { id: "u1", username: "AdminDevin", role: "admin", verified: true, online: true, job: "Yazılımcı", city: "İstanbul", country: "Türkiye", joined_at: iso(8000), post_count: 1240, thread_count: 87, likes: 980, trade_points: 320, badges: ["👑","🏆","⭐"], signature: "Forum Engine Ultimate yöneticisi.", social: { discord: "admin#0001", github: "devin", website: "https://example.com" }, postbit_layout: "vertical", avatar_url: "" },
      { id: "u2", username: "AyseK", role: "moderator", verified: true, online: false, job: "Tasarımcı", city: "Ankara", country: "Türkiye", joined_at: iso(6000), post_count: 540, thread_count: 33, likes: 410, trade_points: 120, badges: ["🛡️","⭐"], signature: "Tasarım her şeydir.", social: { github: "aysek" }, postbit_layout: "vertical", avatar_url: "" },
      { id: "u3", username: "MehmetC", role: "user", verified: false, online: true, job: "Öğrenci", city: "İzmir", country: "Türkiye", joined_at: iso(2000), post_count: 95, thread_count: 12, likes: 60, trade_points: 15, badges: ["🌱"], signature: "", social: {}, postbit_layout: "vertical", avatar_url: "" }
    ];
    const categories = [
      { id: "c1", name: "Genel", position: 1 },
      { id: "c2", name: "Yazılım & Teknoloji", position: 2 }
    ];
    const forums = [
      { id: "f1", category_id: "c1", parent_id: null, name: "Duyurular", description: "Forum duyuruları ve güncellemeler", icon: "📢", position: 1 },
      { id: "f2", category_id: "c1", parent_id: null, name: "Sohbet", description: "Serbest sohbet alanı", icon: "💬", position: 2 },
      { id: "f3", category_id: "c2", parent_id: null, name: "Web Geliştirme", description: "HTML, CSS, JavaScript ve daha fazlası", icon: "🌐", position: 1 },
      { id: "f4", category_id: "c2", parent_id: "f3", name: "JavaScript", description: "JS alt forumu", icon: "🟨", position: 1 }
    ];
    const threads = [
      { id: "t1", forum_id: "f1", user_id: "u1", title: "Forum Engine Ultimate v10 yayında!", slug: "forum-engine-ultimate-v10-yayinda", content: "Yeni sürüm [b]production ready[/b] olarak yayında. Tüm geri bildirimlerinizi bekliyoruz!", tags: ["duyuru","sürüm"], pinned: true, locked: false, views: 5400, created_at: iso(100), last_post_at: iso(2) },
      { id: "t2", forum_id: "f3", user_id: "u2", title: "Vanilla JS ile SPA nasıl yazılır?", slug: "vanilla-js-ile-spa-nasil-yazilir", content: "Modern tarayıcılarda framework olmadan SPA yazmak çok keyifli. Deneyimlerinizi paylaşın.", tags: ["javascript","spa"], pinned: false, locked: false, views: 2100, created_at: iso(60), last_post_at: iso(5) },
      { id: "t3", forum_id: "f3", user_id: "u3", title: "Vanilla JavaScript ile SPA performansı", slug: "vanilla-javascript-ile-spa-performansi", content: "SPA performansını artırmak için ipuçları arıyorum.", tags: ["javascript","performans"], pinned: false, locked: false, views: 880, created_at: iso(40), last_post_at: iso(8) },
      { id: "t4", forum_id: "f2", user_id: "u3", title: "Merhaba, ben yeniyim!", slug: "merhaba-ben-yeniyim", content: "Foruma yeni katıldım, herkese selam!", tags: ["tanışma"], pinned: false, locked: false, views: 320, created_at: iso(20), last_post_at: iso(1) }
    ];
    const posts = [
      { id: "p1", thread_id: "t1", user_id: "u1", content: "Yeni sürüm [b]production ready[/b] olarak yayında. Tüm geri bildirimlerinizi bekliyoruz!", created_at: iso(100), edited_at: null },
      { id: "p2", thread_id: "t1", user_id: "u2", content: "Harika olmuş, tebrikler! 🎉", created_at: iso(50), edited_at: null },
      { id: "p3", thread_id: "t1", user_id: "u3", content: "Realtime özelliği çok iyi çalışıyor.", created_at: iso(2), edited_at: null },
      { id: "p4", thread_id: "t2", user_id: "u2", content: "Modern tarayıcılarda framework olmadan SPA yazmak çok keyifli.", created_at: iso(60), edited_at: null },
      { id: "p5", thread_id: "t2", user_id: "u1", content: "[quote=AyseK]çok keyifli[/quote] Kesinlikle katılıyorum.", created_at: iso(5), edited_at: null }
    ];
    return {
      users, categories, forums, threads, posts,
      likes: [], follows: [], favorites: [], saves: [],
      notifications: [], messages: [],
      badges: [ { id: "b1", name: "Kurucu", icon: "👑", description: "İlk yönetici" }, { id: "b2", name: "Yeni Üye", icon: "🌱", description: "Foruma yeni katıldı" } ],
      trade_log: [], logs: [], bans: [],
      settings: {}, session: null
    };
  }
};

/* DB: tüm okuma/yazma tek arayüzden */
const DB = {
  /* --- AYARLAR --- */
  async loadSettings() {
    if (DEMO) { const db = DemoStore.load(); Object.assign(State.settings, db.settings || {}); return State.settings; }
    const { data } = await sb.from("settings").select("key,value");
    (data || []).forEach((r) => { try { State.settings[r.key] = JSON.parse(r.value); } catch { State.settings[r.key] = r.value; } });
    return State.settings;
  },
  async saveSetting(key, value) {
    if (DEMO) { const db = DemoStore.load(); db.settings[key] = value; DemoStore.save(db); State.settings[key] = value; return; }
    await sb.from("settings").upsert({ key, value: JSON.stringify(value) });
    State.settings[key] = value;
  },

  /* --- KATEGORİ / FORUM --- */
  async getCategories() {
    if (DEMO) { const db = DemoStore.load(); return db.categories.sort((a, b) => a.position - b.position); }
    const { data } = await sb.from("categories").select("*").order("position");
    return data || [];
  },
  async getForums() {
    if (DEMO) { const db = DemoStore.load(); return db.forums.sort((a, b) => a.position - b.position); }
    const { data } = await sb.from("forums").select("*").order("position");
    return data || [];
  },
  async getForum(id) {
    if (DEMO) return DemoStore.load().forums.find((f) => f.id === id) || null;
    const { data } = await sb.from("forums").select("*").eq("id", id).single();
    return data;
  },

  /* --- KONULAR --- */
  async getThreads({ forumId = null, limit = 20, offset = 0, sort = "last" } = {}) {
    if (DEMO) {
      const db = DemoStore.load();
      let rows = db.threads.slice();
      if (forumId) rows = rows.filter((t) => t.forum_id === forumId);
      rows.sort((a, b) => (b.pinned - a.pinned) || (new Date(b[sort === "new" ? "created_at" : sort === "views" ? "created_at" : "last_post_at"]) - new Date(a[sort === "new" ? "created_at" : "last_post_at"])));
      if (sort === "views") rows.sort((a, b) => (b.pinned - a.pinned) || (b.views - a.views));
      if (sort === "popular") rows.sort((a, b) => (b.pinned - a.pinned) || (this._replyCount(db, b.id) - this._replyCount(db, a.id)));
      const total = rows.length;
      return { rows: rows.slice(offset, offset + limit).map((t) => this._enrichThread(db, t)), total };
    }
    let q = sb.from("threads").select("*, profiles(*), forums(name,slug)", { count: "exact" });
    if (forumId) q = q.eq("forum_id", forumId);
    if (sort === "views") q = q.order("pinned", { ascending: false }).order("views", { ascending: false });
    else if (sort === "new") q = q.order("pinned", { ascending: false }).order("created_at", { ascending: false });
    else q = q.order("pinned", { ascending: false }).order("last_post_at", { ascending: false });
    q = q.range(offset, offset + limit - 1);
    const { data, count } = await q;
    return { rows: data || [], total: count || 0 };
  },
  _replyCount(db, tid) { return db.posts.filter((p) => p.thread_id === tid).length; },
  _enrichThread(db, t) {
    const author = db.users.find((u) => u.id === t.user_id);
    const replies = this._replyCount(db, t.id);
    const lastPost = db.posts.filter((p) => p.thread_id === t.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
    const lastUser = lastPost ? db.users.find((u) => u.id === lastPost.user_id) : author;
    return { ...t, profiles: author, reply_count: Math.max(0, replies - 1), last_user: lastUser };
  },
  async getThread(id) {
    if (DEMO) { const db = DemoStore.load(); const t = db.threads.find((x) => x.id === id); return t ? this._enrichThread(db, t) : null; }
    const { data } = await sb.from("threads").select("*, profiles(*), forums(*)").eq("id", id).single();
    return data;
  },
  async createThread({ forum_id, title, content, tags }) {
    if (DEMO) {
      const db = DemoStore.load();
      const id = "t" + (db.threads.length + 1) + Date.now().toString(36);
      const t = { id, forum_id, user_id: State.profile.id, title, slug: slugify(title), content, tags: tags || [], pinned: false, locked: false, views: 0, created_at: new Date().toISOString(), last_post_at: new Date().toISOString() };
      db.threads.push(t);
      db.posts.push({ id: "p" + Date.now(), thread_id: id, user_id: State.profile.id, content, created_at: t.created_at, edited_at: null });
      DemoStore.save(db); return t;
    }
    const slug = slugify(title);
    const { data, error } = await sb.from("threads").insert({ forum_id, user_id: State.user.id, title, slug, content, tags }).select().single();
    if (error) throw error;
    await sb.from("posts").insert({ thread_id: data.id, user_id: State.user.id, content });
    return data;
  },
  async incrementViews(id) {
    if (DEMO) { const db = DemoStore.load(); const t = db.threads.find((x) => x.id === id); if (t) { t.views++; DemoStore.save(db); } return; }
    await sb.rpc("increment_views", { thread_id: id }).then(() => {}).catch(() => {});
  },
  async deleteThread(id) {
    if (DEMO) { const db = DemoStore.load(); db.threads = db.threads.filter((t) => t.id !== id); db.posts = db.posts.filter((p) => p.thread_id !== id); DemoStore.save(db); return; }
    await sb.from("threads").delete().eq("id", id);
  },

  /* --- POSTLAR --- */
  async getPosts(threadId) {
    if (DEMO) {
      const db = DemoStore.load();
      return db.posts.filter((p) => p.thread_id === threadId)
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((p) => ({ ...p, profiles: db.users.find((u) => u.id === p.user_id), like_count: db.likes.filter((l) => l.post_id === p.id).length }));
    }
    const { data } = await sb.from("posts").select("*, profiles(*), likes(count)").eq("thread_id", threadId).order("created_at");
    return (data || []).map((p) => ({ ...p, like_count: p.likes?.[0]?.count || 0 }));
  },
  async createPost({ thread_id, content }) {
    if (DEMO) {
      const db = DemoStore.load();
      const p = { id: "p" + Date.now(), thread_id, user_id: State.profile.id, content, created_at: new Date().toISOString(), edited_at: null };
      db.posts.push(p);
      const t = db.threads.find((x) => x.id === thread_id); if (t) t.last_post_at = p.created_at;
      DemoStore.save(db); return { ...p, profiles: State.profile };
    }
    const { data, error } = await sb.from("posts").insert({ thread_id, user_id: State.user.id, content }).select("*, profiles(*)").single();
    if (error) throw error;
    await sb.from("threads").update({ last_post_at: new Date().toISOString() }).eq("id", thread_id);
    return data;
  },
  async updatePost(id, content) {
    if (DEMO) { const db = DemoStore.load(); const p = db.posts.find((x) => x.id === id); if (p) { p.content = content; p.edited_at = new Date().toISOString(); } DemoStore.save(db); return; }
    await sb.from("posts").update({ content, edited_at: new Date().toISOString() }).eq("id", id);
  },
  async deletePost(id) {
    if (DEMO) { const db = DemoStore.load(); db.posts = db.posts.filter((p) => p.id !== id); DemoStore.save(db); return; }
    await sb.from("posts").delete().eq("id", id);
  },
  async toggleLike(postId) {
    if (DEMO) {
      const db = DemoStore.load(); const uid = State.profile.id;
      const i = db.likes.findIndex((l) => l.post_id === postId && l.user_id === uid);
      if (i >= 0) db.likes.splice(i, 1); else db.likes.push({ id: "l" + Date.now(), post_id: postId, user_id: uid });
      DemoStore.save(db); return i < 0;
    }
    const { data } = await sb.from("likes").select("id").eq("post_id", postId).eq("user_id", State.user.id).maybeSingle();
    if (data) { await sb.from("likes").delete().eq("id", data.id); return false; }
    await sb.from("likes").insert({ post_id: postId, user_id: State.user.id }); return true;
  },

  /* --- BENZER KONULAR (Levenshtein) --- */
  async similarThreads(thread, limit) {
    let pool;
    if (DEMO) { const db = DemoStore.load(); pool = db.threads.filter((t) => t.id !== thread.id); }
    else { const { data } = await sb.from("threads").select("id,title,slug,forum_id").neq("id", thread.id).limit(200); pool = data || []; }
    const scored = pool.map((t) => {
      const dist = levenshtein(t.slug || slugify(t.title), thread.slug || slugify(thread.title));
      const maxLen = Math.max((t.title || "").length, (thread.title || "").length, 1);
      return { t, score: 1 - dist / maxLen };
    }).filter((x) => x.score > 0.25).sort((a, b) => b.score - a.score).slice(0, limit);
    return scored.map((x) => x.t);
  },

  /* --- ARAMA --- */
  async search(term) {
    const q = term.trim().toLowerCase();
    if (!q) return { threads: [], users: [] };
    if (DEMO) {
      const db = DemoStore.load();
      const threads = db.threads.filter((t) =>
        t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q) ||
        (t.tags || []).some((tag) => tag.toLowerCase().includes(q))).slice(0, 20).map((t) => this._enrichThread(db, t));
      const users = db.users.filter((u) => u.username.toLowerCase().includes(q)).slice(0, 8);
      return { threads, users };
    }
    const [{ data: th }, { data: us }] = await Promise.all([
      sb.from("threads").select("*, forums(name)").or(`title.ilike.%${q}%,content.ilike.%${q}%`).limit(20),
      sb.from("profiles").select("*").ilike("username", `%${q}%`).limit(8)
    ]);
    return { threads: th || [], users: us || [] };
  },

  /* --- PROFİL / ÜYELER --- */
  async getProfile(idOrName) {
    if (DEMO) { const db = DemoStore.load(); return db.users.find((u) => u.id === idOrName || u.username === idOrName) || null; }
    let q = sb.from("profiles").select("*");
    q = /-/.test(idOrName) ? q.eq("id", idOrName) : q.eq("username", idOrName);
    const { data } = await q.maybeSingle(); return data;
  },
  async getMembers({ limit = 30, offset = 0 } = {}) {
    if (DEMO) { const db = DemoStore.load(); return { rows: db.users.slice(offset, offset + limit), total: db.users.length }; }
    const { data, count } = await sb.from("profiles").select("*", { count: "exact" }).order("post_count", { ascending: false }).range(offset, offset + limit - 1);
    return { rows: data || [], total: count || 0 };
  },
  async updateProfile(patch) {
    if (DEMO) { const db = DemoStore.load(); Object.assign(State.profile, patch); const u = db.users.find((x) => x.id === State.profile.id); if (u) Object.assign(u, patch); DemoStore.save(db); return; }
    await sb.from("profiles").update(patch).eq("id", State.user.id);
    Object.assign(State.profile, patch);
  },

  /* --- BİLDİRİM --- */
  async getNotifications() {
    if (DEMO) { const db = DemoStore.load(); return db.notifications.filter((n) => n.user_id === State.profile?.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)); }
    const { data } = await sb.from("notifications").select("*").eq("user_id", State.user.id).order("created_at", { ascending: false }).limit(50);
    return data || [];
  },
  async markNotifRead(id) {
    if (DEMO) { const db = DemoStore.load(); const n = db.notifications.find((x) => x.id === id); if (n) n.read = true; DemoStore.save(db); return; }
    await sb.from("notifications").update({ read: true }).eq("id", id);
  },

  /* --- MESAJ --- */
  async getMessages(folder = "inbox") {
    if (DEMO) {
      const db = DemoStore.load(); const uid = State.profile?.id;
      let rows = db.messages.filter((m) => folder === "outbox" ? m.from_id === uid : (m.to_id === uid && (folder === "archive" ? m.archived : !m.archived)));
      return rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).map((m) => ({ ...m, from: db.users.find((u) => u.id === m.from_id), to: db.users.find((u) => u.id === m.to_id) }));
    }
    const uid = State.user.id;
    let q = sb.from("messages").select("*, from:from_id(*), to:to_id(*)");
    if (folder === "outbox") q = q.eq("from_id", uid);
    else q = q.eq("to_id", uid).eq("archived", folder === "archive");
    const { data } = await q.order("created_at", { ascending: false });
    return data || [];
  },
  async sendMessage({ to_id, subject, body }) {
    if (DEMO) { const db = DemoStore.load(); db.messages.push({ id: "m" + Date.now(), from_id: State.profile.id, to_id, subject, body, read: false, archived: false, created_at: new Date().toISOString() }); DemoStore.save(db); return; }
    await sb.from("messages").insert({ from_id: State.user.id, to_id, subject, body });
  },

  /* --- İSTATİSTİK --- */
  async getStats() {
    if (DEMO) {
      const db = DemoStore.load();
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      return {
        topics: db.threads.length, posts: db.posts.length, members: db.users.length,
        today: db.threads.filter((t) => new Date(t.created_at) >= todayStart).length,
        online: db.users.filter((u) => u.online).length,
        last_member: db.users[db.users.length - 1]?.username || "—"
      };
    }
    const [t, p, m] = await Promise.all([
      sb.from("threads").select("id", { count: "exact", head: true }),
      sb.from("posts").select("id", { count: "exact", head: true }),
      sb.from("profiles").select("id", { count: "exact", head: true })
    ]);
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const { count: today } = await sb.from("threads").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString());
    const { data: last } = await sb.from("profiles").select("username").order("joined_at", { ascending: false }).limit(1).maybeSingle();
    const { count: online } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("online", true);
    return { topics: t.count || 0, posts: p.count || 0, members: m.count || 0, today: today || 0, online: online || 0, last_member: last?.username || "—" };
  },

  /* --- HOME WIDGET'LARI --- */
  async homeWidgets(limit) {
    if (DEMO) {
      const db = DemoStore.load();
      const enr = (t) => this._enrichThread(db, t);
      const byDate = [...db.threads].sort((a, b) => new Date(b.last_post_at) - new Date(a.last_post_at));
      return {
        latest: byDate.slice(0, limit).map(enr),
        trending: [...db.threads].sort((a, b) => this._replyCount(db, b.id) - this._replyCount(db, a.id)).slice(0, limit).map(enr),
        mostViewed: [...db.threads].sort((a, b) => b.views - a.views).slice(0, limit).map(enr),
        pinned: db.threads.filter((t) => t.pinned).map(enr),
        recentPosts: [...db.posts].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, limit).map((p) => ({ ...p, profiles: db.users.find((u) => u.id === p.user_id), thread: db.threads.find((t) => t.id === p.thread_id) })),
        newMembers: [...db.users].sort((a, b) => new Date(b.joined_at) - new Date(a.joined_at)).slice(0, 5)
      };
    }
    const lim = limit;
    const [{ data: latest }, { data: viewed }, { data: pinned }, { data: rp }, { data: nm }] = await Promise.all([
      sb.from("threads").select("*, profiles(*)").order("last_post_at", { ascending: false }).limit(lim),
      sb.from("threads").select("*, profiles(*)").order("views", { ascending: false }).limit(lim),
      sb.from("threads").select("*, profiles(*)").eq("pinned", true).limit(lim),
      sb.from("posts").select("*, profiles(*), threads(title,slug,forum_id)").order("created_at", { ascending: false }).limit(lim),
      sb.from("profiles").select("*").order("joined_at", { ascending: false }).limit(5)
    ]);
    return { latest: latest || [], trending: latest || [], mostViewed: viewed || [], pinned: pinned || [], recentPosts: rp || [], newMembers: nm || [] };
  },

  /* --- ADMIN: LOG --- */
  async log(action, detail) {
    if (DEMO) { const db = DemoStore.load(); db.logs.unshift({ id: "g" + Date.now(), action, detail, user: State.profile?.username || "sistem", created_at: new Date().toISOString() }); DemoStore.save(db); return; }
    await sb.from("logs").insert({ action, detail, user_id: State.user?.id }).then(() => {}).catch(() => {});
  }
};

/* =========================================================
   4) AUTH
   ========================================================= */
const Auth = {
  isAdmin() { return State.profile?.role === "admin"; },
  isMod() { return ["admin", "moderator"].includes(State.profile?.role); },
  isLogged() { return !!State.profile; },

  async init() {
    if (DEMO) {
      const db = DemoStore.load();
      if (db.session) { State.profile = db.users.find((u) => u.id === db.session) || null; State.user = State.profile ? { id: State.profile.id } : null; }
      return;
    }
    const { data: { session } } = await sb.auth.getSession();
    if (session) { State.user = session.user; await this.loadProfile(); }
    sb.auth.onAuthStateChange(async (_e, s) => {
      State.user = s?.user || null;
      if (State.user) await this.loadProfile(); else State.profile = null;
      renderHeaderUser();
    });
  },
  async loadProfile() {
    const { data } = await sb.from("profiles").select("*").eq("id", State.user.id).maybeSingle();
    State.profile = data;
    if (data) sb.from("profiles").update({ online: true }).eq("id", data.id).then(() => {});
  },

  async register({ username, email, password }) {
    if (DEMO) {
      const db = DemoStore.load();
      if (db.users.some((u) => u.username === username)) throw new Error("Kullanıcı adı dolu.");
      const id = "u" + (db.users.length + 1) + Date.now().toString(36);
      const u = { id, username, role: "user", verified: false, online: true, joined_at: new Date().toISOString(), post_count: 0, thread_count: 0, likes: 0, trade_points: 0, badges: ["🌱"], signature: "", social: {}, postbit_layout: "vertical", avatar_url: "", email };
      db.users.push(u); db.session = id; DemoStore.save(db);
      State.profile = u; State.user = { id }; return u;
    }
    const { data, error } = await sb.auth.signUp({ email, password, options: { data: { username } } });
    if (error) throw error;
    if (data.user) await sb.from("profiles").upsert({ id: data.user.id, username, role: "user", joined_at: new Date().toISOString() });
    return data.user;
  },
  async login({ email, password }) {
    if (DEMO) {
      const db = DemoStore.load();
      const u = db.users.find((x) => x.email === email || x.username === email);
      if (!u) throw new Error("Kullanıcı bulunamadı (demo).");
      db.session = u.id; DemoStore.save(db); State.profile = u; State.user = { id: u.id }; return u;
    }
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await this.loadProfile();
  },
  async logout() {
    if (DEMO) { const db = DemoStore.load(); db.session = null; DemoStore.save(db); }
    else { if (State.user) await sb.from("profiles").update({ online: false }).eq("id", State.user.id); await sb.auth.signOut(); }
    State.user = null; State.profile = null; renderHeaderUser(); router();
  },
  /* Forgot password — FormSubmit entegrasyonu */
  async forgotPassword(email) {
    if (!SUPA_READY) { // demo: yalnızca FormSubmit bildirimi
      return this._formSubmit(email);
    }
    await sb.auth.resetPasswordForEmail(email, { redirectTo: SITE_ORIGIN });
    await this._formSubmit(email); // ayrıca admin'e bilgi maili
  },
  async _formSubmit(email) {
    const mail = CFG.FORMSUBMIT_MAIL;
    if (PLACEHOLDER(mail)) return;
    try {
      await fetch(`https://formsubmit.co/ajax/${encodeURIComponent(mail)}`, {
        method: "POST", headers: { "Content-Type": "application/json", "Accept": "application/json" },
        body: JSON.stringify({ _subject: "Şifre sıfırlama talebi", email, site: SITE_ORIGIN, time: new Date().toISOString() })
      });
    } catch (e) { /* sessizce geç */ }
  }
};

/* =========================================================
   5) TEMA SİSTEMİ
   ========================================================= */
const THEMES = [
  { id: "midnight", name: "Gece Mavisi", cls: "sw-midnight" },
  { id: "blackgreen", name: "Siyah Yeşil", cls: "sw-blackgreen" },
  { id: "red", name: "Kırmızı", cls: "sw-red" },
  { id: "dmoz", name: "DMOZ Yeşili", cls: "sw-dmoz" }
];
function applyTheme(id) {
  if (!THEMES.some((t) => t.id === id)) id = "midnight";
  document.documentElement.dataset.theme = id;
  localStorage.setItem("fe_theme", id);
  $("#footer-themes") && renderFooterThemes();
  if (State.profile) DB.updateProfile({ theme: id }).catch(() => {});
}
function initTheme() {
  const saved = localStorage.getItem("fe_theme") || State.profile?.theme || State.settings.default_theme || "midnight";
  applyTheme(saved);
}
function cycleTheme() {
  const cur = document.documentElement.dataset.theme;
  const i = THEMES.findIndex((t) => t.id === cur);
  applyTheme(THEMES[(i + 1) % THEMES.length].id);
  toast(`Tema: ${THEMES[(i + 1) % THEMES.length].name}`, "info", 1500);
}
function renderFooterThemes() {
  const wrap = $("#footer-themes"); if (!wrap) return;
  wrap.innerHTML = "";
  THEMES.forEach((t) => {
    const s = el("span", { class: `theme-swatch ${t.cls}` + (document.documentElement.dataset.theme === t.id ? " active" : ""), title: t.name, role: "button", tabindex: "0", "aria-label": t.name });
    s.addEventListener("click", () => applyTheme(t.id));
    s.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); applyTheme(t.id); } });
    wrap.append(s);
  });
}

/* =========================================================
   6) SEO
   ========================================================= */
const SEO = {
  set({ title, description, path = "", image = "", jsonld = null }) {
    const full = State.settings.site_name || "Forum Engine Ultimate";
    document.title = title ? `${title} — ${full}` : full;
    const url = SITE_ORIGIN + (path.startsWith("#") ? path : "");
    const desc = description || State.settings.description;
    const img = image || (SITE_ORIGIN + "icon.png");
    const set = (id, attr, val) => { const n = $("#" + id); if (n) n.setAttribute(attr, val); };
    set("canonical-link", "href", url);
    set("hreflang-tr", "href", url); set("hreflang-default", "href", url);
    $('meta[name="description"]')?.setAttribute("content", desc);
    set("og-title", "content", title || full); set("og-desc", "content", desc);
    set("og-url", "content", url); set("og-image", "content", img);
    set("tw-title", "content", title || full); set("tw-desc", "content", desc); set("tw-image", "content", img);
    $("#ld-page").textContent = jsonld ? JSON.stringify(jsonld) : "";
  },
  breadcrumb(items) {
    const bc = $("#breadcrumb");
    if (!items || !items.length) { bc.hidden = true; bc.innerHTML = ""; return; }
    bc.hidden = false; bc.innerHTML = "";
    items.forEach((it, i) => {
      if (i) bc.append(el("span", { class: "sep" }, "›"));
      bc.append(it.href ? el("a", { href: it.href }, it.label) : el("span", {}, it.label));
    });
    // BreadcrumbList JSON-LD
    return {
      "@type": "BreadcrumbList",
      itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.label, item: it.href ? SITE_ORIGIN + it.href : SITE_ORIGIN }))
    };
  }
};

/* =========================================================
   7) ROUTER (hash tabanlı — GitHub Pages uyumlu)
   SEO URL deseni: #/id/kategori/konu-slug.html
   ========================================================= */
const Routes = [];
function route(pattern, handler) {
  const keys = [];
  const rx = new RegExp("^" + pattern.replace(/:[^/]+/g, (m) => { keys.push(m.slice(1)); return "([^/]+)"; }).replace(/\*/g, ".*") + "$");
  Routes.push({ rx, keys, handler });
}

route("#/", viewHome);
route("", viewHome);
route("#/uyeler", viewMembers);
route("#/arama", viewSearch);
route("#/arama/:q", viewSearch);
route("#/bildirimler", viewNotifications);
route("#/mesajlar", viewMessages);
route("#/profil/:name", viewProfile);
route("#/kategori/:id", viewCategory);
route("#/forum/:id", viewCategory);
route("#/admin", viewAdmin);
route("#/admin/:section", viewAdmin);
route("#/kurallar", () => viewStatic("Kurallar", RULES_HTML));
route("#/sss", () => viewStatic("Sıkça Sorulan Sorular", FAQ_HTML));
route("#/iletisim", viewContact);
route("#/:id/:cat/:slug", viewThread);     // SEO thread URL

function navigate(hash) { location.hash = hash; }

async function router() {
  const hash = location.hash || "#/";
  window.scrollTo({ top: 0, behavior: "instant" in document.documentElement.style ? "instant" : "auto" });
  // Setup wizard gerekli mi?
  if (await needsSetup()) return viewSetup();
  for (const r of Routes) {
    const m = hash.match(r.rx);
    if (m) {
      const params = {}; r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1] || "")));
      try { await r.handler(params); } catch (e) { console.error(e); view404(); }
      closeAllMenus();
      return;
    }
  }
  view404();
}

/* =========================================================
   8) GÖRÜNÜMLER
   ========================================================= */
const App = () => $("#app-view");
function setView(node) { const a = App(); a.innerHTML = ""; a.append(node); }
function loadingView() { setView(el("div", { class: "panel" }, el("div", { class: "panel-body center" }, el("span", { class: "loader" })))); }

/* ---- ANA SAYFA ---- */
async function viewHome() {
  loadingView();
  SEO.breadcrumb(null);
  const [cats, forums, stats, w] = await Promise.all([DB.getCategories(), DB.getForums(), DB.getStats(), DB.homeWidgets(State.settings.home_limit)]);
  refreshFooterStats(stats);
  SEO.set({
    title: "", path: "#/",
    jsonld: { "@context": "https://schema.org", "@type": "CollectionPage", name: State.settings.site_name, url: SITE_ORIGIN, description: State.settings.description }
  });

  const wrap = el("div", { class: "home-grid" });
  const main = el("div", {});
  const side = el("div", { class: "home-side" });

  // İstatistik şeridi
  main.append(el("div", { class: "panel" },
    el("div", { class: "panel-head" }, el("h2", {}, "📊 Forum İstatistikleri")),
    el("div", { class: "panel-body" },
      el("div", { class: "stat-strip" },
        statCard(stats.topics, "Konu"), statCard(stats.posts, "Mesaj"), statCard(stats.members, "Üye"),
        statCard(stats.today, "Bugün"), statCard(stats.online, "Çevrim İçi")))));

  // Forum index
  cats.forEach((c) => {
    const block = el("div", { class: "cat-block" }, el("div", { class: "cat-title" }, "📁 " + c.name));
    const subForums = forums.filter((f) => f.category_id === c.id && !f.parent_id);
    if (!subForums.length) block.append(el("div", { class: "forum-row" }, el("div", {}), el("div", { class: "muted" }, "Bu kategoride forum yok.")));
    subForums.forEach((f) => block.append(forumRow(f, forums)));
    main.append(block);
  });

  // Yan widget'lar
  side.append(widgetList("🆕 Son Konular", w.latest, threadMini));
  side.append(widgetList("🔥 Trend Konular", w.trending, threadMini));
  side.append(widgetList("👁️ En Çok Görüntülenen", w.mostViewed, threadMini));
  if (w.pinned.length) side.append(widgetList("📌 Sabit Konular", w.pinned, threadMini));
  side.append(widgetList("💬 Son Yorumlar", w.recentPosts, postMini));
  side.append(widgetList("🙋 Yeni Üyeler", w.newMembers, memberMini));

  wrap.append(main, side);
  setView(wrap);
}
function statCard(num, lbl) { return el("div", { class: "stat" }, el("div", { class: "num" }, nfmt(num)), el("div", { class: "lbl" }, lbl)); }

function forumRow(f, forums) {
  const subs = forums.filter((x) => x.parent_id === f.id);
  const row = el("a", { class: "forum-row", href: `#/forum/${f.id}` });
  row.append(el("div", { class: "f-icon unread" }, f.icon || "📁"));
  const mid = el("div", {},
    el("div", { class: "f-name" }, f.name),
    el("div", { class: "f-desc" }, f.description || ""));
  if (subs.length) {
    const sub = el("div", { class: "f-sub" });
    subs.forEach((s) => { const a = el("a", { href: `#/forum/${s.id}`, onclick: (e) => e.stopPropagation() }, (s.icon || "") + " " + s.name); sub.append(a); });
    mid.append(sub);
  }
  row.append(mid);
  row.append(el("div", { class: "f-stats" }, el("b", {}, "—"), "konu"));
  row.append(el("div", { class: "f-last muted" }, "Son mesajlar forumda"));
  return row;
}

function widgetList(title, items, render) {
  const ul = el("ul", { class: "mini-list" });
  if (!items?.length) ul.append(el("li", { class: "muted" }, "Kayıt yok."));
  else items.forEach((it) => ul.append(render(it)));
  return el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, title)), el("div", { class: "panel-body" }, ul));
}
function threadMini(t) {
  return el("li", {},
    el("img", { src: avatarURL(t.profiles), alt: "", loading: "lazy" }),
    el("div", {},
      el("a", { class: "mini-title", href: threadURL(t) }, t.title),
      el("div", { class: "mini-meta" }, `${t.profiles?.username || "?"} · ${timeAgo(t.last_post_at || t.created_at)} · 👁️ ${nfmt(t.views)}`)));
}
function postMini(p) {
  const t = p.thread || p.threads;
  return el("li", {},
    el("img", { src: avatarURL(p.profiles), alt: "", loading: "lazy" }),
    el("div", {},
      el("a", { class: "mini-title", href: t ? threadURL(t) : "#/" }, (t?.title || "Konu")),
      el("div", { class: "mini-meta" }, `${p.profiles?.username || "?"} · ${timeAgo(p.created_at)}`)));
}
function memberMini(u) {
  return el("li", {},
    el("img", { src: avatarURL(u), alt: "", loading: "lazy" }),
    el("div", {},
      el("a", { class: "mini-title", href: `#/profil/${encodeURIComponent(u.username)}` }, u.username + (u.verified ? " " : "")),
      el("div", { class: "mini-meta" }, "Katıldı: " + fmtDate(u.joined_at))));
}

function threadURL(t) {
  // SEO: #/id/kategori/konu-slug.html
  return `#/${t.id}/${t.forum_id || "genel"}/${t.slug || slugify(t.title)}.html`;
}

/* ---- KATEGORİ / FORUM (konu listesi) ---- */
let catState = { offset: 0, limit: 20, sort: "last", forumId: null };
async function viewCategory({ id }) {
  loadingView();
  const forum = await DB.getForum(id);
  if (!forum) return view404();
  catState = { offset: 0, limit: 20, sort: "last", forumId: id };
  const cats = await DB.getCategories();
  const cat = cats.find((c) => c.id === forum.category_id);
  const bcLd = SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, cat && { label: cat.name }, { label: forum.name }].filter(Boolean));
  SEO.set({
    title: forum.name, description: forum.description, path: `#/forum/${id}`,
    jsonld: { "@context": "https://schema.org", "@graph": [bcLd, { "@type": "CollectionPage", name: forum.name, description: forum.description }] }
  });

  const head = el("div", { class: "panel" },
    el("div", { class: "panel-head" },
      el("h2", {}, (forum.icon || "📁") + " " + forum.name),
      el("button", { class: "btn btn-primary btn-sm", onclick: () => openNewTopic(id) }, "✏️ Yeni Konu")));

  const toolbar = el("div", { class: "row spread", style: "margin:0 0 12px" },
    el("div", { class: "row" },
      sortBtn("last", "Son Mesaj"), sortBtn("new", "Yeni"), sortBtn("views", "Görüntülenme"), sortBtn("popular", "Popüler")),
    el("span", { class: "muted", id: "thread-count" }, ""));

  const list = el("ul", { class: "thread-list", id: "thread-list" });
  const wrap = el("div", {}, head, toolbar, el("div", { class: "panel" }, list), el("div", { class: "load-more-wrap", id: "load-more-wrap" }));
  setView(wrap);
  await loadThreadPage(true);

  function sortBtn(key, label) {
    return el("button", { class: "btn btn-sm" + (catState.sort === key ? " btn-primary" : ""), onclick: async () => { catState.sort = key; catState.offset = 0; $("#thread-list").innerHTML = ""; await loadThreadPage(true); $$(".row .btn-sm").forEach((b) => b.classList.remove("btn-primary")); } }, label);
  }
}
async function loadThreadPage(reset) {
  const { rows, total } = await DB.getThreads({ forumId: catState.forumId, limit: catState.limit, offset: catState.offset, sort: catState.sort });
  const list = $("#thread-list");
  if (reset && !rows.length) list.append(el("li", { class: "empty-state" }, el("div", { class: "big" }, "🗒️"), el("div", {}, "Henüz konu yok. İlk konuyu sen aç!")));
  rows.forEach((t) => list.append(threadRow(t)));
  catState.offset += rows.length;
  $("#thread-count") && ($("#thread-count").textContent = `${nfmt(total)} konu`);
  const lm = $("#load-more-wrap"); lm.innerHTML = "";
  if (catState.offset < total) lm.append(el("button", { class: "btn", onclick: () => loadThreadPage(false) }, "Daha Fazla Yükle"));
}
function threadRow(t) {
  const li = el("li", { class: "thread-item" });
  li.append(el("div", { class: "ti-icon" }, t.pinned ? "📌" : t.locked ? "🔒" : "🗨️"));
  const badges = el("span", { class: "ti-badges" });
  if (t.pinned) badges.append(el("span", { class: "tag pinned" }, "Sabit"));
  if (t.locked) badges.append(el("span", { class: "tag locked" }, "Kilitli"));
  (t.tags || []).slice(0, 3).forEach((tg) => badges.append(el("span", { class: "tag" }, tg)));
  li.append(el("div", {},
    el("a", { class: "ti-title", href: threadURL(t) }, t.title), badges,
    el("div", { class: "ti-meta" }, `${t.profiles?.username || "?"} · ${timeAgo(t.created_at)}`)));
  li.append(el("div", { class: "ti-stats" }, el("b", {}, nfmt(t.reply_count ?? 0)), el("div", {}, "cevap"), el("b", {}, nfmt(t.views)), el("div", {}, "görüntüleme")));
  li.append(el("div", { class: "ti-last muted" }, `${(t.last_user || t.profiles)?.username || ""}`, el("br"), timeAgo(t.last_post_at || t.created_at)));
  return li;
}

/* ---- THREAD SAYFASI ---- */
async function viewThread({ id }) {
  loadingView();
  const thread = await DB.getThread(id);
  if (!thread) return view404();
  DB.incrementViews(id);
  const [posts, forum, similar] = await Promise.all([DB.getPosts(id), DB.getForum(thread.forum_id), DB.similarThreads(thread, State.settings.similar_count)]);

  const bcLd = SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, forum && { label: forum.name, href: `#/forum/${forum.id}` }, { label: thread.title }].filter(Boolean));
  const author = thread.profiles;
  SEO.set({
    title: thread.title,
    description: (thread.content || "").replace(/\[[^\]]+\]/g, "").slice(0, 160),
    path: threadURL(thread),
    jsonld: {
      "@context": "https://schema.org",
      "@graph": [
        bcLd,
        {
          "@type": "DiscussionForumPosting", headline: thread.title, articleBody: thread.content,
          datePublished: thread.created_at, url: SITE_ORIGIN + threadURL(thread),
          author: { "@type": "Person", name: author?.username || "Üye" },
          interactionStatistic: [
            { "@type": "InteractionCounter", interactionType: "https://schema.org/ViewAction", userInteractionCount: thread.views || 0 },
            { "@type": "InteractionCounter", interactionType: "https://schema.org/CommentAction", userInteractionCount: posts.length }
          ],
          comment: posts.slice(1).map((p) => ({ "@type": "Comment", text: (p.content || "").replace(/\[[^\]]+\]/g, ""), datePublished: p.created_at, author: { "@type": "Person", name: p.profiles?.username || "Üye" } }))
        }
      ]
    }
  });

  const wrap = el("div", {});
  const head = el("div", { class: "panel" }, el("div", { class: "panel-body thread-head" },
    el("h1", {}, thread.title)));
  wrap.append(head);

  // Araç çubuğu
  const tb = el("div", { class: "thread-toolbar" },
    actionBtn("👍 Beğen", () => requireAuth(() => onLikeThread(thread))),
    actionBtn("⭐ Favori", () => requireAuth(() => toggleRel("favorites", thread.id, "Favorilere eklendi"))),
    actionBtn("🔔 Takip Et", () => requireAuth(() => toggleRel("follows", thread.id, "Takip ediliyor"))),
    actionBtn("🔖 Kaydet", () => requireAuth(() => toggleRel("saves", thread.id, "Kaydedildi"))),
    actionBtn("🔗 Paylaş", () => sharThread(thread)),
    Auth.isMod() && actionBtn("📌 Sabitle", () => requireAuth(() => adminToggleThread(thread, "pinned"))),
    Auth.isMod() && actionBtn("🔒 Kilitle", () => requireAuth(() => adminToggleThread(thread, "locked"))),
    (Auth.isMod() || thread.user_id === State.profile?.id) && actionBtn("🗑️ Sil", () => requireAuth(() => onDeleteThread(thread)))
  );
  wrap.append(tb);

  const postsWrap = el("div", { id: "posts-wrap" });
  posts.forEach((p, i) => postsWrap.append(renderPost(p, thread, i === 0)));
  wrap.append(postsWrap);

  // Benzer konular
  if (similar.length) {
    const ul = el("ul", { class: "similar-list" });
    similar.forEach((s) => ul.append(el("li", {}, el("a", { href: threadURL(s) }, "🔗 " + s.title))));
    wrap.append(el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "🧩 Benzer Konular")), el("div", { class: "panel-body" }, ul)));
  }

  // Cevap kutusu
  if (thread.locked) {
    wrap.append(el("div", { class: "panel" }, el("div", { class: "panel-body center muted" }, "🔒 Bu konu kilitli, yeni cevap yazılamaz.")));
  } else {
    wrap.append(replyBox(thread));
  }

  setView(wrap);
  subscribeThread(thread.id);  // realtime
}

function renderPost(p, thread, isFirst) {
  const author = p.profiles || {};
  const layout = author.postbit_layout === "horizontal" ? "" : "vertical";
  const post = el("div", { class: "post " + layout, id: "post-" + p.id });
  post.append(postbit(author));
  const main = el("div", { class: "post-main" });
  main.append(el("div", { class: "post-meta" },
    el("span", {}, (isFirst ? "🧵 Konu · " : "💬 Cevap · ") + fmtDate(p.created_at) + (p.edited_at ? " (düzenlendi)" : "")),
    el("a", { href: "#post-" + p.id, class: "muted" }, "#")));
  main.append(el("div", { class: "post-body", html: renderContent(p.content) }));
  const acts = el("div", { class: "post-actions" });
  acts.append(actionBtn(`❤️ Beğen (${p.like_count || 0})`, () => requireAuth(() => onLikePost(p))));
  acts.append(actionBtn("❝ Alıntı", () => quotePost(p, author)));
  if (Auth.isMod() || p.user_id === State.profile?.id) {
    acts.append(actionBtn("✏️ Düzenle", () => editPost(p)));
    acts.append(actionBtn("🗑️ Sil", () => requireAuth(() => onDeletePost(p))));
  }
  main.append(acts);
  post.append(main);
  return post;
}

/* ---- POSTBIT (kullanıcı kartı) ---- */
function postbit(u) {
  const pb = el("div", { class: "postbit" });
  const av = el("div", { class: "pb-avatar" },
    el("img", { src: avatarURL(u), alt: (u.username || "") + " avatarı", loading: "lazy" }),
    el("span", { class: "pb-online " + (u.online ? "on" : "off"), title: u.online ? "Çevrim içi" : "Çevrim dışı" }));
  pb.append(av);
  const info = el("div", {});
  info.append(el("a", { class: "pb-name", href: `#/profil/${encodeURIComponent(u.username || "")}` },
    (u.username || "Üye"), u.verified ? el("span", { class: "verified", title: "Onaylı" }, " ✔") : null));
  info.append(el("div", { class: "pb-title" }, roleLabel(u.role)));
  if (u.badges?.length) { const b = el("div", { class: "pb-badges" }); u.badges.forEach((x) => b.append(el("span", { class: "pb-badge", title: "Rozet" }, x))); info.append(b); }
  const stats = el("div", { class: "pb-stats" },
    el("span", {}, "Üyelik:"), el("span", {}, fmtDate(u.joined_at)),
    u.job && el("span", {}, "Meslek:"), u.job && el("span", {}, u.job),
    (u.city || u.country) && el("span", {}, "Konum:"), (u.city || u.country) && el("span", {}, [u.city, u.country].filter(Boolean).join(", ")),
    el("span", {}, "Mesaj:"), el("span", {}, nfmt(u.post_count)),
    el("span", {}, "Konu:"), el("span", {}, nfmt(u.thread_count)),
    el("span", {}, "Beğeni:"), el("span", {}, nfmt(u.likes)),
    el("span", {}, "Ticari:"), el("span", {}, nfmt(u.trade_points)));
  info.append(stats);
  if (u.social && Object.keys(u.social).length) {
    const soc = el("div", { class: "pb-social" });
    if (u.social.discord) soc.append(el("span", { title: "Discord: " + u.social.discord }, "🎮"));
    if (u.social.github) soc.append(el("a", { href: "https://github.com/" + u.social.github, target: "_blank", rel: "noopener", title: "GitHub" }, "🐙"));
    if (u.social.website) soc.append(el("a", { href: u.social.website, target: "_blank", rel: "noopener", title: "Website" }, "🌐"));
    info.append(soc);
  }
  if (u.signature) info.append(el("div", { class: "pb-signature" }, u.signature));
  pb.append(info);
  return pb;
}
function roleLabel(r) { return ({ admin: "👑 Yönetici", moderator: "🛡️ Moderatör", user: "Üye" }[r] || "Üye"); }

function actionBtn(label, onClick) { return el("button", { class: "btn btn-sm", onclick: onClick }, label); }

function replyBox(thread) {
  const ta = el("textarea", { placeholder: Auth.isLogged() ? "Cevabını yaz… ([b], [i], [quote], [url], [img] desteklenir)" : "Cevap yazmak için giriş yapmalısın.", id: "reply-text", "aria-label": "Cevap" });
  if (!Auth.isLogged()) ta.disabled = true;
  const tools = el("div", { class: "editor-toolbar" },
    ...[["B", "[b][/b]"], ["I", "[i][/i]"], ["U", "[u][/u]"], ["❝", "[quote][/quote]"], ["🔗", "[url=][/url]"], ["🖼️", "[img][/img]"]]
      .map(([l, tag]) => el("button", { class: "btn btn-sm", type: "button", onclick: () => insertTag(ta, tag) }, l)));
  const send = el("button", { class: "btn btn-primary", onclick: () => onReply(thread, ta) }, "💬 Cevap Gönder");
  if (!Auth.isLogged()) { send.disabled = true; }
  return el("div", { class: "panel reply-box" },
    el("div", { class: "panel-head" }, el("h3", {}, "✍️ Cevap Yaz")),
    el("div", { class: "panel-body" }, tools, ta, el("div", { class: "row", style: "margin-top:10px;justify-content:flex-end" },
      Auth.isLogged() ? send : el("button", { class: "btn btn-primary", onclick: () => openAuth("login") }, "Giriş Yap"))));
}
function insertTag(ta, tag) {
  const [open, close] = tag.split(/(?<=\])(?=\[\/)/);
  const s = ta.selectionStart, e = ta.selectionEnd, v = ta.value;
  ta.value = v.slice(0, s) + open + v.slice(s, e) + (close || "") + v.slice(e);
  ta.focus();
}
function quotePost(p, author) {
  const ta = $("#reply-text"); if (!ta) return;
  ta.value += `[quote=${author.username || "Üye"}]${(p.content || "").replace(/\[quote[\s\S]*?\[\/quote\]/gi, "")}[/quote]\n`;
  ta.focus(); ta.scrollIntoView({ behavior: "smooth" });
}

/* ---- ÜYELER ---- */
let memState = { offset: 0, limit: 24 };
async function viewMembers() {
  loadingView();
  memState = { offset: 0, limit: 24 };
  SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, { label: "Üyeler" }]);
  SEO.set({ title: "Üye Listesi", path: "#/uyeler" });
  const wrap = el("div", {},
    el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "👥 Üye Listesi"))),
    el("div", { class: "panel" }, el("div", { class: "panel-body", id: "members-grid", style: "display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px" })),
    el("div", { class: "load-more-wrap", id: "members-more" }));
  setView(wrap);
  await loadMembers();
}
async function loadMembers() {
  const { rows, total } = await DB.getMembers({ limit: memState.limit, offset: memState.offset });
  const grid = $("#members-grid");
  rows.forEach((u) => grid.append(el("a", { class: "panel", style: "text-align:center;padding:14px;margin:0", href: `#/profil/${encodeURIComponent(u.username)}` },
    el("img", { src: avatarURL(u), alt: "", style: "width:64px;height:64px;border-radius:12px", loading: "lazy" }),
    el("div", { style: "font-weight:700;margin-top:6px" }, u.username, u.verified ? " ✔" : ""),
    el("div", { class: "muted", style: "font-size:12px" }, roleLabel(u.role)),
    el("div", { class: "muted", style: "font-size:12px" }, `💬 ${nfmt(u.post_count)}`))));
  memState.offset += rows.length;
  const more = $("#members-more"); more.innerHTML = "";
  if (memState.offset < total) more.append(el("button", { class: "btn", onclick: loadMembers }, "Daha Fazla"));
}

/* ---- PROFİL ---- */
async function viewProfile({ name }) {
  loadingView();
  const u = await DB.getProfile(name);
  if (!u) return view404();
  SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, { label: "Üyeler", href: "#/uyeler" }, { label: u.username }]);
  SEO.set({
    title: u.username + " profili", image: avatarURL(u), path: `#/profil/${encodeURIComponent(u.username)}`,
    jsonld: { "@context": "https://schema.org", "@type": "Person", name: u.username, image: avatarURL(u), description: u.signature || "" }
  });
  const wrap = el("div", {});
  wrap.append(el("div", { class: "panel" }, el("div", { class: "panel-body", style: "display:grid;grid-template-columns:120px 1fr;gap:18px;align-items:center" },
    el("img", { src: avatarURL(u), alt: "", style: "width:120px;height:120px;border-radius:16px" }),
    el("div", {},
      el("h1", { style: "margin:0" }, u.username, u.verified ? el("span", { class: "verified" }, " ✔") : null),
      el("div", { class: "muted" }, roleLabel(u.role) + " · " + [u.job, u.city, u.country].filter(Boolean).join(" · ")),
      el("div", { class: "row", style: "margin-top:10px" },
        chip("📅 " + fmtDate(u.joined_at)), chip("💬 " + nfmt(u.post_count) + " mesaj"), chip("🧵 " + nfmt(u.thread_count) + " konu"),
        chip("❤️ " + nfmt(u.likes) + " beğeni"), chip("💰 " + nfmt(u.trade_points) + " ticari")),
      State.profile && State.profile.id !== u.id ? el("div", { class: "row", style: "margin-top:10px" },
        el("button", { class: "btn btn-primary btn-sm", onclick: () => openCompose(u) }, "✉️ Mesaj Gönder")) : null,
      State.profile && State.profile.id === u.id ? el("button", { class: "btn btn-sm", style: "margin-top:10px", onclick: openEditProfile }, "⚙️ Profili Düzenle") : null))));
  if (u.badges?.length) { const b = el("div", { class: "row" }); u.badges.forEach((x) => b.append(el("span", { class: "chip" }, x + " Rozet"))); wrap.append(el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "🏅 Rozetler")), el("div", { class: "panel-body" }, b))); }
  if (u.signature) wrap.append(el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h3", {}, "✒️ İmza")), el("div", { class: "panel-body muted" }, u.signature)));
  setView(wrap);
}
function chip(t) { return el("span", { class: "chip" }, t); }

/* ---- ARAMA SAYFASI ---- */
async function viewSearch({ q = "" } = {}) {
  SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, { label: "Arama" }]);
  SEO.set({ title: "Arama", path: "#/arama" });
  const input = el("input", { class: "input", id: "search-page-input", placeholder: "Başlık, içerik, etiket, kullanıcı…", value: q });
  const results = el("div", { id: "search-results" });
  const run = debounce(async () => {
    const term = input.value.trim();
    if (!term) { results.innerHTML = ""; return; }
    navigate("#/arama/" + encodeURIComponent(term));
    results.innerHTML = "<div class='center'><span class='loader'></span></div>";
    const { threads, users } = await DB.search(term);
    results.innerHTML = "";
    results.append(widgetList(`🧵 Konular (${threads.length})`, threads, threadMini));
    results.append(widgetList(`👤 Kullanıcılar (${users.length})`, users, memberMini));
  }, 300);
  input.addEventListener("input", run);
  setView(el("div", {}, el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "🔍 Arama")), el("div", { class: "panel-body" }, input)), results));
  input.focus();
  if (q) run();
}

/* ---- BİLDİRİMLER ---- */
async function viewNotifications() {
  if (!requireAuthView()) return;
  loadingView();
  SEO.set({ title: "Bildirimler", path: "#/bildirimler" });
  SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, { label: "Bildirimler" }]);
  const items = await DB.getNotifications();
  const list = el("div", { class: "panel-body" });
  if (!items.length) list.append(el("div", { class: "empty-state" }, el("div", { class: "big" }, "🔔"), "Bildirim yok."));
  items.forEach((n) => list.append(el("div", { class: "fly-item" + (n.read ? "" : " unread"), style: "border-radius:8px;margin-bottom:6px;cursor:pointer", onclick: () => { DB.markNotifRead(n.id); if (n.link) navigate(n.link); } },
    el("div", {}, notifIcon(n.type) + " " + n.text), el("div", { class: "muted", style: "font-size:12px" }, timeAgo(n.created_at)))));
  setView(el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "🔔 Bildirimler")), list));
  refreshBadges();
}
function notifIcon(t) { return ({ reply: "💬", like: "❤️", follow: "🔔", message: "✉️", mention: "@" }[t] || "🔔"); }

/* ---- MESAJLAR ---- */
async function viewMessages() {
  if (!requireAuthView()) return;
  loadingView();
  SEO.set({ title: "Mesajlar", path: "#/mesajlar" });
  SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, { label: "Mesajlar" }]);
  const folders = ["inbox", "outbox", "archive"];
  const labels = { inbox: "📥 Gelen", outbox: "📤 Giden", archive: "🗄️ Arşiv" };
  let folder = "inbox";
  const body = el("div", { class: "panel-body", id: "pm-body" });
  const tabs = el("div", { class: "row", style: "margin-bottom:12px" }, ...folders.map((f) =>
    el("button", { class: "btn btn-sm" + (f === folder ? " btn-primary" : ""), onclick: async (e) => { folder = f; $$("#pm-tabs .btn").forEach((b) => b.classList.remove("btn-primary")); e.target.classList.add("btn-primary"); await renderPM(); } }, labels[f])));
  tabs.id = "pm-tabs";
  async function renderPM() {
    body.innerHTML = "<div class='center'><span class='loader'></span></div>";
    const msgs = await DB.getMessages(folder);
    body.innerHTML = "";
    if (!msgs.length) { body.append(el("div", { class: "empty-state" }, el("div", { class: "big" }, "✉️"), "Mesaj yok.")); return; }
    msgs.forEach((m) => body.append(el("div", { class: "fly-item" + (m.read || folder !== "inbox" ? "" : " unread"), style: "border-radius:8px;margin-bottom:6px" },
      el("div", { class: "row spread" }, el("strong", {}, m.subject || "(konu yok)"), el("span", { class: "muted", style: "font-size:12px" }, timeAgo(m.created_at))),
      el("div", { class: "muted", style: "font-size:13px" }, (folder === "outbox" ? "Alıcı: " + (m.to?.username || "?") : "Gönderen: " + (m.from?.username || "?"))),
      el("div", { style: "margin-top:6px" }, m.body))));
  }
  setView(el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "✉️ Özel Mesajlar"),
    el("button", { class: "btn btn-primary btn-sm", onclick: () => openCompose(null) }, "✏️ Yeni Mesaj")),
    el("div", { class: "panel-body" }, tabs), body));
  await renderPM();
}

/* ---- STATİK SAYFALAR ---- */
function viewStatic(title, html) {
  SEO.set({ title, path: location.hash });
  SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, { label: title }]);
  setView(el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, title)), el("div", { class: "panel-body", html })));
}
async function viewContact() {
  SEO.set({ title: "İletişim", path: "#/iletisim" });
  SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, { label: "İletişim" }]);
  const mail = PLACEHOLDER(CFG.FORMSUBMIT_MAIL) ? "" : CFG.FORMSUBMIT_MAIL;
  const form = el("form", { class: "panel-body", action: mail ? `https://formsubmit.co/${mail}` : "#", method: "POST" },
    el("div", { class: "field" }, el("label", {}, "Adınız"), el("input", { class: "input", name: "name", required: true })),
    el("div", { class: "field" }, el("label", {}, "E-posta"), el("input", { class: "input", type: "email", name: "email", required: true })),
    el("div", { class: "field" }, el("label", {}, "Mesaj"), el("textarea", { name: "message", required: true })),
    el("input", { type: "hidden", name: "_subject", value: "Forum İletişim Formu" }),
    el("button", { class: "btn btn-primary" }, "Gönder"));
  if (!mail) { form.addEventListener("submit", (e) => { e.preventDefault(); toast("FORMSUBMIT_MAIL ayarlanmadı.", "warn"); }); }
  setView(el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, "📨 İletişim")), form));
}

/* ---- 404 ---- */
function view404() {
  SEO.set({ title: "Sayfa bulunamadı" });
  SEO.breadcrumb(null);
  setView(el("div", { class: "panel" }, el("div", { class: "empty-state" },
    el("div", { class: "big" }, "🚧"), el("h2", {}, "404 — Sayfa bulunamadı"),
    el("p", { class: "muted" }, "Aradığın sayfa taşınmış veya hiç var olmamış olabilir."),
    el("a", { class: "btn btn-primary", href: "#/" }, "Ana Sayfaya Dön"))));
}

/* =========================================================
   8b) AKSİYONLAR
   ========================================================= */
function requireAuth(fn) { if (!Auth.isLogged()) return openAuth("login"); return fn(); }
function requireAuthView() { if (!Auth.isLogged()) { openAuth("login"); viewHome(); return false; } return true; }

async function onReply(thread, ta) {
  const content = ta.value.trim();
  if (!content) return toast("Boş cevap gönderilemez.", "warn");
  if (content.length > 10000) return toast("Cevap çok uzun.", "warn");
  if (!rateLimit("reply", 4000)) return toast("Çok hızlı! Biraz bekle.", "warn");
  try {
    const p = await DB.createPost({ thread_id: thread.id, content });
    ta.value = "";
    if (DEMO) $("#posts-wrap").append(renderPost(p, thread, false)); // realtime yoksa elle ekle
    toast("Cevabın gönderildi.", "success");
    DB.log("post.create", thread.title);
  } catch (e) { toast("Hata: " + (e.message || e), "error"); }
}
async function onLikePost(p) {
  const liked = await DB.toggleLike(p.id);
  toast(liked ? "Beğenildi ❤️" : "Beğeni geri alındı");
  const btn = $("#post-" + p.id + " .post-actions .btn-sm");
  if (btn) { p.like_count = (p.like_count || 0) + (liked ? 1 : -1); btn.textContent = `❤️ Beğen (${p.like_count})`; btn.classList.toggle("liked", liked); }
}
async function onLikeThread(thread) {
  const posts = await DB.getPosts(thread.id);
  if (posts[0]) onLikePost(posts[0]);
}
async function onDeletePost(p) {
  if (!confirm("Bu mesajı silmek istediğine emin misin?")) return;
  await DB.deletePost(p.id); $("#post-" + p.id)?.remove(); toast("Mesaj silindi.", "success"); DB.log("post.delete", p.id);
}
function editPost(p) {
  const node = $("#post-" + p.id + " .post-body"); if (!node) return;
  const ta = el("textarea", { class: "input", html: "" }); ta.value = p.content;
  node.replaceWith(el("div", { class: "post-body", id: "edit-wrap" }, ta,
    el("div", { class: "row", style: "margin-top:8px" },
      el("button", { class: "btn btn-primary btn-sm", onclick: async () => { await DB.updatePost(p.id, ta.value); toast("Güncellendi.", "success"); viewThread({ id: p.thread_id }); } }, "Kaydet"),
      el("button", { class: "btn btn-sm", onclick: () => viewThread({ id: p.thread_id }) }, "İptal"))));
}
async function onDeleteThread(thread) {
  if (!confirm("Konuyu ve tüm cevapları silmek istediğine emin misin?")) return;
  await DB.deleteThread(thread.id); toast("Konu silindi.", "success"); DB.log("thread.delete", thread.title); navigate("#/");
}
async function adminToggleThread(thread, field) {
  thread[field] = !thread[field];
  if (DEMO) { const db = DemoStore.load(); const t = db.threads.find((x) => x.id === thread.id); if (t) t[field] = thread[field]; DemoStore.save(db); }
  else await sb.from("threads").update({ [field]: thread[field] }).eq("id", thread.id);
  toast((field === "pinned" ? "Sabitleme" : "Kilit") + " güncellendi.", "success");
  viewThread({ id: thread.id });
}
async function toggleRel(table, threadId, msg) {
  if (DEMO) { const db = DemoStore.load(); const uid = State.profile.id; const arr = db[table]; const i = arr.findIndex((r) => r.thread_id === threadId && r.user_id === uid); if (i >= 0) { arr.splice(i, 1); toast("Kaldırıldı"); } else { arr.push({ thread_id: threadId, user_id: uid }); toast(msg, "success"); } DemoStore.save(db); return; }
  const { data } = await sb.from(table).select("id").eq("thread_id", threadId).eq("user_id", State.user.id).maybeSingle();
  if (data) { await sb.from(table).delete().eq("id", data.id); toast("Kaldırıldı"); }
  else { await sb.from(table).insert({ thread_id: threadId, user_id: State.user.id }); toast(msg, "success"); }
}
function sharThread(thread) {
  const url = SITE_ORIGIN + threadURL(thread);
  if (navigator.share) navigator.share({ title: thread.title, url }).catch(() => {});
  else { navigator.clipboard?.writeText(url); toast("Bağlantı kopyalandı.", "success"); }
}

/* =========================================================
   9) MODALLAR (auth, yeni konu, profil, compose)
   ========================================================= */
function openModal(node, lg) {
  const root = $("#modal-root"); root.hidden = false; root.innerHTML = "";
  const modal = el("div", { class: "modal" + (lg ? " lg" : "") });
  modal.append(node);
  root.append(modal);
  root.onclick = (e) => { if (e.target === root) closeModal(); };
  document.addEventListener("keydown", escClose);
  modal.querySelector("input,textarea,button")?.focus();
}
function escClose(e) { if (e.key === "Escape") closeModal(); }
function closeModal() { const r = $("#modal-root"); r.hidden = true; r.innerHTML = ""; document.removeEventListener("keydown", escClose); }

function modalShell(title, body, foot) {
  return el("div", {},
    el("div", { class: "modal-head" }, el("h3", {}, title), el("button", { class: "close-x", "aria-label": "Kapat", onclick: closeModal }, "×")),
    el("div", { class: "modal-body" }, body),
    foot ? el("div", { class: "modal-foot" }, foot) : null);
}

function openAuth(tab = "login") {
  const tabs = el("div", { class: "modal-tabs" },
    tabBtn("login", "Giriş"), tabBtn("register", "Kayıt"), tabBtn("forgot", "Şifremi Unuttum"));
  const body = el("div", { class: "modal-body", id: "auth-body" });
  const modal = el("div", {}, el("div", { class: "modal-head" }, el("h3", {}, "Hesap"), el("button", { class: "close-x", onclick: closeModal }, "×")), tabs, body);
  openModal(modal);
  switchTab(tab);
  function tabBtn(id, label) { return el("button", { class: id === tab ? "active" : "", onclick: () => switchTab(id) }, label); }
  function switchTab(id) {
    tab = id; $$(".modal-tabs button").forEach((b, i) => b.classList.toggle("active", ["login", "register", "forgot"][i] === id));
    body.innerHTML = ""; body.append(id === "login" ? loginForm() : id === "register" ? registerForm() : forgotForm());
  }
}
function field(label, attrs) { return el("div", { class: "field" }, el("label", {}, label), el("input", { class: "input", ...attrs })); }
function loginForm() {
  const f = el("form", {},
    field("E-posta / Kullanıcı adı", { name: "email", required: true, autocomplete: "username" }),
    field("Şifre", { name: "password", type: "password", required: true, autocomplete: "current-password" }),
    el("button", { class: "btn btn-primary btn-block" }, "Giriş Yap"),
    DEMO ? el("p", { class: "help" }, "Demo modu: e-posta alanına 'AdminDevin' yazıp giriş yapabilirsin (admin)." ) : null);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await Auth.login({ email: f.email.value, password: f.password.value }); closeModal(); renderHeaderUser(); router(); toast("Hoş geldin, " + State.profile.username + "!", "success"); }
    catch (err) { toast("Giriş başarısız: " + (err.message || err), "error"); }
  });
  return f;
}
function registerForm() {
  const f = el("form", {},
    field("Kullanıcı adı", { name: "username", required: true, minlength: 3 }),
    field("E-posta", { name: "email", type: "email", required: true }),
    field("Şifre", { name: "password", type: "password", required: true, minlength: 6, autocomplete: "new-password" }),
    el("button", { class: "btn btn-primary btn-block" }, "Kayıt Ol"));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await Auth.register({ username: f.username.value.trim(), email: f.email.value.trim(), password: f.password.value }); closeModal(); renderHeaderUser(); router(); toast("Kayıt başarılı!", "success"); }
    catch (err) { toast("Kayıt başarısız: " + (err.message || err), "error"); }
  });
  return f;
}
function forgotForm() {
  const f = el("form", {},
    field("E-posta", { name: "email", type: "email", required: true }),
    el("p", { class: "help" }, "Sıfırlama bağlantısı e-postana gönderilecek (Supabase + FormSubmit)."),
    el("button", { class: "btn btn-primary btn-block" }, "Sıfırlama Gönder"));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await Auth.forgotPassword(f.email.value.trim()); toast("Sıfırlama talebi gönderildi.", "success"); closeModal(); }
    catch (err) { toast("Hata: " + (err.message || err), "error"); }
  });
  return f;
}

async function openNewTopic(forumId) {
  if (!Auth.isLogged()) return openAuth("login");
  const forums = await DB.getForums();
  const sel = el("select", { name: "forum" }, ...forums.filter((f) => true).map((f) => el("option", { value: f.id, selected: f.id === forumId }, "  ".repeat(f.parent_id ? 1 : 0) + (f.icon || "") + " " + f.name)));
  const title = el("input", { class: "input", name: "title", required: true, placeholder: "Konu başlığı", maxlength: 150 });
  const tags = el("input", { class: "input", name: "tags", placeholder: "etiketler (virgülle): javascript, spa" });
  const content = el("textarea", { name: "content", required: true, placeholder: "Konu içeriği… ([b],[i],[quote],[url],[img])" });
  const form = el("form", {},
    el("div", { class: "field" }, el("label", {}, "Forum"), sel),
    el("div", { class: "field" }, el("label", {}, "Başlık"), title),
    el("div", { class: "field" }, el("label", {}, "Etiketler"), tags),
    el("div", { class: "field" }, el("label", {}, "İçerik"), content));
  const submit = el("button", { class: "btn btn-primary", onclick: send }, "Konuyu Aç");
  openModal(modalShell("✏️ Yeni Konu Aç", form, [el("button", { class: "btn", onclick: closeModal }, "İptal"), submit]), true);
  async function send() {
    if (!title.value.trim() || !content.value.trim()) return toast("Başlık ve içerik gerekli.", "warn");
    if (!rateLimit("thread", 8000)) return toast("Çok hızlı konu açıyorsun.", "warn");
    try {
      const t = await DB.createThread({ forum_id: sel.value, title: title.value.trim(), content: content.value.trim(), tags: tags.value.split(",").map((s) => s.trim()).filter(Boolean) });
      closeModal(); toast("Konu açıldı!", "success"); DB.log("thread.create", t.title); navigate(threadURL(t));
    } catch (e) { toast("Hata: " + (e.message || e), "error"); }
  }
}

function openEditProfile() {
  const p = State.profile;
  const f = el("form", {},
    field("Avatar URL", { name: "avatar_url", value: p.avatar_url || "" }),
    field("Meslek", { name: "job", value: p.job || "" }),
    field("Şehir", { name: "city", value: p.city || "" }),
    field("Ülke", { name: "country", value: p.country || "" }),
    el("div", { class: "field" }, el("label", {}, "İmza"), el("textarea", { name: "signature" }, p.signature || "")),
    field("Discord", { name: "discord", value: p.social?.discord || "" }),
    field("GitHub kullanıcı adı", { name: "github", value: p.social?.github || "" }),
    field("Website", { name: "website", value: p.social?.website || "" }),
    el("div", { class: "field" }, el("label", {}, "Postbit görünümü"),
      el("select", { name: "postbit_layout" }, el("option", { value: "vertical", selected: p.postbit_layout !== "horizontal" }, "Dikey"), el("option", { value: "horizontal", selected: p.postbit_layout === "horizontal" }, "Yatay"))));
  const submit = el("button", { class: "btn btn-primary", onclick: async () => {
    await DB.updateProfile({ avatar_url: f.avatar_url.value, job: f.job.value, city: f.city.value, country: f.country.value, signature: f.signature.value, postbit_layout: f.postbit_layout.value, social: { discord: f.discord.value, github: f.github.value, website: f.website.value } });
    closeModal(); toast("Profil güncellendi.", "success"); renderHeaderUser(); router();
  } }, "Kaydet");
  openModal(modalShell("⚙️ Profili Düzenle", f, [el("button", { class: "btn", onclick: closeModal }, "İptal"), submit]), true);
}

async function openCompose(toUser) {
  if (!Auth.isLogged()) return openAuth("login");
  const members = (await DB.getMembers({ limit: 100 })).rows.filter((u) => u.id !== State.profile.id);
  const sel = el("select", { name: "to" }, ...members.map((u) => el("option", { value: u.id, selected: toUser && u.id === toUser.id }, u.username)));
  const subject = el("input", { class: "input", placeholder: "Konu" });
  const body = el("textarea", { placeholder: "Mesajın…" });
  const f = el("form", {}, el("div", { class: "field" }, el("label", {}, "Alıcı"), sel), el("div", { class: "field" }, el("label", {}, "Konu"), subject), el("div", { class: "field" }, el("label", {}, "Mesaj"), body));
  const submit = el("button", { class: "btn btn-primary", onclick: async () => {
    if (!body.value.trim()) return toast("Mesaj boş.", "warn");
    await DB.sendMessage({ to_id: sel.value, subject: subject.value, body: body.value });
    closeModal(); toast("Mesaj gönderildi.", "success");
  } }, "Gönder");
  openModal(modalShell("✉️ Yeni Mesaj", f, [el("button", { class: "btn", onclick: closeModal }, "İptal"), submit]), true);
}

/* =========================================================
   10) ADMIN PANELİ
   ========================================================= */
const ADMIN_SECTIONS = [
  ["dashboard", "📊 Dashboard"], ["users", "👤 Kullanıcılar"], ["categories", "📁 Kategoriler"],
  ["threads", "🧵 Konular"], ["badges", "🏅 Rozetler"], ["trade", "💰 Ticari Puan"],
  ["rss", "📡 RSS"], ["theme", "🎨 Tema"], ["seo", "🔍 SEO"], ["settings", "⚙️ Ayarlar"],
  ["backup", "💾 Yedekleme"], ["logs", "📜 Loglar"]
];
async function viewAdmin({ section = "dashboard" } = {}) {
  if (!Auth.isAdmin()) { toast("Bu alana erişim yetkin yok.", "error"); return viewHome(); }
  SEO.set({ title: "Admin Paneli" }); SEO.breadcrumb([{ label: "Ana Sayfa", href: "#/" }, { label: "Admin" }]);
  const nav = el("ul", { class: "admin-nav panel" }, el("li", {}, el("div", { class: "panel-head" }, el("h3", {}, "Admin"))),
    ...ADMIN_SECTIONS.map(([id, label]) => el("li", {}, el("button", { class: section === id ? "active" : "", onclick: () => navigate("#/admin/" + id) }, label))));
  const content = el("div", { id: "admin-content" });
  setView(el("div", { class: "admin-layout" }, nav, content));
  const map = { dashboard: adminDashboard, users: adminUsers, categories: adminCategories, threads: adminThreads, badges: adminBadges, trade: adminTrade, rss: adminRSS, theme: adminTheme, seo: adminSEO, settings: adminSettings, backup: adminBackup, logs: adminLogs };
  (map[section] || adminDashboard)(content);
}
function adminPanel(title, body) { return el("div", { class: "panel" }, el("div", { class: "panel-head" }, el("h2", {}, title)), el("div", { class: "panel-body" }, body)); }
async function adminDashboard(c) {
  const s = await DB.getStats();
  c.append(adminPanel("📊 Genel Bakış", el("div", { class: "stat-strip" },
    statCard(s.topics, "Konu"), statCard(s.posts, "Mesaj"), statCard(s.members, "Üye"), statCard(s.today, "Bugün"), statCard(s.online, "Çevrim İçi"))));
}
async function adminUsers(c) {
  const { rows } = await DB.getMembers({ limit: 200 });
  const tbody = el("tbody");
  rows.forEach((u) => tbody.append(el("tr", {},
    el("td", {}, u.username), el("td", {}, roleLabel(u.role)), el("td", {}, nfmt(u.post_count)),
    el("td", {}, el("div", { class: "row" },
      selectRole(u), el("button", { class: "btn btn-sm", onclick: () => toggleVerified(u) }, u.verified ? "Tiki Kaldır" : "Mavi Tik"),
      el("button", { class: "btn btn-danger btn-sm", onclick: () => banUser(u) }, "Ban"))))));
  c.append(adminPanel("👤 Kullanıcı Yönetimi", el("div", { class: "table-wrap" }, el("table", { class: "data" },
    el("thead", {}, el("tr", {}, el("th", {}, "Kullanıcı"), el("th", {}, "Rol"), el("th", {}, "Mesaj"), el("th", {}, "İşlemler"))), tbody))));
  function selectRole(u) {
    const s = el("select", { onchange: async (e) => { await setRole(u, e.target.value); toast("Rol güncellendi.", "success"); } },
      ...["user", "moderator", "admin"].map((r) => el("option", { value: r, selected: u.role === r }, r)));
    return s;
  }
}
async function setRole(u, role) { if (DEMO) { const db = DemoStore.load(); const x = db.users.find((y) => y.id === u.id); if (x) x.role = role; DemoStore.save(db); } else await sb.from("profiles").update({ role }).eq("id", u.id); DB.log("user.role", u.username + "->" + role); }
async function toggleVerified(u) { const v = !u.verified; if (DEMO) { const db = DemoStore.load(); const x = db.users.find((y) => y.id === u.id); if (x) x.verified = v; DemoStore.save(db); } else await sb.from("profiles").update({ verified: v }).eq("id", u.id); toast("Güncellendi.", "success"); viewAdmin({ section: "users" }); }
async function banUser(u) { if (!confirm(u.username + " banlansın mı?")) return; if (DEMO) { const db = DemoStore.load(); db.bans.push({ user_id: u.id, at: Date.now() }); DemoStore.save(db); } else await sb.from("bans").insert({ user_id: u.id }); toast("Kullanıcı banlandı.", "success"); DB.log("user.ban", u.username); }

async function adminCategories(c) {
  const [cats, forums] = await Promise.all([DB.getCategories(), DB.getForums()]);
  const list = el("div", {});
  cats.forEach((cat) => {
    list.append(el("div", { class: "row spread", style: "padding:8px 0;border-bottom:1px solid var(--border)" }, el("strong", {}, "📁 " + cat.name), el("span", { class: "muted" }, forums.filter((f) => f.category_id === cat.id).length + " forum")));
  });
  const addCat = el("button", { class: "btn btn-primary btn-sm", onclick: async () => { const name = prompt("Kategori adı:"); if (name) { await addCategory(name); toast("Eklendi.", "success"); viewAdmin({ section: "categories" }); } } }, "+ Kategori Ekle");
  const addForum = el("button", { class: "btn btn-sm", onclick: async () => { const name = prompt("Forum adı:"); if (!name) return; const catId = prompt("Kategori ID (" + cats.map((x) => x.id).join(", ") + "):", cats[0]?.id); await addForum_(name, catId); toast("Eklendi.", "success"); viewAdmin({ section: "categories" }); } }, "+ Forum Ekle");
  c.append(adminPanel("📁 Kategori & Forum", el("div", {}, list, el("div", { class: "row", style: "margin-top:12px" }, addCat, addForum))));
}
async function addCategory(name) { if (DEMO) { const db = DemoStore.load(); db.categories.push({ id: "c" + Date.now(), name, position: db.categories.length + 1 }); DemoStore.save(db); } else await sb.from("categories").insert({ name, position: 99 }); }
async function addForum_(name, catId) { if (DEMO) { const db = DemoStore.load(); db.forums.push({ id: "f" + Date.now(), category_id: catId, parent_id: null, name, description: "", icon: "📁", position: 99 }); DemoStore.save(db); } else await sb.from("forums").insert({ name, category_id: catId, position: 99 }); }

async function adminThreads(c) {
  const { rows } = await DB.getThreads({ limit: 200 });
  const tbody = el("tbody");
  rows.forEach((t) => tbody.append(el("tr", {},
    el("td", {}, el("a", { href: threadURL(t) }, t.title)), el("td", {}, t.profiles?.username || "?"), el("td", {}, nfmt(t.views)),
    el("td", {}, el("div", { class: "row" },
      el("button", { class: "btn btn-sm", onclick: () => adminToggleThread(t, "pinned") }, t.pinned ? "Sabit ✓" : "Sabitle"),
      el("button", { class: "btn btn-sm", onclick: () => adminToggleThread(t, "locked") }, t.locked ? "Kilitli ✓" : "Kilitle"),
      el("button", { class: "btn btn-danger btn-sm", onclick: async () => { if (confirm("Sil?")) { await DB.deleteThread(t.id); toast("Silindi.", "success"); viewAdmin({ section: "threads" }); } } }, "Sil"))))));
  c.append(adminPanel("🧵 Konu Yönetimi", el("div", { class: "table-wrap" }, el("table", { class: "data" }, el("thead", {}, el("tr", {}, el("th", {}, "Başlık"), el("th", {}, "Yazar"), el("th", {}, "Görüntülenme"), el("th", {}, "İşlem"))), tbody))));
}
async function adminBadges(c) {
  const badges = DEMO ? DemoStore.load().badges : ((await sb.from("badges").select("*")).data || []);
  const list = el("div", { class: "row" });
  badges.forEach((b) => list.append(el("span", { class: "chip" }, b.icon + " " + b.name)));
  const add = el("button", { class: "btn btn-primary btn-sm", onclick: async () => { const name = prompt("Rozet adı:"); const icon = prompt("Emoji:"); if (name) { if (DEMO) { const db = DemoStore.load(); db.badges.push({ id: "b" + Date.now(), name, icon: icon || "🏅", description: "" }); DemoStore.save(db); } else await sb.from("badges").insert({ name, icon }); toast("Eklendi.", "success"); viewAdmin({ section: "badges" }); } } }, "+ Rozet");
  c.append(adminPanel("🏅 Rozet Sistemi", el("div", {}, list, el("div", { style: "margin-top:12px" }, add))));
}
async function adminTrade(c) {
  const { rows } = await DB.getMembers({ limit: 200 });
  const tbody = el("tbody");
  rows.forEach((u) => tbody.append(el("tr", {}, el("td", {}, u.username), el("td", {}, nfmt(u.trade_points)),
    el("td", {}, el("div", { class: "row" },
      el("button", { class: "btn btn-sm", onclick: () => tradeAdjust(u, 1) }, "+1"),
      el("button", { class: "btn btn-sm", onclick: () => tradeAdjust(u, -1) }, "−1"),
      el("button", { class: "btn btn-sm", onclick: () => { const n = parseInt(prompt("Miktar (+/-):"), 10); if (n) tradeAdjust(u, n); } }, "Özel"))))));
  c.append(adminPanel("💰 Ticari Puan", el("div", { class: "table-wrap" }, el("table", { class: "data" }, el("thead", {}, el("tr", {}, el("th", {}, "Kullanıcı"), el("th", {}, "Puan"), el("th", {}, "İşlem"))), tbody))));
}
async function tradeAdjust(u, delta) {
  const np = (u.trade_points || 0) + delta;
  if (DEMO) { const db = DemoStore.load(); const x = db.users.find((y) => y.id === u.id); if (x) x.trade_points = np; db.trade_log.unshift({ user_id: u.id, delta, at: Date.now() }); DemoStore.save(db); }
  else { await sb.from("profiles").update({ trade_points: np }).eq("id", u.id); await sb.from("trade_log").insert({ user_id: u.id, delta }); }
  toast("Puan güncellendi.", "success"); viewAdmin({ section: "trade" });
}
async function adminRSS(c) {
  c.append(adminPanel("📡 RSS Yönetimi", el("div", {},
    el("p", {}, "RSS beslemesi otomatik üretilir. tema.cron betiği rss.xml ve sitemap.xml dosyalarını günceller."),
    el("div", { class: "field" }, el("label", {}, "RSS Etkin"),
      el("select", { onchange: (e) => DB.saveSetting("rss_enabled", e.target.value === "1") }, el("option", { value: "1", selected: State.settings.rss_enabled }, "Açık"), el("option", { value: "0", selected: !State.settings.rss_enabled }, "Kapalı"))),
    el("a", { class: "btn", href: "rss.xml", target: "_blank" }, "rss.xml görüntüle"),
    el("p", { class: "help", style: "margin-top:10px" }, "RSS'ten konu içe aktarma tema.cron tarafından yapılır (RSS_IMPORT_URL).") )));
}
async function adminTheme(c) {
  const cur = State.settings.default_theme || "midnight";
  const sw = el("div", { class: "row" });
  THEMES.forEach((t) => sw.append(el("button", { class: "btn btn-sm" + (cur === t.id ? " btn-primary" : ""), onclick: async () => { await DB.saveSetting("default_theme", t.id); applyTheme(t.id); toast("Varsayılan tema: " + t.name, "success"); viewAdmin({ section: "theme" }); } }, t.name)));
  c.append(adminPanel("🎨 Tema Yönetimi", el("div", {}, el("p", {}, "Varsayılan tema seç:"), sw)));
}
async function adminSEO(c) {
  const f = el("div", {},
    el("div", { class: "field" }, el("label", {}, "Site Adı"), el("input", { class: "input", id: "seo-name", value: State.settings.site_name })),
    el("div", { class: "field" }, el("label", {}, "Meta Açıklama"), el("textarea", { id: "seo-desc" }, State.settings.description)),
    el("button", { class: "btn btn-primary", onclick: async () => { await DB.saveSetting("site_name", $("#seo-name").value); await DB.saveSetting("description", $("#seo-desc").value); toast("SEO kaydedildi.", "success"); } }, "Kaydet"));
  c.append(adminPanel("🔍 SEO Ayarları", f));
}
async function adminSettings(c) {
  const f = el("div", {},
    el("div", { class: "field" }, el("label", {}, "Ana sayfa kayıt limiti"), el("input", { class: "input", type: "number", id: "set-limit", value: State.settings.home_limit, min: 1, max: 50 })),
    el("div", { class: "field" }, el("label", {}, "Benzer konu önerisi sayısı"), el("input", { class: "input", type: "number", id: "set-similar", value: State.settings.similar_count, min: 1, max: 20 })),
    el("button", { class: "btn btn-primary", onclick: async () => { await DB.saveSetting("home_limit", +$("#set-limit").value); await DB.saveSetting("similar_count", +$("#set-similar").value); toast("Ayarlar kaydedildi.", "success"); } }, "Kaydet"));
  c.append(adminPanel("⚙️ Genel Ayarlar", f));
}
async function adminBackup(c) {
  c.append(adminPanel("💾 Yedekleme", el("div", { class: "row" },
    el("button", { class: "btn btn-primary", onclick: exportJSON }, "JSON Export"),
    el("button", { class: "btn", onclick: exportSQL }, "SQL Export"),
    el("button", { class: "btn", onclick: exportJSON }, "Tek Tık Backup"))));
}
async function fullDump() {
  if (DEMO) return DemoStore.load();
  const tables = ["categories", "forums", "threads", "posts", "profiles", "badges", "messages", "notifications", "settings"];
  const out = {};
  for (const t of tables) { const { data } = await sb.from(t).select("*"); out[t] = data || []; }
  return out;
}
async function exportJSON() {
  const data = await fullDump();
  downloadFile("forum-backup-" + Date.now() + ".json", JSON.stringify(data, null, 2), "application/json");
  toast("JSON indirildi.", "success");
}
async function exportSQL() {
  const data = await fullDump(); let sql = "-- Forum Engine Ultimate SQL Export\n";
  for (const [table, rows] of Object.entries(data)) {
    if (!Array.isArray(rows)) continue;
    rows.forEach((r) => {
      const cols = Object.keys(r); const vals = cols.map((k) => sqlVal(r[k]));
      sql += `INSERT INTO ${table} (${cols.join(", ")}) VALUES (${vals.join(", ")});\n`;
    });
  }
  downloadFile("forum-backup-" + Date.now() + ".sql", sql, "application/sql");
  toast("SQL indirildi.", "success");
}
function sqlVal(v) { if (v == null) return "NULL"; if (typeof v === "number") return v; if (typeof v === "boolean") return v ? "true" : "false"; if (typeof v === "object") return "'" + JSON.stringify(v).replace(/'/g, "''") + "'"; return "'" + String(v).replace(/'/g, "''") + "'"; }
function downloadFile(name, content, type) { const blob = new Blob([content], { type }); const a = el("a", { href: URL.createObjectURL(blob), download: name }); a.click(); URL.revokeObjectURL(a.href); }
async function adminLogs(c) {
  const logs = DEMO ? DemoStore.load().logs : ((await sb.from("logs").select("*").order("created_at", { ascending: false }).limit(100)).data || []);
  const tbody = el("tbody");
  logs.forEach((l) => tbody.append(el("tr", {}, el("td", {}, fmtDate(l.created_at) + " " + new Date(l.created_at).toLocaleTimeString("tr-TR")), el("td", {}, l.user || "—"), el("td", {}, l.action), el("td", {}, l.detail || ""))));
  if (!logs.length) tbody.append(el("tr", {}, el("td", { colspan: "4", class: "muted" }, "Log yok.")));
  c.append(adminPanel("📜 Log Kayıtları", el("div", { class: "table-wrap" }, el("table", { class: "data" }, el("thead", {}, el("tr", {}, el("th", {}, "Tarih"), el("th", {}, "Kullanıcı"), el("th", {}, "İşlem"), el("th", {}, "Detay"))), tbody))));
}

/* =========================================================
   11) SETUP WIZARD (ilk kurulum)
   ========================================================= */
async function needsSetup() {
  if (localStorage.getItem("fe_setup_done")) return false;
  if (DEMO) {
    // Demo: admin tohumlu olduğundan kurulum gerekmez (tohum admin'i var)
    localStorage.setItem("fe_setup_done", "1"); return false;
  }
  // Supabase: hiç admin yoksa kurulum gerekir
  try {
    const { count } = await sb.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if (count && count > 0) { localStorage.setItem("fe_setup_done", "1"); return false; }
    return true;
  } catch { return false; }
}
function viewSetup() {
  SEO.set({ title: "Kurulum" }); SEO.breadcrumb(null);
  const f = el("form", { class: "panel" },
    el("div", { class: "panel-head" }, el("h2", {}, "🚀 Forum Kurulumu")),
    el("div", { class: "panel-body" },
      el("p", { class: "muted" }, "İlk yönetici hesabını oluştur. Bu bilgiler koda gömülmez; Supabase Auth'a kaydedilir."),
      field("Yönetici Kullanıcı Adı", { name: "username", required: true }),
      field("E-posta", { name: "email", type: "email", required: true }),
      field("Şifre", { name: "password", type: "password", required: true, minlength: 6 }),
      el("button", { class: "btn btn-primary btn-block" }, "Kurulumu Tamamla")));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const u = await Auth.register({ username: f.username.value.trim(), email: f.email.value.trim(), password: f.password.value });
      if (!DEMO && u) await sb.from("profiles").update({ role: "admin", verified: true }).eq("id", u.id);
      localStorage.setItem("fe_setup_done", "1");
      toast("Kurulum tamamlandı! Yönetici hesabın hazır.", "success");
      navigate("#/"); renderHeaderUser(); router();
    } catch (err) { toast("Kurulum hatası: " + (err.message || err), "error"); }
  });
  setView(el("div", { class: "setup-wrap" }, f));
}

/* =========================================================
   12) REALTIME / BİLDİRİM / PM
   ========================================================= */
function clearChannels() { State.channels.forEach((ch) => { try { sb.removeChannel(ch); } catch {} }); State.channels = []; }
function subscribeThread(threadId) {
  if (DEMO || !sb) return;
  clearChannels();
  const ch = sb.channel("thread-" + threadId)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "posts", filter: "thread_id=eq." + threadId }, async (payload) => {
      const { data } = await sb.from("posts").select("*, profiles(*)").eq("id", payload.new.id).single();
      const thread = await DB.getThread(threadId);
      if (data && $("#posts-wrap")) { $("#posts-wrap").append(renderPost({ ...data, like_count: 0 }, thread, false)); toast("Yeni cevap geldi 💬", "info", 2000); }
    }).subscribe();
  State.channels.push(ch);
}
function subscribeGlobal() {
  if (DEMO || !sb || !State.user) return;
  const ch = sb.channel("notif-" + State.user.id)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: "user_id=eq." + State.user.id }, (payload) => {
      toast(notifIcon(payload.new.type) + " " + payload.new.text, "info", 4000); refreshBadges();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "to_id=eq." + State.user.id }, () => {
      toast("✉️ Yeni mesajın var", "info", 4000); refreshBadges();
    }).subscribe();
  State.channels.push(ch);
}
async function refreshBadges() {
  if (!Auth.isLogged()) { $("#notif-badge").hidden = true; $("#msg-badge").hidden = true; return; }
  let n = 0, m = 0;
  if (DEMO) { const db = DemoStore.load(); n = db.notifications.filter((x) => x.user_id === State.profile.id && !x.read).length; m = db.messages.filter((x) => x.to_id === State.profile.id && !x.read && !x.archived).length; }
  else {
    const [{ count: nc }, { count: mc }] = await Promise.all([
      sb.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", State.user.id).eq("read", false),
      sb.from("messages").select("id", { count: "exact", head: true }).eq("to_id", State.user.id).eq("read", false).eq("archived", false)]);
    n = nc || 0; m = mc || 0;
  }
  const nb = $("#notif-badge"), mb = $("#msg-badge");
  nb.textContent = n; nb.hidden = n === 0; mb.textContent = m; mb.hidden = m === 0;
}

/* =========================================================
   HEADER / MENÜLER
   ========================================================= */
function renderHeaderUser() {
  const dd = $("#profile-dropdown");
  const av = $("#header-avatar"), fb = $("#header-avatar-fallback");
  if (Auth.isLogged()) {
    av.src = avatarURL(State.profile); av.hidden = false; fb.hidden = true;
    dd.innerHTML = "";
    dd.append(el("div", { class: "dd-head" }, el("img", { src: avatarURL(State.profile), alt: "", style: "width:36px;height:36px;border-radius:50%" }),
      el("div", {}, el("strong", {}, State.profile.username), el("div", { class: "muted", style: "font-size:12px" }, roleLabel(State.profile.role)))));
    dd.append(el("div", { class: "dd-sep" }));
    dd.append(el("a", { href: `#/profil/${encodeURIComponent(State.profile.username)}` }, "👤 Profilim"));
    dd.append(el("a", { href: "#/mesajlar" }, "✉️ Mesajlar"));
    dd.append(el("a", { href: "#/bildirimler" }, "🔔 Bildirimler"));
    if (Auth.isAdmin()) dd.append(el("a", { href: "#/admin" }, "🛠️ Admin Paneli"));
    dd.append(el("button", { onclick: () => Auth.logout() }, "🚪 Çıkış Yap"));
  } else {
    av.hidden = true; fb.hidden = false;
    dd.innerHTML = "";
    dd.append(el("button", { onclick: () => openAuth("login") }, "🔑 Giriş Yap"));
    dd.append(el("button", { onclick: () => openAuth("register") }, "📝 Kayıt Ol"));
  }
  refreshBadges();
}
function closeAllMenus() {
  $("#profile-dropdown").hidden = true; $("#btn-profile").setAttribute("aria-expanded", "false");
  $("#notif-flyout").hidden = true;
  $("#search-dropdown").hidden = true;
  const mn = $("#mobile-nav"); mn.dataset.open = "false"; mn.hidden = true; $("#btn-mobile-menu").setAttribute("aria-expanded", "false");
}

function refreshFooterStats(s) {
  $("#fs-topics").textContent = nfmt(s.topics); $("#fs-posts").textContent = nfmt(s.posts);
  $("#fs-members").textContent = nfmt(s.members); $("#fs-today").textContent = nfmt(s.today);
  $("#fs-online").textContent = nfmt(s.online); $("#fs-last-member").textContent = s.last_member;
}

/* Canlı arama (header) */
const liveSearch = debounce(async (term) => {
  const dd = $("#search-dropdown");
  if (!term.trim()) { dd.hidden = true; return; }
  const { threads, users } = await DB.search(term);
  dd.innerHTML = ""; dd.hidden = false;
  if (!threads.length && !users.length) { dd.append(el("div", { class: "search-empty" }, "Sonuç yok.")); return; }
  threads.slice(0, 6).forEach((t) => dd.append(el("a", { class: "sd-item", href: threadURL(t), onclick: () => { dd.hidden = true; } },
    el("img", { src: avatarURL(t.profiles), alt: "", style: "width:32px;height:32px;border-radius:50%" }),
    el("div", {}, el("div", {}, "🧵 " + t.title), el("div", { class: "sd-cat" }, (t.profiles?.username || "?") + " · " + timeAgo(t.created_at))))));
  users.slice(0, 4).forEach((u) => dd.append(el("a", { class: "sd-item", href: `#/profil/${encodeURIComponent(u.username)}`, onclick: () => { dd.hidden = true; } },
    el("img", { src: avatarURL(u), alt: "", style: "width:32px;height:32px;border-radius:50%" }),
    el("div", {}, el("div", {}, "👤 " + u.username), el("div", { class: "sd-cat" }, roleLabel(u.role))))));
}, 250);

function buildMobileNav() {
  const mn = $("#mobile-nav"); mn.innerHTML = "";
  const search = el("form", { class: "m-row" }, el("input", { class: "input", id: "m-search", placeholder: "Ara…" }), el("button", { class: "btn", type: "submit" }, "🔍"));
  search.addEventListener("submit", (e) => { e.preventDefault(); navigate("#/arama/" + encodeURIComponent($("#m-search").value)); closeAllMenus(); });
  mn.append(search);
  mn.append(el("div", { class: "m-row" },
    el("a", { class: "btn btn-sm", href: "#/" }, "🏠 Ana Sayfa"), el("a", { class: "btn btn-sm", href: "#/uyeler" }, "👥 Üyeler"),
    el("a", { class: "btn btn-sm", href: "#/kurallar" }, "📋 Kurallar"), el("a", { class: "btn btn-sm", href: "#/sss" }, "❓ SSS"),
    el("a", { class: "btn btn-sm", href: "#/iletisim" }, "📨 İletişim")));
  const themeRow = el("div", { class: "m-row" }, el("span", { class: "muted" }, "Tema:"));
  THEMES.forEach((t) => themeRow.append(el("button", { class: "btn btn-sm", onclick: () => { applyTheme(t.id); } }, t.name)));
  mn.append(themeRow);
}

/* =========================================================
   STATİK İÇERİKLER
   ========================================================= */
const RULES_HTML = `
  <h3>Forum Kuralları</h3>
  <ol>
    <li>Saygılı olun; hakaret, nefret söylemi ve taciz yasaktır.</li>
    <li>Spam, reklam ve alakasız bağlantı paylaşmayın.</li>
    <li>Telif hakkı ihlali içeren içerik paylaşmayın.</li>
    <li>Konuyu doğru kategoride açın ve açıklayıcı başlık kullanın.</li>
    <li>Kişisel bilgileri (KVKK) paylaşmayın.</li>
  </ol>
  <p class="muted">Kurallara uymayan içerikler moderatörler tarafından kaldırılabilir.</p>`;
const FAQ_HTML = `
  <h3>Sıkça Sorulan Sorular</h3>
  <details open><summary><strong>Nasıl üye olurum?</strong></summary><p>Sağ üstteki profil menüsünden "Kayıt Ol" diyerek üye olabilirsiniz.</p></details>
  <details><summary><strong>Şifremi unuttum, ne yapmalıyım?</strong></summary><p>Giriş penceresindeki "Şifremi Unuttum" sekmesini kullanın.</p></details>
  <details><summary><strong>Temayı nasıl değiştiririm?</strong></summary><p>Üstteki 🎨 düğmesi veya footer'daki renk dairelerinden 4 tema arasında geçiş yapabilirsiniz.</p></details>
  <details><summary><strong>Konu nasıl açarım?</strong></summary><p>Üstteki ✏️ düğmesine basın, formu doldurun ve yayınlayın.</p></details>`;

/* =========================================================
   13) INIT
   ========================================================= */
function bindHeader() {
  $("#footer-year").textContent = new Date().getFullYear();
  renderFooterThemes();
  buildMobileNav();

  $("#btn-theme").addEventListener("click", cycleTheme);
  $("#btn-new-topic").addEventListener("click", () => requireAuth(() => openNewTopic()));
  $("#btn-profile").addEventListener("click", (e) => { e.stopPropagation(); const dd = $("#profile-dropdown"); const open = dd.hidden; closeAllMenus(); dd.hidden = !open; $("#btn-profile").setAttribute("aria-expanded", String(open)); });
  $("#btn-mobile-menu").addEventListener("click", (e) => { e.stopPropagation(); const mn = $("#mobile-nav"); const open = mn.hidden; closeAllMenus(); mn.hidden = !open; mn.dataset.open = String(open); $("#btn-mobile-menu").setAttribute("aria-expanded", String(open)); });

  $("#btn-notifications").addEventListener("click", async (e) => {
    e.stopPropagation();
    if (!Auth.isLogged()) return openAuth("login");
    const fly = $("#notif-flyout"); const open = fly.hidden; closeAllMenus();
    if (!open) return;
    fly.hidden = false; fly.innerHTML = "<h4>🔔 Bildirimler</h4><div class='fly-empty'><span class='loader'></span></div>";
    const items = await DB.getNotifications();
    fly.innerHTML = "<h4>🔔 Bildirimler</h4>";
    if (!items.length) fly.append(el("div", { class: "fly-empty" }, "Bildirim yok."));
    items.slice(0, 10).forEach((n) => fly.append(el("div", { class: "fly-item" + (n.read ? "" : " unread"), style: "cursor:pointer", onclick: () => { DB.markNotifRead(n.id); closeAllMenus(); if (n.link) navigate(n.link); } }, notifIcon(n.type) + " " + n.text)));
    fly.append(el("div", { class: "fly-item" }, el("a", { href: "#/bildirimler", onclick: closeAllMenus }, "Tümünü gör →")));
  });
  $("#btn-messages").addEventListener("click", () => { if (!Auth.isLogged()) return openAuth("login"); navigate("#/mesajlar"); });

  // Header arama
  const gs = $("#global-search");
  gs.addEventListener("input", (e) => liveSearch(e.target.value));
  $("#header-search").addEventListener("submit", (e) => { e.preventDefault(); $("#search-dropdown").hidden = true; navigate("#/arama/" + encodeURIComponent(gs.value)); });

  document.addEventListener("click", closeAllMenus);
  $("#profile-dropdown").addEventListener("click", (e) => e.stopPropagation());
  $("#notif-flyout").addEventListener("click", (e) => e.stopPropagation());
  $("#search-dropdown").addEventListener("click", (e) => e.stopPropagation());

  // Çevrimdışı durum (sayfa kapanınca)
  window.addEventListener("beforeunload", () => { if (SUPA_READY && State.user) navigator.sendBeacon && sb.from("profiles").update({ online: false }).eq("id", State.user.id); });
}

async function init() {
  try {
    bindHeader();
    await Auth.init();
    await DB.loadSettings();
    initTheme();
    renderHeaderUser();
    subscribeGlobal();
    window.addEventListener("hashchange", router);
    await router();
    if (DEMO) toast("Demo modunda çalışıyor (Supabase ayarlanmadı). 'AdminDevin' ile giriş yapabilirsin.", "warn", 6000);
  } catch (e) {
    console.error("Init hatası:", e);
    setView(el("div", { class: "panel" }, el("div", { class: "empty-state" }, el("div", { class: "big" }, "⚠️"), el("h2", {}, "Başlatma hatası"), el("p", { class: "muted" }, String(e.message || e)))));
  }
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
else init();

})();
