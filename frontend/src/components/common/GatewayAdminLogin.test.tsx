import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GatewayAdminLogin } from './GatewayAdminLogin'
import { authService } from '../../services/auth.service'

vi.mock('../../services/auth.service', () => ({
  authService: { login: vi.fn() }
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() }
}))

const loginMock = vi.mocked(authService.login)

describe('GatewayAdminLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the login form fields and submit button', () => {
    render(<GatewayAdminLogin onAdminLoginSuccess={() => {}} />)
    expect(screen.getByLabelText(/דוא"ל מנהל/)).toBeInTheDocument()
    expect(screen.getByLabelText(/סיסמה/)).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'התחבר כמנהל' })
    ).toBeInTheDocument()
  })

  it('shows required-field errors when fields are left empty and blurred', async () => {
    const user = userEvent.setup()
    render(<GatewayAdminLogin onAdminLoginSuccess={() => {}} />)

    await user.click(screen.getByLabelText(/דוא"ל מנהל/))
    await user.tab()
    await user.click(screen.getByLabelText(/סיסמה/))
    await user.tab()

    expect(
      screen.getByText('שדה חובה - יש להזין כתובת דוא"ל')
    ).toBeInTheDocument()
    expect(screen.getByText('שדה חובה - יש להזין סיסמה')).toBeInTheDocument()
    // Submit stays disabled while invalid, so login is never attempted.
    expect(screen.getByRole('button', { name: 'התחבר כמנהל' })).toBeDisabled()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('shows an error and keeps submit disabled for an invalid email format', async () => {
    const user = userEvent.setup()
    render(<GatewayAdminLogin onAdminLoginSuccess={() => {}} />)

    await user.type(screen.getByLabelText(/דוא"ל מנהל/), 'not-an-email')
    await user.type(screen.getByLabelText(/סיסמה/), 'secret123')

    expect(screen.getByText('כתובת דוא"ל אינה תקינה')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'התחבר כמנהל' })).toBeDisabled()
    expect(loginMock).not.toHaveBeenCalled()
  })

  it('calls authService.login with entered credentials and fires onAdminLoginSuccess', async () => {
    const user = userEvent.setup()
    const onAdminLoginSuccess = vi.fn()
    loginMock.mockResolvedValueOnce(undefined)
    render(<GatewayAdminLogin onAdminLoginSuccess={onAdminLoginSuccess} />)

    await user.type(screen.getByLabelText(/דוא"ל מנהל/), 'admin@bus.co.il')
    await user.type(screen.getByLabelText(/סיסמה/), 'admin123')
    await user.click(screen.getByRole('button', { name: 'התחבר כמנהל' }))

    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith({
        email: 'admin@bus.co.il',
        password: 'admin123'
      })
    )
    expect(onAdminLoginSuccess).toHaveBeenCalledTimes(1)
  })

  it('shows the error banner and does not navigate on failed login', async () => {
    const user = userEvent.setup()
    const onAdminLoginSuccess = vi.fn()
    loginMock.mockRejectedValueOnce(new Error('פרטי ההתחברות שגויים'))
    render(<GatewayAdminLogin onAdminLoginSuccess={onAdminLoginSuccess} />)

    await user.type(screen.getByLabelText(/דוא"ל מנהל/), 'admin@bus.co.il')
    await user.type(screen.getByLabelText(/סיסמה/), 'wrongpass')
    await user.click(screen.getByRole('button', { name: 'התחבר כמנהל' }))

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('פרטי ההתחברות שגויים')
    expect(onAdminLoginSuccess).not.toHaveBeenCalled()
  })
})
