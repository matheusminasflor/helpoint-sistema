// Robô "Lyra · Férias" do Kommo (dono, 2026-11-08): nas férias coletivas a Lyra segura a conversa e diz quando a equipe
// volta. Fica DESLIGADO. Antes do recesso, o admin (ou o Claude, a pedido) troca a data em VOLTA, gera de novo
// (`node docs/lyra-base/robo-ferias.mjs`), cola no robô, desliga "Lyra · WhatsApp" e "Lyra · Instagram" e liga este.
// Na volta, desfaz. A tarefa nasce para a atendente responder; a conversa fica em Entrada › Contato inicial.
// No Kommo é o robô 158380 (2026-11-08): criar robô novo dava "Ups! Algo deu errado" (copiar, importar e a API
// recusam), então ele nasceu da cópia vazia "BOT INICIAL MF copiar(1)". Está desligado e SEM gatilho: ao ligar,
// pôr nele os gatilhos de "Lyra · WhatsApp" e "Lyra · Instagram" (mensagem recebida no WhatsApp e nos 3 Instagrams).
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const VOLTA = 'DD/MM'; // a data da volta, como o cliente vai ler
const acao = (name, params) => ({ handler: 'action', params: { name, params } });

const blocos = {
  0: { question: [
    acao('change_status', { value: 107856359, pipeline_id: 13975223 }), // Entrada › Contato inicial
    acao('set_tag', { type: 2, value: ['ferias-coletivas'] }),
    { handler: 'send_message', params: { tag: '', type: 'external', is_in_starting_block: true, send_to_all_chat_sources: true, on_error: null,
      recipient: { type: 'all_contacts', way_of_communication: 'over_all' },
      text: `Olá! ✨ Sou a Lyra, assistente virtual. A nossa equipe está em férias coletivas até ${VOLTA}. Deixe a sua mensagem por aqui que respondemos assim que voltarmos. 💙` } },
    { handler: 'trigger', params: { element_type: 'lead', trigger: { delay: 0, action: 'create_task', segments: [''], date_exec: 0, handler_code: 'amocrm',
      execution_condition: { id: 45, name: 'execute_trigger' },
      settings: { task_text: 'Cliente escreveu nas férias coletivas: responder na volta.', task_type: '1', task_type_name: 'Acompanhar',
        'deadline-days': '1', 'deadline-hours': '', 'deadline-minutes': '', 'within-deadline': 'custom', responsible_user: 'current' } } } },
    { handler: 'goto', params: { type: 'finish', step: 999 } },
  ] },
};

const saida = { conversation: false };
for (const [k, b] of Object.entries(blocos)) saida[k] = { block_uuid: randomUUID(), ...b };
fs.writeFileSync(new URL('./robo-ferias.min.json', import.meta.url), JSON.stringify(saida));
console.log('ok');
