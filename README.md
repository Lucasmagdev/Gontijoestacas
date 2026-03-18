# Teste web de estacas no S3

Aplicacao minima para testar, via navegador, se as credenciais AWS conseguem listar arquivos de estacas por `cliente`, `IMEI` e `data`.

## O que faz

- valida acesso ao bucket com `/api/health`
- consulta objetos no S3 com `/api/estacas?clientLogin=...&imei=...&date=YYYY-MM-DD`
- baixa e converte uma estaca com `/api/estacas/detail?key=...`
- exporta o compilado diario em PDF com `/api/estacas/summary/pdf?...`
- monta o prefixo no formato `c/<cliente>/h/<imei>/<ano>/<mes>/<dia>/`
- exibe os arquivos encontrados na interface web
- mostra detalhes convertidos da estaca usando `sacibin2txt`

## Configuracao

1. Copie `.env.example` para `.env`
2. Preencha:

```env
PORT=3000
AWS_REGION=sa-east-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
S3_BUCKET=m.geodigitus.com.br
S3_PREFIX_BASE=c
S3_CLIENT_LOGIN=cgontijo
```

## Rodando localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Deploy no Render

Crie um novo `Web Service` apontando para este projeto e configure:

- Build Command: `npm install`
- Start Command: `npm start`

Variaveis de ambiente no Render:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_PREFIX_BASE`

## Observacoes

- O projeto usa `tools/sacibin2txt.exe` no Windows e `tools/sacibin2txt` no Linux.
- O campo do cliente pode ser informado na tela; se nao for, o backend usa `S3_CLIENT_LOGIN`.
