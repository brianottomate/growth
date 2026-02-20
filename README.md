# Jetpack

> A modern Next.js SaaS starter template

A production-ready Next.js application template with authentication, database, payments, email, and more.

## Features

- 🔐 **Authentication** - Better Auth with email/password, OAuth, and admin features
- 📊 **Database** - Drizzle ORM with PostgreSQL (Neon)
- 🎨 **UI Components** - Beautiful Radix UI components with Tailwind CSS
- 📝 **Blog System** - MDX blog with Velite
- 💳 **Payments** - LemonSqueezy integration ready
- 📧 **Email** - Resend integration with React Email templates
- 🤖 **AI Ready** - Anthropic AI SDK integrated
- 📁 **File Storage** - Vercel Blob integration
- 🔒 **Type Safety** - Full TypeScript with tRPC for end-to-end type safety

## Quick Start

### Development

```bash
# Install dependencies
bun install

# Set up environment variables
cp .env.example .env
# Edit .env with your values

# Run database migrations
bun run db:push

# Start development server
bun dev
```

Visit `http://localhost:3000`

## Tech Stack

This is a [T3 Stack](https://create.t3.gg/) project with:

- [Next.js 16](https://nextjs.org) - React framework with App Router
- [React 19](https://react.dev) - UI library
- [TypeScript](https://www.typescriptlang.org) - Type safety
- [Drizzle ORM](https://orm.drizzle.team) - Database ORM
- [Tailwind CSS 4](https://tailwindcss.com) - Styling
- [tRPC](https://trpc.io) - Type-safe API layer
- [Better Auth](https://better-auth.com) - Authentication
- [TanStack Query](https://tanstack.com/query) - Data fetching
- [Radix UI](https://www.radix-ui.com) - Headless UI components
- [Velite](https://velite.js.org) - Content management for MDX
- [React Email](https://react.email) - Email templates
- [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) - File storage
- [Resend](https://resend.com) - Email delivery
- [LemonSqueezy](https://lemonsqueezy.com) - Payments (optional)

## Project Structure

```text
src/
├── app/                    # Next.js app router
│   ├── (auth)/            # Auth pages (signin, signup, etc.)
│   ├── (marketing)/       # Public marketing pages
│   ├── app/               # Protected app pages
│   └── api/               # API routes
├── server/                # Backend logic
│   ├── api/               # tRPC routers
│   ├── db/                # Database schema & queries
│   └── services/          # Business logic services
├── components/            # React components
│   ├── ui/                # Reusable UI components
│   └── mdx/               # MDX components for blog
├── lib/                   # Shared utilities
└── hooks/                 # Custom React hooks

emails/                    # Email templates
```

## Key Commands

```bash
# Development
bun dev                    # Start dev server
bun run build              # Build for production
bun start                  # Start production server

# Database
bun run db:generate        # Generate migrations
bun run db:migrate         # Run migrations
bun run db:push            # Push schema changes
bun run db:studio          # Open Drizzle Studio

# Code Quality
bun run typecheck          # Type check
bun run lint               # Lint code
bun run lint:fix           # Fix lint issues
bun run format:check       # Check formatting
bun run format:write       # Format code

# Other
bun run email:dev          # Preview emails
bun run velite:dev         # Watch MDX content
```

## Environment Variables

See [.env.example](.env.example) for required environment variables.

Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `BETTER_AUTH_SECRET` - Auth secret (generate with `openssl rand -base64 32`)
- `NEXT_PUBLIC_BASE_URL` - Your app URL
- `RESEND_API_KEY` - Email delivery (optional)
- `ANTHROPIC_API_KEY` - AI features (optional)

## Documentation

- **[CLAUDE.md](CLAUDE.md)** - Developer guide for working with this codebase
- **[CLEANUP_NOTES.md](CLEANUP_NOTES.md)** - Template cleanup notes

## Core Features

### Authentication

Built with Better Auth including:

- Email/password authentication
- Email verification
- Password reset
- Username system
- Anonymous users support
- Admin roles and user banning
- Session impersonation

### Onboarding

Simple multi-step onboarding flow demonstrating:

- Progress indicator with step tracking
- Client-side timezone detection (via Intl API)
- Server-side geo detection (Vercel headers in production)
- Type-safe form validation with Zod
- Shared schema between frontend and backend

The onboarding is intentionally simplified as a template pattern. Customize the steps and fields in:

- [src/lib/validators/onboarding.ts](src/lib/validators/onboarding.ts) - Zod schema
- [src/app/app/onboarding/page.tsx](src/app/app/onboarding/page.tsx) - Frontend UI
- [src/server/api/routers/userRouter.ts](src/server/api/routers/userRouter.ts) - Backend mutation

### Database

Drizzle ORM with PostgreSQL provides:

- Type-safe database queries
- Automatic migrations
- Relation management
- Database studio for viewing data

### Blog System

MDX-based blog with:

- Velite for content processing
- Syntax highlighting
- Reading time calculation
- SEO optimization
- Draft posts support

### Email System

React Email templates with:

- Type-safe email components
- Preview server for development
- Resend integration for delivery
- Beautiful responsive templates

### File Storage

Vercel Blob integration for:

- Image uploads
- Document storage
- Automatic CDN distribution
- Presigned URLs

## Deployment

Deploy to Vercel with one click or follow these guides:

- [Vercel Deployment](https://create.t3.gg/en/deployment/vercel)
- [Docker Deployment](https://create.t3.gg/en/deployment/docker)

Make sure to set all environment variables in your deployment platform.

## Learn More

- [T3 Stack Documentation](https://create.t3.gg/)
- [Next.js Documentation](https://nextjs.org/docs)
- [Better Auth Documentation](https://better-auth.com)
- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [tRPC Documentation](https://trpc.io)

## License

MIT
