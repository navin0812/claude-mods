import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Pending } from '../types'

const PANE = 'blast-radius'
const CAP = 200
const pending = atom({ plugin: 'blast-radius', key: 'pending' } as const, null)
type Choice = 'proceed' | 'cancel'
// the answer travels through this file: a pending `$.process.run` waits on it for free,
// where a sleep loop would burn the hook's 10s budget (ponytail: 10 min ceiling, then deny)
const answerFile = (id: string) => `/tmp/blast-radius-${id.replace(/[^\w-]/g, '')}.answer`

export type Kind = 'rm' | 'reset' | 'clean' | 'push' | 'migrate'
export type Hit = { kind: Kind; argv: string[] }

const MIGRATE =
  /\b(prisma\s+(migrate\s+(dev|deploy|reset)|db\s+push)|rails\s+db:migrate|manage\.py\s+migrate|alembic\s+(upgrade|downgrade)|knex\s+migrate|sequelize\s+db:migrate|drizzle-kit\s+(push|migrate))\b/

// ponytail: split on && ; || | only, no real shell parsing; quoted separators / subshells slip through
export function classify(command: string): Hit | null {
  for (const seg of command.split(/&&|\|\||;|\|/)) {
    const argv = seg.trim().split(/\s+/).filter(Boolean)
    const [bin, sub] = argv
    const flags = argv.filter(a => /^-[a-zA-Z]+$/.test(a)).join('')
    if (bin === 'rm' && /r|R/.test(flags) && /f/.test(flags) || (bin === 'rm' && argv.includes('--recursive') && argv.includes('--force')))
      return { kind: 'rm', argv: argv.slice(1).filter(a => !a.startsWith('-')) }
    if (bin === 'git' && sub === 'reset' && argv.includes('--hard')) return { kind: 'reset', argv }
    if (bin === 'git' && sub === 'clean' && (/f/.test(flags) || argv.includes('--force'))) return { kind: 'clean', argv }
    if (bin === 'git' && sub === 'push' && argv.some(a => /^(--force(-with-lease)?(=.*)?|-f|\+\S+)$/.test(a) || /^-[a-zA-Z]*f/.test(a)))
      return { kind: 'push', argv }
    if (MIGRATE.test(seg)) return { kind: 'migrate', argv }
  }
  return null
}

const WOULD: Record<Kind, string> = {
  rm: 'delete',
  reset: 'discard uncommitted changes to',
  clean: 'delete untracked',
  push: 'overwrite the remote branch, dropping commits',
  migrate: 'apply migrations to the database; migration files',
}

export const register: Register = on => {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const hit = classify(e.command)
    if (!hit) return next(e)

    const lines = await radius($, hit)
    const files = lines.slice(0, CAP)
    const p: Pending = {
      id: e.tool_use_id,
      kind: hit.kind,
      command: e.command,
      would: WOULD[hit.kind],
      files,
      more: lines.length - files.length,
      size: hit.kind === 'rm' ? await size($, hit.argv) : undefined,
      paths: hit.kind === 'rm' ? hit.argv.join(' ') : undefined,
    }
    // runs only on an explicit Proceed; anything else (Cancel, Esc, interrupt, error) denies
    const choice = await hold($, p, next.signal)
    return choice === 'proceed' ? next(e) : { deny: `Blast Radius: user did not approve \`${e.command}\`` }
  }).catch(($, e, next) =>
    // fail closed: a throw or overrun would otherwise let the call run unheld
    classify(e.command) ? { deny: `Blast Radius: could not hold this call, blocked to be safe (${next.error.kind}: ${next.error.message ?? 'no message'})` } : undefined,
  )

  on('ui.close', { id: PANE }, async ($, e, next) => {
    const p = await read($, pending)
    if (p) await $.fs.write(answerFile(p.id), 'cancel') // closed by hand without an answer; a real answer already wrote the file first
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const p = await read($, pending)
    if (!p) return <Text dimColor>Nothing held.</Text>
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 10)
    const shown = p.files.slice(0, room)
    const hidden = p.files.length - shown.length + p.more
    const n = p.files.length + p.more
    const answer = (choice: Choice) => $.fs.write(answerFile(p.id), choice)

    return (
      <Box flexDirection="column">
        <Text bold color="yellow">
          ⚠ Blast Radius · {p.command.split(/\s+/).slice(0, 2).join(' ')}
        </Text>
        <Box>
          <Text dimColor>Command  </Text>
          <Text bold>{p.command}</Text>
        </Box>
        <Box>
          <Text dimColor>Would    </Text>
          <Text bold color="red">
            {p.would} {n} file{n === 1 ? '' : 's'}
            {p.size ? ` (${p.size})` : ''}
          </Text>
        </Box>
        <Text> </Text>
        {shown.map(f => (
          <Text>  {f}</Text>
        ))}
        {hidden > 0 && <Text dimColor>  +{hidden} more</Text>}
        {p.paths && (
          <Text dimColor italic>
            Paths: {p.paths}
          </Text>
        )}
        <Text> </Text>
        <Box>
          <Button plain hotkey="1" onPress={() => answer('proceed')}>
            Proceed
          </Button>
          <Text>  </Text>
          <Button plain hotkey="2" autoFocus onPress={() => answer('cancel')}>
            Cancel
          </Button>
          <Text dimColor>  Claude is waiting on your answer</Text>
        </Box>
      </Box>
    )
  })
}

