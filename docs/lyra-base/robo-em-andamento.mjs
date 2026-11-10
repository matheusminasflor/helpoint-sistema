// Cliente que já está num funil e escreve de novo (dono, 2026-11-10): a Lyra não recomeça; o lead volta para "Com
// atendente" do funil dele, com tarefa, para ficar claro quem atende. Venda ganha, perdida ou conversa fechada
// recomeçam pela Lyra (o gatilho de conversa nova dela). Um robô por funil, porque mudar de etapa pede o funil.
// Gatilho, em cada etapa em andamento do funil: "Em uma mensagem recebida em qualquer canal (após a pausa de 5 min.)".
// `node docs/lyra-base/robo-em-andamento.mjs` gera robo-em-andamento-<funil>.min.json, colado no modo de código.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const FUNIS = {
  consumidor: { pipeline_id: 12904179, comAtendente: 99501151 },
  salao: { pipeline_id: 12927111, comAtendente: 99680859 },
  distribuidor: { pipeline_id: 12927087, comAtendente: 99680647 },
};
const acao = (name, params) => ({ handler: 'action', params: { name, params } });
// Mesmo formato de tarefa do robô de triagem: 45 minutos, para o responsável pelo lead.
const tarefa = (texto) => ({
  handler: 'trigger',
  params: { trigger: { delay: 0, action: 'create_task', segments: [''], settings: {
    task_text: texto, task_type: '1', 'deadline-days': '', 'deadline-hours': '', task_type_name: 'Acompanhar',
    'within-deadline': 'custom', 'deadline-minutes': '45', responsible_user: 'current' },
  date_exec: 0, handler_code: 'amocrm', execution_condition: { id: 45, name: 'execute_trigger' } }, element_type: 'lead' },
});

for (const [nome, f] of Object.entries(FUNIS)) {
  const robo = { conversation: false, 0: { block_uuid: randomUUID(), question: [
    acao('change_status', { value: f.comAtendente, pipeline_id: f.pipeline_id }),
    tarefa('Cliente em andamento escreveu de novo: responder pela conversa (até 45 minutos).'),
    { handler: 'goto', params: { type: 'finish', step: 999 } },
  ] } };
  fs.writeFileSync(new URL(`./robo-em-andamento-${nome}.min.json`, import.meta.url), JSON.stringify(robo));
}
// Distribuidor com o representante (dono, 2026-11-10): em "Enviado para o representante", "Follow-up" e "Negociação" o
// lead fica na etapa e só ganha a tarefa; só "A contatar" volta para "Com atendente" (o robô de cima).
fs.writeFileSync(new URL('./robo-em-andamento-representante.min.json', import.meta.url), JSON.stringify({ conversation: false,
  0: { block_uuid: randomUUID(), question: [
    tarefa('Distribuidor com o representante escreveu de novo: responder pela conversa (até 45 minutos).'),
    { handler: 'goto', params: { type: 'finish', step: 999 } }] } }));
console.log('robôs:', Object.keys(FUNIS).join(', '));
