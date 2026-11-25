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

-- Partial index the export can answer from alone (index-only scan). Nearly all
-- events are pageviews, so the predicate barely filters rows, but leaving
-- event_type out of the key keeps the index ~20% smaller than a plain
-- (created_at, website_id, event_type) index. prisma/schema.prisma cannot
-- express a partial index, so it is only declared here.
--
-- On large databases the index must be created beforehand by hand with
-- CREATE INDEX CONCURRENTLY, which cannot run inside a migration transaction;
-- a plain CREATE INDEX would block inserts on website_event while it builds.
-- The existence check uses to_regclass rather than CREATE INDEX IF NOT EXISTS
-- because the latter still takes a SHARE lock on website_event, waiting behind
-- open inserts and queueing new ones, even when the index already exists. If
-- the index is missing on a large table, fail instead of building it here.
DO $$
BEGIN
  IF to_regclass('website_event_pageview_created_at_website_id_idx') IS NULL THEN
    IF (SELECT reltuples FROM pg_class WHERE oid = 'website_event'::regclass) > 1000000 THEN
      RAISE EXCEPTION 'website_event is too large to index inside a migration. Run by hand first: CREATE INDEX CONCURRENTLY "website_event_pageview_created_at_website_id_idx" ON "website_event" ("created_at", "website_id") WHERE "event_type" = 1;';
    END IF;

    CREATE INDEX "website_event_pageview_created_at_website_id_idx"
      ON "website_event" ("created_at", "website_id")
      WHERE "event_type" = 1;
  END IF;
END $$;
