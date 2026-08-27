/**
 * host domain zod schemas (names derived from map keys).
 */

import { z } from 'zod'
import type { DirectoryEntry } from './host.ts'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'

/** host.describe request payload (empty object literal). */
export const hostDescribeRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'host.describe'>>>

/** host.describe response value. */
export const hostDescribeValueSchema = z.object({
  version: z.string(),
  cwd: z.string(),
  provider: z.string().optional(),
  model: z.string().optional(),
  attachedSessions: z.number().int().nonnegative(),
  home: z.string(),
  canOpenPath: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.describe'>>>

/** host.pickDirectory request payload (empty object literal). */
export const hostPickDirectoryRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'host.pickDirectory'>>>

/** host.pickDirectory response value; null means the user cancelled. */
export const hostPickDirectoryValueSchema = z.object({
  path: z.string().nullable(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.pickDirectory'>>>

/** Directory row shared by listing entries and breadcrumb crumbs. */
export const directoryEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  hidden: z.boolean(),
}) satisfies z.ZodType<Wire<DirectoryEntry>>

/** host.listDirectory request payload; an absent path lists the home directory. */
export const hostListDirectoryRequestSchema = z.object({
  path: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.listDirectory'>>>

/** host.listDirectory response value. */
export const hostListDirectoryValueSchema = z.object({
  path: z.string(),
  home: z.string(),
  crumbs: z.array(directoryEntrySchema),
  entries: z.array(directoryEntrySchema),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.listDirectory'>>>

/** One child of a listed workspace directory. */
const workspaceEntrySchema = z.object({
  name: z.string(),
  path: z.string(),
  kind: z.union([z.literal('file'), z.literal('directory'), z.literal('other')]),
  size: z.number().optional(),
})

/** One machine, as a page sees it. */
const machineEntrySchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.union([z.literal('local'), z.literal('ssh')]),
  source: z.string().optional(),
})

/** host.listMachines request payload: the list takes no arguments. */
export const hostListMachinesRequestSchema = z.object({}) satisfies z.ZodType<Wire<RequestPayload<'host.listMachines'>>>

/** host.listMachines response value, shared with host.selectMachine. */
export const hostMachineListValueSchema = z.object({
  machines: z.array(machineEntrySchema),
  current: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.listMachines'>>>

/** host.addMachine request payload; only `alias` is required. */
export const hostAddMachineRequestSchema = z.object({
  alias: z.string(),
  hostName: z.string().optional(),
  user: z.string().optional(),
  port: z.number().optional(),
  identityFile: z.string().optional(),
  proxyJump: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.addMachine'>>>

/** host.removeMachine request payload. */
export const hostRemoveMachineRequestSchema = z.object({
  machine: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.removeMachine'>>>

/** host.probeMachine request payload. */
export const hostProbeMachineRequestSchema = z.object({
  machine: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.probeMachine'>>>

/** host.probeMachine response value. */
export const hostProbeMachineValueSchema = z.object({
  reachable: z.boolean(),
  message: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.probeMachine'>>>

/** host.selectMachine request payload. */
export const hostSelectMachineRequestSchema = z.object({
  machine: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.selectMachine'>>>

/** host.listWorkspaceEntries request payload; an absent path lists the root itself. */
export const hostListWorkspaceEntriesRequestSchema = z.object({
  root: z.string(),
  path: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.listWorkspaceEntries'>>>

/** host.listWorkspaceEntries response value. */
export const hostListWorkspaceEntriesValueSchema = z.object({
  root: z.string(),
  path: z.string(),
  entries: z.array(workspaceEntrySchema),
  truncated: z.boolean(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.listWorkspaceEntries'>>>

/** host.writeWorkspaceFile request payload; `expected` is the text the editor started from. */
export const hostWriteWorkspaceFileRequestSchema = z.object({
  root: z.string(),
  path: z.string(),
  text: z.string(),
  version: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.writeWorkspaceFile'>>>

/** host.writeWorkspaceFile response value. */
export const hostWriteWorkspaceFileValueSchema = z.object({
  version: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.writeWorkspaceFile'>>>

/** host.readWorkspaceFile request payload. */
export const hostReadWorkspaceFileRequestSchema = z.object({
  root: z.string(),
  path: z.string(),
}) satisfies z.ZodType<Wire<RequestPayload<'host.readWorkspaceFile'>>>

/** host.readWorkspaceFile response value. */
export const hostReadWorkspaceFileValueSchema = z.object({
  root: z.string(),
  path: z.string(),
  text: z.string().optional(),
  size: z.number(),
  version: z.string().optional(),
  reason: z.union([z.literal('too-large'), z.literal('binary')]).optional(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.readWorkspaceFile'>>>

/** host.createDirectory request payload: name must be one plain path segment. */
export const hostCreateDirectoryRequestSchema = z.object({
  path: z.string(),
  name: z.string(),
}).refine(
  payload => payload.name.trim() !== '' && payload.name !== '.' && payload.name !== '..'
    && !/[/\\]/.test(payload.name),
  { message: 'host.createDirectory requires a single non-blank path segment name' },
) satisfies z.ZodType<Wire<RequestPayload<'host.createDirectory'>>>

/** host.createDirectory response value: the created directory's absolute path. */
export const hostCreateDirectoryValueSchema = z.object({
  path: z.string(),
}) satisfies z.ZodType<Wire<ResponseValue<'host.createDirectory'>>>
/** host.openPath request payload. */
export const hostOpenPathRequestSchema = z.object({
  path: z.string().min(1),
}) satisfies z.ZodType<Wire<RequestPayload<'host.openPath'>>>

/** host.openPath response value. */
export const hostOpenPathValueSchema = z.object({
  opened: z.literal(true),
}) satisfies z.ZodType<Wire<ResponseValue<'host.openPath'>>>
