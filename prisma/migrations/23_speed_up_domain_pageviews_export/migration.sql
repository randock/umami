-- Fork migration: speed up the domain pageviews export (/api/websites/pageviews,
-- getDomainPageviews), which counts the pageviews of every website over the
-- last 30 days. No index covers event_type, so it ran as a sequential scan of
-- the whole website_event table.
--
-- website_event and session are insert-only, so autovacuum only kicks in after
-- autovacuum_vacuum_insert_scale_factor (20% by default) of the table has been
-- inserted. Until then the most recent pages are not marked all-visible in the
-- visibility map, and an index-only scan over recent data has to visit the
-- heap anyway. Vacuum both tables after every 2% of inserts instead.
ALTER TABLE "website_event" SET (autovacuum_vacuum_insert_scale_factor = 0.02);
ALTER TABLE "session" SET (autovacuum_vacuum_insert_scale_factor = 0.02);

-- Partial index the export can answer from alone (index-only scan).
-- IF NOT EXISTS because in production it is created beforehand by hand with
-- CREATE INDEX CONCURRENTLY, which cannot run inside a migration transaction.
-- prisma/schema.prisma cannot express a partial index, so it is only declared
-- here.
CREATE INDEX IF NOT EXISTS "website_event_pageview_created_at_website_id_idx"
  ON "website_event" ("created_at", "website_id")
  WHERE "event_type" = 1;
