'use strict';

require('dotenv').config();
const { MercadoPagoConfig, Payment } = require('mercadopago');

const { randomUUID } = require('crypto');

// Inicializa o cliente do Mercado Pago com o token do .env
const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADO_PAGO_TOKEN,
});

/**
 * Gera um pagamento PIX dinamico de R$ 9,99 para o pacote de 20 fotos.
 *
 * @param {string} id_whatsapp - Numero do WhatsApp do comprador
 *                               (vincula o pagamento ao usuario via external_reference)
 * @returns {Promise<{ id: string, pixCode: string | null }>}
 */
async function gerarPixPagamento(id_whatsapp) {
  const payment = new Payment(client);

  const body = {
    transaction_amount: 9.99,
    description: 'Pacote 20 Fotos com IA - Dampier Bot',
    payment_method_id: 'pix',
    payer: {
      email: 'cliente@dampier.tech',
      first_name: 'Cliente',
      last_name: 'Dampier',
    },
    external_reference: id_whatsapp,
    notification_url: process.env.WEBHOOK_PIX_URL,
  };

  console.log('[Payments] Gerando PIX para:', id_whatsapp);

  try {
    const response = await payment.create({
      body,
      requestOptions: {
        idempotencyKey: randomUUID(), // OBRIGATORIO no SDK v2 do Mercado Pago
      },
    });

    const pixCode =
      response?.point_of_interaction?.transaction_data?.qr_code || null;

    console.log('[Payments] PIX gerado com sucesso. ID:', response.id);

    return {
      id: String(response.id),
      pixCode,
    };
  } catch (err) {
    console.error('[Payments] Erro detalhado Mercado Pago:', err?.message || err);
    throw err;
  }
}

module.exports = { gerarPixPagamento };
