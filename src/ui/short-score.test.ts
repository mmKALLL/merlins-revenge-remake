import { describe, expect, it } from 'vitest'
import { shortScore } from './short-score'

describe('shortScore', () => {
  it('shows 4 digits in full, then truncates to k (one decimal below 100k) or M (4 significant digits)', () => {
    expect([0, 9999, 10000, 12345, 99999, 123456, 999999, 1234567, 12345678, 123456789, 1999999999].map(shortScore))
      .toEqual(['0', '9999', '10k', '12.3k', '99.9k', '123k', '999k', '1.234M', '12.34M', '123.4M', '1999M'])
  })
})
