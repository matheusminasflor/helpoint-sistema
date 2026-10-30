# Rotinas do dia — proposta aprovada (2026-10-30)

Pedido do dono (2026-10-30): "um sistema de rotinas onde cada colaborador tem suas rotinas; que vejam o que precisam
fazer de manhã, tarde e final do dia, e depois seus chamados". Proposta visual:
https://claude.ai/artifact/XnAcBLK9zoHDgoHRn7qjC8

## O que foi medido antes

- 16 pessoas ativas. `tasks` só tem atividades de projeto (141, todas de 2026-10-07/08); tarefa pessoal: 0.
- `calendar_events`: 113 lembretes de 4 pessoas, 105 numa única série repetida — rotina improvisada na Agenda.
- A Agenda já tem o tipo "Rotina" (`event_type = 'routine'`), sem uso. Continua sendo compromisso com hora; não muda.
- Início: `src/components/dashboard/DailyCuration.tsx` — o bloco entra antes de "Para fazer" (lista de chamados).

## Como funciona

- **Rotina (modelo):** o que fazer, período (manhã / tarde / fim do dia), repetição (todo dia útil; dias da semana;
  uma vez por mês no dia X; último dia útil do mês), para quem (uma ou mais pessoas do setor), o que pede ao marcar
  (nada / observação / foto ou arquivo), "como fazer" opcional (texto ou Diretriz do setor), e se passa ao substituto
  nas férias.
- **Registro:** cada marcação ou pulo (pessoa, dia, hora, motivo, anexo). "Pular" exige motivo.
- **A lista do dia é calculada na hora**, a partir dos modelos — sem gerar linhas por cron.
- Pula sozinha: fim de semana, feriado da empresa (`feriados_da_empresa`), feriado nacional, férias/ausência
  (`ausencias_que_repassam`).
- Períodos: manhã até o almoço da pessoa (`rh_employee_profiles.inicio_almoco`), tarde até a última hora do
  expediente, fim do dia = a última hora. Sem almoço cadastrado: 12h e 17h.
- Início: período atual aberto e em azul, os outros recolhidos com "x de y"; barra de progresso; "Tudo feito hoje ✓".
- Gestor: Início › Rotinas › "Da minha equipe" (pessoa × período em bolinhas, % do mês); relatório no computador
  (cumprimento por pessoa/setor/semana, mais puladas e motivos, horário médio).
- Permissão: seção "Rotinas" no perfil de cada setor (Ver da equipe / Criar e editar / Excluir), na tela e no banco.

## Decisões do dono (todas as recomendadas)

1. **Quem cadastra:** o gestor cadastra as da equipe e cada pessoa pode criar as suas; a do gestor a pessoa não apaga.
2. **Não feita:** fica registrada como "não feita" e não passa para o dia seguinte.
3. **Aviso:** um só, 30 minutos antes do fim do expediente, no "Lyra avisa" e no celular, para quem tem rotina aberta.
4. **Férias/ausência:** a rotina pausa; o gestor pode marcar na rotina "passa para o substituto".

## Etapas

1. Cadastrar e marcar: tabelas + RLS + pgTAP, tela de cadastro, bloco no Início e no celular, pular com motivo, foto.
2. Gestor e relatório.
3. Aviso antes do fim do expediente.
