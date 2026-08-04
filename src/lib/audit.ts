import { prisma } from "./db";
import { logger } from "./logger";

/** 操作审计（P1 #40）：失败不阻塞主流程 */
export async function audit(actor: string, action: string, target?: string, detail?: string): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { actor, action, target, detail: detail?.slice(0, 500) },
    });
  } catch (e) {
    logger.warn({ err: String(e), action }, "audit log failed");
  }
}
