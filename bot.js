'use strict';

require('dotenv').config();

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  downloadMediaMessage,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');

const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

const db = require('./database');
const { gerarPixPagamento } = require('./payments');
const { gerarImagemEstilizada } = require('./ai_engine');

// Pasta para salvar as fotos temporarias dos usuarios
const TEMP_DIR = path.join(__dirname, 'temp_images');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Socket global do Baileys (usado pelo webhook para enviar mensagens)
let sock;

/**
 * Inicia a conexao do WhatsApp via Baileys.
 * Gera QR Code no terminal na primeira execucao.
 * Apos escanear, a sessao fica salva em auth_info_baileys/
 */
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }), // 'info' para debug detalhado
    printQRInTerminal: false,           // Usamos o qrcode-terminal manualmente
    auth: state,
  });

  // ── Eventos de conexao ────────────────────────────────────────────────────

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escaneie o QR Code abaixo com o WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const shouldReconnect =
        lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('[Bot] Conexao encerrada. Reconectando?', shouldReconnect);
      if (shouldReconnect) startBot();
    }

    if (connection === 'open') {
      console.log('\n✅ Bot conectado ao WhatsApp com sucesso!\n');
    }
  });

  // Salva as credenciais sempre que atualizarem
  sock.ev.on('creds.update', saveCreds);

  // ── Ouvinte de mensagens ──────────────────────────────────────────────────

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;

    for (const msg of messages) {
      // Ignora mensagens proprias e de grupos
      if (msg.key.fromMe) continue;
      if (msg.key.remoteJid.includes('@g.us')) continue;

      const jid = msg.key.remoteJid; // Ex: 5511999999999@s.whatsapp.net
      const id_whatsapp = jid.split('@')[0]; // Apenas o numero

      try {
        await processarMensagem(msg, jid, id_whatsapp);
      } catch (err) {
        console.error('[Bot] Erro ao processar mensagem de', id_whatsapp, err);
        await enviarTexto(jid, '❌ Ocorreu um erro. Por favor, tente novamente em instantes.');
      }
    }
  });
}

// ─── Logica de processamento de mensagens ────────────────────────────────────

async function processarMensagem(msg, jid, id_whatsapp) {
  const usuario = await db.getOrCreateUser(id_whatsapp);
  const messageContent = msg.message;

  // ── Acao A: Usuário enviou uma IMAGEM ──────────────────────────────────
  if (messageContent?.imageMessage) {
    console.log('[Bot] Imagem recebida de:', id_whatsapp);

    // Faz download da imagem
    const buffer = await downloadMediaMessage(msg, 'buffer', {});
    const imgPath = path.join(TEMP_DIR, `${id_whatsapp}.jpg`);
    fs.writeFileSync(imgPath, buffer);

    // Atualiza o banco: salva o caminho e muda o step
    await db.setTempImage(id_whatsapp, imgPath);
    await db.setUserStep(id_whatsapp, 'CHOOSE_STYLE');

    await enviarTexto(
      jid,
      '📸 *Foto recebida!* Responda com o *número* do estilo desejado:\n\n' +
      '1️⃣ Roupa de Gala 👔\n' +
      '2️⃣ Na Praia 🏖️\n' +
      '3️⃣ Estilo Fazenda 🤠'
    );
    return;
  }

  // ── Acao B: Usuário enviou um NUMERO (1, 2 ou 3) ──────────────────────
  const texto = (
    messageContent?.conversation ||
    messageContent?.extendedTextMessage?.text ||
    ''
  ).trim();

  if (['1', '2', '3'].includes(texto) && usuario.step === 'CHOOSE_STYLE') {
    console.log('[Bot] Estilo escolhido por', id_whatsapp, ':', texto);

    if (usuario.credits > 0) {
      // Usuario tem creditos: gera a imagem!
      await db.deductCredit(id_whatsapp);
      await db.setUserStep(id_whatsapp, 'IDLE');

      // Busca o saldo atualizado para informar ao usuario
      const usuarioAtualizado = await db.getOrCreateUser(id_whatsapp);
      const saldoRestante = usuarioAtualizado.credits;

      await enviarTexto(jid, '🎨 *Pintando sua foto, aguarde...* Isso leva cerca de 30 segundos!');

      const imageUrl = await gerarImagemEstilizada(usuario.temp_image, texto);

      // Envia a imagem de volta pelo WhatsApp
      const captionSaldo =
        saldoRestante > 0
          ? `✨ *Aqui está sua foto!*\n\n📊 Saldo restante: *${saldoRestante} foto(s)*\n\nEnvie outra foto para criar mais estilos! 😊`
          : `✨ *Aqui está sua foto!*\n\n📊 Saldo restante: *0 fotos*\nPara criar mais fotos, recarregue com R$ 9,99 e ganhe *20 fotos!* 💳`;

      await sock.sendMessage(jid, {
        image: { url: imageUrl },
        caption: captionSaldo,
      });


    } else {
      // Sem creditos: inicia o fluxo de pagamento
      await iniciarPagamento(jid, id_whatsapp);
    }
    return;
  }

  // ── Mensagem nao reconhecida: envia instrucoes ─────────────────────────
  if (!messageContent?.imageMessage) {
    await enviarTexto(
      jid,
      '👋 *Olá! Bem-vindo ao FotoMagica!* 🎉\n\n' +
      '🎁 *PRESENTE DE BOAS-VINDAS:* Você ganhou *1 foto grátis!*\n\n' +
      '📸 É muito simples de usar:\n' +
      '1. *Envie uma foto sua*\n' +
      '2. *Escolha o estilo* (1, 2 ou 3)\n' +
      '3. *Receba sua foto transformada!* ✨\n\n' +
      'Comece agora! Envie uma foto sua 👇'
    );
  }
}

// ─── Funcao de pagamento ──────────────────────────────────────────────────────

async function iniciarPagamento(jid, id_whatsapp) {
  await enviarTexto(
    jid,
    '⏳ *Gerando seu PIX de R$ 9,99* para um pacote de 20 fotos...\n\nAguarde um momento!'
  );

  const { id, pixCode } = await gerarPixPagamento(id_whatsapp);

  // Salva a transacao no banco
  await db.saveTransaction(id, id_whatsapp, 'pending');

  if (pixCode) {
    await enviarTexto(
      jid,
      '💳 *Pacote 20 Fotos - R$ 9,99*\n\n' +
      'Copie o codigo PIX abaixo e cole no seu banco:'
    );
    // Envia o codigo PIX em mensagem separada (facilita o copiar)
    await enviarTexto(jid, pixCode);
    await enviarTexto(
      jid,
      '✅ Apos o pagamento, *seu saldo sera atualizado automaticamente* e voce podera enviar sua foto!'
    );
  } else {
    await enviarTexto(jid, '❌ Erro ao gerar PIX. Por favor, tente novamente em instantes.');
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function enviarTexto(jid, texto) {
  return sock.sendMessage(jid, { text: texto });
}

// Exporta o sock para uso no webhook (index.js)
function getSock() {
  return sock;
}

module.exports = { startBot, getSock, enviarTexto };
