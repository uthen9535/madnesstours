PRAGMA foreign_keys=OFF;

CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'civilian',
    "displayName" TEXT NOT NULL,
    "bio" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "btcSats" INTEGER NOT NULL DEFAULT 100000000,
    CONSTRAINT "User_role_check" CHECK ("role" IN ('admin', 'civilian'))
);

INSERT INTO "new_User" ("id", "username", "passwordHash", "role", "displayName", "bio", "createdAt", "updatedAt", "btcSats")
SELECT
  "id",
  "username",
  "passwordHash",
  CASE
    WHEN "role" = 'admin' THEN 'admin'
    ELSE 'civilian'
  END,
  "displayName",
  "bio",
  "createdAt",
  "updatedAt",
  "btcSats"
FROM "User";

DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
