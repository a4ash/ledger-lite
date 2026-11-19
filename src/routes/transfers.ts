import type { FastifyInstance } from "fastify";
import type { Database } from "better-sqlite3";
import { z } from "zod";
import { createTransferIdempotent, reverseTransferIdempotent } from "../transfers.js";
import { toCents } from "../money.js";

const transferBody = z.object({
    from_account_id: z.number().int().positive(),
    to_account_id: z.number().int().positive(),
    amount: z.string()
    // Takes amount as text to avoid floating point issues. e.g. "12.34"
});

const transferParams = z.object({
    id: z.coerce.number().int().positive()
});

export function registerTransferRoutes(app: FastifyInstance, db: Database) {
    app.post("/transfers", async (request, reply) => {
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key === "")
            return reply.code(400).send({
                error: "Idempotency-Key header required"
            });

        const parsed = transferBody.safeParse(request.body);
        if (!parsed.success) return reply.code(400).send({
            error: "Invalid transfer request"
        });
        const { from_account_id: from, to_account_id: to } = parsed.data;
        if (from === to) return reply.code(400).send({
            error: "Accounts must be different"
        });

        let amount: number;
        try {
            amount = toCents(parsed.data.amount);

        } catch {
            return reply.code(400).send({ error: "Invalid amount" });
        }
        if (amount === 0) return reply.code(400).send(
            { error: "Amount must be greater than zero" }
        );

        const result = createTransferIdempotent(
            db,
            key,
            { fromAccountId: from, toAccountId: to, amount }
        );
        return reply.code(result.statusCode).send(result.body);
    });

    app.post("/transfers/:id/reverse", async (request, reply) => {
        const key = request.headers["idempotency-key"];
        if (typeof key !== "string" || key === "")
            return reply.code(400).send({
                error: "Idempotency-Key header required"
            });

        const params = transferParams.safeParse(request.params);
        if (!params.success) return reply.code(400).send({
            error: "Invalid transfer id"
        });

        const result = reverseTransferIdempotent(db, key, params.data.id);
        return reply.code(result.statusCode).send(result.body);
    });
}
