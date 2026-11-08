// O robô de triagem da Lyra no Kommo (Salesbot), em código. Rodar `node docs/lyra-base/robo-triagem.mjs` gera
// `robo-triagem.json`, que é colado no modo de código do robô "Lyra · Triagem v2" (projeto do Kommo, passo 3; o dono
// escolheu o modo de código em 2026-11-08). Os textos ficam aqui: mudar uma mensagem é mudar este arquivo e colar de novo.
//
// Formato aprendido do robô antigo "BOT INICIAL MF" e do modelo "Bot de boas-vindas" do próprio Kommo:
// cada bloco é {block_uuid, question:[...], answer?:[...], no_answer?}; `goto` com type question/finish.
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';

// Números da conta ticminasflor (leitura de 2026-11-08).
const FUNIL = { consumidor: 12904179, salao: 12927111, distribuidor: 12927087, atendimento: 14739451, entrada: 13975223 };
const ETAPA = { consumidorThayna: 99501151, salaoThayna: 99680859, distribuidorThayna: 99680647, posVenda: 113891275, entradaThayna: 113893475 };
const CAMPO = { segmento: 4381514, cpfCnpj: 4381512, marca: 4381516, estadoAtuacao: 4381528, cidadeAtuacao: 4381530 };

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
// Formatos de etiqueta, tarefa e lista lidos de um robô de rascunho montado no editor visual (2026-11-08, não salvo).
const etiqueta = (nome) => acao('set_tag', { type: 2, value: [nome] }); // type 2 = lead
// Lista do WhatsApp: uma mensagem só, com o botão "Ver opções" (até 10 linhas). Botão comum passa de 3 e o WhatsApp
// parte em várias mensagens repetidas, o que o dono reprovou ("ficou horrível"). Cada linha volta como callback_data,
// e quem digita em vez de tocar cai nos sinônimos.
const lista = (body, linhas) => ({
  handler: 'list_message',
  params: { list_message: { header: '', body, footer: '', button: 'Ver opções',
    sections: [{ title: 'Opções', rows: linhas.map(({ id, title }) => ({ callback_data: id, title, description: '' })) }] },
  recipient: { type: 'all_contacts', way_of_communication: 'over_all' }, disabled: false },
});
const linha = (title) => ({ id: randomUUID(), title });
const esperaResposta = (step) => ({ handler: 'waits', params: { logic: 'or', conditions: [{ event: { action: 'received', source: 'message' }, action: { type: 'question', step } }] } });
// Tarefa para quem cuida do lead, com prazo de 30 minutos ("within-deadline" vazio virava 5 minutos; o certo é "custom").
const tarefa = (texto) => ({
  handler: 'trigger',
  params: { trigger: { delay: 0, action: 'create_task', segments: [''], settings: {
    task_text: texto, task_type: '1', 'deadline-days': '', 'deadline-hours': '', task_type_name: 'Acompanhar',
    'within-deadline': 'custom', 'deadline-minutes': '30', responsible_user: 'current' },
  date_exec: 0, handler_code: 'amocrm', execution_condition: { id: 45, name: 'execute_trigger' } }, element_type: 'lead' },
});

