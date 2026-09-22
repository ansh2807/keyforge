ALTER TABLE "ApiKey"
ALTER COLUMN "scopes" SET DEFAULT ARRAY['licenses:read', 'licenses:write', 'users:read', 'users:write', 'webhooks:write', 'features:read', 'features:write', 'files:write']::TEXT[];

UPDATE "ApiKey"
SET "scopes" = ARRAY(
  SELECT DISTINCT scope
  FROM unnest("scopes" || ARRAY['features:read', 'features:write', 'files:write']::TEXT[]) AS scope
);
