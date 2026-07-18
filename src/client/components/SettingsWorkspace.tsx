import {
  BrainCircuit,
  CheckCircle2,
  Eye,
  EyeOff,
  KeyRound,
  LockKeyhole,
  PiggyBank,
  Plus,
  PlugZap,
  RefreshCw,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import { type FormEvent, useEffect, useMemo, useState } from 'react'
import {
  getApplicationSettings,
  getOpenRouterModels,
  patchApplicationSettings,
  testOpenRouterConnection,
  type OpenRouterModelSummary,
  type OpenRouterConnectionSummary,
} from '../api'
import { errorMessage } from '../format'
import {
  clearOpenRouterSessionSettings,
  getOpenRouterSessionSettings,
  saveOpenRouterSessionSettings,
} from '../llm-settings'
import {
  normalizeSavedOpenRouterModels,
  reasoningEffortValues,
  type ReasoningEffort,
} from '../../shared/schemas/openrouter'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

export function SettingsWorkspace() {
  const [initial] = useState(() => getOpenRouterSessionSettings())
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '')
  const [model, setModel] = useState(initial?.model ?? '')
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(
    initial?.reasoningEffort ?? 'default',
  )
  const [savedModels, setSavedModels] = useState<string[]>([])
  const [availableModels, setAvailableModels] = useState<
    OpenRouterModelSummary[]
  >([])
  const [customModel, setCustomModel] = useState('')
  const [loadingModels, setLoadingModels] = useState(false)
  const [savingModel, setSavingModel] = useState(false)
  const [savingConnection, setSavingConnection] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(Boolean(initial))
  const [testing, setTesting] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [connection, setConnection] =
    useState<OpenRouterConnectionSummary | null>(null)
  const [bankroll, setBankroll] = useState('0.00')
  const [unitValue, setUnitValue] = useState('10.00')
  const [financialLoading, setFinancialLoading] = useState(true)
  const [financialSaving, setFinancialSaving] = useState(false)
  const [financialFeedback, setFinancialFeedback] = useState<Feedback>(null)

  useEffect(() => {
    getApplicationSettings()
      .then((settings) => {
        setBankroll((settings.currentBankrollCents / 100).toFixed(2))
        setUnitValue((settings.defaultUnitValueCents / 100).toFixed(2))
        setSavedModels(settings.savedOpenRouterModels)
        if (!initial?.model && settings.preferredOpenRouterModel) {
          setModel(settings.preferredOpenRouterModel)
        }
        if (!initial) {
          setReasoningEffort(settings.openRouterReasoningEffort)
        }
      })
      .catch((error: unknown) =>
        setFinancialFeedback({
          kind: 'error',
          message: errorMessage(error, 'Bankroll settings could not be loaded'),
        }),
      )
      .finally(() => setFinancialLoading(false))
  }, [initial])

  const selectedModel = useMemo(
    () => availableModels.find((item) => item.id === model) ?? null,
    [availableModels, model],
  )

  const catalogueModels = useMemo(
    () => availableModels.filter((item) => !savedModels.includes(item.id)),
    [availableModels, savedModels],
  )

  const reasoningOptions = useMemo<ReasoningEffort[]>(() => {
    if (selectedModel && !selectedModel.reasoning) return ['default']
    const supported =
      selectedModel?.reasoning?.supportedEfforts ??
      reasoningEffortValues.filter((effort) => effort !== 'default')
    return [
      'default',
      ...supported.filter(
        (effort) => !(selectedModel?.reasoning?.mandatory && effort === 'none'),
      ),
    ]
  }, [selectedModel])

  const markUnsaved = () => {
    clearOpenRouterSessionSettings()
    setSaved(false)
    setConnection(null)
  }

  const validate = () => {
    if (!apiKey.trim() || !model.trim()) {
      throw new Error('Enter both an OpenRouter API key and model ID')
    }
  }

  const handleSave = async () => {
    try {
      validate()
      setSavingConnection(true)
      const nextSavedModels = normalizeSavedOpenRouterModels([
        ...savedModels,
        model,
      ])
      const settings = await patchApplicationSettings({
        preferredOpenRouterModel: model.trim(),
        savedOpenRouterModels: nextSavedModels,
        openRouterReasoningEffort: reasoningEffort,
      })
      saveOpenRouterSessionSettings({ apiKey, model, reasoningEffort })
      setSavedModels(settings.savedOpenRouterModels)
      setSaved(true)
      setConnection(null)
      setFeedback({
        kind: 'success',
        message:
          'The model and reasoning preference were saved to the app. The API key remains limited to this browser tab.',
      })
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: errorMessage(error, 'Settings not saved'),
      })
    } finally {
      setSavingConnection(false)
    }
  }

  const handleTest = async () => {
    try {
      validate()
      setTesting(true)
      setFeedback(null)
      const result = await testOpenRouterConnection({
        apiKey,
        model,
        reasoningEffort,
      })
      setConnection(result)
      setFeedback({
        kind: 'success',
        message: `Connected to ${result.modelName ?? result.modelId}. No model tokens were used.`,
      })
    } catch (error) {
      setConnection(null)
      setFeedback({
        kind: 'error',
        message: errorMessage(error, 'Connection check failed'),
      })
    } finally {
      setTesting(false)
    }
  }

  const handleClear = () => {
    clearOpenRouterSessionSettings()
    setApiKey('')
    setSaved(false)
    setConnection(null)
    setFeedback({
      kind: 'success',
      message:
        'The tab-scoped API key was cleared. Saved models and reasoning preferences remain available.',
    })
  }

  const handleLoadModels = async () => {
    if (!apiKey.trim()) {
      setFeedback({
        kind: 'error',
        message: 'Enter an OpenRouter API key before loading models.',
      })
      return
    }
    setLoadingModels(true)
    setFeedback(null)
    try {
      const models = await getOpenRouterModels(apiKey.trim())
      setAvailableModels(models)
      setFeedback({
        kind: 'success',
        message: `Loaded ${models.length} current text models from OpenRouter. No model tokens were used.`,
      })
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: errorMessage(error, 'OpenRouter models could not be loaded'),
      })
    } finally {
      setLoadingModels(false)
    }
  }

  const handleSaveCustomModel = async () => {
    const nextModel = customModel.trim()
    if (!nextModel.includes('/') || nextModel.length > 240) {
      setFeedback({
        kind: 'error',
        message: 'Use an OpenRouter model ID in author/model format.',
      })
      return
    }
    setSavingModel(true)
    setFeedback(null)
    try {
      const nextSavedModels = normalizeSavedOpenRouterModels([
        ...savedModels,
        nextModel,
      ])
      const settings = await patchApplicationSettings({
        preferredOpenRouterModel: nextModel,
        savedOpenRouterModels: nextSavedModels,
      })
      setSavedModels(settings.savedOpenRouterModels)
      setModel(nextModel)
      setCustomModel('')
      markUnsaved()
      setFeedback({ kind: 'success', message: `${nextModel} was saved.` })
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: errorMessage(error, 'Model could not be saved'),
      })
    } finally {
      setSavingModel(false)
    }
  }

  const handleRemoveSavedModel = async (modelId: string) => {
    const nextSavedModels = savedModels.filter((item) => item !== modelId)
    try {
      const settings = await patchApplicationSettings({
        savedOpenRouterModels: nextSavedModels,
        ...(model === modelId ? { preferredOpenRouterModel: null } : {}),
      })
      setSavedModels(settings.savedOpenRouterModels)
      setFeedback({ kind: 'success', message: `${modelId} was removed.` })
    } catch (error) {
      setFeedback({
        kind: 'error',
        message: errorMessage(error, 'Saved model could not be removed'),
      })
    }
  }

  const handleFinancialSave = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const bankrollCents = Math.round(Number(bankroll) * 100)
    const unitValueCents = Math.round(Number(unitValue) * 100)
    if (
      !Number.isFinite(bankrollCents) ||
      bankrollCents < 0 ||
      !Number.isFinite(unitValueCents) ||
      unitValueCents < 1
    ) {
      setFinancialFeedback({
        kind: 'error',
        message:
          'Enter a non-negative bankroll and a unit value of at least $0.01',
      })
      return
    }

    setFinancialSaving(true)
    setFinancialFeedback(null)
    try {
      const settings = await patchApplicationSettings({
        currentBankrollCents: bankrollCents,
        defaultUnitValueCents: unitValueCents,
      })
      setBankroll((settings.currentBankrollCents / 100).toFixed(2))
      setUnitValue((settings.defaultUnitValueCents / 100).toFixed(2))
      setFinancialFeedback({
        kind: 'success',
        message: 'Bankroll and default unit size saved.',
      })
    } catch (error) {
      setFinancialFeedback({
        kind: 'error',
        message: errorMessage(error, 'Financial settings not saved'),
      })
    } finally {
      setFinancialSaving(false)
    }
  }

  return (
    <section className="settings-workspace">
      <div className="settings-surface">
        <form
          className="settings-section"
          onSubmit={(event) => void handleFinancialSave(event)}
        >
          <div className="editor-card__heading">
            <div className="section-icon">
              <PiggyBank size={19} />
            </div>
            <div>
              <h2>Bankroll &amp; unit size</h2>
            </div>
          </div>

          <p className="settings-intro">
            Record the bankroll you currently have available and the default AUD
            value of one unit for newly created cards.
          </p>

          <div className="field-row">
            <label className="field">
              <span>Current bankroll</span>
              <div className="input-prefix">
                <span>$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={bankroll}
                  onChange={(event) => setBankroll(event.target.value)}
                  disabled={financialLoading}
                  aria-label="Current bankroll"
                />
              </div>
              <small>Manually maintained current balance in AUD.</small>
            </label>
            <label className="field">
              <span>Default unit size</span>
              <div className="input-prefix">
                <span>$</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={unitValue}
                  onChange={(event) => setUnitValue(event.target.value)}
                  disabled={financialLoading}
                  aria-label="Default unit size"
                />
              </div>
              <small>
                Applied to new cards. Existing card history keeps its own unit
                snapshot.
              </small>
            </label>
          </div>

          <button
            className="button button--primary"
            type="submit"
            disabled={financialLoading || financialSaving}
          >
            <Save size={17} />
            {financialSaving ? 'Saving…' : 'Save bankroll settings'}
          </button>

          {financialFeedback && (
            <div
              className={`settings-feedback settings-feedback--${financialFeedback.kind}`}
              role={financialFeedback.kind === 'error' ? 'alert' : 'status'}
            >
              {financialFeedback.kind === 'success' && (
                <CheckCircle2 size={17} />
              )}
              <span>{financialFeedback.message}</span>
            </div>
          )}
        </form>

        <section className="settings-section">
          <div className="editor-card__heading">
            <div className="section-icon">
              <KeyRound size={19} />
            </div>
            <div>
              <h2>OpenRouter connection</h2>
            </div>
          </div>

          <p className="settings-intro">
            This connection powers source extraction and the optional
            fight-board summaries. Betting maths and staking remain
            deterministic code.
          </p>

          <div className="settings-connection-status" aria-live="polite">
            <span
              className={`settings-status-dot ${saved ? 'settings-status-dot--ready' : ''}`}
            />
            <span>
              <strong>
                {saved ? 'Configured for this tab' : 'Using server default'}
              </strong>
              {' — '}
              {saved
                ? `requests will use ${model}.`
                : 'save a key below to override it for this tab.'}
            </span>
          </div>

          <label className="field">
            <span>OpenRouter API key</span>
            <div className="secret-field">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(event) => {
                  setApiKey(event.target.value)
                  markUnsaved()
                }}
                placeholder="sk-or-v1-…"
                autoComplete="new-password"
                spellCheck={false}
                aria-label="OpenRouter API key"
              />
              <button
                className="secret-field__toggle"
                type="button"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
                title={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff size={17} /> : <Eye size={17} />}
              </button>
            </div>
            <small>
              Create a spend-limited key in OpenRouter for this app.
            </small>
          </label>

          <div className="settings-model-picker">
            <label className="field">
              <span>Model</span>
              <select
                value={model}
                onChange={(event) => {
                  const nextModel = event.target.value
                  const nextInfo = availableModels.find(
                    (item) => item.id === nextModel,
                  )
                  setModel(nextModel)
                  if (
                    nextInfo &&
                    (!nextInfo.reasoning ||
                      (nextInfo.reasoning.mandatory &&
                        reasoningEffort === 'none'))
                  ) {
                    setReasoningEffort('default')
                  }
                  markUnsaved()
                }}
                aria-label="Model ID"
              >
                <option value="">Select a model</option>
                {model &&
                  !savedModels.includes(model) &&
                  !availableModels.some((item) => item.id === model) && (
                    <option value={model}>{model}</option>
                  )}
                {savedModels.length > 0 && (
                  <optgroup label="Saved models">
                    {savedModels.map((modelId) => {
                      const details = availableModels.find(
                        (item) => item.id === modelId,
                      )
                      return (
                        <option key={modelId} value={modelId}>
                          {details ? `${details.name} — ${modelId}` : modelId}
                        </option>
                      )
                    })}
                  </optgroup>
                )}
                {catalogueModels.length > 0 && (
                  <optgroup label="Current OpenRouter catalogue">
                    {catalogueModels.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} — {item.id}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
              <small>
                Saved models are always listed. Load the current catalogue to
                browse every text model OpenRouter reports for this key.
              </small>
            </label>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void handleLoadModels()}
              disabled={loadingModels}
            >
              <RefreshCw
                className={loadingModels ? 'spin' : undefined}
                size={16}
              />
              {loadingModels ? 'Loading models' : 'Load models'}
            </button>
          </div>

          <div className="settings-custom-model">
            <label className="field">
              <span>Add a model ID</span>
              <input
                value={customModel}
                onChange={(event) => setCustomModel(event.target.value)}
                placeholder="author/model-name"
                autoComplete="off"
                spellCheck={false}
                aria-label="Custom model ID"
              />
            </label>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void handleSaveCustomModel()}
              disabled={savingModel || !customModel.trim()}
            >
              <Plus size={16} />
              {savingModel ? 'Saving model' : 'Save model'}
            </button>
          </div>

          {savedModels.length > 0 && (
            <details className="saved-models">
              <summary>Saved models ({savedModels.length})</summary>
              <div className="saved-model-list">
                {savedModels.map((modelId) => (
                  <div key={modelId}>
                    <span>{modelId}</span>
                    <button
                      type="button"
                      aria-label={`Remove saved model ${modelId}`}
                      title="Remove saved model"
                      onClick={() => void handleRemoveSavedModel(modelId)}
                    >
                      <X size={14} aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </details>
          )}

          <label className="field">
            <span>Thinking / reasoning</span>
            <div className="reasoning-select">
              <BrainCircuit size={17} aria-hidden="true" />
              <select
                value={
                  reasoningOptions.includes(reasoningEffort)
                    ? reasoningEffort
                    : 'default'
                }
                onChange={(event) => {
                  setReasoningEffort(event.target.value as ReasoningEffort)
                  markUnsaved()
                }}
                aria-label="Thinking / reasoning"
              >
                {reasoningOptions.map((effort) => (
                  <option key={effort} value={effort}>
                    {effort === 'default'
                      ? 'Use model default'
                      : effort === 'none'
                        ? 'Off'
                        : `${effort[0].toUpperCase()}${effort.slice(1)}`}
                  </option>
                ))}
              </select>
            </div>
            <small>
              {selectedModel
                ? selectedModel.reasoning
                  ? `${selectedModel.name} supports configurable reasoning${selectedModel.reasoning.mandatory ? ' and requires it' : ''}. Reasoning tokens can increase cost.`
                  : `${selectedModel.name} does not advertise configurable reasoning.`
                : 'Load the model catalogue to tailor this list to the selected model. Reasoning tokens can increase cost.'}
            </small>
          </label>

          {selectedModel && (
            <dl className="selected-model-details">
              <div>
                <dt>Context</dt>
                <dd>
                  {selectedModel.contextLength
                    ? `${selectedModel.contextLength.toLocaleString()} tokens`
                    : 'Not reported'}
                </dd>
              </div>
              <div>
                <dt>Input / 1M tokens</dt>
                <dd>
                  {selectedModel.promptPrice
                    ? `$${(Number(selectedModel.promptPrice) * 1_000_000).toFixed(2)}`
                    : 'Not reported'}
                </dd>
              </div>
              <div>
                <dt>Output / 1M tokens</dt>
                <dd>
                  {selectedModel.completionPrice
                    ? `$${(Number(selectedModel.completionPrice) * 1_000_000).toFixed(2)}`
                    : 'Not reported'}
                </dd>
              </div>
            </dl>
          )}

          <div className="settings-actions">
            <button
              className="button button--primary"
              type="button"
              onClick={() => void handleSave()}
              disabled={savingConnection}
            >
              <LockKeyhole size={17} />
              {savingConnection ? 'Saving' : 'Save connection'}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={handleTest}
              disabled={testing}
            >
              <PlugZap size={17} />
              {testing ? 'Checking…' : 'Test connection'}
            </button>
            <button
              className="text-button text-button--danger"
              type="button"
              onClick={handleClear}
              disabled={!apiKey && !saved}
            >
              <Trash2 size={15} />
              Clear tab key
            </button>
          </div>

          {feedback && (
            <div
              className={`settings-feedback settings-feedback--${feedback.kind}`}
              role={feedback.kind === 'error' ? 'alert' : 'status'}
            >
              {feedback.kind === 'success' && <CheckCircle2 size={17} />}
              <span>{feedback.message}</span>
            </div>
          )}
          {connection && (
            <dl className="connection-details">
              <div>
                <dt>Verified model</dt>
                <dd>{connection.modelName ?? connection.modelId}</dd>
              </div>
              <div>
                <dt>Key label</dt>
                <dd>{connection.keyLabel ?? 'Verified'}</dd>
              </div>
              <div>
                <dt>Tier</dt>
                <dd>
                  {connection.isFreeTier === null
                    ? 'Not reported'
                    : connection.isFreeTier
                      ? 'Free'
                      : 'Paid'}
                </dd>
              </div>
              <div>
                <dt>Limit remaining</dt>
                <dd>
                  {connection.limitRemaining === null
                    ? 'Not reported'
                    : connection.limitRemaining}
                </dd>
              </div>
            </dl>
          )}

          <p className="settings-privacy-note">
            <LockKeyhole size={16} />
            <span>
              The API key stays in this browser tab, is never stored in the
              database or backups, and should be cleared on a shared computer.
            </span>
          </p>
        </section>
      </div>
    </section>
  )
}
