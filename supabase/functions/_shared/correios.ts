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
//
// Duas coisas que a auditoria da ENC-1 obrigou a separar:
//   • **criar a pré-postagem** e **baixar o rótulo** são funções diferentes.
//     Pré-postagem custa dinheiro e gera um objeto rastreado; imprimir de novo,
//     não. Quem já tem código de objeto reimprime, nunca cria outro.
//   • **pedir o token** não grava nada. O "Testar conexão" da tela usa a versão
//     pura, então digitar um código errado não derruba o contrato que já valia.
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

/**
 * Tira do texto de erro o que não pode aparecer na tela. Os Correios ecoam o
 * corpo enviado em erro de validação, e ali vai o número do cartão de postagem
 * inteiro — a tela só pode ver os quatro últimos.
 */
function semSegredo(texto: string, cred: Pick<CorreiosCredential, 'cartao_postagem' | 'codigo_acesso' | 'usuario'>): string {
  let limpo = texto;
  for (const segredo of [cred.codigo_acesso, cred.cartao_postagem, cred.usuario]) {
    if (segredo && segredo.length >= 4) limpo = limpo.split(segredo).join('…');
  }
  return limpo;
}

type Credenciais = Pick<CorreiosCredential, 'usuario' | 'codigo_acesso' | 'cartao_postagem'>;

/** Pede um token novo aos Correios. **Não grava nada** — é o que o "Testar conexão" usa. */
export async function pedirTokenCorreios(cred: Credenciais): Promise<{ token: string; expira: string }> {
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
  if (!res.ok) throw new Error(`Correios token ${res.status}: ${semSegredo(text.slice(0, 300), cred)}`);
  const body = JSON.parse(text) as { token: string; expiraEm?: string };
  if (!body?.token) throw new Error('os Correios não devolveram o token do cartão de postagem');
  const expira = body.expiraEm ? new Date(body.expiraEm).toISOString() : new Date(Date.now() + 20 * 3600_000).toISOString();
  return { token: body.token, expira };
}

/** Token do cartão de postagem, guardado por 24 h: pedir um a cada etiqueta é bloqueio de IP na certa. */
export async function correiosToken(admin: Admin, cred: CorreiosCredential): Promise<string> {
  if (cred.access_token && cred.token_expires_at && new Date(cred.token_expires_at).getTime() - Date.now() > 5 * 60_000) {
    return cred.access_token;
  }
  const { token, expira } = await pedirTokenCorreios(cred);
  const { data, error } = await admin
    .from('tenant_correios_credentials')
    .update({ access_token: token, token_expires_at: expira })
    .eq('tenant_id', cred.tenant_id)
    .select('tenant_id');
  if (error) throw error;
  if (!data?.length) throw new Error('credencial dos Correios não gravada');
  cred.access_token = token;
  cred.token_expires_at = expira;
  return token;
}

async function correiosFetch<T = unknown>(
  token: string, cred: Credenciais, path: string, init: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${CORREIOS_API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Correios ${res.status}: ${semSegredo(text.slice(0, 300), cred)}`);
  return (text ? JSON.parse(text) : null) as T;
}

const digits = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '');

export interface DestinatarioInput extends Endereco {
  nome: string; documento?: string | null; telefone?: string | null; email?: string | null;
}
export interface ItemDeclarado { conteudo: string; quantidade: number; valor: number }

export interface Prepostagem {
  codigo_objeto: string;
  id_prepostagem: string;
}

/**
 * Cria a pré-postagem e devolve o código do objeto (que é o rastreio).
 * **Custa dinheiro e gera um objeto**: quem já tem código de objeto chama
 * `baixarRotuloCorreios`, nunca esta função de novo. `pesoGramas` é o peso
 * somado do pedido; sem peso cadastrado no produto o chamador manda o mínimo,
 * e a tela avisa.
 */
export async function criarPrepostagemCorreios(
  admin: Admin,
  cred: CorreiosCredential,
  destinatario: DestinatarioInput,
  itens: ItemDeclarado[],
  pesoGramas: number,
  numeroPedido: number,
): Promise<Prepostagem> {
  const token = await correiosToken(admin, cred);
  const r = cred.remetente ?? {};

  const pre = await correiosFetch<{ id?: string | number; codigoObjeto?: string }>(token, cred, '/prepostagem/v1/prepostagens', {
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
      observacao: `Helpoint — pedido #${numeroPedido}`,
      itensDeclaracaoConteudo: itens.map((i) => ({
        conteudo: i.conteudo.slice(0, 60), quantidade: String(Math.round(i.quantidade)), valor: String(i.valor.toFixed(2)),
      })),
    }),
  });
  const codigoObjeto = pre?.codigoObjeto;
  const idPre = pre?.id != null ? String(pre.id) : null;
  if (!codigoObjeto || !idPre) throw new Error('os Correios não devolveram o código do objeto');
  return { codigo_objeto: codigoObjeto, id_prepostagem: idPre };
}

/**
 * Baixa o rótulo em PDF de um objeto que já existe. É por aqui que se
 * reimprime: não cria pré-postagem nenhuma, então clicar duas vezes não custa
 * nada nem duplica o envio.
 */
export async function baixarRotuloCorreios(admin: Admin, cred: CorreiosCredential, codigoObjeto: string): Promise<string> {
  const token = await correiosToken(admin, cred);
  const recibo = await correiosFetch<{ idRecibo?: string | number }>(token, cred, '/prepostagem/v1/prepostagens/rotulo/assincrono/pdf', {
    method: 'POST',
    body: JSON.stringify({ codigosObjeto: [codigoObjeto], idCorreios: cred.usuario, tipoRotulo: 'P', formatoRotulo: 'ET' }),
  });
  const idRecibo = recibo?.idRecibo != null ? String(recibo.idRecibo) : null;
  if (!idRecibo) throw new Error('os Correios não devolveram o recibo do rótulo');

  // O rótulo é assíncrono: alguns segundos até ficar pronto. A primeira
  // tentativa vai na hora — às vezes já está — e o último erro é guardado,
  // para a tela não dizer "demorou" quando na verdade foi 403.
  let ultimoErro: unknown = null;
  for (let tentativa = 0; tentativa < 8; tentativa++) {
    if (tentativa > 0) await new Promise((r) => setTimeout(r, 1500));
    try {
      const baixado = await correiosFetch<{ dados?: string; pdf?: string }>(
        token, cred, `/prepostagem/v1/prepostagens/rotulo/download/assincrono/${idRecibo}`,
      );
      const pdf = baixado?.dados ?? baixado?.pdf ?? null;
      if (pdf) return pdf;
    } catch (e) {
      ultimoErro = e;
      // 404 enquanto processa é esperado; qualquer outra coisa não adianta repetir.
      const msg = e instanceof Error ? e.message : String(e);
      if (!/Correios 40[04]/.test(msg)) throw e;
    }
  }
  throw new Error(
    ultimoErro instanceof Error
      ? `o rótulo não ficou pronto: ${ultimoErro.message}`
      : 'o rótulo não ficou pronto a tempo; tente de novo em alguns segundos',
  );
}
