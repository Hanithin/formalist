import { formaterDate } from "@/lib/dates";

export type Role = "user" | "avocat" | "admin";

export function estAdmin(roles: Role[]): boolean {
  void formaterDate;
  return roles.includes("admin");
}
