import { Cron, Queue, StackContext } from "@serverless-stack/resources";

export function IntegrationStack({ stack }: StackContext) {

  const sendOrderQueue = new Queue(stack, "SendOrderQueue", {
    consumer: {
      function: "functions/sendOrder.main"
    },
    cdk: {
      queue: {
        queueName: "orders-queue.fifo",
        fifo: true,
        contentBasedDeduplication: true
      },
    }
  });

  new Cron(stack, "Cron", {
    // schedule: "rate(5 minutes)",
    schedule: "cron(00 00 5 * ? *)",
    job: {
      function: {
        handler: "functions/getOrdersToQueue.main",
        timeout: 120,
        bind: [sendOrderQueue]
      },
    }
  });

}
