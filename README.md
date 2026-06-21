# applytrack\_

Run your job search like an operating system. `applytrack` turns a messy spreadsheet
of applications into a structured pipeline — feed it your CV and any job description,
tailor your application with AI, track every stage, and learn why you advanced (or
didn't).

## The flow

1. **Drop your CV** — paste your resume or profile; skills, history and strengths get indexed.
2. **Add the job** — paste a URL or the raw job description, from any board.
3. **Parsed on Convex** — role, requirements, keywords and signals are structured in real time.
4. **Tailor with AI** — chat to rewrite your CV to match, prep interviews, or research the company.
5. **Track + note** — add notes per application and move status across your pipeline.
6. **Analyze outcomes** — understand why you progressed, why you didn't, and what to do next.

## Stack

- [TanStack Start](https://tanstack.com/start) — full-stack React framework
- [Convex](https://convex.dev) — real-time backend, parsing and data
- [WorkOS AuthKit](https://workos.com/authkit) — authentication
- [shadcn/ui](https://ui.shadcn.com) — components (monospace / zero-radius theme)
- [Tailwind CSS](https://tailwindcss.com) + [Hugeicons](https://hugeicons.com)

## Development

```bash
pnpm install
pnpm run dev
```

The app runs at http://localhost:3000.

| Command              | Description           |
| -------------------- | --------------------- |
| `pnpm run dev`       | Start the dev server  |
| `pnpm run build`     | Production build      |
| `pnpm run typecheck` | Type-check with `tsc` |
| `pnpm run lint`      | Lint with oxlint      |
| `pnpm run format`    | Format with oxfmt     |

## Adding UI components

```bash
npx shadcn@latest add button
```

Components land in `src/components/ui` and follow the existing monospace,
zero-radius design system — don't override the theme tokens in `src/app.css`.
