CREATE TABLE "orders" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"orderId" varchar(255) NOT NULL,
	"inputToken" varchar(255) NOT NULL,
	"outputToken" varchar(255) NOT NULL,
	"amount" integer NOT NULL,
	"orderStatus" varchar(255) NOT NULL,
	"venue" varchar(255),
	"price" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp,
	CONSTRAINT "orders_orderId_unique" UNIQUE("orderId")
);
