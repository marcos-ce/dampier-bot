// ============================================================
// prompts.js — Central de Estilos do Dampier Bot
// ============================================================
// COMO EDITAR:
//   - Cada bloco abaixo é um estilo que aparece no menu do WhatsApp.
//   - Para EDITAR um estilo: altere o 'label' (nome) e o 'prompt' (instrução em inglês).
//   - Para ADICIONAR um estilo: copie um bloco e cole com a próxima chave ('4', '5'...).
//   - Para REMOVER um estilo: delete o bloco inteiro.
//   - Após qualquer mudança, faça: git add . && git commit -m "update prompts" && git push
//
// REGRAS DO PROMPT (inglês):
//   - Descreva a ROUPA e o CENÁRIO desejados.
//   - Mantenha "portrait of an elderly person" no início — isso preserva o rosto.
//   - Termine sempre com "photorealistic, ultra-detailed, 8k resolution".
//   - Quanto mais detalhado, melhor o resultado.
// ============================================================

'use strict';

const ESTILOS = {

  '1': {
    // Nome que aparece no menu do WhatsApp (emoji + texto)
    label: 'Roupa de Gala 👔',

    // Instrução em inglês para a IA — descreve roupa, cenário e iluminação
    prompt: [
      'portrait of an elderly person wearing a formal black tuxedo',
      'with a white dress shirt and bow tie,',
      'luxury gala dinner event background,',
      'elegant ballroom with crystal chandeliers and golden decor,',
      'dignified and refined pose, warm smile,',
      'cinematic studio lighting, shallow depth of field,',
      'photorealistic, ultra-detailed, 8k resolution, professional portrait photography',
    ].join(' '),
  },

  '2': {
    label: 'Na Praia 🏖️',

    prompt: [
      'portrait of an elderly person at a tropical beach',
      'wearing casual colorful summer clothes,',
      'beautiful white sand beach with crystal-clear blue ocean waves,',
      'coconut palm trees, golden hour sunlight,',
      'relaxed and happy expression, warm natural lighting,',
      'vibrant cheerful colors,',
      'photorealistic, ultra-detailed, 8k resolution, travel lifestyle photography',
    ].join(' '),
  },

  '3': {
    label: 'Estilo Fazenda 🤠',

    prompt: [
      'portrait of an elderly person dressed as a friendly country farmer,',
      'rustic farm background with wooden fence, green pasture fields, clear blue sky,',
      'wearing a wide brim straw hat, plaid flannel shirt, denim jeans and boots,',
      'warm cheerful smile, golden afternoon lighting,',
      'photorealistic, ultra-detailed, 8k resolution, countryside lifestyle photography',
    ].join(' '),
  },

  // ── EXEMPLOS PRONTOS PARA ADICIONAR ──────────────────────────────────────
  // Descomente (remova os // de cada linha) para ativar o estilo:

  // '4': {
  //   label: 'Astronauta 🚀',
  //   prompt: [
  //     'portrait of an elderly person wearing a white NASA spacesuit with helmet off,',
  //     'space station interior background with Earth visible through the window,',
  //     'confident and proud expression, futuristic lighting,',
  //     'photorealistic, ultra-detailed, 8k resolution, science fiction photography',
  //   ].join(' '),
  // },

  // '5': {
  //   label: 'Pintura a Óleo 🖼️',
  //   prompt: [
  //     'portrait of an elderly person in the style of a classic Renaissance oil painting,',
  //     'rich warm colors, detailed brushwork, museum-quality artwork,',
  //     'dramatic chiaroscuro lighting, old master painting style,',
  //     'photorealistic rendering of oil painting, ultra-detailed, 8k resolution',
  //   ].join(' '),
  // },

  // '6': {
  //   label: 'Rei ou Rainha 👑',
  //   prompt: [
  //     'portrait of an elderly person dressed as a medieval king or queen,',
  //     'wearing a golden crown, royal velvet robes with ermine trim,',
  //     'majestic throne room background with stained glass windows,',
  //     'regal and dignified pose, dramatic royal lighting,',
  //     'photorealistic, ultra-detailed, 8k resolution, historical portrait photography',
  //   ].join(' '),
  // },
};

module.exports = ESTILOS;
