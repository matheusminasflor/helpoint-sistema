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
import { Search, Users, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { FichaClienteSecao } from '@/components/comercial/FichaCliente';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { FormularioCliente } from '@/components/comercial/FormularioCliente';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { podeAcessarComercial } from '@/lib/acesso-comercial';
import { useAnoComVenda, useBuscarClientes, useClientesATrabalhar } from '@/hooks/useComercialPainel';
import { limparNomeCliente } from '@/lib/nome-cliente';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import type { ClienteATrabalhar, CriterioCurva, Filial } from '@/types/comercial';

export default function ComercialClientes() {
  // Simplificado × analítico (leva E). Tela de LER: abre simplificada.
  const [visao, setVisao] = useVisaoRelatorio('comercial-clientes');
  const { ano, setAno, anos } = useAnoComVenda();
  const [filial, setFilial] = useState<Filial | null>(null);
  // Seletor do topo da página (Frente 5a): o bloco "mix por faixa" da
  // ficha do cliente segue este critério — não tem um segundo seletor
  // dentro da ficha.
  const [criterio, setCriterio] = useState<CriterioCurva>('valor');
  const [params, setParams] = useSearchParams();
  const clienteSelecionado = params.get('cliente');
  const [cadastrando, setCadastrando] = useState(false);
  // A mesma régua da policy de INSERT (leva G) e de `RequireComercial`: módulo
  // concedido OU gestor para cima. Esta tela é a mesma que a Diretoria não abre,
  // mas a ficha dentro dela é compartilhada — ver `CadastroDoCliente`.
  const { showComercial, isManagerOrHigher } = useVisibleModules();
  const podeCadastrar = podeAcessarComercial(showComercial, isManagerOrHigher);

  const { data, isLoading, isError } = useClientesATrabalhar(ano, filial);
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Clientes</h1>
          <p className="text-[13px] text-muted-foreground">
            {visao === 'simplificado'
              ? 'Os que mais pesam entre quem parou de comprar — o prejuízo primeiro.'
              : 'Clientes a trabalhar: compraram nos meses anteriores e pararam no mais recente.'}
          </p>
        </div>
        {/* O seletor só aparece na LISTA. Com a ficha aberta, quem manda na visão
            é a ficha, que tem o seu próprio seletor e a sua própria chave — dois
            seletores de visão na mesma tela seria a mesma confusão que dois
            seletores de ano já causaram na aba Carteiras. */}
        {!clienteSelecionado && <SeletorVisao visao={visao} onChange={setVisao} />}
      </div>

      {/* Buscar e cadastrar ficam juntos porque são a mesma pergunta em duas
          respostas: "este cliente existe?" — se sim, abre a ficha; se não,
          cadastra. Leva G (2026-09-26). */}
      <div className="flex flex-wrap items-start gap-2">
        <BuscaCliente onEscolher={escolherCliente} />
        {podeCadastrar && (
          <Button variant="outline" size="sm" className="h-9" onClick={() => setCadastrando(true)}>
            <UserPlus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Novo cliente
          </Button>
        )}
      </div>

      {cadastrando && (
        <FormularioCliente
          onFechar={() => setCadastrando(false)}
          onCadastrado={escolherCliente}
        />
      )}

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
      ) : visao === 'simplificado' ? (
        <ResumoClientesQuePararam
          linhas={linhas} isLoading={isLoading} isError={isError} ano={ano} cortou={data?.cortou}
          onEscolher={escolherCliente} onVerTudo={() => setVisao('analitico', { lembrar: false })}
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

/**
 * A VISÃO SIMPLIFICADA (leva E, 2026-09-26): os dez que mais pesam entre quem
 * parou de comprar, e quanto a empresa deixou de vender com eles.
 *
 * O CORTE É A COISA, não a estética — foi a lição da leva D. Aqui ele é possível
 * porque a lista passou a vir ordenada pelo PREJUÍZO (migration 20261102010000):
 * em ordem alfabética, "os dez primeiros" seriam dez nomes quaisquer.
 *
 * `total` só aparece quando a lista NÃO foi cortada pelo teto. Somar uma lista
 * truncada e chamar o resultado de "total" é a família de defeito que este
 * repositório mais persegue — o número sairia menor que a verdade, sem nada
 * acusar. Cortada, a frase muda para "pelo menos".
 */
function ResumoClientesQuePararam({
  linhas, isLoading, isError, ano, cortou, onEscolher, onVerTudo,
}: {
  linhas: ClienteATrabalhar[];
  isLoading: boolean;
  isError: boolean;
  ano: number;
  cortou?: boolean;
  onEscolher: (codigo: string) => void;
  onVerTudo: () => void;
}) {
  // Falha de leitura não pode virar "ninguém parou de comprar" — a frase mais
  // tranquilizadora que esta tela pode dizer é justamente a que ela não sabe.
  if (isError) {
    return (
      <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
        <strong>Não consegui ler os clientes de {ano}.</strong> Isto não quer dizer que ninguém parou
        de comprar — recarregue a página.
      </div>
    );
  }
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (linhas.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground rounded-lg border border-dashed border-border p-4">
        Ninguém que comprava nos meses anteriores parou de comprar no mês mais recente de {ano}.
      </p>
    );
  }

  const dez = linhas.slice(0, 10);
  const total = linhas.reduce((s, c) => s + c.valor_ultimos_3m, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-[12px] text-muted-foreground">
          {linhas.length} {linhas.length === 1 ? 'cliente parou' : 'clientes pararam'} de comprar em {ano}
        </div>
        <div className="mt-1 text-xl font-semibold font-mono">{formatBRL(total)}</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {cortou
            ? 'é o que os clientes MOSTRADOS compravam nos três meses anteriores — a lista foi cortada pelo teto, então o valor de verdade é maior'
            : 'é o que eles compravam nos três meses anteriores ao último mês com venda'}
        </p>
      </div>

      <div className="rounded-lg border border-border">
        <div className="px-4 py-2 text-[13px] font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-status-warning" aria-hidden="true" />
          Os {dez.length} que mais pesam
        </div>
        <ul>
          {dez.map((c) => (
            <li key={c.cliente_codigo} className="px-4 py-2 text-[12px] border-t border-border flex items-center justify-between gap-2">
              <span className="truncate">
                <button type="button" onClick={() => onEscolher(c.cliente_codigo)} className="text-primary hover:underline text-left" title={c.nome}>
                  {limparNomeCliente(c.nome)}
                </button>
                {c.em_condicao && <span className="ml-1.5 text-[10px] text-muted-foreground">(condição)</span>}
                <span className="ml-1.5 text-[10px] text-muted-foreground">
                  última compra {formatDateBR(c.ultima_compra)}
                </span>
              </span>
              <span className="font-mono shrink-0">{formatBRL(c.valor_ultimos_3m)}</span>
            </li>
          ))}
        </ul>
        {linhas.length > dez.length && (
          <button
            type="button"
            onClick={onVerTudo}
            className="w-full px-4 py-2 text-[12px] text-primary hover:underline border-t border-border text-left"
          >
            Ver os {linhas.length} no analítico
          </button>
        )}
      </div>
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
