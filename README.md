# claude-mods

Claude Code mods.

```
/plugin marketplace add navin0812/claude-mods
/plugin install blast-radius@claude-mods
```

## blast-radius

Holds Bash calls Claude makes that are destructive (`rm -rf`, `git reset --hard`, `git clean -f`, force push, DB migrations), opens a pane with the command, what it would do and the files affected, and runs it only on an explicit **Proceed**. Cancel, Esc, an interrupt or an error all deny the call.

Limits: only Bash calls Claude makes are held, not commands you run yourself with `!`; command detection splits on `&&`, `;`, `||`, `|` only.
