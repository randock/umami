-- AlterTable
ALTER TABLE "website_event" ADD COLUMN     "hostname" VARCHAR(100);

-- Drop all secondary indexes on website_event before the hostname backfill.
-- The UPDATE below rewrites every row; with these indexes in place each new
-- row version must be inserted into all of them (~40 GB of random index
-- writes), which dominates the migration time. Bulk-rebuilding them
-- afterwards is far cheaper. The primary key is kept.
DROP INDEX IF EXISTS "website_event_created_at_idx";
DROP INDEX IF EXISTS "website_event_session_id_idx";
DROP INDEX IF EXISTS "website_event_visit_id_idx";
DROP INDEX IF EXISTS "website_event_website_id_idx";
DROP INDEX IF EXISTS "website_event_website_id_created_at_idx";
DROP INDEX IF EXISTS "website_event_website_id_created_at_url_path_idx";
DROP INDEX IF EXISTS "website_event_website_id_created_at_url_query_idx";
DROP INDEX IF EXISTS "website_event_website_id_created_at_referrer_domain_idx";
DROP INDEX IF EXISTS "website_event_website_id_created_at_page_title_idx";
DROP INDEX IF EXISTS "website_event_website_id_created_at_event_name_idx";
DROP INDEX IF EXISTS "website_event_website_id_created_at_tag_idx";
DROP INDEX IF EXISTS "website_event_website_id_session_id_created_at_idx";
DROP INDEX IF EXISTS "website_event_website_id_visit_id_created_at_idx";

-- The backfill joins a ~39M row session hash table; the default 4MB work_mem
-- makes the hash join spill to disk in hundreds of batches.
SET work_mem = '256MB';

-- DataMigration
UPDATE "website_event" w
SET hostname = s.hostname
FROM "session" s
WHERE s.website_id = w.website_id
    and s.session_id = w.session_id;

RESET work_mem;

-- DropIndex
DROP INDEX IF EXISTS "session_website_id_created_at_hostname_idx";
DROP INDEX IF EXISTS "session_website_id_created_at_subdivision1_idx";

-- AlterTable
ALTER TABLE "session" RENAME COLUMN "subdivision1" TO "region";
ALTER TABLE "session" DROP COLUMN "subdivision2";
ALTER TABLE "session" DROP COLUMN "hostname";

-- Recreate the website_event secondary indexes dropped above.
CREATE INDEX "website_event_created_at_idx" ON "website_event"("created_at");
CREATE INDEX "website_event_session_id_idx" ON "website_event"("session_id");
CREATE INDEX "website_event_visit_id_idx" ON "website_event"("visit_id");
CREATE INDEX "website_event_website_id_idx" ON "website_event"("website_id");
CREATE INDEX "website_event_website_id_created_at_idx" ON "website_event"("website_id", "created_at");
CREATE INDEX "website_event_website_id_created_at_url_path_idx" ON "website_event"("website_id", "created_at", "url_path");
CREATE INDEX "website_event_website_id_created_at_url_query_idx" ON "website_event"("website_id", "created_at", "url_query");
CREATE INDEX "website_event_website_id_created_at_referrer_domain_idx" ON "website_event"("website_id", "created_at", "referrer_domain");
CREATE INDEX "website_event_website_id_created_at_page_title_idx" ON "website_event"("website_id", "created_at", "page_title");
CREATE INDEX "website_event_website_id_created_at_event_name_idx" ON "website_event"("website_id", "created_at", "event_name");
CREATE INDEX "website_event_website_id_created_at_tag_idx" ON "website_event"("website_id", "created_at", "tag");
CREATE INDEX "website_event_website_id_session_id_created_at_idx" ON "website_event"("website_id", "session_id", "created_at");
CREATE INDEX "website_event_website_id_visit_id_created_at_idx" ON "website_event"("website_id", "visit_id", "created_at");

-- CreateIndex
CREATE INDEX "website_event_website_id_created_at_hostname_idx" ON "website_event"("website_id", "created_at", "hostname");
CREATE INDEX "session_website_id_created_at_region_idx" ON "session"("website_id", "created_at", "region");
