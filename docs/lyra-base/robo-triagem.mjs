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
// "Com a Lyra" enquanto a Lyra conversa; "Com atendente" só quando precisa de uma pessoa (dono, 2026-11-08: "é importante
// separar isso"); BY.MF, que compra sozinho no site, vai para "Link enviado". A etapa se chama "Com atendente", e não pelo
// nome de quem atende hoje, para não precisar mexer quando a pessoa mudar (dono, 2026-11-08).
const ETAPA = { consumidorLyra: 113891167, salaoLyra: 113891215, distribuidorLyra: 113891223, consumidorLink: 113891171, consumidorAtendente: 99501151, salaoAtendente: 99680859, distribuidorAtendente: 99680647, posVenda: 113891275, entradaAtendente: 113893475 };
const CAMPO = { segmento: 4381514, cpfCnpj: 4381512, marca: 4381516, estadoAtuacao: 4381528, cidadeAtuacao: 4381530 };

const goto = (step, type = 'question') => ({ handler: 'goto', params: { type, step } });
const fim = { handler: 'goto', params: { type: 'finish', step: 999 } };
const msg = (text, extra = {}) => ({
  handler: 'send_message',
  params: { tag: '', text, type: 'external', recipient: { type: 'all_contacts', way_of_communication: 'over_all' },
    is_in_starting_block: false, send_to_all_chat_sources: true, on_error: null, ...extra },
});
const botoes = (textos) => ({ buttons: textos.map((text) => ({ type: 'inline', text })) });
const acao = (name, params) => ({ handler: 'action', params: { name, params } });
const etapa = (pipeline_id, value) => acao('change_status', { value, pipeline_id });
const campoLead = (id, value) => acao('set_custom_fields', { value, custom_field: `{{lead.cf.${id}}}` });
const nomeDoLead = acao('set_custom_fields', { value: '{{message_text}}', custom_field: '{{lead.name}}' });
// Formatos de etiqueta, tarefa e lista lidos de um robô de rascunho montado no editor visual (2026-11-08, não salvo).
const etiqueta = (nome) => acao('set_tag', { type: 2, value: [nome] }); // type 2 = lead
// Lista do WhatsApp: uma mensagem só, com o botão "Ver opções" (até 10 linhas). Botão comum passa de 3 e o WhatsApp
// parte em várias mensagens repetidas, o que o dono reprovou ("ficou horrível"). Cada linha volta como callback_data.
const lista = (body, linhas) => ({
  handler: 'list_message',
  params: { list_message: { header: '', body, footer: '', button: 'Ver opções',
    sections: [{ title: 'Opções', rows: linhas.map(({ id, title }) => ({ callback_data: id, title, description: '' })) }] },
  recipient: { type: 'all_contacts', way_of_communication: 'over_all' }, disabled: false },
});
const linha = (title) => ({ id: randomUUID(), title });
const esperaResposta = (step) => ({ handler: 'waits', params: { logic: 'or', conditions: [{ event: { action: 'received', source: 'message' }, action: { type: 'question', step } }] } });
// Tarefa para quem cuida do lead. Prazo padrão de 30 minutos ("within-deadline" vazio virava 5 minutos; o certo é
// "custom"); `dias` troca o prazo por dias.
const tarefa = (texto, { dias } = {}) => ({
  handler: 'trigger',
  params: { trigger: { delay: 0, action: 'create_task', segments: [''], settings: {
    task_text: texto, task_type: '1', 'deadline-days': dias ? String(dias) : '', 'deadline-hours': '', task_type_name: 'Acompanhar',
    'within-deadline': 'custom', 'deadline-minutes': dias ? '' : '30', responsible_user: 'current' },
  date_exec: 0, handler_code: 'amocrm', execution_condition: { id: 45, name: 'execute_trigger' } }, element_type: 'lead' },
});

// Regras do dono (2026-11-08): nenhuma mensagem promete prazo ao cliente; o prazo de 30 minutos fica só na tarefa.
// Tom profissional, sem gíria, com um emoji por mensagem (o dono achou "frio" sem nenhum), e o coração é azul (💙).
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
const OPCOES = Object.fromEntries(['Uso em casa', 'Tenho salão', 'Revendo/distribuo', 'Já sou cliente'].map((t) => [t, linha(t)]));
// A resposta de uma lista não aceita sinônimos (o Kommo recusa a gravação com 400): só o toque conta. Quem escreve
// cai no bloco 53, que procura "atendente" no texto; o resto recebe a lista de novo.
const respostaDosBotoes = () => [{
  handler: 'buttons',
  params: [
    { value: OPCOES['Uso em casa'].id, params: [goto(10)] },
    { value: OPCOES['Tenho salão'].id, params: [goto(20)] },
    { value: OPCOES['Revendo/distribuo'].id, params: [goto(30)] },
    { value: OPCOES['Já sou cliente'].id, params: [goto(40)] },
    { type: 'else', params: [goto(53)] },
  ],
}];
const contem = (palavras, step) => ({ handler: 'conditions', params: { logic: 'or',
  conditions: palavras.map((term2) => ({ term1: '{{message_text}}', term2, operation: 'contains' })), result: [goto(step)] } });
