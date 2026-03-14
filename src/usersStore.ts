import crypto from "node:crypto";
import { createPasswordSalt, hashPassword } from "./auth";
import { listUsers, loadUser, loadUserByUsername, saveUser } from "./storage";
import { SafeUserRecord, UserRecord, UserRole } from "./types";

export class UsersStore {
  async list(): Promise<UserRecord[]> {
    return listUsers();
  }

  async count(): Promise<number> {
    return (await this.list()).length;
  }

  async get(userId: string): Promise<UserRecord | null> {
    return loadUser(userId);
  }

  async getByUsername(username: string): Promise<UserRecord | null> {
    return loadUserByUsername(username);
  }

  async create(input: { username: string; password: string; role: UserRole }): Promise<UserRecord> {
    const salt = createPasswordSalt();
    const now = new Date().toISOString();
    const user: UserRecord = {
      id: crypto.randomUUID(),
      username: input.username,
      role: input.role,
      passwordSalt: salt,
      passwordHash: hashPassword(input.password, salt),
      createdAt: now,
      updatedAt: now
    };

    await saveUser(user);
    return user;
  }

  async touchLogin(userId: string): Promise<void> {
    const user = await loadUser(userId);
    if (!user) {
      return;
    }

    user.lastLoginAt = new Date().toISOString();
    user.updatedAt = user.lastLoginAt;
    await saveUser(user);
  }

  toSafeUsers(users: UserRecord[]): SafeUserRecord[] {
    return users.map(({ passwordHash, passwordSalt, ...safeUser }) => safeUser);
  }
}