// Regra do dono (2026-11-08): nenhuma mensagem promete prazo ao cliente ("o lead quer resposta na hora"); o prazo de
// 30 minutos fica só na tarefa de quem atende.
const REGIOES = {
  Sudeste: [['MG', 'Minas Gerais'], ['SP', 'São Paulo'], ['RJ', 'Rio de Janeiro'], ['ES', 'Espírito Santo']],
  Sul: [['PR', 'Paraná'], ['SC', 'Santa Catarina'], ['RS', 'Rio Grande do Sul']],
  'Centro-Oeste': [['GO', 'Goiás'], ['MT', 'Mato Grosso'], ['MS', 'Mato Grosso do Sul'], ['DF', 'Distrito Federal']],
  Nordeste: [['BA', 'Bahia'], ['PE', 'Pernambuco'], ['CE', 'Ceará'], ['MA', 'Maranhão'], ['PB', 'Paraíba'], ['RN', 'Rio Grande do Norte'], ['AL', 'Alagoas'], ['PI', 'Piauí'], ['SE', 'Sergipe']],
  Norte: [['PA', 'Pará'], ['AM', 'Amazonas'], ['RO', 'Rondônia'], ['TO', 'Tocantins'], ['AC', 'Acre'], ['AP', 'Amapá'], ['RR', 'Roraima']],
};
// Um bloco por estado, a partir do 100, que grava a sigla no campo Estado de atuação.
const LINHA_REGIAO = Object.fromEntries(Object.keys(REGIOES).map((r) => [r, linha(r)]));
const LINHA_UF = Object.fromEntries(Object.values(REGIOES).flat().map(([uf, nome]) => [uf, linha(`${uf} · ${nome}`)]));
const UF_BLOCO = Object.fromEntries(Object.values(REGIOES).flat().map(([uf], i) => [uf, 100 + i]));
const AGUARDE = 'Nossa atendente vai entrar em contato com você, é só aguardar 💜';
const OPCOES = Object.fromEntries(['Uso em casa', 'Tenho salão', 'Revendo/distribuo', 'Já sou cliente'].map((t) => [t, linha(t)]));
const respostaDosBotoes = (seNaoEntender) => [{
  handler: 'buttons',
  params: [
    { value: OPCOES['Uso em casa'].id, params: [goto(10)], synonyms: ['Uso em casa', '1', 'casa', 'Consumidor Final', 'consumidor final', 'consumidor', 'pra mim', 'uso pessoal'] },
    { value: OPCOES['Tenho salão'].id, params: [goto(20)], synonyms: ['Tenho salão', '2', 'Salão', 'salão', 'salao', 'SALÃO', 'cabeleireira', 'cabeleireiro', 'profissional'] },
    { value: OPCOES['Revendo/distribuo'].id, params: [goto(30)], synonyms: ['Revendo/distribuo', '3', 'Distribuidor', 'distribuidor', 'revenda', 'revendo', 'revender', 'distribuir'] },
    { value: OPCOES['Já sou cliente'].id, params: [goto(40)], synonyms: ['Já sou cliente', '4', 'já sou cliente', 'pedido', 'meu pedido', 'rastreio', 'troca', 'entrega'] },
    // Sem botão: cumpre a promessa da saudação ("se preferir falar com alguém, é só pedir").
    { value: 'Falar com atendente', params: [goto(51)], synonyms: ['atendente', 'falar com atendente', 'quero falar com atendente', 'falar com alguém', 'quero falar com alguém', 'pessoa', 'humano', 'atendimento'] },
    { type: 'else', params: [goto(seNaoEntender)] },
  ],
}];