const TRANSFERE = 'Vou transferir o seu atendimento para a nossa equipe, que dará continuidade por aqui. 💙';

const blocos = {
  // Saudação e triagem.
  0: { question: [], answer: respostaDosBotoes() }, // a mensagem entra logo abaixo
  // Regra do dono (2026-11-08): o segmento é obrigatório. Quem escreve em vez de escolher recebe as opções de novo,
  // quantas vezes for preciso; só "atendente" passa direto para uma pessoa, na Entrada (sem triagem).
  50: { question: [lista('Para seguir com o atendimento, selecione uma das opções. Toque em "Ver opções" 👇', Object.values(OPCOES))], answer: respostaDosBotoes() },
  53: { question: [contem(['atendente', 'Atendente', 'ATENDENTE', 'falar com alguém', 'Falar com alguém', 'humano', 'pessoa'], 51), goto(50)] },
  51: { question: [etapa(FUNIL.entrada, ETAPA.entradaAtendente), etiqueta('pediu-atendente'), msg(TRANSFERE), tarefa('Cliente pediu atendente antes da triagem: responder e preencher o Segmento.'), esperaResposta(55)] },
  // Depois do segmento: escreveu o produto em vez de escolher a marca → passa para uma pessoa.
  52: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorAtendente), msg('Obrigada pela informação. Vou transferir o seu atendimento para a nossa equipe, que vai te ajudar a escolher os produtos. 💙'), tarefa('Consumidor escreveu o que quer em vez de escolher a marca: responder pela conversa (até 30 minutos).'), esperaResposta(55)] },
  // Regra do dono (2026-11-08): a conversa não morre no fim do caminho. Quem escreve de novo é passado para uma pessoa:
  // no BY.MF ninguém foi acionado ainda, então nasce a tarefa; nos outros finais a tarefa já existe e só se avisa.
  54: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorAtendente), msg(TRANSFERE), tarefa('Cliente da BY.MF pediu ajuda depois do link da loja: responder pela conversa (até 30 minutos).'), fim] },
  55: { question: [msg('Mensagem recebida. A nossa equipe já está com o seu atendimento e responde por aqui. 💙'), fim] },

  // Uso em casa.
  10: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorLyra), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'), goto(11)] },
  11: { question: [msg('Será um prazer te atender 😊 Qual é o seu nome?'), goto(12)] },
  12: { question: [esperaResposta(13)] },
  13: { question: [nomeDoLead, goto(14)] },
  // Consumidor escolhe a marca: BY.MF compra sozinho no site; Minasflor e MF.PRO não têm loja aberta (para não
  // concorrer com o distribuidor), então a Lyra anota os produtos e a equipe gera o link de pagamento da Yampi.
  // Regra do dono (2026-11-08): da MF.PRO, o consumidor compra só o Fusion da linha Therapy.
  14: { question: [msg('Obrigada! Qual marca você procura? 🛍️', botoes(['BY.MF', 'Minasflor', 'Fusion (MF.PRO)']))],
    answer: [{ handler: 'buttons', params: [
      { value: 'BY.MF', params: [goto(15)], synonyms: ['by.mf', 'bymf', 'BYMF', 'by mf'] },
      { value: 'Minasflor', params: [goto(16)], synonyms: ['minasflor', 'Minas Flor', 'minas flor'] },
      { value: 'Fusion (MF.PRO)', params: [goto(17)], synonyms: ['fusion', 'Fusion', 'mf.pro', 'MF.PRO', 'mfpro', 'MF PRO', 'mf pro', 'therapy'] },
      { type: 'else', params: [goto(52)] },
    ] }] },
  // BY.MF (dono, 2026-11-08): o site não avisa o Kommo da compra, então no dia seguinte nasce a tarefa de conferir; e a
  // mensagem traz o botão "Falar com atendente". Qualquer resposta também passa para uma pessoa.
  15: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorLink), campoLead(CAMPO.marca, 'BY.MF'),
    tarefa('Lead recebeu o link da loja BY.MF: conferir se comprou no site (ganho) ou retomar o contato.', { dias: 1 }),
    msg('A BY.MF tem loja online 🛍️ https://bymfpro.com.br/\n\nO pagamento é por Pix ou cartão, e o frete é calculado pelo CEP na finalização da compra. Se precisar de ajuda, é só tocar no botão abaixo.', botoes(['Falar com atendente']))],
    answer: [{ handler: 'buttons', params: [
      { value: 'Falar com atendente', params: [goto(54)], synonyms: ['atendente', 'falar com atendente'] },
      { type: 'else', params: [goto(54)] },
    ] }] },
  // Site institucional da Minasflor (dono, 2026-11-08): quem não conhece os produtos olha lá e depois diz o que quer.
  16: { question: [campoLead(CAMPO.marca, 'Minasflor'), msg('Você pode conhecer toda a linha Minasflor no nosso site: https://minasflor.com.br/'), goto(18)] },
  17: { question: [campoLead(CAMPO.marca, 'MF.PRO'), msg(
    'Da MF.PRO, para uso em casa indicamos o Fusion, da linha Therapy: shampoo e balm de base neutra, personalizados com um óleo essencial de acordo com a necessidade do couro cabeludo 🌿\n\n' +
    '• Hortelã-pimenta: sensação refrescante, ajuda a controlar a oleosidade\n' +
    '• Melaleuca: sensação de limpeza, para couro cabeludo oleoso ou com descamação\n' +
    '• Lavanda: ação calmante, para couro cabeludo sensível\n' +
    '• Laranja doce: calmante, com aroma relaxante\n' +
    '• Alecrim: energizante, ajuda a fortalecer os fios\n\n' +
    'A quantidade de gotas é orientada pela nossa equipe.'), goto(18)] },
  18: { question: [msg('Por favor, informe os produtos e as quantidades que deseja (no Fusion, informe também o óleo escolhido). A nossa equipe vai preparar um link de pagamento exclusivo para você, com Pix ou cartão 📝'), goto(19)] },
  19: { question: [esperaResposta(9)] },
  9: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorAtendente), msg('Pedido anotado ✅ A nossa equipe vai entrar em contato por aqui para finalizar a sua compra. 💙'), tarefa('Consumidor pediu Minasflor/MF.PRO pela Lyra: montar o link de pagamento da Yampi com os produtos da conversa (até 30 minutos).'), esperaResposta(55)] },

  // Salão.
  20: { question: [etapa(FUNIL.salao, ETAPA.salaoLyra), campoLead(CAMPO.segmento, 'Salão'), etiqueta('salão'), goto(21)] },
  21: { question: [msg('Será um prazer atender o seu salão 💇‍♀️ Por favor, informe o seu nome e o nome do salão.'), goto(22)] },
  22: { question: [esperaResposta(23)] },
  23: { question: [nomeDoLead, goto(24)] },
  // Regra do dono (2026-11-08): salão só com CNPJ; sem CNPJ, as condições profissionais não valem e a Lyra oferece o uso
  // em casa. Com CNPJ, a pessoa já faz o pedido na conversa e a equipe monta.
  24: { question: [msg('Obrigada. As condições profissionais são exclusivas para salões com CNPJ. O seu salão tem CNPJ? 💼', botoes(['Tenho CNPJ', 'Não tenho']))],
    answer: [{ handler: 'buttons', params: [
      { value: 'Tenho CNPJ', params: [goto(60)], synonyms: ['tenho', 'sim', 'Sim', 'tenho cnpj'] },
      { value: 'Não tenho', params: [goto(65)], synonyms: ['não', 'nao', 'Não', 'não tenho', 'nao tenho', 'sou autônoma', 'autônoma', 'autonoma'] },
      { type: 'else', params: [goto(61)] }, // quem já digitou o número
    ] }] },
  60: { question: [msg('Por favor, informe o CNPJ do salão. Ele é usado apenas para liberar as condições profissionais 🔒'), goto(25)] },
  25: { question: [esperaResposta(26)] },
  26: { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(27)] },
  61: { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(27)] },
  27: { question: [msg('Obrigada! Você pode conhecer todos os nossos produtos em https://minasflor.com.br/\n\nDepois é só me dizer quais produtos e quantidades deseja, que eu deixo o seu pedido anotado 📝'), goto(28)] },
  28: { question: [esperaResposta(29)] },
  29: { question: [etapa(FUNIL.salao, ETAPA.salaoAtendente), msg('Pedido anotado ✅ A nossa equipe vai entrar em contato por aqui para finalizar o seu pedido. 💙'), tarefa('Salão (CNPJ no lead) fez o pedido pela Lyra: montar o pedido com os produtos da conversa (até 30 minutos).'), esperaResposta(55)] },
  65: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorLyra), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'), etiqueta('profissional-sem-cnpj'),
    msg('Sem problemas. As condições profissionais são exclusivas para salões com CNPJ, mas temos ótimas opções para uso em casa 😊'), goto(14)] },

  // Revenda / distribuidor.
  30: { question: [etapa(FUNIL.distribuidor, ETAPA.distribuidorLyra), campoLead(CAMPO.segmento, 'Distribuidor'), etiqueta('distribuidor'), goto(31)] },
  31: { question: [msg('Será um prazer conversar sobre a distribuição dos nossos produtos 🤝 Por favor, informe o seu nome e o nome da empresa.'), goto(32)] },
  32: { question: [esperaResposta(33)] },
  33: { question: [nomeDoLead, goto(34)] },
  // Regra do dono (2026-11-08): do distribuidor a Lyra precisa do nome, da empresa, do CNPJ e de onde pretende atuar.
  34: { question: [msg('Obrigada! Qual é o CNPJ da empresa? 🔒'), goto(35)] },
  35: { question: [esperaResposta(36)] },
  36: { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(37)] },
  // Região de atuação em dois campos (dono, 2026-11-08: "ponto muito importante e para termos indicadores").
  // O estado é escolhido por toque (dono, 2026-11-08: "vão preencher errado"): primeiro a região, depois o estado da
  // região. O WhatsApp mostra até 10 opções por lista; a maior região, o Nordeste, tem 9. Quem escreve em vez de
  // tocar recebe a pergunta de novo (lista não aceita sinônimos).
  37: { question: [lista('Em qual região você pretende atuar? 📍 Toque em "Ver opções":', Object.values(LINHA_REGIAO))],
    answer: [{ handler: 'buttons', params: [
      ...Object.keys(REGIOES).map((r, i) => ({ value: LINHA_REGIAO[r].id, params: [goto(70 + i)] })),
      { type: 'else', params: [goto(37)] },
    ] }] },
  ...Object.fromEntries(Object.entries(REGIOES).map(([, ufs], i) => [70 + i, {
    question: [lista('Em qual estado? 📍 Toque em "Ver opções":', ufs.map(([uf]) => LINHA_UF[uf]))],
    answer: [{ handler: 'buttons', params: [
      ...ufs.map(([uf]) => ({ value: LINHA_UF[uf].id, params: [goto(UF_BLOCO[uf])] })),
      { type: 'else', params: [goto(70 + i)] },
    ] }],
  }])),
  ...Object.fromEntries(Object.values(REGIOES).flat().map(([uf]) => [UF_BLOCO[uf], { question: [campoLead(CAMPO.estadoAtuacao, uf), goto(63)] }])),
  63: { question: [msg('Em qual cidade? 🏙️'), goto(64)] },
  64: { question: [esperaResposta(66)] },
  66: { question: [campoLead(CAMPO.cidadeAtuacao, '{{message_text}}'), goto(39)] },
  // Pasta "Na ponta dos dedos" do Drive (dono, 2026-11-08): catálogos, fotos e vídeos, mockups e campanhas que o
  // distribuidor usa para divulgar nas redes. Link e não PDF: o Direct do Instagram não aceita arquivo e o Drive troca sozinho.
  39: { question: [etapa(FUNIL.distribuidor, ETAPA.distribuidorAtendente), msg('Obrigada pelas informações. Um representante da nossa equipe vai entrar em contato com você. 💙\n\nEnquanto isso, deixamos à sua disposição o nosso material para distribuidores: catálogos, fotos e vídeos dos produtos, mockups e campanhas prontas para divulgar nas redes sociais 📲\nhttps://drive.google.com/drive/folders/1nAI-QmLyxgK_T5eBHvRumMsnFIufmSaR'), tarefa('Distribuidor triado pela Lyra (CNPJ, estado e cidade de atuação no lead): encaminhar ao representante (até 30 minutos).'), esperaResposta(55)] },

  // Já é cliente: pós-venda, fora dos indicadores.
  40: { question: [etapa(FUNIL.atendimento, ETAPA.posVenda), etiqueta('pos-venda'), msg('Por favor, informe o número do pedido ou descreva o que aconteceu 📦 A nossa equipe vai dar continuidade ao seu atendimento por aqui. 💙'), tarefa('Pós-venda: cliente pediu ajuda com pedido, troca ou entrega.'), esperaResposta(55)] },
};

// Bloco 0: a saudação, em lista.
blocos[0].question = [lista('Olá! ✨ Sou a Lyra, assistente virtual da Minasflor, e atendo as marcas BY.MF, Minasflor e MF.PRO. Para direcionar o seu atendimento, toque em "Ver opções" e selecione o seu perfil. Se preferir falar com a nossa equipe, é só escrever "atendente".', Object.values(OPCOES))];

const saida = { conversation: false };
for (const [k, b] of Object.entries(blocos)) saida[k] = { block_uuid: randomUUID(), ...b };
const destino = new URL('./robo-triagem.json', import.meta.url);
fs.writeFileSync(destino, JSON.stringify(saida, null, 2));
if (process.argv[2] === "--min") fs.writeFileSync(new URL("./robo-triagem.min.json", import.meta.url), JSON.stringify(saida));
console.log('blocos', Object.keys(blocos).length, '→', destino.pathname);
