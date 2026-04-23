import "fastify";

declare module "fastify" {
  interface FastifyInstance {
    authenticate(
      req: FastifyRequest,
      reply: FastifyReply
    ): Promise<void>;
  }

  interface FastifyRequest {
    partner: {
      id: string;
      name: string;
      webhookUrl: string | null;
    };
  }
}
