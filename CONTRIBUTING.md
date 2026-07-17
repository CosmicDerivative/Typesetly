# Contributing to Typesetly

Thank you for helping improve Typesetly.

## Before opening a pull request

1. Create a focused branch.
2. Keep user manuscripts and generated exports out of the repository.
3. Preserve the `data-typesetly-*` manuscript schema across editor, preview, import, and export paths.
4. Keep front matter, Body, and back matter ordering rules intact.
5. Ensure moving the last scene out of a chapter leaves a valid blank scene.
6. Add or update tests for data transformations.
7. Run:

```powershell
npm.cmd run verify
```

## Code style

- Prefer explicit TypeScript types at storage, import, export, and drag/drop boundaries.
- Comment invariants and compatibility decisions, not obvious syntax.
- Keep destructive actions recoverable when practical.
- Avoid browser prompts and alerts; use the shared dialog and notice systems.
- Preserve local-first operation and do not add telemetry by default.

## Commit messages

Use concise conventional prefixes when practical:

- `feat:` new behavior
- `fix:` defect correction
- `docs:` documentation
- `test:` tests
- `refactor:` behavior-preserving restructuring
- `chore:` tooling or maintenance

## Intellectual property

Do not submit proprietary source code, copied commercial templates, unlicensed fonts, third-party logos, or screenshots/assets you do not have permission to redistribute.
