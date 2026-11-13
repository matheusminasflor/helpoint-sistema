// O robô de triagem da Lyra no Kommo (Salesbot), em código. São dois robôs com os mesmos textos, um por canal:
// `node docs/lyra-base/robo-triagem.mjs whatsapp --min` e `... instagram --min` geram `robo-triagem-<canal>.json`,
// colado no modo de código do robô daquele canal (projeto do Kommo, passo 3; o dono escolheu o modo de código em
// 2026-11-08). Os textos ficam aqui: mudar uma mensagem é mudar este arquivo e colar de novo nos dois.
//
// Por que dois robôs (testado em 2026-11-08): a lista do WhatsApp não chega ao Direct do Instagram, o Instagram só
// mostra 3 botões por mensagem, a lista tem de estar sozinha no seu passo, e uma mensagem presa a outro canal faz o
// Kommo parar o robô sem cair no "falha ao enviar". Misturar os canais num robô só deixou o WhatsApp sem saudação.
//
// Formato aprendido do robô antigo "BOT INICIAL MF" e do modelo "Bot de boas-vindas" do próprio Kommo:
// cada bloco é {block_uuid, question:[...], answer?:[...], no_answer?}; `goto` com type question/finish.
import fs from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';

const CANAL_DO_ROBO = process.argv[2];
if (!['whatsapp', 'instagram'].includes(CANAL_DO_ROBO)) throw new Error('uso: node robo-triagem.mjs whatsapp|instagram [minasflor|mfpro|bymf] [--min]');
const noWhatsapp = CANAL_DO_ROBO === 'whatsapp';
// Um robô por Instagram (dono, 2026-11-12): "no Instagram da Minasflor tem que falar somente sobre Minasflor", e o mesmo
// na MF.PRO e na BY.MF. O WhatsApp comercial continua com um robô só.
const MARCA_IG = process.argv.find((a) => ['minasflor', 'mfpro', 'bymf'].includes(a));
if (!noWhatsapp && !MARCA_IG) throw new Error('o Instagram pede a marca: minasflor | mfpro | bymf');
const NOME_DO_ARQUIVO = noWhatsapp ? 'whatsapp' : `instagram-${MARCA_IG}`;

// Números da conta ticminasflor (leitura de 2026-11-08).
const FUNIL = { consumidor: 12904179, salao: 12927111, distribuidor: 12927087, atendimento: 14739451, entrada: 13975223 };
// "Com a Lyra" enquanto a Lyra conversa; "Com atendente" só quando precisa de uma pessoa (dono, 2026-11-08: "é importante
// separar isso"); BY.MF, que compra sozinho no site, vai para "Link enviado". A etapa se chama "Com atendente", e não pelo
// nome de quem atende hoje, para não precisar mexer quando a pessoa mudar (dono, 2026-11-08).
const ETAPA = { entradaContato: 107856359, consumidorLyra: 113891167, salaoLyra: 113891215, distribuidorLyra: 113891223, consumidorLink: 113891171, consumidorAtendente: 99501151, salaoAtendente: 99680859, distribuidorAtendente: 99680647, posVenda: 113891275, entradaAtendente: 113893475 };
const CAMPO = { segmento: 4381514, cpfCnpj: 4381512, marca: 4381516, estadoAtuacao: 4381528, cidadeAtuacao: 4381530, whatsapp: 4381554,
  investimento: 4381738, origem: 4381754 }; // criados em 2026-11-10 (listas)
// Catálogo em PDF por segmento (dono, 2026-11-10): uso em casa recebe o da Minasflor; salão, Minasflor + MF.PRO.
// Links do dono (2026-11-10), sem "https://" pelo mesmo motivo dos outros endereços (o Kommo encurtaria).
const PDF = { minasflor: 'drive.google.com/file/d/1GF3BzmvStM1_DzX_VCKQjgnXTLtr9VXb/view', mfpro: 'drive.google.com/file/d/1spoT1pUT0wwMqRYaWDxDbXLI-7XQFk5T/view' };
const CATALOGO = {
  consumidor: `Aqui está o nosso catálogo 📖\n\nMinasflor: ${PDF.minasflor}\n\nQuando escolher, escreva os produtos e as quantidades, que a nossa equipe monta o seu pedido 📝`,
  salao: `Aqui estão os nossos catálogos 📖\n\nMinasflor: ${PDF.minasflor}\n\nMF.PRO: ${PDF.mfpro}\n\nQuando escolher, escreva os produtos e as quantidades 📝`,
};

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
// No Instagram vai a mesma pergunta com botões, até 3 (com 4 o Kommo partiu a mensagem em duas). `instagram` traz o
// texto e os botões próprios desse canal; sem botões, a pessoa responde escrevendo. Botão do Instagram: até 20 letras.
// O id da linha sai do próprio nome, e não é sorteado (teste do dono, 2026-11-10): com id novo a cada geração, quem recebeu
// a lista antes de o robô ser regravado tocava numa opção que o robô novo não conhecia e recebia a pergunta de novo.
const linha = (title, curto = title) => ({ id: createHash('sha1').update(title).digest('hex').slice(0, 32), title, curto });
// `{toque}` no texto vira a instrução do WhatsApp.
const escolha = (body, linhas, instagram = {}) => {
  if (noWhatsapp) return [lista(body.replace('{toque}', 'toque em "Ver opções"'), linhas)];
  const botoesIg = instagram.linhas ?? linhas;
  if (botoesIg.length > 3) throw new Error('Instagram: no máximo 3 botões por mensagem');
  return [msg(instagram.texto ?? body.replace('{toque}', 'toque em uma das opções'),
    botoesIg.length ? { buttons: botoesIg.map(({ curto }) => ({ type: 'inline', text: curto })) } : {})];
};
// A resposta aceita o toque dos dois canais: o callback_data da lista e o texto do botão (o mesmo bloco serve aos dois). Sem sinônimos, que a lista
// não aceita (o Kommo recusa a gravação com 400).
const opcao = (linhaDaLista, params) => [{ value: linhaDaLista.id, params }, { value: linhaDaLista.curto, params }];
const esperaResposta = (step) => ({ handler: 'waits', params: { logic: 'or', conditions: [{ event: { action: 'received', source: 'message' }, action: { type: 'question', step } }] } });
// Tarefa para quem cuida do lead. Prazo padrão de 45 minutos, a meta do relatório e do aviso (dono, 2026-11-10) ("within-deadline" vazio virava 5 minutos; o certo é
// "custom"); `dias` troca o prazo por dias.
const tarefa = (texto, { dias } = {}) => ({
  handler: 'trigger',
  params: { trigger: { delay: 0, action: 'create_task', segments: [''], settings: {
    task_text: texto, task_type: '1', 'deadline-days': dias ? String(dias) : '', 'deadline-hours': '', task_type_name: 'Acompanhar',
    'within-deadline': 'custom', 'deadline-minutes': dias ? '' : '45', responsible_user: 'current' },
  date_exec: 0, handler_code: 'amocrm', execution_condition: { id: 45, name: 'execute_trigger' } }, element_type: 'lead' },
});

