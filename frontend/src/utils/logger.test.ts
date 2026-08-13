import { describe, it, expect, beforeEach } from 'vitest'
import { logger } from './logger'

describe('logger', () => {
  beforeEach(() => {
    logger.init()
    logger.clear()
  })

  it('captures tagged console.log entries', () => {
    console.log('[LOGIN] admin signed in')
    const logs = logger.getLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].tag).toBe('LOGIN')
    expect(logs[0].message).toBe('admin signed in')
  })

  it('ignores untagged console.log entries', () => {
    console.log('plain message with no tag')
    expect(logger.getLogs()).toHaveLength(0)
  })

  it('exposes the set of available tags', () => {
    console.log('[API] x')
    console.log('[SEAT] y')
    expect(logger.getAvailableTags().sort()).toEqual(['API', 'SEAT'])
  })
})
