// A visão "Clientes" do Insights do Comercial (L6b + L6c): clientes a
// trabalhar — quem comprou e parou — e a ficha de um cliente escolhido.
// Ver `.scratch/plano-l6b-curva-e-condicao.md` §2.4 e
// `docs/instrucoes-painel-comercial.md` §12.
//
// A ficha vive em `?cliente=CODIGO`: escolher um cliente na busca põe o
// código na URL e a ficha aparece abaixo da lista de "clientes a
// trabalhar" — sem `?cliente=`, a tela é a de sempre, intacta.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, Users, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { useAnoComVenda, useBuscarClientes, useClientesATrabalhar } from '@/hooks/useComercialPainel';
import { useFichaCliente } from '@/hooks/useComercialCashback';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import type { Filial } from '@/types/comercial';

export default function ComercialClientes() {
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  const [params, setParams] = useSearchParams();
  const clienteSelecionado = params.get('cliente');

  const { data, isLoading } = useClientesATrabalhar(ano, filial);
  const linhas = data?.linhas ?? [];

  const escolherCliente = (codigo: string) => {
    const proximos = new URLSearchParams(params);
    proximos.set('cliente', codigo);
    setParams(proximos, { replace: true });
  };
  const limparCliente = () => {
    const proximos = new URLSearchParams(params);
    proximos.delete('cliente');
    setParams(proximos, { replace: true });
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
        <p className="text-[13px] text-muted-foreground">Clientes a trabalhar: compraram nos meses anteriores e pararam no mais recente.</p>
      </div>

      <BuscaCliente onEscolher={escolherCliente} />

      {/* Achado 4 da auditoria da L6c: o seletor de filial ficava ESCONDIDO
          com a ficha aberta — ao filtrar por empresa, o painel inteiro
          recalcula, fichas inclusive (§1a/§11), então o filtro não pode
          sumir só porque um cliente foi escolhido. */}
      <div className="flex flex-wrap items-center gap-3">
        <FiltrosComerciais ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial} />
      </div>

      {clienteSelecionado ? (
        <FichaClienteSecao codigo={clienteSelecionado} ano={ano} filial={filial} onFechar={limparCliente} />
      ) : (
        <ListaClientesATrabalhar linhas={linhas} isLoading={isLoading} ano={ano} cortou={data?.cortou} onEscolher={escolherCliente} />
      )}
    </div>
  );
}

