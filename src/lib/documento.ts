/**
 * CNPJ e CPF: guardar só dígitos, mostrar pontuado.
 *
 * Por que só dígitos no banco (leva G, 2026-09-26): é por este campo que os
 * chamados do SAC aparecem na ficha do cliente, e o SAC grava sem pontuação
 * (`sac_tickets.customer_document`, `08319138000160`). Comparar
 * `08.319.138/0001-60` com `08319138000160` não bate nunca — e o sintoma não é
 * erro, é "nenhum chamado", que é indistinguível de "não tem chamado".
 *
 * A validação aqui é de FORMA, não de dígito verificador: 11 ou 14 dígitos. O
 * CHECK do banco diz a mesma coisa. Conferir o dígito verificador seria
 * possível, e fica de fora porque documento digitado errado que *passa* no
 * dígito verificador existe do mesmo jeito — quem confere é a nota fiscal.
 */

/** Tira tudo que não é dígito. É o que vai para o banco. */
export function soDigitos(valor: string | null | undefined): string {
  return (valor ?? '').replace(/\D/g, '');
}

/** 11 dígitos (CPF) ou 14 (CNPJ). Vazio não é inválido: é vazio. */
export function documentoTemForma(valor: string | null | undefined): boolean {
  const d = soDigitos(valor);
  return d.length === 11 || d.length === 14;
}

/** Como mostrar: `08.319.138/0001-60` ou `123.456.789-09`. */
export function formatarDocumento(valor: string | null | undefined): string {
  const d = soDigitos(valor);
  if (d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) {
    return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  }
  // Nem CPF nem CNPJ: devolve o que veio, sem inventar pontuação num número
  // incompleto — quem está digitando precisa ver o que digitou.
  return d;
}

export function rotuloDoDocumento(valor: string | null | undefined): string {
  const d = soDigitos(valor);
  if (d.length === 14) return 'CNPJ';
  if (d.length === 11) return 'CPF';
  return 'Documento';
}

// ─────────────────────────────────────────────────────────────────────────────
// Dígito verificador, e a extração do documento de dentro do nome
//
// POR QUE O DÍGITO VERIFICADOR ENTROU AGORA (2026-09-27). Acima está escrito que
// conferir o DV ficou de fora de propósito, e continua certo **para quem digita**:
// documento errado que passa no DV existe, e quem confere de verdade é a nota
// fiscal. Mas apareceu um segundo uso, e nele o DV é a ferramenta principal.
//
// Medido em 2026-09-27: dos 450 clientes importados do Forteplus, **nenhum** tem
// documento — o arquivo de clientes do ERP traz 5 colunas e CNPJ não é uma delas.
// Só que o Forteplus **põe o documento dentro da razão social** nos clientes pessoa
// física e MEI, do jeito que a Receita registra:
//
//   EDMAR GONCALVES DA SILVA 04907925611     → CPF completo, 11 dígitos
//   49.932.013 LILIAN VIEIRA DA SILVA        → raiz do CNPJ, sem /0001-XX
//   DUNOGUE DISTRIBUIDORA DE COSMETICOS LTDA → nada
//
// Contados: **120 com CPF no nome, 25 com raiz de CNPJ, 305 sem nada** — 145 de 450
// preenchíveis sem pedir arquivo novo a ninguém.
//
// E AQUI O DV É INDISPENSÁVEL, não enfeite: "11 dígitos seguidos" também é a forma
// de um telefone com DDD (`31987654321`). Sem conferir o DV, a extração gravaria
// telefone no campo de CPF — e um documento errado no cadastro não dá erro: faz o
// chamado do SAC não encontrar o cliente, que é o defeito que a leva G existiu para
// evitar. Com o DV, a chance de um número qualquer de 11 dígitos passar é ~1 em 121.
// Não é zero: por isso a extração é **reversível** e vem com relatório para o dono
// conferir por amostra, em vez de gravar caladinho.

/** Soma ponderada mod 11, a conta que CPF e CNPJ compartilham. */
function digitoMod11(digitos: number[], pesos: number[]): number {
  const soma = digitos.reduce((acc, d, i) => acc + d * pesos[i], 0);
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

/** O CPF confere no dígito verificador? Repetição (111.111.111-11) não confere. */
export function cpfValido(valor: string | null | undefined): boolean {
  const d = soDigitos(valor);
  if (d.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(d)) return false;
  const n = d.split('').map(Number);
  const dv1 = digitoMod11(n.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoMod11(n.slice(0, 10), [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === n[9] && dv2 === n[10];
}

/** O CNPJ confere no dígito verificador? Repetição não confere. */
export function cnpjValido(valor: string | null | undefined): boolean {
  const d = soDigitos(valor);
  if (d.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(d)) return false;
  const n = d.split('').map(Number);
  const dv1 = digitoMod11(n.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoMod11(n.slice(0, 13), [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return dv1 === n[12] && dv2 === n[13];
}

/** CPF de 11 ou CNPJ de 14, conferido no dígito verificador. */
export function documentoValido(valor: string | null | undefined): boolean {
  const d = soDigitos(valor);
  return d.length === 11 ? cpfValido(d) : d.length === 14 ? cnpjValido(d) : false;
}

/** Completa uma raiz de CNPJ (8 dígitos) com a filial 0001 e calcula o DV. */
function cnpjDaRaiz(raiz: string): string | null {
  const d = soDigitos(raiz);
  if (d.length !== 8) return null;
  const base = `${d}0001`;
  const n = base.split('').map(Number);
  const dv1 = digitoMod11(n, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const dv2 = digitoMod11([...n, dv1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const completo = `${base}${dv1}${dv2}`;
  return cnpjValido(completo) ? completo : null;
}

/**
 * O documento escondido dentro do nome, ou `null`.
 *
 * Tenta, nesta ordem: CNPJ completo pontuado → CNPJ ou CPF em dígitos corridos →
 * raiz de CNPJ pontuada (completada com `/0001` e DV calculado). **Só devolve o que
 * passa no dígito verificador** — ver o comentário do bloco acima.
 *
 * A raiz vem por último de propósito: ela é um palpite (assume a filial `0001`, que
 * é o caso do MEI e da matriz), e um número que já veio completo no nome nunca deve
 * perder para um palpite.
 */
export function extrairDocumentoDoNome(nome: string | null | undefined): string | null {
  const texto = nome ?? '';

  const pontuado = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
  if (pontuado && cnpjValido(pontuado[0])) return soDigitos(pontuado[0]);

  // Dígitos corridos: 14 (CNPJ) ou 11 (CPF). A borda `(?!\d)` impede pegar 11 de
  // dentro de um número de 13 — pedaço de número não é documento.
  for (const m of texto.matchAll(/(?<!\d)(\d{14}|\d{11})(?!\d)/g)) {
    if (documentoValido(m[1])) return m[1];
  }

  const raiz = texto.match(/(?<!\d)\d{2}\.\d{3}\.\d{3}(?!\/|\d)/);
  if (raiz) {
    const completo = cnpjDaRaiz(raiz[0]);
    if (completo) return completo;
  }

  return null;
}
