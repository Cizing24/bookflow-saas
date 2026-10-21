import { randomBytes, createHash } from "node:crypto";
export const newManagementToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (token: string) =>
  createHash("sha256").update(token).digest("hex");
