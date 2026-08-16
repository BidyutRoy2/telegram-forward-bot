# HiddenGem Telegram channel auto-forwarding bot powered by Node.js and GitHub Actions.

[![GitHub Actions](https://img.shields.io/github/actions/workflow/status/BidyutRoy2/telegram-forward-bot/bot.yml?label=GitHub%20Actions\&logo=github)](https://github.com/BidyutRoy2/telegram-forward-bot/actions)
[![Node.js](https://img.shields.io/badge/Node.js-20.x-339933?logo=node.js\&logoColor=white)](https://nodejs.org/)
[![Telegram](https://img.shields.io/badge/Telegram-Bot-26A5E4?logo=telegram\&logoColor=white)](https://core.telegram.org/bots)
[![Repository](https://img.shields.io/badge/Repository-Public-181717?logo=github)](https://github.com/BidyutRoy2/telegram-forward-bot)

HiddenGem Telegram Forward Bot listens for new posts in one Telegram source channel and copies those messages to a configured set of target channels.

The application is intentionally lightweight: the bot logic runs as a standard Node.js process, while GitHub Actions provides the execution environment and scheduled lifecycle.

---

## Overview

The bot provides:

* Telegram channel post polling
* Queue-based message processing
* Configurable forwarding delay
* Forwarding to multiple target channels
* Per-target forwarding error isolation
* Runtime status/dashboard output
* File-based forwarding logs
* Secret-based configuration through GitHub Actions
* Automatic scheduled execution without manual starts
* Public-repository GitHub-hosted runner support

### Current operating model

```text
Every ~10 minutes
      │
      ▼
GitHub Actions starts
      │
      ▼
Node.js bot starts
      │
      ▼
Telegram polling
      │
      ├── New post → queue → delay → forward
      │
      └── No post  → keep listening
      │
      ▼
~8 minute runtime window completes
      │
      ▼
Bot process stops
      │
      ▼
Next scheduled run
```

The workflow currently uses a 10-minute cron schedule and an 8-minute bot runtime window. GitHub's scheduler may delay scheduled runs under load, so the schedule should be treated as periodic rather than exact wall-clock timing.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                    GitHub Repository                     │
│                                                          │
│  index.js                                                │
│  package.json                                            │
│  package-lock.json                                       │
│  .github/workflows/bot.yml                               │
│  .gitignore                                               │
└──────────────────────────────┬───────────────────────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    GitHub Actions    │
                    │   ubuntu-latest      │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │     Node.js 20       │
                    │      npm ci          │
                    │      npm start       │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │ Telegram Bot Polling │
                    └──────────┬───────────┘
                               │
                         channel_post
                               │
                               ▼
                    ┌──────────────────────┐
                    │     Message Queue    │
                    └──────────┬───────────┘
                               │
                         configured delay
                               │
                               ▼
              ┌──────────────────────────────────┐
              │        Telegram copyMessage      │
              └───────────────┬──────────────────┘
                              │
             ┌────────────────┼─────────────────┐
             ▼                ▼                 ▼
         Target 1          Target 2          Target N
```

---

## Core behavior

### 1. Source channel detection

The bot listens for Telegram `channel_post` events and processes only messages originating from the configured main channel.

### 2. Queue processing

Each detected message ID is placed into an in-memory queue.

The queue ensures messages are processed sequentially rather than attempting to forward every message concurrently.

### 3. Forward delay

Each queued message waits for the configured delay before forwarding.

Current configuration:

```text
FORWARD_DELAY=10000
```

which corresponds to 10 seconds.

### 4. Multi-channel forwarding

For every queued message, the bot iterates through all configured target channel IDs and uses Telegram's `copyMessage` functionality.

If one target fails, the failure is logged and the bot continues attempting the remaining targets.

### 5. Runtime logging

Successful and failed forwarding attempts are written to:

```text
forward.log
```

This file is intentionally excluded from Git through `.gitignore`.

---

## Repository structure

```text
telegram-forward-bot/
│
├── .github/
│   └── workflows/
│       └── bot.yml
│
├── index.js
├── package.json
├── package-lock.json
├── .gitignore
└── README.md
```

### Runtime-only files

The following files should not be committed:

```text
.env
forward.log
node_modules/
```

---

## Configuration

The application reads configuration from environment variables.

| Variable          | Description                              | Example             |
| ----------------- | ---------------------------------------- | ------------------- |
| `BOT_TOKEN`       | Telegram bot token                       | `123456:ABC...`     |
| `MAIN_CHANNEL_ID` | Source/main Telegram channel ID          | `-1001234567890`    |
| `TARGET_CHANNELS` | Comma-separated target channel IDs       | `-1001,-1002,-1003` |
| `FORWARD_DELAY`   | Delay before forwarding, in milliseconds | `10000`             |

### Local `.env` example

For local development only:

```env
BOT_TOKEN=YOUR_TELEGRAM_BOT_TOKEN
MAIN_CHANNEL_ID=-1001234567890
TARGET_CHANNELS=-1001111111111,-1002222222222,-1003333333333
FORWARD_DELAY=10000
```

Do not commit a real `.env` file to a public repository.

---

## GitHub Actions secrets

For GitHub-hosted execution, configuration is supplied through repository secrets.

Create these secrets:

```text
BOT_TOKEN
MAIN_CHANNEL_ID
TARGET_CHANNELS
FORWARD_DELAY
```

Path:

```text
Repository
  → Settings
  → Secrets and variables
  → Actions
  → Secrets
  → New repository secret
```

The workflow maps these secrets into the environment used by `index.js`.

Example:

```yaml
env:
  BOT_TOKEN: ${{ secrets.BOT_TOKEN }}
  MAIN_CHANNEL_ID: ${{ secrets.MAIN_CHANNEL_ID }}
  TARGET_CHANNELS: ${{ secrets.TARGET_CHANNELS }}
  FORWARD_DELAY: ${{ secrets.FORWARD_DELAY }}
```

---

## GitHub Actions workflow

The production workflow is stored at:

```text
.github/workflows/bot.yml
```

Current lifecycle:

```text
Schedule:       every 10 minutes
Bot runtime:    approximately 8 minutes
Job timeout:    9 minutes
Runner:         ubuntu-latest
Node.js:        20.x
```

The workflow uses `timeout` to end the bot's runtime window cleanly before the next scheduled cycle.

### Why the workflow is intentionally short-lived

The bot is event-driven and normally waits for Telegram channel posts. Instead of keeping a single GitHub-hosted runner alive indefinitely, the repository uses a recurring execution model:

```text
start → listen → forward when needed → stop → repeat
```

This keeps the execution model aligned with GitHub Actions instead of treating the hosted runner as a permanent server.

---

## GitHub Actions lifecycle

### Expected lifecycle

```text
T0
│
├─ Checkout repository
├─ Setup Node.js 20
├─ npm ci
└─ Start bot
      │
      ├─ poll Telegram
      ├─ receive channel_post
      ├─ queue message
      ├─ wait configured delay
      └─ copy message to targets
      │
T+~8m
│
└─ Stop bot process
      │
      ▼
next scheduled workflow
```

The scheduler is periodic. Scheduled workflows can be delayed during periods of high GitHub Actions load, so the 10-minute value is a scheduling target rather than a strict real-time guarantee.

---

## Setup

### 1. Create a public GitHub repository

Create a repository and keep it public if you want to use GitHub's standard public-repository runner offering.

### 2. Upload source files

Upload:

```text
index.js
package.json
package-lock.json
```

Add:

```text
.github/workflows/bot.yml
.gitignore
README.md
```

Do not upload:

```text
.env
forward.log
node_modules/
```

### 3. Configure repository secrets

Create:

```text
BOT_TOKEN
MAIN_CHANNEL_ID
TARGET_CHANNELS
FORWARD_DELAY
```

### 4. Enable GitHub Actions

Open:

```text
Settings
→ Actions
→ General
```

Confirm Actions are enabled for the repository.

### 5. Run the first test

The workflow includes `workflow_dispatch`, so the first deployment can be started manually.

After validation, scheduled executions run automatically.

---

## Telegram requirements

The bot must have the required Telegram permissions to read source channel posts and send/copy messages to target channels.

For channel-based operation:

1. Add the bot to the relevant channels.
2. Give the bot the necessary administrative permissions.
3. Confirm that the configured source channel ID matches the channel being monitored.
4. Confirm every target channel ID is correct.

The bot itself does not create Telegram permissions. Telegram permissions must be configured in Telegram.

---

## Operational behavior

### New post arrives

```text
Telegram channel_post
        ↓
source channel check
        ↓
message ID added to queue
        ↓
configured delay
        ↓
forward to target 1
        ↓
forward to target 2
        ↓
...
        ↓
forward to target N
```

### No new post

```text
Polling continues
      ↓
No qualifying post
      ↓
No action
      ↓
Continue waiting
```

### One target fails

```text
Target A → success
Target B → failure → log error
Target C → success
Target D → success
```

A failure for one target does not intentionally abort the entire target iteration.

---

## Reliability considerations

This project is designed for lightweight scheduled automation, not as a strict zero-downtime messaging service.

### Current strengths

* No VPS required
* No PM2 required
* No Docker required
* Secrets stay outside the source code
* Automatic scheduled starts
* Queue-based forwarding
* Per-target error handling
* Public GitHub Actions standard runners can be used without runner-minute charges

### Current limitations

1. GitHub schedule timing is not real-time.
2. Scheduled workflow executions can be delayed under GitHub Actions load.
3. Each scheduled run has a finite runtime window.
4. The queue is in memory and is lost when the process stops.
5. `forward.log` is local to the runner unless explicitly persisted.
6. This design is not a guaranteed zero-loss, zero-gap 24/7 message transport.

For strict 24/7 delivery guarantees, a persistent VPS/server, database-backed queue, durable update tracking, and a service supervisor would be a stronger architecture.

---

## Security

### Never expose

Never commit:

```text
BOT_TOKEN
.env
cookies
API keys
private credentials
```

### Public repository rules

Because the repository is public:

* keep all secrets in GitHub Actions Secrets
* never paste the bot token into `README.md`
* never include real tokens in screenshots
* keep runtime logs out of Git
* rotate the Telegram bot token immediately if it is ever exposed

### Secret rotation

If a Telegram token is exposed:

1. Revoke/rotate the token with BotFather.
2. Update the `BOT_TOKEN` GitHub repository secret.
3. Do not commit the replaced token anywhere.

---

## Troubleshooting

### Workflow does not appear in Actions

Check:

```text
.github/workflows/bot.yml
```

Make sure the YAML file is committed to the default branch.

### Workflow starts but bot exits immediately

Check:

```text
BOT_TOKEN
MAIN_CHANNEL_ID
TARGET_CHANNELS
FORWARD_DELAY
```

Confirm all repository secrets exist and are named exactly as expected.

### Bot starts but no messages are forwarded

Check:

* source channel ID
* bot permissions
* target channel permissions
* source channel membership
* target channel membership
* workflow log output

### One channel receives messages but another does not

Check the target channel ID and Telegram permissions for the failing target.

### Scheduled run is late

This can happen with GitHub scheduled workflows. The scheduler does not provide a real-time execution guarantee.

---

## Manual operation

The workflow includes:

```yaml
workflow_dispatch:
```

This means a manual run can be started from:

```text
Actions
→ HiddenGem Telegram Forward Bot
→ Run workflow
```

Manual execution is useful for testing and troubleshooting.

Normal operation should rely on the scheduled trigger.

---

## Development

### Requirements

* Node.js 20+
* npm
* Telegram bot token
* Telegram source channel
* Target channel IDs

### Install dependencies

```bash
npm ci
```

### Start locally

```bash
npm start
```

### Local environment

Create:

```text
.env
```

with the required variables.

Never commit that file.

---

## Package

The project uses:

* `node-telegram-bot-api`
* `dotenv`
* `boxen`
* `chalk`
* `gradient-string`
* `ora`
* `cli-progress`

The dependency versions are pinned through `package-lock.json`.

---

## Monitoring

The primary operational monitoring surface is:

```text
GitHub
→ Actions
→ HiddenGem Telegram Forward Bot
```

Review:

* workflow status
* run duration
* `Start Telegram bot` output
* forwarding events
* failures
* scheduled versus manual triggers

For production operations, consider adding:

* persistent logs
* Telegram health notifications
* retry tracking
* durable message IDs
* metrics
* alerting
* external uptime monitoring

---

## Roadmap

Potential production upgrades:

* [ ] Durable message queue
* [ ] Persistent processed-message database
* [ ] Automatic retry with backoff
* [ ] Telegram flood-limit handling
* [ ] Duplicate message protection
* [ ] Health monitoring
* [ ] Error alerting
* [ ] Delivery metrics
* [ ] Persistent structured logs
* [ ] VPS/systemd deployment option
* [ ] Docker deployment option
* [ ] Multi-source channel support
* [ ] Per-channel routing rules
* [ ] Configurable per-channel delays
* [ ] Graceful shutdown and restart recovery

---

## Production deployment guidance

For lightweight scheduled forwarding, GitHub Actions is a practical execution layer.

For a strict always-on messaging service, the recommended next-stage architecture is:

```text
GitHub
  │
  └── Deploy / update
          │
          ▼
     Persistent VPS
          │
     ┌────┴────┐
     │ systemd │
     │   or    │
     │ Docker  │
     └────┬────┘
          │
          ▼
     Node.js bot
          │
          ▼
   Telegram polling
```

A persistent service removes the lifecycle gaps inherent in repeatedly starting and stopping a hosted workflow.

---

## GitHub Actions and runner notes

This repository currently targets the standard `ubuntu-latest` GitHub-hosted runner.

For public repositories, GitHub documents the standard GitHub-hosted runners as free and unlimited. This is separate from the runtime limits and scheduling behavior of individual workflows.

Official references:

* [GitHub Actions](https://docs.github.com/en/actions)
* [GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
* [Workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax)
* [Scheduled workflows](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
* [Actions limits](https://docs.github.com/en/actions/reference/limits)
* [GitHub Actions Secrets](https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions)
* [Telegram Bot API](https://core.telegram.org/bots/api)

---

## License

This project is distributed under the license declared in the repository's `package.json`.

If no explicit license has been added to the repository, all rights should be treated according to the applicable copyright rules rather than assuming an open-source license.

---

## Maintainer

**HiddenGem / BidyutRoy2**

Repository:

https://github.com/BidyutRoy2/telegram-forward-bot
::: 
