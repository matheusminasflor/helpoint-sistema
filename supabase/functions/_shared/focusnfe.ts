// Focus NFe — o encaixe "emitir nota" do caminho nativo (ENC-3, ADR-009).
//
// A empresa sobe o certificado A1 uma vez no painel deles e cola o token aqui.
// O Helpoint manda o pedido em JSON; a Focus assina, fala com a SEFAZ e devolve
// número, chave, DANFE e XML. Emitir direto na SEFAZ foi recusado no ADR-009.
//
// O caminho, confirmado na documentação:
//   POST /v2/nfe?ref=<referência>   → { status: 'processando_autorizacao' | ... }
//   GET  /v2/nfe/<referência>       → status, numero, chave_nfe, caminho_danfe,
//                                     caminho_xml_nota_fiscal, mensagem_sefaz
// Autenticação: HTTP Basic com o **token como usuário e senha em branco**.
//
// A emissão é assíncrona: a resposta do POST quase sempre é
// "processando_autorizacao". Quem fecha o ciclo é o gatilho da Focus (webhook)
// ou a consulta pela referência — e a referência é o id do pedido, então nunca
// se perde o rastro nem se emite duas vezes para o mesmo pedido.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

type Admin = SupabaseClient;

export interface FocusConnection {
  tenant_id: string;
  token: string;
  ambiente: 'homologacao' | 'producao';
  cnpj_emitente: string;
  serie: number;
  natureza_operacao: string;
  cfop_padrao: string;
  /** O gatilho cadastrado na Focus e o segredo que ela devolve no cabeçalho. */
  hook_id: string | null;
  hook_secret: string | null;
}

/** O cabeçalho que a Focus devolve no aviso, escolhido por nós ao cadastrar. */
export const FOCUS_HOOK_HEADER = 'x-helpoint-token';

export const focusBase = (ambiente: string) =>
  ambiente === 'producao' ? 'https://api.focusnfe.com.br/v2' : 'https://homologacao.focusnfe.com.br/v2';

export async function getFocusConnection(admin: Admin, tenantId: string): Promise<FocusConnection | null> {
  const { data, error } = await admin
    .from('tenant_focusnfe_connections')
    .select('tenant_id, token, ambiente, cnpj_emitente, serie, natureza_operacao, cfop_padrao, hook_id, hook_secret')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return (data as FocusConnection | null) ?? null;
}

/** Tira o token do texto de erro: a Focus ecoa a requisição em alguns casos. */
function semSegredo(texto: string, token: string): string {
  return token && token.length >= 4 ? texto.split(token).join('…') : texto;
}

