import Fastify from "fastify";
import Database from "better-sqlite3";

export function buildApp(dbPath: string) {
  const app = Fastify();
  const db = new Database(dbPath);

  app.addHook("onClose", async () => {
    db.close();
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  return app;
}
