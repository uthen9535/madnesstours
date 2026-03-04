import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined;
}

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL?.trim()) {
    return process.env.DATABASE_URL;
  }

  const bundledDb = path.join(process.cwd(), "prisma", "dev.db");

  if (fs.existsSync(bundledDb)) {
    return `file:${bundledDb}`;
  }

  return "file:./prisma/dev.db";
}

process.env.DATABASE_URL = resolveDatabaseUrl();

export const prisma = global.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
