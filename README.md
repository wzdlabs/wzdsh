# WZD — Python Tutor

WZD is a guided terminal tutor designed to take a total beginner from their first command to junior Python backend developer readiness.

The tutor combines a structured 0–100 curriculum, progressive hints, real Python execution, evidence-based assessment gates, adaptive completion forecasts, and user-selectable AI models.

[Visit WZD Learn](https://learn.wzd.sh) · [Read the architecture](docs/tutor-architecture.md)

## Status

WZD Python Tutor is in active development. The reusable tutor engine, learner-facing CLI, OpenRouter/OpenAI model connection, starter lesson, local Python execution, and public product site are implemented. The complete lesson and assessment catalog remains in development.

The previous business-agent implementation has been removed from the public product tree. The tutor CLI is now the package entrypoint.

## What is implemented

- A UI-independent tutor engine with validated commands and events
- Ten gated career stages from beginner to job-ready
- Learner profiles, competency state, assessment evidence, and active-time tracking
- Adaptive remaining-hour and calendar forecasts
- OpenRouter, OpenAI, custom endpoint, and future managed model profiles
- macOS Keychain and environment-variable credentials that keep raw API keys out of WZD configuration and learner state
- Multi-turn agentic tutoring with progressive hints and session token usage
- A WZD blue/gray terminal theme with `NO_COLOR` support
- A process-limited local Python runner with disposable workspaces
- A desktop-ready boundary that can later power a Tauri application
- A Vercel-hosted product site at [wzd.sh](https://wzd.sh)

## Run the tutor

Connect a model, then start the tutor without installing it globally:

```bash
bunx wzdsh models add
bunx wzdsh python
```

The setup wizard defaults to OpenRouter. It stores the key in macOS Keychain, tests the endpoint without generating model output, and selects the profile. OpenRouter model slugs can be changed at any time:

```bash
bunx wzdsh models add openrouter --model openrouter/free
bunx wzdsh models list
bunx wzdsh models use openrouter
bunx wzdsh models update openrouter --model <provider/model-slug>
bunx wzdsh models key openrouter
bunx wzdsh models test
```

Use `--key-env OPENROUTER_API_KEY` if you prefer an environment variable. Never pass an API key as a command-line argument.

To run the current source checkout:

```bash
bun install
bun run start
```

Optional onboarding values can be passed directly:

```bash
bunx wzdsh python --name "Prince" --hours 10
```

Progress is stored in `~/.wzd/learners` so it follows the learner across project folders. Model configuration is stored separately in `~/.wzd/models.json`, with credential references instead of raw keys.

Inside a learning session, normal text goes to the tutor. Use `/lesson`, `/run`, `/hint`, `/model`, `/usage`, `/progress`, `/help`, and `/quit` for structured actions. The first starter lesson is available now; the full curriculum and automated gate assessments are not complete yet.

## The 0–100 path

| Level | Competency | Estimated active hours |
| --- | --- | ---: |
| 0–10 | Computer and terminal foundations | 20–40 |
| 10–20 | Core Python | 60–100 |
| 20–30 | Problem solving and debugging | 70–110 |
| 30–40 | Git and developer tooling | 60–100 |
| 40–50 | Professional Python and testing | 80–130 |
| 50–60 | SQL, HTTP, and API foundations | 80–130 |
| 60–70 | Python backend development | 110–170 |
| 70–80 | Production systems | 90–140 |
| 80–90 | Engineering maturity | 90–150 |
| 90–100 | Portfolio and job readiness | 100–180 |

Time does not unlock a stage. Learners advance by passing assessments and producing evidence that the prerequisite competencies are mastered.

## Architecture

```text
CLI adapter now                 Tauri adapter later
      |                                |
      +-------- structured commands ---+
                       |
                 tutor-core
            curriculum and gates
          learner state and evidence
             forecast calculation
              tutor/model ports
              Python runner port
                       |
      +--------- structured events ----+
      |                                |
terminal renderer               desktop renderer
```

The tutor core does not read terminal input, write terminal output, or depend on a WebView. This allows the same learning engine to power the terminal product now and a desktop application later.

## Development

Requirements:

- Bun
- Python 3

```bash
bun install
bun run typecheck
bun test
```

The current implementation has automated coverage for learner initialization, gated progression, skip prevention, adaptive forecasts, file persistence, secret-safe model profiles, OpenRouter/OpenAI request formats, multi-turn context, token usage, terminal colors, CLI model setup, and Python runner limits.

## Next

1. Expand each career stage into lessons, exercises, projects, and automated rubrics.
2. Add model budgets and secure commercial entitlements.
3. Build progress synchronization for `learn.wzd.sh`.
4. Add local-model and additional provider adapters.
5. Reuse the protocol in a Tauri desktop shell.
