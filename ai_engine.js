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

// Modelo InstantID (especialista em preservar o rosto original da pessoa)
const MODEL = 'zsxkib/instant-id:2e4785a4d80dadf580077b2244c8d7c05d8e3faac04a04c02d8e099dd2876789';

/**
 * Gera uma imagem estilizada usando o Replicate.
 *
 * @param {string} imagePath  - Caminho local da foto enviada pelo usuario
 * @param {string} estilo   - '1', '2', '3'... (estilo escolhido no menu)
 * @returns {Promise<string>} - URL da imagem gerada pelo Replicate
 */
async function gerarImagemEstilizada(imagePath, styleKey) {
  const estilo = ESTILOS[styleKey];
  if (!estilo) {
    throw new Error('Estilo invalido: ' + styleKey);
  }

  const prompt = estilo.prompt;

  console.log(`[AI] Iniciando geracao InstantID. Estilo: ${styleKey} | Prompt: ${prompt}`);
  console.log('[AI] Arquivo:', imagePath, '| Tamanho:', fs.statSync(imagePath).size, 'bytes');

  try {
    const imageBuffer = fs.readFileSync(imagePath);

    const output = await replicate.run(MODEL, {
      input: {
        image: imageBuffer,
        prompt: prompt,
        negative_prompt: "(lowres, low quality, worst quality:1.2), (text:1.2), watermark, painting, drawing, illustration, deformed, mutated, ugly, disfigured, blur, blurry",
        sdxl_weights: "protovision-xl-high-fidel", // Modelo base com estilo muito realista
        width: 1024,
        height: 1024,
        num_inference_steps: 30,
        guidance_scale: 5,
        ip_adapter_scale: 0.8,
        controlnet_conditioning_scale: 0.8,
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
