import Fastify from "fastify";
import Database from "better-sqlite3";
import { migrate } from "./db.js";
import { registerTransferRoutes } from "./routes/transfers.js";

declare module "fastify" {
  interface FastifyInstance {
    db: Database.Database;
  }
}

export function buildApp(dbPath: string) {
  const app = Fastify();
  const db = new Database(dbPath);
  migrate(db);
  app.decorate("db", db);

  app.addHook("onClose", async () => {
    db.close();
  });

  app.get("/health", async () => {
    return { status: "ok" };
  });

  registerTransferRoutes(app, db);
  return app;
}
