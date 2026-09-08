'use strict';

require('dotenv').config();
const Replicate = require('replicate');
const fs = require('fs');

// Importa os estilos/prompts do arquivo de configuração central
// Para adicionar ou editar estilos, edite apenas o arquivo: prompts.js
const ESTILOS = require('./prompts');

// Inicializa o cliente do Replicate com o token do .env
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Modelo SDXL oficial com suporte a img2img
// O SDK do Replicate faz o upload do arquivo automaticamente (sem limitação de tamanho)
const MODEL = 'stability-ai/sdxl:7762fd07cf82c948538e41f63f77d685e02b063e37e496e96eefd46c929f9bdc';

/**
 * Gera uma imagem estilizada usando o Replicate.
 *
 * @param {string} imagePath  - Caminho local da foto enviada pelo usuario
 * @param {string} styleKey   - '1', '2', '3'... (estilo escolhido no menu)
 * @returns {Promise<string>} - URL da imagem gerada pelo Replicate
 */
async function gerarImagemEstilizada(imagePath, styleKey) {
  const estilo = ESTILOS[styleKey];
  if (!estilo) {
    throw new Error('Estilo invalido: ' + styleKey);
  }

  const prompt = estilo.prompt;

  console.log('[AI] Enviando para Replicate (SDXL img2img). Estilo:', styleKey);
  console.log('[AI] Arquivo:', imagePath, '| Tamanho:', fs.statSync(imagePath).size, 'bytes');

  try {
    // Passa o Buffer diretamente — o SDK do Replicate faz o upload automaticamente (até 100MB)
    // Isso evita o limite de 1MB do base64 e é compatível com a API
    const imageBuffer = fs.readFileSync(imagePath);

    const output = await replicate.run(MODEL, {
      input: {
        prompt: prompt,
        image: imageBuffer,         // Buffer direto — sem base64, sem limite de tamanho
        prompt_strength: 0.65,      // Transforma o estilo mantendo traços do rosto
        num_inference_steps: 25,
        guidance_scale: 7.5,
        width: 1024,
        height: 1024,
      },
    });

    // O Replicate retorna um array de URLs ou um FileOutput
    let imageUrl;
    if (Array.isArray(output)) {
      imageUrl = typeof output[0] === 'string' ? output[0] : output[0]?.url?.();
    } else if (typeof output === 'string') {
      imageUrl = output;
    } else {
      imageUrl = output?.url?.() || String(output);
    }

    if (!imageUrl) throw new Error('Replicate não retornou URL de imagem');

    console.log('[AI] Imagem gerada com sucesso:', imageUrl);
    return imageUrl;
  } catch (err) {
    console.error('[AI] Erro detalhado no Replicate:', err?.message || err);
    throw err;
  }
}

module.exports = { gerarImagemEstilizada };