// Os endereços vão sem "https://": o WhatsApp e o Instagram ainda fazem o link, e o Kommo só troca por kommo.cc (o
// encurtador dele, sem opção de desligar) o que começa com https.
// Regras do dono (2026-11-08): nenhuma mensagem promete prazo ao cliente; o prazo de 45 minutos fica só na tarefa.
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
const LINHA_UF = Object.fromEntries(Object.values(REGIOES).flat().map(([uf, nome]) => [uf, linha(`${uf} · ${nome}`, uf)]));
const UF_BLOCO = Object.fromEntries(Object.values(REGIOES).flat().map(([uf], i) => [uf, 100 + i]));
// No WhatsApp os nomes são os da conversa curta (dono, 2026-11-10); a chave continua a mesma nos dois canais.
const NOME_NO_WHATSAPP = { 'Tenho salão': 'Para o salão', 'Revendo/distribuo': 'Revender' };
const OPCOES = Object.fromEntries(['Uso em casa', 'Tenho salão', 'Revendo/distribuo', 'Já sou cliente']
  .map((t) => [t, linha(noWhatsapp ? NOME_NO_WHATSAPP[t] ?? t : t)]));
// Só o toque conta. Quem escreve cai no bloco 53, que procura "atendente" no texto; o resto recebe as opções de novo.
const respostaDosBotoes = (senao = 53) => [{
  handler: 'buttons',
  params: [
    ...opcao(OPCOES['Uso em casa'], [goto(10)]),
    ...opcao(OPCOES['Tenho salão'], [goto(20)]),
    ...opcao(OPCOES['Revendo/distribuo'], [goto(30)]),
    ...opcao(OPCOES['Já sou cliente'], [goto(40)]),
    { type: 'else', params: [goto(senao)] },
  ],
}];
const DIGITOS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
const contem = (palavras, step) => ({ handler: 'conditions', params: { logic: 'or',
  conditions: palavras.map((term2) => ({ term1: '{{message_text}}', term2, operation: 'contains' })), result: [goto(step)] } });
const TRANSFERE = 'Vou transferir o seu atendimento para a nossa equipe, que dará continuidade por aqui. 💙';

