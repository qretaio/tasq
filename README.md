# @qretaio/tasq

A powerful task tracking CLI that uses markdown files (TASKS.md) for managing tasks across multiple projects with intelligent context gathering for AI-assisted development.

## Features

- **Cross-project task visibility** - Scan and aggregate tasks from multiple projects
- **Markdown-based** - Uses simple TASKS.md files with checkbox syntax
- **Context-aware AI delegation** - Gathers project context and delegates to Claude Code CLI
- **Zero-config discovery** - Automatically detects project types, dependencies, and structure

## Tasks

Task items from this section will be processed by `tasq` cli.

- [ ] Create a Kanban board for task management

## Installation

### Prerequisites

- Node.js 18+
- [Claude Code CLI](https://claude.ai/claude-code) (optional, for `tasq do` command)

### Global Installation

```bash
npm install -g @qretaio/tasq
```

### Development Installation

```bash
git clone https://github.com/qretaio/tasq.git
cd tasq
npm install
npm run build
npm link
```

## Quick Start

### Initialize a new project

```bash
cd your-project
tasq init
```

This creates a TASKS.md file with basic structure.

### Add tasks

```bash
tasq add "Implement feature X"
tasq add "Fix bug in authentication"
```

### List tasks

```bash
# List all tasks across all configured projects
tasq list

# List only current project tasks
tasq local
```

### Work on tasks

```bash
# Mark task as in-progress
tasq wip 1

# Delegate task to Claude with full context
tasq do 1

# Mark task as complete
tasq done 1
```

## Commands

### `tasq init [options]`

Initialize a new TASKS.md file in the current directory.

```bash
tasq init                    # Use current directory name
tasq init --name "My App"    # Specify project name
tasq init --force            # Overwrite existing TASKS.md
```

### `tasq list [options]`

List all tasks from all configured projects.

```bash
tasq list          # Show active tasks (default)
tasq list --all    # Show all projects including completed tasks
tasq list --local  # Show only current directory
tasq list --pending # Show only pending tasks
```

### `tasq local`

Alias for `tasq list --local`.

### `tasq add <description>`

Add a new task to the current project's TASKS.md.

```bash
tasq add "Implement user authentication"
tasq add "Write unit tests for payment module"
```

### `tasq wip <id>`

Mark a task as in-progress.

```bash
tasq wip 1          # By number
tasq wip auth       # By description substring
tasq wip p1         # By compact ID (repo ID + number)
```

### `tasq done <id>`

Mark a task as completed.

```bash
tasq done 1
tasq done auth
tasq done p1
```

### `tasq do <id> [options]`

Delegate a task to Claude Code CLI with full project context.

```bash
tasq do 1              # Invoke Claude with context
tasq do p1 --dry       # Print prompt without invoking Claude
tasq do 1 --yolo       # Auto-accept all prompts (YOLO mode)
tasq do 1 --opencode   # Use OpenCode instead of Claude
```

The command gathers:

- README.md content
- Project type and structure
- Git status and recent commits
- Dependencies from package.json, Cargo.toml, etc.
- Test files
- TODO/FIXME comments
- Additional documentation
- Files specified in the `## Context` section

### `tasq config <action>`

Manage configuration.

```bash
tasq config                    # Show current config
tasq config add-path ~/dev     # Add a scan path
```

## Configuration

Configuration is stored in `~/.config/tasq/config.json` (macOS/Linux) or `%APPDATA%\tasq\config.json` (Windows).

Default scan paths:

- `~/src` - Scans recursively for TASKS.md files

## Task IDs

Tasks have two types of IDs:

1. **Local numbers** - Used within `tasq local` (1, 2, 3...)
2. **Compact IDs** - Used across projects (p1, u2, t3...)

Compact IDs are generated from:

- First letter(s) of project name (disambiguated if needed)
- Task number within that project

Examples:

- `p1` - First task in "project-alpha" project
- `t2` - Second task in "tasq" project

## Context Gathering

The `tasq do` command intelligently gathers context:

- **Project detection** - Automatically detects JavaScript, TypeScript, Python, Rust, Go, Ruby, Java projects
- **Dependency parsing** - Reads package.json, Cargo.toml, pyproject.toml, requirements.txt, go.mod, etc.
- **Git context** - Current branch, status, and recent commit
- **Test discovery** - Finds test files matching common patterns
- **TODO detection** - Scans for TODO/FIXME comments
- **Documentation** - Finds README.md, CONTRIBUTING.md, docs/, etc.

You can specify additional context in TASKS.md:

```markdown
## Context

files: src/**/\*.ts, tests/**/\*.test.ts
repos: ../shared-library, ../api-client
```

## Use Cases

### Cross-Project Task Visibility

See all your tasks in one place when working on multiple projects:

```bash
tasq list
```

### Context-Aware Task Delegation

Ensure Claude has full project context when delegating work:

```bash
tasq do p1
# Spawns Claude with:
# - Project description and goals
# - All tasks with current one highlighted
# - README.md content
# - Dependencies from package.json
# - Git status and recent commits
# - Files from ## Context section
```

### Quick Task Capture

Quickly add tasks without leaving your flow:

```bash
tasq add "Remember to handle edge case X"
```

## Examples

### Workflow Example

```bash
# Start a new project
cd ~/src/my-project
tasq init --name "My Project"

# Add some goals and tasks
tasq add "Setup project structure"
tasq add "Implement core feature"
tasq add "Write tests"

# Work on first task
tasq wip 1
tasq do 1  # Claude gets full context

# Mark as done
tasq done 1

# Move to next task
tasq wip 2
tasq do 2
```

### Multi-Project Example

```bash
# See all tasks across projects
tasq list

# Work on specific project task
tasq do p3  # Task 3 in project-alpha
tasq do t1  # Task 1 in tasq
```

## Development

```bash
# Install dependencies
npm install

# Run in development mode (using bun)
npm run dev -- <command>

# Build
npm run build

# Run tests
npm test

# Type check
npm run typecheck

# Lint
npm run lint

# Format
npm run fmt
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## See Also

- [Claude Code CLI](https://claude.ai/claude-code)
