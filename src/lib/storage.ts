import localforage from 'localforage'

import { STORAGE_KEY, createEmptySnapshot, normalizeSnapshot } from './session'
import type { AppSnapshot } from '../types'

export const loadSnapshot = async (): Promise<AppSnapshot> => {
  const snapshot = await localforage.getItem<AppSnapshot>(STORAGE_KEY)
  return normalizeSnapshot(snapshot)
}

export const saveSnapshot = async (snapshot: AppSnapshot) => {
  await localforage.setItem(STORAGE_KEY, snapshot)
}

export const clearSnapshot = async () => {
  await localforage.removeItem(STORAGE_KEY)
}

export const defaultSnapshot = createEmptySnapshot()
