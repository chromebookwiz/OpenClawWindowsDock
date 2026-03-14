import crypto from "node:crypto";
import { config } from "./config";
import { AuthTokenPayload, SafeUserRecord, UserRecord } from "./types";

function toBase64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function fromBase64Url(value: string): string {
  return Buffer.from(value, "base64url").toString("utf8");
}

export function createPasswordSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function verifyPassword(password: string, user: UserRecord): boolean {
  const candidateHash = hashPassword(password, user.passwordSalt);
  return crypto.timingSafeEqual(Buffer.from(candidateHash, "hex"), Buffer.from(user.passwordHash, "hex"));
}

export function sanitizeUser(user: UserRecord): SafeUserRecord {
  const { passwordHash, passwordSalt, ...safeUser } = user;
  return safeUser;
}

export function signAuthToken(user: UserRecord): string {
  const header = { alg: "HS256", typ: "JWT" };
  const payload: AuthTokenPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + config.authTokenTtlHours * 3600
  };

  const encodedHeader = toBase64Url(JSON.stringify(header));
  const encodedPayload = toBase64Url(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", config.authTokenSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = crypto
    .createHmac("sha256", config.authTokenSecret)
    .update(`${encodedHeader}.${encodedPayload}`)
    .digest("base64url");

  if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
    return null;
  }

  const payload = JSON.parse(fromBase64Url(encodedPayload)) as AuthTokenPayload;
  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}