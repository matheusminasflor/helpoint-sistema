# Autorizar o Helpoint no Google Workspace (uma vez só)

Feito por quem é **administrador** do Google Workspace da Minasflor. São uns 15 minutos. Depois disso o Helpoint lê a
agenda e as reuniões do Meet (gravação, transcrição e anotações) de **todas as contas da empresa**, sem ninguém
conectar a própria conta. Decisão do dono, 2026-11-02 (`docs/proposta-reunioes-google.md`).

> **A chave nunca passa pela conversa nem por e-mail.** No passo 4 ela vai direto do seu computador para o cofre do
> Helpoint (segredos do Supabase). Depois de colar, apague o arquivo baixado.

## 1. Confirmar o plano

Em **admin.google.com › Faturamento › Assinaturas**: o plano precisa ser **Business Standard ou superior** (é o que
grava e transcreve no Meet). Anote o nome do plano e me diga.

## 2. Criar o projeto no Google Cloud

1. Entre em **console.cloud.google.com** com a conta de administrador.
2. No topo, **Selecionar projeto › Novo projeto** → nome: `Helpoint` → Criar.
3. Menu **APIs e serviços › Biblioteca**. Ative uma por uma:
   - **Google Calendar API**
   - **Google Meet REST API**
   - **Google Drive API** (a transcrição e as anotações ficam como documentos no Drive de quem organizou)

## 3. Criar a conta de serviço

1. **IAM e administrador › Contas de serviço › Criar conta de serviço**.
2. Nome: `helpoint-google` → Criar e continuar → Concluir (não precisa dar papel nenhum).
3. Abra a conta criada e copie o **ID exclusivo** (um número comprido). Ele é o "ID do cliente" do passo 5.
4. Aba **Chaves › Adicionar chave › Criar nova chave › JSON**. Um arquivo `.json` é baixado.

Se aparecer "a criação de chaves está desativada pela política da organização", me avise antes de mexer: é uma
regra de segurança do Google que dá para liberar só para este projeto.

## 4. Guardar a chave no cofre do Helpoint

1. Entre em **supabase.com › projeto helpoint-producao › Edge Functions › Secrets**.
2. **Add new secret**:
   - Name: `GOOGLE_SERVICE_ACCOUNT_JSON`
   - Value: abra o arquivo `.json` no Bloco de Notas, copie **tudo** e cole.
3. Salve e **apague o arquivo** baixado (e da lixeira).

## 5. Autorizar no painel do Workspace

1. **admin.google.com › Segurança › Controles de acesso e de dados › Controles de API**.
2. **Gerenciar a delegação em todo o domínio › Adicionar nova**.
3. ID do cliente: o número do passo 3.3.
4. Escopos do OAuth (cole a linha inteira, separada por vírgulas):

```
https://www.googleapis.com/auth/calendar.readonly,https://www.googleapis.com/auth/meetings.space.readonly,https://www.googleapis.com/auth/drive.readonly
```

5. **Autorizar.**

São só de **leitura**: o Helpoint lê a agenda, as gravações, as transcrições e as anotações; não cria, não apaga e
não muda nada no Google.

## 6. Ligar a transcrição e as anotações nas reuniões

Em **admin.google.com › Apps › Google Workspace › Google Meet › Configurações de vídeo do Meet**: deixe ligadas a
**transcrição** e as **anotações do Gemini** ("Fazer anotações para mim"). Quem organiza a reunião ainda pode ligar na
hora; o que não for transcrito não vira pauta.

## Depois

Me avise que terminou. Eu confiro a conexão (sem ver a chave), e a etapa 2 começa: as reuniões de cada pessoa na Agenda
do Helpoint.
