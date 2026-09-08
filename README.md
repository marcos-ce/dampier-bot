# 📸 FotoMagica Bot - WhatsApp AI Photo Bot

Bot de WhatsApp para geração de imagens via IA, com pagamento via PIX.
Desenvolvido para ser simples de usar e fácil de hospedar no Railway.

---

## 🚀 Como Funciona

1. O usuário envia uma **foto** pelo WhatsApp
2. O bot mostra um menu com **3 estilos** (Gala, Praia, Fazenda)
3. O usuário escolhe enviando o **número** (1, 2 ou 3)
4. Se tiver créditos: a IA transforma a foto ✨
5. Se não tiver créditos: o bot gera um **PIX de R$ 9,99** para 20 fotos

---

## 🔧 Configuração do Ambiente (.env)

### 1. Copie o arquivo de exemplo
```bash
cp .env.example .env
```

### 2. Preencha as variáveis no arquivo `.env`

| Variável | Onde Obter | Exemplo |
|----------|-----------|---------|
| `MERCADO_PAGO_TOKEN` | [developers.mercadopago.com.br](https://www.mercadopago.com.br/developers/panel) > Suas Credenciais | `APP_USR-abc123...` |
| `REPLICATE_API_TOKEN` | [replicate.com/account/api-tokens](https://replicate.com/account/api-tokens) | `r8_abc123...` |
| `WEBHOOK_PIX_URL` | URL do seu deploy + `/webhook-pix` | `https://meusite.tech/webhook-pix` |

### ⚠️ SEGURANÇA IMPORTANTE
- **NUNCA** suba o arquivo `.env` para o GitHub
- O `.gitignore` já está configurado para protegê-lo
- No Railway, cadastre as variáveis no painel (sem o arquivo .env)

---

## 📦 Instalação Local

```bash
# 1. Instale as dependências
npm install

# 2. Configure o .env (veja acima)
cp .env.example .env

# 3. Inicie o bot
npm start
```

Na primeira execução, um **QR Code** aparecerá no terminal.  
Abra o WhatsApp > 3 pontinhos > Aparelhos conectados > Conectar um aparelho.

---

## 🚂 Deploy no Railway

### Passo a Passo:

1. **Suba o projeto para o GitHub:**
```bash
git init
git add .
git commit -m "feat: MVP FotoMagica Bot"
git remote add origin https://github.com/SEU-USUARIO/fotomagica-bot.git
git push -u origin main
```

2. **No Railway:**
   - Acesse [railway.app](https://railway.app) e faça login
   - Clique em **New Project > Deploy from GitHub repo**
   - Selecione o repositório `fotomagica-bot`
   - Vá em **Variables** e adicione:
     - `MERCADO_PAGO_TOKEN`
     - `REPLICATE_API_TOKEN`
     - `WEBHOOK_PIX_URL` (use o domínio `.tech` que você possui)
   - O Railway detecta o `npm start` automaticamente

3. **Configure o domínio personalizado:**
   - Em **Settings > Networking > Custom Domain**
   - Adicione seu domínio `.tech`
   - Configure o DNS seguindo as instruções do Railway

4. **Configure o Webhook no Mercado Pago:**
   - Acesse [Minhas Integrações](https://www.mercadopago.com.br/developers/panel)
   - Notificações > Adicione a URL: `https://SEU-DOMINIO.tech/webhook-pix`

---

## 📁 Estrutura do Projeto

```
fotomagica-bot/
├── index.js          # Ponto de entrada - inicializa tudo
├── bot.js            # Motor do WhatsApp (Baileys)
├── database.js       # Banco de dados SQLite
├── payments.js       # Integração Mercado Pago (PIX)
├── ai_engine.js      # Integração Replicate (IA)
├── .env.example      # Template das variáveis de ambiente
├── .gitignore        # Arquivos ignorados pelo Git
├── package.json      # Dependências e scripts
└── README.md         # Esta documentação
```

---

## 🔑 Variáveis de Ambiente Completas

```env
MERCADO_PAGO_TOKEN=SEU_ACCESS_TOKEN_AQUI
REPLICATE_API_TOKEN=SEU_TOKEN_REPLICATE_AQUI
WEBHOOK_PIX_URL=https://SEU-DOMINIO.tech/webhook-pix
PORT=3000
```

---

## 🐛 Solução de Problemas

| Problema | Solução |
|---------|---------|
| QR Code não aparece | Delete a pasta `auth_info_baileys/` e reinicie |
| PIX não é gerado | Verifique se `MERCADO_PAGO_TOKEN` está correto |
| Imagem não gerada | Verifique se `REPLICATE_API_TOKEN` está correto |
| Webhook não funciona | Confirme se `WEBHOOK_PIX_URL` está acessível publicamente |

---

## 📞 Suporte

Para dúvidas sobre configuração, consulte:
- [Baileys Docs](https://github.com/WhiskeySockets/Baileys)
- [Mercado Pago Dev](https://www.mercadopago.com.br/developers/pt/docs)
- [Replicate Docs](https://replicate.com/docs)
