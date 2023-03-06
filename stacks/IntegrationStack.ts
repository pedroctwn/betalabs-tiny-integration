import { Cron, Queue, StackContext } from "@serverless-stack/resources";
import { Duration } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dotenv from 'dotenv';
if (process.env.IS_LOCAL) {
  dotenv.config()
}

export function IntegrationStack({ stack }: StackContext) {
  const sendOrderQueue = new Queue(stack, "SendOrderQueue", {
    consumer: {
      function: {
        handler: "functions/sendOrder.main",
        timeout: 30,
        retryAttempts: 2,
        permissions: [
          new iam.PolicyStatement({
            actions: ["ses:*"],
            effect: iam.Effect.ALLOW,
            resources: [
              process.env.SES_ARN || "",
            ],
          }),
        ]
      }
    },
    cdk: {
      queue: {
        queueName: "orders-queue.fifo",
        fifo: true,
        contentBasedDeduplication: true,
        retentionPeriod: Duration.hours(5),
        deliveryDelay: Duration.seconds(15),
        receiveMessageWaitTime: Duration.seconds(0),
      },
    }
  });

  new Cron(stack, "Cron", {
    // schedule: "rate(5 minutes)",
    schedule: `cron(55 21 ${process.env.DAY_OF_MONTH} * ? *)`,
    job: {
      function: {
        handler: "functions/getOrdersToQueue.main",
        timeout: 600,
        bind: [sendOrderQueue]
      },
    }
  });
}
