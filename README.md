# StateFlow

A production-grade workflow automation platform built with **Next.js**, **Express**, and **Supabase**.

## 🏗️ Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Next.js UI    │────▶│   Express API   │────▶│    Supabase     │
│   (apps/web)    │     │   (apps/api)    │     │   (PostgreSQL)  │
└─────────────────┘     └────────┬────────┘     └─────────────────┘
                                 │
                        ┌────────▼────────┐
                        │ Workflow Engine │
                        │   (packages/)   │
                        └─────────────────┘
```

## 📦 Project Structure

```
stateflow/
├── apps/
│   ├── web/              # Next.js 14 frontend
│   └── api/              # Express backend + workers
├── packages/
│   ├── db/               # Supabase client + repositories
│   ├── workflows/        # Workflow engine core
│   ├── shared/           # Shared types & constants
│   └── config/           # Shared ESLint/TSConfig
├── infra/
│   ├── migrations/       # SQL migrations
│   ├── seed/             # Database seeding
│   └── docker/           # Docker compose
└── docs/                 # Architecture documentation
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- pnpm 8+
- Supabase account (or Docker for local Postgres)

### Installation

```bash
# Clone and install dependencies
pnpm install

# Copy environment variables
cp .env.example .env
# Fill in your Supabase credentials
```

### Development

```bash
# Start all services
pnpm dev

# Or start individually
pnpm dev:web   # Next.js on http://localhost:3000
pnpm dev:api   # Express on http://localhost:4000
```

### Database Setup

```bash
# Run migrations (via Supabase dashboard or CLI)
# Then seed sample data
cd infra/seed && npx tsx seed.ts
```

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all services in development mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm typecheck` | Run TypeScript type checking |
| `pnpm clean` | Clean all build outputs |

## 🏛️ Tech Stack

- **Frontend**: Next.js 14 (App Router)
- **Backend**: Express.js
- **Database**: Supabase (PostgreSQL)
- **Language**: TypeScript
- **Package Manager**: pnpm (workspaces)

## 📖 Documentation

- [Architecture Overview](./docs/architecture.md)

## 📄 License

MIT
