/**
 * Security re-audit — ManualAssignModal (AGE-265).
 * Target: raw_from_ai_studio/src/modals/ManualAssignModal.tsx, as built in
 * frontend/src/modals/ManualAssignModal.tsx and hosted by
 * frontend/src/components/SeatManagement.tsx.
 * Plan: .plan/026-2026-08-09-re-audit-manualassignmodal-modal-raw-from-ai-studio-modal-ma.md
 * (build spec of record: .plan/016-2026-08-04-manualassignmodal-modal.md)
 *
 * Security never ran on this modal before its build task was closed. This
 * suite is the durable proof for the client-side half of that audit:
 *
 *  1. SEV-001 (found by this audit, fixed under this ticket): the shared
 *     Axios clients in frontend/src/services/http.service.ts had NO request
 *     interceptor, so no `Authorization` header was ever attached to any
 *     request. Plans 016 and 026 both assumed a "JWT-attached tourClient",
 *     but every admin seat mutation this modal can trigger (approve, cancel,
 *     toggle-reserve, manual-assign, swap-move) was in fact sent
 *     unauthenticated. Guarded below.
 *  2. Every mutation the modal can trigger goes through seatService on the
 *     shared tourClient — the modal itself holds no token, storage, or
 *     network logic and cannot call these endpoints directly.
 *  3. The client-supplied manual-assign `status` is constrained to the
 *     taken|pending contract in the UI (server-side whitelisting is verified
 *     separately in tour-service — the client is never the trust boundary).
 *  4. Field-name drift guard: the repo Seat uses `seatStatus`, the prototype
 *     used `status`; the modal must keep reading `seatStatus`.
 *  5. Passenger free text (name/phone/pickup/notes) is rendered as text, with
 *     no raw-HTML injection sinks.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import type { InternalAxiosRequestConfig } from 'axios'
import { ManualAssignModal } from '../modals/ManualAssignModal'
import { httpService, tourClient, userManagementClient } from '../services/http.service'
import { seatService } from '../services/seat.service'
import { useStore } from '../store/store'
import type { Seat, SeatStatus } from '../types/seat.types'

vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }))

const here = path.dirname(fileURLToPath(import.meta.url))

const buildSeat = (seatNumber: number, seatStatus: SeatStatus, extra: Partial<Seat> = {}): Seat => ({
  id: `bus1-seat${seatNumber}`,
  seatNumber,
  row: Math.ceil(seatNumber / 4),
  col: ((seatNumber - 1) % 4) + 1,
  seatStatus,
  ...extra
})

const noop = () => {}

function renderModal(overrides: Partial<React.ComponentProps<typeof ManualAssignModal>> = {}) {
  const props: React.ComponentProps<typeof ManualAssignModal> = {
    isOpen: true,
    onClose: noop,
    seat: buildSeat(5, 'available'),
    pickupPoints: ['תל אביב'],
    onSaveAssign: noop,
    onApprove: noop,
    onCancel: noop,
    onToggleReserve: noop,
    ...overrides
  }
  return render(<ManualAssignModal {...props} />)
}

// Runs the client's request interceptors over a bare config, the same way
// Axios does before dispatching — this is what actually proves the header is
// attached, rather than asserting on the interceptor's mere existence.
async function runRequestInterceptors(client: typeof tourClient) {
  const handlers = (
    client.interceptors.request as unknown as {
      handlers: Array<{
        fulfilled: (
          c: InternalAxiosRequestConfig
        ) => InternalAxiosRequestConfig | Promise<InternalAxiosRequestConfig>
      } | null>
    }
  ).handlers
  let config = { headers: {} } as unknown as InternalAxiosRequestConfig
  for (const handler of handlers) {
    if (handler?.fulfilled) config = await handler.fulfilled(config)
  }
  return config
}

describe('AGE-265: SEV-001 — admin JWT is attached to outgoing requests', () => {
  beforeEach(() => {
    useStore.getState().clearAuth()
  })
  afterEach(() => {
    useStore.getState().clearAuth()
  })

  it('attaches the admin bearer token to tourClient requests (seat mutations)', async () => {
    useStore.setState({ authToken: 'admin-jwt-123' })
    const config = await runRequestInterceptors(tourClient)
    expect(config.headers.Authorization).toBe('Bearer admin-jwt-123')
  })

  it('attaches the admin bearer token to userManagementClient requests too', async () => {
    useStore.setState({ authToken: 'admin-jwt-123' })
    const config = await runRequestInterceptors(userManagementClient)
    expect(config.headers.Authorization).toBe('Bearer admin-jwt-123')
  })

  it('sends no Authorization header when there is no logged-in admin (fails closed server-side)', async () => {
    const config = await runRequestInterceptors(tourClient)
    expect(config.headers.Authorization).toBeUndefined()
  })

  it('stops sending the token immediately after logout clears the auth slice', async () => {
    useStore.setState({ authToken: 'admin-jwt-123' })
    useStore.getState().clearAuth()
    const config = await runRequestInterceptors(tourClient)
    expect(config.headers.Authorization).toBeUndefined()
  })
})

describe('AGE-265: every modal-triggered mutation routes through the JWT-attached tourClient', () => {
  const cases: Array<[string, () => Promise<unknown>, string]> = [
    ['approve', () => seatService.approve('t1', 'b1', 'seat4'), '/tour/t1/buses/b1/seats/approve'],
    ['cancel', () => seatService.cancel('t1', 'b1', 'seat4'), '/tour/t1/buses/b1/seats/cancel'],
    [
      'toggle-reserve',
      () => seatService.toggleReserve('t1', 'b1', 'seat4'),
      '/tour/t1/buses/b1/seats/toggle-reserve'
    ],
    ['swap-move', () => seatService.swapMove('t1', 'b1', 4, 5), '/tour/t1/buses/b1/seats/swap-move']
  ]

  it.each(cases)('%s posts through tourClient', async (_name, call, url) => {
    const postSpy = vi.spyOn(httpService, 'post').mockResolvedValue([] as never)
    await call()
    expect(postSpy).toHaveBeenCalledWith(tourClient, url, expect.anything())
    postSpy.mockRestore()
  })

  it('manual-assign posts through tourClient and forwards the target status verbatim', async () => {
    const postSpy = vi.spyOn(httpService, 'post').mockResolvedValue([] as never)
    await seatService.manualAssign('t1', 'b1', {
      tourId: 't1',
      busId: 'b1',
      seatNumbers: [4],
      passengerName: 'דנה',
      passengerPhone: '050',
      pickupPoint: '',
      notes: '',
      status: 'pending'
    })
    expect(postSpy).toHaveBeenCalledWith(
      tourClient,
      '/tour/t1/buses/b1/seats/manual-assign',
      expect.objectContaining({ status: 'pending', seatNumbers: [4] })
    )
    postSpy.mockRestore()
  })
})

describe('AGE-265: the modal holds no auth, network, or raw-HTML logic', () => {
  const modalSource = readFileSync(
    path.resolve(here, '../modals/ManualAssignModal.tsx'),
    'utf-8'
  )

  it('contains no direct network calls or API URLs', () => {
    expect(modalSource).not.toMatch(/\bfetch\(/)
    expect(modalSource).not.toMatch(/\baxios\b/)
    expect(modalSource).not.toMatch(/http\.service/)
    expect(modalSource).not.toMatch(/import\.meta\.env/)
    expect(modalSource).not.toMatch(/seatService/)
  })

  it('contains no token or storage handling', () => {
    expect(modalSource).not.toMatch(/localStorage/)
    expect(modalSource).not.toMatch(/Preferences/)
    expect(modalSource).not.toMatch(/Authorization/)
    expect(modalSource).not.toMatch(/[Tt]oken/)
  })

  it('contains no raw-HTML injection sinks', () => {
    expect(modalSource).not.toMatch(/dangerouslySetInnerHTML/)
    expect(modalSource).not.toMatch(/innerHTML/)
    expect(modalSource).not.toMatch(/document\.write/)
    expect(modalSource).not.toMatch(/\beval\(/)
  })
})

describe('AGE-265: seat status handling stays inside the contract', () => {
  it('reads seatStatus (repo field), not the prototype status field', () => {
    // A seat carrying a stale prototype-shaped `status` must not influence
    // the badge — only `seatStatus` may.
    const seat = { ...buildSeat(9, 'reserved'), status: 'available' } as unknown as Seat
    renderModal({ seat })
    expect(screen.getByText('שמור ע"י הנהלה')).toBeInTheDocument()
    expect(screen.queryByText('פנוי')).not.toBeInTheDocument()
  })

  it('only ever offers taken|pending as the post-save status', () => {
    renderModal({ seat: buildSeat(9, 'reserved') })
    const radios = screen.getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map(r => r.value).sort()).toEqual(['pending', 'taken'])
  })

  it('never submits a reserved/available status for a reserved seat', async () => {
    const user = userEvent.setup()
    const onSaveAssign = vi.fn()
    renderModal({ seat: buildSeat(9, 'reserved'), onSaveAssign })
    await user.type(screen.getByLabelText(/שם הנוסע/), 'דנה')
    await user.click(screen.getByRole('button', { name: 'שמור שינויים' }))
    expect(onSaveAssign).toHaveBeenCalledWith(9, 'דנה', '', '', '', 'taken')
  })
})

describe('AGE-265: passenger free text is rendered as text, never as markup', () => {
  it('does not execute or inject HTML from stored passenger fields', () => {
    const payload = '<img src=x onerror="window.__xss=1">'
    const { container } = renderModal({
      seat: buildSeat(11, 'taken', {
        passengerName: payload,
        passengerPhone: payload,
        pickupPoint: payload,
        notes: payload
      })
    })
    expect(container.querySelector('img')).toBeNull()
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined()
    expect((screen.getByLabelText(/שם הנוסע/) as HTMLInputElement).value).toBe(payload)
  })

  it('renders a script-shaped seat number/status header without creating script nodes', () => {
    const { container } = renderModal({
      seat: buildSeat(12, 'pending', { notes: '<script>window.__xss2=1</script>' })
    })
    expect(container.querySelector('script')).toBeNull()
    expect((window as unknown as { __xss2?: number }).__xss2).toBeUndefined()
  })
})
