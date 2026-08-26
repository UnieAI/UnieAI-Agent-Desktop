/**
 * `image_inspect`: the main model asks a vision model about one picture.
 *
 * DELEGATION, not a model switch. The turn keeps running on whatever model it
 * started on; one tool call goes out to a configured vision route carrying the
 * image and a question, and what comes back is text. Switching the turn's model
 * instead would throw away the prefix cache and keep every later text-only step
 * on the more expensive route, and a subagent would be a whole loop for one
 * question.
 *
 * The cost is real and worth stating: the caller gets a DESCRIPTION, not the
 * picture. "Is this button blue" survives that; "click the button" does not,
 * because the coordinates the answer names were measured on an image the caller
 * cannot see. The tool's own description says so, so a model asks the vision
 * route for what it needs rather than for a summary.
 * @module @unieai/uad-tool-image-inspect
 */

import { Context } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { AttachmentId, type ImageAttachmentRef, type ImageMediaType } from '@unieai/uad-attachment'
import { MessageId, type Message } from '@unieai/uad-llm'
import { defineTool } from '@unieai/uad-tools'

/** Public plugin configuration. */
export interface Config {
  /** Registered `llm` route the question goes to. */
  provider?: string
  /** Exact model id on that route; it must declare `image` input. */
  model?: string
  /**
   * Cap on the answer, in tokens.
   *
   * A vision model asked an open question will describe a whole screenshot;
   * the caller wanted an answer. The cap is a deployment choice because how
   * much detail is useful depends on what the surface does with it.
   */
  maxTokens?: number
  /** Cooperative tool-call budget, in milliseconds. */
  timeoutMs?: number
}

/** Configuration after Schemastery defaults. */
export type ResolvedConfig = Required<Config>

/**
 * The instruction the vision model is given alongside the caller's question.
 *
 * Written here rather than left to the caller because the failure it prevents
 * is one the caller cannot see: a vision model asked a bare question will
 * volunteer a paragraph about everything else in the frame, and the caller —
 * which never sees the image — has no way to tell the answer from the padding.
 */
const SYSTEM = 'You are answering one question about one image on behalf of another model that cannot see it. '
  + 'Answer only what was asked. State what is actually visible; if the image does not show it, say so plainly '
  + 'rather than guessing. Give positions and text verbatim when they are asked for.'

/**
 * Register `image_inspect`.
 * @param ctx - the registration scope.
 * @param config - plugin config; Schemastery defaults are already applied.
 */
