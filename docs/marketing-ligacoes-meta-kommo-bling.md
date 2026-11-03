# Ligar o Helpoint na Meta, no Kommo e no Bling (Indicadores do Marketing)

Decisão do dono, 2026-11-03 (`docs/proposta-indicadores-marketing.md`): os números das redes, do tráfego, dos leads e
das vendas vêm direto da fonte, sem digitar. Cada ligação é feita **uma vez**, por quem administra a conta.

> **Nenhuma chave passa pela conversa, por e-mail ou por WhatsApp.** Cada uma vai direto para o cofre do Helpoint:
> supabase.com › projeto **helpoint-producao** › **Edge Functions › Secrets** › Add new secret.

## 1. Meta (Instagram, página do Facebook e anúncios)

O Helpoint já tem o botão "Conectar com a Meta" (Marketing › Cronograma Social). Falta o aplicativo da Minasflor na Meta.

1. Entre em **developers.facebook.com** com a conta que administra a página e a conta de anúncios da Minasflor.
2. **Meus apps › Criar app** → tipo **Empresa** → nome `Helpoint Minasflor` → associe ao Gerenciador de Negócios
   da Minasflor.
3. No painel do app, adicione os produtos **Login do Facebook para Empresas**, **API do Instagram** e **API de
   Marketing**. Em **Configurações do app › Básico › Domínios do app**, coloque `helpoint.minasflor.com.br`.
4. Em **Login do Facebook para Empresas › Configurações**, no campo **URIs de redirecionamento do OAuth válidos**, cole
   os dois (corrigido em 2026-11-03: a primeira versão deste documento trazia o endereço da função no Supabase, que não
   é para onde o botão volta):

```
https://helpoint.minasflor.com.br/mkt/social?oauth_callback=true
https://helpoint.minasflor.com.br/mkt/social
```

5. Em **Permissões e recursos** (ou nos **Casos de uso**), ative para ler os números: `instagram_basic`,
   `instagram_manage_insights`, `pages_show_list`, `pages_read_engagement`, `read_insights`, `ads_read` e
   `business_management`.
6. Em **Configurações do app › Básico**, copie o **ID do aplicativo** e a **Chave secreta do aplicativo**, e grave no
   cofre como:
   - `META_APP_ID`: o ID;
   - `META_APP_SECRET`: a chave secreta.
   - `META_LOGIN_CONFIG_ID`: o ID da **Configuração** do Login do Facebook para Empresas (não é segredo; aparece no
     endereço do login). Feito em 2026-11-03: configuração "Helpoint Indicadores", variação Geral, token de acesso do
     usuário, as 8 permissões acima, ID 2237502677107324, já no cofre.
7. Deixe o app em **modo de desenvolvimento**. Como as contas são da própria Minasflor e quem conecta é administrador
   do app, não precisa da revisão da Meta.
8. Me avise. Eu libero o botão, você clica em **Conectar com a Meta** no Helpoint e escolhe as 3 contas do Instagram,
   a página e a conta de anúncios.

## 2. Kommo (leads por segmento)

1. No Kommo: **Configurações › Integrações › Criar integração** → **Integração privada**.
2. Nome: `Helpoint`. Permissões: acesso aos **leads** e aos **funis** (só leitura basta).
3. Em **Chaves e escopos**, gere o **token de longa duração**.
4. Grave no cofre:
   - `KOMMO_TOKEN`: o token;
   - `KOMMO_SUBDOMINIO`: o começo do endereço do Kommo da Minasflor (o que vem antes de `.kommo.com`).

## 3. Bling (vendas pelas notas fiscais faturadas)

O Helpoint já tem o "Conectar com o Bling". Falta registrar o aplicativo no Bling.

1. Entre em **developer.bling.com.br** com a conta administradora do Bling da Minasflor.
2. **Cadastrar aplicativo** → nome `Helpoint` → tipo **Aplicativo privado**.
3. Link de redirecionamento:

```
https://joafqgmiirggohxkomrl.supabase.co/functions/v1/bling-oauth
```

4. Escopos: **Notas fiscais** (leitura) e **Pedidos de venda** (leitura).
5. Copie o **Client ID** e o **Client Secret** e grave no cofre:
   - `BLING_CLIENT_ID`
   - `BLING_CLIENT_SECRET`
6. Me avise. Eu libero, e você clica em **Conectar com o Bling** no Helpoint.

## Depois de cada uma

Me diga qual terminou. Eu confiro a ligação (sem ver a chave) e ligo aquele bloco nos Indicadores do Marketing. Elas
são independentes: pode fazer na ordem que quiser.
