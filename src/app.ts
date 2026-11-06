import Fastify from "fastify";
import Database from "better-sqlite3";
import { migrate } from "./db.js";

export function buildApp(dbPath: string) {
  const app = Fastify();
  const db = new Database(dbPath);
  migrate(db);

  app.addHook("onClose", async () => {
    db.close();
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
