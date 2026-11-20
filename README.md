# ⚡ Pulse Backend — City Events & Social Discovery API

Pulse Backend is a high-performance RESTful API and real-time WebSocket backend engineered with [NestJS 11](https://nestjs.com/), [TypeScript](https://www.typescriptlang.org/), [Prisma ORM](https://www.prisma.io/), and [PostgreSQL](https://www.postgresql.org/). It powers the **Pulse (Пульс)** urban event and nightlife discovery mobile platform, providing event management, geospatial venue search, real-time event chatrooms, multi-provider OAuth, Telegram moderation bots, and Firebase push notification broadcasting.

---

## 🚀 Features

- **🎉 Event & Venue Lifecycle Engine**: Complete management of nightlife events, concerts, festivals, cultural meetups, venue profiles, working hours, and media galleries.
- **💬 Real-Time Live Chatrooms**: WebSocket server powered by `@nestjs/platform-socket.io` handling event-specific chatrooms, direct messaging, and live attendee coordination.
- **🤖 Automated Telegram Moderation Bot**: Integrated `node-telegram-bot-api` alerting administrators about newly submitted events, user complaints, and organizer verification requests.
- **🔐 Multi-Provider Authentication**: Flexible authentication system supporting Apple Sign-In, Google OAuth, Telegram Login, and JWT access/refresh token rotation.
- **🗺️ Geospatial & Multi-City Architecture**: City-level partitioning (Minsk and beyond) with geographical coordinates, radius calculations, and venue clustering.
- **🔔 Firebase Push Notifications**: Background push notification dispatcher via `firebase-admin` for event start reminders, new chat messages, and moderation status updates.
- **🛡️ Community Moderation & Complaints**: Automated spam detection, review auditing, and user reporting pipelines to maintain content quality.
- **🐳 Production Ready**: Containerized with Docker and Docker Compose, reverse proxied by [Caddy](https://caddyserver.com/) with automated HTTPS.
- **📑 OpenAPI / Swagger Documentation**: Interactive API testing playground available at `/api/docs`.

---

## 🛠️ Tech Stack

- **Framework**: [NestJS 11](https://nestjs.com/) (Express HTTP adapter, modular architecture)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Database & ORM**: [PostgreSQL 16](https://www.postgresql.org/) with [Prisma ORM 5](https://www.prisma.io/)
- **Real-Time Communication**: [Socket.IO](https://socket.io/) (`@nestjs/websockets`, `@nestjs/platform-socket.io`)
- **Authentication**: [Passport.js](http://www.passportjs.org/), JWT (`@nestjs/jwt`), and bcrypt
- **External Integrations**: Firebase Admin SDK (FCM notifications), Telegram Bot API (`node-telegram-bot-api`)
- **Deployment & Proxy**: Docker, Docker Compose, and Caddy Web Server
- **Documentation**: [Swagger / OpenAPI 3](https://swagger.io/) (`@nestjs/swagger`)
- **Testing**: [Jest](https://jestjs.io/) (Unit, Integration, and E2E tests)

---

## 📦 Installation & Setup

### Prerequisites
- [Node.js](https://nodejs.org/) (`>= 20.0.0`)
- [npm](https://www.npmjs.com/) (`>= 10.0.0`)
- [PostgreSQL](https://www.postgresql.org/) (`>= 15.0`) or Docker

### Getting Started

1. **Clone the repository**:
   ```bash
   git clone https://github.com/glebanya13/pulse-backend.git
   cd pulse-backend
   ```

2. **Configure Environment Variables**:
   Copy the example environment configuration:
   ```bash
   cp .env.example .env
   ```
   Set up your PostgreSQL database URL, JWT secret, and integration credentials:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pulse?schema=public"
   PORT=3000
   JWT_SECRET="your-super-secure-jwt-secret"
   JWT_EXPIRES_IN="15m"
   REFRESH_SECRET="your-super-secure-refresh-secret"
   REFRESH_EXPIRES_IN="30d"

   # Telegram Bot (for admin alerts)
   TELEGRAM_BOT_TOKEN="your-telegram-bot-token"
   TELEGRAM_ADMIN_CHAT_ID="your-chat-id"

   # Firebase Service Account (JSON path or inline)
   FIREBASE_SERVICE_ACCOUNT_PATH="./firebase-adminsdk.json"
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Initialize Database & Seed Data**:
   ```bash
   # Generate Prisma client
   npx prisma generate

   # Run database migrations
   npx prisma migrate dev

   # Seed default cities, sample events, and categories
   npm run seed
   ```

5. **Start the API Server**:
   ```bash
   # Development mode with hot-reload
   npm run start:dev

   # Production build and launch
   npm run build
   npm run start:prod
   ```

6. **Interactive Documentation**:
   Visit [http://localhost:3000/api/docs](http://localhost:3000/api/docs) to explore all REST endpoints.

---

## 🐳 Docker Deployment

To spin up PostgreSQL, the NestJS API, and Caddy reverse proxy via Docker Compose:

```bash
# Start all containers in background
docker compose up -d --build

# View application logs
docker compose logs -f api
```

---

## 💻 Usage & Testing

```bash
# Run unit tests
npm run test

# Run tests with live watch mode
npm run test:watch

# Run test coverage report
npm run test:cov

# Run end-to-end (E2E) integration tests
npm run test:e2e

# Execute ESLint validation
npm run lint
```

---

## 📂 Project Structure

```markdown
pulse-backend/
|-- deploy/
|    `-- Caddyfile                  # Production Caddy reverse proxy & auto-HTTPS
|-- prisma/
|    |-- schema.prisma              # Database models, relations, enums & indexes
|    |-- migrations/                # Versioned SQL migration history
|    `-- seed.ts                    # Initial fixtures, city boundaries & categories
|-- src/
|    |-- admin/                     # Admin control panel, metrics & dashboard
|    |-- applications/              # Organizer verification application flow
|    |-- auth/                      # JWT authentication, refresh cookies, passport
|    |-- badges/                    # Reputation & verification badges
|    |-- chats/                     # WebSocket chat gateways & message repositories
|    |-- cities/                    # Multi-city coordinates & boundaries
|    |-- common/                    # Guards, interceptors, pipes, filters, decorators
|    |-- complaints/                # User reports & moderation flags
|    |-- events/                    # Event catalog, schedules, tickets & filtering
|    |-- favorites/                 # User bookmarks & event wishlists
|    |-- moderation/                # Approval workflows for user submissions
|    |-- monetization/              # Event promotion plans & billing
|    |-- notifications/             # Firebase Cloud Messaging push dispatch
|    |-- oauth/                     # Apple, Google & Telegram social sign-in
|    |-- payments/                  # Payment gateway integration & order logs
|    |-- places/                    # Venue guide, clubs, bars & coordinates
|    |-- prisma/                    # Injectable PrismaService database client
|    |-- requests/                  # Event creation requests from organizers
|    |-- reviews/                   # Venue reviews, ratings & feedback
|    |-- social/                    # Attendee connections & social shares
|    |-- telegram/                  # Telegram Bot moderation alert service
|    |-- users/                     # User profile management & roles
|    |-- app.module.ts              # Root dependency injection module
|    `-- main.ts                    # Application bootstrap, Swagger & WebSocket setup
|-- docker-compose.yml              # Local Docker Compose setup
|-- docker-compose.prod.yml         # Production multi-container setup with Caddy
|-- Dockerfile                      # Production container build
|-- package.json                    # Project dependencies and npm scripts
`-- tsconfig.json                   # TypeScript compiler options
```

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:
1. Fork the repository: `git fork https://github.com/glebanya13/pulse-backend.git`
2. Create your feature branch: `git checkout -b feature/new-feature`
3. Commit your changes: `git commit -m "feat: Add event recurrence support"`
4. Push to branch: `git push origin feature/new-feature`
5. Open a Pull Request.

---

## 📝 License

This project is licensed under the **MIT License**.

---

## 📬 Contact

For inquiries or API support:
- **Author**: [@glebanya13](https://github.com/glebanya13)
- **Email**: [glebanya.com@gmail.com](mailto:glebanya.com@gmail.com)
- **Issues**: [GitHub Issues](https://github.com/glebanya13/pulse-backend/issues)
