# WZD — Python Tutor

WZD is a guided terminal tutor designed to take a total beginner from their first command to junior Python backend developer readiness.

The tutor combines a structured 0–100 curriculum, progressive hints, real Python execution, evidence-based assessment gates, adaptive completion forecasts, and user-selectable AI models.

[Visit wzd.sh](https://wzd.sh) · [Read the architecture](docs/tutor-architecture.md)

## Status

WZD Python Tutor is in active development. The reusable tutor engine and public product site are implemented; the learner-facing CLI and complete lesson catalog are the next development slice.

The previous WZD business-agent code remains in the repository temporarily while the CLI is migrated. It is not the product described by the current website.

## What is implemented

- A UI-independent tutor engine with validated commands and events
- Ten gated career stages from beginner to job-ready
- Learner profiles, competency state, assessment evidence, and active-time tracking
- Adaptive remaining-hour and calendar forecasts
- Local, bring-your-own-key, custom endpoint, and future managed model profiles
- Secret references that keep raw API keys out of learner state
- A process-limited local Python runner with disposable workspaces
- A desktop-ready boundary that can later power a Tauri application
- A Vercel-hosted product site at [wzd.sh](https://wzd.sh)

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

The current implementation has automated coverage for learner initialization, gated progression, skip prevention, adaptive forecasts, file persistence, secret-safe model profiles, and Python runner limits.

## Next

1. Build the learner-zero CLI onboarding experience.
2. Connect model profiles to the agentic tutor.
3. Expand each career stage into lessons, exercises, projects, and rubrics.
4. Add secure packaged distribution and commercial entitlements.
5. Reuse the protocol in a Tauri desktop shell.
