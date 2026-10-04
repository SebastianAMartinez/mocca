CREATE TABLE "shared_space" (
	"id" text PRIMARY KEY,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shared_space_invitation" (
	"id" text PRIMARY KEY,
	"code_hash" text NOT NULL,
	"created_by" text NOT NULL,
	"accepted_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "shared_space_membership" (
	"space_id" text,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shared_space_membership_pkey" PRIMARY KEY("space_id","user_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "shared_space_invitation_code_hash_unique" ON "shared_space_invitation" ("code_hash");--> statement-breakpoint
CREATE INDEX "shared_space_invitation_created_by_idx" ON "shared_space_invitation" ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "shared_space_membership_user_id_unique" ON "shared_space_membership" ("user_id");--> statement-breakpoint
ALTER TABLE "shared_space_invitation" ADD CONSTRAINT "shared_space_invitation_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shared_space_invitation" ADD CONSTRAINT "shared_space_invitation_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by") REFERENCES "user"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "shared_space_membership" ADD CONSTRAINT "shared_space_membership_space_id_shared_space_id_fkey" FOREIGN KEY ("space_id") REFERENCES "shared_space"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shared_space_membership" ADD CONSTRAINT "shared_space_membership_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE RESTRICT;