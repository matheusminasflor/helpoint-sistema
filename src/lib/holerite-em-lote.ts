// Holerites em lote, pelo nome do arquivo (proposta "Helpoint no dia a dia", etapa 4 · RH, 2026-10-25). Puro, para o
// teste: de quem é cada PDF. "Holerite 10-2026 - Maria Aparecida Souza.pdf" → Maria Aparecida Souza.

export interface PessoaDoLote { id: string; full_name: string | null; email: string | null }

const normalizar = (t: string) => ` ${t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;

/**
 * A pessoa cujo nome inteiro aparece no nome do arquivo (sem acento, sem caixa, palavra por palavra). Se o nome inteiro
 * de mais de uma pessoa aparece, vale o mais longo ("Ana Paula Lima" ganha de "Ana Paula"); empate = ninguém, e o RH
 * escolhe na lista. Sem nome completo, o e-mail antes do @ ("maria.souza").
 */
export function quemEhDoArquivo(arquivo: string, pessoas: PessoaDoLote[]): string | null {
  const alvo = normalizar(arquivo.replace(/\.[a-z0-9]+$/i, ''));
  const achados = pessoas
    .map((p) => {
      const nome = p.full_name?.trim() ? normalizar(p.full_name) : p.email ? normalizar(p.email.split('@')[0]) : null;
      return nome && nome.trim().length >= 3 && alvo.includes(nome) ? { id: p.id, tamanho: nome.length } : null;
    })
    .filter((x): x is { id: string; tamanho: number } => !!x)
    .sort((a, b) => b.tamanho - a.tamanho);
  if (!achados.length) return null;
  if (achados.length > 1 && achados[0].tamanho === achados[1].tamanho) return null;
  return achados[0].id;
}