const blocos = {
  // Saudação e triagem.
  0: { question: [], answer: respostaDosBotoes() }, // a mensagem entra logo abaixo
  // Regra do dono (2026-11-08): o segmento é obrigatório. Quem escreve em vez de escolher recebe as opções de novo,
  // quantas vezes for preciso; só "atendente" passa direto para uma pessoa, na Entrada (sem triagem).
  50: { question: escolha('Para seguir com o atendimento, {toque} 👇', Object.values(OPCOES), {
    texto: 'Para seguir com o atendimento, toque em uma das opções 👇 Se você já é cliente, escreva "cliente".', linhas: [OPCOES['Uso em casa'], OPCOES['Tenho salão'], OPCOES['Revendo/distribuo']] }), answer: respostaDosBotoes(57) },
  // Escreveu de novo em vez de tocar (dono, 2026-11-12, caso Divino Cacho: o lead ficou parado sem tarefa): na 2ª vez
  // a Lyra passa para a equipe, com tarefa, em vez de repetir a pergunta para sempre.
  57: { question: [contem(['atendente', 'Atendente', 'ATENDENTE', 'falar com alguém', 'Falar com alguém', 'humano', 'pessoa'], 51),
    contem(['cliente', 'Cliente', 'CLIENTE', 'pedido', 'Pedido', 'troca', 'Troca', 'entrega', 'Entrega', 'rastreio', 'Rastreio'], 40), goto(58)] },
  58: { question: [etapa(FUNIL.entrada, ETAPA.entradaAtendente), msg(TRANSFERE), tarefa('Contato escreveu em vez de escolher uma opção da Lyra: responder pela conversa e preencher o Segmento (até 45 minutos).'), esperaResposta(55)] },
  // Mensagem automática de quem a equipe chamou (dono, 2026-11-12): a Lyra não se apresenta; o lead vai para a equipe
  // em silêncio, com tarefa. O Kommo não diz ao robô quem mandou a 1ª mensagem, então a Lyra reconhece pelo texto.
  56: { question: [etapa(FUNIL.entrada, ETAPA.entradaAtendente), etiqueta('resposta-automatica'),
    tarefa('O contato respondeu com mensagem automática: a equipe continua a conversa (até 45 minutos).'), fim] },
  53: { question: [contem(['atendente', 'Atendente', 'ATENDENTE', 'falar com alguém', 'Falar com alguém', 'humano', 'pessoa'], 51),
    contem(['cliente', 'Cliente', 'CLIENTE', 'pedido', 'Pedido', 'troca', 'Troca', 'entrega', 'Entrega', 'rastreio', 'Rastreio'], 40), goto(50)] },
  51: { question: [etapa(FUNIL.entrada, ETAPA.entradaAtendente), etiqueta('pediu-atendente'), msg(TRANSFERE), tarefa('Cliente pediu atendente antes da triagem: responder e preencher o Segmento.'), esperaResposta(55)] },
  // Depois do segmento: escreveu o produto em vez de escolher a marca → passa para uma pessoa.
  52: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorAtendente), msg('Obrigada pela informação. Vou transferir o seu atendimento para a nossa equipe, que vai te ajudar a escolher os produtos. 💙'), tarefa('Consumidor escreveu o que quer em vez de escolher a marca: responder pela conversa (até 45 minutos).'), esperaResposta(55)] },
  // Regra do dono (2026-11-08): a conversa não morre no fim do caminho. Quem escreve de novo é passado para uma pessoa:
  // no BY.MF ninguém foi acionado ainda, então nasce a tarefa; nos outros finais a tarefa já existe e só se avisa.
  54: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorAtendente), msg(TRANSFERE), tarefa('Cliente da BY.MF pediu ajuda depois do link da loja: responder pela conversa (até 45 minutos).'), fim] },
  55: { question: [msg('Mensagem recebida. A nossa equipe já está com o seu atendimento e responde por aqui. 💙'), fim] },

  // Uso em casa.
  10: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorLyra), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'), goto(11)] },
  11: { question: [msg('Será um prazer te atender 😊 Qual é o seu nome?'), goto(12)] },
  12: { question: [esperaResposta(13)] },
  13: { question: [nomeDoLead, goto(14)] },
  // Consumidor escolhe a marca: BY.MF compra sozinho no site; Minasflor e MF.PRO não têm loja aberta (para não
  // concorrer com o distribuidor), então a Lyra anota os produtos e a equipe gera o link de pagamento da Yampi.
  // Regra do dono (2026-11-08): a MF.PRO é só para salão e distribuidor; o consumidor não compra nada dela, nem o Fusion.
  // Quem escreve "mf.pro" ou outra coisa em vez de tocar passa para atendente (bloco 52).
  14: { question: [msg('Obrigada! Qual marca você procura? 🛍️', botoes(['BY.MF', 'Minasflor']))],
    answer: [{ handler: 'buttons', params: [
      { value: 'BY.MF', params: [goto(15)], synonyms: ['by.mf', 'bymf', 'BYMF', 'by mf'] },
      { value: 'Minasflor', params: [goto(16)], synonyms: ['minasflor', 'Minas Flor', 'minas flor'] },
      { type: 'else', params: [goto(52)] },
    ] }] },
  // BY.MF (dono, 2026-11-08): o site não avisa o Kommo da compra, então no dia seguinte nasce a tarefa de conferir; e a
  // mensagem traz o botão "Falar com atendente". Qualquer resposta também passa para uma pessoa.
  15: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorLink), campoLead(CAMPO.marca, 'BY.MF'),
    tarefa('Lead recebeu o link da loja BY.MF: conferir se comprou no site (ganho) ou retomar o contato.', { dias: 1 }),
    msg('A BY.MF tem loja online 🛍️ bymfpro.com.br\n\nO pagamento é por Pix ou cartão, e o frete é calculado pelo CEP na finalização da compra. Se precisar de ajuda, é só tocar no botão abaixo.', botoes(['Falar com atendente']))],
    answer: [{ handler: 'buttons', params: [
      { value: 'Falar com atendente', params: [goto(54)], synonyms: ['atendente', 'falar com atendente'] },
      { type: 'else', params: [goto(54)] },
    ] }] },
  // Site institucional da Minasflor (dono, 2026-11-08): quem não conhece os produtos olha lá e depois diz o que quer.
  16: { question: [campoLead(CAMPO.marca, 'Minasflor'), msg('Você pode conhecer toda a linha Minasflor no nosso site: minasflor.com.br'), goto(18)] },
  18: { question: [msg('Por favor, informe os produtos e as quantidades que deseja. A nossa equipe vai preparar um link de pagamento exclusivo para você, com Pix ou cartão 📝'), goto(19)] },
  19: { question: [esperaResposta(9)] },
  9: { question: [etapa(FUNIL.consumidor, ETAPA.consumidorAtendente), msg('Pedido anotado ✅ A nossa equipe vai entrar em contato por aqui para finalizar a sua compra. 💙'), tarefa('Consumidor pediu Minasflor pela Lyra: montar o link de pagamento da Yampi com os produtos da conversa (até 45 minutos).'), esperaResposta(55)] },

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
  27: { question: [msg('Obrigada! Você pode conhecer todos os nossos produtos em minasflor.com.br\n\nDepois é só me dizer quais produtos e quantidades deseja, que eu deixo o seu pedido anotado 📝'), goto(28)] },
  28: { question: [esperaResposta(29)] },
  29: { question: [etapa(FUNIL.salao, ETAPA.salaoAtendente), msg('Pedido anotado ✅ A nossa equipe vai entrar em contato por aqui para finalizar o seu pedido. 💙'), tarefa('Salão (CNPJ no lead) fez o pedido pela Lyra: montar o pedido com os produtos da conversa (até 45 minutos).'), esperaResposta(55)] },
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
  37: { question: escolha('Em qual região você pretende atuar? 📍 Para responder, {toque}.', Object.values(LINHA_REGIAO), {
    texto: 'Em qual estado você pretende atuar? 📍 Escreva a sigla, por exemplo: MG', linhas: [] }),
    answer: [{ handler: 'buttons', params: [
      ...Object.keys(REGIOES).flatMap((r, i) => opcao(LINHA_REGIAO[r], [goto(70 + i)])),
      // Instagram: a sigla ou o nome do estado, escritos. Outra coisa repete a pergunta, então o campo não recebe erro.
      ...Object.values(REGIOES).flat().flatMap(([uf, nome]) => [uf, uf.toLowerCase(), nome, nome.toLowerCase()].map((value) => ({ value, params: [goto(UF_BLOCO[uf])] }))),
      { type: 'else', params: [goto(37)] },
    ] }] },
  ...Object.fromEntries(Object.entries(REGIOES).map(([, ufs], i) => [70 + i, {
    // Só o WhatsApp chega aqui (no Instagram o 37 já pede a sigla); o texto do Instagram é a mesma pergunta, por garantia.
    question: escolha('Em qual estado? 📍 Para responder, {toque}.', ufs.map(([uf]) => LINHA_UF[uf]), {
      texto: 'Em qual estado você pretende atuar? 📍 Escreva a sigla, por exemplo: MG', linhas: [] }),
    answer: [{ handler: 'buttons', params: [
      ...ufs.flatMap(([uf]) => opcao(LINHA_UF[uf], [goto(UF_BLOCO[uf])])),
      { type: 'else', params: [goto(70 + i)] },
    ] }],
  }])),
  ...Object.fromEntries(Object.values(REGIOES).flat().map(([uf]) => [UF_BLOCO[uf], { question: [campoLead(CAMPO.estadoAtuacao, uf), goto(63)] }])),
  63: { question: [msg('Em qual cidade? 🏙️'), goto(64)] },
  64: { question: [esperaResposta(66)] },
  66: { question: [campoLead(CAMPO.cidadeAtuacao, '{{message_text}}'), goto(39)] },
  // Pasta "Na ponta dos dedos" do Drive (dono, 2026-11-08): catálogos, fotos e vídeos, mockups e campanhas que o
  // distribuidor usa para divulgar nas redes. Link e não PDF: o Direct do Instagram não aceita arquivo e o Drive troca sozinho.
  39: { question: [etapa(FUNIL.distribuidor, ETAPA.distribuidorAtendente), msg('Obrigada pelas informações. Um representante da nossa equipe vai entrar em contato com você. 💙\n\nEnquanto isso, deixamos à sua disposição o nosso material para distribuidores: catálogos, fotos e vídeos dos produtos, mockups e campanhas prontas para divulgar nas redes sociais 📲\ndrive.google.com/drive/folders/1nAI-QmLyxgK_T5eBHvRumMsnFIufmSaR'), tarefa('Distribuidor triado pela Lyra (CNPJ, estado e cidade de atuação no lead): encaminhar ao representante (até 45 minutos).'), esperaResposta(55)] },

  // Já é cliente: pós-venda, fora dos indicadores.
  40: { question: [etapa(FUNIL.atendimento, ETAPA.posVenda), etiqueta('pos-venda'), msg('Por favor, informe o número do pedido ou descreva o que aconteceu 📦 A nossa equipe vai dar continuidade ao seu atendimento por aqui. 💙'), tarefa('Pós-venda: cliente pediu ajuda com pedido, troca ou entrega.'), esperaResposta(55)] },
};

