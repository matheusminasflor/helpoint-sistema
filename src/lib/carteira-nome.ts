// Compara o nome de carteira digitado contra as já conhecidas, ignorando
// caixa e acento — "BERCARIO" e "Berçário" são a mesma carteira (Frente 7 §3,
// .scratch/plano-frente7-metas-digitadas.md). Carteira é texto livre, sem
// tabela de domínio (nenhuma migration a cria — anexo da Frente 2): a única
// proteção contra uma carteira duplicada por acidente é esta comparação,
// antes de o botão "nova carteira" criar qualquer coisa.

export function normalizarNomeCarteira(nome: string): string {
  // NFD separa a letra do acento (ex.: "ã" -> "a" + til combinante); o
  // replace tira a faixa de marcas combinantes (U+0300-U+036F). Mesmo padrão
  // de `normalizarCabecalho` em src/lib/comercial-import.ts.
  return nome.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase();
}

export type ComparacaoCarteira =
  | { existe: true; nomeExistente: string }
  | { existe: false };

/** Diz se o nome digitado já existe entre as conhecidas (ignorando caixa e acento) ou é de fato uma carteira nova. */
export function compararCarteira(nomeDigitado: string, conhecidas: string[]): ComparacaoCarteira {
  const normalizado = normalizarNomeCarteira(nomeDigitado);
  const encontrada = conhecidas.find((c) => normalizarNomeCarteira(c) === normalizado);
  return encontrada ? { existe: true, nomeExistente: encontrada } : { existe: false };
}
