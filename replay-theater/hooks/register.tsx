import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Step } from '../types'

const PANE = 'replay-theater'
const steps = atom({ plugin: 'replay-theater', key: 'steps' } as const, [])
const hint = atom({ plugin: 'replay-theater', key: 'hint' } as const, false)
const cur = atom({ plugin: 'replay-theater', key: 'cur' } as const, 0)

// ponytail: trim common head/tail lines, rest is -old +new; no LCS, noisy for big rewrites
export function diff(before: string, after: string) {
  const a = before === '' ? [] : before.split('\n')
  const b = after === '' ? [] : after.split('\n')
  let s = 0
  while (s < a.length && s < b.length && a[s] === b[s]) s++
  let e = 0
  while (e < a.length - s && e < b.length - s && a[a.length - 1 - e] === b[b.length - 1 - e]) e++
  const del = a.slice(s, a.length - e)
  const add = b.slice(s, b.length - e)
  return { del, add }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'replay', description: "Step through the last turn's edits" })
    return next(e)
  })

  on('command.run', { command: 'replay' }, async $ => {
    if (!(await read($, steps)).length) return { text: 'No edits to replay.' }
    await open($)
    return { text: 'Replay Theater opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    await update($, steps, () => [])
    await update($, hint, () => false)
    return next(e)
  })

  for (const tool of ['Edit', 'Write'] as const)
    on('tool.call', { tool }, async ($, e: any, next) => {
      let step: Step | undefined
      try {
        const before = tool === 'Edit' ? e.old_string : await $.fs.read(e.file_path).catch(() => '')
        step = { file: e.file_path, tool, before, after: tool === 'Edit' ? e.new_string : e.content }
      } catch {} // recording must never block the edit
      const ran = await next(e)
      if (step && !(ran as any)?.deny) await update($, steps, l => [...l, step!])
      return ran
    })

  on('turn.complete', async ($, e, next) => {
    if ((await read($, steps)).length) await update($, hint, () => true)
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const list = await read($, steps)
    if (e.props.hasSurvey || e.props.isWorking || !list.length || !(await read($, hint))) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    return (
      <Box>
        <Text dimColor>Replay Theater: {list.length} edit{list.length === 1 ? '' : 's'} · /replay </Text>
        <Button plain hotkey="r" onPress={() => open($)}>
          Replay
        </Button>
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const list = await read($, steps)
    if (!list.length) return <Text dimColor>No edits to replay.</Text>
    const i = Math.min(await read($, cur), list.length - 1)
    const st = list[i]
    const { del, add } = diff(st.before, st.after)
    const room = Math.max(1, (e.viewport?.rows ?? 24) - 10)
    const rows = [...del.map(t => ({ t, c: 'red', p: '-' })), ...add.map(t => ({ t, c: 'green', p: '+' }))]
    const go = (n: number) => update($, cur, () => Math.max(0, Math.min(list.length - 1, n)))

    return (
      <Box flexDirection="column">
        <Box justifyContent="space-between">
          <Text bold color="magenta">▶ Replay Theater</Text>
          <Text bold>step {i + 1} of {list.length}</Text>
        </Box>
        <Box>
          {list.map((_, n) =>
            n === i ? (
              <Text backgroundColor="blue" bold> {n + 1} </Text>
            ) : (
              <Text dimColor> {n + 1} </Text>
            ),
          )}
        </Box>
        <Text bold color="cyan">{st.file}</Text>
        <Box>
          <Text dimColor>{st.tool}  </Text>
          <Text color="green">+{add.length}</Text>
          <Text>  </Text>
          <Text color="red">-{del.length}</Text>
        </Box>
        <Text> </Text>
        {rows.slice(0, room).map(r => (
          <Text color={r.c}>{r.p} {r.t}</Text>
        ))}
        {rows.length > room && <Text dimColor>+{rows.length - room} more lines</Text>}
        <Text> </Text>
        <Box>
          <Button plain hotkey="p" onPress={() => go(i - 1)}>◄ Prev</Button>
          <Text>  </Text>
          <Button plain hotkey="n" autoFocus onPress={() => go(i + 1)}>Next ►</Button>
          <Text>  </Text>
          <Button plain hotkey="c" onPress={() => $.ui.close({ id: PANE })}>Close</Button>
        </Box>
      </Box>
    )
  })
}

async function open($: any) {
  await update($, cur, () => 0)
  await $.ui.open({ id: PANE, title: 'Replay Theater', focus: true, closeOnEscape: true })
}
