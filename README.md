# claude-mods

Claude Code mods.

```
/plugin marketplace add navin0812/claude-mods
/plugin install blast-radius@claude-mods
/plugin install replay-theater@claude-mods
```

## blast-radius

Holds Bash calls Claude makes that are destructive (`rm -rf`, `git reset --hard`, `git clean -f`, force push, DB migrations), opens a pane with the command, what it would do and the files affected, and runs it only on an explicit **Proceed**. Cancel, Esc, an interrupt or an error all deny the call.

Limits: only Bash calls Claude makes are held, not commands you run yourself with `!`; command detection splits on `&&`, `;`, `||`, `|` only.

## replay-theater

Records every Edit and Write Claude makes during a turn (file, text before and after). When the turn ends a hint appears above the prompt; run `/replay` to step through the edits one diff at a time with a numbered strip and Prev, Next and Close buttons.

Limits: the `r` hotkey only fires while the band above the prompt has focus (ctrl+x tab or a click), so `/replay` is the reliable way in; the diff trims common head/tail lines rather than running a full LCS.
