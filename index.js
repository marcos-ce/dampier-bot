'use strict';

require('dotenv').config();

const express = require('express');
const { initDatabase, addCredits, getTransaction, saveTransaction } = require('./database');
const { startBot, getSock, enviarTexto } = require('./bot');

const PORT = process.env.PORT || 3000;
const app = express();

// Necessario para ler o body JSON das requisicoes do Mercado Pago
app.use(express.json());

// ─── Webhook PIX (Mercado Pago) ───────────────────────────────────────────────
/**
 * O Mercado Pago chama esta rota quando o status de um pagamento muda.
 * Configurar em: Mercado Pago Dev Panel > Suas integracoes > Notificacoes
 * URL: https://SEU-DOMINIO.tech/webhook-pix
 */
app.post('/webhook-pix', async (req, res) => {
  console.log('[Webhook] Notificacao recebida:', JSON.stringify(req.body));

  // Responde 200 imediatamente para o Mercado Pago nao reenviar
  res.sendStatus(200);

  try {
    const { action, data } = req.body;

    // Mercado Pago envia action = 'payment.updated' quando muda o status
    if (action !== 'payment.updated' && action !== 'payment.created') return;

    const paymentId = data?.id;
    if (!paymentId) return;

    // Busca os detalhes do pagamento na API do Mercado Pago
    const { MercadoPagoConfig, Payment } = require('mercadopago');
    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADO_PAGO_TOKEN,
    });
    const paymentClient = new Payment(client);
    const payment = await paymentClient.get({ id: paymentId });

    const status = payment?.status;
    const id_whatsapp = payment?.external_reference; // Numero do usuario

    console.log('[Webhook] Payment ID:', paymentId, '| Status:', status, '| Usuario:', id_whatsapp);

    if (status === 'approved' && id_whatsapp) {
      // Verifica se ja processamos este pagamento (evita duplicatas)
      const existing = await getTransaction(String(paymentId));
      if (existing?.status === 'approved') {
        console.log('[Webhook] Pagamento ja processado. Ignorando.');
        return;
      }

      // Credita 20 fotos ao usuario
      await addCredits(id_whatsapp, 20);
      await saveTransaction(String(paymentId), id_whatsapp, 'approved');

      console.log('[Webhook] 20 creditos adicionados para:', id_whatsapp);

      // Avisa o usuario pelo WhatsApp
      const jid = id_whatsapp + '@s.whatsapp.net';
      const sock = getSock();
      if (sock) {
        await enviarTexto(
          jid,
          '🎉 *Pagamento aprovado!* Seu pacote de *20 fotos* foi adicionado!\n\n' +
          '📸 Agora envie uma foto para comecar a criar imagens incriveis! ✨'
        );
      }
    }
  } catch (err) {
    console.error('[Webhook] Erro ao processar notificacao:', err.message);
  }
});

// Rota de health check (Railway usa para saber se o servico esta vivo)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Inicializacao ────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🚀 Iniciando FotoMagica WhatsApp Bot...\n');

  // 1. Inicia o banco de dados
  await initDatabase();
  console.log('[Main] Banco de dados inicializado.');

  // 2. Inicia o servidor Express (webhook PIX)
  app.listen(PORT, () => {
    console.log(`[Main] Servidor rodando na porta ${PORT}`);
    console.log(`[Main] Webhook PIX disponivel em: POST /webhook-pix`);
    console.log(`[Main] Health check em: GET /health`);
  });

  // 3. Inicia o bot do WhatsApp
  await startBot();
}

main().catch((err) => {
  console.error('[Main] Erro fatal ao iniciar:', err);
  process.exit(1);
});
