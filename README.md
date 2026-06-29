# Forum Engine Ultimate v10

vBulletin 3.8 ruhu + modern Threads deneyimi. Saf **Vanilla JavaScript (ES2025)**, **HTML5**, **CSS3**, **Supabase** ve otomasyon için **Python**. Framework / build adımı / Node bağımlılığı **yok**. GitHub Pages'e yüklendiği anda çalışır.

## Yayınlanan dosyalar (site)
| Dosya | Açıklama |
|------|----------|
| `index.html` | Uygulama kabuğu, SEO meta, JSON-LD, CSP. Başında yalnızca 3 ayar. |
| `tema.css` | 4 tema, responsive (mobile-first), tüm bileşenler. |
| `tema.js` | SPA router, Supabase, auth, forum, thread, postbit, admin, realtime, arama, bildirim, PM, setup wizard, SEO, benzer konu (Levenshtein). |
| `rss.xml` | RSS beslemesi (cron günceller). |
| `sitemap.xml` | Site haritası (cron günceller). |
| `tema.cron` | Python otomasyon: rss.xml/sitemap.xml üretimi + RSS içe aktarma. |

## Kurulum yardımcıları (siteye yüklenmez)
- `supabase-schema.sql` — Supabase SQL editöründe bir kez çalıştırılır (tablolar + RLS + realtime).
- `.github/workflows/tema-cron.yml` — `tema.cron`'u saatlik çalıştırır.

## 3 ayar
`index.html` başındaki `window.CONFIG`:
```js
window.CONFIG = {
  SUPABASE_URL:      "https://xxxx.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key",
  FORMSUBMIT_MAIL:   "mail@ornek.com"
};
```
> Ayar boş bırakılırsa site **DEMO modunda** (localStorage) çalışır; `AdminDevin` ile giriş yaparak tüm özellikleri (admin dahil) denersiniz.

## Hızlı başlangıç
1. Supabase projesi aç → `supabase-schema.sql` içeriğini SQL Editor'da çalıştır.
2. Supabase > Settings > API'den `Project URL` ve `anon key` al, `index.html`'e yaz.
3. Repo'yu GitHub'a yükle, **Settings > Pages > Deploy from branch (main /root)**.
4. İlk açılışta **Setup Wizard** ilk yönetici hesabını oluşturur (kodda gömülü admin yoktur).
