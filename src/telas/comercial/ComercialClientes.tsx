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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { FiltrosComerciais } from '@/components/comercial/FiltrosComerciais';
import { FichaClienteSecao } from '@/components/comercial/FichaCliente';
import { SeletorVisao } from '@/components/comercial/SeletorVisao';
import { TutorialDoRelatorio } from '@/components/ajuda/TutorialDoRelatorio';
import { useVisaoRelatorio } from '@/hooks/useVisaoRelatorio';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { podeAcessarComercial } from '@/lib/acesso-comercial';
import { useAnoComVenda, useBuscarClientes, useClientesATrabalhar, usePeriodoComercial } from '@/hooks/useComercialPainel';
import { avisoDeMesesInteiros, rotuloDoIntervalo } from '@/lib/period';
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

  // O período (pedido do dono, 2026-10-03): o seletor do §14 com "Este mês", "Este
  // trimestre", "Este ano" e "Personalizado". "Ano todo" é o padrão e é a tela de antes —
  // nem manda intervalo ao banco. Nos outros, a LISTA usa os meses inteiros que o período
  // toca (a conta é mensal) e a ficha usa os dias exatos.
  const { periodo, setPeriodo, mes, setMes, de, ate, setIntervalo } = usePeriodoComercial(ano);
  const intervalo = periodo === 'ano' ? null : { de, ate };
  // "em 2026" ou "no período de 10/03/2026 a 25/04/2026" — o recorte por extenso nas frases.
  const recorte = intervalo ? `no período de ${rotuloDoIntervalo(intervalo)}` : `em ${ano}`;
  const aviso = avisoDeMesesInteiros('A lista compara meses inteiros', intervalo);

  const { data, isLoading, isError } = useClientesATrabalhar(ano, filial, intervalo);
  const linhas = data?.linhas ?? [];

  // Os seletores são montados UMA vez e renderizados em um dos dois lugares
  // (acima da lista, ou dentro da ficha) — nunca duplicados, nunca com dois
  // estados. Duas cópias do mesmo filtro é exatamente como a ficha e a lista
  // passariam a discordar sobre qual período está na tela.
  const filtros = (
    <>
      <FiltrosComerciais
        ano={ano} anos={anos} onAnoChange={setAno} filial={filial} onFilialChange={setFilial}
        periodo={periodo} onPeriodoChange={setPeriodo} mes={mes} onMesChange={setMes}
        intervalo={{ de, ate }} onIntervaloChange={setIntervalo}
      />
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
        <div className="flex items-center gap-2">
          <TutorialDoRelatorio id="comercial-clientes" />
          {!clienteSelecionado && <SeletorVisao visao={visao} onChange={setVisao} />}
        </div>
      </div>

      {/* A ABA "CADASTRO" SAIU DAQUI em 2026-09-28, a pedido do dono: *"Cadastro de
          Cliente não deve ficar no Insights."* Ele está certo — Insights é o que o
          Comercial MEDE, e completar CNPJ de 450 clientes é trabalho de cadastro.
          Virou tela própria em `/comercial/clientes`, com item no menu. Esta tela
          voltou a ter um assunto só: quem parou de comprar. */}

      {/* A BUSCA fica; o "Novo cliente" SAIU daqui em 2026-09-27, a pedido do dono:
          ele continuava aparecendo com a ficha aberta, onde não tem nexo — dentro do
          cadastro de um cliente, um botão para criar outro. Cadastrar mudou de lugar
          para `/comercial/clientes`, que é onde essa pergunta é feita, e onde dá
          para completar muitos clientes sem abrir um por um. */}
      {!clienteSelecionado && (
        <div className="flex flex-wrap items-start gap-2">
          <BuscaCliente onEscolher={escolherCliente} />
        </div>
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
      {!clienteSelecionado && aviso && <p className="text-[12px] text-muted-foreground">{aviso}</p>}

      {clienteSelecionado ? (
        <FichaClienteSecao
          codigo={clienteSelecionado}
          // "Ano todo" dá 1º/jan a 31/dez do ano — a ficha de antes. Nos outros, os dias exatos.
          de={de}
          ate={ate}
          filial={filial}
          criterio={criterio}
          onFechar={limparCliente}
          filtros={filtros}
        />
      ) : visao === 'simplificado' ? (
        <ResumoClientesQuePararam
          linhas={linhas} isLoading={isLoading} isError={isError} recorte={recorte} cortou={data?.cortou}
          onEscolher={escolherCliente} onVerTudo={() => setVisao('analitico', { lembrar: false })}
        />
      ) : (
        <ListaClientesATrabalhar linhas={linhas} isLoading={isLoading} recorte={recorte} cortou={data?.cortou} onEscolher={escolherCliente} />
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
  linhas, isLoading, isError, recorte, cortou, onEscolher, onVerTudo,
}: {
  linhas: ClienteATrabalhar[];
  isLoading: boolean;
  isError: boolean;
  /** "em 2026" ou "no período de 10/03/2026 a 25/04/2026". */
  recorte: string;
  cortou?: boolean;
  onEscolher: (codigo: string) => void;
  onVerTudo: () => void;
}) {
  // Falha de leitura não pode virar "ninguém parou de comprar" — a frase mais
  // tranquilizadora que esta tela pode dizer é justamente a que ela não sabe.
  if (isError) {
    return (
      <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
        <strong>Não consegui ler os clientes {recorte}.</strong> Isto não quer dizer que ninguém parou
        de comprar — recarregue a página.
      </div>
    );
  }
  if (isLoading) return <Skeleton className="h-64 w-full" />;

  if (linhas.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground rounded-lg border border-dashed border-border p-4">
        Ninguém que comprava nos meses anteriores parou de comprar no mês mais recente com venda {recorte}.
      </p>
    );
  }

  const dez = linhas.slice(0, 10);
  const total = linhas.reduce((s, c) => s + c.valor_ultimos_3m, 0);

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-[12px] text-muted-foreground">
          {linhas.length} {linhas.length === 1 ? 'cliente parou' : 'clientes pararam'} de comprar {recorte}
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
  linhas, isLoading, recorte, cortou, onEscolher,
}: {
  linhas: ClienteATrabalhar[];
  isLoading: boolean;
  /** "em 2026" ou "no período de 10/03/2026 a 25/04/2026". */
  recorte: string;
  cortou?: boolean;
  /** Item 2 do plano da Frente 3: nome do cliente é a porta única para a ficha, mesmo já estando nesta tela. */
  onEscolher: (codigo: string) => void;
}) {
  return (
    <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold flex items-center gap-2">
          <Users className="w-4 h-4" aria-hidden="true" />
          Clientes a trabalhar {recorte}
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
              <tr><td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">Nenhum cliente parou de comprar {recorte}.</td></tr>
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
