'use strict';

require('dotenv').config();
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');

// Importa os estilos/prompts do arquivo de configuração central
// Para adicionar ou editar estilos, edite apenas o arquivo: prompts.js
const ESTILOS = require('./prompts');

// Inicializa o cliente do Replicate com o token do .env
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Modelo SDXL oficial com suporte a transformação de foto (img2img)
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

  // Le a foto e converte para base64 (necessario para enviar ao Replicate)
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).replace('.', '') || 'jpeg';
  const imageDataUri = `data:image/${ext};base64,${base64Image}`;

  console.log('[AI] Enviando para Replicate (SDXL img2img). Estilo:', styleKey);

  try {
    const output = await replicate.run(MODEL, {
      input: {
        prompt: prompt,
        image: imageDataUri,         // Foto real enviada pelo usuário
        prompt_strength: 0.7,        // Transforma o estilo/roupa mantendo a fisionomia do rosto
        num_inference_steps: 25,     // Alta qualidade
        guidance_scale: 7.5,
        width: 1024,
        height: 1024,
      },
    });

    // O Replicate retorna um array de URLs
    const imageUrl = Array.isArray(output) ? output[0] : output;
    console.log('[AI] Imagem gerada com sucesso:', imageUrl);
    return imageUrl;
  } catch (err) {
    console.error('[AI] Erro detalhado no Replicate:', err);
    throw err;
  }
}

module.exports = { gerarImagemEstilizada };
