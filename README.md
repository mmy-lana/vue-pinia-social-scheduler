# Social Scheduler (Local-First Social Media Dashboard)

A modern, offline-first social media planner and scheduling dashboard inspired by Buffer and Hootsuite. Built with Vue 3, Pinia, Tailwind CSS v4, and TypeScript. All scheduling, queue calculation, media compression, and publication logic run strictly inside your browser sandbox.

- Live Application: https://vue-pinia-social-scheduler.vercel.app
- Source Repository: https://github.com/mmy-lana/vue-pinia-social-scheduler

---

## Frequently Asked Questions & Project Purpose

### What is this project for?
Social Scheduler is a local-first content planning and staging workbench. It allows content creators, agency managers, and developers to:
- Draft and organize social media posts across multiple channels simultaneously.
- Verify platform-specific character limits, media rules, and crop ratios before publishing.
- Simulate recurring weekly queue slots and automated posting runs without setting up server infrastructure.
- Experiment with scheduling workflows in a completely private environment.

### Does it publish directly to real social media accounts?
No. Publishing is entirely simulated by an in-browser scheduler engine. 

When a post reaches its designated time or when "Publish now" is clicked:
1. The scheduler simulates real-world network latency (800 ms to 1,500 ms).
2. The post status transitions from `scheduled` to `published` inside browser storage.
3. Synthetic engagement metrics (impressions, likes, comments, shares, clicks) are generated using platform-weighted math.
4. The event is recorded in the local activity log. Zero HTTP requests are sent to external social media platforms.

### Can it compromise, hack, or ban my real accounts?
No. The application never asks for passwords, private API keys, session cookies, or OAuth tokens. Because all data is stored exclusively in your browser's `localStorage`, no third party or backend server ever receives your drafts or account identifiers.

### Why does it not connect to official APIs directly?
Every major social network (X, LinkedIn, Meta/Instagram/Facebook, Threads) requires an OAuth 2.0 authorization code exchange involving a confidential `client_secret`:
- Browsers cannot securely store client secrets without exposing them in public client bundles.
- Platform publishing endpoints enforce strict CORS policies that block direct browser-to-API requests.
- True direct publishing requires a dedicated backend server or serverless proxy to store secrets and relay requests. This project intentionally eliminates backend dependencies to provide a zero-cost, private, client-side sandbox.

---

## Key Features

- Cross-Platform Composer:
  - Write once, target multiple channels (X, LinkedIn, Instagram, Facebook, Threads).
  - Dynamically calculates the strictest character limit across selected platforms.
  - Enforces platform constraints (e.g., Instagram requires at least one image).
  - Live per-platform preview cards.

- Buffer-Style Queue Engine:
  - Define custom weekly time slots per channel (e.g., Mon-Fri at 09:00 and 17:00).
  - "Add to Queue" automatically computes and assigns the next free slot up to 60 days ahead.
  - Prevents minute-level collisions across multi-channel groups.

- Interactive Multi-View Calendar:
  - Month, Week, and Agenda views with localized week start (Sunday or Monday).
  - Pointer-based drag-and-drop rescheduling on desktop and tablet viewports.
  - Direct fallback "Reschedule" dialog for mobile and non-pointer users.

- Offline-First Storage & Concurrency:
  - Versioned envelope persistence using `localStorage`.
  - Atomic cross-tab synchronization and leader lease election (only one active tab ticks the scheduler).
  - 8-second undo windows for destructive actions (post deletion, account removal).
  - Export and import full data bundles as validated JSON.

- Client-Side Media Pipeline:
  - In-browser canvas compression targeting payloads under 450 KB.
  - Storage quota guards preventing browser `QuotaExceededError` crashes.
  - Full-screen accessible image lightbox with keyboard navigation.

- Accessible & Responsive Design:
  - Tested across mobile (360px, 390px, 430px), tablet (768px), and desktop (1024px, 1280px+) viewports.
  - Minimum 44x44px touch targets on all interactive controls.
  - Dark mode support synchronized with system preferences.
  - Zero decorative emojis; uses SVG iconography via Lucide.

---

## Supported Platform Matrix

| Platform | Max Characters | Max Media | Media Required? | Simulation Mode |
|---|---|---|---|---|
| X | 280 | 4 | No | Active |
| LinkedIn | 3,000 | 9 | No | Active |
| Instagram | 2,200 | 10 | Yes | Active |
| Facebook | 63,206 | 10 | No | Active |
| Threads | 500 | 10 | No | Active |
| YouTube | N/A | N/A | N/A | Not included (video-only protocol) |
| TikTok | N/A | N/A | N/A | Not included (requires partner API) |

---

## Tech Stack

- Framework: Vue 3 (Composition API, `<script setup lang="ts">`, `defineModel`, `useTemplateRef`)
- State Management: Pinia setup stores with custom envelope persistence plugin
- Styling: Tailwind CSS v4 (`@tailwindcss/vite`, CSS-first `@theme` configuration)
- Routing: Vue Router 4 (lazy-loaded routes wrapped in `<Suspense>`)
- Date & Time: `date-fns` and `@date-fns/tz` (IANA timezone support)
- Schema Validation: Zod
- Icons: `lucide-vue-next`
- Typography: `@fontsource-variable/inter`
- Build Tool: Vite
- Quality & Testing: Vitest, Happy DOM, Vue Test Utils, ESLint, Prettier, `vue-tsc`

---

## Getting Started

### Prerequisites

- Node.js 20.x or higher
- pnpm (strictly enforced package manager)

### Installation

```bash
# Clone the repository
git clone https://github.com/mmy-lana/vue-pinia-social-scheduler.git
cd vue-pinia-social-scheduler

# Install dependencies
pnpm install

# Start local development server
pnpm dev
```

### Verification & Testing

```bash
# Run TypeScript type check
pnpm run typecheck

# Run unit tests
pnpm test

# Run ESLint validation
pnpm run lint

# Build for production
pnpm run build

# Run all verification steps in sequence
pnpm run verify
```

---

## Project Structure

```
src/
├── assets/                  # CSS tokens and Tailwind v4 configuration
├── components/
│   ├── accounts/            # Channel cards, connect modal, platform glyphs
│   ├── calendar/            # MonthGrid, WeekGrid, AgendaList, DayCell, toolbar
│   ├── common/              # ConfirmDialog, AppGuideModal
│   ├── composer/            # ComposerSheet, editor, media uploader, preview
│   ├── dashboard/           # Metric cards, next-up countdown, onboarding
│   ├── posts/               # PostCard, metrics row, status badge, media grid
│   ├── queue/               # SlotEditor, weekday slot rows, queue list
│   ├── shell/               # AppShell, SidebarNav, BottomNav, TopBar, RightRail
│   ├── timeline/            # Day groups, status filters, post lists
│   └── ui/                  # Base buttons, inputs, modals, tabs, switches
├── composables/             # Breakpoints, theme, drag-reschedule, media upload
├── lib/                     # Timezone math, queue planner, validation, seed data
├── pages/                   # Lazy-loaded page components
├── router/                  # Route configurations
├── stores/                  # Pinia stores and storage persistence plugin
└── types/                   # Domain entities and TypeScript interfaces
```

---

## License

MIT License. Free for personal, commercial, and educational use.