async function hold($: any, p: Pending, signal: AbortSignal): Promise<Choice> {
  const file = answerFile(p.id)
  await update($, pending, () => p)
  signal.addEventListener?.('abort', () => void $.fs.write(file, 'cancel'))
  try {
    const opened = await $.ui.open({ id: PANE, title: 'Blast Radius', focus: true, closeOnEscape: true })
    if (!opened.isPlaced) {
      // pane has no room (narrow terminal): same question in the engine's own dialog
      const n = p.files.length + p.more
      const a = await $.ui.ask(`Blast Radius: ${p.command}\nWould ${p.would} ${n} file(s). Run it?`, ['Proceed', 'Cancel'])
      return a === 'Proceed' ? 'proceed' : 'cancel'
    }
    // blocks until a button (or close, or interrupt) writes the answer file
    const r = await $.process.run(['sh', '-c', 'until [ -s "$0" ]; do sleep 0.2; done; cat "$0"', file], { timeoutMs: 600_000 })
    return (r.stdout as string).trim() === 'proceed' ? 'proceed' : 'cancel'
  } catch {
    return 'cancel' // dismissed ask, timeout, -p run: nobody said yes
  } finally {
    await update($, pending, () => null) // before close, so the ui.close hook skips
    await $.ui.close({ id: PANE })
    await $.process.run(['rm', '-f', file]).catch(() => undefined)
  }
}

async function radius($: any, { kind, argv }: Hit): Promise<string[]> {
  const run = async (cmd: string[]) => {
    try {
      const r = await $.process.run(cmd)
      return r.exitCode === 0 ? (r.stdout as string).split('\n').filter(Boolean) : []
    } catch {
      return []
    }
  }
  switch (kind) {
    case 'rm':
      return argv.length ? run(['find', ...argv, '-not', '-type', 'd']) : []
    case 'reset':
      return (await run(['git', 'status', '--porcelain', '--untracked-files=no'])).map(l => l.slice(3))
    case 'clean':
      // dry run: swap the force flag for -n
      return (await run(['git', ...argv.slice(1).map(a => (a === '--force' ? '-n' : a.replace(/^(-[a-zA-Z]*)f/, '$1n')))])).map(l => l.replace(/^Would (remove|skip) /, ''))
    case 'push':
      return run(['git', 'log', '--oneline', 'HEAD..@{u}'])
    case 'migrate': {
      const out: string[] = []
      for (const d of ['prisma/migrations', 'migrations', 'db/migrate', 'alembic/versions'])
        for (const l of (await run(['ls', '-t', d])).slice(0, 20)) out.push(`${d}/${l}`)
      return out
    }
  }
}

// total size of the rm targets via du -sk, as "1.1 MB"
async function size($: any, targets: string[]): Promise<string | undefined> {
  if (!targets.length) return undefined
  try {
    const r = await $.process.run(['du', '-sk', ...targets])
    const kb = (r.stdout as string).split('\n').reduce((n, l) => n + (parseInt(l, 10) || 0), 0)
    return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
  } catch {
    return undefined
  }
}
