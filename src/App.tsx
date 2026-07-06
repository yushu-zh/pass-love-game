import { useEffect, useMemo, useState } from 'react'

import './App.css'
import {
  FIELD_LIMITS,
  buildExportPayload,
  getDisplayedQuestion,
  getDraftForRecord,
  hasProgress,
  markEnding,
  resetForNewRound,
  startRound,
  stepBack,
  submitCurrentDraft,
  updateDraftField,
  validateDraft,
} from './lib/session'
import { defaultSnapshot, loadSnapshot, saveSnapshot } from './lib/storage'
import type { AppSnapshot, DraftState } from './types'

type SubmitState = {
  form: boolean
  start: boolean
}

type StartRoundState = {
  nickname: string
  nextQuestion: string
  nextTarget: string
}

type StartErrors = Partial<Record<keyof StartRoundState, string>>

const EMPTY_ERRORS: Partial<Record<keyof DraftState, string>> = {}
const EMPTY_START_ERRORS: StartErrors = {}
const EMPTY_START_STATE: StartRoundState = {
  nickname: '',
  nextQuestion: '',
  nextTarget: '',
}

function App() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(defaultSnapshot)
  const [loaded, setLoaded] = useState(false)
  const [toolboxOpen, setToolboxOpen] = useState(false)
  const [startDraft, setStartDraft] = useState<StartRoundState>(EMPTY_START_STATE)
  const [submitState, setSubmitState] = useState<SubmitState>({
    form: false,
    start: false,
  })
  const [notice, setNotice] = useState('')
  const [newRoundGuardOpen, setNewRoundGuardOpen] = useState(false)
  const [newRoundConfirmed, setNewRoundConfirmed] = useState(false)

  useEffect(() => {
    let alive = true

    loadSnapshot().then((nextSnapshot) => {
      if (!alive) {
        return
      }

      setSnapshot(nextSnapshot)
      setLoaded(true)
      setToolboxOpen(false)
    })

    return () => {
      alive = false
    }
  }, [])

  useEffect(() => {
    if (!loaded) {
      return
    }

    void saveSnapshot(snapshot)
  }, [loaded, snapshot])

  useEffect(() => {
    if (!loaded) {
      return
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasProgress(snapshot)) {
        return
      }

      event.preventDefault()
      event.returnValue = ''
    }

    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [loaded, snapshot])

  const status = snapshot.session.status
  const currentRecordId = snapshot.session.currentIndex
  const isIdle = status === 'idle'
  const isEnding = status === 'ending'
  const isEnded = status === 'ended'
  const canGoBack =
    (status === 'active' || status === 'ending') && currentRecordId > 2

  const currentDraft = useMemo(
    () => getDraftForRecord(snapshot, currentRecordId),
    [snapshot, currentRecordId],
  )
  const currentQuestion = getDisplayedQuestion(snapshot, currentRecordId)
  const fieldErrors = submitState.form
    ? validateDraft(currentDraft, {
        isFinalEntry: isEnding,
      })
    : EMPTY_ERRORS
  const startErrors = submitState.start
    ? {
        nickname: startDraft.nickname.trim().length === 0 ? '第一人昵称不能为空' : undefined,
        nextQuestion:
          startDraft.nextQuestion.trim().length === 0 ? '给下一人的问题不能为空' : undefined,
        nextTarget:
          startDraft.nextTarget.trim().length === 0 ? '下一人的特征不能为空' : undefined,
      }
    : EMPTY_START_ERRORS

  const handleFieldChange = (field: keyof DraftState, value: string) => {
    setSnapshot((previous) => updateDraftField(previous, currentRecordId, field, value))
  }

  const handleStartFieldChange = (field: keyof StartRoundState, value: string) => {
    setStartDraft((previous) => ({
      ...previous,
      [field]: value,
    }))
  }

  const handleStartRound = () => {
    const hasStartErrors =
      startDraft.nickname.trim().length === 0 ||
      startDraft.nextQuestion.trim().length === 0 ||
      startDraft.nextTarget.trim().length === 0

    if (hasStartErrors) {
      setSubmitState((previous) => ({ ...previous, start: true }))
      return
    }

    setSnapshot(
      startRound({
        nickname: startDraft.nickname,
        nextQuestion: startDraft.nextQuestion,
        nextTarget: startDraft.nextTarget,
      }),
    )
    setStartDraft(EMPTY_START_STATE)
    setSubmitState({ form: false, start: false })
    setToolboxOpen(false)
    setNewRoundGuardOpen(false)
    setNewRoundConfirmed(false)
    setNotice('')
  }

  const handleSubmit = () => {
    const errors = validateDraft(currentDraft, {
      isFinalEntry: isEnding,
    })

    setSubmitState((previous) => ({ ...previous, form: true }))

    if (Object.keys(errors).length > 0) {
      return
    }

    setSnapshot((previous) => submitCurrentDraft(previous, currentDraft))
    setSubmitState({ form: false, start: false })
    setNotice('')
  }

  const handleBack = () => {
    if (!canGoBack) {
      return
    }

    setSnapshot((previous) => stepBack(previous))
    setSubmitState((previous) => ({ ...previous, form: false }))
  }

  const handleExport = () => {
    const payload = buildExportPayload(snapshot)
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    const date = payload.exportedAt.slice(0, 10)

    link.href = url
    link.download = `pass-love-game-${date}.json`
    link.click()
    URL.revokeObjectURL(url)
    setNotice('已导出 JSON 备份。')
  }

  const openNewRoundGuard = () => {
    setNewRoundGuardOpen(true)
    setNewRoundConfirmed(false)
    setNotice('')
  }

  const closeNewRoundGuard = () => {
    setNewRoundGuardOpen(false)
    setNewRoundConfirmed(false)
  }

  const handleConfirmNewRound = () => {
    if (!newRoundConfirmed) {
      return
    }

    setSnapshot(resetForNewRound())
    setStartDraft(EMPTY_START_STATE)
    setSubmitState({ form: false, start: false })
    setToolboxOpen(false)
    setNewRoundGuardOpen(false)
    setNewRoundConfirmed(false)
    setNotice('')
  }

  const fieldIds = {
    startNickname: 'start-nickname',
    startNextQuestion: 'start-next-question',
    startNextTarget: 'start-next-target',
    answer: 'answer-field',
    nickname: 'nickname-field',
    nextQuestion: 'next-question-field',
    nextTarget: 'next-target-field',
    newRoundConfirm: 'new-round-confirm',
  }

  if (!loaded) {
    return <main className="loading-screen">正在恢复…</main>
  }

  return (
    <main className="app-shell">
      <aside className={`toolbox ${toolboxOpen ? 'open' : ''}`} aria-label="工具箱">
        <div className="toolbox-header compact">
          <h2>工具箱</h2>
        </div>

        <div className="toolbox-actions" role="group" aria-label="工具箱操作">
          {status === 'active' && (
            <button
              type="button"
              className="toolbox-action"
              onClick={() => {
                setSnapshot((previous) => markEnding(previous))
                setNotice('已切换为最后一位。')
                setToolboxOpen(false)
              }}
            >
              结束本轮
            </button>
          )}

          {status === 'ending' && (
            <button type="button" className="toolbox-action subtle" disabled>
              收尾中
            </button>
          )}

          <button
            type="button"
            className="toolbox-action toolbox-action-secondary"
            onClick={handleExport}
            disabled={!hasProgress(snapshot)}
          >
            导出 JSON
          </button>
        </div>

        {notice && <p className="toolbox-note">{notice}</p>}
      </aside>

      {!toolboxOpen && (
        <button
          type="button"
          className="sidebar-rail-trigger"
          aria-label="打开工具箱"
          aria-pressed="false"
          onClick={() => setToolboxOpen(true)}
        >
          <svg
            className="sidebar-rail-icon"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M4.5 5.5H19.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="M4.5 12H15.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="M4.5 18.5H12.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <path
              d="M18 9.5L20.5 12L18 14.5"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span className="sidebar-rail-label">工具箱</span>
        </button>
      )}

      {toolboxOpen && (
        <button
          type="button"
          className="backdrop"
          aria-label="关闭工具箱遮罩"
          onClick={() => setToolboxOpen(false)}
        />
      )}

      <section className="page-shell">
        <section className="content-card">
          {isIdle && (
            <div className="idle-panel">
              <div className="question-panel question-panel-start">
                <p className="eyebrow">本轮已开始</p>
                <h1 className="question-song">第一个问题</h1>
              </div>

              <div className="form-grid compact">
                <label className="field">
                  <span className="field-label">你的昵称</span>
                  <input
                    id={fieldIds.startNickname}
                    aria-label="你的昵称"
                    value={startDraft.nickname}
                    onChange={(event) => handleStartFieldChange('nickname', event.target.value)}
                    className={`field-control ${startErrors.nickname ? 'error' : ''}`}
                    maxLength={FIELD_LIMITS.nickname}
                  />
                </label>
                {startErrors.nickname && <p className="field-error">{startErrors.nickname}</p>}

                <label className="field field-answer">
                  <span className="field-label">给下一人的问题</span>
                  <textarea
                    id={fieldIds.startNextQuestion}
                    aria-label="给下一人的问题"
                    value={startDraft.nextQuestion}
                    onChange={(event) =>
                      handleStartFieldChange('nextQuestion', event.target.value)
                    }
                    className={`field-control ${startErrors.nextQuestion ? 'error' : ''}`}
                    rows={6}
                    maxLength={FIELD_LIMITS.nextQuestion}
                  />
                </label>
                {startErrors.nextQuestion && (
                  <p className="field-error">{startErrors.nextQuestion}</p>
                )}

                <label className="field">
                  <span className="field-label">期待的下一人特征</span>
                  <input
                    id={fieldIds.startNextTarget}
                    aria-label="期待的下一人特征"
                    value={startDraft.nextTarget}
                    onChange={(event) => handleStartFieldChange('nextTarget', event.target.value)}
                    className={`field-control ${startErrors.nextTarget ? 'error' : ''}`}
                    maxLength={FIELD_LIMITS.nextTarget}
                  />
                </label>
                {startErrors.nextTarget && (
                  <p className="field-error">{startErrors.nextTarget}</p>
                )}
              </div>
            </div>
          )}

          {!isIdle && !isEnded && (
            <>
              <div className="question-panel question-panel-current">
                <p className="eyebrow">上一人的问题</p>
                <h1 className="question-song">{currentQuestion || '等待问题…'}</h1>
                {isEnding && <p className="ending-note">最后一位无需填写问题</p>}
              </div>

              <div className="form-grid">
                <label className="field field-answer">
                  <span className="field-label">你的回答</span>
                  <textarea
                    id={fieldIds.answer}
                    aria-label="你的回答"
                    value={currentDraft.answer}
                    onChange={(event) => handleFieldChange('answer', event.target.value)}
                    className={`field-control ${fieldErrors.answer ? 'error' : ''}`}
                    rows={7}
                    maxLength={FIELD_LIMITS.answer}
                  />
                </label>
                {fieldErrors.answer && <p className="field-error">{fieldErrors.answer}</p>}

                <label className="field">
                  <span className="field-label">你的昵称</span>
                  <input
                    id={fieldIds.nickname}
                    aria-label="你的昵称"
                    value={currentDraft.nickname}
                    onChange={(event) => handleFieldChange('nickname', event.target.value)}
                    className={`field-control ${fieldErrors.nickname ? 'error' : ''}`}
                    maxLength={FIELD_LIMITS.nickname}
                  />
                </label>
                {fieldErrors.nickname && (
                  <p className="field-error">{fieldErrors.nickname}</p>
                )}

                {!isEnding && (
                  <>
                    <label className="field">
                      <span className="field-label">给下一人的问题</span>
                      <textarea
                        id={fieldIds.nextQuestion}
                        aria-label="给下一人的问题"
                        value={currentDraft.nextQuestion}
                        onChange={(event) =>
                          handleFieldChange('nextQuestion', event.target.value)
                        }
                        className={`field-control ${
                          fieldErrors.nextQuestion ? 'error' : ''
                        }`}
                        rows={4}
                        maxLength={FIELD_LIMITS.nextQuestion}
                      />
                    </label>
                    {fieldErrors.nextQuestion && (
                      <p className="field-error">{fieldErrors.nextQuestion}</p>
                    )}

                    <label className="field">
                      <span className="field-label">期待的下一人特征</span>
                      <input
                        id={fieldIds.nextTarget}
                        aria-label="期待的下一人特征"
                        value={currentDraft.nextTarget}
                        onChange={(event) => handleFieldChange('nextTarget', event.target.value)}
                        className={`field-control ${
                          fieldErrors.nextTarget ? 'error' : ''
                        }`}
                        maxLength={FIELD_LIMITS.nextTarget}
                      />
                    </label>
                    {fieldErrors.nextTarget && (
                      <p className="field-error">{fieldErrors.nextTarget}</p>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {isEnded && (
            <div className="empty-state complete">
              <p className="eyebrow">这一轮已完成</p>
              <h1 className="question-song">最后一位已保存</h1>
              <p>开启新一轮会清空上一轮记录。若需保留，请先保存或导出。</p>

              <div className="complete-actions">
                <button type="button" className="secondary-button" onClick={handleExport}>
                  导出 JSON
                </button>
                <button type="button" className="submit-button" onClick={openNewRoundGuard}>
                  开启新一轮
                </button>
              </div>

              {newRoundGuardOpen && (
                <section className="reset-guard" aria-label="开启新一轮确认">
                  <p className="reset-guard-title">开启新一轮后，上一轮记录将被清空</p>
                  <p className="reset-guard-copy">
                    如需保留，请先导出或保存。确认后会立即清空并回到新一轮开始页。
                  </p>

                  <label className="reset-check" htmlFor={fieldIds.newRoundConfirm}>
                    <input
                      id={fieldIds.newRoundConfirm}
                      type="checkbox"
                      checked={newRoundConfirmed}
                      onChange={(event) => setNewRoundConfirmed(event.target.checked)}
                    />
                    <span>我已知晓开启后会清空上一轮记录，并已保存需要保留的内容</span>
                  </label>

                  <div className="reset-guard-actions">
                    <button type="button" className="ghost-button" onClick={closeNewRoundGuard}>
                      再想想
                    </button>
                    <button
                      type="button"
                      className="submit-button"
                      onClick={handleConfirmNewRound}
                      disabled={!newRoundConfirmed}
                    >
                      确认开启新一轮
                    </button>
                  </div>
                </section>
              )}
            </div>
          )}

          {notice && <p className="surface-note">{notice}</p>}
        </section>

        {isIdle && (
          <footer className="sticky-footer">
            <div className="footer-actions">
              <button type="button" className="back-button" disabled>
                返回
              </button>
              <button type="button" className="submit-button" onClick={handleStartRound}>
                确认
              </button>
            </div>
          </footer>
        )}

        {!isIdle && !isEnded && (
          <footer className="sticky-footer">
            <div className="footer-actions">
              <button
                type="button"
                className="back-button"
                onClick={handleBack}
                disabled={!canGoBack}
              >
                返回
              </button>
              <button type="button" className="submit-button" onClick={handleSubmit}>
                确认
              </button>
            </div>
          </footer>
        )}
      </section>
    </main>
  )
}

export default App
