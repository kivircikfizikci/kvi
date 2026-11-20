import { describe, expect, it } from 'vitest'
import { formatPower } from './format'

describe('formatPower', () => {
  it('formats decimal formation power in millions without trailing zeroes', () => {
    expect(formatPower(20_100_000)).toBe('20.1M')
  })
})
