import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ListaCortada } from '@/components/ui/ListaCortada';
import { FileSpreadsheet, IdCard, Pencil, Search, Sparkles, Users } from 'lucide-react';
import {
  useClientesCadastro, useLacunasDoCadastro, usePreencherDocumentosPeloNome,
  type ClienteCadastrado, type FiltroCadastro,
} from '@/hooks/useComercialCliente';
import { FormularioCliente } from '@/components/comercial/FormularioCliente';
import { formatarDocumento, rotuloDoDocumento } from '@/lib/documento';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePodeGerirCarteiras } from '@/hooks/useAccessProfiles';
import { useCarteiras } from '@/hooks/useComercialCarteirasMetas';
import { useAgruparClientes, useAtribuirCarteiraEmLote, useMinhasCarteiras } from '@/hooks/useComercialLancamentos';

/** Valor do item "devolver ao Histórico" no seletor — o Select não aceita valor vazio. */
const HISTORICO = '__historico__';

/**
 * A LISTA DE CADASTRO dos clientes (2026-09-27).
 *
 * POR QUE ELA EXISTE. O cadastro — CNPJ, telefone, e-mail, endereço, carteira — só
 * existia **dentro da ficha de um cliente**. Para completar o CNPJ de 450 clientes
 * era preciso abrir 450 fichas, uma por uma: trabalho que ninguém termina. E era
 * exatamente isso que travava o pedido do dono de o SAC reconhecer o cliente pelo
 * CNPJ e puxar os dados dele — sem CNPJ na base, a busca não acha ninguém.
 *
 * O dono também apontou que o botão "Novo cliente" ficava **junto da ficha aberta**,
 * onde não tem nexo. Aqui ele fica onde a pergunta é feita: na lista.
 *
 * O QUE ELA MOSTRA, e a escolha por trás: as **lacunas** em cima, em número, porque
 * a pergunta de quem abre esta tela é "quanto falta?" — não "quais existem". Uma
 * lista de 450 nomes sem esse número não diz se o trabalho está no começo ou no fim.
 */
