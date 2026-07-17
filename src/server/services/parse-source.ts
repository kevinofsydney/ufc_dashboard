import aggregatorPrompt from '../../../prompts/aggregator-extraction.md?raw'
import individualPrompt from '../../../prompts/individual-extraction.md?raw'
import statsTrackerPrompt from '../../../prompts/stats-tracker-extraction.md?raw'
import {
  individualExtractionSchema,
  statsTrackerExtractionSchema,
  type IndividualExtraction,
  type StatsTrackerExtraction,
} from '../../shared/schemas/extraction'
import type { Bindings } from '../env'
import { callModel } from '../llm/call-model'
import type { ProviderConfiguration } from '../llm/provider'
import {
  completeExtractionRun,
  createExtractionRun,
  failExtractionRun,
  getExtractionRun,
  type ExtractionRunRecord,
} from '../repositories/extractions'
import { listFights } from '../repositories/fights'
import { getSource } from '../repositories/sources'

const PROMPT_VERSION = 'v1'
const MAX_CHUNK_CHARACTERS = 50_000

function chunkSource(value: string): string[] {
  if (value.length <= MAX_CHUNK_CHARACTERS) return [value]
  const chunks: string[] = []
  let current = ''
  for (const paragraph of value.split(/\n{2,}/)) {
    if (paragraph.length > MAX_CHUNK_CHARACTERS) {
      if (current) chunks.push(current)
      current = ''
      for (
        let start = 0;
        start < paragraph.length;
        start += MAX_CHUNK_CHARACTERS
      ) {
        chunks.push(paragraph.slice(start, start + MAX_CHUNK_CHARACTERS))
      }
    } else if (`${current}\n\n${paragraph}`.length > MAX_CHUNK_CHARACTERS) {
      chunks.push(current)
      current = paragraph
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph
    }
  }
  if (current) chunks.push(current)
  return chunks
}

