// Robô dos comentários do Instagram no Kommo (projeto do Kommo, versão 5, 2026-11-08). Rodar
// `node docs/lyra-base/robo-comentarios.mjs` gera `robo-comentarios.min.json`, colado no modo de código do robô
// "Lyra · Comentários", com o gatilho "comentário recebido" nas 3 contas.
//
// Quem comenta vai para o funil "Instagram · Comentários" (fora dos indicadores), ganha a etiqueta veio-de-comentario e
// recebe UMA mensagem no Direct (regra do Instagram: uma por comentário, até 7 dias). Quem responde no Direct começa uma
// conversa nova e passa pela triagem do canal.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

const FUNIL_COMENTARIOS = 14739447;
const ETAPA = { comentou: 113891259, convidado: 113891263 };
const acao = (name, params) => ({ handler: 'action', params: { name, params } });
const etapa = (value) => acao('change_status', { value, pipeline_id: FUNIL_COMENTARIOS });

const blocos = {
  0: { question: [
    etapa(ETAPA.comentou),
    acao('set_tag', { type: 2, value: ['veio-de-comentario'] }),
    { handler: 'send_message', params: { tag: '', type: 'external', is_in_starting_block: true, send_to_all_chat_sources: true, on_error: null,
      recipient: { type: 'all_contacts', way_of_communication: 'over_all' },
      text: 'Olá! ✨ Vimos o seu comentário e ficamos felizes com o seu interesse. Se quiser saber mais, é só responder esta mensagem que a nossa equipe te atende por aqui. 💙' } },
    etapa(ETAPA.convidado),
    { handler: 'goto', params: { type: 'finish', step: 999 } },
  ] },
};

const saida = { conversation: false };
for (const [k, b] of Object.entries(blocos)) saida[k] = { block_uuid: randomUUID(), ...b };
fs.writeFileSync(new URL('./robo-comentarios.min.json', import.meta.url), JSON.stringify(saida));
console.log('ok');
