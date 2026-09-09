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

// Modelo PhotoMaker (TencentARC) — fotorrealismo com preservação de identidade facial.
// Usado por apps profissionais. Exige a palavra "img" nos prompts para referenciar o rosto.
// Documentação: https://replicate.com/tencentarc/photomaker
const MODEL = 'tencentarc/photomaker:ddfc2b08d209f9fa8c1eca692712918bd449f695d0847266a3c4f9f7d66fbc30';

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
        input_image: imageBuffer,
        prompt: prompt,
        negative_prompt: "cartoon, anime, caricature, plastic, CGI, painting, drawing, illustration, deformed, ugly, disfigured, blurry, lowres, extra limbs, bad anatomy",
        style_name: 'Photographic (Default)',
        num_steps: 20,
        style_strength_ratio: 20,
        guidance_scale: 5,
        num_outputs: 1,
        disable_safety_checker: true,
      },
    });

    // PhotoMaker retorna array de URLs de imagem
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
