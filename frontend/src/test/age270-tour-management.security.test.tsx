import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const here = path.dirname(fileURLToPath(import.meta.url))

// AGE-270 security re-audit of TourManagement (Screen 3 - Tab 2).
// The component is presentational: every tour/bus mutation it can trigger is
// bubbled to AdminDashboardPage, which calls tourService/busService. Those go
// through http.service, whose request interceptor is the single place the
// admin JWT is attached. These tests lock that layering in so the component
// can never grow its own token/network handling, and assert the destructive
// tour/bus deletes stay behind an in-app confirmation step.
const componentSource = readFileSync(
  path.resolve(here, '../components/TourManagement.tsx'),
  'utf-8'
)
const pageSource = readFileSync(
  path.resolve(here, '../pages/AdminDashboardPage.tsx'),
  'utf-8'
)
const httpSource = readFileSync(path.resolve(here, '../services/http.service.ts'), 'utf-8')
const tourServiceSource = readFileSync(
  path.resolve(here, '../services/tour.service.ts'),
  'utf-8'
)
const busServiceSource = readFileSync(path.resolve(here, '../services/bus.service.ts'), 'utf-8')

describe('AGE-270: TourManagement holds no auth, network or raw-HTML logic', () => {
  it('contains no direct network calls or API URLs', () => {
    expect(componentSource).not.toMatch(/\bfetch\(/)
    expect(componentSource).not.toMatch(/\baxios\b/)
    expect(componentSource).not.toMatch(/http\.service/)
    expect(componentSource).not.toMatch(/import\.meta\.env/)
    expect(componentSource).not.toMatch(/tourService|busService/)
  })

  it('contains no token or storage handling', () => {
    expect(componentSource).not.toMatch(/localStorage/)
    expect(componentSource).not.toMatch(/Preferences/)
    expect(componentSource).not.toMatch(/Authorization/)
    expect(componentSource).not.toMatch(/[Tt]oken/)
  })

  it('contains no raw-HTML injection sinks', () => {
    expect(componentSource).not.toMatch(/dangerouslySetInnerHTML/)
    expect(componentSource).not.toMatch(/innerHTML/)
    expect(componentSource).not.toMatch(/document\.write/)
    expect(componentSource).not.toMatch(/\beval\(/)
  })
})

describe('AGE-270: tour/bus mutations go through the JWT-attaching client', () => {
  it('http.service attaches the admin JWT centrally on every request', () => {
    expect(httpSource).toMatch(/interceptors\.request\.use/)
    expect(httpSource).toMatch(/Authorization\s*=\s*`Bearer \$\{token\}`/)
    expect(httpSource).toMatch(/useStore\.getState\(\)\.authToken/)
  })

  it('tour and bus services call only through httpService + tourClient', () => {
    for (const source of [tourServiceSource, busServiceSource]) {
      expect(source).toMatch(/from '\.\/http\.service'/)
      expect(source).not.toMatch(/\bfetch\(/)
      expect(source).not.toMatch(/\baxios\b/)
      expect(source).not.toMatch(/Authorization/)
    }
  })

  it('every tour/bus mutation in the host page routes through those services', () => {
    expect(pageSource).toMatch(/tourService\.save/)
    expect(pageSource).toMatch(/tourService\.remove/)
    expect(pageSource).toMatch(/busService\.save/)
    expect(pageSource).toMatch(/busService\.remove/)
    expect(pageSource).not.toMatch(/localStorage/)
  })
})

describe('AGE-270: destructive tour/bus deletes require confirmation', () => {
  it('delete handlers open a ConfirmModal instead of deleting immediately', () => {
    expect(pageSource).toMatch(/import \{ ConfirmModal \}/)

    const deleteTour = pageSource.slice(
      pageSource.indexOf('const handleDeleteTour'),
      pageSource.indexOf('// Bus handlers')
    )
    expect(deleteTour).toMatch(/setConfirmState\(/)
    expect(deleteTour).toMatch(/onConfirm/)
    expect(deleteTour.indexOf('setConfirmState')).toBeLessThan(
      deleteTour.indexOf('tourService.remove')
    )

    const deleteBus = pageSource.slice(pageSource.indexOf('const handleDeleteBus'))
    expect(deleteBus).toMatch(/setConfirmState\(/)
    expect(deleteBus.indexOf('setConfirmState')).toBeLessThan(
      deleteBus.indexOf('busService.remove')
    )
  })

  it('refetches tours after mutations and on window focus so counts match the server', () => {
    expect(pageSource).toMatch(/window\.addEventListener\('focus'/)
    expect(pageSource).toMatch(/refetchTours\(\)/)
  })
})
