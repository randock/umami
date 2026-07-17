-- Fork migration: index for the exact-domain website lookup endpoint
-- (/api/websites/lookup).
CREATE INDEX "website_domain_idx" ON "website"("domain");
