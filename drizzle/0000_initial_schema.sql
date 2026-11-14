CREATE TABLE "day_boundary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"date" date NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"overnight_place_id" text,
	"overnight_place_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_boundary_trip_day_unique" UNIQUE("trip_id","day_number"),
	CONSTRAINT "day_boundary_day_check" CHECK ("day_boundary"."day_number" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "day_boundary" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "day_segment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_revision_id" uuid NOT NULL,
	"day_number" integer NOT NULL,
	"activities" jsonb NOT NULL,
	"routes" jsonb NOT NULL,
	"transport_legs" jsonb,
	"starting_from" text NOT NULL,
	"ending_at" text,
	"snapshot_json" jsonb NOT NULL,
	"events_json" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "day_segment_revision_day_unique" UNIQUE("trip_revision_id","day_number"),
	CONSTRAINT "day_segment_day_check" CHECK ("day_segment"."day_number" between 1 and 7)
);
--> statement-breakpoint
ALTER TABLE "day_segment" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "planning_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"status" text NOT NULL,
	"events_json" jsonb NOT NULL,
	"result_json" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "planning_run" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trip" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"mode" text DEFAULT 'fixture' NOT NULL,
	"destination" text NOT NULL,
	"origin" text,
	"party_size" integer DEFAULT 1 NOT NULL,
	"preference" text NOT NULL,
	"constraints" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "trip_status_check" CHECK ("trip"."status" in ('draft', 'planned', 'accepted', 'archived')),
	CONSTRAINT "trip_party_size_check" CHECK ("trip"."party_size" between 1 and 20)
);
--> statement-breakpoint
ALTER TABLE "trip" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "trip_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"trip_id" uuid NOT NULL,
	"planning_run_id" uuid,
	"revision_number" integer NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_revision_trip_number_unique" UNIQUE("trip_id","revision_number")
);
--> statement-breakpoint
ALTER TABLE "trip_revision" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" uuid PRIMARY KEY NOT NULL,
	"display_name" text,
	"theme_preference" text DEFAULT 'system' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_theme_check" CHECK ("user_profile"."theme_preference" in ('light', 'dark', 'system'))
);
--> statement-breakpoint
ALTER TABLE "user_profile" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "day_boundary" ADD CONSTRAINT "day_boundary_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "day_segment" ADD CONSTRAINT "day_segment_trip_revision_id_trip_revision_id_fk" FOREIGN KEY ("trip_revision_id") REFERENCES "public"."trip_revision"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_run" ADD CONSTRAINT "planning_run_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip" ADD CONSTRAINT "trip_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_revision" ADD CONSTRAINT "trip_revision_trip_id_trip_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trip"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_revision" ADD CONSTRAINT "trip_revision_planning_run_id_planning_run_id_fk" FOREIGN KEY ("planning_run_id") REFERENCES "public"."planning_run"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "planning_run_trip_idx" ON "planning_run" USING btree ("trip_id","created_at");--> statement-breakpoint
CREATE INDEX "trip_owner_idx" ON "trip" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE POLICY "day_boundary_via_trip" ON "day_boundary" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from "trip" where "trip"."id" = "day_boundary"."trip_id" and "trip"."owner_id" = (select auth.uid()))) WITH CHECK (exists (select 1 from "trip" where "trip"."id" = "day_boundary"."trip_id" and "trip"."owner_id" = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "day_segment_via_revision" ON "day_segment" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from "trip_revision" where "trip_revision"."id" = "day_segment"."trip_revision_id" and exists (select 1 from "trip" where "trip"."id" = "trip_revision"."trip_id" and "trip"."owner_id" = (select auth.uid())))) WITH CHECK (exists (select 1 from "trip_revision" where "trip_revision"."id" = "day_segment"."trip_revision_id" and exists (select 1 from "trip" where "trip"."id" = "trip_revision"."trip_id" and "trip"."owner_id" = (select auth.uid()))));--> statement-breakpoint
CREATE POLICY "planning_run_owner_read" ON "planning_run" AS PERMISSIVE FOR SELECT TO "authenticated" USING (exists (select 1 from "trip" where "trip"."id" = "planning_run"."trip_id" and "trip"."owner_id" = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "planning_run_owner_insert" ON "planning_run" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (exists (select 1 from "trip" where "trip"."id" = "planning_run"."trip_id" and "trip"."owner_id" = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "trip_owner_all" ON "trip" AS PERMISSIVE FOR ALL TO "authenticated" USING ("trip"."owner_id" = (select auth.uid())) WITH CHECK ("trip"."owner_id" = (select auth.uid()));--> statement-breakpoint
CREATE POLICY "trip_revision_via_trip" ON "trip_revision" AS PERMISSIVE FOR ALL TO "authenticated" USING (exists (select 1 from "trip" where "trip"."id" = "trip_revision"."trip_id" and "trip"."owner_id" = (select auth.uid()))) WITH CHECK (exists (select 1 from "trip" where "trip"."id" = "trip_revision"."trip_id" and "trip"."owner_id" = (select auth.uid())));--> statement-breakpoint
CREATE POLICY "user_profile_own_record" ON "user_profile" AS PERMISSIVE FOR ALL TO "authenticated" USING ("user_profile"."id" = (select auth.uid())) WITH CHECK ("user_profile"."id" = (select auth.uid()));