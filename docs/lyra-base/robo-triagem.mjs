// O robô de triagem da Lyra no Kommo (Salesbot), em código. Rodar `node docs/lyra-base/robo-triagem.mjs` gera
// `robo-triagem.json`, que é colado no modo de código do robô "Lyra · Triagem v2" (projeto do Kommo, passo 3; o dono
// escolheu o modo de código em 2026-11-08). Os textos ficam aqui: mudar uma mensagem é mudar este arquivo e colar de novo.
//
// Formato aprendido do robô antigo "BOT INICIAL MF" e do modelo "Bot de boas-vindas" do próprio Kommo:
// cada bloco é {block_uuid, question:[...], answer?:[...], no_answer?}; `goto` com type question/finish.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

// Números da conta ticminasflor (leitura de 2026-11-08).
const FUNIL = { consumidor: 12904179, salao: 12927111, distribuidor: 12927087, atendimento: 14739451 };
const ETAPA = { consumidorThayna: 99501151, salaoThayna: 99680859, distribuidorThayna: 99680647, posVenda: 113891275 };
const CAMPO = { segmento: 4381514, cpfCnpj: 4381512, marca: 4381516 };

const goto = (step, type = 'question') => ({ handler: 'goto', params: { type, step } });
const fim = { handler: 'goto', params: { type: 'finish', step: 999 } };
const msg = (text, extra = {}) => ({
  handler: 'send_message',
  params: { tag: '', text, type: 'external', recipient: { type: 'all_contacts', way_of_communication: 'over_all' },
    is_in_starting_block: false, send_to_all_chat_sources: true, on_error: null, ...extra },
});
const acao = (name, params) => ({ handler: 'action', params: { name, params } });
const etapa = (pipeline_id, value) => acao('change_status', { value, pipeline_id });
const campoLead = (id, value) => acao('set_custom_fields', { value, custom_field: `{{lead.cf.${id}}}` });
const nomeDoLead = acao('set_custom_fields', { value: '{{message_text}}', custom_field: '{{lead.name}}' });
const etiqueta = (nome) => acao('set_tag', { type: 1, value: [nome], element_type: 2 });
const esperaResposta = (step) => ({ handler: 'waits', params: { logic: 'or', conditions: [{ event: { action: 'received', source: 'message' }, action: { type: 'question', step } }] } });
// Tarefa para quem cuida do lead, com prazo de 30 minutos (no robô antigo: "Em 1 dia" = within-deadline 1).
const tarefa = (texto) => ({
  handler: 'trigger',
  params: { trigger: { delay: 0, action: 'create_task', segments: [''], settings: {
    task_text: texto, task_type: '1', 'deadline-days': '', 'deadline-hours': '', task_type_name: 'Acompanhar',
    'within-deadline': '', 'deadline-minutes': '30', responsible_user: 'current' },
  date_exec: 0, handler_code: 'amocrm', execution_condition: { id: 45, name: 'execute_trigger' } }, element_type: 'lead' },
});

const PRAZO = 'Nossa equipe te responde em até 30 minutos no horário comercial. Fora dele, falamos com você assim que abrirmos 💜';
const BOTOES = ['Uso em casa', 'Tenho salão', 'Revendo/distribuo', 'Já sou cliente'];
const respostaDosBotoes = (seNaoEntender) => [{
  handler: 'buttons',
  params: [
    { value: 'Uso em casa', params: [goto(10)], synonyms: ['1', 'casa', 'Consumidor Final', 'consumidor final', 'consumidor', 'pra mim', 'uso pessoal'] },
    { value: 'Tenho salão', params: [goto(20)], synonyms: ['2', 'Salão', 'salão', 'salao', 'SALÃO', 'cabeleireira', 'cabeleireiro', 'profissional'] },
    { value: 'Revendo/distribuo', params: [goto(30)], synonyms: ['3', 'Distribuidor', 'distribuidor', 'revenda', 'revendo', 'revender', 'distribuir'] },
    { value: 'Já sou cliente', params: [goto(40)], synonyms: ['4', 'já sou cliente', 'pedido', 'meu pedido', 'rastreio', 'troca', 'entrega'] },
    { type: 'else', params: [goto(seNaoEntender)] },
  ],
}];

