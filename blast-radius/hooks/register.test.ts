import { expect, test } from 'claude-code/testing'

import { classify } from './register'

test('classify flags destructive commands and ignores the rest', () => {
  expect(classify('rm -rf build')?.kind).toBe('rm')
  expect(classify('cd x && rm -fr tmp')?.kind).toBe('rm')
  expect(classify('git reset --hard HEAD~1')?.kind).toBe('reset')
  expect(classify('git clean -fd')?.kind).toBe('clean')
  expect(classify('git push --force origin main')?.kind).toBe('push')
  expect(classify('git push -f')?.kind).toBe('push')
  expect(classify('npx prisma migrate deploy')?.kind).toBe('migrate')
  expect(classify('rm file.txt')).toBe(null)
  expect(classify('git push origin main')).toBe(null)
  expect(classify('git status')).toBe(null)
})
