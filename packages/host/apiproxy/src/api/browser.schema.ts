/**
 * browser domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** One operator browser as it crosses the wire. */
const browserViewSchema = z.object({
  browserId: z.string(),
  workspaceId: z.string(),
  url: z.string(),
  title: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  live: z.boolean(),
})

/** A browser plus its most recent frame. */
const browserOpenedSchema = z.object({
  browser: browserViewSchema,
  frame: z.string().optional(),
})

/** browser.list request payload (empty object literal). */
export const browserListRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'browser.list'>>>

/** browser.list response value. */
export const browserListValueSchema = z.object({
  browsers: z.array(browserViewSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'browser.list'>>>

/** browser.open request payload. */
export const browserOpenRequestSchema = z.object({
  workspaceId: z.string(),
  url: z.string(),
  width: z.number(),
  height: z.number(),
}) satisfies z.ZodType<Wire<RequestPayload<'browser.open'>>>

/** browser.open response value. */
export const browserOpenValueSchema = browserOpenedSchema satisfies z.ZodType<Wire<ResponseValue<'browser.open'>>>

/** browser.replay request payload. */
export const browserReplayRequestSchema = z.object({
  browserId: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'browser.replay'>>>

/** browser.replay response value. */
export const browserReplayValueSchema = browserOpenedSchema satisfies z.ZodType<Wire<ResponseValue<'browser.replay'>>>

/** browser.navigate request payload. */
export const browserNavigateRequestSchema = z.object({
  browserId: z.string(),
  url: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'browser.navigate'>>>

/** browser.navigate response value (empty object literal). */
export const browserNavigateValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'browser.navigate'>>>

/** browser.pointer request payload. */
export const browserPointerRequestSchema = z.object({
  browserId: z.string(),
  type: z.union([
    z.literal('mousePressed'), z.literal('mouseReleased'),
    z.literal('mouseMoved'), z.literal('mouseWheel'),
  ]),
  x: z.number(),
  y: z.number(),
  deltaX: z.number().optional(),
  deltaY: z.number().optional(),
  clickCount: z.number().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'browser.pointer'>>>

/** browser.pointer response value (empty object literal). */
export const browserPointerValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'browser.pointer'>>>

/** browser.key request payload. */
export const browserKeyRequestSchema = z.object({
  browserId: z.string(),
  type: z.union([z.literal('keyDown'), z.literal('keyUp'), z.literal('char')]),
  key: z.string().optional(),
  code: z.string().optional(),
  text: z.string().optional(),
  modifiers: z.number().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'browser.key'>>>

/** browser.key response value (empty object literal). */
export const browserKeyValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'browser.key'>>>

/** browser.resize request payload. */
export const browserResizeRequestSchema = z.object({
  browserId: z.string(),
  width: z.number(),
  height: z.number(),
}) satisfies z.ZodType<Wire<RequestPayload<'browser.resize'>>>

/** browser.resize response value (empty object literal). */
export const browserResizeValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'browser.resize'>>>

/** browser.close request payload. */
export const browserCloseRequestSchema = z.object({
  browserId: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'browser.close'>>>

/** browser.close response value (empty object literal). */
export const browserCloseValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'browser.close'>>>