export async function focusFetch<T = unknown>(
  conn: Pick<FocusConnection, 'token' | 'ambiente'>,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!conn.token) throw new Error('token da Focus NFe não configurado');
  const res = await fetch(`${focusBase(conn.ambiente)}${path}`, {
    ...init,
    headers: {
      // Token como usuário, senha em branco — é o que eles pedem.
      Authorization: `Basic ${btoa(`${conn.token}:`)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Focus NFe ${res.status}: ${semSegredo(text.slice(0, 400), conn.token)}`);
  return (text ? JSON.parse(text) : null) as T;
}

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

/**
 * Agora no Brasil, com o fuso escrito. `toISOString()` daria UTC: das 21h à
 * meia-noite a nota sairia com a data do dia seguinte e hora três horas no
 * futuro, e a SEFAZ recusa emissão adiantada (rejeição 703). É a regra 4 das
 * cinco, do lado das edge functions. O Brasil não tem mais horário de verão,
 * então o deslocamento de São Paulo é fixo.
 */
export function agoraBR(): string {
  const agora = new Date();
  const sp = new Date(agora.getTime() - 3 * 3600_000);
  return `${sp.toISOString().slice(0, 19)}-03:00`;
}

export interface FocusResultado {
  status?: string;
  numero?: string | number;
  serie?: string | number;
  chave_nfe?: string;
  caminho_danfe?: string;
  caminho_xml_nota_fiscal?: string;
  mensagem_sefaz?: string;
  erros?: { mensagem?: string; campo?: string }[];
}

/** O que a tela e o banco guardam, a partir do que a Focus respondeu. */
export function traduzirStatus(status: string | undefined): 'processing' | 'authorized' | 'cancelled' | 'error' {
  switch (status) {
    case 'autorizado': return 'authorized';
    case 'cancelado': return 'cancelled';
    case 'processando_autorizacao': return 'processing';
    default: return 'error';
  }
}

export function mensagemDeErro(r: FocusResultado | null): string {
  if (!r) return 'a Focus NFe não respondeu';
  const doErro = r.erros?.map((e) => [e.campo, e.mensagem].filter(Boolean).join(': ')).filter(Boolean).join('; ');
  return doErro || r.mensagem_sefaz || r.status || 'erro desconhecido';
}

export interface DestinatarioNFe {
  nome: string; documento: string | null; email: string | null; telefone: string | null;
  inscricao_estadual: string | null;
  logradouro: string | null; numero: string | null; complemento: string | null;
  bairro: string | null; cidade: string | null; uf: string | null; cep: string | null;
}
export interface ItemNFe {
  descricao: string; quantidade: number; valor_unitario: number;
  codigo: string | null; unidade: string | null;
  ncm: string | null; cfop: string | null; icms_origem: number; icms_cst: string | null;
}

/** O que falta no cadastro para a nota nem ser tentada. Erro cedo é mais barato. */
export function faltaParaEmitir(destino: DestinatarioNFe, itens: ItemNFe[], cfopPadrao: string): string[] {
  const falta: string[] = [];
  if (!digits(destino.documento)) falta.push('CPF ou CNPJ do cliente');
  if (!destino.logradouro) falta.push('rua do cliente');
  if (!destino.numero) falta.push('número do endereço do cliente');
  if (!destino.bairro) falta.push('bairro do cliente');
  if (!destino.cidade) falta.push('cidade do cliente');
  if (!destino.uf) falta.push('estado do cliente');
  if (!digits(destino.cep)) falta.push('CEP do cliente');
  const semNcm = itens.filter((i) => !digits(i.ncm)).map((i) => i.descricao);
  if (semNcm.length) falta.push(`NCM do produto: ${semNcm.join(', ')}`);
  if (!cfopPadrao && itens.some((i) => !i.cfop)) falta.push('CFOP (no produto ou no padrão da empresa)');
  return falta;
}

export function montarNFe(
  conn: FocusConnection,
  destino: DestinatarioNFe,
  itens: ItemNFe[],
  valorFrete: number,
  valorDesconto: number,
): Record<string, unknown> {
  const produtos = itens.reduce((t, i) => t + i.quantidade * i.valor_unitario, 0);
  const total = Math.round((produtos + valorFrete - valorDesconto) * 100) / 100;
  const doc = digits(destino.documento);

  return {
    natureza_operacao: conn.natureza_operacao,
    data_emissao: agoraBR(),
    tipo_documento: 1,          // 1 = saída
    finalidade_emissao: 1,      // 1 = normal
    consumidor_final: destino.inscricao_estadual ? 0 : 1,
    presenca_comprador: 2,      // 2 = pela internet
    modalidade_frete: valorFrete > 0 ? 0 : 9,   // 0 = por conta do emitente; 9 = sem frete
    cnpj_emitente: digits(conn.cnpj_emitente),
    serie: conn.serie,
    nome_destinatario: destino.nome,
    ...(doc.length > 11 ? { cnpj_destinatario: doc } : { cpf_destinatario: doc }),
    // 1 = contribuinte com IE; 9 = não contribuinte. Sem IE, 9.
    indicador_inscricao_estadual_destinatario: destino.inscricao_estadual ? 1 : 9,
    ...(destino.inscricao_estadual ? { inscricao_estadual_destinatario: destino.inscricao_estadual } : {}),
    logradouro_destinatario: destino.logradouro,
    numero_destinatario: destino.numero,
    ...(destino.complemento ? { complemento_destinatario: destino.complemento } : {}),
    bairro_destinatario: destino.bairro,
    municipio_destinatario: destino.cidade,
    uf_destinatario: destino.uf,
    cep_destinatario: digits(destino.cep),
    pais_destinatario: 'Brasil',
    ...(digits(destino.telefone) ? { telefone_destinatario: digits(destino.telefone) } : {}),
    ...(destino.email ? { email_destinatario: destino.email } : {}),
    valor_produtos: Math.round(produtos * 100) / 100,
    valor_frete: valorFrete > 0 ? valorFrete : undefined,
    valor_desconto: valorDesconto > 0 ? valorDesconto : undefined,
    valor_total: total,
    items: itens.map((i, idx) => {
      const bruto = Math.round(i.quantidade * i.valor_unitario * 100) / 100;
      return {
        numero_item: idx + 1,
        codigo_produto: i.codigo || String(idx + 1),
        descricao: i.descricao.slice(0, 120),
        cfop: i.cfop || conn.cfop_padrao,
        unidade_comercial: i.unidade || 'UN',
        quantidade_comercial: i.quantidade,
        valor_unitario_comercial: i.valor_unitario,
        valor_bruto: bruto,
        codigo_ncm: digits(i.ncm),
        icms_situacao_tributaria: i.icms_cst || '102',   // 102 = Simples Nacional sem crédito
        icms_origem: i.icms_origem,
        unidade_tributavel: i.unidade || 'UN',
        quantidade_tributavel: i.quantidade,
        valor_unitario_tributavel: i.valor_unitario,
      };
    }),
  };
}

/** Manda a nota. A referência é o id do pedido: reenviar não emite outra. */
export async function emitirNFe(conn: FocusConnection, ref: string, corpo: Record<string, unknown>): Promise<FocusResultado> {
  return await focusFetch<FocusResultado>(conn, `/nfe?ref=${encodeURIComponent(ref)}`, {
    method: 'POST',
    body: JSON.stringify(corpo),
  });
}

export async function consultarNFe(conn: Pick<FocusConnection, 'token' | 'ambiente'>, ref: string): Promise<FocusResultado> {
  return await focusFetch<FocusResultado>(conn, `/nfe/${encodeURIComponent(ref)}`);
}

/**
 * Cadastra (ou recadastra) o gatilho da Focus para esta empresa. É o que faz a
 * nota se resolver sozinha: sem ele, "na fila da SEFAZ" só vira "autorizada"
 * quando alguém clica. O segredo do cabeçalho é sorteado aqui e nunca sai do
 * servidor — mesmo desenho do aviso do Asaas.
 */
export async function registrarGatilhoFocus(
  conn: Pick<FocusConnection, 'token' | 'ambiente' | 'cnpj_emitente' | 'hook_id'>,
  url: string,
): Promise<{ hook_id: string; hook_secret: string }> {
  if (conn.hook_id) await removerGatilhoFocus(conn, conn.hook_id);

  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const segredo = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const hook = await focusFetch<{ id?: string }>(conn, '/hooks', {
    method: 'POST',
    body: JSON.stringify({
      url,
      event: 'nfe',
      cnpj: conn.cnpj_emitente.replace(/\D/g, ''),
      authorization: segredo,
      authorization_header: FOCUS_HOOK_HEADER,
    }),
  });
  if (!hook?.id) throw new Error('a Focus não devolveu o gatilho cadastrado');
  return { hook_id: String(hook.id), hook_secret: segredo };
}

export async function removerGatilhoFocus(
  conn: Pick<FocusConnection, 'token' | 'ambiente'>,
  hookId: string,
): Promise<void> {
  await focusFetch(conn, `/hooks/${encodeURIComponent(hookId)}`, { method: 'DELETE' })
    .catch((e) => console.warn('focus hook delete', e instanceof Error ? e.message : String(e)));
}

interface PedidoParaNota {
  id: string; tenant_id: string; number: number; status: string;
  shipping: number; discount: number;
  nfe_ref: string | null; nfe_status: string | null; nfe_provider: string | null;
  contact: {
    name: string; document: string | null; email: string | null; phone: string | null; whatsapp: string | null;
    state_registration: string | null; zip_code: string | null; street: string | null;
    street_number: string | null; complement: string | null; district: string | null;
    city: string | null; state: string | null;
  } | null;
  items: {
    description: string; quantity: number; unit_price: number;
    product: { sku: string | null; unit: string | null; ncm_code: string | null; cfop: string | null; icms_origem: number; icms_cst: string | null } | null;
  }[];
}

async function gravarPedido(admin: Admin, tenantId: string, orderId: string, patch: Record<string, unknown>) {
  const { data, error } = await admin
    .from('crm_orders').update(patch).eq('id', orderId).eq('tenant_id', tenantId).select('id');
  if (error) throw error;
  if (!data?.length) throw new Error('pedido nao atualizado');
}

export interface NotaDoPedido {
  ref: string;
  nfe_status: string;
  numero?: string | null;
  chave?: string | null;
  danfe_url?: string | null;
  xml_url?: string | null;
  mensagem?: string | null;
  ja_emitida?: boolean;
}

/**
 * Emite (ou reaproveita) a nota de um pedido. Chamada pela tela e pelo passo de
 * fluxo. **Não emite duas vezes**: a referência é o id do pedido, e antes de
 * mandar ela consulta o que a Focus já tem para essa referência.
 */
export async function emitirNotaDoPedido(admin: Admin, tenantId: string, orderId: string): Promise<NotaDoPedido> {
  const conn = await getFocusConnection(admin, tenantId);
  if (!conn) throw new Error('focus_not_connected');

  const { data, error } = await admin
    .from('crm_orders')
    .select('id, tenant_id, number, status, shipping, discount, nfe_ref, nfe_status, nfe_provider, contact:crm_contacts(name, document, email, phone, whatsapp, state_registration, zip_code, street, street_number, complement, district, city, state), items:crm_order_items(description, quantity, unit_price, product:crm_products(sku, unit, ncm_code, cfop, icms_origem, icms_cst))')
    .eq('id', orderId).eq('tenant_id', tenantId).maybeSingle();
  if (error) throw error;
  const o = data as unknown as PedidoParaNota | null;
  if (!o) throw new Error('pedido nao encontrado');
  if (o.status === 'cancelled') throw new Error('pedido cancelado: não há nota a emitir');
  if (!o.items?.length) throw new Error('pedido sem itens');
  if (!o.contact) throw new Error('pedido sem cliente');

  const ref = o.nfe_ref ?? o.id;

  // Já existe nota **válida** nessa referência? Devolve o que a Focus tem, sem
  // emitir outra. Nota recusada não conta: é justamente o caso em que a pessoa
  // corrige o cadastro e manda de novo, e a mesma referência pode ser reusada.
  const jaTem = await consultarNFe(conn, ref).catch(() => null);
  if (jaTem && ['autorizado', 'cancelado', 'processando_autorizacao'].includes(jaTem.status ?? '')) {
    const r = await registrarNota(admin, conn, tenantId, o.id, ref, jaTem);
    return { ...r, ja_emitida: true };
  }

  const destino = {
    nome: o.contact.name, documento: o.contact.document, email: o.contact.email,
    telefone: o.contact.whatsapp || o.contact.phone,
    inscricao_estadual: o.contact.state_registration,
    logradouro: o.contact.street, numero: o.contact.street_number, complemento: o.contact.complement,
    bairro: o.contact.district, cidade: o.contact.city, uf: o.contact.state, cep: o.contact.zip_code,
  };
  const itens = o.items.map((i) => ({
    descricao: i.description, quantidade: Number(i.quantity), valor_unitario: Number(i.unit_price),
    codigo: i.product?.sku ?? null, unidade: i.product?.unit ?? null,
    ncm: i.product?.ncm_code ?? null, cfop: i.product?.cfop ?? null,
    icms_origem: Number(i.product?.icms_origem ?? 0), icms_cst: i.product?.icms_cst ?? null,
  }));

  const falta = faltaParaEmitir(destino, itens, conn.cfop_padrao);
  if (falta.length) {
    await gravarPedido(admin, tenantId, o.id, {
      nfe_provider: 'focusnfe', nfe_status: 'error', nfe_error: `Falta preencher: ${falta.join('; ')}`,
    });
    throw new Error(`cadastro_incompleto: ${falta.join('; ')}`);
  }

  // Reserva o pedido **antes** de mandar. Duas coisas ao mesmo tempo — o
  // vendedor clicando e o fluxo rodando, ou duas abas — leriam o pedido sem
  // nota e mandariam duas. Este UPDATE é atômico: o segundo espera o cadeado da
  // linha e, ao reavaliar, não casa mais. Reserva parada há mais de cinco
  // minutos é retomada (a Focus é assíncrona, mas nunca demora tanto).
  const velha = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: reserva, error: reservaError } = await admin
    .from('crm_orders')
    .update({ nfe_provider: 'focusnfe', nfe_ref: ref, nfe_status: 'processing', nfe_error: null })
    .eq('id', o.id).eq('tenant_id', tenantId)
    .or(`nfe_status.is.null,nfe_status.eq.error,and(nfe_status.eq.processing,updated_at.lt.${velha})`)
    .select('id');
  if (reservaError) throw reservaError;
  if (!reserva?.length) throw new Error('nota_em_andamento');

  const corpo = montarNFe(conn, destino, itens, Number(o.shipping ?? 0), Number(o.discount ?? 0));
  const res = await emitirNFe(conn, ref, corpo).catch(async (e) => {
    const msg = e instanceof Error ? e.message : String(e);
    await gravarPedido(admin, tenantId, o.id, { nfe_status: 'error', nfe_error: msg.slice(0, 500) });
    throw e;
  });
  return await registrarNota(admin, conn, tenantId, o.id, ref, res);
}

