import "express-serve-static-core";
import { SafeUserRecord } from "./types";

declare module "express-serve-static-core" {
  interface Request {
    authUser?: SafeUserRecord;
  }
}