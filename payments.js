'use strict';

require('dotenv').config();
const { MercadoPagoConfig, Payment } = require('mercadopago');

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
      // Email obrigatorio pelo Mercado Pago; pode ser fixo para o MVP
      email: 'cliente@dampier.tech',
    },
    // IMPORTANTE: external_reference vincula o pagamento ao usuario do WhatsApp
    // O webhook usa esse campo para saber quem creditar
    external_reference: id_whatsapp,
    // URL que o Mercado Pago chamara quando o pagamento for aprovado
    notification_url: process.env.WEBHOOK_PIX_URL,
  };

  console.log('[Payments] Gerando PIX para:', id_whatsapp);
  const response = await payment.create({ body });

  // O codigo PIX fica dentro de point_of_interaction
  const pixCode =
    response?.point_of_interaction?.transaction_data?.qr_code || null;

  console.log('[Payments] PIX gerado. ID:', response.id);

  return {
    id: String(response.id),
    pixCode,
  };
}

module.exports = { gerarPixPagamento };
