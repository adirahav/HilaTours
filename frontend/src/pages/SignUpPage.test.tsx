import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { SignUpPage } from './SignUpPage'
import { authService } from '../services/auth.service'

const navigateMock = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>(
    'react-router-dom'
  )
  return { ...actual, useNavigate: () => navigateMock }
})

vi.mock('../services/auth.service', () => ({
  authService: { signup: vi.fn() }
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

const signupMock = vi.mocked(authService.signup)

function renderPage() {
  return render(
    <MemoryRouter>
      <SignUpPage />
    </MemoryRouter>
  )
}

const fillValidForm = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.type(screen.getByLabelText(/שם מלא/), 'ישראל ישראלי')
  await user.type(screen.getByLabelText(/כתובת דוא"ל/), 'new@bus.co.il')
  await user.type(screen.getByLabelText('סיסמה *'), 'secret123')
}

describe('SignUpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders all signup fields and the submit button', () => {
    renderPage()
    expect(
      screen.getByRole('heading', { name: 'יצירת חשבון חדש' })
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/שם מלא/)).toBeInTheDocument()
    expect(screen.getByLabelText(/כתובת דוא"ל/)).toBeInTheDocument()
    expect(screen.getByLabelText('סיסמה *')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /הרשמה למערכת/ })
    ).toBeInTheDocument()
  })

  it('shows a validation error for a too-short name and keeps submit disabled', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/שם מלא/), 'א')

    expect(
      screen.getByText('יש להזין שם מלא (לפחות 2 אותיות)')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /הרשמה למערכת/ })).toBeDisabled()
    expect(signupMock).not.toHaveBeenCalled()
  })

  it('shows a validation error for an invalid email', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText(/כתובת דוא"ל/), 'not-an-email')

    expect(screen.getByText('יש להזין כתובת דוא"ל תקינה')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /הרשמה למערכת/ })).toBeDisabled()
  })

  it('shows a validation error for a password shorter than 6 characters', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('סיסמה *'), '123')

    expect(
      screen.getByText('הסיסמה חייבת להכיל לפחות 6 תווים')
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /הרשמה למערכת/ })).toBeDisabled()
  })

  it('toggles password visibility', async () => {
    const user = userEvent.setup()
    renderPage()

    const passwordInput = screen.getByLabelText('סיסמה *')
    expect(passwordInput).toHaveAttribute('type', 'password')

    await user.click(screen.getByRole('button', { name: 'הצג סיסמה' }))
    expect(passwordInput).toHaveAttribute('type', 'text')

    await user.click(screen.getByRole('button', { name: 'הסתר סיסמה' }))
    expect(passwordInput).toHaveAttribute('type', 'password')
  })

  it('submits trimmed values to authService.signup and shows a success message', async () => {
    const user = userEvent.setup()
    signupMock.mockResolvedValueOnce(undefined)
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /הרשמה למערכת/ }))

    await waitFor(() =>
      expect(signupMock).toHaveBeenCalledWith({
        fullname: 'ישראל ישראלי',
        email: 'new@bus.co.il',
        password: 'secret123'
      })
    )
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('ההרשמה הושלמה בהצלחה')
  })

  it('redirects to /login after a successful signup', async () => {
    const user = userEvent.setup()
    signupMock.mockResolvedValueOnce(undefined)
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /הרשמה למערכת/ }))

    await waitFor(() => expect(signupMock).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/login'), {
      timeout: 3000
    })
  }, 15000)

  it('shows an error alert and does not navigate when signup fails', async () => {
    const user = userEvent.setup()
    signupMock.mockRejectedValueOnce(new Error('ההרשמה נכשלה, נסה שוב'))
    renderPage()

    await fillValidForm(user)
    await user.click(screen.getByRole('button', { name: /הרשמה למערכת/ }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('ההרשמה נכשלה, נסה שוב')
    expect(navigateMock).not.toHaveBeenCalled()
  })

  it('navigates to the login page and the gateway from the footer links', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(
      screen.getByRole('button', { name: 'יש לך כבר חשבון? התחבר' })
    )
    expect(navigateMock).toHaveBeenCalledWith('/login')

    await user.click(screen.getByRole('button', { name: /חזרה לעמוד הראשי/ }))
    expect(navigateMock).toHaveBeenCalledWith('/')
  })
})
