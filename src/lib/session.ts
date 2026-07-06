import type {
  AppSnapshot,
  DraftState,
  ExportPayload,
  PassRecord,
  RoundStatus,
  ValidationErrors,
} from '../types'

export const APP_VERSION = 1
export const STORAGE_KEY = 'pass-love-game.snapshot'

export const FIELD_LIMITS = {
  answer: 500,
  nickname: 40,
  nextQuestion: 200,
  nextTarget: 80,
} as const

const nowIso = () => new Date().toISOString()

export const createEmptyDraft = (): DraftState => ({
  answer: '',
  nickname: '',
  nextQuestion: '',
  nextTarget: '',
})

export const createEmptySnapshot = (): AppSnapshot => ({
  records: [],
  session: {
    status: 'idle',
    currentIndex: 0,
    updatedAt: nowIso(),
  },
  drafts: {},
})

export const sanitizeDraft = (draft: DraftState): DraftState => ({
  answer: draft.answer.slice(0, FIELD_LIMITS.answer),
  nickname: draft.nickname.slice(0, FIELD_LIMITS.nickname),
  nextQuestion: draft.nextQuestion.slice(0, FIELD_LIMITS.nextQuestion),
  nextTarget: draft.nextTarget.slice(0, FIELD_LIMITS.nextTarget),
})

export const normalizeSnapshot = (snapshot: AppSnapshot | null): AppSnapshot => {
  if (!snapshot) {
    return createEmptySnapshot()
  }

  return {
    records: Array.isArray(snapshot.records) ? snapshot.records : [],
    session: {
      status: normalizeStatus(snapshot.session?.status),
      currentIndex: Math.max(snapshot.session?.currentIndex ?? 0, 0),
      updatedAt: snapshot.session?.updatedAt ?? nowIso(),
    },
    drafts: Object.fromEntries(
      Object.entries(snapshot.drafts ?? {}).map(([key, value]) => [
        key,
        sanitizeDraft({
          answer: value?.answer ?? '',
          nickname: value?.nickname ?? '',
          nextQuestion: value?.nextQuestion ?? '',
          nextTarget: value?.nextTarget ?? '',
        }),
      ]),
    ),
  }
}

const normalizeStatus = (status?: RoundStatus): RoundStatus => {
  if (status === 'active' || status === 'ending' || status === 'ended') {
    return status
  }

  return 'idle'
}

const keyForRecord = (recordId: number) => String(recordId)

export const getRecordById = (records: PassRecord[], recordId: number) =>
  records.find((record) => record.id === recordId)

export const getDraftForRecord = (
  snapshot: AppSnapshot,
  recordId: number,
): DraftState => {
  const existingDraft = snapshot.drafts[keyForRecord(recordId)]

  if (existingDraft) {
    return sanitizeDraft(existingDraft)
  }

  const record = getRecordById(snapshot.records, recordId)

  if (!record) {
    return createEmptyDraft()
  }

  return sanitizeDraft({
    answer: record.answer,
    nickname: record.nickname,
    nextQuestion: record.nextQuestion,
    nextTarget: record.nextTarget,
  })
}

export const getDisplayedQuestion = (
  snapshot: AppSnapshot,
  recordId: number,
): string => {
  if (recordId <= 1) {
    return ''
  }

  return getRecordById(snapshot.records, recordId - 1)?.nextQuestion ?? ''
}

export const hasProgress = (snapshot: AppSnapshot) => {
  const draftHasContent = Object.values(snapshot.drafts).some((draft) =>
    Object.values(draft).some((value) => value.trim().length > 0),
  )

  return snapshot.session.status !== 'idle' || snapshot.records.length > 0 || draftHasContent
}

export const startRound = (input: {
  nickname: string
  nextQuestion: string
  nextTarget: string
}): AppSnapshot => {
  const firstRecord: PassRecord = {
    id: 1,
    answer: '',
    nickname: input.nickname.trim(),
    nextQuestion: input.nextQuestion.trim(),
    nextTarget: input.nextTarget.trim(),
  }

  return {
    records: [firstRecord],
    session: {
      status: 'active',
      currentIndex: 2,
      updatedAt: nowIso(),
    },
    drafts: {
      '2': createEmptyDraft(),
    },
  }
}

export const updateDraftField = (
  snapshot: AppSnapshot,
  recordId: number,
  field: keyof DraftState,
  value: string,
): AppSnapshot => {
  const recordKey = keyForRecord(recordId)
  const currentDraft = getDraftForRecord(snapshot, recordId)
  const nextDraft = sanitizeDraft({
    ...currentDraft,
    [field]: value,
  })

  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      updatedAt: nowIso(),
    },
    drafts: {
      ...snapshot.drafts,
      [recordKey]: nextDraft,
    },
  }
}

