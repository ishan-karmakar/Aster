# Aster Homework Planner

Aster is a dark-mode homework planner that helps students organize classes, assignments, deadlines, priorities, and focused study sessions.

## Features

- Supabase email/password registration, email confirmation, login, and password recovery
- Required class onboarding for new students
- Settings-only class and profile editing
- Assignment priorities, estimated effort, progress tracking, and balanced study plans
- Deterministic workload splitting, subtasks, Top 3 sessions, exam spacing, missed-session recovery, and estimate learning
- Weekly availability, recurring commitments, one-off exceptions, session limits, and when/where study plans
- Review-first PDF/image syllabus import through the OpenAI Responses API
- Google Calendar connection with encrypted tokens, busy-time protection, and two-way session synchronization
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
npm run test:planner
```

The Supabase project URL and publishable browser key used by the app are intentionally public identifiers. Never commit a Supabase secret key, service-role key, database password, or user password.

## Deployment

The app uses the vinext Cloudflare-compatible build configured in `vite.config.ts`. Sites deployment metadata and D1 migrations live under `.openai/` and `drizzle/`.

Live app: [Aster Homework Planner](https://aster-homework-planner.yashman9012.chatgpt.site)

## Assignment reminder emails

Assignments and their reminder times are stored in D1 as UTC timestamps. A Cloudflare Cron Trigger should invoke the Worker every minute so due reminders are delivered close to the selected time.

Required Worker configuration:

- Secret: `RESEND_API_KEY`
- Variable: `REMINDER_FROM_EMAIL` (for example, `Aster <reminders@yourdomain.com>`)
- Variable: `HOME_URL` (the configurable homepage used in reminder emails)
- Cron Trigger: `* * * * *`

The sender domain must be verified in Resend. The Worker uses an idempotency key per assignment, records successful delivery, and retries failed requests up to five times. See `wrangler.reminders.example.jsonc` for the configuration shape.

## Advanced planning integrations

The planner works without external AI or calendar credentials. Configure these server-only values to enable integrations:

- `OPENAI_API_KEY` for syllabus extraction, editable practice questions, and schedule explanations
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` for Google OAuth
- `GOOGLE_REDIRECT_URI`, ending in `/api/calendar/google/callback`
- `TOKEN_ENCRYPTION_KEY`, a long random secret used to encrypt Google refresh tokens at rest

The deployment also requires the logical R2 binding `UPLOADS` for private syllabus files and the existing one-minute Cron Trigger for reminders, missed-session recovery, and calendar synchronization. Never expose these credentials through `NEXT_PUBLIC_` variables.
