# DFE — Dashboard for Everything

Architecture decisions for the planned agent-built workspace are recorded in
[architecture/decisions](./architecture/decisions/README.md). These records are
kept independently of temporary planning documents in `docs/`.

The reusable [design system](./DESIGN.md) has a standalone component specimen
and workspace sample in `src/design-system`. Build it with
`pnpm design-system:build`, or run `pnpm design-system:dev` for local development.
It uses local demonstration data and does not need WorkOS or Convex credentials.
`pnpm design-system:export` also builds the portable
[interactive specimen](./architecture/design/showcase.html).

The [`dfe` agent skill](./skills/dfe/SKILL.md) tells any agent how to use the
DFE MCP server. Install it with `npx skills add zulfaza/dGrape --skill dfe`, or
give the agent the file as instructions. To set up the server, see the `/guide`
page.

![DFE sloth](./public/favicon.svg)

DFE (Dashboard for Everything) is being rebuilt as an agent-first workspace for flexible data, API aggregation, deterministic jobs, artifacts, and dashboards. The name is provisional; the intended production domain is `dfe.makarima.dev`. The current runnable design-system sample uses local demonstration data.

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

Components land in `src/components/ui`. Follow the current
[design direction](./architecture/design/README.md) and shared theme tokens.
The planned friendly shadcn theme replaces the previous monospace, zero-radius
visual constraint after design curation.
