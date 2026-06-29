-- =====================================================================
--  Forum Engine Ultimate v10 — Supabase Şeması + RLS
--  Supabase > SQL Editor'a yapıştırıp "Run" deyin. (Tek seferlik kurulum)
--  Not: Bu dosya siteye yüklenmez; yalnızca veritabanı kurulumu içindir.
-- =====================================================================

-- ---------- PROFİLLER (auth.users ile 1-1) ----------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  username      text unique not null,
  avatar_url    text,
  role          text not null default 'user' check (role in ('user','moderator','admin')),
  verified      boolean default false,
  online        boolean default false,
  job           text,
  city          text,
  country       text,
  post_count    int default 0,
  thread_count  int default 0,
  likes         int default 0,
  trade_points  int default 0,
  badges        jsonb default '[]'::jsonb,
  signature     text,
  social        jsonb default '{}'::jsonb,
  postbit_layout text default 'vertical',
  theme         text default 'midnight',
  joined_at     timestamptz default now()
);

-- ---------- KATEGORİ / FORUM ----------
create table if not exists public.categories (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  position  int default 0
);
create table if not exists public.forums (
  id          uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete cascade,
  parent_id   uuid references public.forums(id) on delete set null,
  name        text not null,
  slug        text,
  description text,
  icon        text default '📁',
  position    int default 0
);

-- ---------- KONULAR / POSTLAR ----------
create table if not exists public.threads (
  id           uuid primary key default gen_random_uuid(),
  forum_id     uuid references public.forums(id) on delete cascade,
  user_id      uuid references public.profiles(id) on delete set null,
  title        text not null,
  slug         text not null,
  content      text,
  tags         jsonb default '[]'::jsonb,
  pinned       boolean default false,
  locked       boolean default false,
  views        int default 0,
  created_at   timestamptz default now(),
  last_post_at timestamptz default now()
);
create table if not exists public.posts (
  id         uuid primary key default gen_random_uuid(),
  thread_id  uuid references public.threads(id) on delete cascade,
  user_id    uuid references public.profiles(id) on delete set null,
  content    text not null,
  created_at timestamptz default now(),
  edited_at  timestamptz
);

-- ---------- İLİŞKİLER ----------
create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid references public.posts(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete cascade,
  unique (post_id, user_id)
);
create table if not exists public.follows   (id uuid primary key default gen_random_uuid(), thread_id uuid references public.threads(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, unique(thread_id,user_id));
create table if not exists public.favorites (id uuid primary key default gen_random_uuid(), thread_id uuid references public.threads(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, unique(thread_id,user_id));
create table if not exists public.saves     (id uuid primary key default gen_random_uuid(), thread_id uuid references public.threads(id) on delete cascade, user_id uuid references public.profiles(id) on delete cascade, unique(thread_id,user_id));

-- ---------- BİLDİRİM / MESAJ ----------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  type text, text text, link text, read boolean default false,
  created_at timestamptz default now()
);
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  from_id uuid references public.profiles(id) on delete cascade,
  to_id   uuid references public.profiles(id) on delete cascade,
  subject text, body text, read boolean default false, archived boolean default false,
  created_at timestamptz default now()
);

-- ---------- ROZET / TİCARİ / LOG / BAN / AYAR ----------
create table if not exists public.badges (id uuid primary key default gen_random_uuid(), name text, icon text, description text);
create table if not exists public.trade_log (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete cascade, delta int, reason text, created_at timestamptz default now());
create table if not exists public.logs (id uuid primary key default gen_random_uuid(), user_id uuid, action text, detail text, created_at timestamptz default now());
create table if not exists public.bans (id uuid primary key default gen_random_uuid(), user_id uuid references public.profiles(id) on delete cascade, reason text, created_at timestamptz default now());
create table if not exists public.settings (key text primary key, value text);

-- ---------- VIEW SAYACI RPC ----------
create or replace function public.increment_views(thread_id uuid)
returns void language sql as $$
  update public.threads set views = views + 1 where id = thread_id;
