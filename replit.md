# MedicaidSleuth

## Overview

MedicaidSleuth is a Medicaid provider spending analysis and fraud detection application. It serves as a "bounty hunter" dashboard that allows users to query Medicaid spending data, visualize billing trends, and automatically scan for fraud spikes (anomalous billing growth patterns). The app is inspired by real-world cases like the Minnesota autism billing scandal.

The application has six main features:
- **Authentication** — User registration and login with secure password hashing (bcrypt) and session-based auth (express-session with PostgreSQL-backed sessions)
- **Dashboard** — Overview of total claims, providers, states, spending, and flagged alerts (with logout button in header)
- **Explorer** — Browse and filter providers by state and procedure code, with drill-down to individual provider detail pages
- **Scanner** — Automated fraud detection that identifies providers with anomalous billing growth, categorized by severity (critical, high, medium)
- **Assistant** — AI-powered fraud analysis assistant (Sleuth AI) using OpenRouter via Replit AI Integrations. Supports streaming chat, conversation history, and Medicaid-specific system prompt
- **Plans** — Subscription pricing page with Stripe-powered checkout for Analyst ($29/mo) and Investigator ($79/mo) tiers

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Full-Stack Architecture (Expo + Express)

The project uses a monorepo structure with a React Native (Expo) frontend and an Express.js backend running together.

- **Frontend**: Expo SDK 54 with expo-router (file-based routing), targeting web, iOS, and Android. The app runs primarily as a web app on Replit but is structured for cross-platform deployment.
- **Backend**: Express.js server (`server/`) that provides REST API endpoints and serves the built frontend in production.
- **Shared code**: The `shared/` directory contains Drizzle ORM schema definitions and Zod validation schemas used by both frontend and backend.

### Frontend Structure

| Path | Purpose |
|------|---------|
| `app/(tabs)/index.tsx` | Dashboard tab — stats overview and top fraud alerts |
| `app/(tabs)/explorer.tsx` | Explorer tab — provider listing with state/procedure filters |
| `app/(tabs)/scanner.tsx` | Scanner tab — fraud detection results with severity levels |
| `app/(tabs)/assistant.tsx` | Assistant tab — AI chat interface for fraud analysis |
| `app/provider/[id].tsx` | Provider detail screen — monthly billing trends and alerts |
| `app/_layout.tsx` | Root layout with font loading, query client, gesture handler |
| `components/` | Reusable components (ErrorBoundary, ErrorFallback, AuthScreen, KeyboardAwareScrollView) |
| `lib/auth.tsx` | AuthProvider context and useAuth hook for user authentication state |
| `constants/colors.ts` | Dark theme color palette (the app uses a dark UI theme exclusively) |
| `lib/query-client.ts` | TanStack Query setup with API request helpers |

### Backend Structure

| Path | Purpose |
|------|---------|
| `server/index.ts` | Express server setup, CORS, static file serving |
| `server/routes.ts` | API route definitions with mock Medicaid claims data |
| `server/auth.ts` | Authentication routes (register, login, logout, /api/user) and session setup |
| `server/db.ts` | Drizzle ORM database connection pool |
| `server/storage.ts` | Database-backed storage layer (DatabaseStorage using Drizzle + PostgreSQL) |
| `server/stripeClient.ts` | Stripe client setup using Replit connection API for credentials |
| `server/webhookHandlers.ts` | Stripe webhook processing via stripe-replit-sync |
| `server/seed-products.ts` | Script to seed subscription products in Stripe |
| `server/replit_integrations/chat/` | AI chat routes and storage (OpenRouter via Replit AI Integrations) |
| `server/templates/landing-page.html` | Landing page for non-web-app visitors |

### Data Layer

- **Claims data**: The backend uses in-memory mock data generated in `server/routes.ts` to simulate T-MSIS (Transformed Medicaid Statistical Information System) claims data. The mock data includes providers, procedure codes, states, and monthly billing totals.
- **Database schema**: Drizzle ORM with PostgreSQL is configured (`shared/schema.ts`, `drizzle.config.ts`) with `users`, `conversations`, and `messages` tables. Sessions are stored in a `session` table (created automatically by connect-pg-simple).
- **Storage interface**: `IStorage` interface with `DatabaseStorage` implementation using Drizzle ORM for user CRUD operations.

### Key Design Patterns

- **File-based routing**: expo-router maps the `app/` directory to navigation routes
- **Tab navigation**: Five main tabs (Dashboard, Explorer, Scanner, Assistant, Plans) with a detail screen for providers
- **API pattern**: Frontend uses TanStack React Query to fetch from the Express backend. API base URL is derived from `EXPO_PUBLIC_DOMAIN` environment variable.
- **Color system**: Single dark color theme defined in `constants/colors.ts` — deep space navy (#060D1B) background, vivid cyan (#00E5CC) accent, coral danger (#FF4D6A), amber warning (#FFB020), electric blue (#4C7CFF) secondary accent. The app does NOT use light/dark mode switching, it's always dark themed
- **Animations**: Uses react-native-reanimated for entry animations (FadeIn, FadeInDown, spring animations), animated progress bars, pulsing scan rings, and animated bar charts
- **Haptic feedback**: Uses expo-haptics for touch feedback on interactive elements
- **UI design language**: Bloomberg Terminal / Coinbase Pro inspired. Cards use left-accent color stripes for severity coding. Provider avatars with flag dots. Risk bars with animated fill. Threat meter on scanner. Mini spend bars on explorer cards.

### Build & Run

- **Development**: Two processes run simultaneously — `expo:dev` for the frontend bundler and `server:dev` for the Express API
- **Production**: Frontend is built with `expo:static:build`, backend with `server:build`, then served with `server:prod`
- **Database migrations**: `npm run db:push` uses drizzle-kit to push schema to PostgreSQL

## External Dependencies

### Database
- **PostgreSQL** via `DATABASE_URL` environment variable — configured with Drizzle ORM but minimally used (only users table defined). The main claims/fraud data is currently mock/in-memory.

### Key NPM Packages
- **expo** (~54.0.27) — React Native framework with web support
- **expo-router** (~6.0.17) — File-based routing
- **express** (^5.0.1) — Backend API server
- **drizzle-orm** (^0.39.3) + **drizzle-kit** — Database ORM and migration tool
- **@tanstack/react-query** (^5.83.0) — Data fetching and caching
- **react-native-reanimated** (~4.1.1) — Animations
- **expo-linear-gradient** — Gradient backgrounds
- **expo-haptics** — Haptic feedback
- **@expo-google-fonts/dm-sans** — Typography (DM Sans font family)
- **pg** (^8.16.3) — PostgreSQL client
- **zod** + **drizzle-zod** — Schema validation

### Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (required for drizzle-kit and chat storage)
- `EXPO_PUBLIC_DOMAIN` — Domain for API requests from the frontend
- `REPLIT_DEV_DOMAIN` — Replit development domain (auto-set by Replit)
- `REPLIT_DOMAINS` — Replit deployment domains for CORS (auto-set by Replit)
- `AI_INTEGRATIONS_OPENROUTER_BASE_URL` — OpenRouter API base URL (auto-set by Replit AI Integrations)
- `AI_INTEGRATIONS_OPENROUTER_API_KEY` — OpenRouter API key (auto-set by Replit AI Integrations)