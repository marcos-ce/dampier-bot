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
const ESTILOS = require('./prompts'); // Estilos/prompts configuráveis

// Chaves válidas geradas dinamicamente a partir dos estilos cadastrados
// Ex: se prompts.js tem '1','2','3' => CHAVES_VALIDAS = ['1','2','3']
const CHAVES_VALIDAS = Object.keys(ESTILOS);

// Monta o texto do menu automaticamente baseado nos estilos cadastrados
// Ao adicionar estilo '4' em prompts.js, ele aparece aqui sem mais alterações
const MENU_ESTILOS = CHAVES_VALIDAS
  .map((k) => `${k}️⃣ ${ESTILOS[k].label}`)
  .join('\n');

// DATA_DIR: mesmo valor configurado no database.js
// Garante que auth e imagens ficam no mesmo disco persistente do SQLite
const DATA_DIR = process.env.DATA_DIR || __dirname;
const AUTH_DIR = path.join(DATA_DIR, 'auth_info_baileys');
const TEMP_DIR = path.join(DATA_DIR, 'temp_images');

// Cria as pastas se nao existirem (necessario na 1a execucao no Azure)
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });


// Socket global do Baileys (usado pelo webhook para enviar mensagens)
let sock;

/**
 * Inicia a conexao do WhatsApp via Baileys.
 * Gera QR Code no terminal na primeira execucao.
 * Apos escanear, a sessao fica salva em auth_info_baileys/
 */
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false,
    auth: state,
    browser: ['Ubuntu', 'Chrome', '20.0.04'], // Simula Chrome no Linux para evitar desconexão pelo WhatsApp
    syncFullHistory: false,                   // Não baixa histórico antigo (muito mais leve e rápido)
  });

  // ── Eventos de conexao ────────────────────────────────────────────────────

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      console.log('\n📱 Escaneie o QR Code abaixo com o WhatsApp:\n');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = statusCode === DisconnectReason.loggedOut;
      console.log('[Bot] Conexao encerrada. Codigo:', statusCode);

      if (isLoggedOut) {
        console.log('[Bot] Sessao desconectada pelo WhatsApp. Limpando credenciais antigas...');
        try {
          fs.rmSync(AUTH_DIR, { recursive: true, force: true });
        } catch (e) {}
        console.log('[Bot] Gerando novo QR Code limpo...');
        setTimeout(startBot, 2000);
      } else {
        console.log('[Bot] Reconectando automaticamente...');
        setTimeout(startBot, 3000);
      }
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

// ─── Número(s) com geração ilimitada (admin) ─────────────────────────────────
// Esses números nunca serão cobrados e nunca perdem crédito
const ADMIN_NUMBERS = ['5588981125331'];

// ─── Logica de processamento de mensagens ────────────────────────────────────

async function processarMensagem(msg, jid, id_whatsapp) {
  const usuario = await db.getOrCreateUser(id_whatsapp);
  const messageContent = msg.message;
  const isAdmin = ADMIN_NUMBERS.includes(id_whatsapp);

  // ── Acao A: Usuário enviou uma IMAGEM ──────────────────────────────────
  if (messageContent?.imageMessage) {
    console.log('[Bot] Imagem recebida de:', id_whatsapp, isAdmin ? '(ADMIN)' : '');

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
      MENU_ESTILOS
    );
    return;
  }

  // ── Acao B: Usuário enviou um NUMERO valido ────────────────────────────────
  const texto = (
    messageContent?.conversation ||
    messageContent?.extendedTextMessage?.text ||
    ''
  ).trim();

  if (CHAVES_VALIDAS.includes(texto) && usuario.step === 'CHOOSE_STYLE') {
    console.log('[Bot] Estilo escolhido por', id_whatsapp, ':', texto);

    // Admin tem crédito ilimitado — não desconta e não cobra
    const temCredito = isAdmin || usuario.credits > 0;

    if (temCredito) {
      // Só desconta crédito se NÃO for admin
      if (!isAdmin) {
        await db.deductCredit(id_whatsapp);
      }
      await db.setUserStep(id_whatsapp, 'IDLE');

      // Busca o saldo atualizado para informar ao usuario
      const usuarioAtualizado = await db.getOrCreateUser(id_whatsapp);
      const saldoRestante = isAdmin ? '∞' : usuarioAtualizado.credits;

      await enviarTexto(jid, '🎨 *Pintando sua foto, aguarde...* Isso leva cerca de 30 segundos!');

      try {
        const imageUrl = await gerarImagemEstilizada(usuario.temp_image, texto);

        // Envia a imagem de volta pelo WhatsApp
        const captionSaldo = isAdmin
          ? `✨ *Aqui está sua foto!*\n\n👑 Modo Admin — geração ilimitada ativa!`
          : saldoRestante > 0
            ? `✨ *Aqui está sua foto!*\n\n📊 Saldo restante: *${saldoRestante} foto(s)*\n\nEnvie outra foto para criar mais estilos! 😊`
            : `✨ *Aqui está sua foto!*\n\n📊 Saldo restante: *0 fotos*\nPara criar mais fotos, recarregue com R$ 9,99 e ganhe *20 fotos!* 💳`;

        await sock.sendMessage(jid, {
          image: { url: imageUrl },
          caption: captionSaldo,
        });
      } catch (err) {
        console.error('[Bot] Erro ao gerar imagem na IA:', err);
        // Devolve o crédito apenas se não for admin
        if (!isAdmin) {
          await db.addCredits(id_whatsapp, 1);
        }
        await enviarTexto(
          jid,
          '❌ Ops! Tivemos uma instabilidade rápida na IA ao processar sua foto.\n\n' +
          '🎁 *Seu crédito foi devolvido!* Você não perdeu nada.\n' +
          'Por favor, envie sua foto novamente!'
        );
      }

    } else {
      // Sem creditos: inicia o fluxo de pagamento
      try {
        await iniciarPagamento(jid, id_whatsapp);
      } catch (err) {
        console.error('[Bot] Erro ao gerar PIX:', err);
        await enviarTexto(jid, '❌ Erro ao gerar o PIX. Por favor, tente novamente em instantes.');
      }
    }
    return;
  }

  // ── Mensagem nao reconhecida: envia instrucoes ─────────────────────────
  if (!messageContent?.imageMessage) {
    await enviarTexto(
      jid,
      '👋 *Olá! Bem-vindo ao Dampier!* 🎉\n\n' +
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
