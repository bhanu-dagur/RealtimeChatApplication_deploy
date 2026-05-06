# ConnectHub — Realtime Chat Application

A microservices-based realtime chat platform built with **.NET 8**, **SignalR**, **Angular**, and **PostgreSQL**.

## Architecture

```
                   ┌────────────────┐
                   │  Angular SPA   │ (Vercel)
                   └────────┬───────┘
                            │ HTTPS / WSS
                            ▼
                  ┌──────────────────┐
                  │  YARP  Gateway   │ (Render)
                  └────────┬─────────┘
       ┌────────────┬──────┼──────────┬─────────────┬──────────┐
       ▼            ▼      ▼          ▼             ▼          ▼
   ┌──────┐    ┌────────┐ ┌────┐ ┌─────────┐ ┌──────────────┐ ┌───────┐
   │ Auth │    │Message │ │Room│ │  Hub    │ │ Notification │ │ Media │
   │ API  │    │  API   │ │API │ │(SignalR)│ │     API      │ │  API  │
   └──┬───┘    └────┬───┘ └─┬──┘ └────┬────┘ └──────┬───────┘ └───┬───┘
      │             │       │         │             │             │
      └─────────────┴───────┴─────┬───┴─────────────┘             │
                                  ▼                               ▼
                       ┌──────────────────┐              ┌──────────────┐
                       │  Neon Postgres   │              │  Cloudinary  │
                       └──────────────────┘              └──────────────┘
                                  ▲
                                  │
                       ┌──────────────────┐
                       │  Upstash Redis   │ (SignalR backplane)
                       └──────────────────┘
```

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Angular 17, TailwindCSS, SignalR client |
| API gateway | YARP (reverse proxy + rate limiting) |
| Backend services | ASP.NET Core 8 Web API |
| Realtime | SignalR (WebSocket transport, Redis backplane) |
| Database | PostgreSQL (Neon serverless) |
| Cache / pub-sub | Redis (Upstash) |
| Object storage | Cloudinary |
| Auth | JWT bearer + Google OAuth 2.0 |
| Containerization | Docker, docker-compose |
| Hosting | Render (backend), Vercel (frontend) |

## Services

| Service | Path | Responsibility |
|---|---|---|
| `ConnectHub.Auth.API` | `Services/ConnectHub.Auth.API` | Registration, login, JWT issuance, Google OAuth, user profiles |
| `ConnectHub.Message.API` | `Services/ConnectHub.Message.API` | Direct + room messages, persistence, history |
| `ConnectHub.Room.API` | `Services/ConnectHub.Room.API` | Room CRUD, membership, invitations |
| `ConnectHub.Hub.API` | `Services/ConnectHub.Hub.API` | SignalR hub for presence + realtime broadcast |
| `ConnectHub.Notification.API` | `Services/ConnectHub.Notification.API` | In-app notifications, email (SMTP) |
| `ConnectHub.Media.API` | `Services/ConnectHub.Media.API` | File/image uploads via Cloudinary |
| `ConnectHub.Gateway` | `ConnectHub.Gateway` | Single public ingress (YARP) |

## Local development

### Prerequisites
- .NET 8 SDK
- Node 20+ / npm
- Docker Desktop (optional — for compose)
- Postgres connection (Neon free tier works)

### 1. Clone and configure

```bash
git clone https://github.com/bhanu-dagur/RealtimeChatApplication.git
cd RealtimeChatApplication
```

Copy `.env.example` to `.env` and fill values:
```bash
cp .env.example .env
```

For each backend service, create `appsettings.Development.json` with your local secrets (this file is git-ignored). See the example shapes already present in each service folder.

### 2. Run via docker-compose
```bash
docker-compose up --build
```
Frontend: http://localhost:4200 — Gateway: http://localhost:5000

### 3. Or run individually
```bash
# Backend (one terminal per service or use start-all.ps1)
cd ConnectHub/src
./start-all.ps1

# Frontend
cd ConnectHub.Web
npm install
npm start
```

## Database migrations

The `ConnectHub/src/neon-migration-scripts/` folder contains SQL scripts already applied to the shared Neon database. Each service uses table-prefixed migration history to coexist in one Postgres database (free-tier friendly).

To recreate from scratch:
```bash
psql "<neon-connection-string>" -f ConnectHub/src/neon-migration-scripts/all-services.sql
```

## Deployment

### Backend → Render (free tier)
1. Push to GitHub
2. Render Dashboard → **New +** → **Blueprint** → select this repo
3. Render reads `render.yaml` and creates 7 services
4. Fill the `sync: false` env vars when prompted (Neon connection, JWT key, Redis URL, Cloudinary, SMTP)
5. **Apply** — first build ~15 min, subsequent pushes auto-deploy

### Frontend → Vercel (free tier)
1. Vercel Dashboard → **New Project** → import this repo
2. **Root Directory**: `ConnectHub.Web`
3. Framework: Angular (auto-detected)
4. Output dir: `dist/connect-hub-web/browser`
5. Deploy

After deploy, update `ConnectHub.Web/src/environments/environment.prod.ts` if your gateway URL differs from `https://connecthub-gateway.onrender.com`.

## Free-tier notes

- **Render free** services sleep after 15 min idle. First request after sleep takes 30–60 s. Use UptimeRobot pings on the Gateway + Hub to keep them warm during demos.
- **Neon free** has 0.5 GB storage and 1 project — all 6 services share the `neondb` database with prefixed migration history.
- **Upstash Redis free** allows 10k commands/day. Adequate for demo / 1–10 concurrent users.
- **Cloudinary free** allows 25 GB storage and 25 GB bandwidth/month.

## License

MIT — see [LICENSE](./LICENSE).
