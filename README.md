# cc-hud

A slim two-line HUD for Claude Code, in a Nerd Font theme (Catppuccin colors), with Pull / Commit / Push buttons built in.

<img width="1298" height="169" alt="cc-hud below the prompt" src="https://github.com/user-attachments/assets/2988a189-7644-4bfc-8d38-563e668a2112" />

- **Line 1:** model, reasoning effort, folder, git branch (`*` when dirty), commits ahead/behind, uncommitted `[+added -removed]`.
- **Line 2:** context window, subscription usage (5-hour and 7-day windows with time to reset), and the git buttons. Gauges turn yellow at 70% and red at 90%.

## Git

| Action | What it runs | Uses a model? |
| --- | --- | --- |
| **Pull** | `git pull --rebase --autostash` | no |
| **Push** | `git push` (`-u origin HEAD` with no upstream); when the remote is ahead, a `pull --rebase --autostash` first | no |
| **Commit** | `git add -A`, then Haiku (low effort) writes a message from the staged diff; **Confirm** runs `git commit`, **Regenerate** asks again, **Exclude new files** unstages untracked files, **Cancel** drops the draft | Haiku, once per Commit / Regenerate |
| **Resolve** (on conflicts) | sends Claude a prompt in the conversation to merge the conflicted files, then continue the rebase (it won't push) | the main model, as a normal turn |
| **Abort** (on conflicts) | `git rebase --abort` (or `merge --abort`) | no |
| **`/sync`** | `git fetch`, then `git pull --ff-only` if behind with no local changes | no |

### Auto-sync

On by default; turn it off in `/config` → slim-hud → Auto-sync. No model is involved.

- **On session start:** the same as `/sync`: `git fetch`, then a fast-forward pull only when the branch is behind **and** there are no local changes. With local changes it only warns you to press Pull.
- **Every 2 minutes:** `git fetch` alone, so the bar's `↓` count stays current. It never pulls, rebases or touches your working tree.
- **Off:** git runs only when you press a button or type `/sync`.

Git never waits on a credential prompt (`GIT_TERMINAL_PROMPT=0`): a fetch or push that needs one fails with a toast instead.

## Install

```
/plugin install slim-hud --marketplace LeoCobas/cc-hud
```

Needs a [Nerd Font](https://www.nerdfonts.com/font-downloads) in your terminal (e.g. Hack Nerd Font, JetBrainsMono Nerd Font).

## Options (`/config` → slim-hud)

| Option | Default | |
| --- | --- | --- |
| Position | `below` | `below` the prompt (over the hint line) or `above` it (a collapsible band) |
| Effort | on | reasoning effort beside the model |
| Diff lines | on | `[+added -removed]` |
| Weekly usage | on | the 7-day window |
| Reset times | on | time until each usage window resets |
| Session cost | off | USD so far |
| Session time | off | how long the session has run |
| Auto-sync | on | fetch + fast-forward (when clean) on session start; fetch only every 2 minutes. See [Auto-sync](#auto-sync) |

## Develop

```
claude plugin validate slim-hud
claude plugin test slim-hud
```

Inspired by [hoobnn's HUD](https://github.com/hoobnn/hoobnn-agent-mods/tree/main/claude-code/hud), slimmed down.
