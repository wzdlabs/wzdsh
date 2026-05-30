# WZD

WZD is a terminal business agent for turning raw ideas into revenue through gated validation, offer building, outreach, metrics, and review.

It runs locally with Bun, stores business state in files, and uses the OpenAI API for streamed agent responses.

## Requirements

- macOS, Linux, or a VM with a terminal
- Git
- Bun
- An OpenAI API key

## Install Bun

If Bun is not installed:

```bash
curl -fsSL https://bun.sh/install | bash
```

Restart your terminal after installation, or reload your shell:

```bash
source ~/.zshrc
```

On Linux, use the shell config file for your VM if it is not zsh.

## Clone And Install

```bash
git clone https://github.com/wzdlabs/wzdsh.git
cd wzdsh
bun install
```

## Configure OpenAI

WZD uses the OpenAI API key from your shell environment.

```bash
export OPENAI_API_KEY="your_openai_api_key"
```

To make it persistent on macOS with zsh:

```bash
echo 'export OPENAI_API_KEY="your_openai_api_key"' >> ~/.zshrc
source ~/.zshrc
```

Do not commit API keys to this repo.

## Run WZD

```bash
bun run start
```

The first run creates a business under `businesses/` and starts the intake flow.

## Common Commands

Inside WZD:

```text
/help       Show available commands
/new        Create a new business
/switch     Switch active business
/start      Start or return to intake
/validate   Work on demand validation
/offer      Work on the model and offer
/revenue    Move into revenue work
/metrics    Show revenue metrics
/tasks      Show current tasks
/decisions  Show logged decisions
/signin     Set local WZD identity
/signout    Clear local WZD identity
/whoami     Show local WZD identity
/close      Close the session and log what changed
```

## Development

```bash
bun run typecheck
npm test
```

Use watch mode while editing:

```bash
bun run dev
```

## Data Storage

WZD stores business data in local files:

```text
businesses/[slug]/venture.json
businesses/[slug]/decisions.md
businesses/[slug]/tasks.md
businesses/[slug]/metrics.md
businesses/[slug]/artifacts/
```

Runtime auth and local session files are ignored by Git.

## Notes

- The CLI command is `wzd`, but local development runs with `bun run start`.
- The folder name is `wzdsh` to avoid confusion with `/Users/wzd`.
- Agent calls require `OPENAI_API_KEY`.
