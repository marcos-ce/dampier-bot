'use strict';

require('dotenv').config();
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// DATA_DIR: define onde o banco e arquivos persistentes ficam.
// - Local (seu PC):  usa a pasta do projeto (__dirname)
// - Azure App Service: defina DATA_DIR=/home/data no painel de variaveis
// O WAL mode melhora estabilidade no filesystem de rede do Azure.
const DATA_DIR = process.env.DATA_DIR || __dirname;
const DB_PATH  = path.join(DATA_DIR, 'bot_database.db');


// Variavel global da conexao
let db;

/**
 * Inicializa o banco de dados e cria as tabelas necessarias.
 * Deve ser chamada uma vez ao iniciar o sistema (index.js).
 */
function initDatabase() {
  return new Promise((resolve, reject) => {
    // Garante que a pasta DATA_DIR existe (importante no Azure na 1a execucao)
    const fs = require('fs');
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      console.log('[DB] Pasta criada:', DATA_DIR);
    }

    db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('[DB] Erro ao conectar ao SQLite:', err.message);
        return reject(err);
      }
      console.log('[DB] Conectado ao SQLite em:', DB_PATH);
    });

    db.serialize(() => {
      // WAL mode: melhora estabilidade em filesystems de rede (Azure /home)
      db.run('PRAGMA journal_mode=WAL;');
      db.run('PRAGMA synchronous=NORMAL;');


      db.run(
        `CREATE TABLE IF NOT EXISTS users (
          id_whatsapp  TEXT PRIMARY KEY,
          credits      INTEGER NOT NULL DEFAULT 1,  -- 1 foto gratis no primeiro acesso!
          step         TEXT    NOT NULL DEFAULT 'IDLE',
          temp_image   TEXT
        )`,

        (err) => {
          if (err) return reject(err);
          console.log('[DB] Tabela users: OK');
        }
      );

      // Tabela de transacoes (pagamentos PIX)
      db.run(
        `CREATE TABLE IF NOT EXISTS transactions (
          id_pagamento TEXT PRIMARY KEY,
          id_whatsapp  TEXT NOT NULL,
          status       TEXT NOT NULL DEFAULT 'pending',
          created_at   TEXT NOT NULL DEFAULT (datetime('now'))
        )`,
        (err) => {
          if (err) return reject(err);
          console.log('[DB] Tabela transactions: OK');
          resolve(db);
        }
      );
    });
  });
}

// ─── Funcoes auxiliares ───────────────────────────────────────────────────────

/** Busca o usuario ou cria um novo registro se for a primeira mensagem */
function getOrCreateUser(id_whatsapp) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO users (id_whatsapp) VALUES (?)`,
      [id_whatsapp],
      (err) => {
        if (err) return reject(err);
        db.get(
          `SELECT * FROM users WHERE id_whatsapp = ?`,
          [id_whatsapp],
          (err, row) => {
            if (err) return reject(err);
            resolve(row);
          }
        );
      }
    );
  });
}

/** Atualiza o passo (step) do fluxo do usuario */
function setUserStep(id_whatsapp, step) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET step = ? WHERE id_whatsapp = ?`,
      [step, id_whatsapp],
      (err) => { if (err) return reject(err); resolve(); }
    );
  });
}

/** Salva o caminho da foto temporaria do usuario */
function setTempImage(id_whatsapp, imagePath) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET temp_image = ? WHERE id_whatsapp = ?`,
      [imagePath, id_whatsapp],
      (err) => { if (err) return reject(err); resolve(); }
    );
  });
}

/** Desconta 1 credito do usuario */
function deductCredit(id_whatsapp) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET credits = credits - 1 WHERE id_whatsapp = ? AND credits > 0`,
      [id_whatsapp],
      (err) => { if (err) return reject(err); resolve(); }
    );
  });
}

/** Adiciona creditos ao usuario (chamado apos PIX aprovado) */
function addCredits(id_whatsapp, amount) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE users SET credits = credits + ? WHERE id_whatsapp = ?`,
      [amount, id_whatsapp],
      (err) => { if (err) return reject(err); resolve(); }
    );
  });
}

/** Registra uma transacao de pagamento */
function saveTransaction(id_pagamento, id_whatsapp, status) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO transactions (id_pagamento, id_whatsapp, status) VALUES (?, ?, ?)`,
      [id_pagamento, id_whatsapp, status],
      (err) => { if (err) return reject(err); resolve(); }
    );
  });
}

/** Busca uma transacao pelo ID do pagamento */
function getTransaction(id_pagamento) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM transactions WHERE id_pagamento = ?`,
      [id_pagamento],
      (err, row) => { if (err) return reject(err); resolve(row); }
    );
  });
}

module.exports = {
  initDatabase,
  getOrCreateUser,
  setUserStep,
  setTempImage,
  deductCredit,
  addCredits,
  saveTransaction,
  getTransaction,
};
