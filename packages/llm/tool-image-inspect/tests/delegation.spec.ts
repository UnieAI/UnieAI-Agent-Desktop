/** What the tool sends to the vision route, and what it refuses to send. */
import { describe, expect, it } from 'vitest'
import { Context } from '@unieai/cordis'
import { CallId } from '@unieai/uad-llm'
import SystemPrompt from '@unieai/uad-system-prompt'
import ToolRuntime, { type ToolExecutionResult } from '@unieai/uad-tools'
import ImageInspect, { Config } from '../src/index.ts'

const IMAGE = { attachmentId: 'att_1', mediaType: 'image/png', bytes: 19288, width: 1280, height: 800 }
const signal = new AbortController().signal

/**
 * @param modalities - what the configured route declares it accepts.
 * @param answer - text deltas the fake route streams back.
 * @returns the call helper plus what the route received.
 */
async function bench(modalities: string[] | undefined, answer: string[] = ['looks ', 'blue']) {
  const ctx = new Context()
  const sent: { provider: string; model: string; messages: { content: unknown[] }[] }[] = []
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  // Only the llm route is faked: the tool registry and the prompt are the real
  // ones, so registration is exercised rather than assumed.
  ctx.provide('attachments', {} as never)
  ctx.provide('llm', {
    resolveModelInfo: () => Promise.resolve({ inputModalities: modalities }),
    stream: (options: { provider: string; model: string; messages: { content: unknown[] }[] }) => {
      sent.push(options)
      return (async function* () {
        for (const text of answer) yield { type: 'text-delta', index: 0, text }
      })()
    },
  } as never)
  await ctx.plugin(ImageInspect, Config({ provider: 'vision', model: 'vlm-1' }))
  let counter = 0
  const call = (args: unknown): Promise<ToolExecutionResult> => ctx.tools.execute({
    signal, callId: CallId(`call-${++counter}`), name: 'image_inspect', arguments: args,
  })
  return { sent, call }
}

describe('image_inspect delegation', () => {
  it('sends the image by reference and the question verbatim', async () => {
    const { sent, call } = await bench(['text', 'image'])
    const result = await call({ image: IMAGE, question: 'what colour is the button?' })
    expect(result.isError ?? false).toBe(false)
    expect(sent).toHaveLength(1)
    const content = sent[0]?.messages[0]?.content
    // By REFERENCE, never as bytes: the adapter derives the downscaled request
    // version against the model's own declared budget, and doing it here too
    // would shrink twice and cache neither.
    expect(content?.[0]).toEqual({ type: 'image', attachment: IMAGE })
    expect(content?.[1]).toEqual({ type: 'text', text: 'what colour is the button?' })
  })

  it('refuses a route that does not declare image input', async () => {
    // Asking a text-only model to look at a picture fails inside the provider,
    // with a message about the request rather than about the composition.
    const { sent, call } = await bench(['text'])
    const result = await call({ image: IMAGE, question: 'what is this?' })
    expect(result.isError).toBe(true)
    expect(sent).toHaveLength(0)
  })

  it('refuses a route whose modalities are unknown', async () => {
    const { sent, call } = await bench(undefined)
    expect((await call({ image: IMAGE, question: 'what is this?' })).isError).toBe(true)
    expect(sent).toHaveLength(0)
  })

  it('refuses an empty question rather than asking the model to guess', async () => {
    const { sent, call } = await bench(['text', 'image'])
    expect((await call({ image: IMAGE, question: '   ' })).isError).toBe(true)
    expect(sent).toHaveLength(0)
  })

  it('fails loud when the vision model returns nothing', async () => {
    // An empty answer read as a valid one would put "" into a manual.
    const { call } = await bench(['text', 'image'], [])
    expect((await call({ image: IMAGE, question: 'what is this?' })).isError).toBe(true)
  })
})
