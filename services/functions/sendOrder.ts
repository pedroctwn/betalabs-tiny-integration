import { SESV2 } from "aws-sdk";
import fetch from "node-fetch";
import { Queue } from "@serverless-stack/node/queue";
import AWS from "aws-sdk";

const NOME_NATUREZA_OPERACAO = "Venda de mercadoria";

export async function main(event: any) {
  let order;
  try {
    order = typeof event.Records[0].body === typeof "string" ? JSON.parse(event.Records[0].body):event.Records[0].body;
    const response: any = await sendToTiny(order)
    if (response?.retorno?.status_processamento && (response?.retorno?.status_processamento === 1 || response?.retorno?.status_processamento === '1')) {
      try {
        const sqs = new AWS.SQS();
        await sqs
        .sendMessage({
          QueueUrl: Queue.SendOrderQueue.queueUrl,
          MessageBody: JSON.stringify(order),
          DelaySeconds: 60
        })
        .promise();
      } catch (error) {
        console.error("Erro ao reenviar para fila: ", error)
      }
      return {
        statusCode: 500,
        body: JSON.stringify({ status: "unsuccessful", response}),
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify({ status: "successful", response }),
    };
  } catch (error:any) {
    console.log("Error unexpected: ", error)
    if(order){
      sendEmail(order)
    }
    return {
      statusCode: 500,
      body: JSON.stringify({ status: "unsuccessful", error}),
    };
  }
}

async function sendToTiny(order: any){
  let tinyOrder;
  try {
    tinyOrder = {
      pedido: {
        nome_natureza_operacao: NOME_NATUREZA_OPERACAO,
        numero_ordem_compra: order.id,
        data_pedido: order.datetime.split(' ')[0].split('-').reverse().join('/'),
        cliente: {
          codigo: order.consumer?.id,
          nome: order.consumer.full_name,
          cpf_cnpj: order.consumer.document1,
          email: order.consumer.email,
          atualizar_cliente: 'S',
          fone: order.consumer.telephone&&order.consumer.telephone.ddi&&order.consumer.telephone.ddd&&order.consumer.telephone.number ? order.consumer.telephone.ddi+order.consumer.telephone.ddd+order.consumer.telephone.number : "",
          endereco: order.delivery.address?.address,
          numero: order.delivery.address?.number,
          complemento: order.delivery.address?.complement,
          bairro: order.delivery.address?.neighborhood,
          cep: order.delivery.address?.zip_code,
          cidade: order.delivery.address?.city,
          uf: order.delivery.address?.state,
        },
        endereco_entrega: {
          nome_destinatario: order.consumer.full_name,
          endereco: order.delivery.address.address,
          numero: order.delivery.address.number,
          complemento: order.delivery.address.complement,
          bairro: order.delivery.address.neighborhood,
          cep: order.delivery.address.zip_code,
          cidade: order.delivery.address.city,
          uf: order.delivery.address.state,
          fone: order.consumer.telephone&&order.consumer.telephone.ddi&&order.consumer.telephone.ddd&&order.consumer.telephone.number ? order.consumer.telephone.ddi+order.consumer.telephone.ddd+order.consumer.telephone.number : "",
          cpf_cnpj: order.consumer.document1
        },
        valor_frete: order.freight,
        valor_desconto: order.discount,
        outras_despesas: order.other_costs,
        nome_transportador: order.delivery.zip_code_range?.description,
        itens: [
          {
            item: {
              codigo: order.subscription?.id,
              descricao: order.subscription?.plans?.description,
              unidade: "UN",
              quantidade: 1,
              valor_unitario: order.subtotal
            }
          }
        ],
        forma_pagamento: order.payment_method.type,
        meio_pagamento: order.payment_method.type,
        forma_envio: selectFormaEnvio(order.delivery.zip_code_range?.description),
        forma_frete: selectFormaFrete(order.delivery.zip_code_range?.description),
        marcadores: [
          {
            marcador: {
              descricao: "betalabs"
            }
          }
        ]
      }
    };
  } catch (error) {
    console.log("error mount payload: ", error)
  }
  
  return fetch(
    `https://api.tiny.com.br/api2/pedido.incluir.php?token=${process.env.TINY_TOKEN}&formato=JSON&pedido=${JSON.stringify(tinyOrder)}`,
    {
      method: 'POST'
    }
  ).then(
    async (res: any) => {
      const result = await res.json();
      return result;
    }
  ).catch((error: any) => {
    return error;
  });
}

function sendEmail(order:any){
  try {
    const mailParams: any = {
      Content: {
        Simple: {
          Body: {
            Text: {
              Data: `
              #Erro inesperado ao enviar pedido, por favor faça manualmente#
              nome_natureza_operacao: ${NOME_NATUREZA_OPERACAO},
              numero_ordem_compra: ${order.id},
              data_pedido: ${order.datetime}
              situacao: aprovado
              -------------------cliente--------------------------
                codigo: ${order.consumer.id}
                nome: ${order.consumer.full_name}
                cpf_cnpj: ${order.consumer.document1}
                email: ${order.consumer.email}".full_name}
                endereco: ${order.delivery.address.address}
                numero: ${order.delivery.address.number}
                complemento: ${order.delivery.address.complement}
                bairro: ${order.delivery.address.neighborhood}
                cep: ${order.delivery.address.zip_code}
                cidade: ${order.delivery.address.city}
                uf: ${order.delivery.address.state}
                fone: ${order.consumer.telephone&&order.consumer.telephone.ddi&&order.consumer.telephone.ddd&&order.consumer.telephone.number ? order.consumer.telephone.ddi+order.consumer.telephone.ddd+order.consumer.telephone.number : ""}
                cpf_cnpj: ${order.consumer.document1}
              -----------------------------------------------------
              
              valor_frete: ${order.freight}
              valor_desconto: ${order.discount}
              outras_despesas: ${order.other_costs}
              nome_transportador: ${order.delivery.zip_code_range?.description}
              forma_pagamento: ${order.payment_method.type}
              meio_pagamento: ${order.payment_method.type}
              forma_envio: ${selectFormaEnvio(order.delivery.zip_code_range?.description)}
              forma_frete: ${selectFormaFrete(order.delivery.zip_code_range?.description)}
  
              ----------------------itens----------------------------
                  codigo: ${order.subscription.id}
                  descricao: ${order.subscription?.plans?.description}
                  unidade: ${"UN"}
                  quantidade: ${1}
                  valor_unitario: ${order.subtotal}
              -------------------------------------------------------
            `,
              Charset: "UTF-8"
            }
          },
          Subject: {
            Data: 'INTEGRAÇÃO BETALABS - TINY',
            Charset: "UTF-8"
          }
        }
      },
      Destination: {
        ToAddresses: [
          process.env.NOTIFICATION_EMAIL
        ]
      },
      FromEmailAddress: process.env.NOTIFICATION_EMAIL
    };
    const sesv2 = new SESV2({
      apiVersion: '2019-09-27'
    });
    sesv2.sendEmail(
      mailParams , function(err, data) {
      if (err) console.error(err, err.stack);
      else     console.error(data);
    });
  } catch (error) {
    console.error(`codigo: ${order?.id}`)
    console.error(`error: ${error}`)
  }
  return;
}

function selectFormaEnvio(formaEnvioBetalabs: string) {
  if(formaEnvioBetalabs && formaEnvioBetalabs.toLocaleLowerCase().includes("correio")){
    return 'C';
  }
  if(formaEnvioBetalabs && formaEnvioBetalabs.toLocaleLowerCase().includes("jadlog")){
    return 'J';
  }
  if(formaEnvioBetalabs && formaEnvioBetalabs.toLocaleLowerCase().includes("mandae")){
    return 'T';
  }
  return 'X';
}

function selectFormaFrete(formaEnvioBetalabs: string) {
  if(formaEnvioBetalabs){
    if(formaEnvioBetalabs.toLocaleLowerCase().includes("correio") && formaEnvioBetalabs.toLocaleLowerCase().includes("pac")){
      return 'PAC';
    }
    if(formaEnvioBetalabs.toLocaleLowerCase().includes("correio") && formaEnvioBetalabs.toLocaleLowerCase().includes("sedex")){
      return 'SEDEX';
    }
    if(formaEnvioBetalabs.toLocaleLowerCase().includes("jadlog") && formaEnvioBetalabs.toLocaleLowerCase().includes(".com")){
      return '.Com';
    }
    if(formaEnvioBetalabs.toLocaleLowerCase().includes("jadlog") && formaEnvioBetalabs.toLocaleLowerCase().includes(".package")){
      return '.Package';
    }
    if(formaEnvioBetalabs.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").includes("rapido")){
      return 'MandaeExpress';
    }
    if(formaEnvioBetalabs.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, "").includes("economico")){
      return 'MandaeEconomico';
    }
    if(formaEnvioBetalabs.toLocaleLowerCase().includes("brecinho")){
      return 'ROPI - BRECINHO ENVIOS';
    }
    if(formaEnvioBetalabs.toLocaleLowerCase().includes("retirar")){
      return 'Retirar Ourinhos';
    }
    if(formaEnvioBetalabs.toLocaleLowerCase().includes("bia box")){
      return 'Enviar Bia Box';
    }
  }
  return 'Indefinido';
}