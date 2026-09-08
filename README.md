# 📸 Dampier Bot - WhatsApp AI Photo Bot

Bot de WhatsApp para geração de imagens via IA, com pagamento via PIX.
Desenvolvido para ser simples de usar e fácil de hospedar no Azure App Service.

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
| `WEBHOOK_PIX_URL` | URL do seu deploy + `/webhook-pix` | `https://seudominio.tech/webhook-pix` |
| `DATA_DIR` | Onde salvar banco e sessão WhatsApp | `/home/data` (Azure) |

### ⚠️ SEGURANÇA IMPORTANTE
- **NUNCA** suba o arquivo `.env` para o GitHub
- O `.gitignore` já está configurado para protegê-lo
- No Azure, cadastre as variáveis no painel do App Service

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

## ☁️ Deploy no Azure App Service

Veja o guia completo passo a passo no [walkthrough.md](./walkthrough.md).

### Resumo rápido:

1. **Suba o projeto para o GitHub:**
```bash
git init
git add .
git commit -m "feat: MVP Dampier Bot"
git remote add origin https://github.com/SEU-USUARIO/dampier-bot.git
git push -u origin main
```

2. **No Azure App Service:**
   - Crie um App Service (B1, Linux, Node 20, Brazil South)
   - Adicione as variáveis de ambiente no painel
   - Habilite WebSockets
   - Configure o Startup Command: `bash startup.sh`
   - Conecte o repositório GitHub via Publish Profile

3. **Deploy automático:**
   - O GitHub Actions (`azure-deploy.yml`) faz o deploy a cada `git push` ✅

---

## 📁 Estrutura do Projeto

```
dampier-bot/
├── index.js                         # Ponto de entrada - inicializa tudo
├── bot.js                           # Motor do WhatsApp (Baileys)
├── database.js                      # Banco de dados SQLite
├── payments.js                      # Integração Mercado Pago (PIX)
├── ai_engine.js                     # Integração Replicate (IA)
├── startup.sh                       # Script de inicialização do Azure
├── .github/workflows/azure-deploy.yml  # CI/CD automático
├── .env.example                     # Template das variáveis de ambiente
├── .gitignore                       # Arquivos ignorados pelo Git
├── package.json                     # Dependências e scripts
└── README.md                        # Esta documentação
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
