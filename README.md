# WZD

WZD is a terminal business agent for turning raw ideas into revenue through gated validation, offer building, outreach, metrics, and review.

It runs locally with Bun, stores business state in files, and supports OpenAI, Anthropic, and OpenRouter for streamed agent responses.

## Requirements

- macOS, Linux, or a VM with a terminal
- Git
- Bun
- At least one API key: OpenAI, Anthropic, or OpenRouter

## Install Bun

```bash
curl -fsSL https://bun.sh/install | bash
source ~/.zshrc
```

## Clone And Install

```bash
git clone https://github.com/wzdlabs/wzdsh.git
cd wzdsh
bun install
```

## Configure API Keys

WZD reads API keys from environment variables or from a `.env` file in the project root.

```bash
# .env
OPENAI_API_KEY=your_openai_key
ANTHROPIC_API_KEY=your_anthropic_key
OPENROUTER_API_KEY=your_openrouter_key
```

You can also set keys interactively with `/model` inside WZD — they are saved to `.env` automatically.

Do not commit `.env` to this repo (it is gitignored).

## Run WZD

```bash
bun run start
```

The first run creates a business under `businesses/` and starts the intake flow.

## Commands

```text
/help                    Show available commands
/new                     Create a new business
/switch                  Switch active business
/start                   Start or return to intake
/validate                Work on demand validation
/offer                   Work on the model and offer
/revenue                 Move into revenue work
/metrics                 Show revenue metrics
/tasks                   Show current tasks
/decisions               Show logged decisions
/tokens                  Show session token usage
/model                   Interactive model selector
/model provider:model    Set model directly (e.g. anthropic:claude-opus-4-5)
/signin                  Set local WZD identity
/signout                 Clear local WZD identity
/whoami                  Show local WZD identity
/close                   Close the session and log what changed
```

### Supported providers

| Provider | Format | Example |
|----------|--------|---------|
| OpenAI | `openai:model` | `openai:gpt-4o` |
| Anthropic | `anthropic:model` | `anthropic:claude-opus-4-5` |
| OpenRouter | `openrouter:model` | `openrouter:meta-llama/llama-3.3-70b-instruct` |

Model selection persists across sessions.

## Development

```bash
bun run typecheck
bun test
bun run dev
```

## Data Storage

```text
businesses/[slug]/venture.json
businesses/[slug]/decisions.md
businesses/[slug]/tasks.md
businesses/[slug]/metrics.md
businesses/[slug]/artifacts/
```

Runtime auth, `.env`, and `.wzdconfig.json` are gitignored.