// Bloco 0: a saudação, em lista.
const TRES = [OPCOES['Uso em casa'], OPCOES['Tenho salão'], OPCOES['Revendo/distribuo']];
blocos[0].question = escolha('Olá! ✨ Sou a Lyra, da Minasflor. Como posso te ajudar? Para responder, {toque}. Se preferir falar com a nossa equipe, é só escrever "atendente".', Object.values(OPCOES), {
  // Cada Instagram é de uma marca (dono, 2026-11-08): a saudação ali não cita marca nenhuma.
  texto: 'Olá! ✨ Sou a Lyra, assistente virtual. Para direcionar o seu atendimento, toque em uma das opções. Se você já é cliente, é só escrever "cliente"; para falar com a nossa equipe, escreva "atendente".', linhas: TRES });

// Na saudação, o lead vai primeiro para Entrada › Contato inicial, como fazia o robô de entrada que a Lyra substitui:
// sem isso o lead do WhatsApp nasceria em Consumidor Final antes de escolher o segmento e entraria nos indicadores.
// A lista tem de estar sozinha no seu passo (o Kommo recusa a gravação com 400), então no WhatsApp a saudação mora no 200.
const paraEntrada = etapa(FUNIL.entrada, ETAPA.entradaContato);

// No Instagram o Direct não traz o telefone (dono, 2026-11-08): depois do nome, a Lyra pede o WhatsApp e grava no campo
// "WhatsApp" do lead. Obrigatório para Salão e Distribuidor (a atendente e o representante ligam); opcional para o
// consumidor, que pode escrever "pular" e seguir pelo Direct. O número é conferido pela validação de telefone do Kommo.
const telefoneValido = (step) => ({ handler: 'validations', params: { logic: 'and', result: [goto(step)],
  conditions: [{ type: 'phone', operation: 'contains', client_value: '{{message_text}}', condition_value: '' }] } });
