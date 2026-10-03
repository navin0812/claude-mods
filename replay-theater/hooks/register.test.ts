import { expect, test } from 'claude-code/testing'

import { diff } from './register'

test('diff trims common lines and counts changes', () => {
  expect(diff('a\nb\nc', 'a\nB\nc')).toEqual({ del: ['b'], add: ['B'] })
  expect(diff('a', 'a\nb')).toEqual({ del: [], add: ['b'] })
  expect(diff('a\nb', 'a')).toEqual({ del: ['b'], add: [] })
  expect(diff('', 'x')).toEqual({ del: [], add: ['x'] })
  expect(diff('same', 'same')).toEqual({ del: [], add: [] })
})
