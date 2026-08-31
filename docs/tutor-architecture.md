# Python Tutor Architecture

This document records the implementation boundary for WZD as a guided Python tutor.

## Product target

- Start with a true beginner and build toward junior Python backend developer readiness.
- Teach through a guided terminal experience with an agentic tutor.
- Require assessment evidence before unlocking later competencies.
- Estimate remaining active hours and calendar time from the learner's demonstrated pace.
- Support local models, bring-your-own API keys, custom OpenAI-compatible endpoints, and a future managed model.
- Keep the learning engine reusable by a future Tauri desktop app.

## Boundary

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

The core never reads stdin, writes stdout, uses ANSI formatting, or calls a WebView API. It receives a `TutorCommand` and emits one or more validated `TutorEvent` objects. Model and code execution are ports so their security policies can change without rewriting the curriculum.

## Model profiles and secrets

Model profiles support four sources: local, bring-your-own-key, custom endpoint, and future managed access. A profile contains the provider transport, model name, endpoint, and a credential reference. It must never contain a raw key.

- The CLI can resolve an environment-variable reference.
- A future Tauri adapter can resolve a keychain reference through the operating system.
- Local OpenAI-compatible servers such as Ollama can use a local URL with no credential.
- Managed access is represented separately so subscription credentials do not leak into learner data.

## Python execution boundary

The local runtime executes code in a new temporary workspace and Python process with isolated-mode flags, a timeout, an output ceiling, and cleanup after every run. This prevents ordinary runaway exercises from wedging the tutor, but it is not a security sandbox: local Python code still inherits the current user's operating-system permissions. A hosted paid runner must use a container or microVM, and a desktop release must explain this distinction before executing model-generated code.

## Initial 0–100 gates

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

The first catalog is deliberately coarse. Each gate will be expanded into lessons, exercises, projects, and assessment rubrics without changing the command/event boundary.

## Gate rule

Activity time can change the forecast but cannot unlock a gate. A competency is mastered only when its assessment reaches the configured passing score. Passing a gate unlocks competencies whose prerequisites are all mastered. Every result is retained as learning evidence.

## Forecast rule

Before enough learner evidence exists, the forecast uses the broad curriculum range of 760–1,250 active hours. After at least five active hours and measurable mastery, it blends that range with demonstrated mastery velocity. Weekly availability changes calendar weeks, not mastery or active hours. Confidence rises as active-time and mastery evidence accumulate.

## Migration sequence

1. Keep the existing WZD command working during the transition.
2. Persist the new learner schema and add schema migrations.
3. implement model profiles without storing raw secrets in learner state.
4. Add an isolated Python workspace/runner and test protocol.
5. Build the terminal adapter and first complete beginner module.
6. Expand the ten gates into a full curriculum and rubrics.
7. Add commercial entitlements outside the learning engine.
8. Reuse the same protocol in a Tauri desktop shell.
