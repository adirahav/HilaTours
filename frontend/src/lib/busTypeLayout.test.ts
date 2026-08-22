import { describe, it, expect } from 'vitest'
import { buildNumberedGrid, calculateTotalSeatsFromLayout } from './busTypeLayout'

describe('calculateTotalSeatsFromLayout', () => {
  it('counts 4 seats per standard row plus the back bench when nothing is blocked', () => {
    expect(calculateTotalSeatsFromLayout(13, 5, [], null)).toBe(57)
  })

  it('drops the two doorway slots (cols 3-4) of the door row', () => {
    expect(calculateTotalSeatsFromLayout(13, 5, [], 7)).toBe(55)
  })

  it('drops individually disabled standard slots', () => {
    expect(calculateTotalSeatsFromLayout(13, 5, ['1-1', '2-4'], 7)).toBe(53)
  })

  it('does not double-count a disabled slot that is already the doorway', () => {
    expect(calculateTotalSeatsFromLayout(13, 5, ['7-3', '7-4'], 7)).toBe(55)
  })

  it('drops disabled bench slots in both the row-col and legacy back- key forms', () => {
    expect(calculateTotalSeatsFromLayout(13, 5, ['14-1'], 7)).toBe(54)
    expect(calculateTotalSeatsFromLayout(13, 5, ['back-1'], 7)).toBe(54)
  })
})

describe('buildNumberedGrid', () => {
  it('numbers seats row by row (col 1→4) and continues into the back bench', () => {
    const { standardGrid, backRow } = buildNumberedGrid(2, 3, [], null)

    expect(standardGrid[0].col1.number).toBe(1)
    expect(standardGrid[0].col4.number).toBe(4)
    expect(standardGrid[1].col1.number).toBe(5)
    expect(backRow.map((s) => s.number)).toEqual([9, 10, 11])
  })

  it('marks the door row and leaves its cols 3-4 unnumbered', () => {
    const { standardGrid } = buildNumberedGrid(3, 5, [], 2)

    expect(standardGrid[1].hasDoor).toBe(true)
    expect(standardGrid[1].col3.active).toBe(false)
    expect(standardGrid[1].col4.number).toBeUndefined()
    // Numbering skips the doorway: row 3 starts right after row 2's two seats.
    expect(standardGrid[2].col1.number).toBe(7)
  })

  it('skips disabled slots without consuming a seat number', () => {
    const { standardGrid } = buildNumberedGrid(1, 0, ['1-2'], null)

    expect(standardGrid[0].col2.active).toBe(false)
    expect(standardGrid[0].col3.number).toBe(2)
  })

  it('produces exactly as many numbered seats as calculateTotalSeatsFromLayout reports', () => {
    const disabled = ['1-1', '5-3', '14-2']
    const { standardGrid, backRow } = buildNumberedGrid(13, 5, disabled, 7)
    const numbered =
      standardGrid.flatMap((r) => [r.col1, r.col2, r.col3, r.col4]).filter((s) => s.active).length +
      backRow.filter((s) => s.active).length

    expect(numbered).toBe(calculateTotalSeatsFromLayout(13, 5, disabled, 7))
  })
})
