import { varchar } from "drizzle-orm/pg-core";
import { decimal } from "drizzle-orm/pg-core";
import { integer, timestamp } from "drizzle-orm/pg-core";
import { pgTable } from "drizzle-orm/pg-core";

export const orderTable = pgTable("orders", {
  id: integer().primaryKey().generatedAlwaysAsIdentity(),
  orderId: varchar({ length: 255 }).notNull().unique(),
  inputToken: varchar({ length: 255 }).notNull(),
  outputToken: varchar({ length: 255 }).notNull(),
  amount: integer().notNull(),
  orderStatus: varchar({ length: 255 }).notNull(),
  venue: varchar({ length: 255 }),
  price: varchar({ length: 255 }),
  created_at: timestamp().defaultNow().notNull(),
  updated_at: timestamp(),
});