const pedeWhatsapp = (inicio, depois, obrigatorio) => ({
  [inicio]: { question: [msg(obrigatorio
    ? 'Qual é o seu WhatsApp com DDD? A nossa equipe usa para continuar o seu atendimento 📱'
    : 'Se quiser, informe o seu WhatsApp com DDD para a nossa equipe falar com você por lá também 📱 Para continuar só por aqui, escreva "pular".'),
    esperaResposta(inicio + 1)] },
  [inicio + 1]: { question: [
    ...(obrigatorio ? [] : [contem(['pular', 'Pular', 'PULAR', 'não', 'Não', 'nao'], depois)]),
    telefoneValido(inicio + 2),
    msg(obrigatorio ? 'Por favor, informe o número com DDD, por exemplo: 31 99999-9999.'
      : 'Por favor, informe o número com DDD, por exemplo: 31 99999-9999, ou escreva "pular".'),
    esperaResposta(inicio + 1)] },
  [inicio + 2]: { question: [campoLead(CAMPO.whatsapp, '{{message_text}}'), goto(depois)] },
});
// Mensagem que o Kommo não consegue ler (dono, teste de 09/11): o Instagram manda, logo depois do número de telefone, uma
// mensagem "could not be displayed due to API restrictions". Ela respondeu sozinha a "O seu salão tem CNPJ?", foi gravada
// como CNPJ, e o toque em "Tenho CNPJ" virou o pedido. Onde a Lyra grava uma resposta, mensagem ilegível volta a esperar.
const ILEGIVEL = ['could not be displayed', 'API restrictions', 'restrições do Instagram'];
const ignoraIlegivel = (numero, esperar) => { blocos[numero].question.unshift(contem(ILEGIVEL, esperar)); };
ignoraIlegivel(26, 25); // CNPJ do salão
ignoraIlegivel(36, 35); // CNPJ do distribuidor
ignoraIlegivel(29, 28); // pedido do salão
ignoraIlegivel(9, 19); // pedido do consumidor
// O "senão" de "tem CNPJ?" (quem digitou o número): se for ilegível, espera a resposta de verdade e decide por ela.
// Blocos 90 e 91: o 70 e o 71 são as listas de estado do Sudeste e do Sul (a primeira versão disto as apagava).
ignoraIlegivel(61, 90);
blocos[90] = { question: [esperaResposta(91)] };
blocos[91] = { question: [contem(ILEGIVEL, 90), contem(['Não tenho', 'não', 'Não', 'nao', 'autônoma', 'autonoma'], 65),
  contem(['Tenho', 'tenho', 'sim', 'Sim'], 60), goto(61)] };