function uniqueObjects<T>(values: T[]): T[] {
  const seen = new Set<string>()
  return values.filter((value) => {
    const key = JSON.stringify(value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function mergeIndividual(chunks: IndividualExtraction[]): IndividualExtraction {
  return {
    opinions: uniqueObjects(chunks.flatMap((chunk) => chunk.opinions)),
    tips: uniqueObjects(chunks.flatMap((chunk) => chunk.tips)),
    fights_not_covered: [
      ...new Set(chunks.flatMap((chunk) => chunk.fights_not_covered)),
    ],
    unmatched: uniqueObjects(chunks.flatMap((chunk) => chunk.unmatched)),
    unmatched_attribution: uniqueObjects(
      chunks.flatMap((chunk) => chunk.unmatched_attribution ?? []),
    ),
  }
}

function mergeStats(chunks: StatsTrackerExtraction[]): StatsTrackerExtraction {
  return {
    stats: uniqueObjects(chunks.flatMap((chunk) => chunk.stats)),
    unmatched: uniqueObjects(chunks.flatMap((chunk) => chunk.unmatched)),
  }
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
}

function getProviderConfiguration(env: Bindings): ProviderConfiguration {
  const provider = env.LLM_PROVIDER
  const model = env.LLM_MODEL
  const apiKey =
    provider === 'anthropic'
      ? env.ANTHROPIC_API_KEY
      : provider === 'openrouter'
        ? env.OPENROUTER_API_KEY
        : undefined
  if (!provider || !model || !apiKey) {
    throw new Error(
      'LLM extraction is not configured. Set LLM_PROVIDER, LLM_MODEL, and the matching Worker secret.',
    )
  }
  return { provider, model, apiKey, appOrigin: env.APP_ORIGIN }
}

export async function parseSource(
  env: Bindings,
  sourceId: string,
): Promise<ExtractionRunRecord> {
  const source = await getSource(env.DB, sourceId)
  if (!source) throw new Error('Source not found')
  if (source.extractionMode === 'individual' && !source.primaryCapperId) {
    throw new Error('An individual source requires a primary capper')
  }

  const configuration = getProviderConfiguration(env)
  const run = await createExtractionRun(env.DB, {
    sourceId,
    provider: configuration.provider,
    model: configuration.model,
    promptVersion: PROMPT_VERSION,
    sourceHash: await sha256(source.rawText),
  })

  try {
    const fights = await listFights(env.DB, source.cardId)
    const canonicalCard = fights.map((fight) => ({
      fight_id: fight.id,
      fighter_a: fight.fighterA,
      fighter_b: fight.fighterB,
    }))
    const sourceChunks = chunkSource(source.rawText)
    let inputTokens = 0
    let outputTokens = 0
    let estimatedCostMicros = 0
    let hasInputTokens = true
    let hasOutputTokens = true
    let hasEstimatedCost = true
    let merged: IndividualExtraction | StatsTrackerExtraction

    if (source.extractionMode === 'stats_tracker') {
      const results: StatsTrackerExtraction[] = []
      for (const [index, sourceChunk] of sourceChunks.entries()) {
        const result = await callModel(
          {
            task: 'stats_tracker_extraction',
            schema: statsTrackerExtractionSchema,
            temperature: 0,
            messages: [
              { role: 'system', content: statsTrackerPrompt },
              {
                role: 'user',
                content: `Canonical card:\n${JSON.stringify(canonicalCard)}\n\nChunk ${index + 1} of ${sourceChunks.length}\n\nSOURCE_START\n${sourceChunk}\nSOURCE_END`,
              },
            ],
            metadata: { sourceId, extractionRunId: run.id },
          },
          configuration,
        )
        results.push(result.data)
        hasInputTokens &&= result.inputTokens !== null
        hasOutputTokens &&= result.outputTokens !== null
        hasEstimatedCost &&= result.estimatedCostMicros !== null
        inputTokens += result.inputTokens ?? 0
        outputTokens += result.outputTokens ?? 0
        estimatedCostMicros += result.estimatedCostMicros ?? 0
      }
      merged = mergeStats(results)
    } else {
      const results: IndividualExtraction[] = []
      const prompt =
        source.extractionMode === 'aggregator'
          ? aggregatorPrompt
          : individualPrompt
      for (const [index, sourceChunk] of sourceChunks.entries()) {
        const result = await callModel(
          {
            task:
              source.extractionMode === 'aggregator'
                ? 'aggregator_extraction'
                : 'individual_extraction',
            schema: individualExtractionSchema,
            temperature: 0,
            messages: [
              { role: 'system', content: prompt },
              {
                role: 'user',
                content: `Canonical card:\n${JSON.stringify(canonicalCard)}\n\nNamed capper: ${source.primaryCapperName ?? 'aggregator'}\n\nChunk ${index + 1} of ${sourceChunks.length}\n\nSOURCE_START\n${sourceChunk}\nSOURCE_END`,
              },
            ],
            metadata: { sourceId, extractionRunId: run.id },
          },
          configuration,
        )
        results.push(result.data)
        hasInputTokens &&= result.inputTokens !== null
        hasOutputTokens &&= result.outputTokens !== null
        hasEstimatedCost &&= result.estimatedCostMicros !== null
        inputTokens += result.inputTokens ?? 0
        outputTokens += result.outputTokens ?? 0
        estimatedCostMicros += result.estimatedCostMicros ?? 0
      }
      merged = mergeIndividual(results)
    }

    await completeExtractionRun(env.DB, run.id, {
      rawResponse: JSON.stringify(merged),
      inputTokens: hasInputTokens ? inputTokens : null,
      outputTokens: hasOutputTokens ? outputTokens : null,
      estimatedCostMicros: hasEstimatedCost ? estimatedCostMicros : null,
    })
    return (await getExtractionRun(env.DB, run.id)) ?? run
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Extraction failed'
    await failExtractionRun(env.DB, run.id, message)
    throw error
  }
}
