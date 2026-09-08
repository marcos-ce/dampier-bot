'use strict';

// Teste rápido da API do Mercado Pago
// Uso: node test_mp.js
// Requer: .env com MERCADO_PAGO_TOKEN preenchido

require('dotenv').config();
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { randomUUID } = require('crypto');

const token = process.env.MERCADO_PAGO_TOKEN;

console.log('\n🔍 Verificando token do Mercado Pago...');

if (!token) {
  console.error('❌ ERRO: MERCADO_PAGO_TOKEN não encontrado no .env!');
  console.error('   Verifique se o arquivo .env existe e tem o token preenchido.');
  process.exit(1);
}

const tipo = token.startsWith('TEST-') ? '🧪 TESTE' : token.startsWith('APP_USR-') ? '💰 PRODUÇÃO' : '❓ DESCONHECIDO';
console.log(`✅ Token encontrado: ${tipo} (${token.substring(0, 15)}...)\n`);

const client = new MercadoPagoConfig({ accessToken: token });
const payment = new Payment(client);

async function testarPIX() {
  console.log('⏳ Tentando criar um pagamento PIX de R$ 9,99...\n');

  try {
    const res = await payment.create({
      body: {
        transaction_amount: 9.99,
        description: 'Teste PIX - Dampier Bot',
        payment_method_id: 'pix',
        payer: {
          email: 'teste@dampier.tech',
          first_name: 'Cliente',
          last_name: 'Dampier',
        },
        external_reference: 'teste_5588981125331',
      },
      requestOptions: {
        idempotencyKey: randomUUID(),
      },
    });

    const pixCode = res?.point_of_interaction?.transaction_data?.qr_code;

    console.log('✅ ════════════════════════════════════════');
    console.log('   MERCADO PAGO API: FUNCIONANDO! 🎉');
    console.log('═══════════════════════════════════════════');
    console.log(`   Payment ID : ${res.id}`);
    console.log(`   Status     : ${res.status}`);
    console.log(`   PIX gerado : ${pixCode ? 'SIM ✅' : 'NÃO ❌ (verifique seu token)'}`);
    if (pixCode) {
      console.log(`\n   Código PIX (primeiros 60 chars):`);
      console.log(`   ${pixCode.substring(0, 60)}...`);
    }
    console.log('\n✅ Tudo certo! O bot vai gerar PIX normalmente.\n');

  } catch (err) {
    console.error('❌ ════════════════════════════════════════');
    console.error('   FALHA NA API DO MERCADO PAGO');
    console.error('═══════════════════════════════════════════');
    console.error('   Mensagem:', err?.message || 'Erro desconhecido');

    if (err?.message?.includes('401') || err?.message?.includes('Unauthorized')) {
      console.error('\n   🔑 Token inválido ou expirado!');
      console.error('   Acesse https://www.mercadopago.com.br/developers');
      console.error('   e copie o token correto para o .env');
    } else if (err?.message?.includes('400')) {
      console.error('\n   📋 Payload inválido. Verifique a estrutura da requisição.');
    }
    console.error('');
  }
}

testarPIX();
