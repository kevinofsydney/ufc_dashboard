import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { callModel } from '../../src/server/llm/call-model'

afterEach(() => vi.unstubAllGlobals())

describe('LLM provider contract', () => {
  it('strips fences, validates output, and records usage', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '```json\n{"ok":true}\n```' } }],
          usage: { prompt_tokens: 12, completion_tokens: 4, cost: 0.001 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    const result = await callModel(
      {
        task: 'card_fetch',
        messages: [{ role: 'user', content: 'untrusted source' }],
        schema: z.object({ ok: z.literal(true) }),
      },
      {
        provider: 'openrouter',
        model: 'author/exact-model-id',
        apiKey: 'test-key',
        reasoningEffort: 'high',
      },
    )

    expect(result.data.ok).toBe(true)
    expect(result.inputTokens).toBe(12)
    expect(result.estimatedCostMicros).toBe(1_000)
    const requestBody = JSON.parse(
      String((fetchMock.mock.calls[0]?.[1] as RequestInit).body),
    ) as { model?: string; reasoning?: { effort?: string } }
    expect(requestBody.model).toBe('author/exact-model-id')
    expect(requestBody.reasoning).toEqual({ effort: 'high' })
  })

  it('retries once with a validation correction', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'not json' } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' } }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      callModel(
        {
          task: 'card_fetch',
          messages: [{ role: 'user', content: 'source' }],
          schema: z.object({ ok: z.literal(true) }),
        },
        { provider: 'openrouter', model: 'test-model', apiKey: 'test-key' },
      ),
    ).resolves.toMatchObject({ data: { ok: true } })

    const retryBody = JSON.parse(
      String((fetchMock.mock.calls[1]?.[1] as RequestInit).body),
    ) as { messages: Array<{ content: string }> }
    expect(retryBody.messages.at(-1)?.content).toContain('failed validation')
  })
})
