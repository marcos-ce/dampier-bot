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
const ESTILOS = require('./prompts');

// Numero do WhatsApp do bot (para montar o link de compartilhamento)
// Formato: apenas dígitos, com DDI. Ex: 5511999999999
const BOT_NUMBER = process.env.BOT_NUMBER || '5511999999999';

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
// ─── Numeros dos Admins (quem não gasta crédito e tem comandos) ─────────────
const ADMIN_NUMBERS = [
  '5588981125331',
  '558881125331', // Algumas contas chegam sem o 9
  '138333061685351' // ID gerado pelo WhatsApp (visto no !id)
];

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

  // ── Acao ADMIN: Comandos exclusivos do admin ───────────────────────────────
  // Uso: !add 20 5511999999999  → adiciona 20 créditos ao número
  //      !rem 5 5511999999999   → remove 5 créditos do número
  //      !saldo 5511999999999   → consulta saldo de um número
  //      !saldo                 → consulta seu próprio saldo
  //      !ajuda                 → lista os comandos admin
  if (isAdmin && texto.startsWith('!')) {
    await processarComandoAdmin(jid, id_whatsapp, texto);
    return;
  }

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

        // Contabiliza a foto gerada no histórico
        if (!isAdmin) await db.incrementPhotos(id_whatsapp);

        // Após a foto, convida a compartilhar (apenas para não-admin)
        if (!isAdmin) {
          const codigoCurto = id_whatsapp.slice(-4); // Últimos 4 dígitos = código de indicação
          await enviarTexto(
            jid,
            `📲 *Quer ganhar fotos grátis?*\n\n` +
            `Compartilhe o Dampier! Seu código de indicação é: *${codigoCurto}*\n\n` +
            `Quando um amigo entrar no bot e digitar *${codigoCurto}*, vocês dois ganham *3 fotos grátis!* 🎁\n\n` +
            `👇 *Encaminhe esta mensagem para seus amigos:*\n` +
            `"Oi! Uso o *Dampier* pra transformar fotos com IA — fica incrível! 🎨\n` +
            `Salva este número e manda 'oi': *${BOT_NUMBER}*\n` +
            `Quando entrar, digita meu código *${codigoCurto}* e ganham 3 fotos grátis! 📸"`
          );
        }
      } catch (err) {
        console.error('[Bot] Erro ao gerar imagem na IA:', err);
        if (!isAdmin) await db.addCredits(id_whatsapp, 1);
        
        let msgErro = '❌ Ops! Tivemos uma instabilidade rápida na IA ao processar sua foto.\n\n' +
                      '🎁 *Seu crédito foi devolvido!* Você não perdeu nada.\n' +
                      'Por favor, envie sua foto novamente!';

        // Se for admin, mostra o erro EXATO
        if (isAdmin) {
          msgErro = `⚠️ *[ERRO ADMIN]* Falha na API do Replicate:\n\n_${err?.message || err}_\n\n🎁 Seu crédito foi devolvido.`;
        }

        await enviarTexto(jid, msgErro);
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

  // ── Acao C: Usuário está aguardando digitar quem o indicou ────────────────
  if (usuario.step === 'AWAIT_REFERRAL') {
    // Palavras de recusa → pula a indicação normalmente
    const recusas = ['nao', 'não', 'n', 'nope', 'skip', 'pular', 'nenhum', 'ninguen', 'ninguem'];
    if (recusas.some((r) => texto.toLowerCase().includes(r))) {
      await db.setUserStep(id_whatsapp, 'IDLE');
      await enviarTexto(jid, '👍 Tudo bem! Pode enviar uma foto sua para começar! 📸');
      return;
    }

    const digitosDigitados = texto.replace(/\D/g, '');

    // Precisa ter pelo menos 4 dígitos para tentar buscar
    if (digitosDigitados.length < 4) {
      await db.setUserStep(id_whatsapp, 'IDLE');
      await enviarTexto(jid, '👍 Tudo bem! Pode enviar uma foto sua para começar! 📸');
      return;
    }

    // Verifica se já foi indicado antes (trava anti-abuso)
    if (usuario.referred_by) {
      await db.setUserStep(id_whatsapp, 'IDLE');
      await enviarTexto(jid, '⚠️ Você já usou um código de indicação antes. Envie uma foto para começar! 📸');
      return;
    }

    // Tenta encontrar o indicador pelo código digitado
    // Aceita: últimos 4 dígitos (código curto) OU número completo
    const resultado = await db.getReferrerByCode(digitosDigitados, id_whatsapp);

    if (resultado.collision) {
      // Colisão: dois usuários com mesmo final — pede mais dígitos
      await enviarTexto(
        jid,
        '⚠️ Esse código está repetido entre dois amigos!\n\n' +
        'Peça para seu amigo te mandar mais dígitos do número dele (ex: os últimos 6 ou 8 dígitos) e tente novamente 😊'
      );
      return; // Mantém no step AWAIT_REFERRAL para o usuário tentar de novo
    }

    if (!resultado.found) {
      // Código não encontrado — pode ter digitado errado ou o amigo ainda não entrou no bot
      await db.setUserStep(id_whatsapp, 'IDLE');
      await enviarTexto(
        jid,
        '❌ Código não encontrado.\n\n' +
        'Pode ser que seu amigo ainda não tenha usado o bot.\n' +
        'Sem problema! Você pode enviar uma foto para começar 📸'
      );
      return;
    }

    const numeroIndicador = resultado.user.id_whatsapp;

    // Registra a indicação e credita ambos
    await db.setReferredBy(id_whatsapp, numeroIndicador);
    await db.setUserStep(id_whatsapp, 'IDLE');
    await db.addCredits(id_whatsapp, 3);
    await db.addCredits(numeroIndicador, 3);
    await db.addReferralCount(numeroIndicador);

    const codigoExibido = numeroIndicador.slice(-4); // Exibe só os 4 últimos ao confirmar
    const usuarioComBonus = await db.getOrCreateUser(id_whatsapp);
    await enviarTexto(
      jid,
      `🎉 *Indicação confirmada!*\n\n` +
      `Você usou o código de *${codigoExibido}* e ambos ganharam *3 fotos grátis!* 🎁\n\n` +
      `📊 Seu saldo agora: *${usuarioComBonus.credits} foto(s)*\n\n` +
      `Agora envie uma foto sua para começar! 📸`
    );

    const jidIndicador = `${numeroIndicador}@s.whatsapp.net`;
    await enviarTexto(
      jidIndicador,
      `🎉 *Sua indicação funcionou!*\n\n` +
      `Alguém usou seu código e entrou no Dampier!\n` +
      `*+3 fotos grátis* foram adicionadas à sua conta! 🎁`
    );

    console.log(`[Referral] ${id_whatsapp} usou código de ${numeroIndicador}. Ambos +3 créditos.`);
    return;
  }

  // ── Acao D: Usuário quer ver seu extrato ──────────────────────────────────
  // Detecta palavras-chave naturais: "saldo", "credito", "minha conta", "extrato"
  const textoLower = texto.toLowerCase();
  const querVerSaldo = ['saldo', 'credito', 'crédito', 'conta', 'extrato', 'meus creditos', 'minhas fotos']
    .some((kw) => textoLower.includes(kw));

  if (querVerSaldo && usuario.step === 'IDLE') {
    const resumo = await db.getResumoCreditos(id_whatsapp);
    if (resumo) {
      const origemLinhas = [];
      if (resumo.pix_pagos > 0)
        origemLinhas.push(`💳 Pacotes comprados via PIX: *${resumo.pix_pagos}x* (${resumo.pix_pagos * 20} fotos)`);
      if (resumo.referred_by)
        origemLinhas.push(`🤝 Indicado por: *${resumo.referred_by}* (+3 fotos)`);
      if (resumo.referrals_given > 0)
        origemLinhas.push(`🎁 Amigos que você indicou: *${resumo.referrals_given}* (+${resumo.referrals_given * 3} fotos)`);
      if (origemLinhas.length === 0)
        origemLinhas.push('🎁 Foto de boas-vindas: *1 foto grátis*');

      await enviarTexto(
        jid,
        `📊 *Sua conta no Dampier*\n\n` +
        `💰 *Saldo atual:* ${resumo.credits} foto(s)\n` +
        `📸 *Fotos geradas:* ${resumo.photos_generated}\n\n` +
        `📋 *Origem dos seus créditos:*\n` +
        origemLinhas.join('\n') + '\n\n' +
        `_Para criar mais fotos, envie uma foto sua! 📸_`
      );
    }
    return;
  }

  // ── Acao E: Comando de debug (!id) ───────────────────────────────────────
  if (textoLower === '!id') {
    await enviarTexto(jid, `Seu ID no WhatsApp (lido pelo sistema) é:\n\n*${id_whatsapp}*\n\nAdmin flag: ${isAdmin ? 'Sim' : 'Não'}`);
    return;
  }

  // ── Mensagem nao reconhecida: boas-vindas + pergunta sobre indicação ────────
  if (!messageContent?.imageMessage) {
    // Verifica se já foi indicado ou já passou pelo fluxo de boas-vindas
    const jaIndicado = usuario.referred_by !== undefined && usuario.referred_by !== null;
    const primeiroAcesso = usuario.credits === 1 && !jaIndicado && usuario.step === 'IDLE';

    if (primeiroAcesso) {
      await db.setUserStep(id_whatsapp, 'AWAIT_REFERRAL');
      
      await enviarTexto(
        jid,
        '👋 *Bem-vindo ao Dampier!* 🎨\n' +
        'Transforme suas fotos com Inteligência Artificial.\n\n' +
        '🎁 *PRESENTE:* Você acaba de ganhar *1 foto grátis!* 🎁\n\n' +
        '📸 *Como criar sua foto:*\n' +
        '1️⃣ Envie uma foto sua aqui no chat.\n' +
        '2️⃣ Escolha um estilo (ex: Praia, Gala).\n' +
        '3️⃣ Receba sua arte transformada em segundos! ✨\n\n' +
        '💰 _Dica: Digite a palavra *saldo* a qualquer momento para ver seus créditos._'
      );

      await enviarTexto(
        jid,
        '🤝 *Alguém te indicou?*\n\n' +
        'Se sim, digite agora o *código* ou o *número* da pessoa!\n' +
        'Vocês dois ganharão *+3 fotos grátis!* 🎁\n\n' +
        '_Se ninguém te indicou, basta ignorar e enviar sua primeira foto para começar! 📸_'
      );
    } else {
      await enviarTexto(
        jid,
        '👋 *Olá! O Dampier está pronto para criar mais fotos.* 🎨\n\n' +
        '📸 *Como funciona:*\n' +
        '1️⃣ Envie uma foto sua aqui.\n' +
        '2️⃣ Escolha o estilo desejado.\n' +
        '3️⃣ Receba sua foto transformada! ✨\n\n' +
        '💰 _Dica: Digite *saldo* para ver seus créditos._\n\n' +
        '👇 *Envie uma foto sua para começar!*'
      );
    }
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

// ─── Comandos Admin ───────────────────────────────────────────────────────────

async function processarComandoAdmin(jid, id_whatsapp, texto) {
  const partes = texto.trim().split(/\s+/); // Ex: ['!add', '20', '5511999999999']
  const cmd = partes[0].toLowerCase();

  // ── !ajuda ──────────────────────────────────────────────────────────────
  if (cmd === '!ajuda') {
    await enviarTexto(
      jid,
      '👑 *Comandos Admin — Dampier Bot*\n\n' +
      '➕ *!add [qtd] [numero]*\n' +
      '   Adiciona créditos a um usuário\n' +
      '   Ex: `!add 20 5511999999999`\n\n' +
      '➖ *!rem [qtd] [numero]*\n' +
      '   Remove créditos de um usuário\n' +
      '   Ex: `!rem 5 5511999999999`\n\n' +
      '💰 *!saldo [numero]*\n' +
      '   Consulta saldo de qualquer número\n' +
      '   Ex: `!saldo 5511999999999`\n\n' +
      '💰 *!saldo*\n' +
      '   Consulta seu próprio saldo\n\n' +
      '🎁 *!presente [numero]*\n' +
      '   Presenteia 1 crédito grátis\n' +
      '   Ex: `!presente 5511999999999`'
    );
    return;
  }

  // ── !add [qtd] [numero] ─────────────────────────────────────────────────
  if (cmd === '!add') {
    const qtd = parseInt(partes[1]);
    const numero = partes[2]?.replace(/\D/g, ''); // Remove tudo que não for número
    if (!qtd || qtd <= 0 || !numero) {
      await enviarTexto(jid, '❌ Uso correto: `!add 20 5511999999999`');
      return;
    }
    await db.addCredits(numero, qtd);
    const u = await db.getOrCreateUser(numero);
    await enviarTexto(
      jid,
      `✅ *+${qtd} créditos* adicionados para *${numero}*\n` +
      `📊 Saldo atual: *${u.credits} foto(s)*`
    );
    console.log(`[Admin] ${id_whatsapp} adicionou ${qtd} créditos para ${numero}`);
    return;
  }

  // ── !rem [qtd] [numero] ─────────────────────────────────────────────────
  if (cmd === '!rem') {
    const qtd = parseInt(partes[1]);
    const numero = partes[2]?.replace(/\D/g, '');
    if (!qtd || qtd <= 0 || !numero) {
      await enviarTexto(jid, '❌ Uso correto: `!rem 5 5511999999999`');
      return;
    }
    // Remove sem deixar negativo
    const u = await db.getOrCreateUser(numero);
    const remover = Math.min(qtd, u.credits);
    if (remover === 0) {
      await enviarTexto(jid, `⚠️ *${numero}* já tem 0 créditos. Nada foi removido.`);
      return;
    }
    await db.addCredits(numero, -remover);
    const uAtual = await db.getOrCreateUser(numero);
    await enviarTexto(
      jid,
      `✅ *-${remover} créditos* removidos de *${numero}*\n` +
      `📊 Saldo atual: *${uAtual.credits} foto(s)*`
    );
    console.log(`[Admin] ${id_whatsapp} removeu ${remover} créditos de ${numero}`);
    return;
  }

  // ── !saldo [numero?] ────────────────────────────────────────────────────
  if (cmd === '!saldo') {
    const numero = partes[1]?.replace(/\D/g, '') || id_whatsapp;
    const u = await db.getOrCreateUser(numero);
    await enviarTexto(
      jid,
      `💰 *Saldo de ${numero}*\n` +
      `📊 Créditos: *${u.credits} foto(s)*\n` +
      `🕐 Passo atual: ${u.step || 'IDLE'}`
    );
    return;
  }

  // ── !presente [numero] ──────────────────────────────────────────────────
  if (cmd === '!presente') {
    const numero = partes[1]?.replace(/\D/g, '');
    if (!numero) {
      await enviarTexto(jid, '❌ Uso correto: `!presente 5511999999999`');
      return;
    }
    await db.addCredits(numero, 1);
    const u = await db.getOrCreateUser(numero);
    // Notifica o usuário presenteado pelo WhatsApp
    const jidPresente = `${numero}@s.whatsapp.net`;
    await enviarTexto(
      jidPresente,
      '🎁 *Você ganhou um presente!*\n\n' +
      '✨ O Dampier te deu *1 foto grátis!*\n' +
      'Envie uma foto sua para criar sua arte! 😊'
    );
    await enviarTexto(
      jid,
      `🎁 Presente enviado para *${numero}*!\n📊 Saldo deles agora: *${u.credits} foto(s)*`
    );
    console.log(`[Admin] ${id_whatsapp} presenteou ${numero} com 1 crédito`);
    return;
  }

  // Comando desconhecido
  await enviarTexto(jid, '❓ Comando não reconhecido. Digite `!ajuda` para ver os comandos disponíveis.');
}

// Exporta o sock para uso no webhook (index.js)
function getSock() {
  return sock;
}

module.exports = { startBot, getSock, enviarTexto };
