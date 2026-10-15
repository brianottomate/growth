CREATE TABLE "performance_booking" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"website_id" text NOT NULL,
	"property_id" text NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	"check_in" date,
	"check_out" date,
	"currency" text NOT NULL,
	"total" numeric(16, 2) NOT NULL,
	"revenue" numeric(16, 2),
	"attribution" jsonb NOT NULL,
	"confidence" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"classified_at" timestamp with time zone,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "performance_booking" ADD CONSTRAINT "performance_booking_account_id_performance_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."performance_account"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "performance_booking_account_time_idx" ON "performance_booking" USING btree ("account_id","confirmed_at");