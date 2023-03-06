import fetch from "node-fetch";
import { Queue } from "@serverless-stack/node/queue";
import AWS from "aws-sdk";
import * as dotenv from 'dotenv';
if (process.env.IS_LOCAL) {
  dotenv.config()
}
const DEFAULT_LIMIT = 100;
const DEFAULT_OFFSET = 0;

export async function main() {
  let ordersRequest: any = await getOrders(DEFAULT_LIMIT, DEFAULT_OFFSET);
  await sendOrdersToQueue(ordersRequest.data);
  for (let i = 1; i < parseInt(ordersRequest.meta['meta-last-page']); i++) {
    ordersRequest = await getOrders(DEFAULT_LIMIT, DEFAULT_LIMIT*i+1);
    await sendOrdersToQueue(ordersRequest.data);
  }
  return {
    statusCode: 200,
    body: JSON.stringify({ status: "successful" }),
  };
}

function getOrders(limit: number, offset: number): Promise<unknown> {
  const currentDate = new Date();
  const maxDate = encodeURIComponent(new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toJSON().split('T')[0]);
  const minDate = encodeURIComponent(new Date(currentDate.getFullYear(), currentDate.getMonth()-1, 1).toJSON().split('T')[0]);
  const params = new URLSearchParams({
    _limit: limit.toFixed(0),
    _offset: offset.toFixed(0),
    _sort: "-datetime",
    _fields: "id,datetime,subscription->plans->description,subtotal,freight,consumer->name1,consumer->name2,payment_method->name,status_11_13_id,delivery->address->address,delivery->zip_code_range->description,delivery->address->number,subscription->id,subscription->status,subscription->cycle_count,consumer->telephone->number,consumer->telephone->ddd,consumer->document1",
    _config: "meta-total,meta-current-page,meta-last-page,meta-has-more-pages",
    _with: "subscriptions,items,items,installment",
    "status_11_13->id-in": "4,11,12,13",
    "datetime-max": maxDate,
    "datetime-min": minDate
  }).toString();
  return fetch(
    `https://lojinhadabiawinston.api.betalabs.net/api/orders?${params}`,
    {
      method: 'GET',
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${process.env.BETALABS_TOKEN}`,
      }
    }
  ).then(
    async (res) => {
      const result = await res.json();
      console.error("================", result);
      return result;
    }
  );
}

async function sendOrdersToQueue(orders: Array<any>) {  
  const sqs = new AWS.SQS();
  for (let order of orders) {
    await sqs
    .sendMessage({
      QueueUrl: Queue.SendOrderQueue.queueUrl,
      MessageBody: JSON.stringify(order),
      MessageGroupId: new Date().toJSON().split('T')[0]
    })
    .promise();
  }
  return;
}