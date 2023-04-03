import { Cron, Queue, StackContext } from "@serverless-stack/resources";
import { Duration } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";

import * as dotenv from 'dotenv';
if (process.env.IS_LOCAL) {
  dotenv.config()
}

export function IntegrationStack({ stack }: StackContext) {
  const sendOrderQueue = new Queue(stack, "SendOrderQueue", {
    cdk: {
      queue: {
        queueName: "orders-queue",
        retentionPeriod: Duration.hours(5),
        deliveryDelay: Duration.seconds(15),
        receiveMessageWaitTime: Duration.seconds(0),
      },
    }
  });
  sendOrderQueue.addConsumer(stack, {
    function: {
      handler: "functions/sendOrder.main",
      timeout: 30,
      permissions: [
        new iam.PolicyStatement({
          actions: ["ses:*"],
          effect: iam.Effect.ALLOW,
          resources: [
            process.env.SES_ARN || "",
          ],
        }),
      ],
      bind: [sendOrderQueue],
      environment: {
        TINY_TOKEN: process.env.TINY_TOKEN || "",
        NOTIFICATION_EMAIL: process.env.NOTIFICATION_EMAIL || "",
        SES_ARN: process.env.SES_ARN || ""
      },
    }
  })

  new Cron(stack, "Cron", {
    // schedule: "rate(5 minutes)",
    schedule: `cron(0/15 3 ${process.env.DAY_OF_MONTH} * ? *)`,
    job: {
      function: {
        handler: "functions/getOrdersToQueue.main",
        timeout: 600,
        bind: [sendOrderQueue],
        environment: {
          BETALABS_TOKEN: process.env.BETALABS_TOKEN || ""
        }
      },
    }
  });
}