// A Lyra curta no WhatsApp (dono, 2026-11-10, proposta https://claude.ai/artifact/Q3Le2UgfJANCSo5TpZxR2z): "o cliente não
// quer responder pergunta demais". Sai o nome (o WhatsApp já traz), a marca (a BY.MF fica no Instagram dela) e a cidade
// do distribuidor; a Lyra pergunta a linha ou manda o catálogo; o CNPJ do salão vem depois do pedido; o distribuidor
// informa o investimento inicial. Em 2026-11-12 o dono mandou encurtar o Instagram igual; ali a Lyra ainda pede o
// WhatsApp (o Direct não traz o telefone) e o consumidor escolhe a marca (a BY.MF tem Instagram e loja próprios).
{
  // Parou de responder por 45 minutos (2700 s) numa pergunta escrita: passa para uma pessoa, com tarefa. Nas listas o
  // Kommo não deixa esperar com relógio, então ali vale o aviso de 45 minutos do Helpoint.
  const esperaOuParou = (step, parou) => ({ handler: 'waits', params: { logic: 'or', conditions: [
    { event: { action: 'received', source: 'message' }, action: { type: 'question', step } },
    { event: { action: 'ended', source: 'timer', delay: 2700 }, action: { type: 'question', step: parou } }] } });
  const PAROU = { consumidor: 360, salao: 361, distribuidor: 362 };
  const parou = (funil, etapaAtendente) => ({ question: [etapa(funil, etapaAtendente),
    tarefa('Cliente parou no meio da conversa com a Lyra: retomar pela conversa.'), fim] });
  blocos[PAROU.consumidor] = parou(FUNIL.consumidor, ETAPA.consumidorAtendente);
  blocos[PAROU.salao] = parou(FUNIL.salao, ETAPA.salaoAtendente);
  blocos[PAROU.distribuidor] = parou(FUNIL.distribuidor, ETAPA.distribuidorAtendente);

  // Pergunta do produto em dois botões (dono, 2026-11-10, opção A de https://claude.ai/artifact/6r7uCt3HAnsMdB8cN47MNG:
  // "quanto mais opção pior"): quem não sabe recebe o catálogo e escreve o pedido; quem sabe escreve direto. A lista de 8
  // linhas e o campo "Linha de interesse" saíram. Regra do dono (2026-11-10), em toda pergunta de botão ou lista: quem
  // escreve em vez de tocar recebe a pergunta de novo; texto livre só onde a pergunta pede texto.
  const perguntaDoProduto = (inicio, catalogo, pedeProdutos, pedidoEscrito, parouEm) => ({
    [inicio]: { question: [msg('Você já sabe quais produtos quer? 👇', botoes(['Ver o catálogo', 'Já sei o que quero']))],
      answer: [{ handler: 'buttons', params: [
        { value: 'Ver o catálogo', params: [goto(inicio + 1)] },
        { value: 'Já sei o que quero', params: [goto(pedeProdutos)] },
        { type: 'else', params: [goto(inicio)] }] }] },
    [inicio + 1]: { question: [msg(catalogo), goto(inicio + 2)] },
    [inicio + 2]: { question: [esperaOuParou(pedidoEscrito, parouEm)] },
  });

  // Uso em casa: perfil → catálogo ou não → produtos.
  blocos[10] = { question: [etapa(FUNIL.consumidor, ETAPA.consumidorLyra), campoLead(CAMPO.segmento, 'Consumidor final'), campoLead(CAMPO.marca, 'Minasflor'), etiqueta('consumidor-final'), goto(300)] };
  Object.assign(blocos, perguntaDoProduto(300, CATALOGO.consumidor, 18, 9, PAROU.consumidor));
  blocos[18] = { question: [msg('Escreva os produtos e as quantidades, que a nossa equipe monta o seu pedido 📝'), goto(19)] };
  blocos[19] = { question: [esperaOuParou(9, PAROU.consumidor)] };

  // Salão: perfil → catálogo ou não → produtos → CNPJ. O CNPJ é da Lyra porque a atendente esquecia (dono, 2026-11-10).
  blocos[20] = { question: [etapa(FUNIL.salao, ETAPA.salaoLyra), campoLead(CAMPO.segmento, 'Salão'), etiqueta('salão'), goto(320)] };
  Object.assign(blocos, perguntaDoProduto(320, CATALOGO.salao, 27, 29, PAROU.salao));
  blocos[27] = { question: [msg('Escreva os produtos e as quantidades 📝'), goto(28)] };
  blocos[28] = { question: [esperaOuParou(29, PAROU.salao)] };
  blocos[29] = { question: [msg('Anotado ✅ Para liberar o preço de salão, qual é o CNPJ? 🔒 Ele é usado apenas para isso. Se o salão não tiver CNPJ, toque no botão abaixo.', botoes(['Não tenho CNPJ'])), goto(340)] };
  blocos[340] = { question: [esperaOuParou(341, PAROU.salao)] };
  // Quem escreve em vez de tocar no botão (dono, 2026-11-10): "não tenho", "sem CNPJ", em qualquer caixa, vai para o
  // atendimento sem CNPJ; o "contém" do Kommo diferencia maiúscula de minúscula, por isso as variações.
  // CNPJ só com número (dono, 2026-11-10): "não tenho" vai para o atendimento sem CNPJ; com algum número, grava e segue;
  // texto sem número ("n uso cnpj", "vou ver") recebe a pergunta de novo, com o botão. O dígito verificador fica para o
  // fechamento do Kommo (passo 2).
  blocos[341] = { question: [contem(['Não', 'não', 'NÃO', 'Nao', 'nao', 'NAO', 'Sem', 'sem', 'SEM', 'autônoma', 'Autônoma', 'autonoma', 'Autonoma'], 343),
    contem(DIGITOS, 345), goto(344)] };
  blocos[344] = { question: [msg('Para liberar o preço de salão, informe o CNPJ do salão, só os números 🔒 Se o salão não tiver CNPJ, toque no botão abaixo.', botoes(['Não tenho CNPJ'])), goto(340)] };
  blocos[345] = { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(342)] };
  blocos[342] = { question: [etapa(FUNIL.salao, ETAPA.salaoAtendente), msg('Pedido anotado ✅ A nossa equipe vai entrar em contato por aqui para finalizar o seu pedido. 💙'), tarefa('Salão (CNPJ no lead) fez o pedido pela Lyra: montar o pedido com os produtos da conversa (até 45 minutos).'), esperaResposta(55)] };
  // Sem CNPJ: as condições profissionais não valem, e a equipe atende como uso em casa.
  blocos[343] = { question: [etapa(FUNIL.consumidor, ETAPA.consumidorAtendente), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'), etiqueta('profissional-sem-cnpj'),
    msg('Sem problemas. As condições profissionais são exclusivas para salões com CNPJ, e a nossa equipe vai te atender com as opções para uso em casa. 💙'),
    tarefa('Profissional sem CNPJ fez o pedido pela Lyra: atender como uso em casa (até 45 minutos).'), esperaResposta(55)] };

  // Distribuidor (dono, 2026-11-10): nome do distribuidor, região de atuação, CNPJ e investimento inicial. Sem cidade.
  blocos[31] = { question: [msg('Será um prazer conversar sobre a distribuição dos nossos produtos 🤝 Qual é o nome do distribuidor (empresa)?'), goto(32)] };
  blocos[32] = { question: [esperaOuParou(33, PAROU.distribuidor)] };
  blocos[33] = { question: [nomeDoLead, goto(37)] };
  for (const [uf] of Object.values(REGIOES).flat()) blocos[UF_BLOCO[uf]] = { question: [campoLead(CAMPO.estadoAtuacao, uf), goto(34)] };
  blocos[34] = { question: [msg('Obrigada! Qual é o CNPJ da empresa? 🔒 Ele é usado apenas para o cadastro de distribuidor.'), goto(35)] };
  blocos[35] = { question: [esperaOuParou(36, PAROU.distribuidor)] };
  blocos[36] = { question: [contem(DIGITOS, 347), goto(346)] };
  blocos[346] = { question: [msg('Para seguir, informe o CNPJ da empresa, só os números 🔒'), goto(35)] };
  blocos[347] = { question: [campoLead(CAMPO.cpfCnpj, '{{message_text}}'), goto(350)] };
  const FAIXAS = ['Até R$ 5 mil', 'R$ 5 a 15 mil', 'R$ 15 a 50 mil', 'Acima de R$ 50 mil'].map((t) => linha(t));
  // No Instagram cabem 3 botões; as 4 faixas vão numeradas e a pessoa responde com o número.
  blocos[350] = { question: escolha('Qual investimento inicial você tem em mente? 💼 Para responder, {toque}.', FAIXAS, {
    texto: `Qual investimento inicial você tem em mente? 💼 Responda com o número:\n${FAIXAS.map((f, i) => `${i + 1} · ${f.title}`).join('\n')}`, linhas: [] }),
    answer: [{ handler: 'buttons', params: [...FAIXAS.flatMap((f, i) => [...opcao(f, [goto(351 + i)]), { value: String(i + 1), params: [goto(351 + i)] }]),
      { type: 'else', params: [goto(350)] }] }] };
  FAIXAS.forEach((f, i) => { blocos[351 + i] = { question: [campoLead(CAMPO.investimento, f.title), goto(39)] }; });
  blocos[39].question = blocos[39].question.map((p) => (p.handler === 'trigger'
    ? tarefa('Distribuidor triado pela Lyra (CNPJ, estado e investimento inicial no lead): encaminhar ao representante (até 45 minutos).') : p));
}

