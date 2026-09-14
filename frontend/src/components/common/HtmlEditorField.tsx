import { useEffect, useRef, useState } from 'react'
import { Bold, Code2, Italic, List, ListOrdered, Underline, WrapText } from 'lucide-react'
import { sanitizeDescriptionHtml } from '../../lib/sanitizeHtml'

interface HtmlEditorFieldProps {
  id: string
  value: string
  onChange: (value: string) => void
  rows?: number
  placeholder?: string
  /**
   * Id of the associated `<label>`. A `<div>` isn't a natively labelable
   * element, so `<label htmlFor>` alone gives the WYSIWYG surface no
   * accessible name — `aria-labelledby` does, regardless of tag. The code-mode
   * `<textarea>` doesn't need this (it's natively labelable via `id`), but
   * accepting it here unconditionally keeps the two modes' accessible name
   * wiring identical.
   */
  labelId?: string
}

/**
 * WYSIWYG by default: a contentEditable surface IS the preview — what the
 * admin sees while editing is exactly the sanitized markup a passenger will
 * see, no separate "preview" section duplicating it. A "code mode" toggle
 * switches to a plain `<textarea>` of the raw HTML for anyone who wants to
 * type tags directly; most admins never need it.
 */
export function HtmlEditorField({ id, value, onChange, rows = 3, placeholder, labelId }: HtmlEditorFieldProps) {
  const [mode, setMode] = useState<'wysiwyg' | 'code'>('wysiwyg')
  const editableRef = useRef<HTMLDivElement>(null)
  // Set right before we push a state update that originated from this same
  // contentEditable's own input — skips the next DOM-sync effect run so the
  // browser's live cursor position is never clobbered by re-setting innerHTML
  // for a change the DOM already reflects.
  const skipNextSyncRef = useRef(false)

  // Sync `value` into the live DOM whenever it changes for a reason OTHER
  // than this element's own typing (initial mount, switching back from code
  // mode, or the parent resetting the field for a different tour).
  useEffect(() => {
    if (mode !== 'wysiwyg') return
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false
      return
    }
    const el = editableRef.current
    if (el && el.innerHTML !== value) {
      el.innerHTML = sanitizeDescriptionHtml(value)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, mode])

  const syncFromDom = () => {
    const el = editableRef.current
    if (!el) return
    const sanitized = sanitizeDescriptionHtml(el.innerHTML)
    skipNextSyncRef.current = true
    onChange(sanitized)
  }

  const exec = (command: string, arg?: string) => {
    editableRef.current?.focus()
    document.execCommand(command, false, arg)
    syncFromDom()
  }

  // The browser's default Enter behavior splits the line into a new <div> (or
  // <p>) — neither is in the sanitizer's allowlist, so the split silently
  // vanishes the next time this content round-trips through
  // sanitizeDescriptionHtml, and the line break the admin just typed is
  // lost. Insert an allowed <br> instead. Exception: inside a <ul>/<ol>,
  // Enter should create a new <li> (also allowed) — let the browser do that.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter') return
    const anchorNode = window.getSelection()?.anchorNode
    const anchorElement = anchorNode instanceof Element ? anchorNode : anchorNode?.parentElement
    if (anchorElement?.closest('li')) return
    e.preventDefault()
    document.execCommand('insertHTML', false, '<br>')
    syncFromDom()
  }

  // Pasting arbitrary HTML (e.g. from a webpage) would land in the live DOM
  // before sanitization ever sees it — strip to plain text on the way in so
  // the editable surface never even briefly holds disallowed markup.
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    syncFromDom()
  }

  const toolbarButtons = [
    { label: 'מודגש', icon: Bold, onClick: () => exec('bold') },
    { label: 'נטוי', icon: Italic, onClick: () => exec('italic') },
    { label: 'קו תחתון', icon: Underline, onClick: () => exec('underline') },
    { label: 'ירידת שורה', icon: WrapText, onClick: () => exec('insertHTML', '<br>') },
    { label: 'רשימת תבליטים', icon: List, onClick: () => exec('insertUnorderedList') },
    { label: 'רשימה ממוספרת', icon: ListOrdered, onClick: () => exec('insertOrderedList') }
  ]

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5 flex-wrap">
        {mode === 'wysiwyg' &&
          toolbarButtons.map(({ label, icon: Icon, onClick }) => (
            <button
              key={label}
              type="button"
              title={label}
              aria-label={label}
              onMouseDown={e => e.preventDefault()} // keep the editable's selection from collapsing on button focus
              onClick={onClick}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          ))}
        <button
          type="button"
          title="מצב קוד (HTML גולמי)"
          aria-label="מצב קוד (HTML גולמי)"
          aria-pressed={mode === 'code'}
          onClick={() => setMode(m => (m === 'wysiwyg' ? 'code' : 'wysiwyg'))}
          className="w-8 h-8 flex items-center justify-center rounded-lg border transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 mr-auto data-[active=true]:bg-slate-800 data-[active=true]:text-white data-[active=true]:border-slate-800"
          data-active={mode === 'code'}
        >
          <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </div>

      {mode === 'wysiwyg' ? (
        <div
          id={id}
          ref={editableRef}
          role="textbox"
          aria-multiline="true"
          aria-labelledby={labelId}
          contentEditable
          suppressContentEditableWarning
          onInput={syncFromDom}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          data-placeholder={placeholder}
          className="w-full min-h-20 rounded-2xl border border-slate-200 bg-white py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent [&_ul]:list-disc [&_ul]:ps-4 [&_ol]:list-decimal [&_ol]:ps-4 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400"
          dir="rtl"
        />
      ) : (
        <textarea
          id={id}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
          dir="rtl"
        />
      )}
    </div>
  )
}
