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

// Modelo face-to-many — especialista em transformar rosto de uma pessoa em qualquer estilo.
// Muito mais estável e realista que o InstantID para este caso de uso.
// Documentação: https://replicate.com/fofr/face-to-many
const MODEL = 'fofr/face-to-many:a07f252abbbd832009640b27f063ea52d87d7a23a185ca165bec23b5adc8deaf';

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

  console.log(`[AI] Iniciando geracao face-to-many. Estilo: ${styleKey} | Prompt: ${prompt}`);
  console.log('[AI] Arquivo:', imagePath, '| Tamanho:', fs.statSync(imagePath).size, 'bytes');

  try {
    const imageBuffer = fs.readFileSync(imagePath);

    const output = await replicate.run(MODEL, {
      input: {
        image: imageBuffer,
        prompt: prompt,
        negative_prompt: "3d render, cartoon, anime, caricature, plastic, CGI, painting, drawing, illustration, deformed, ugly, disfigured, blurry, lowres, extra limbs",
        style: 'Photographic', // Força o modo fotográfico (mais realista)
        number_of_images: 1,
        guidance_scale: 7.5,
        ip_adapter_scale: 0.8, // Fidelidade ao rosto: 0.8 é o ponto ideal entre rosto e estilo
        lcm_num_inference_steps: 6, // Steps do LCM — bem mais rápido que o DDIM do InstantID
        disable_safety_checker: true, // Evita falsos positivos que travam a geração
      },
    });

    // O Replicate retorna um array de URLs ou um FileOutput
    let imageUrl;
    if (Array.isArray(output)) {
      imageUrl = typeof output[0] === 'string' ? output[0] : await output[0]?.url?.();
    } else if (typeof output === 'string') {
      imageUrl = output;
    } else {
      imageUrl = await output?.url?.() || String(output);
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