const blocos = {
  // Saudação e triagem.
  0: { question: [], answer: respostaDosBotoes(50) }, // a mensagem entra logo abaixo
  // Escreveu outra coisa: pergunta de novo uma vez; na segunda, passa para a equipe.
  50: { question: [msg('Desculpa, não entendi 😊 Toque em uma das opções:', { buttons: BOTOES.map((text) => ({ type: 'inline', text })) })], answer: respostaDosBotoes(51) },
  51: { question: [msg(`Sem problema! Vou chamar alguém da equipe para te ajudar. ${PRAZO}`), tarefa('Lyra não conseguiu fazer a triagem: responder o cliente e escolher o segmento (campo Segmento).'), fim] },

  // Uso em casa.
  10: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorThayna), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'), goto(11)] },
  11: { question: [msg('Que bom! 💜 Como você se chama?'), goto(12)] },
  12: { question: [esperaResposta(13)] },
  13: { question: [nomeDoLead, goto(14)] },
  // Consumidor escolhe a marca: BY.MF compra sozinho no site; Minasflor e MF.PRO não têm loja aberta (para não
  // concorrer com o distribuidor), então a Lyra anota os produtos e a Thayná gera o link de pagamento da Yampi.
  14: { question: [msg('Prazer! 😊 Qual marca você procura?', { buttons: ['BY.MF', 'Minasflor', 'MF.PRO'].map((text) => ({ type: 'inline', text })) })],
    answer: [{ handler: 'buttons', params: [
      { value: 'BY.MF', params: [goto(15)], synonyms: ['by.mf', 'bymf', 'BYMF', 'by mf'] },
      { value: 'Minasflor', params: [goto(16)], synonyms: ['minasflor', 'Minas Flor', 'minas flor'] },
      { value: 'MF.PRO', params: [goto(17)], synonyms: ['mf.pro', 'mfpro', 'MF PRO', 'mf pro'] },
      { type: 'else', params: [goto(18)] },
    ] }] },
  15: { question: [campoLead(CAMPO.marca, 'BY.MF'), msg('Perfeito! A loja da BY.MF é https://bymfpro.com.br/ , com Pix ou cartão e o frete calculado pelo seu CEP 💜 Se tiver qualquer dúvida, é só me chamar aqui.'), fim] },
  16: { question: [campoLead(CAMPO.marca, 'Minasflor'), goto(18)] },
  17: { question: [campoLead(CAMPO.marca, 'MF.PRO'), goto(18)] },
  18: { question: [msg('Ótimo! Me conta quais produtos e quantas unidades você quer 😊 Nossa equipe monta um link de pagamento só para você, com Pix ou cartão.'), goto(19)] },
  19: { question: [esperaResposta(9)] },
  9: { question: [msg(`Anotado! ${PRAZO}`), tarefa('Consumidor pediu Minasflor/MF.PRO pela Lyra: montar o link de pagamento da Yampi com os produtos da conversa (até 30 minutos).'), fim] },

  // Salão.
  20: { question: [etapa(FUNIL.salao, ETAPA.salaoThayna), campoLead(CAMPO.segmento, 'Salão'), etiqueta('salao'), goto(21)] },
  21: { question: [msg('Que bom! 💇‍♀️ Como você se chama, e qual é o nome do salão?'), goto(22)] },
  22: { question: [esperaResposta(23)] },
  23: { question: [nomeDoLead, goto(24)] },
  24: { question: [msg('Prazer! Para liberar o preço profissional, me passa o CNPJ do salão ou o seu CPF? Uso só para isso 🔒'), goto(25)] },
  25: { question: [esperaResposta(26)] },
  26: { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(27)] },
  27: { question: [msg(`Obrigada! ${PRAZO}`), tarefa('Salão triado pela Lyra: responder em até 30 minutos (CPF/CNPJ no lead).'), fim] },

  // Revenda / distribuidor.
  30: { question: [etapa(FUNIL.distribuidor, ETAPA.distribuidorThayna), campoLead(CAMPO.segmento, 'Distribuidor'), etiqueta('distribuidor'), goto(31)] },
  31: { question: [msg('Ótimo! Como você se chama, e qual é o nome da empresa?'), goto(32)] },
  32: { question: [esperaResposta(33)] },
  33: { question: [nomeDoLead, goto(34)] },
  34: { question: [msg('Prazer! Para te passar a condição de revenda e o representante da sua região, qual é o CNPJ da empresa?'), goto(35)] },
  35: { question: [esperaResposta(36)] },
  36: { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(37)] },
  37: { question: [msg(`Obrigada! Já passei para a nossa consultora comercial. ${PRAZO}`), tarefa('Distribuidor triado pela Lyra: responder em até 30 minutos e encaminhar ao representante (CNPJ no lead).'), fim] },

  // Já é cliente: pós-venda, fora dos indicadores.
  40: { question: [etapa(FUNIL.atendimento, ETAPA.posVenda), etiqueta('pos-venda'), msg(`Claro! Me conta o número do pedido ou o que aconteceu, que já chamo alguém da equipe. ${PRAZO}`), tarefa('Pós-venda: cliente pediu ajuda com pedido, troca ou entrega.'), fim] },
};

// Bloco 0: a mensagem com os botões, marcada como bloco inicial.
blocos[0].question = [{ handler: 'send_message', params: { ...msg('').params,
  text: 'Oi! Eu sou a Lyra, assistente virtual da Minasflor ✨ Cuido das marcas BY.MF, Minasflor e MF.PRO. Se preferir falar com alguém da equipe, é só pedir. Para te indicar certinho, você:',
  buttons: BOTOES.map((text) => ({ type: 'inline', text })), is_in_starting_block: true } }];

const saida = { conversation: false };
for (const [k, b] of Object.entries(blocos)) saida[k] = { block_uuid: randomUUID(), ...b };
const destino = new URL('./robo-triagem.json', import.meta.url);
fs.writeFileSync(destino, JSON.stringify(saida, null, 2));
if (process.argv[2] === "--min") fs.writeFileSync(new URL("./robo-triagem.min.json", import.meta.url), JSON.stringify(saida));
console.log('blocos', Object.keys(blocos).length, '→', destino.pathname);
