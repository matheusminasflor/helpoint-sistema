# Proposta — Reuniões do Google (Agenda e Meet) no Helpoint

Pedido do dono, 2026-11-02. Desenho aprovado: https://claude.ai/artifact/2o3k7KJoZ5Fy1Lf5DuGj1B

## Como é hoje na Minasflor

- **Uma conta administrativa** do Google Workspace cria as reuniões que precisam ser gravadas ou transcritas e convida
  os colaboradores. Ela só entra quando alguém pede.
- **Reunião criada pelo próprio colaborador** fica de fora. Por isso o dono quer todas as contas.
- **O Google já entrega a gravação, a transcrição e a pauta** (anotações do Gemini) da conta que grava.

## Decisões do dono (2026-11-02)

1. **Conexão: uma autorização só, do administrador do Workspace** (delegação para todo o domínio).
   - O Helpoint lê a agenda e as reuniões de todas as contas da empresa; ninguém conecta a própria conta.
   - A chave da conta de serviço vai direto para os segredos do sistema; nunca passa pela conversa.
2. **A pauta e a transcrição vêm prontas do Google.**
   - O Helpoint busca e mostra as anotações (smart notes do Meet) e a transcrição.
   - **A Lyra não gera pauta.**
   - Observação do dono: a chave do Gemini posta na Lyra acabou em poucos minutos, porque o Helpoint manda dados demais
     para a IA. Investigar antes de qualquer uso de IA aqui.
3. **Quem vê a pauta e a transcrição:** quem participou da reunião e a Diretoria.
4. **Ordem:**
   1. sair do projeto (`docs/especificacao-projetos.md`);
   2. reuniões do Google na Agenda do Helpoint, com aviso antes de começar;
   3. página **Reuniões** com a pauta e a transcrição;
   4. cada item da pauta vira chamado, tarefa na agenda, rotina ou atividade de projeto (novo ou existente).

## O que precisa existir do lado deles

- Um plano do Workspace com gravação e transcrição. Confirmar o plano antes da etapa 3.
- A transcrição (e as anotações) ligada nas reuniões: automática pelo administrador ou ligada por quem organiza.
- A autorização do administrador (passo a passo guiado na etapa 2).

## Base técnica

- **Meet REST API:** `conferenceRecords`, que dá acesso a `recordings`, `transcripts`, as entradas da transcrição e
  `smartNotes`.
- **Workspace Events:** avisam `transcript.fileGenerated` e `smartNote.fileGenerated`.
- **Calendar API:** a agenda de cada conta, via delegação.
- **Agenda única do Helpoint** (`src/telas/Agenda.tsx`): recebe as reuniões, sem criar outra agenda.