export function apply(ctx: Context, config: Config = {}): void {
  // A row written with no `config:` at all arrives as undefined rather than as
  // the schema's defaults, and every field here is optional, so the default
  // parameter is what makes "mounted with nothing said" the dormant case
  // instead of a TypeError inside the loader.
  const resolved = config as ResolvedConfig
  // Mounted DORMANT when no vision route is named, the way `llm-pi-ai` is
  // mounted with no providers: a deployment that has no vision model offers no
  // `image_inspect` rather than offering one that fails every call. Naming a
  // route in settings is what brings the tool into the catalog.
  if ((resolved.provider ?? '') === '' || (resolved.model ?? '') === '') return

  ctx.inject(['attachments', 'llm', 'systemPrompt', 'tools'], (scope) => {
    scope.systemPrompt.section({
      name: 'tool:image_inspect',
      order: 113,
      text: 'Use the image_inspect tool to ask about the contents of an image you cannot see yourself. '
        + 'Pass the image object exactly as the tool that produced it reported, plus one specific question. '
        + 'It answers from a vision model and returns text, so ask for the fact you need — the text on a '
        + 'button, whether an element rendered, what a chart shows — rather than for a general description.',
    })

    scope.tools.register(defineTool({
      name: 'image_inspect',
      description: 'Ask a vision model one question about one image and get a text answer. '
        + 'Use when you need a fact from a picture you cannot read yourself.',
      timeoutMs: resolved.timeoutMs,
      parameters: {
        image: {
          type: 'object',
          required: true,
          additionalProperties: false,
          description: 'The image object exactly as the producing tool reported it.',
          properties: {
            attachmentId: { type: 'string', required: true },
            mediaType: { type: 'string', required: true },
            bytes: { type: 'number', required: true },
            width: { type: 'number', required: true },
            height: { type: 'number', required: true },
          },
        },
        question: {
          type: 'string',
          required: true,
          description: 'One specific question about the image.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            answer: { type: 'string', required: true },
            model: { type: 'string', required: true },
          },
        },
        // The route is named beside the answer: an answer about a picture is
        // only as good as the model that looked, and a caller comparing two
        // inspections needs to know whether they came from the same one.
        render: (_args, value) => [
          { type: 'text', text: `<model>${value.model}</model>\n<answer>\n${value.answer}\n</answer>` },
        ],
      },
      async execute(args, exec) {
        const llm = ctx.get('llm')
        if (llm === undefined) throw new Error('image_inspect: no llm service is mounted')
        const question = args.question.trim()
        if (question === '') throw new Error('image_inspect: question must not be empty')

        // The route must declare image input. Asking a text-only model to look
        // at a picture fails somewhere inside the provider, with a message
        // about the request rather than about the composition.
        const info = await llm.resolveModelInfo(resolved.provider, resolved.model, exec.signal)
        if (info.inputModalities === undefined || !info.inputModalities.includes('image')) {
          throw new Error(
            `image_inspect: the configured route ${resolved.provider}/${resolved.model} does not declare image input`,
          )
        }

        ctx.emit(
          'tool-image-inspect/delegated',
          `${resolved.provider}/${resolved.model}`,
          info.inputModalities.includes('image'),
        )

        const attachment: ImageAttachmentRef = {
          attachmentId: AttachmentId(args.image.attachmentId),
          mediaType: args.image.mediaType as ImageMediaType,
          bytes: args.image.bytes,
          width: args.image.width,
          height: args.image.height,
        }
        // The image is NOT downscaled here. The adapter derives a request
        // version through `attachments.readImageRequest` against the model's
        // own declared pixel and byte budget, so the shrinking happens once, at
        // the layer that knows what this model accepts, and is cached by
        // variant. Doing it here as well would shrink twice and cache neither.
        const messages: Message[] = [{
          id: MessageId(crypto.randomUUID()),
          role: 'user',
          // `plugin`, not `user`: nobody typed this, and a source that claimed
          // otherwise would put a fabricated user turn into anything reading
          // the request back.
          source: { kind: 'plugin', plugin: '@unieai/uad-tool-image-inspect' },
          content: [{ type: 'image', attachment }, { type: 'text', text: question }],
        }]

        let answer = ''
        for await (const chunk of llm.stream({
          provider: resolved.provider,
          model: resolved.model,
          system: SYSTEM,
          messages,
          maxTokens: resolved.maxTokens,
          signal: exec.signal,
        })) {
          if (chunk.type === 'text-delta') answer += chunk.text
        }
        if (answer.trim() === '') throw new Error('image_inspect: the vision model returned nothing')
        return { answer: answer.trim(), model: `${resolved.provider}/${resolved.model}` }
      },
    }))
  })
}

export const Config: z<Config> = z.object({
  provider: z.string().required(false),
  model: z.string().required(false),
  maxTokens: z.number().default(1024),
  timeoutMs: z.number().default(120_000),
})

export const inject = ['attachments', 'llm', 'tools', 'systemPrompt']

declare module '@unieai/cordis' {
  interface Events {
    /**
     * One question delegated to the vision route.
     *
     * Carries the route and whether it declared image input, so the invariant
     * beside it can check the tool's own gate rather than repeat it.
     * @param route - `provider/model` the question went to.
     * @param sawImage - whether that route declares `image` input.
     * @mode emit
     */
    'tool-image-inspect/delegated': (route: string, sawImage: boolean) => void
  }
}

export default apply
