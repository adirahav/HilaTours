import { Preferences } from '@capacitor/preferences'
import { Capacitor } from '@capacitor/core'

// Persisted-value helper. On native (Capacitor) uses @capacitor/preferences;
// on web falls back to localStorage. Used for the admin auth token, etc.

const isNative = Capacitor.isNativePlatform()

export const utilService = {
  async setItem(key: string, value: string): Promise<void> {
    if (isNative) {
      await Preferences.set({ key, value })
    } else {
      localStorage.setItem(key, value)
    }
  },

  async getItem(key: string): Promise<string | null> {
    if (isNative) {
      const { value } = await Preferences.get({ key })
      return value
    }
    return localStorage.getItem(key)
  },

  async removeItem(key: string): Promise<void> {
    if (isNative) {
      await Preferences.remove({ key })
    } else {
      localStorage.removeItem(key)
    }
  },

  makeId(length = 8): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
    let id = ''
    for (let i = 0; i < length; i++) {
      id += chars[Math.floor(Math.random() * chars.length)]
    }
    return id
  }
}
