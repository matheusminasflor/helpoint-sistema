// Correios, API própria (CWS) com o contrato da empresa — ENC-1, ADR-009.
//
// O caminho, confirmado na documentação dos Correios:
//   POST /token/v1/autentica/cartaopostagem            Basic(usuario:codigoAcesso) + { numero }
//                                                      → { token, expiraEm } (vale 24 h)
//   POST /prepostagem/v1/prepostagens                  remetente, destinatário, serviço, peso,
//                                                      declaração de conteúdo → { id, codigoObjeto }
//   POST /prepostagem/v1/prepostagens/rotulo/assincrono/pdf   → { idRecibo }
//   GET  /prepostagem/v1/prepostagens/rotulo/download/assincrono/{idRecibo}  → o PDF
//
// O PDF vem atrás de autenticação, então quem imprime é o navegador: a edge
// function devolve o arquivo em base64 e a tela abre. Guardar um link não
// adiantaria — ele só abriria com o token da empresa.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export const CORREIOS_API = 'https://api.correios.com.br';

type Admin = SupabaseClient;

export interface CorreiosCredential {
  tenant_id: string;
  usuario: string;
  codigo_acesso: string;
  cartao_postagem: string;
  contrato: string | null;
  codigo_servico: string;
  remetente: Remetente;
  access_token: string | null;
  token_expires_at: string | null;
}

export interface Endereco {
  logradouro?: string; numero?: string; complemento?: string; bairro?: string;
  cidade?: string; uf?: string; cep?: string;
}
export interface Remetente extends Endereco {
  nome?: string; documento?: string; telefone?: string; email?: string;
}

export async function getCorreiosCredential(admin: Admin, tenantId: string): Promise<CorreiosCredential | null> {
  const { data, error } = await admin
    .from('tenant_correios_credentials')
    .select('tenant_id, usuario, codigo_acesso, cartao_postagem, contrato, codigo_servico, remetente, access_token, token_expires_at')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  if (error) throw error;
  return (data as CorreiosCredential | null) ?? null;
}

/** Token do cartão de postagem. Guardado por 24 h: pedir um a cada etiqueta é bloqueio de IP na certa. */
export async function correiosToken(admin: Admin, cred: CorreiosCredential): Promise<string> {
  if (cred.access_token && cred.token_expires_at && new Date(cred.token_expires_at).getTime() - Date.now() > 5 * 60_000) {
    return cred.access_token;
  }
  const res = await fetch(`${CORREIOS_API}/token/v1/autentica/cartaopostagem`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${cred.usuario}:${cred.codigo_acesso}`)}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ numero: cred.cartao_postagem }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Correios token ${res.status}: ${text.slice(0, 300)}`);
  const body = JSON.parse(text) as { token: string; expiraEm?: string };
  const expira = body.expiraEm ? new Date(body.expiraEm).toISOString() : new Date(Date.now() + 20 * 3600_000).toISOString();
  const { data, error } = await admin
    .from('tenant_correios_credentials')
    .update({ access_token: body.token, token_expires_at: expira })
    .eq('tenant_id', cred.tenant_id)
    .select('tenant_id');
  if (error) throw error;
  if (!data?.length) throw new Error('credencial dos Correios não gravada');
  cred.access_token = body.token;
  cred.token_expires_at = expira;
  return body.token;
}

