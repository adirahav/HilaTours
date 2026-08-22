import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { PassengerManifestReport } from "./PassengerManifestReport"
import { useStore } from "../store/store"
import { seatService } from "../services/seat.service"
import type { Tour } from "../types/tour.types"
import type { Seat, SeatStatus } from "../types/seat.types"

vi.mock("../services/seat.service", () => ({
  seatService: {
    approve: vi.fn(),
    cancel: vi.fn()
  }
}))

vi.mock("../services/bus.service", () => ({
  busService: {
    loadWithPii: vi.fn().mockResolvedValue(undefined)
  }
}))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() }
}))

const approveMock = vi.mocked(seatService.approve)
const cancelMock = vi.mocked(seatService.cancel)

const buildSeat = (
  seatNumber: number,
  seatStatus: SeatStatus,
  extra: Partial<Seat> = {}
): Seat => ({
  id: `bus1-seat${seatNumber}`,
  seatNumber,
  row: 1,
  col: seatNumber,
  seatStatus,
  ...extra
})

const buildTour = (): Tour => ({
  id: "t1",
  title: "טיול לגולן",
  date: "2026-08-15",
  description: "",
  createdAt: "2026-08-01",
  buses: [
    {
      id: "bus1",
      tourId: "t1",
      busName: "אוטובוס 1",
      description: "",
      pickupPoints: ["תחנה מרכזית"],
      driverSide: "left",
      doorPosition: "front",
      busTypeId: null,
      grid: null,
      isDefault: false,
      totalSeats: 52,
      seats: [
        buildSeat(1, "available"),
        buildSeat(2, "pending", { passengerName: "דנה כהן", passengerPhone: "0501112222", pickupPoint: "תחנה מרכזית" }),
        buildSeat(3, "taken", { passengerName: "יוסי לוי", passengerPhone: "0523334444" }),
        buildSeat(4, "reserved", { passengerName: "רזרבה" })
      ]
    }
  ]
})

describe("PassengerManifestReport", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useStore.setState({ tours: [buildTour()], selectedSeatNumbers: [] })
  })

  it("lists only non-available seats with correct filter counts", () => {
    render(<PassengerManifestReport />)
    expect(screen.getByRole("button", { name: /הכל \(3\)/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /ממתינים \(1\)/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /תפוסים \(1\)/ })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /שמורים \(1\)/ })).toBeInTheDocument()
    expect(screen.getByText("דנה כהן")).toBeInTheDocument()
    expect(screen.getByText("יוסי לוי")).toBeInTheDocument()
    // available seat #1 should not appear
    expect(screen.queryByText("מושב #1")).not.toBeInTheDocument()
  })

  it("filters rows by the search query", async () => {
    const user = userEvent.setup()
    render(<PassengerManifestReport />)
    await user.type(screen.getByLabelText("חיפוש בדוח הנוסעים"), "דנה")
    expect(screen.getByText("דנה כהן")).toBeInTheDocument()
    expect(screen.queryByText("יוסי לוי")).not.toBeInTheDocument()
  })

  it("approves a pending seat via seatService", async () => {
    const user = userEvent.setup()
    approveMock.mockResolvedValue(undefined)
    render(<PassengerManifestReport />)
    await user.click(screen.getByRole("button", { name: "אשר" }))
    await waitFor(() => expect(approveMock).toHaveBeenCalledWith("t1", "bus1", "bus1-seat2"))
  })

  it("cancels a seat via seatService", async () => {
    const user = userEvent.setup()
    cancelMock.mockResolvedValue(undefined)
    render(<PassengerManifestReport />)
    const cancelButtons = screen.getAllByRole("button", { name: "בטל/שחרר" })
    await user.click(cancelButtons[0])
    await waitFor(() => expect(cancelMock).toHaveBeenCalledWith("t1", "bus1", "bus1-seat2"))
  })

  it("renders the empty state when there are no tours", () => {
    useStore.setState({ tours: [] })
    render(<PassengerManifestReport />)
    expect(
      screen.getByText("אין טיולים או אוטובוסים קיימים במערכת.")
    ).toBeInTheDocument()
  })

  it("shows a loader (not the empty-state message) while the initial fetch is still in flight", () => {
    useStore.setState({ tours: [] })
    render(<PassengerManifestReport isLoading />)
    expect(screen.getByText("טוען טיולים...")).toBeInTheDocument()
    expect(
      screen.queryByText("אין טיולים או אוטובוסים קיימים במערכת.")
    ).not.toBeInTheDocument()
  })
})