export const markEnding = (snapshot: AppSnapshot): AppSnapshot => {
  const recordId = snapshot.session.currentIndex
  const currentDraft = getDraftForRecord(snapshot, recordId)

  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      status: 'ending',
      updatedAt: nowIso(),
    },
    drafts: {
      ...snapshot.drafts,
      [keyForRecord(recordId)]: {
        ...currentDraft,
        nextQuestion: '',
        nextTarget: '',
      },
    },
  }
}

export const stepBack = (snapshot: AppSnapshot): AppSnapshot => {
  if (snapshot.session.status === 'ended') {
    return {
      ...snapshot,
      session: {
        ...snapshot.session,
        status: 'ending',
        updatedAt: nowIso(),
      },
    }
  }

  if (snapshot.session.currentIndex <= 2) {
    return snapshot
  }

  return {
    ...snapshot,
    session: {
      ...snapshot.session,
      currentIndex: snapshot.session.currentIndex - 1,
      status: 'active',
      updatedAt: nowIso(),
    },
  }
}

export const validateDraft = (
  draft: DraftState,
  options: { isFinalEntry: boolean },
): ValidationErrors => {
  const nextDraft = sanitizeDraft(draft)
  const errors: ValidationErrors = {}

  if (nextDraft.answer.trim().length === 0) {
    errors.answer = '回答不能为空'
  }

  if (nextDraft.nickname.trim().length === 0) {
    errors.nickname = '昵称不能为空'
  }

  if (!options.isFinalEntry && nextDraft.nextQuestion.trim().length === 0) {
    errors.nextQuestion = '给下一人的问题不能为空'
  }

  if (!options.isFinalEntry && nextDraft.nextTarget.trim().length === 0) {
    errors.nextTarget = '下一人的特征不能为空'
  }

  return errors
}

export const resetForNewRound = (): AppSnapshot => createEmptySnapshot()

const toRecord = (
  recordId: number,
  draft: DraftState,
  isFinalEntry: boolean,
): PassRecord => {
  const nextDraft = sanitizeDraft(draft)

  return {
    id: recordId,
    answer: nextDraft.answer.trim(),
    nickname: nextDraft.nickname.trim(),
    nextQuestion: isFinalEntry ? '' : nextDraft.nextQuestion.trim(),
    nextTarget: isFinalEntry ? '' : nextDraft.nextTarget.trim(),
  }
}

const upsertRecord = (records: PassRecord[], nextRecord: PassRecord) => {
  const existingIndex = records.findIndex((record) => record.id === nextRecord.id)

  if (existingIndex === -1) {
    return [...records, nextRecord].sort((left, right) => left.id - right.id)
  }

  const nextRecords = [...records]
  nextRecords[existingIndex] = nextRecord
  return nextRecords
}

export const submitCurrentDraft = (
  snapshot: AppSnapshot,
  draft: DraftState,
): AppSnapshot => {
  const recordId = snapshot.session.currentIndex
  const isFinalEntry = snapshot.session.status === 'ending'
  const nextRecord = toRecord(recordId, draft, isFinalEntry)
  const nextRecords = upsertRecord(snapshot.records, nextRecord)
  const nextDrafts = {
    ...snapshot.drafts,
    [keyForRecord(recordId)]: sanitizeDraft({
      answer: nextRecord.answer,
      nickname: nextRecord.nickname,
      nextQuestion: nextRecord.nextQuestion,
      nextTarget: nextRecord.nextTarget,
    }),
  }

  if (isFinalEntry) {
    return {
      records: nextRecords,
      drafts: nextDrafts,
      session: {
        ...snapshot.session,
        status: 'ended',
        updatedAt: nowIso(),
      },
    }
  }

  const nextRecordId = recordId + 1

  return {
    records: nextRecords,
    drafts: {
      ...nextDrafts,
      [keyForRecord(nextRecordId)]: nextDrafts[keyForRecord(nextRecordId)] ?? createEmptyDraft(),
    },
    session: {
      ...snapshot.session,
      status: 'active',
      currentIndex: nextRecordId,
      updatedAt: nowIso(),
    },
  }
}

export const buildExportPayload = (snapshot: AppSnapshot): ExportPayload => ({
  version: APP_VERSION,
  exportedAt: nowIso(),
  records: snapshot.records,
})
