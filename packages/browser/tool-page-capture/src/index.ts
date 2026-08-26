/**
 * `page_screenshot`: the model asks what a web page looks like.
 *
 * A tool rather than a service with providers: there is one way to photograph a
 * page — drive a real browser — and one consumer, this tool. A Service
 * Definition with a single provider and a single consumer would be ceremony
 * around a function.
 *
 * DELIBERATELY SEPARATE from `ctx.operatorBrowsers`, which is the browser a
 * PERSON drives. That one is loopback-pinned, workspace-scoped and outlives the
 * panel showing it, none of which a model-facing screenshot wants; this one
 * launches a browser for one call and throws it away. They share the launch and
 * CDP plumbing and nothing else.
 * @module @unieai/uad-tool-page-capture
 */

import { Context } from '@unieai/cordis'
import z from '@unieai/schemastery'
import { defineTool } from '@unieai/uad-tools'
import type { ContentBlock } from '@unieai/uad-llm'
import { AttachmentId } from '@unieai/uad-attachment'
import { FILESYSTEM_CHROME_PROBE } from '@unieai/uad-browser-operator'
import type { ChromeProbe } from '@unieai/uad-browser-operator/chromium'
import { CaptureError, capturePage } from './capture.ts'

export { CaptureError, capturePage, assertCapturable } from './capture.ts'
export type { CaptureRequest, CaptureResult } from './capture.ts'

/** Public plugin configuration. */
export interface Config {
  /** Viewport width the page is rendered at, in CSS pixels. */
  width?: number
  /** Viewport height, and the picture's height unless `fullPage` is asked for. */
  height?: number
  /**
   * How long to let a page paint before shooting, in milliseconds.
   *
   * A load event is not a painted page: fonts swap, images decode, and a
   * framework's first render lands after it. The wait is a deployment choice
   * because it trades a slower tool against blank screenshots.
   */
  settleMs?: number
  /** How long to wait for the browser to start, in seconds. */
  startupTimeoutSeconds?: number
  /** Cooperative tool-call budget, in milliseconds. */
  timeoutMs?: number
}

/** Configuration after Schemastery defaults. */
export type ResolvedConfig = Required<Config>

/**
 * Register `page_screenshot`.
 *
 * Injects `attachments` because the picture must become a durable reference
 * before it can ride a message: a tool that returned bytes inline would put a
 * megabyte of base64 into the session log for every call.
 * @param ctx - the registration scope.
 * @param config - plugin config; Schemastery defaults are already applied.
 * @param probe - filesystem probe used to find a browser; injectable for tests.
 */
