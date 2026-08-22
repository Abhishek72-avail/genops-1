import { Router, type IRouter } from "express";
import { eq, ne, ilike, and, gte, lte, or } from "drizzle-orm";
import { db, generatorsTable, usersTable, demoUsersTable } from "@workspace/db";
import {
  ListGeneratorsQueryParams,
  CreateGeneratorBody,
  GetGeneratorParams,
  UpdateGeneratorParams,
  UpdateGeneratorBody,
  DeleteGeneratorParams,
} from "@workspace/api-zod";
import { syncSheetFromDb, extractSpreadsheetId } from "../lib/sheets";
import { logger } from "../lib/logger";

const router: IRouter = Router();

async function requireAuth(req: any, res: any): Promise<number | null> {
  const userId = (req.session as Record<string, unknown>).userId as number | undefined;
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return null;
  }

  // If this is a demo user, dynamically check database status and expiration
  if ((req.session as any).isDemoUser) {
    const demoUserId = (req.session as any).demoUserId;
    const [demoUser] = await db.select().from(demoUsersTable).where(eq(demoUsersTable.id, demoUserId));
    if (!demoUser || !demoUser.isActive || (demoUser.expiresAt && new Date() > new Date(demoUser.expiresAt))) {
      req.session.destroy(() => {});
      res.status(401).json({ error: "Your demo session has expired or been deactivated" });
      return null;
    }
  }

  return userId;
}

function requireWritePermission(req: any, res: any): boolean {
  if (req.session.isDemoUser && req.session.demoPermissions !== "edit") {
    res.status(403).json({ error: "Write access denied. You only have view-only permissions." });
    return false;
  }
  return true;
}

async function getAllRowsForSync(userId: number) {
  return db
    .select()
    .from(generatorsTable)
    .where(eq(generatorsTable.userId, userId))
    .orderBy(generatorsTable.tDate, generatorsTable.generatorId);
}

async function triggerSheetsSync(userId: number) {
  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    if (user && user.sheetLink) {
      const spreadsheetId = extractSpreadsheetId(user.sheetLink);
      const rows = await getAllRowsForSync(userId);
      await syncSheetFromDb(rows, spreadsheetId, user.customPanels);
    }
  } catch (err) {
    logger.error({ err }, "Error in triggerSheetsSync");
  }
}

router.get("/generators", async (req, res): Promise<void> => {
  const userId = await requireAuth(req, res);
  if (userId === null) return;

  const qp = ListGeneratorsQueryParams.safeParse(req.query);
  if (!qp.success) {
    res.status(400).json({ error: qp.error.message });
    return;
  }

  const { search, status, generatorId, dateFrom, dateTo } = qp.data;
  const conditions = [eq(generatorsTable.userId, userId)];

  if (status) conditions.push(eq(generatorsTable.status, status));
  if (generatorId) conditions.push(ilike(generatorsTable.generatorId, `%${generatorId}%`));
  if (dateFrom) conditions.push(gte(generatorsTable.tDate, dateFrom));
  if (dateTo) conditions.push(lte(generatorsTable.tDate, dateTo));
  if (search) {
    conditions.push(
      or(
        ilike(generatorsTable.generatorId, `%${search}%`),
        ilike(generatorsTable.tDate, `%${search}%`),
        ilike(generatorsTable.remarks, `%${search}%`)
      )!
    );
  }

  const rows = await db
    .select()
    .from(generatorsTable)
    .where(and(...conditions))
    .orderBy(generatorsTable.tDate, generatorsTable.generatorId);

  res.json(rows.map(r => ({
    ...r,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  })));
});

