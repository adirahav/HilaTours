import sharp from "sharp"

// Mirrors frontend/src/lib/busLayoutHelper.ts's generateBusSeats() row/col
// placement exactly, so the emailed snapshot matches what the admin/passenger
// actually see in the app. Keep these three constants in sync with that file.
const BACK_DOOR_ROW = 8
const BACK_ROW_SEAT_COUNT = 5
const DOOR_GAP_SEATS = 2

interface SeatCell {
  seatNumber: number
  row: number
  col: number // 1-4 in standard rows (4 = nearest the front door), 1-5 in the back row
  isBackRow: boolean
}

function computeSeatCells(totalSeats: number): SeatCell[] {
  const cells: SeatCell[] = []
  const standardSeatsCount = totalSeats - BACK_ROW_SEAT_COUNT
  const numStandardRows = Math.floor(standardSeatsCount / 4)
  const leftoverStandard = standardSeatsCount % 4
  let currentSeatNumber = 1

  for (let r = 1; r <= numStandardRows; r++) {
    for (let c = 4; c >= 1; c--) {
      if (r === BACK_DOOR_ROW && c >= 3) continue
      if (currentSeatNumber <= standardSeatsCount) {
        cells.push({ seatNumber: currentSeatNumber, row: r, col: c, isBackRow: false })
        currentSeatNumber++
      }
    }
  }

  let nextRow = numStandardRows + 1
  let extraSeats = leftoverStandard + DOOR_GAP_SEATS
  while (extraSeats > 0) {
    const seatsThisRow = Math.min(4, extraSeats)
    for (let c = 4; c >= 4 - seatsThisRow + 1; c--) {
      cells.push({ seatNumber: currentSeatNumber, row: nextRow, col: c, isBackRow: false })
      currentSeatNumber++
    }
    extraSeats -= seatsThisRow
    nextRow++
  }

  const backRowIndex = nextRow
  const backRowSeatsCount = totalSeats - (currentSeatNumber - 1)
  for (let c = backRowSeatsCount; c >= 1; c--) {
    cells.push({ seatNumber: currentSeatNumber, row: backRowIndex, col: c, isBackRow: true })
    currentSeatNumber++
  }

  return cells
}

const BOX = 44
const GAP = 8
const AISLE = 50
const PADDING = 24

// Every row is positioned on the SAME fixed column grid — col 1-2 left of
// the aisle, col 3-4 right of it — never re-centered per row. This matters
// structurally, not just cosmetically: the door row (col 1-2 only, col 3-4
// intentionally blank) must stay flush against col 1-2, exactly where every
// other row's col 1-2 sit, so the blank space correctly reads as "the door
// is on the right" rather than floating in the middle of the image.
//
function xForCol(col: number): number {
  if (col <= 2) return PADDING + (col - 1) * (BOX + GAP)
  const afterAisle = PADDING + 2 * (BOX + GAP) + AISLE
  return afterAisle + (col - 3) * (BOX + GAP)
}

// The back row's 5 seats reuse the exact same left pair (col 1-2) and right
// pair (would-be col 3-4) positions as every other row — so its outer edges
// line up exactly with the standard rows, no wider, no narrower. The one
// extra (5th) seat has nowhere in the 4-col grid to go, so it sits centered
// inside the aisle gap itself, between the two pairs, rather than extending
// the row past col 4 or compressing everything into a narrower footprint.
function xForBackRowCol(col: number): number {
  if (col <= 2) return xForCol(col) // left pair — same position as col 1-2 above
  if (col >= 4) return xForCol(col - 1) // right pair — same position as col 3-4 above
  // col === 3: the extra middle seat, centered in the aisle gap.
  const leftPairRightEdge = xForCol(2) + BOX
  const rightPairLeftEdge = xForCol(3)
  return (leftPairRightEdge + rightPairLeftEdge) / 2 - BOX / 2
}

/**
 * Renders a PNG snapshot of the bus seat map with the given seat numbers
 * highlighted, for embedding (inline `cid`) in the booking-notification
 * email. Not interactive — a static visual reference only.
 */
export async function renderSeatMapPng(totalSeats: number, highlightSeatNumbers: number[]): Promise<Buffer> {
  const cells = computeSeatCells(totalSeats)
  const highlighted = new Set(highlightSeatNumbers)

  const maxRow = cells.reduce((m, c) => Math.max(m, c.row), 0)
  // Width is always the standard 4-col+aisle span — the back row's extra
  // seat sits inside the aisle gap (see xForBackRowCol), never past col 4.
  const width = xForCol(4) + BOX + PADDING
  const height = PADDING + maxRow * (BOX + GAP) + PADDING

  const rects = cells
    .map((cell) => {
      const x = cell.isBackRow ? xForBackRowCol(cell.col) : xForCol(cell.col)
      const y = PADDING + (cell.row - 1) * (BOX + GAP)
      const isHighlighted = highlighted.has(cell.seatNumber)
      const fill = isHighlighted ? "#2563eb" : "#e2e8f0"
      const stroke = isHighlighted ? "#1e40af" : "#94a3b8"
      const textFill = isHighlighted ? "#ffffff" : "#334155"
      return `
        <rect x="${x}" y="${y}" width="${BOX}" height="${BOX}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="2" />
        <text x="${x + BOX / 2}" y="${y + BOX / 2 + 5}" font-size="16" font-weight="bold" text-anchor="middle" fill="${textFill}" font-family="Arial, sans-serif">${cell.seatNumber}</text>
      `
    })
    .join("")

  const svg = `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${width}" height="${height}" fill="#ffffff" />
      ${rects}
    </svg>
  `

  return sharp(Buffer.from(svg)).png().toBuffer()
}
