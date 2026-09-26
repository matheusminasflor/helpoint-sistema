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
