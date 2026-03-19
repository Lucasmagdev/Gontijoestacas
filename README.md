# Dashboard Operacional Gontijo

Dashboard operacional com:

- `Acompanhamento Diario`
- `Acumulado Semanal`
- `Analises Operacionais`
- `Admin` com vinculo `IMEI -> maquina -> obra` e metas diaria/semanal

## Stack

- Backend: Node + Express
- Frontend: HTML/CSS/JS em `public/`
- Persistencia admin:
  - preferencial: Supabase
  - fallback local: JSON em desenvolvimento, quando o Supabase nao estiver configurado

## Variaveis de ambiente

Veja [.env.example](c:/Users/Gontijo/Desktop/extraido/.env.example).

Principais:

- `AWS_REGION`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_PREFIX_BASE`
- `S3_CLIENT_LOGIN`
- `ADMIN_PASSWORD`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TV_ROTATION_SECONDS`
- `TV_SECONDARY_ROTATION_SECONDS`
- `TV_AUTO_REFRESH_SECONDS`

## Rodando localmente

```bash
npm install
npm run dev
```

Abra:

- `http://localhost:3000`
- `http://localhost:3000/?screen=primary-tv`
- `http://localhost:3000/?screen=secondary-tv`

## Supabase

Execute o schema em [supabase/machine_mappings.sql](c:/Users/Gontijo/Desktop/extraido/supabase/machine_mappings.sql).

O backend usa:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Se essas variaveis nao estiverem configuradas, o backend cai no modo local para facilitar validacao.

## Endpoints novos

- `POST /api/admin/session`
- `POST /api/admin/logout`
- `GET /api/admin/status`
- `GET /api/admin/machines`
- `GET /api/admin/mappings`
- `POST /api/admin/mappings`
- `PUT /api/admin/mappings/:id`
- `POST /api/admin/mappings/:id/activate`
- `POST /api/admin/mappings/:id/archive`
- `GET /api/dashboard/daily`
- `GET /api/dashboard/weekly`
- `GET /api/dashboard/secondary`
- `GET /api/display/config`