async function correiosFetch<T = unknown>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${CORREIOS_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Correios ${res.status}: ${text.slice(0, 300)}`);
  return (text ? JSON.parse(text) : null) as T;
}

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

export interface DestinatarioInput extends Endereco {
  nome: string; documento?: string | null; telefone?: string | null; email?: string | null;
}
export interface ItemDeclarado { conteudo: string; quantidade: number; valor: number }

export interface EtiquetaCorreios {
  codigo_objeto: string;
  id_prepostagem: string;
  pdf_base64: string;
}

/**
 * Faz a pré-postagem e devolve o rótulo em PDF. `pesoGramas` é o peso somado do
 * pedido; sem peso cadastrado no produto, o chamador manda o mínimo para o
 * serviço não recusar, e a tela avisa.
 */
export async function gerarEtiquetaCorreios(
  admin: Admin,
  cred: CorreiosCredential,
  destinatario: DestinatarioInput,
  itens: ItemDeclarado[],
  pesoGramas: number,
  numeroPedido: number,
): Promise<EtiquetaCorreios> {
  const token = await correiosToken(admin, cred);
  const r = cred.remetente ?? {};

  const pre = await correiosFetch<{ id?: string | number; codigoObjeto?: string }>(token, '/prepostagem/v1/prepostagens', {
    method: 'POST',
    body: JSON.stringify({
      remetente: {
        nome: r.nome, dddTelefone: digits(r.telefone).slice(0, 2), telefone: digits(r.telefone).slice(2),
        email: r.email, cpfCnpj: digits(r.documento),
        endereco: {
          logradouro: r.logradouro, numero: r.numero, complemento: r.complemento,
          bairro: r.bairro, cidade: r.cidade, uf: r.uf, cep: digits(r.cep),
        },
      },
      destinatario: {
        nome: destinatario.nome, documento: digits(destinatario.documento),
        dddTelefone: digits(destinatario.telefone).slice(0, 2), telefone: digits(destinatario.telefone).slice(2),
        email: destinatario.email ?? undefined,
        endereco: {
          logradouro: destinatario.logradouro, numero: destinatario.numero, complemento: destinatario.complemento,
          bairro: destinatario.bairro, cidade: destinatario.cidade, uf: destinatario.uf, cep: digits(destinatario.cep),
        },
      },
      codigoServico: cred.codigo_servico,
      numeroContrato: cred.contrato ?? undefined,
      cartaoPostagem: cred.cartao_postagem,
      pesoInformado: String(Math.max(pesoGramas, 1)),
      codigoFormatoObjetoInformado: '2',                 // 2 = pacote/caixa
      numeroNotaFiscal: undefined,
      observacao: `Helpoint — pedido #${numeroPedido}`,
      itensDeclaracaoConteudo: itens.map((i) => ({
        conteudo: i.conteudo.slice(0, 60), quantidade: String(Math.round(i.quantidade)), valor: String(i.valor.toFixed(2)),
      })),
    }),
  });
  const codigoObjeto = pre?.codigoObjeto;
  const idPre = pre?.id != null ? String(pre.id) : null;
  if (!codigoObjeto || !idPre) throw new Error('os Correios não devolveram o código do objeto');

  const recibo = await correiosFetch<{ idRecibo?: string | number }>(token, '/prepostagem/v1/prepostagens/rotulo/assincrono/pdf', {
    method: 'POST',
    body: JSON.stringify({ codigosObjeto: [codigoObjeto], idCorreios: cred.usuario, tipoRotulo: 'P', formatoRotulo: 'ET' }),
  });
  const idRecibo = recibo?.idRecibo != null ? String(recibo.idRecibo) : null;
  if (!idRecibo) throw new Error('os Correios não devolveram o recibo do rótulo');

  // O rótulo é assíncrono: alguns segundos até ficar pronto.
  let pdf: string | null = null;
  for (let tentativa = 0; tentativa < 8 && !pdf; tentativa++) {
    await new Promise((r2) => setTimeout(r2, 1500));
    const baixado = await correiosFetch<{ dados?: string; pdf?: string }>(
      token, `/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`,
    ).catch(() => null);
    pdf = baixado?.dados ?? baixado?.pdf ?? null;
  }
  if (!pdf) throw new Error('o rótulo não ficou pronto a tempo; tente de novo em alguns segundos');

  return { codigo_objeto: codigoObjeto, id_prepostagem: idPre, pdf_base64: pdf };
}
