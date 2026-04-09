# Configuração do Supabase para Multi-Tenancy

Para que o sistema de múltiplos clientes (tenants) funcione corretamente, você precisa executar os seguintes comandos SQL no editor SQL do seu painel Supabase:

```sql
-- 1. Criar a tabela de Clientes (Tenants)
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  subdomain TEXT UNIQUE NOT NULL,
  unifi_url TEXT NOT NULL,
  unifi_user TEXT NOT NULL,
  unifi_pass TEXT NOT NULL,
  unifi_site TEXT DEFAULT 'default',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Adicionar a coluna tenant_id na tabela de registros
-- Se a coluna já existir, este comando falhará, o que é seguro.
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

-- 3. (Opcional) Criar um índice para melhorar a performance de busca por cliente
CREATE INDEX IF NOT EXISTS idx_registrations_tenant_id ON registrations(tenant_id);
```

### Como funciona:
1. **Domínio Principal:** Configure a variável `BASE_DOMAIN` no seu ambiente (ex: `unificaptive.com.br`).
2. **Portal Superadmin:** O acesso administrativo global agora é feito através de `dash.unificaptive.com.br`.
3. **Subdomínios de Clientes:** O sistema identifica o cliente pelo que vem antes do domínio principal (ex: `cliente1.unificaptive.com.br` -> `cliente1`).
4. **Isolamento:** Cada cliente verá apenas os registros que possuem o seu `tenant_id`.
4. **Configuração UniFi:** O backend buscará a URL e credenciais da controladora UniFi diretamente da tabela `tenants` com base no subdomínio acessado.
