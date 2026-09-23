import { describe, it, expect, vi, beforeEach } from 'vitest'

// Fake socket.io-client: captures registered event handlers so the test can
// fire a synthetic 'connect' event and assert what gets (re-)emitted.
const handlers: Record<string, (...args: unknown[]) => void> = {}
const emit = vi.fn()
const ioMock = vi.fn(() => ({
  on: (event: string, handler: (...args: unknown[]) => void) => {
    handlers[event] = handler
  },
  off: vi.fn(),
  emit
}))

vi.mock('socket.io-client', () => ({ io: ioMock }))

vi.mock('../store/store', () => ({
  useStore: { getState: () => ({ authToken: 'test-token' }) }
}))

describe('socketService', () => {
  beforeEach(() => {
    vi.resetModules()
    emit.mockClear()
    delete handlers.connect
  })

  it('rejoins every active bus room after the underlying socket reconnects', async () => {
    const { socketService } = await import('./socket.service')

    socketService.joinBus('bus-1')
    socketService.joinBus('bus-2')
    emit.mockClear() // only interested in what happens on reconnect from here

    // Simulate the transport dropping and reconnecting — socket.io rooms are
    // per-connection server state, so without an explicit rejoin here the
    // server would silently stop broadcasting to this client (the bug this
    // guards against: seat/passenger updates stop arriving live until
    // something else forces a full refetch).
    handlers.connect()

    expect(emit).toHaveBeenCalledWith('bus:join', { busId: 'bus-1', token: 'test-token' })
    expect(emit).toHaveBeenCalledWith('bus:join', { busId: 'bus-2', token: 'test-token' })
    expect(emit).toHaveBeenCalledTimes(2)
  })

  it('stops rejoining a bus room once it has been left', async () => {
    const { socketService } = await import('./socket.service')

    socketService.joinBus('bus-1')
    socketService.leaveBus('bus-1')
    emit.mockClear()

    handlers.connect()

    expect(emit).not.toHaveBeenCalledWith('bus:join', expect.objectContaining({ busId: 'bus-1' }))
  })
})
