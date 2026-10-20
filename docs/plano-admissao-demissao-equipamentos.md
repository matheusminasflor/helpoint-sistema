# Admissão, demissão e conferência de equipamentos (plano, 2026-10-20)

Pedido do dono: na demissão, tudo o que está no nome do colaborador volta, com termo de devolução e conferência
item por item; caso real: um mouse da empresa foi para casa e o pessoal ficou no lugar. Revisão automática da TI.

## Decisões do dono (as quatro recomendadas)
1. **Demissão = checklist que trava.** O RH escolhe quem sai; a TI recebe um chamado com tudo no nome da pessoa
   (equipamentos + acessos). Cada item: devolvido ok / devolvido com avaria / não devolvido. O chamado só resolve com
   tudo marcado e o **Termo de Devolução** (PDF) gerado e anexado assinado.
2. **Divergência = pendência + aviso.** "Não devolvido" (ou trocado) exige motivo; avisa gestor do setor da pessoa, RH
   e o dono; fica no histórico do colaborador e do equipamento. Desconto/cobrança é decisão do RH, fora do sistema.
3. **Revisão a cada 30 dias, TI confere.** Chamado mensal "Conferência de equipamentos" com cada pessoa e o que está
   no nome dela; conferido / divergência (divergência segue a regra 2).
4. **Periféricos com patrimônio + foto.** Todo periférico entregue entra no Inventário com etiqueta física e nº de
   série; o equipamento ganha foto, tirada na entrega, para comparar na devolução.

## O que existe hoje (medido)
- `trg_create_offboarding_ti_ticket` / `create_offboarding_ti_ticket()`: chamado RH "Desligamento" abre chamado TI
  "Revogar acessos" com `employee_access_grants`. **Defeito:** o colaborador vem de `NEW.requester_id` (quem abriu),
  não de quem sai.
- Custódia = só `assets.assigned_to`; sem histórico (os termos são o mais próximo).
- `ti_devolver_termo` grava data + observação do termo inteiro; não confere item; não há PDF de devolução.
- `assets` tem `asset_tag` (único) e `serial_number`; sem foto. Periférico = `asset_category 'peripheral'`.
- Agendamento: pg_cron já roda vários jobs; o motor de automações só repete por dia/semana (não 30 dias).

## Etapas
1. **Banco** (migration + pgTAP)
   - Chamado de desligamento do RH ganha "colaborador que sai" (campo do formulário) e o trigger usa ele.
   - `ti_devolucao_itens` (termo/ticket, asset, situação ok/avaria/nao_devolvido, motivo, conferido_por/em) —
     motivo obrigatório fora de "ok"; pendência = linha `nao_devolvido`.
   - O chamado TI do desligamento lista equipamentos no nome da pessoa + acessos; guard impede resolver com item sem
     marca ou sem termo de devolução assinado anexado.
   - Aviso (notificação) ao gestor do setor, RH e dono quando há `nao_devolvido`.
   - `asset_historico` (quem teve, de quando a quando, por qual termo) preenchido por trigger em `assigned_to`.
   - `assets.foto_caminho` (balde privado); conferência mensal por pg_cron no dia 1º, chamado TI com checklist por
     pessoa (`ti_conferencias` + itens), divergência reaproveita a regra de pendência.
2. **Front**: checklist de devolução no chamado; Termo de Devolução em PDF (mesmo modelo do termo de entrega);
   foto no cadastro/termo; histórico no detalhe do equipamento e do colaborador; tela da conferência mensal.
3. **Prova**: pgTAP (trava do chamado, motivo obrigatório, aviso, conferência criada uma vez por mês) + navegação.
