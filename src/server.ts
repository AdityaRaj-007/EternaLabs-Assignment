import Fastify from "fastify";
import { v4 as uuidv4 } from "uuid";
import { OrderRequest } from "./types";

const PORT = Number(process.env.PORT || 3000);

const fastify = Fastify({
  logger: true,
});

fastify.post<{ Body: OrderRequest }>(
  "/api/orders/execute",
  async (request, reply) => {
    const { inputToken, outputToken, amount } = request.body;

    if (
      !inputToken ||
      !outputToken ||
      typeof amount !== "number" ||
      amount <= 0
    ) {
      reply.status(400).send({
        error:
          "Invalid error data. Provided all the required information to execute the order!",
      });
      return;
    }

    const orderId = uuidv4();
  }
);

fastify.listen({ port: PORT }, (err, address) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
