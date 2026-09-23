// Limpa o CPF/CNPJ que o Forteplus cola no fim da razão social de pessoa
// física (§14 item 6 do documento do dono; Frente 4, §5 do plano). No banco
// de teste, dos 68 clientes, 3 terminam com 11 dígitos crus colados
// ("NOME SOBRENOME 12345678901") — nenhum com documento formatado, mas a
// regra aceita os dois formatos porque outra empresa pode importar assim.
//
// Regra pura com Vitest — nunca inline na tela (§5 do plano): o mesmo
// cliente com dois nomes em duas telas (uma limpa, outra não) é um defeito
// novo, e essa é a única razão de isto ser função em vez de um `slice`
// local em cada lugar que mostra nome de cliente.
//
// Exatamente 11 (CPF) ou 14 (CNPJ) dígitos — "muitos dígitos" pegaria nomes
// como "COMERCIAL 2000" ou "LOJA 24 HORAS", que não têm documento nenhum.
const DOC_NO_FIM = /\s+([0-9.\-/]+)\s*$/;

/**
 * Remove o CPF/CNPJ colado no fim do nome. Devolve o nome original quando
 * não há documento colado, ou quando removê-lo não deixaria nome nenhum —
 * limpar até não sobrar nome é pior que não limpar.
 */
export function limparNomeCliente(nome: string): string {
  const match = nome.match(DOC_NO_FIM);
  if (!match) return nome;

  const digitos = match[1].replace(/\D/g, '');
  if (digitos.length !== 11 && digitos.length !== 14) return nome;

  const resto = nome.slice(0, match.index).trim();
  if (resto === '' || /^[.\-/\s]*$/.test(resto)) return nome;
  return resto;
}
