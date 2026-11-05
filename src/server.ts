import { buildApp } from "./app.js";

const app = buildApp("ledger.db");

app.listen({ port: 3000 }).catch((err) => {
  console.error(err);
  process.exit(1);
});