router.get("/generators/stats", async (req, res): Promise<void> => {
  const userId = await requireAuth(req, res);
  if (userId === null) return;

  const all = await db.select().from(generatorsTable).where(eq(generatorsTable.userId, userId));
  const total = all.length;

  const statusMap: Record<string, number> = {};
  let hoursSum = 0;
  let hoursCount = 0;

  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const recentCutoff = sevenDaysAgo.toISOString().split("T")[0];
  let recentCount = 0;

  for (const r of all) {
    statusMap[r.status] = (statusMap[r.status] ?? 0) + 1;
    if (r.hours != null) {
      hoursSum += r.hours;
      hoursCount++;
    }
    if (r.tDate >= recentCutoff) recentCount++;
  }

  const byStatus = Object.entries(statusMap).map(([status, count]) => ({ status, count }));
  const avgHours = hoursCount > 0 ? Math.round((hoursSum / hoursCount) * 10) / 10 : null;
  const currentDelivery = all.filter((r) => r.deliveryStatus === "current").length;
  const previousDelivery = all.filter((r) => r.deliveryStatus === "previous").length;
 // const previousDelivery = all.filter((r) => r.deliveryStatus === "previous" || r.deliveryStatus === "previous_log").length;

  res.json({ total, byStatus, avgHours, recentCount, currentDelivery, previousDelivery });
});

router.post("/generators", async (req, res): Promise<void> => {
  const userId = await requireAuth(req, res);
  if (userId === null) return;
  if (!requireWritePermission(req, res)) return;

  const parsed = CreateGeneratorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  // Check if a generator with the same generatorId already exists for this user
  const existing = await db
    .select()
    .from(generatorsTable)
    .where(
      and(
        eq(generatorsTable.userId, userId),
        ilike(generatorsTable.generatorId, parsed.data.generatorId.trim())
      )
    );
  if (existing.length > 0) {
    res.status(400).json({ error: "This genset ID is already exists" });
    return;
  }

  const [record] = await db
    .insert(generatorsTable)
    .values({ ...parsed.data, userId })
    .returning();

  // Rebuild sheet from user's isolated DB state asynchronously
  triggerSheetsSync(userId).catch(() => {});

  res.status(201).json({
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
});

router.get("/generators/:id", async (req, res): Promise<void> => {
  const userId = await requireAuth(req, res);
  if (userId === null) return;

  const params = GetGeneratorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [record] = await db
    .select()
    .from(generatorsTable)
    .where(and(eq(generatorsTable.id, params.data.id), eq(generatorsTable.userId, userId)));

  if (!record) {
    res.status(404).json({ error: "Generator record not found" });
    return;
  }

  res.json({
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
});

router.patch("/generators/:id", async (req, res): Promise<void> => {
  const userId = await requireAuth(req, res);
  if (userId === null) return;
  if (!requireWritePermission(req, res)) return;

  const params = UpdateGeneratorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateGeneratorBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (parsed.data.generatorId) {
    const existing = await db
      .select()
      .from(generatorsTable)
      .where(
        and(
          eq(generatorsTable.userId, userId),
          ilike(generatorsTable.generatorId, parsed.data.generatorId.trim()),
          ne(generatorsTable.id, params.data.id)
        )
      );
    if (existing.length > 0) {
      res.status(400).json({ error: "This genset ID is already exists" });
      return;
    }
  }

  const [record] = await db
    .update(generatorsTable)
    .set(parsed.data)
    .where(and(eq(generatorsTable.id, params.data.id), eq(generatorsTable.userId, userId)))
    .returning();

  if (!record) {
    res.status(404).json({ error: "Generator record not found" });
    return;
  }

  // Rebuild sheet from user's isolated DB state asynchronously
  triggerSheetsSync(userId).catch(() => {});

  res.json({
    ...record,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  });
});

router.delete("/generators/:id", async (req, res): Promise<void> => {
  const userId = await requireAuth(req, res);
  if (userId === null) return;
  if (!requireWritePermission(req, res)) return;

  const params = DeleteGeneratorParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [record] = await db
    .delete(generatorsTable)
    .where(and(eq(generatorsTable.id, params.data.id), eq(generatorsTable.userId, userId)))
    .returning();

  if (!record) {
    res.status(404).json({ error: "Generator record not found" });
    return;
  }

  // Rebuild sheet from remaining DB rows asynchronously
  triggerSheetsSync(userId).catch(() => {});

  res.json({ message: "Deleted" });
});

export default router;
