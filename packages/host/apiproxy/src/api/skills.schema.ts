/**
 * skills domain zod schemas (names derived from map keys: skillListRequestSchema /
 * skillListValueSchema).
 */

import { z } from 'zod'
import type { RequestPayload, ResponseValue } from './rpc-map.ts'
import type { Wire } from './rpc.schema.ts'
import { sessionIdSchema } from './sessions.schema.ts'
import type { SkillCatalogEntry, SkillEntry } from './skills.ts'

/** SkillEntry row of skill.list. */
export const skillEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  whenToUse: z.string().optional(),
  modelInvocable: z.boolean(),
}) satisfies z.ZodType<Wire<SkillEntry>>

/** skill.list request payload. */
export const skillListRequestSchema = z.object({
  sessionId: sessionIdSchema,
}) satisfies z.ZodType<Wire<RequestPayload<'skill.list'>>>

/** skill.list response value. */
export const skillListValueSchema = z.object({
  skills: z.array(skillEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'skill.list'>>>

/** SkillCatalogEntry row of skill.catalog. */
export const skillCatalogEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  whenToUse: z.string().optional(),
  modelInvocable: z.boolean(),
  source: z.string(),
  provider: z.string(),
  path: z.string().optional(),
  userInvocable: z.boolean(),
}) satisfies z.ZodType<Wire<SkillCatalogEntry>>

/** skill.catalog request payload; an absent cwd leaves out project skills. */
export const skillCatalogRequestSchema = z.object({
  cwd: z.string().optional(),
}) satisfies z.ZodType<Wire<RequestPayload<'skill.catalog'>>>

/** skill.catalog response value. */
export const skillCatalogValueSchema = z.object({
  skills: z.array(skillCatalogEntrySchema),
}) satisfies z.ZodType<Wire<ResponseValue<'skill.catalog'>>>
