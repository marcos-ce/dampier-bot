'use strict';

require('dotenv').config();
const Replicate = require('replicate');
const fs = require('fs');
const path = require('path');

// Inicializa o cliente do Replicate com o token do .env
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN,
});

// Modelo SDXL Lightning (rapido, 4 passos, alta qualidade)
// Voce pode trocar por outro modelo no Replicate se preferir
const MODEL =
  'lucataco/sdxl-lightning-4step:727e49a643e999d602a896c774a0658ffefea21465756a6ce24b7ea4165fffb3';

// ─── Prompts dos estilos ────────────────────────────────────────────────────
// Cada prompt e otimizado para manter o rosto do usuario e mudar o ambiente/roupa
const STYLE_PROMPTS = {
  '1': [
    'portrait of an elderly person wearing a formal black tuxedo with a white dress shirt and bow tie,',
    'luxury gala dinner event background, elegant ballroom with crystal chandeliers and golden decor,',
    'dignified and refined pose, warm smile, cinematic studio lighting, shallow depth of field,',
    'photorealistic, ultra-detailed, 8k resolution, professional portrait photography',
  ].join(' '),

  '2': [
    'portrait of an elderly person at a tropical beach wearing casual colorful summer clothes,',
    'beautiful white sand beach with crystal-clear blue ocean waves, coconut palm trees, golden hour sunlight,',
    'relaxed and happy expression, warm natural lighting, vibrant cheerful colors,',
    'photorealistic, ultra-detailed, 8k resolution, travel lifestyle photography',
  ].join(' '),

  '3': [
    'portrait of an elderly person dressed as a friendly country farmer or cowboy,',
    'rustic farm background with wooden fence, green pasture fields, clear blue sky,',
    'wearing a wide brim straw hat, plaid flannel shirt, denim jeans and boots,',
    'warm cheerful smile, golden afternoon lighting,',
    'photorealistic, ultra-detailed, 8k resolution, countryside lifestyle photography',
  ].join(' '),
};

/**
 * Gera uma imagem estilizada usando o Replicate.
 *
 * @param {string} imagePath  - Caminho local da foto enviada pelo usuario
 * @param {string} styleKey   - '1', '2' ou '3' (estilo escolhido no menu)
 * @returns {Promise<string>} - URL da imagem gerada pelo Replicate
 */
async function gerarImagemEstilizada(imagePath, styleKey) {
  const prompt = STYLE_PROMPTS[styleKey];
  if (!prompt) {
    throw new Error('Estilo invalido: ' + styleKey);
  }

  // Le a foto e converte para base64 (necessario para enviar ao Replicate)
  const imageBuffer = fs.readFileSync(imagePath);
  const base64Image = imageBuffer.toString('base64');
  const ext = path.extname(imagePath).replace('.', '') || 'jpeg';
  const imageDataUri = `data:image/${ext};base64,${base64Image}`;

  console.log('[AI] Enviando para Replicate. Estilo:', styleKey);

  const output = await replicate.run(MODEL, {
    input: {
      prompt: prompt,
      image: imageDataUri,           // Foto de referencia do usuario
      num_inference_steps: 4,        // Rapido (Lightning)
      guidance_scale: 0,
      width: 1024,
      height: 1024,
    },
  });

  // O Replicate retorna um array de URLs
  const imageUrl = Array.isArray(output) ? output[0] : output;
  console.log('[AI] Imagem gerada com sucesso:', imageUrl);

  return imageUrl;
}

module.exports = { gerarImagemEstilizada };
