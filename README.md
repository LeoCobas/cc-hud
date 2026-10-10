# cc-hud

A slim two-line HUD for Claude Code, in a Nerd Font theme (Catppuccin colors), with git-sync's Pull / Commit / Push buttons built in.

```
󰚩 Opus 5.5 ◑ high    aurora-app    feat/themes* ↑3 [+170 -22]
󰍛 ▰▰▰▱▱▱ 42%    5h 23% 2h10m    7d 61% 3d4h          [ Pull ] [ Commit ] [ Push ]
```

- **Line 1:** model, reasoning effort, folder, git branch (`*` when dirty), commits ahead/behind, uncommitted `[+added -removed]`.
- **Line 2:** context window, subscription usage (5-hour and 7-day windows with time to reset), and the git buttons. Gauges turn yellow at 70% and red at 90%.
- **Git** (from [git-sync](https://github.com/LeoCobas/git-sync)): Pull (rebase + autostash), Commit with a Haiku-written message (Confirm / Regenerate / Exclude new files), Push (rebases first when behind), Resolve-with-Claude / Abort on conflicts, auto-sync on session start and every 2 minutes, and `/sync`.

## Install

```
/plugin install slim-hud --marketplace LeoCobas/cc-hud
```

Disable `git-sync` if you have it: both draw in the band above the prompt and both register `/sync`.

Needs a [Nerd Font](https://www.nerdfonts.com/font-downloads) in your terminal (e.g. Hack Nerd Font, JetBrainsMono Nerd Font).

## Options (`/config` → slim-hud)

| Option | Default | |
| --- | --- | --- |
| Position | `above` | `above` the prompt (a collapsible band) or `below` it (over the hint line) |
| Effort | on | reasoning effort beside the model |
| Diff lines | on | `[+added -removed]` |
| Weekly usage | on | the 7-day window |
| Reset times | on | time until each usage window resets |
| Session cost | off | USD so far |
| Session time | off | how long the session has run |
| Auto-sync | on | fetch / fast-forward on start and every 2 minutes |

## Develop

```
claude plugin validate slim-hud
claude plugin test slim-hud
```

Inspired by [hoobnn's HUD](https://github.com/hoobnn/hoobnn-agent-mods/tree/main/claude-code/hud), slimmed down.
