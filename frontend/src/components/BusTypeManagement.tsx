import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  Bus,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  DoorOpen,
  Layers,
  Minus,
  Plus,
  Save,
  Sliders,
  Star,
  Trash2,
  X
} from 'lucide-react'
import { useStore } from '../store/store'
import { busTypeService } from '../services/busType.service'
import { ConfirmModal } from '../modals/ConfirmModal'
import {
  MAX_STANDARD_ROWS,
  MIN_DOOR_ROW,
  MIN_STANDARD_ROWS,
  buildNumberedGrid,
  calculateTotalSeatsFromLayout,
  createDefault55BusTypeInput
} from '../lib/busTypeLayout'
import type { BusType } from '../types/busType.types'
import { cn } from '../lib/utils'

// Admin tab 3 (F11): the bus-type template builder. Design source is
// raw_from_ai_studio/src/components/BusTypeManagement.tsx — the grid/door/
// back-row visual builder and RTL layout are kept verbatim; only the
// persistence layer differs: templates live in tour-service's `busType`
// collection via busTypeService, never in localStorage.

interface BusTypeManagementProps {
  isLoading?: boolean
}

export function BusTypeManagement({ isLoading = false }: BusTypeManagementProps) {
  const busTypes = useStore((state) => state.busTypes)
  const selectedBusTypeId = useStore((state) => state.selectedBusTypeId)
  const setSelectedBusTypeId = useStore((state) => state.setSelectedBusTypeId)

  // Editor draft state — the loaded template's fields, before saving.
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [standardRowsCount, setStandardRowsCount] = useState(13)
  const [doorRow, setDoorRow] = useState<number | null>(7)
  const [backRowSeatsCount, setBackRowSeatsCount] = useState(5)
  const [disabledSeatSlots, setDisabledSeatSlots] = useState<string[]>([])
  const [isDefault, setIsDefault] = useState(false)

  const [nameError, setNameError] = useState('')
  const [rowsError, setRowsError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [isFetching, setIsFetching] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const dropdownRef = useRef<HTMLDivElement>(null)

  const activeBusType = useMemo(
    () => busTypes.find((t) => t.id === selectedBusTypeId) ?? busTypes[0] ?? null,
    [busTypes, selectedBusTypeId]
  )

  const loadIntoEditor = (busType: BusType) => {
    setSelectedBusTypeId(busType.id)
    setName(busType.name)
    setDescription(busType.description)
    setStandardRowsCount(busType.standardRowsCount || MIN_STANDARD_ROWS)
    setDoorRow(busType.doorRow)
    setBackRowSeatsCount(busType.backRowSeatsCount)
    setDisabledSeatSlots([...busType.disabledSeatSlots])
    setIsDefault(busType.isDefault)
    setNameError('')
    setRowsError('')
  }

  useEffect(() => {
    let active = true
    setIsFetching(true)
    busTypeService
      .query()
      .then((types) => {
        if (!active) return
        setLoadError(false)
        if (types.length > 0) loadIntoEditor(types[0])
      })
      .catch((err) => {
        if (!active) return
        console.log('[BUS_TYPE] failed to load bus types', err)
        setLoadError(true)
        toast.error('טעינת סוגי האוטובוסים נכשלה. נסו שוב מאוחר יותר.')
      })
      .finally(() => {
        if (active) setIsFetching(false)
      })
    return () => {
      active = false
    }
    // Runs once on mount; loadIntoEditor only writes local editor state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const liveTotalSeats = calculateTotalSeatsFromLayout(
    standardRowsCount,
    backRowSeatsCount,
    disabledSeatSlots,
    doorRow
  )

  const { standardGrid, backRow } = buildNumberedGrid(
    standardRowsCount,
    backRowSeatsCount,
    disabledSeatSlots,
    doorRow
  )

  // Mutations ---------------------------------------------------------------
  const handleAddNewBusType = async () => {
    setIsSaving(true)
    try {
      const created = await busTypeService.create(
        createDefault55BusTypeInput(`סוג אוטובוס חדש (${busTypes.length + 1})`)
      )
      loadIntoEditor(created)
      toast.success('סוג אוטובוס חדש עם 55 מושבים נוצר בהצלחה')
    } catch (err) {
      console.log('[BUS_TYPE] create failed', err)
      toast.error('יצירת סוג האוטובוס נכשלה. נסו שוב.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDuplicate = async (busType: BusType) => {
    setIsSaving(true)
    try {
      const duplicated = await busTypeService.duplicate(busType)
      loadIntoEditor(duplicated)
      toast.success('סוג האוטובוס שוכפל בהצלחה')
    } catch (err) {
      console.log('[BUS_TYPE] duplicate failed', err)
      toast.error('שכפול סוג האוטובוס נכשל. נסו שוב.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    const busTypeId = confirmDeleteId
    setConfirmDeleteId(null)
    if (!busTypeId) return
    try {
      await busTypeService.remove(busTypeId)
      const remaining = useStore.getState().busTypes
      if (remaining[0]) loadIntoEditor(remaining[0])
      toast.success('סוג האוטובוס נמחק')
    } catch (err) {
      console.log('[BUS_TYPE] delete failed', err)
      toast.error('מחיקת סוג האוטובוס נכשלה. נסו שוב.')
    }
  }

  const handleSave = async () => {
    // Client-side validation renders inline, never as a toast.
    const trimmedName = name.trim()
    let hasError = false
    if (!trimmedName) {
      setNameError('יש להזין שם לסוג האוטובוס')
      hasError = true
    }
    if (liveTotalSeats < 1) {
      setRowsError('תבנית חייבת לכלול לפחות מושב אחד')
      hasError = true
    }
    if (hasError || !activeBusType) return

    setIsSaving(true)
    try {
      await busTypeService.update(activeBusType.id, {
        name: trimmedName,
        description: description.trim(),
        standardRowsCount,
        doorRow,
        backRowSeatsCount,
        disabledSeatSlots,
        isDefault
      })
      toast.success('השינויים בתבנית האוטובוס נשמרו בהצלחה')
    } catch (err) {
      console.log('[BUS_TYPE] save failed', err)
      toast.error('שמירת תבנית האוטובוס נכשלה. נסו שוב.')
    } finally {
      setIsSaving(false)
    }
  }

  // Layout editing ----------------------------------------------------------
  const handleAddRow = () => {
    setRowsError('')
    setStandardRowsCount((prev) => Math.min(MAX_STANDARD_ROWS, prev + 1))
  }

  const handleRemoveRow = () => {
    if (standardRowsCount <= MIN_STANDARD_ROWS) {
      setRowsError(`לא ניתן לרדת מתחת ל-${MIN_STANDARD_ROWS} שורות`)
      return
    }
    const removedRow = standardRowsCount
    setRowsError('')
    // The bench row key shifts with the row count, so drop both the removed
    // row's slots and the now-stale bench keys.
    setDisabledSeatSlots((prev) =>
      prev.filter((slot) => !slot.startsWith(`${removedRow}-`) && !slot.startsWith(`${removedRow + 1}-`))
    )
    if (doorRow === removedRow) setDoorRow(removedRow - 1)
    setStandardRowsCount((prev) => prev - 1)
  }

  const handleMoveDoorUp = () => {
    if (doorRow === null) {
      setDoorRow(Math.max(MIN_DOOR_ROW, Math.floor(standardRowsCount / 2)))
      return
    }
    if (doorRow > MIN_DOOR_ROW) setDoorRow(doorRow - 1)
  }

  const handleMoveDoorDown = () => {
    if (doorRow === null) {
      setDoorRow(Math.max(MIN_DOOR_ROW, Math.floor(standardRowsCount / 2)))
      return
    }
    if (doorRow < standardRowsCount) setDoorRow(doorRow + 1)
  }

  const handleToggleSeatSlot = (row: number, col: number) => {
    const slotKey = `${row}-${col}`
    setRowsError('')
    setDisabledSeatSlots((prev) =>
      prev.includes(slotKey) ? prev.filter((s) => s !== slotKey) : [...prev, slotKey]
    )
  }

  const inputClass =
    'w-full bg-slate-50 border border-slate-300 rounded-2xl px-3.5 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none'

  const showLoading = isLoading || isFetching
  const showEmptyState = !showLoading && !loadError && busTypes.length === 0

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top banner */}
      <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center font-bold">
              <Sliders className="w-4 h-4" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">ניהול דגמי אוטובוס</h2>
          </div>
          <p className="text-xs text-slate-500">
            הגדר תבניות אוטובוס לשימוש חוזר: שורות רגילות, דלת אמצעית, ספסל אחורי וביטול מושבים
            בודדים. תבנית שמורה ניתנת לבחירה בעת יצירת אוטובוס חדש.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAddNewBusType}
          disabled={isSaving}
          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-md transition flex items-center gap-2 active:scale-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-700"
        >
          <Plus className="w-4 h-4" aria-hidden="true" />
          <span>הוסף סוג אוטובוס חדש (55 מושבים)</span>
        </button>
      </div>

      {showLoading && (
        <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-200 text-sm font-bold text-slate-500">
          טוען סוגי אוטובוס...
        </div>
      )}

      {showEmptyState && (
        <div className="bg-white rounded-3xl p-8 text-center shadow-sm border border-slate-200">
          <p className="text-slate-600 font-bold mb-4">אין עדיין תבניות אוטובוס במערכת.</p>
          <button
            type="button"
            onClick={handleAddNewBusType}
            disabled={isSaving}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 font-bold text-slate-950 rounded-2xl shadow-md transition disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-600"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            <span>צור תבנית ראשונה</span>
          </button>
        </div>
      )}

      {!showLoading && activeBusType && (
        <>
          {/* Bus type selector */}
          <div className="relative w-full max-w-2xl" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsDropdownOpen(!isDropdownOpen)}
              aria-expanded={isDropdownOpen}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white border-2 border-amber-400 rounded-full py-2.5 px-4 sm:px-5 flex items-center justify-between shadow-lg transition active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              dir="rtl"
            >
              <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 pr-1">
                <div className="w-8 h-8 rounded-full bg-amber-400/10 flex items-center justify-center shrink-0">
                  <Bus className="w-5 h-5 text-amber-400" aria-hidden="true" />
                </div>
                <span className="text-sm sm:text-base font-extrabold text-white truncate">
                  {activeBusType.name || 'בחר סוג אוטובוס'}
                </span>
              </div>

              <div className="w-6 h-6 rounded-full flex items-center justify-center text-amber-400 shrink-0">
                {isDropdownOpen ? (
                  <ChevronUp className="w-5 h-5" aria-hidden="true" />
                ) : (
                  <ChevronDown className="w-5 h-5" aria-hidden="true" />
                )}
              </div>
            </button>

            {isDropdownOpen && (
              <div
                className="absolute top-full right-0 left-0 mt-2 z-50 bg-slate-900 border-2 border-amber-400/60 rounded-3xl p-2.5 shadow-2xl space-y-1.5"
                dir="rtl"
              >
                <div className="text-[11px] font-bold text-slate-400 px-3 py-1">
                  בחר תבנית סוג אוטובוס לעריכה:
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1">
                  {busTypes.map((busType) => {
                    const isSelected = busType.id === activeBusType.id
                    return (
                      <button
                        key={busType.id}
                        type="button"
                        onClick={() => {
                          loadIntoEditor(busType)
                          setIsDropdownOpen(false)
                        }}
                        className={cn(
                          'w-full p-3 rounded-2xl flex items-center justify-between text-right transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400',
                          isSelected
                            ? 'bg-amber-400/15 border border-amber-400/60 text-white'
                            : 'hover:bg-slate-800 text-slate-200 border border-transparent'
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              'w-8 h-8 rounded-xl flex items-center justify-center shrink-0',
                              isSelected
                                ? 'bg-amber-400 text-slate-950'
                                : 'bg-slate-800 text-slate-400'
                            )}
                          >
                            <Bus className="w-4 h-4" aria-hidden="true" />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white truncate">
                                {busType.name}
                              </span>
                              {busType.isDefault && (
                                <Star
                                  className="w-3.5 h-3.5 text-amber-400 shrink-0"
                                  aria-label="ברירת מחדל"
                                />
                              )}
                              {isSelected && (
                                <Check className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
                              )}
                            </div>
                            {busType.description && (
                              <div className="text-[11px] text-slate-400 truncate">
                                {busType.description}
                              </div>
                            )}
                          </div>
                        </div>

                        <span
                          className={cn(
                            'text-xs font-black px-2.5 py-0.5 rounded-full shrink-0',
                            isSelected ? 'bg-amber-400 text-slate-950' : 'bg-slate-800 text-slate-300'
                          )}
                        >
                          {busType.totalSeats} מושבים
                        </span>
                      </button>
                    )
                  })}
                </div>

                <div className="pt-2 border-t border-slate-800 flex items-center justify-between px-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsDropdownOpen(false)
                      handleAddNewBusType()
                    }}
                    className="text-xs font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1.5 py-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>הוסף תבנית אוטובוס חדשה</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Properties & controls */}
            <div className="lg:col-span-5 space-y-5">
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-200 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-blue-600" aria-hidden="true" />
                    <span>פרטי סוג האוטובוס</span>
                  </h3>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => handleDuplicate(activeBusType)}
                      disabled={isSaving}
                      aria-label="שכפל סוג אוטובוס זה"
                      title="שכפל סוג אוטובוס זה"
                      className="p-1.5 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Copy className="w-4 h-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(activeBusType.id)}
                      aria-label="מחק סוג אוטובוס"
                      title="מחק סוג אוטובוס"
                      className="p-1.5 rounded-xl text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>

                <div>
                  <label htmlFor="bus-type-name" className="block text-xs font-bold text-slate-700 mb-1">
                    שם סוג האוטובוס:
                  </label>
                  <input
                    id="bus-type-name"
                    type="text"
                    value={name}
                    aria-invalid={!!nameError}
                    aria-describedby={nameError ? 'bus-type-name-error' : undefined}
                    onChange={(e) => {
                      setName(e.target.value)
                      if (nameError) setNameError('')
                    }}
                    placeholder="לדוגמה: אוטובוס תיירות 55 מושבים"
                    className={cn(inputClass, nameError && 'border-rose-400 focus:ring-rose-500')}
                  />
                  {nameError && (
                    <p
                      id="bus-type-name-error"
                      className="text-[11px] font-semibold text-rose-600 mt-1 flex items-center gap-1"
                    >
                      <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span>{nameError}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="bus-type-desc" className="block text-xs font-bold text-slate-700 mb-1">
                    תיאור (אופציונלי):
                  </label>
                  <input
                    id="bus-type-desc"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="תיאור קצר של מבנה האוטובוס והשימוש בו"
                    className={inputClass}
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isDefault}
                    onChange={(e) => setIsDefault(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-amber-500 focus:ring-2 focus:ring-amber-500"
                  />
                  <span>קבע כתבנית ברירת המחדל ליצירת אוטובוס חדש</span>
                </label>

                {/* Live stats */}
                <div className="bg-slate-50 rounded-2xl p-3 border border-slate-200 grid grid-cols-3 gap-2 text-center">
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-bold">סך מושבים</div>
                    <div className="text-base font-black text-blue-600">{liveTotalSeats}</div>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-bold">שורות רגילות</div>
                    <div className="text-base font-black text-slate-800">{standardRowsCount}</div>
                  </div>
                  <div className="bg-white p-2 rounded-xl border border-slate-200">
                    <div className="text-[10px] text-slate-500 font-bold">דלת אחורית</div>
                    <div className="text-base font-black text-amber-600">
                      {doorRow ? `שורה ${doorRow}` : 'ללא'}
                    </div>
                  </div>
                </div>

                {rowsError && (
                  <p className="text-[11px] font-semibold text-rose-600 flex items-center gap-1">
                    <AlertCircle className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <span>{rowsError}</span>
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-2xl shadow-md transition flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-700"
                >
                  <Save className="w-4 h-4" aria-hidden="true" />
                  <span>{isSaving ? 'שומר...' : 'שמור שינויים בתבנית האוטובוס'}</span>
                </button>
              </div>
            </div>

            {/* Live interactive bus map builder */}
            <div className="lg:col-span-7 flex flex-col items-center">
              <div className="w-full max-w-xl bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200">
                <div
                  className="bg-slate-900/5 rounded-3xl p-4 sm:p-5 border-2 border-slate-300 shadow-inner relative"
                  dir="ltr"
                >
                  {/* Front cabin */}
                  <div className="bg-slate-800 text-white rounded-2xl p-3.5 mb-5 border border-slate-700 shadow-md">
                    <div className="flex items-center justify-between">
                      <div
                        className="flex items-center gap-2 bg-slate-700/80 px-2.5 py-1.5 rounded-xl border border-slate-600 text-xs font-medium"
                        dir="rtl"
                      >
                        <span className="w-5 h-5 rounded-full bg-slate-900 border-2 border-amber-400 flex items-center justify-center text-[10px] font-bold text-amber-400">
                          הגה
                        </span>
                        <span className="text-slate-300 text-[11px]">תא נהג</span>
                      </div>

                      <div className="text-center text-[11px] text-slate-400 font-semibold" dir="rtl">
                        חזית האוטובוס
                      </div>

                      <div
                        className="bg-slate-700/80 px-2.5 py-1.5 rounded-xl border border-slate-600 text-[11px] text-amber-300 font-bold"
                        dir="rtl"
                      >
                        דלת קדמית
                      </div>
                    </div>
                  </div>

                  {/* Standard rows */}
                  <div className="space-y-2.5">
                    {standardGrid.map((row) => (
                      <div key={row.row} className="relative rounded-2xl p-1">
                        <div className="grid grid-cols-5 gap-2 items-center">
                          <SlotButton
                            row={row.row}
                            col={1}
                            isActive={row.col1.active}
                            seatNumber={row.col1.number}
                            onToggle={() => handleToggleSeatSlot(row.row, 1)}
                          />
                          <SlotButton
                            row={row.row}
                            col={2}
                            isActive={row.col2.active}
                            seatNumber={row.col2.number}
                            onToggle={() => handleToggleSeatSlot(row.row, 2)}
                          />

                          <div className="flex items-center justify-center text-[10px] font-bold text-slate-400 select-none">
                            {row.row}
                          </div>

                          {row.hasDoor ? (
                            <div className="col-span-2 relative">
                              <button
                                type="button"
                                onClick={() => setDoorRow(null)}
                                aria-label="הסר דלת אחורית והחזר מושבים"
                                title="הסר דלת אחורית (החזר מושבים)"
                                className="absolute -top-1.5 -left-1.5 z-10 w-4 h-4 rounded-full bg-rose-600 hover:bg-rose-700 text-white font-black p-0.5 border-2 border-white shadow-xs flex items-center justify-center transition active:scale-90"
                              >
                                <X className="w-2.5 h-2.5 stroke-[3]" aria-hidden="true" />
                              </button>

                              <div
                                className="w-full min-h-[46px] rounded-xl border-2 border-amber-400 bg-amber-50 text-amber-950 flex items-center justify-between px-3 py-1 shadow-xs select-none"
                                dir="rtl"
                              >
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <DoorOpen className="w-4 h-4 text-amber-600 shrink-0" aria-hidden="true" />
                                  <span className="text-[11px] font-black text-amber-950 truncate">
                                    דלת אחורית
                                  </span>
                                </div>

                                <div className="flex items-center gap-1 shrink-0">
                                  <button
                                    type="button"
                                    onClick={handleMoveDoorUp}
                                    disabled={row.row <= MIN_DOOR_ROW}
                                    aria-label="הזז דלת שורה אחת קדימה"
                                    title="הזז דלת שורה אחת קדימה"
                                    className="w-6 h-6 rounded-lg bg-amber-200/90 hover:bg-amber-300 active:bg-amber-400 text-amber-900 flex items-center justify-center transition disabled:opacity-30 disabled:pointer-events-none active:scale-90"
                                  >
                                    <ArrowUp className="w-3 h-3" aria-hidden="true" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleMoveDoorDown}
                                    disabled={row.row >= standardRowsCount}
                                    aria-label="הזז דלת שורה אחת אחורה"
                                    title="הזז דלת שורה אחת אחורה"
                                    className="w-6 h-6 rounded-lg bg-amber-200/90 hover:bg-amber-300 active:bg-amber-400 text-amber-900 flex items-center justify-center transition disabled:opacity-30 disabled:pointer-events-none active:scale-90"
                                  >
                                    <ArrowDown className="w-3 h-3" aria-hidden="true" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <SlotButton
                                row={row.row}
                                col={3}
                                isActive={row.col3.active}
                                seatNumber={row.col3.number}
                                onToggle={() => handleToggleSeatSlot(row.row, 3)}
                              />
                              <SlotButton
                                row={row.row}
                                col={4}
                                isActive={row.col4.active}
                                seatNumber={row.col4.number}
                                onToggle={() => handleToggleSeatSlot(row.row, 4)}
                              />
                            </>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Row / door controls */}
                  <div
                    className="mt-4 pt-3 border-t border-dashed border-slate-300 flex items-center justify-center gap-2.5 px-1 flex-wrap"
                    dir="rtl"
                  >
                    <button
                      type="button"
                      onClick={handleAddRow}
                      disabled={standardRowsCount >= MAX_STANDARD_ROWS}
                      title="הוסף שורה חדשה"
                      className="flex items-center gap-1 px-3.5 py-1.5 text-xs font-bold rounded-xl border border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                      <span>הוסף שורה</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleRemoveRow}
                      disabled={standardRowsCount <= MIN_STANDARD_ROWS}
                      title="הסר שורה תחתונה"
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold rounded-xl border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 active:scale-95 transition disabled:opacity-30 disabled:pointer-events-none shadow-2xs"
                    >
                      <Minus className="w-3.5 h-3.5 stroke-[2.5]" aria-hidden="true" />
                      <span>הורד שורה</span>
                    </button>
                    {doorRow === null && (
                      <button
                        type="button"
                        onClick={() =>
                          setDoorRow(
                            Math.min(
                              standardRowsCount,
                              Math.max(MIN_DOOR_ROW, Math.floor(standardRowsCount / 2) + 1)
                            )
                          )
                        }
                        title="הוסף דלת אחורית לאוטובוס"
                        className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-xl border border-amber-400 bg-amber-50 text-amber-950 hover:bg-amber-100 active:scale-95 transition shadow-2xs"
                      >
                        <DoorOpen className="w-3.5 h-3.5 text-amber-600" aria-hidden="true" />
                        <span>הוסף דלת אחורית</span>
                      </button>
                    )}
                  </div>

                  {/* Back bench */}
                  <div className="mt-5 pt-3.5 border-t-2 border-slate-300">
                    <div
                      className={cn(
                        'grid gap-2',
                        backRowSeatsCount === 4
                          ? 'grid-cols-4'
                          : backRowSeatsCount === 6
                            ? 'grid-cols-6'
                            : 'grid-cols-5'
                      )}
                    >
                      {backRow.map((seat) => (
                        <SlotButton
                          key={`back-${seat.col}`}
                          row={standardRowsCount + 1}
                          col={seat.col}
                          isActive={seat.active}
                          seatNumber={seat.number}
                          onToggle={() => handleToggleSeatSlot(standardRowsCount + 1, seat.col)}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={confirmDeleteId !== null}
        title="מחיקת סוג אוטובוס"
        message="האם למחוק תבנית זו? אוטובוסים שכבר נוצרו ממנה לא ישתנו."
        confirmLabel="מחק תבנית"
        onConfirm={handleConfirmDelete}
        onClose={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}

interface SlotButtonProps {
  row: number
  col: number
  isActive: boolean
  seatNumber?: number
  onToggle: () => void
}

function SlotButton({ row, col, isActive, seatNumber, onToggle }: SlotButtonProps) {
  const label = isActive
    ? `מושב ${seatNumber} (שורה ${row}, עמודה ${col}) - לחץ להסרה`
    : `מקום ריק (שורה ${row}, עמודה ${col}) - לחץ להוספת מושב`

  return (
    <div className="w-full relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label={label}
        aria-pressed={isActive}
        title={label}
        className={cn(
          'w-full min-h-[46px] rounded-xl border-2 flex flex-col items-center justify-center p-1 transition-all duration-150 relative select-none active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
          isActive
            ? 'bg-blue-50/90 hover:bg-rose-50 text-blue-950 border-blue-400 hover:border-rose-300 shadow-xs font-black text-xs'
            : 'bg-slate-100/60 hover:bg-emerald-50 border-slate-300 border-dashed text-slate-400 hover:text-emerald-700 hover:border-emerald-400'
        )}
      >
        {isActive ? (
          <>
            <span
              className="absolute -top-1.5 -left-1.5 z-10 w-4 h-4 rounded-full bg-rose-600 text-white font-black p-0.5 border-2 border-white shadow-xs flex items-center justify-center pointer-events-none"
              aria-hidden="true"
            >
              <X className="w-2.5 h-2.5 stroke-[3]" />
            </span>
            <span className="text-xs sm:text-sm font-black text-blue-950">{seatNumber}</span>
          </>
        ) : (
          <Plus className="w-3.5 h-3.5" aria-hidden="true" />
        )}
      </button>
    </div>
  )
}
