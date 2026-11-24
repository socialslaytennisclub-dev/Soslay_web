import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * "Bertindak sebagai" akun tim tanpa cookie login — dipakai endpoint MCP (Claude) yang tidak punya sesi
 * browser. Di dalam runAsActor, createSupabaseServerClient memakai klien akun tim itu (RLS & izinnya sendiri)
 * dan getAdminSession mengembalikan aksesnya, jadi aksi admin yang sama (cek izin, audit) dipakai apa adanya.
 */
export type Actor = {
  client: SupabaseClient;
  userId: string;
  name: string;
  role: string;
  access: Record<string, "none" | "view" | "edit">;
};

const store = new AsyncLocalStorage<Actor>();

export const currentActor = () => store.getStore();

export function runAsActor<T>(actor: Actor, fn: () => Promise<T>): Promise<T> {
  return store.run(actor, fn);
}