if (!noWhatsapp) {
  // Instagram curto (dono, 2026-11-12): casa = WhatsApp (pode pular) → marca → produtos; salão = WhatsApp → produtos →
  // CNPJ; distribuidor = empresa → WhatsApp → estado (sigla) → CNPJ → investimento.
  Object.assign(blocos, pedeWhatsapp(80, 14, false), pedeWhatsapp(83, 320, true), pedeWhatsapp(86, 37, true));
  blocos[10] = { question: [etapa(FUNIL.consumidor, ETAPA.consumidorLyra), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'), goto(80)] };
  blocos[16] = { question: [campoLead(CAMPO.marca, 'Minasflor'), goto(300)] };
  blocos[20] = { question: [etapa(FUNIL.salao, ETAPA.salaoLyra), campoLead(CAMPO.segmento, 'Salão'), etiqueta('salão'), goto(83)] };
  blocos[33] = { question: [nomeDoLead, goto(86)] };
  // A mensagem "could not be displayed" do Instagram não vale como pedido nem como CNPJ: volta a esperar.
  blocos[28] = { question: [{ handler: 'waits', params: { logic: 'or', conditions: [
    { event: { action: 'received', source: 'message' }, action: { type: 'question', step: 348 } },
    { event: { action: 'ended', source: 'timer', delay: 2700 }, action: { type: 'question', step: 361 } }] } }] };
  blocos[348] = { question: [contem(ILEGIVEL, 28), goto(29)] };
  blocos[341].question.unshift(contem(ILEGIVEL, 340));
  blocos[36].question.unshift(contem(ILEGIVEL, 35));
}
if (noWhatsapp) {
  blocos[200] = { question: blocos[0].question, answer: blocos[0].answer };
  // De onde veio (dono, 2026-11-10, https://claude.ai/artifact/LsvUjrtiW1gJUV1DUbgMuS): o link da bio, do site e do Google
  // chega com uma frase pronta, e a Lyra grava a Origem em silêncio e segue para a saudação (200). Sem a frase, a saudação
  // já abre com a pergunta da origem (410) e depois pergunta o perfil (201). O anúncio da Meta, o formulário e o Direct o
  // Helpoint reconhece sozinho (`origemDoLead`).
  const FRASE = { Instagram: 'pelo Instagram', Site: 'pelo site', Google: 'pelo Google' };
  const variacoes = (t) => [t, t.toLowerCase(), t.toUpperCase()];
  // Resposta automática (de quem a equipe chamou, ou do WhatsApp Business do cliente): vai para a equipe, sem saudação.
  const AUTOMATICA = ['mensagem automática', 'Mensagem automática', 'resposta automática', 'Resposta automática',
    'não podemos te responder', 'não podemos responder', 'No momento não podemos', 'no momento não podemos',
    'horário comercial', 'fora do horário', 'Fora do horário', 'horário de atendimento', 'por ordem de chegada',
    'retornaremos', 'Retornaremos', 'responderemos em breve', 'Responderemos em breve',
    'Obrigado por entrar em contato', 'Obrigada por entrar em contato', 'obrigado por entrar em contato', 'obrigada por entrar em contato',
    'Agradecemos o seu contato', 'Agradecemos seu contato', 'agradecemos o seu contato', 'agradecemos seu contato'];
  blocos[0] = { question: [paraEntrada, contem(AUTOMATICA, 56), ...Object.values(FRASE).map((t, i) => contem(variacoes(t), 400 + i)), goto(410)] };
  Object.keys(FRASE).forEach((o, i) => { blocos[400 + i] = { question: [campoLead(CAMPO.origem, o), goto(200)] }; });
  const ORIGENS = ['Instagram', 'Google', 'Site', 'Indicação', 'Outro'].map((t) => linha(t));
  blocos[410] = { question: escolha('Olá! ✨ Sou a Lyra, da Minasflor. Para começar, como você conheceu a Minasflor? Para responder, {toque} 👇', ORIGENS),
    answer: [{ handler: 'buttons', params: [...ORIGENS.flatMap((o, i) => opcao(o, [goto(411 + i)])), { type: 'else', params: [goto(416)] }] }] };
  ORIGENS.forEach((o, i) => { blocos[411 + i] = { question: [campoLead(CAMPO.origem, o.title), goto(201)] }; });
  // Escreveu em vez de tocar: "atendente" e assunto de cliente seguem como na saudação; o resto recebe a pergunta de novo.
  blocos[416] = { question: [blocos[53].question[0], blocos[53].question[1], goto(417)] };
  // 2ª vez sem tocar na pergunta da origem: repete uma vez; se escrever de novo, passa para a equipe (bloco 57).
  blocos[417] = { question: escolha('Para seguir, {toque} e conte como conheceu a Minasflor 👇', ORIGENS), answer: [{ handler: 'buttons', params: [
    ...blocos[410].answer[0].params.filter((p) => p.type !== 'else'), { type: 'else', params: [goto(57)] }] }] };
  blocos[201] = { question: escolha('Obrigada! Como posso te ajudar? Para responder, {toque}. Se preferir falar com a nossa equipe, é só escrever "atendente".', Object.values(OPCOES)),
    answer: respostaDosBotoes() };
} else {
  // Instagram de uma marca só (dono, 2026-11-12). MF.PRO: linha profissional, sem "Uso em casa"; quem escreve que é
  // para casa vai para a equipe. BY.MF: casa recebe a loja online e não há "Para o salão". Minasflor: as três opções
  // de perfil e só o catálogo da Minasflor.
  const NOME = { minasflor: 'Minasflor', mfpro: 'MF.PRO', bymf: 'BY.MF' }[MARCA_IG];
  const OPCOES_IG = {
    minasflor: [OPCOES['Uso em casa'], OPCOES['Tenho salão'], OPCOES['Revendo/distribuo']],
    mfpro: [OPCOES['Tenho salão'], OPCOES['Revendo/distribuo'], OPCOES['Já sou cliente']],
    bymf: [OPCOES['Uso em casa'], OPCOES['Revendo/distribuo'], OPCOES['Já sou cliente']],
  }[MARCA_IG];
  const clienteEscrito = !OPCOES_IG.includes(OPCOES['Já sou cliente']);
  // Só respondem as opções desta marca; a resposta de outra cai no "senão", e o caminho da outra marca nem entra no robô.
  const soDestaMarca = (answer) => [{ ...answer[0], params: answer[0].params.filter((p) => p.type === 'else'
    || OPCOES_IG.some((o) => p.value === o.id || p.value === o.curto)) }];
  blocos[0].answer = soDestaMarca(blocos[0].answer);
  blocos[50].answer = soDestaMarca(blocos[50].answer);
  const botoesIg = { buttons: OPCOES_IG.map(({ curto }) => ({ type: 'inline', text: curto })) };
  const saudacao = msg(`Olá! ✨ Sou a Lyra, da ${NOME}. Para direcionar o seu atendimento, toque em uma das opções. `
    + (clienteEscrito ? 'Se você já é cliente, é só escrever "cliente"; para falar' : 'Para falar') + ' com a nossa equipe, escreva "atendente".', botoesIg);
  blocos[0].question = [paraEntrada, { ...saudacao, params: { ...saudacao.params, is_in_starting_block: true } }];
  blocos[50].question = [msg('Para seguir com o atendimento, toque em uma das opções 👇' + (clienteEscrito ? ' Se você já é cliente, escreva "cliente".' : ''), botoesIg)];
  const catalogoDoSalao = { minasflor: `Minasflor: ${PDF.minasflor}`, mfpro: `MF.PRO: ${PDF.mfpro}` }[MARCA_IG];
  if (catalogoDoSalao) blocos[321].question[0] = msg(`Aqui está o nosso catálogo 📖\n\n${catalogoDoSalao}\n\nQuando escolher, escreva os produtos e as quantidades 📝`);
  if (MARCA_IG === 'minasflor') Object.assign(blocos, pedeWhatsapp(80, 16, false)); // casa: WhatsApp → catálogo, sem marca
  if (MARCA_IG === 'bymf') blocos[10] = { question: [etapa(FUNIL.consumidor, ETAPA.consumidorLyra), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'), goto(15)] };
  if (MARCA_IG === 'mfpro') {
    const CASA = ['uso em casa', 'Uso em casa', 'em casa', 'Em casa', 'para mim', 'Para mim', 'pra mim', 'Pra mim', 'uso próprio', 'Uso próprio', 'consumidor', 'Consumidor'];
    blocos[59] = { question: [etapa(FUNIL.consumidor, ETAPA.consumidorAtendente), campoLead(CAMPO.segmento, 'Consumidor final'), etiqueta('consumidor-final'),
      msg('A MF.PRO é uma linha profissional, para salões. Vou transferir o seu atendimento para a nossa equipe, que dará continuidade por aqui. 💙'),
      tarefa('Consumidor final chegou pelo Instagram da MF.PRO: atender pela conversa (até 45 minutos).'), esperaResposta(55)] };
    blocos[53].question.unshift(contem(CASA, 59));
    blocos[57].question.unshift(contem(CASA, 59));
  }
}

// Só vai para o robô o bloco que se alcança a partir do 0 (no WhatsApp curto, o nome, a marca e a cidade ficam de fora).
const alcancados = new Set(['0']);
const anda = (o) => {
  if (!o || typeof o !== 'object') return;
  if (o.type === 'question' && 'step' in o && !alcancados.has(String(o.step))) { alcancados.add(String(o.step)); anda(blocos[o.step]); }
  Object.values(o).forEach(anda);
};
anda(blocos[0]);
const saida = { conversation: false };
for (const [k, b] of Object.entries(blocos)) if (alcancados.has(k)) saida[k] = { block_uuid: randomUUID(), ...b };
const destino = new URL(`./robo-triagem-${NOME_DO_ARQUIVO}.json`, import.meta.url);
fs.writeFileSync(destino, JSON.stringify(saida, null, 2));
if (process.argv.includes('--min')) fs.writeFileSync(new URL(`./robo-triagem-${NOME_DO_ARQUIVO}.min.json`, import.meta.url), JSON.stringify(saida));
console.log('blocos', Object.keys(blocos).length, '→', destino.pathname);