export function ListaDeCadastro({ podeCriar = false }: {
  /**
   * Mostra "Novo cliente" (2026-10-01, decisão do dono): só em Configurações › Cadastro de
   * clientes, para quem tem `clientes.cadastrar`. No Comercial a lista é para consultar e
   * completar; cliente novo se pede por chamado.
   */
  podeCriar?: boolean;
} = {}) {
  const [filtro, setFiltro] = useState<FiltroCadastro>('sem_documento');
  const [busca, setBusca] = useState('');
  const { data: lacunas } = useLacunasDoCadastro();
  const { data: lista, isLoading } = useClientesCadastro(filtro, busca);
  const preencher = usePreencherDocumentosPeloNome();
  const [editando, setEditando] = useState<ClienteCadastrado | null>(null);
  const [criando, setCriando] = useState(false);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [carteiraDestino, setCarteiraDestino] = useState('');
  const atribuir = useAtribuirCarteiraEmLote();
  const agrupar = useAgruparClientes();
  const [nomeDoGrupo, setNomeDoGrupo] = useState('');
  const podeGerirCarteiras = usePodeGerirCarteiras();
  const { data: carteiras = [] } = useCarteiras();
  const { data: minhasCarteiras = [] } = useMinhasCarteiras();
  // O gestor escolhe qualquer carteira; a vendedora, só a dela — é o único destino que o banco
  // aceita dela, e oferecer os outros seria prometer o que ele vai recusar.
  const destinos = podeGerirCarteiras ? carteiras : minhasCarteiras;

  const FILTROS: { id: FiltroCadastro; rotulo: string; quantos?: number }[] = [
    { id: 'sem_documento', rotulo: 'Sem CNPJ/CPF', quantos: lacunas?.semDocumento },
    { id: 'sem_contato', rotulo: 'Sem telefone e sem e-mail', quantos: lacunas?.semContato },
    { id: 'sem_carteira', rotulo: 'Sem carteira', quantos: lacunas?.semCarteira },
    { id: 'todos', rotulo: 'Todos', quantos: lacunas?.total },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-[14px] font-semibold text-foreground">Cadastro dos clientes</h3>
          <p className="text-[13px] text-muted-foreground">
            O que o Forteplus manda (código, razão social, tabela) volta a cada importação. O que está
            aqui — CNPJ, telefone, e-mail, endereço e carteira — <strong>nasce nesta tela e a importação
            nunca apaga</strong>.
          </p>
        </div>
        {/* Uma porta para cada coisa (dono, 2026-10-01): importar é Configurações › Importações;
            criar é Configurações › Cadastro de clientes; pedir cliente novo é por chamado. */}
        {podeCriar ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="h-9" asChild>
              <Link to="/configuracoes/importacoes">
                <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Importar pelo modelo
              </Link>
            </Button>
            <Button size="sm" className="h-9" onClick={() => setCriando(true)}>
              <Users className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Novo cliente
            </Button>
          </div>
        ) : (
          <p className="text-[13px] text-muted-foreground max-w-xs">
            Cliente novo? Abra um chamado em{' '}
            <Link to="/nova-solicitacao" className="underline">Nova solicitação › Comercial › Cadastro de cliente</Link>.
          </p>
        )}
      </div>


      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filtro === f.id ? 'default' : 'outline'}
            // Trocar de filtro limpa a seleção: senão "Atribuir" moveria clientes que não
            // estão mais na tela, e a pessoa não saberia quais.
            onClick={() => { setFiltro(f.id); setSelecionados(new Set()); }}
          >
            {f.rotulo}
            {f.quantos != null && <span className="ml-1.5 opacity-70">({f.quantos})</span>}
          </Button>
        ))}
        <div className="relative ml-auto">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            className="h-9 pl-8 w-56"
            placeholder="Código ou razão social"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </div>
      </div>

      {/* O atalho que preenche o que dá para preencher sozinho. Fica junto do filtro
          "Sem CNPJ/CPF", que é onde a pessoa está quando quer isso. */}
      {filtro === 'sem_documento' && (lacunas?.semDocumento ?? 0) > 0 && (
        <Card className="p-3 border-border badge-info">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-[13px] text-foreground max-w-2xl">
              <strong>O Forteplus escreve o documento dentro do nome</strong> nos clientes pessoa
              física e MEI (por exemplo <code>EDMAR GONCALVES DA SILVA 04907925611</code> ou{' '}
              <code>49.932.013 LILIAN VIEIRA DA SILVA</code>). Posso extrair esses e preencher de uma
              vez — só o que passa no dígito verificador, para não gravar telefone no lugar de CPF.
              Quem já tem documento não é tocado.
            </p>
            <Button
              size="sm"
              onClick={() => preencher.mutate()}
              disabled={preencher.isPending}
            >
              <Sparkles className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
              {preencher.isPending ? 'Preenchendo…' : 'Preencher a partir do nome'}
            </Button>
          </div>
        </Card>
      )}

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : (lista?.linhas.length ?? 0) === 0 ? (
        <Card className="p-6">
          <EmptyState
            icon={IdCard}
            title={filtro === 'todos' ? 'Nenhum cliente cadastrado' : 'Nada faltando neste filtro'}
            description={
              filtro === 'todos'
                ? 'Importe os clientes em Configurações › Importações (passo 1).'
                : 'Todos os clientes já têm este dado preenchido.'
            }
          />
        </Card>
      ) : (
        <>
          {lista?.cortou && <ListaCortada />}
          {/* Atribuir carteira em lote (LEVA O) — o que faltava para montar carteira sem abrir
              450 fichas. O banco decide o que cada um pode: o gestor move qualquer cliente; a
              vendedora só traz do Histórico para a própria carteira. */}
          {selecionados.size > 0 && (
            <Card className="p-3 flex flex-wrap items-center gap-2 text-[14px]">
              <span><strong>{selecionados.size}</strong> selecionado(s)</span>
              <Select value={carteiraDestino} onValueChange={setCarteiraDestino}>
                <SelectTrigger className="h-8 w-56"><SelectValue placeholder="Carteira de destino…" /></SelectTrigger>
                <SelectContent>
                  {destinos.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  {podeGerirCarteiras && <SelectItem value={HISTORICO}>Histórico (sem carteira)</SelectItem>}
                </SelectContent>
              </Select>
              <Button size="sm" className="h-8" disabled={!carteiraDestino || atribuir.isPending}
                onClick={() => atribuir.mutate(
                  { codigos: [...selecionados], carteira: carteiraDestino === HISTORICO ? null : carteiraDestino },
                  { onSuccess: () => { setSelecionados(new Set()); setCarteiraDestino(''); } },
                )}>
                Atribuir
              </Button>
              {/* Juntar os CNPJs do mesmo dono num grupo (cliente de acompanhamento) — viram uma
                  linha só no acompanhamento da carteira. */}
              <Input className="h-8 w-52" placeholder="Agrupar como… (nome do dono)" value={nomeDoGrupo}
                onChange={(e) => setNomeDoGrupo(e.target.value)} />
              <Button size="sm" variant="secondary" className="h-8" disabled={!nomeDoGrupo.trim() || agrupar.isPending}
                onClick={() => agrupar.mutate(
                  { codigos: [...selecionados], grupo: nomeDoGrupo },
                  { onSuccess: () => { setSelecionados(new Set()); setNomeDoGrupo(''); } },
                )}>
                Agrupar
              </Button>
              <Button size="sm" variant="ghost" className="h-8" onClick={() => setSelecionados(new Set())}>Limpar seleção</Button>
              {!podeGerirCarteiras && (
                <span className="text-[12px] text-muted-foreground">
                  Você traz para a sua carteira os clientes que estão no Histórico. Cliente de outra carteira só o gestor move.
                </span>
              )}
            </Card>
          )}
          <Card className="overflow-x-auto">
            <table className="w-full text-[14px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="px-3 py-2 w-8">
                    <Checkbox
                      aria-label="Selecionar todos os da lista"
                      checked={(lista?.linhas.length ?? 0) > 0 && lista!.linhas.every((c) => selecionados.has(c.codigo))}
                      onCheckedChange={(v) => setSelecionados(v ? new Set(lista?.linhas.map((c) => c.codigo)) : new Set())}
                    />
                  </th>
                  <th className="px-3 py-2 font-semibold">Código</th>
                  <th className="px-3 py-2 font-semibold">Razão social</th>
                  <th className="px-3 py-2 font-semibold">CNPJ / CPF</th>
                  <th className="px-3 py-2 font-semibold">Telefone</th>
                  <th className="px-3 py-2 font-semibold">E-mail</th>
                  <th className="px-3 py-2 font-semibold">Carteira</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {lista?.linhas.map((c) => (
                  <tr key={c.id}>
                    <td className="px-3 py-2">
                      <Checkbox
                        aria-label={`Selecionar ${c.razao_social}`}
                        checked={selecionados.has(c.codigo)}
                        onCheckedChange={() => setSelecionados((s) => {
                          const n = new Set(s);
                          if (n.has(c.codigo)) n.delete(c.codigo); else n.add(c.codigo);
                          return n;
                        })}
                      />
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">{c.codigo}</td>
                    <td className="px-3 py-2 max-w-[320px] truncate" title={c.razao_social}>
                      {c.razao_social}
                      {!c.ativo && <Badge variant="outline" className="ml-1.5 text-[12px]">inativo</Badge>}
                      {c.grupo && <p className="text-[12px] text-muted-foreground truncate">grupo: {c.grupo}</p>}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {c.documento
                        ? <span title={rotuloDoDocumento(c.documento)}>{formatarDocumento(c.documento)}</span>
                        : <Faltando />}
                    </td>
                    <td className="px-3 py-2">{c.telefone || <Faltando />}</td>
                    <td className="px-3 py-2 max-w-[200px] truncate" title={c.email ?? ''}>
                      {c.email || <Faltando />}
                    </td>
                    {/* "Histórico" é o nome que o dono usa para cliente sem carteira — e diz o
                        que é, em vez de parecer dado esquecido. */}
                    <td className="px-3 py-2">{c.carteira || <span className="text-[12px] text-muted-foreground italic">Histórico</span>}</td>
                    <td className="px-3 py-2 text-right">
                      <Button variant="ghost" size="icon" title="Completar cadastro" onClick={() => setEditando(c)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </>
      )}

      {(criando || editando) && (
        <FormularioCliente
          cliente={editando ?? undefined}
          onFechar={() => { setCriando(false); setEditando(null); }}
          onCadastrado={() => { setCriando(false); setEditando(null); }}
        />
      )}
    </div>
  );
}

/** "—" cinza não diz se falta ou se não se aplica. Esta palavra diz. */
function Faltando() {
  return <span className="text-[12px] text-muted-foreground italic">faltando</span>;
}