$$;

-- ---------- YENİ KAYIT -> profiles otomatik ----------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email,'@',1)))
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- yardımcı: admin mi? ----------
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role in ('admin','moderator'));
$$;

-- =====================================================================
--  ROW LEVEL SECURITY
-- =====================================================================
alter table public.profiles      enable row level security;
alter table public.categories    enable row level security;
alter table public.forums        enable row level security;
alter table public.threads       enable row level security;
alter table public.posts         enable row level security;
alter table public.likes         enable row level security;
alter table public.follows       enable row level security;
alter table public.favorites     enable row level security;
alter table public.saves         enable row level security;
alter table public.notifications enable row level security;
alter table public.messages      enable row level security;
alter table public.badges        enable row level security;
alter table public.trade_log     enable row level security;
alter table public.logs          enable row level security;
alter table public.bans          enable row level security;
alter table public.settings      enable row level security;

-- Herkese açık okuma
create policy "read_all_profiles"   on public.profiles   for select using (true);
create policy "read_all_categories" on public.categories for select using (true);
create policy "read_all_forums"     on public.forums     for select using (true);
create policy "read_all_threads"    on public.threads    for select using (true);
create policy "read_all_posts"      on public.posts      for select using (true);
create policy "read_all_likes"      on public.likes      for select using (true);
create policy "read_all_badges"     on public.badges     for select using (true);
create policy "read_all_settings"   on public.settings   for select using (true);

-- Profil: sahibi günceller, admin her şeyi
create policy "update_own_profile" on public.profiles for update using (auth.uid() = id or public.is_admin());

-- Konu: giriş yapan açar, sahibi/mod düzenler-siler
create policy "insert_thread" on public.threads for insert with check (auth.uid() = user_id);
create policy "update_thread" on public.threads for update using (auth.uid() = user_id or public.is_admin());
create policy "delete_thread" on public.threads for delete using (auth.uid() = user_id or public.is_admin());

-- Post
create policy "insert_post" on public.posts for insert with check (auth.uid() = user_id);
create policy "update_post" on public.posts for update using (auth.uid() = user_id or public.is_admin());
create policy "delete_post" on public.posts for delete using (auth.uid() = user_id or public.is_admin());

-- Beğeni / ilişki tabloları: kendi kaydını ekler/siler
create policy "like_insert" on public.likes for insert with check (auth.uid() = user_id);
create policy "like_delete" on public.likes for delete using (auth.uid() = user_id);
create policy "follow_all"  on public.follows   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "fav_all"     on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "save_all"    on public.saves     for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Bildirim: yalnız sahibi görür/günceller
create policy "notif_select" on public.notifications for select using (auth.uid() = user_id);
create policy "notif_update" on public.notifications for update using (auth.uid() = user_id);
create policy "notif_insert" on public.notifications for insert with check (true);

-- Mesaj: gönderen/alıcı erişir
create policy "msg_select" on public.messages for select using (auth.uid() = from_id or auth.uid() = to_id);
create policy "msg_insert" on public.messages for insert with check (auth.uid() = from_id);
create policy "msg_update" on public.messages for update using (auth.uid() = to_id or auth.uid() = from_id);

-- Yönetim tabloları: yalnız admin/mod
create policy "admin_categories" on public.categories for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_forums"     on public.forums     for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_badges"     on public.badges     for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_trade"      on public.trade_log  for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_logs"       on public.logs       for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_bans"       on public.bans       for all using (public.is_admin()) with check (public.is_admin());
create policy "admin_settings"   on public.settings   for all using (public.is_admin()) with check (public.is_admin());

-- ---------- REALTIME açık tablolar ----------
alter publication supabase_realtime add table public.posts;
alter publication supabase_realtime add table public.notifications;
alter publication supabase_realtime add table public.messages;

-- ---------- (Opsiyonel) örnek kategori/forum ----------
insert into public.categories (name, position) values ('Genel', 1), ('Yazılım & Teknoloji', 2)
  on conflict do nothing;
