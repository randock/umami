-- Fork migration: index for looking a visitor up by their distinct id
-- (/api/websites/{websiteId}/visitor-activity). Without it, finding the other
-- websites a visitor was seen on scans the whole session table, since the date
-- filter applies to website_event rather than session.
CREATE INDEX "session_distinct_id_idx" ON "session"("distinct_id");
