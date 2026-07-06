export type RoundStatus = 'idle' | 'active' | 'ending' | 'ended'

export type PassRecord = {
  id: number
  answer: string
  nickname: string
  nextQuestion: string
  nextTarget: string
}

export type DraftState = {
  answer: string
  nickname: string
  nextQuestion: string
  nextTarget: string
}

export type SessionState = {
  status: RoundStatus
  currentIndex: number
  updatedAt: string
}

export type AppSnapshot = {
  records: PassRecord[]
  session: SessionState
  drafts: Record<string, DraftState>
}

export type ValidationErrors = Partial<Record<keyof DraftState, string>>

export type ExportPayload = {
  version: 1
  exportedAt: string
  records: PassRecord[]
}
