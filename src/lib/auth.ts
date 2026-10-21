import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { db } from "./db";
export const auth = betterAuth({
  database: prismaAdapter(db, { provider: "postgresql" }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  session: { expiresIn: 60 * 60 * 24 * 7, updateAge: 60 * 60 * 24 },
  rateLimit: { enabled: true, storage: "memory" },
  advanced: {
    cookiePrefix: "bookflow",
    useSecureCookies: process.env.BETTER_AUTH_URL?.startsWith("https://"),
    defaultCookieAttributes: { httpOnly: true, sameSite: "lax" },
    ipAddress: {
      ipAddressHeaders:
        process.env.TRUST_PROXY_IP === "true" ? ["x-real-ip"] : [],
    },
  },
});
