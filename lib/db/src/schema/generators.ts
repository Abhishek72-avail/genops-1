import { pgTable, text, serial, timestamp, real, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const generatorsTable = pgTable("generators", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  tDate: text("t_date").notNull(),
  generatorId: text("generator_id").notNull(),
  status: text("status").notNull(),
  rating: text("rating"),
  hours: real("hours"),
  remarks: text("remarks"),
  deliveryStatus: text("delivery_status"),
  deliveryTo: text("delivery_to"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertGeneratorSchema = createInsertSchema(generatorsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertGenerator = z.infer<typeof insertGeneratorSchema>;
export type Generator = typeof generatorsTable.$inferSelect;