/** Busca por nome ou código — sempre visível, independente de haver cliente escolhido. */
function BuscaCliente({ onEscolher }: { onEscolher: (codigo: string) => void }) {
  const [termo, setTermo] = useState('');
  const { data: resultados } = useBuscarClientes(termo);
  const mostrarLista = termo.trim().length >= 2 && !!resultados;

  return (
    <div className="relative max-w-md">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />
        <Input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Buscar cliente por nome ou código…"
          className="pl-8 h-9 text-[13px]"
        />
      </div>
      {mostrarLista && (
        <div className="absolute z-10 mt-1 w-full rounded-md border border-border bg-popover shadow-md max-h-64 overflow-y-auto">
          {resultados.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-muted-foreground">Nenhum cliente encontrado.</div>
          ) : (
            resultados.map((c) => (
              <button
                key={c.codigo}
                type="button"
                className="w-full text-left px-3 py-1.5 text-[12px] hover:bg-secondary/60"
                onClick={() => { onEscolher(c.codigo); setTermo(''); }}
              >
                {c.razao_social} <span className="text-muted-foreground">({c.codigo})</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function ListaClientesATrabalhar({
  linhas, isLoading, ano, cortou, onEscolher,
}: {
  linhas: { cliente_codigo: string; nome: string; tabela_preco: string | null; ultima_compra: string | null; valor_ultimos_3m: number }[];
  isLoading: boolean;
  ano: number;
  cortou?: boolean;
  /** Item 2 do plano da Frente 3: nome do cliente é a porta única para a ficha, mesmo já estando nesta tela. */
  onEscolher: (codigo: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" aria-hidden="true" />
          Clientes a trabalhar em {ano}
        </div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Cliente</th>
              <th className="px-3 py-1.5 font-semibold">Tabela</th>
              <th className="px-3 py-1.5 font-semibold">Última compra</th>
              <th className="px-3 py-1.5 font-semibold text-right">Valor nos últimos 3 meses</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((c) => (
              <tr key={c.cliente_codigo} className="border-t border-border">
                <td className="px-3 py-1.5">
                  <button type="button" onClick={() => onEscolher(c.cliente_codigo)} className="text-primary hover:underline text-left">
                    {c.nome}
                  </button>
                </td>
                <td className="px-3 py-1.5 text-muted-foreground">{c.tabela_preco ?? '—'}</td>
                <td className="px-3 py-1.5">{formatDateBR(c.ultima_compra)}</td>
                <td className="px-3 py-1.5 text-right font-mono">{formatBRL(c.valor_ultimos_3m)}</td>
              </tr>
            ))}
            {!isLoading && linhas.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Nenhum cliente parou de comprar em {ano}.</td></tr>
            )}
          </tbody>
        </table>
        {cortou && (
          <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
            Lista maior que o mostrado aqui — estreite a filial para ver o restante.
          </p>
        )}
      </div>
  );
}

/**
 * A ficha do cliente (L6c) — o que compra, o que veio bonificado, parou de
 * comprar e nunca comprou. O período é o ano inteiro escolhido na tela
 * (mesma unidade das outras visões do Insights). `filial` recalcula a ficha
 * inteira para aquela empresa (achado 4 da auditoria da L6c) — `null` é "as
 * duas", como nas irmãs.
 */
function FichaClienteSecao({
  codigo, ano, filial, onFechar,
}: { codigo: string; ano: number; filial: Filial | null; onFechar: () => void }) {
  const de = `${ano}-01-01`;
  const ate = `${ano}-12-31`;
  const { data: ficha, isLoading } = useFichaCliente(codigo, de, ate, filial);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[13px] font-semibold">Ficha do cliente {codigo} em {ano}</h2>
        <Button variant="ghost" size="sm" onClick={onFechar}>
          <X className="w-3.5 h-3.5 mr-1" /> Fechar ficha
        </Button>
      </div>

      {isLoading && <p className="text-[12px] text-muted-foreground">Carregando…</p>}

      {ficha && (
        <>
          <FichaTabela titulo="Comprou" linhas={ficha.comprou} vazio="Nada comprado no período." />
          <FichaTabela titulo="Bonificado" linhas={ficha.bonificado} vazio="Nenhuma bonificação no período." />

          <div className="rounded-lg border border-border overflow-x-auto">
            <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Parou de comprar</div>
            <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
              Comprou em pelo menos 2 dos 3 meses anteriores ao último mês com movimento dele, e não comprou nesse último mês.
            </p>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Produto</th>
                </tr>
              </thead>
              <tbody>
                {ficha.parou_de_comprar.map((p) => (
                  <tr key={p.produto_codigo} className="border-t border-border">
                    <td className="px-3 py-1.5">{p.nome}</td>
                  </tr>
                ))}
                {ficha.parou_de_comprar.length === 0 && (
                  <tr><td className="px-3 py-4 text-center text-muted-foreground">Nenhum produto parou.</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="rounded-lg border border-border overflow-x-auto">
            <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Nunca comprou</div>
            <p className="px-4 py-2 text-[12px] text-muted-foreground border-b border-border">
              Ordenado pelo que o produto vendeu no período para os outros clientes — o que ele está deixando de comprar que mais gira.
            </p>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="bg-secondary/60 text-left text-muted-foreground">
                  <th className="px-3 py-1.5 font-semibold">Produto</th>
                  <th className="px-3 py-1.5 font-semibold text-right">Vendido para outros no período</th>
                </tr>
              </thead>
              <tbody>
                {ficha.nunca_comprou.map((p) => (
                  <tr key={p.produto_codigo} className="border-t border-border">
                    <td className="px-3 py-1.5">{p.nome}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{formatBRL(p.valor_outros)}</td>
                  </tr>
                ))}
                {ficha.nunca_comprou.length === 0 && (
                  <tr><td colSpan={2} className="px-3 py-4 text-center text-muted-foreground">Nada — comprou de tudo.</td></tr>
                )}
              </tbody>
            </table>
            {ficha.nunca_comprou_total > ficha.nunca_comprou.length && (
              <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border">
                Mostrando {ficha.nunca_comprou.length} de {ficha.nunca_comprou_total}.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function FichaTabela({
  titulo, linhas, vazio,
}: {
  titulo: string;
  linhas: { produto_codigo: string; nome: string; valor: number; quantidade: number }[];
  vazio: string;
}) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">{titulo}</div>
      <table className="w-full text-[12px]">
        <thead>
          <tr className="bg-secondary/60 text-left text-muted-foreground">
            <th className="px-3 py-1.5 font-semibold">Produto</th>
            <th className="px-3 py-1.5 font-semibold text-right">Valor</th>
            <th className="px-3 py-1.5 font-semibold text-right">Quantidade</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.produto_codigo} className="border-t border-border">
              <td className="px-3 py-1.5">{l.nome}</td>
              <td className="px-3 py-1.5 text-right font-mono">{formatBRL(l.valor)}</td>
              <td className="px-3 py-1.5 text-right font-mono">{l.quantidade}</td>
            </tr>
          ))}
          {linhas.length === 0 && (
            <tr><td colSpan={3} className="px-3 py-4 text-center text-muted-foreground">{vazio}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
