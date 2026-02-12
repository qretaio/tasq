# Tasq

Task tracking CLI using TASKS.md files with context-aware AI delegation.

## Context

files: README.md, package.json, src/\*_/_.ts

## Tasks

- [x] Convert from Deno-based CLI to standard npm package with TypeScript
- [x] Set up proper TypeScript project structure (src/, tsconfig.json)
- [x] Update package.json with proper dependencies and build scripts
- [x] Configure bun for development mode
- [x] Test CLI build and functionality
- [x] Trim codebase - remove duplicated code, consolidate patterns
- [x] Add support for extracting TASKS from README.md
- [x] Add `tasq watch <parent-dir>` command to add given directory to `tasq` scan list.
- [x] Add `tasq unwatch <dir>` command for undoing above action
- [ ] Render to string instead of stdout for context.
- [ ] Render to string instead of stdout for lists.
- [ ] Add more intelligent context so that the agents need to explore less
- [ ] Use standard markdown parser for parsing
- [ ] Publish a blog post on what this is, how this helps and why one should use it.
- [ ] Add support for opencode
- [ ] YOLO mode with the project sandbox

## Future

- [ ] Remote collaboration
