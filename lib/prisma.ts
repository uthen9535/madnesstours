import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function resolveDatabaseUrl(): string {
  const configuredUrl = process.env.DATABASE_URL?.trim();
  const bundledDb = path.join(process.cwd(), "prisma", "dev.db");
  const bundledDbUrl = `file:${bundledDb}`;

  // On Vercel, force file-based SQLite URLs to the bundled database path.
  // This prevents relative path drift (e.g. file:./dev.db) from loading an empty/outdated DB.
  if (configuredUrl && !configuredUrl.startsWith("file:")) {
    return configuredUrl;
  }

  if (fs.existsSync(bundledDb)) {
    return bundledDbUrl;
  }

  if (configuredUrl) {
    return configuredUrl;
  }

  return "file:./prisma/dev.db";
}

process.env.DATABASE_URL = resolveDatabaseUrl();

export const prisma = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
