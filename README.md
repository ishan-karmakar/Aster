# Aster Homework Planner

Aster is a dark-mode homework planner that helps students organize classes, assignments, deadlines, priorities, and focused study sessions.

## Features

- Supabase email/password registration, email confirmation, login, and password recovery
- Required class onboarding for new students
- Settings-only class and profile editing
- Assignment priorities, estimated effort, progress tracking, and balanced study plans
- Responsive laptop-first interface
- Cloudflare D1 profile persistence

## Local development

Requirements: Node.js 22.13 or newer.

```bash
npm install
npm run dev
```

Useful checks:

```bash
npx tsc --noEmit
npm run lint
```

The Supabase project URL and publishable browser key used by the app are intentionally public identifiers. Never commit a Supabase secret key, service-role key, database password, or user password.

## Deployment

The app uses the vinext Cloudflare-compatible build configured in `vite.config.ts`. Sites deployment metadata and D1 migrations live under `.openai/` and `drizzle/`.

Live app: [Aster Homework Planner](https://aster-homework-planner.yashman9012.chatgpt.site)
