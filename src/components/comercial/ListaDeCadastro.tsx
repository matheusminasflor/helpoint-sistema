import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ListaCortada } from '@/components/ui/ListaCortada';
import { IdCard, Pencil, Search, Sparkles, Users } from 'lucide-react';
import {
  useClientesCadastro, useLacunasDoCadastro, usePreencherDocumentosPeloNome,
  type ClienteCadastrado, type FiltroCadastro,
} from '@/hooks/useComercialCliente';
import { FormularioCliente } from '@/components/comercial/FormularioCliente';
import { formatarDocumento, rotuloDoDocumento } from '@/lib/documento';

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
export function ListaDeCadastro() {
  const [filtro, setFiltro] = useState<FiltroCadastro>('sem_documento');
  const [busca, setBusca] = useState('');
  const { data: lacunas } = useLacunasDoCadastro();
  const { data: lista, isLoading } = useClientesCadastro(filtro, busca);
  const preencher = usePreencherDocumentosPeloNome();
  const [editando, setEditando] = useState<ClienteCadastrado | null>(null);
  const [criando, setCriando] = useState(false);

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
          <h3 className="text-[13px] font-semibold text-foreground">Cadastro dos clientes</h3>
          <p className="text-[12px] text-muted-foreground">
            O que o Forteplus manda (código, razão social, tabela) volta a cada importação. O que está
            aqui — CNPJ, telefone, e-mail, endereço e carteira — <strong>nasce nesta tela e a importação
            nunca apaga</strong>.
          </p>
        </div>
        <Button variant="outline" size="sm" className="h-9" onClick={() => setCriando(true)}>
          <Users className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Novo cliente
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <Button
            key={f.id}
            size="sm"
            variant={filtro === f.id ? 'default' : 'outline'}
            onClick={() => setFiltro(f.id)}
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
            <p className="text-[12px] text-foreground max-w-2xl">
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
                ? 'Importe o cadastro de clientes do Forteplus ou cadastre um à mão.'
                : 'Todos os clientes já têm este dado preenchido.'
            }
          />
        </Card>
      ) : (
        <>
          {lista?.cortou && <ListaCortada />}
          <Card className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
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
                    <td className="px-3 py-2 font-mono text-xs">{c.codigo}</td>
                    <td className="px-3 py-2 max-w-[320px] truncate" title={c.razao_social}>
                      {c.razao_social}
                      {!c.ativo && <Badge variant="outline" className="ml-1.5 text-[10px]">inativo</Badge>}
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
                    <td className="px-3 py-2">{c.carteira || <Faltando />}</td>
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
  return <span className="text-[11px] text-muted-foreground italic">faltando</span>;
}
