CREATE TABLE "profile_introduction" (
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY NOT NULL,
	"profile_id" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "profile_introduction" ADD CONSTRAINT "profile_introduction_profile_id_github_profile_id_fk" FOREIGN KEY ("profile_id") REFERENCES "public"."github_profile"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "profile_introduction_profile_id_idx" ON "profile_introduction" USING btree ("profile_id");