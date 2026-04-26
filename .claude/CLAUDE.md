# Claude workspace notes

This `.claude/` directory keeps project guidance modular and cheap to load.

## How to use this directory

1. Start with the repository `CLAUDE.md`.
2. Read the context package for domain and architectural guidance.
3. Let path-scoped rules narrow guidance for the files being edited.
4. Use a project skill for repeatable workflows.
5. Use a subagent when a task clearly belongs to one layer.

## Conventions

- Context files hold reusable domain knowledge.
- Rules are short and path-scoped.
- Skills encode repeatable workflows and checklists.
- Agents own layer-specific implementation and hand off cleanly at layer boundaries.

## Do not do this

- Do not duplicate the full PRD into every file.
- Do not bypass Supabase RLS with the service-role key in client-side code.
- Do not let redemption state live anywhere except Supabase `gift_tokens`.
- Do not use subagents as a substitute for clear architecture.
