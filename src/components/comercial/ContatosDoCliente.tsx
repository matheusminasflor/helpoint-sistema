import { useContatosDoCliente, STATUS_INTERACAO } from '@/hooks/useComercialLancamentos';
import { formatBRL, formatDateBR } from '@/types/financeiro';

/**
 * Os contatos com o cliente (aba Relacionamento da Ficha, etapa 4 · Comercial, 2026-10-24): cada lançamento, com quem
 * fez, o status, a venda e o próximo prazo. O banco mostra à vendedora os dela e ao gestor todos.
 */
export function ContatosDoCliente({ codigo }: { codigo: string }) {
  const { data: contatos = [], isLoading, isError } = useContatosDoCliente(codigo);
  const rotulo = (s: string) => STATUS_INTERACAO.find((x) => x.valor === s)?.rotulo ?? s;
  return (
    <section className="rounded-lg border border-border p-3">
      <h3 className="text-sm font-semibold mb-2">Contatos</h3>
      {isLoading ? <p className="text-[13px] text-muted-foreground">Carregando…</p>
        : isError ? <p className="text-[13px] text-status-danger">Não consegui carregar os contatos.</p>
        : contatos.length === 0 ? <p className="text-[13px] text-muted-foreground">Nenhum contato lançado com este cliente.</p>
        : (
          <ul className="divide-y divide-border">
            {contatos.map((c) => (
              <li key={c.id} className="py-2 text-[13px] grid gap-0.5">
                <span className="flex flex-wrap gap-x-2">
                  <span className="tabular-nums font-medium">{formatDateBR(c.data)}</span>
                  <span>{c.vendedor?.full_name ?? '—'}</span>
                  <span className="text-muted-foreground">{rotulo(c.status)}</span>
                  {c.valor_venda ? <span className="tabular-nums">{formatBRL(c.valor_venda)}</span> : null}
                  {c.prazo && c.status !== 'concluido' && <span className="text-muted-foreground">retorno {formatDateBR(c.prazo)}</span>}
                </span>
                {c.observacoes && <span className="text-muted-foreground">{c.observacoes}</span>}
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}
