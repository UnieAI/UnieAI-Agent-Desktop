/**
 * terminal domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** One operator terminal as it crosses the wire. */
const terminalViewSchema = z.object({
  terminalId: z.string(),
  workspaceId: z.string(),
  cwd: z.string(),
  shell: z.string(),
  title: z.string(),
  cols: z.number().int().positive(),
  rows: z.number().int().positive(),
  live: z.boolean(),
  exitCode: z.number().int().optional(),
})

/** A terminal plus the output retained for it. */
const terminalOpenedSchema = z.object({
  terminal: terminalViewSchema,
  replay: z.string(),
})

/** Signals the GUI may deliver. */
const terminalSignalSchema = z.union([
  z.literal('SIGINT'),
  z.literal('SIGTERM'),
  z.literal('SIGQUIT'),
  z.literal('SIGTSTP'),
])

/** terminal.list request payload (empty object literal). */
export const terminalListRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'terminal.list'>>>

/** terminal.list response value. */
export const terminalListValueSchema = z.object({
  terminals: z.array(terminalViewSchema),
}) satisfies z.ZodType<Wire<ResponseValue<'terminal.list'>>>

/** terminal.open request payload. */
export const terminalOpenRequestSchema = z.object({
  workspaceId: z.string(),
  cwd: z.string(),
  cols: z.number(),
  rows: z.number(),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.open'>>>

/** terminal.open response value. */
export const terminalOpenValueSchema = terminalOpenedSchema satisfies z.ZodType<Wire<ResponseValue<'terminal.open'>>>

/** terminal.replay request payload. */
export const terminalReplayRequestSchema = z.object({
  terminalId: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.replay'>>>

/** terminal.replay response value. */
export const terminalReplayValueSchema = terminalOpenedSchema satisfies z.ZodType<Wire<ResponseValue<'terminal.replay'>>>

/** terminal.write request payload. */
export const terminalWriteRequestSchema = z.object({
  terminalId: z.string(),
  data: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.write'>>>

/** terminal.write response value (empty object literal). */
export const terminalWriteValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'terminal.write'>>>

/** terminal.resize request payload. */
export const terminalResizeRequestSchema = z.object({
  terminalId: z.string(),
  cols: z.number(),
  rows: z.number(),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.resize'>>>

/** terminal.resize response value (empty object literal). */
export const terminalResizeValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'terminal.resize'>>>

/** terminal.signal request payload. */
export const terminalSignalRequestSchema = z.object({
  terminalId: z.string(),
  signal: terminalSignalSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.signal'>>>

/** terminal.signal response value (empty object literal). */
export const terminalSignalValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'terminal.signal'>>>

/** terminal.close request payload. */
export const terminalCloseRequestSchema = z.object({
  terminalId: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'terminal.close'>>>

/** terminal.close response value (empty object literal). */
export const terminalCloseValueSchema = z.object({}) satisfies z.ZodType<Wire<ResponseValue<'terminal.close'>>>