export async function registrarNota(
  admin: Admin, conn: Pick<FocusConnection, 'ambiente'>, tenantId: string, orderId: string,
  ref: string, r: FocusResultado,
): Promise<NotaDoPedido> {
  const status = traduzirStatus(r.status);
  const danfe = r.caminho_danfe ? caminhoCompleto(conn.ambiente, r.caminho_danfe) : null;
  const xml = r.caminho_xml_nota_fiscal ? caminhoCompleto(conn.ambiente, r.caminho_xml_nota_fiscal) : null;
  const patch: Record<string, unknown> = {
    nfe_provider: 'focusnfe', nfe_ref: ref, nfe_status: status,
    nfe_error: status === 'error' ? mensagemDeErro(r).slice(0, 500) : null,
  };
  if (r.numero) patch.nfe_number = String(r.numero);
  if (r.chave_nfe) patch.nfe_key = r.chave_nfe;
  if (danfe) patch.danfe_url = danfe;
  if (xml) patch.nfe_xml_url = xml;
  await gravarPedido(admin, tenantId, orderId, patch);

  return {
    ref, nfe_status: status,
    numero: r.numero ? String(r.numero) : null,
    chave: r.chave_nfe ?? null,
    danfe_url: danfe, xml_url: xml,
    mensagem: status === 'error' ? mensagemDeErro(r) : (r.mensagem_sefaz ?? null),
  };
}

/** A Focus devolve caminho relativo; a tela precisa do endereço inteiro, do ambiente certo. */
function caminhoCompleto(ambiente: string, caminho: string): string {
  if (/^https?:\/\//i.test(caminho)) return caminho;
  const raiz = focusBase(ambiente).replace(/\/v2$/, '');
  return `${raiz}${caminho.startsWith('/') ? '' : '/'}${caminho}`;
}
