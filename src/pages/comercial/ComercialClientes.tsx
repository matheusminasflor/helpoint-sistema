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
import { Search, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { FichaClienteSecao } from '@/components/comercial/FichaCliente';
import { useAnoComVenda, useBuscarClientes, useClientesATrabalhar } from '@/hooks/useComercialPainel';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import type { ClienteATrabalhar, CriterioCurva, Filial } from '@/types/comercial';

export default function ComercialClientes() {
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  // Seletor do topo da página (Frente 5a): o bloco "mix por faixa" da
  // ficha do cliente segue este critério — não tem um segundo seletor
  // dentro da ficha.
  const [criterio, setCriterio] = useState<CriterioCurva>('valor');
  const [params, setParams] = useSearchParams();
  const clienteSelecionado = params.get('cliente');

  const { data, isLoading } = useClientesATrabalhar(ano, filial);
  const linhas = data?.linhas ?? [];

  // Os seletores são montados UMA vez e renderizados em um dos dois lugares
  // (acima da lista, ou dentro da ficha) — nunca duplicados, nunca com dois
  // estados. Duas cópias do mesmo filtro é exatamente como a ficha e a lista
  // passariam a discordar sobre qual período está na tela.
  const filtros = (
    <>
      <FiltrosComerciais ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial} />
      <Select value={criterio} onValueChange={(v) => setCriterio(v as CriterioCurva)}>
        <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="valor">Por valor</SelectItem>
          <SelectItem value="quantidade">Por quantidade</SelectItem>
        </SelectContent>
      </Select>
    </>
  );

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
          sumir só porque um cliente foi escolhido.
          Etapa 3: continua não sumindo — MUDA DE LUGAR. Com a ficha aberta
          estes mesmos seletores são renderizados DENTRO dela (`filtros`),
          logo abaixo do título, porque é a ficha que eles filtram. O estado
          segue morando aqui, um só, compartilhado com a lista. */}
      {!clienteSelecionado && <div className="flex flex-wrap items-center gap-3">{filtros}</div>}

      {clienteSelecionado ? (
        <FichaClienteSecao
          codigo={clienteSelecionado}
          de={`${ano}-01-01`}
          ate={`${ano}-12-31`}
          filial={filial}
          criterio={criterio}
          onFechar={limparCliente}
          filtros={filtros}
        />
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
                {limparNomeCliente(c.razao_social)} <span className="text-muted-foreground">({c.codigo})</span>
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
  linhas: ClienteATrabalhar[];
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
                  <button type="button" onClick={() => onEscolher(c.cliente_codigo)} className="text-primary hover:underline text-left" title={c.nome}>
                    {limparNomeCliente(c.nome)}
                  </button>
                  {/* A marca de CONDIÇÃO (leva F, item 5). O §11 linha 325 pede, a
                      lista da Diretoria já mostrava, esta não — porque
                      `com_clientes_a_trabalhar` não devolvia o campo. Agora devolve,
                      da MESMA coluna (`com_clientes.em_condicao`) de onde as outras
                      três funções leem, e a marca é a mesma frase nos dois lugares:
                      cliente com dois nomes para a mesma coisa é defeito novo. */}
                  {c.em_condicao && <span className="ml-1.5 text-[10px] text-muted-foreground">(condição)</span>}
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
