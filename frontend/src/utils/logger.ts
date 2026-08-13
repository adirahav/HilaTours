// In-app log viewer support. Intercepts console.log calls matching the
// `[TAG] message` pattern and stores them in-memory (capped at 500 entries).
// Only tagged logs (e.g. console.log('[LOGIN] ...')) are captured.

export interface LogEntry {
  tag: string
  message: string
  timestamp: string
}

const MAX_ENTRIES = 500
const TAG_PATTERN = /^\[([A-Z0-9_-]+)\]\s?(.*)$/s

let logs: LogEntry[] = []
const subscribers = new Set<(entries: LogEntry[]) => void>()
let initialized = false

function notify(): void {
  const snapshot = getLogs()
  subscribers.forEach(fn => fn(snapshot))
}

export function getLogs(): LogEntry[] {
  return [...logs]
}

export function getAvailableTags(): string[] {
  return [...new Set(logs.map(entry => entry.tag))]
}

export function clear(): void {
  logs = []
  notify()
}

export function subscribe(fn: (entries: LogEntry[]) => void): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

function record(args: unknown[]): void {
  const first = args[0]
  if (typeof first !== 'string') return
  const match = TAG_PATTERN.exec(first)
  if (!match) return
  logs.push({
    tag: match[1],
    message: [match[2], ...args.slice(1).map(String)].join(' ').trim(),
    timestamp: new Date().toISOString()
  })
  if (logs.length > MAX_ENTRIES) {
    logs = logs.slice(logs.length - MAX_ENTRIES)
  }
  notify()
}

export const logger = {
  init(): void {
    if (initialized) return
    initialized = true
    const original = console.log.bind(console)
    console.log = (...args: unknown[]) => {
      record(args)
      original(...args)
    }
  },
  getLogs,
  getAvailableTags,
  clear,
  subscribe
}