export function apply(ctx: Context, config: Config = {}, probe: ChromeProbe = FILESYSTEM_CHROME_PROBE): void {
  // A row with no `config:` arrives as undefined, not as the schema's
  // defaults; the fallbacks below are what the deployment gets then.
  const given = config as Partial<ResolvedConfig>
  const resolved: ResolvedConfig = {
    width: given.width ?? 1280,
    height: given.height ?? 800,
    settleMs: given.settleMs ?? 1200,
    startupTimeoutSeconds: given.startupTimeoutSeconds ?? 30,
    timeoutMs: given.timeoutMs ?? 60_000,
  }
  ctx.inject(['attachments', 'systemPrompt', 'tools'], (scope) => {
    scope.systemPrompt.section({
      name: 'tool:page_screenshot',
      order: 112,
      text: 'Use the page_screenshot tool to see what a web page looks like. '
        + 'It renders the address in a real browser and returns the picture, which is what to use when the '
        + 'ANSWER depends on layout, styling, or what is visible — a manual that needs an illustration, a '
        + 'check that a page renders. For the page\'s text or data, web_fetch is cheaper and more accurate.',
    })

    scope.tools.register(defineTool({
      name: 'page_screenshot',
      description: 'Render a web page in a browser and return a picture of it. '
        + 'Use for questions about appearance or layout; use web_fetch for text.',
      timeoutMs: resolved.timeoutMs,
      parameters: {
        url: {
          type: 'string',
          required: true,
          description: 'Absolute http or https address to photograph.',
        },
        fullPage: {
          type: 'boolean',
          description: 'Capture the whole document instead of just the first screen. Defaults to false.',
        },
      },
      output: {
        schema: {
          type: 'object',
          additionalProperties: false,
          properties: {
            url: { type: 'string', required: true },
            title: { type: 'string', required: true },
            width: { type: 'number', required: true },
            height: { type: 'number', required: true },
            image: {
              type: 'object',
              required: true,
              additionalProperties: false,
              properties: {
                attachmentId: { type: 'string', required: true },
                mediaType: { type: 'string', required: true },
                bytes: { type: 'number', required: true },
                width: { type: 'number', required: true },
                height: { type: 'number', required: true },
              },
            },
          },
        },
        // The envelope names what the picture is; the picture rides the block
        // beside it, by reference, so the session log carries an id and not a
        // megabyte of base64.
        render: (_args, value): ContentBlock[] => [
          {
            type: 'text',
            text: `<url>${value.url}</url>\n<title>${value.title}</title>\n<content>\nPNG screenshot, ${String(value.width)}x${String(value.height)} px\n</content>`,
          },
          {
            type: 'image',
            attachment: {
              attachmentId: AttachmentId(value.image.attachmentId),
              mediaType: 'image/png',
              bytes: value.image.bytes,
              width: value.image.width,
              height: value.image.height,
            },
          },
        ],
      },
      async execute(args, exec) {
        const attachments = ctx.get('attachments')
        if (attachments === undefined) throw new Error('page_screenshot needs a durable attachment store')
        try {
          const shot = await capturePage({
            url: args.url,
            width: resolved.width,
            height: resolved.height,
            fullPage: args.fullPage === true,
            settleMs: resolved.settleMs,
            startupTimeoutSeconds: resolved.startupTimeoutSeconds,
          }, probe)
          exec.signal.throwIfAborted()
          const [ref] = await attachments.saveImages([
            { data: shot.png, mediaType: 'image/png', name: `${new URL(shot.url).hostname}.png` },
          ])
          if (ref === undefined) throw new Error('page_screenshot: the attachment store returned no reference')
          ctx.emit('tool-page-capture/captured', ref.attachmentId, ref.width, ref.height, ref.bytes)
          return {
            url: shot.url,
            title: shot.title,
            width: shot.width,
            height: shot.height,
            image: {
              attachmentId: ref.attachmentId,
              mediaType: ref.mediaType,
              bytes: ref.bytes,
              width: ref.width,
              height: ref.height,
            },
          }
        } catch (error: unknown) {
          // The codes are the ones a person can act on — a machine with no
          // browser, an address this tool refuses, a page that would not load —
          // so each keeps its own wording rather than collapsing into one.
          if (error instanceof CaptureError) throw new Error(`page_screenshot: ${error.message}`)
          throw error
        }
      },
    }))
  })
}

export const Config: z<Config> = z.object({
  width: z.number().default(1280),
  height: z.number().default(800),
  settleMs: z.number().default(1200),
  startupTimeoutSeconds: z.number().default(30),
  timeoutMs: z.number().default(60_000),
})

export const inject = ['attachments', 'tools', 'systemPrompt']

declare module '@unieai/cordis' {
  interface Events {
    /**
     * One capture published to the model.
     *
     * Carries what the block beside the picture claims, so an invariant can
     * check the claim against the reference without reaching into the store.
     * @param attachmentId - the stored image's identity.
     * @param width - encoded width in pixels.
     * @param height - encoded height in pixels.
     * @param bytes - encoded byte length.
     * @mode emit
     */
    'tool-page-capture/captured': (attachmentId: string, width: number, height: number, bytes: number) => void
  }
}

export default apply
