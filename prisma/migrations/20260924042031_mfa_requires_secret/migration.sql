-- Two-factor is only on for an account that has a secret to check codes
-- against. Earlier demo data switched it on for admins without one, which
-- would lock them out now that sign-in enforces it.
UPDATE "User" SET "mfaEnabled" = false WHERE "mfaEnabled" = true AND "mfaSecret" IS NULL;