const blocos = {
  // Saudação e triagem.
  0: { question: [], answer: respostaDosBotoes(50) }, // a mensagem entra logo abaixo
  // Regra do dono (2026-11-08): o segmento é obrigatório. Quem escreve em vez de escolher recebe as opções de novo,
  // quantas vezes for preciso; só "falar com atendente" passa direto para a Thayná, na Entrada (sem triagem).
  50: { question: [lista('Para eu te atender certinho, primeiro me diz quem você é 😊 Toque em "Ver opções":', Object.values(OPCOES))], answer: respostaDosBotoes(50) },
  51: { question: [etapa(FUNIL.entrada, ETAPA.entradaThayna), etiqueta('pediu-atendente'), msg('Claro! Vou te passar para a nossa atendente, ela continua com você por aqui, é só aguardar 💜'), tarefa('Cliente pediu atendente antes da triagem: responder e preencher o Segmento.'), fim] },
  // Depois do segmento: escreveu o produto em vez de escolher a marca → passa para a Thayná.
  52: { question: [msg('Anotado! Vou te passar para a nossa atendente, ela continua com você por aqui e te ajuda a escolher, é só aguardar 💜'), tarefa('Consumidor escreveu o que quer em vez de escolher a marca: responder pela conversa (até 30 minutos).'), fim] },

  // Uso em casa.
  10: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorThayna), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'), goto(11)] },
  11: { question: [msg('Que bom! 💜 Como você se chama?'), goto(12)] },
  12: { question: [esperaResposta(13)] },
  13: { question: [nomeDoLead, goto(14)] },
  // Consumidor escolhe a marca: BY.MF compra sozinho no site; Minasflor e MF.PRO não têm loja aberta (para não
  // concorrer com o distribuidor), então a Lyra anota os produtos e a Thayná gera o link de pagamento da Yampi.
  // Regra do dono (2026-11-08): o consumidor compra Minasflor só home care (300 ml / 300 g; litro e embalagem
  // profissional são só para salão) e, da MF.PRO, só o Fusion da linha Therapy.
  14: { question: [msg('Qual destas você procura? 😊', { buttons: ['BY.MF', 'Minasflor', 'Fusion (MF.PRO)'].map((text) => ({ type: 'inline', text })) })],
    answer: [{ handler: 'buttons', params: [
      { value: 'BY.MF', params: [goto(15)], synonyms: ['by.mf', 'bymf', 'BYMF', 'by mf'] },
      { value: 'Minasflor', params: [goto(16)], synonyms: ['minasflor', 'Minas Flor', 'minas flor'] },
      { value: 'Fusion (MF.PRO)', params: [goto(17)], synonyms: ['fusion', 'Fusion', 'mf.pro', 'MF.PRO', 'mfpro', 'MF PRO', 'mf pro', 'therapy'] },
      { type: 'else', params: [goto(52)] },
    ] }] },
  15: { question: [campoLead(CAMPO.marca, 'BY.MF'), msg('Perfeito! A loja da BY.MF é https://bymfpro.com.br/ , com Pix ou cartão e o frete calculado pelo seu CEP 💜 Se tiver qualquer dúvida, é só me chamar aqui.'), fim] },
  16: { question: [campoLead(CAMPO.marca, 'Minasflor'), msg('Para usar em casa, a Minasflor tem as versões home care, de 300 ml e 300 g 💜 (as de litro e as embalagens profissionais são só para salão).'), goto(18)] },
  17: { question: [campoLead(CAMPO.marca, 'MF.PRO'), msg(
    'Da MF.PRO, para usar em casa temos o Fusion da linha Therapy: shampoo e balm de base neutra, que você personaliza com um óleo essencial conforme o que o seu couro cabeludo pede 🌿\n\n' +
    '• Hortelã-pimenta: sensação refrescante, ajuda a controlar a oleosidade (pode arder se usar demais)\n' +
    '• Melaleuca: sensação de limpeza, para couro cabeludo oleoso ou com descamação\n' +
    '• Lavanda: ação calmante, para couro cabeludo sensível\n' +
    '• Laranja doce: calmante e de aroma relaxante\n' +
    '• Alecrim: energizante, ajuda a fortalecer os fios\n\n' +
    'A quantidade de gotas a nossa equipe te orienta certinho.'), goto(18)] },
  18: { question: [msg('Me conta quais produtos e quantas unidades você quer (no Fusion, diga também qual óleo) 😊 Nossa equipe monta um link de pagamento só para você, com Pix ou cartão.'), goto(19)] },
  19: { question: [esperaResposta(9)] },
  9: { question: [msg(`Anotado! ${AGUARDE}`), tarefa('Consumidor pediu Minasflor/MF.PRO pela Lyra: montar o link de pagamento da Yampi com os produtos da conversa (até 30 minutos).'), fim] },

  // Salão.
  20: { question: [etapa(FUNIL.salao, ETAPA.salaoThayna), campoLead(CAMPO.segmento, 'Salão'), etiqueta('salao'), goto(21)] },
  21: { question: [msg('Que bom! 💇‍♀️ Como você se chama, e qual é o nome do salão?'), goto(22)] },
  22: { question: [esperaResposta(23)] },
  23: { question: [nomeDoLead, goto(24)] },
  // Regra do dono (2026-11-08): salão só com CNPJ; sem CNPJ, o preço profissional não vale e a Lyra oferece o uso em
  // casa. Com CNPJ, a pessoa já faz o pedido na conversa e a Thayná monta.
  24: { question: [msg('Prazer! O preço profissional é para salão com CNPJ. Você tem o CNPJ do salão?', { buttons: ['Tenho CNPJ', 'Não tenho'].map((text) => ({ type: 'inline', text })) })],
    answer: [{ handler: 'buttons', params: [
      { value: 'Tenho CNPJ', params: [goto(60)], synonyms: ['tenho', 'sim', 'Sim', 'tenho cnpj'] },
      { value: 'Não tenho', params: [goto(65)], synonyms: ['não', 'nao', 'Não', 'não tenho', 'nao tenho', 'sou autônoma', 'autônoma', 'autonoma'] },
      { type: 'else', params: [goto(61)] }, // quem já digitou o número
    ] }] },
  60: { question: [msg('Me passa o CNPJ, por favor 🔒 Uso só para liberar o preço profissional.'), goto(25)] },
  25: { question: [esperaResposta(26)] },
  26: { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(27)] },
  61: { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(27)] },
  27: { question: [msg('Perfeito! Me conta quais produtos você tem interesse e quantas unidades, que eu já deixo o seu pedido anotado 😊'), goto(28)] },
  28: { question: [esperaResposta(29)] },
  29: { question: [msg('Anotado! Nossa atendente vai entrar em contato para fechar o seu pedido, é só aguardar 💜'), tarefa('Salão (CNPJ no lead) fez o pedido pela Lyra: montar o pedido com os produtos da conversa (até 30 minutos).'), fim] },
  65: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorThayna), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'), etiqueta('profissional-sem-cnpj'),
    msg('Sem problema! O preço profissional é só para salão com CNPJ, mas para usar em casa temos ótimas opções 💜'), goto(14)] },

  // Revenda / distribuidor.
  30: { question: [etapa(FUNIL.distribuidor, ETAPA.distribuidorThayna), campoLead(CAMPO.segmento, 'Distribuidor'), etiqueta('distribuidor'), goto(31)] },
  31: { question: [msg('Ótimo! Como você se chama, e qual é o nome da empresa?'), goto(32)] },
  32: { question: [esperaResposta(33)] },
  33: { question: [nomeDoLead, goto(34)] },
  // Regra do dono (2026-11-08): do distribuidor a Lyra precisa do nome, da empresa, do CNPJ e de onde pretende atuar.
  34: { question: [msg('Prazer! Qual é o CNPJ da empresa?'), goto(35)] },
  35: { question: [esperaResposta(36)] },
  36: { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(37)] },
  // Região de atuação em dois campos (dono, 2026-11-08: "ponto muito importante e para termos indicadores").
  // O estado é escolhido por toque (dono, 2026-11-08: "vão preencher errado"): primeiro a região, depois o estado da
  // região. O WhatsApp mostra até 10 opções por lista; a maior região, o Nordeste, tem 9. Quem digitar a sigla ou o nome
  // também é entendido; outra coisa repete a pergunta.
  37: { question: [lista('Em qual região você pretende atuar como distribuidor? Toque em "Ver opções":', Object.values(LINHA_REGIAO))],
    answer: [{ handler: 'buttons', params: [
      ...Object.keys(REGIOES).map((r, i) => ({ value: LINHA_REGIAO[r].id, params: [goto(70 + i)], synonyms: [r, r.toLowerCase(), r.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()] })),
      ...Object.values(REGIOES).flat().map(([uf, nome]) => ({ value: uf, params: [goto(UF_BLOCO[uf])], synonyms: [uf.toLowerCase(), nome, nome.toLowerCase()] })),
      { type: 'else', params: [goto(37)] },
    ] }] },
  ...Object.fromEntries(Object.entries(REGIOES).map(([, ufs], i) => [70 + i, {
    question: [lista('E qual estado? Toque em "Ver opções":', ufs.map(([uf]) => LINHA_UF[uf]))],
    answer: [{ handler: 'buttons', params: [
      ...ufs.map(([uf, nome]) => ({ value: LINHA_UF[uf].id, params: [goto(UF_BLOCO[uf])], synonyms: [uf, uf.toLowerCase(), nome, nome.toLowerCase(), LINHA_UF[uf].title] })),
      { type: 'else', params: [goto(70 + i)] },
    ] }],
  }])),
  ...Object.fromEntries(Object.values(REGIOES).flat().map(([uf]) => [UF_BLOCO[uf], { question: [campoLead(CAMPO.estadoAtuacao, uf), goto(63)] }])),
  63: { question: [msg('E em qual cidade?'), goto(64)] },
  64: { question: [esperaResposta(66)] },
  66: { question: [campoLead(CAMPO.cidadeAtuacao, '{{message_text}}'), goto(39)] },
  39: { question: [msg('Obrigada! Um representante da nossa equipe vai entrar em contato com você, é só aguardar 💜'), tarefa('Distribuidor triado pela Lyra (CNPJ, estado e cidade de atuação no lead): encaminhar ao representante (até 30 minutos).'), fim] },

  // Já é cliente: pós-venda, fora dos indicadores.
  40: { question: [etapa(FUNIL.atendimento, ETAPA.posVenda), etiqueta('pos-venda'), msg(`Claro! Me conta o número do pedido ou o que aconteceu. ${AGUARDE}`), tarefa('Pós-venda: cliente pediu ajuda com pedido, troca ou entrega.'), fim] },
};

// Bloco 0: a saudação, em lista.
blocos[0].question = [lista('Oi! Eu sou a Lyra, assistente virtual da Minasflor ✨ Cuido das marcas BY.MF, Minasflor e MF.PRO. Se preferir falar com alguém da equipe, é só pedir. Para te indicar certinho, toque em "Ver opções" e me diz quem você é:', Object.values(OPCOES))];

const saida = { conversation: false };
for (const [k, b] of Object.entries(blocos)) saida[k] = { block_uuid: randomUUID(), ...b };
const destino = new URL('./robo-triagem.json', import.meta.url);
fs.writeFileSync(destino, JSON.stringify(saida, null, 2));
if (process.argv[2] === "--min") fs.writeFileSync(new URL("./robo-triagem.min.json", import.meta.url), JSON.stringify(saida));
console.log('blocos', Object.keys(blocos).length, '→', destino.pathname);
