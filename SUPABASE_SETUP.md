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

-- 2. Atualizar a tabela admin_config para suportar Multi-Tenancy
-- Primeiro, vamos remover a estrutura antiga se necessário ou apenas adaptar
-- Recomendado: Limpar admin_config e usar a nova estrutura
CREATE TABLE IF NOT EXISTS admin_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  is_superadmin BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(username, tenant_id)
);

-- 3. Adicionar a coluna tenant_id na tabela de registros
ALTER TABLE registrations ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE;

-- 4. Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_registrations_tenant_id ON registrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_admin_config_tenant_id ON admin_config(tenant_id);

-- 5. Criar o Superadmin inicial (Execute isso após criar as tabelas)
-- Nota: A senha padrão será 'admin123'. O sistema irá gerar o hash automaticamente no primeiro login se não existir, 
-- mas para multi-tenant é melhor inserir manualmente ou via painel.
-- INSERT INTO admin_config (username, password_hash, is_superadmin) 
-- VALUES ('admin', '$2a$10$YourHashHere', true);
```

### Como funciona:
1. **Domínio Principal:** Configure a variável `BASE_DOMAIN` no seu ambiente (ex: `unificaptive.com.br`).
2. **Portal Superadmin:** O acesso administrativo global agora é feito através de `dash.unificaptive.com.br`.
3. **Subdomínios de Clientes:** O sistema identifica o cliente pelo que vem antes do domínio principal (ex: `cliente1.unificaptive.com.br` -> `cliente1`).
4. **Isolamento:** Cada cliente verá apenas os registros que possuem o seu `tenant_id`.
4. **Configuração UniFi:** O backend buscará a URL e credenciais da controladora UniFi diretamente da tabela `tenants` com base no subdomínio acessado.
