import { z } from "zod";

export const AuditEntryResponse = z.object({
  id: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  actorUserId: z.string().nullable(),
  occurredAt: z.string().datetime(),
  requestId: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
});

export type AuditEntryResponse = z.infer<typeof AuditEntryResponse>;
