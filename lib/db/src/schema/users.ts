import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  sheetLink: text("sheet_link").notNull(),
  customPanels: text("custom_panels"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const demoUsersTable = pgTable("demo_users", {
  id: serial("id").primaryKey(),
  adminId: integer("admin_id").references(() => usersTable.id, { onDelete: "cascade" }).notNull(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  permissions: text("permissions").notNull(), // "view" | "edit"
  isActive: boolean("is_active").notNull().default(true),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type DemoUser = typeof demoUsersTable.$inferSelect;

