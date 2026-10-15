CREATE TABLE "email"."opt_out" (
	"brand_id" text NOT NULL,
	"email" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "opt_out_brand_id_email_pk" PRIMARY KEY("brand_id","email")
);
--> statement-breakpoint
ALTER TABLE "email"."opt_out" ADD CONSTRAINT "opt_out_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;