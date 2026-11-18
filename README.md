# Selah Live (Next.js, JSX, plain CSS)

```bash
npm install
cp .env.example .env.local   # optional: add Firebase + Neon keys; without them the app runs in local demo mode
npm run dev                  # http://localhost:3000
```

## Routes
| Route | What |
|---|---|
| `/` | Landing page + Install button |
| `/signup`, `/login` | Auth (Firebase, or local demo mode if no keys) |
| `/setup` | 6-step wizard (OBS WebSocket, connect, auto-add overlay, libraries, tips) |
| `/app/scripture` `songs` `text` `library` `display` `settings` | Main app |
| `/overlay?pair=CODE#pw=OBS_PASSWORD` | OBS Browser Source (added automatically by the wizard) |
| `/dock?pair=CODE#pw=OBS_PASSWORD` | OBS dock with the 3 s ping / 2 s pong fail-safe (link from Settings) |
| `/admin` | Owner Admin panel (Dashboard, Bible versions, Song packs, Releases, Users, Audit log, Settings) |

## Features
- **Offline-first PWA**: Service worker + IndexedDB (`packs`, `settings`, `lists`) with automatic manifest polling (`/api/manifest`), `.json.gz` / `.zip` decompression, SHA-256 verification, and one-click version rollback.
- **OBS Studio integration**: Built-in `obs-websocket` v5 client, automatic `Selah Live Overlay` Browser Source creation (`1920×1080`), Lower Third & Full Screen layouts with auto-fit text, church logo crop, watermark, and subtle animated gradient.
- **Thin OBS Dock**: Pings the app every 3 seconds and shows the locked fail-safe screen if no `pong` arrives within 2 seconds.
- **Admin Panel & Backend**: JSON/Zefania XML/OSIS XML Bible uploads, 20-song minimum song pack enforcement with inline editing, `.json.gz` pack builder, release & notification management, anonymous analytics with CSV export, user management, and server-side audit logging.
