import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";

export async function writeAuditEvent(input: {
  organizationId: string;
  applicationId?: string;
  actorUserId?: string;
  action: string;
  targetType: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Prisma.InputJsonValue;
}): Promise<void> {
  await db.auditEvent.create({
    data: {
      organizationId: input.organizationId,
      applicationId: input.applicationId,
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      metadata: input.metadata ?? {},
    },
  });
}
