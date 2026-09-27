import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { IdCard, Pencil, Headset, UserRound, AlertTriangle } from 'lucide-react';
import {
  useCliente, useVendedoresDoCliente, useSacsDoCliente, useAtendimentoDoCliente,
} from '@/hooks/useComercialCliente';
import { useVisibleModules } from '@/hooks/useVisibleModules';
import { podeAcessarComercial } from '@/lib/acesso-comercial';
import { FormularioCliente } from '@/components/comercial/FormularioCliente';
import { formatarDocumento, rotuloDoDocumento } from '@/lib/documento';
import { formatBRL, formatDateBR } from '@/types/financeiro';
import type { Filial } from '@/types/comercial';

/**
 * O cadastro do cliente dentro da ficha (leva G, 2026-09-26): contato, quem
 * vendeu, e os chamados do SAC dele.
 *
 * Fica FORA do simplificado × analítico de propósito: isto é identificação, não
 * relatório. Quem abre a ficha de um cliente para ligar para ele precisa do
 * telefone nas duas visões.
 */

interface Props {
  codigo: string;
  de: string;
  ate: string;
  filial: Filial | null;
}

export function CadastroDoCliente({ codigo, de, ate, filial }: Props) {
  const { data: cliente, isLoading } = useCliente(codigo);
  const [editando, setEditando] = useState(false);

  // A MESMA régua da policy de UPDATE (leva G): `has_comercial_access` — módulo
  // concedido OU gestor para cima. `podeAcessarComercial` é a cópia dessa conta
  // no front, e já é a régua de `RequireComercial`.
  //
  // NÃO É "sempre true porque a tela é do Comercial": esta ficha é o MESMO
  // componente que a Diretoria abre (`DiretoriaClientes.tsx`). Para um diretor
  // puro, `has_comercial_access` é falso — ele lê o cadastro (a policy de SELECT
  // inclui a Diretoria) e não grava. Sem este guarda, ele veria "Editar", salvaria,
  // e o PostgREST responderia 200 com zero linhas: o `expectRows` do hook lança e
  // ele leva um erro vermelho por uma tela que prometeu o que não podia cumprir.
  const { showComercial, isManagerOrHigher } = useVisibleModules();
  const podeEditar = podeAcessarComercial(showComercial, isManagerOrHigher);

  if (isLoading) return <Card className="p-4"><Skeleton className="h-24 w-full" /></Card>;
  if (!cliente) return null;

  return (
    <>
      <Card className="p-4 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <IdCard className="w-4 h-4 text-primary" aria-hidden="true" />
            <h3 className="text-sm font-semibold">Cadastro</h3>
            {cliente.origem === 'venda' && (
              <Badge variant="outline" className="text-[11px]">
                apareceu numa venda, não está no cadastro do Forteplus
              </Badge>
            )}
            {!cliente.ativo && <Badge variant="outline" className="text-[11px]">inativo</Badge>}
          </div>
          {podeEditar && (
            <Button variant="outline" size="sm" onClick={() => setEditando(true)}>
              <Pencil className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> Editar
            </Button>
          )}
        </div>

        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <Linha rotulo={rotuloDoDocumento(cliente.documento)}>
            {cliente.documento
              ? formatarDocumento(cliente.documento)
              : <span className="text-muted-foreground italic">não informado</span>}
          </Linha>
          <Linha rotulo="Tabela de preço">
            {cliente.tabela_preco ?? <span className="text-muted-foreground italic">sem tabela</span>}
          </Linha>
          <Linha rotulo="Telefone">
            {cliente.telefone ?? <span className="text-muted-foreground italic">não informado</span>}
          </Linha>
          <Linha rotulo="E-mail">
            {cliente.email ?? <span className="text-muted-foreground italic">não informado</span>}
          </Linha>
          <Linha rotulo="Carteira">
            {cliente.carteira ?? <span className="text-muted-foreground italic">não atrelado</span>}
          </Linha>
          <div className="sm:col-span-2">
            <Linha rotulo="Endereço">
              {cliente.endereco ?? <span className="text-muted-foreground italic">não informado</span>}
            </Linha>
          </div>
        </dl>
      </Card>

      <VendedoresDoCliente
        codigo={codigo} de={de} ate={ate} filial={filial}
        // O botão só existe para quem pode gravar: a ficha é a mesma que a
        // Diretoria abre, e o diretor puro lê o cadastro sem editar.
        onAtrelar={podeEditar ? () => setEditando(true) : null}
      />
      <SacsDoCliente documento={cliente.documento} />

      {editando && (
        <FormularioCliente
          cliente={cliente}
          onFechar={() => setEditando(false)}
        />
      )}
    </>
  );
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 sm:block">
      <dt className="text-muted-foreground text-[13px]">{rotulo}</dt>
      <dd className="text-right sm:text-left">{children}</dd>
    </div>
  );
}

/**
 * Quem vendeu para este cliente. O dono pediu "quem atende"; o rótulo diz
 * **vendedor da nota** porque é isso que o dado é — e a diferença não é
 * detalhe: medido em 2026-09-26, o maior "vendedor" do histórico é o código
 * 1638, "FINANCEIRO APROVADO", com R$ 5.017.738 de 168 clientes, e o 1637 é
 * "FINANCEIRO CONFERENCIA". Juntos são 56% do faturamento. Chamar isso de "quem
 * atende" seria a tela afirmando uma coisa que os números negam — o defeito que
 * a Conciliação da Diretoria já cometeu uma vez.
 */
function VendedoresDoCliente({ codigo, de, ate, filial, onAtrelar }: Props & { onAtrelar: (() => void) | null }) {
  const { data: linhas = [], isLoading } = useVendedoresDoCliente(codigo, de, ate, filial);
  const { data: atendimento } = useAtendimentoDoCliente(codigo);

  if (isLoading) return <Card className="p-4"><Skeleton className="h-16 w-full" /></Card>;

  const temNotaSemVendedor = linhas.some((v) => !v.e_vendedor);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <UserRound className="w-4 h-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Quem atende</h3>
      </div>

      {/* A resposta primeiro, nas três situações que existem. A regra (decisão do
          dono, 2026-09-26): quando a nota vem assinada por uma etapa do processo
          e não por gente, quem vale é o responsável da CARTEIRA do cliente.

          Os dois avisos usam `badge-warning` + `border-border`, e não
          `badge-warning`: é o token semântico que muda com o tema, e o lint
          (`helpoint/cor-fixa`) acusa cor de paleta fixa — o freio do modo escuro
          da L0b. O `PurchasePanel` ainda tem a cor fixa, e é dívida velha, já
          contada na linha de base. */}
      {atendimento?.situacao === 'vendedor' ? (
        <p className="text-sm">
          <strong>{atendimento.responsavel_nome}</strong>
          <span className="text-muted-foreground"> · responde pela carteira {atendimento.carteira}</span>
        </p>
      ) : atendimento?.situacao === 'sem_carteira' ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border badge-warning p-3 text-sm">
          <span className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span><strong>Cliente não atrelado a carteira de vendedor.</strong> Atrelar para saber quem responde por ele.</span>
          </span>
          {onAtrelar && (
            <Button variant="outline" size="sm" onClick={onAtrelar} className="bg-background">
              Atrelar a uma carteira
            </Button>
          )}
        </div>
      ) : atendimento?.situacao === 'carteira_sem_responsavel' ? (
        <div className="flex items-start gap-2 rounded-lg border border-border badge-warning p-3 text-sm">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Está na carteira <strong>{atendimento.carteira}</strong>, mas ninguém responde por ela. Defina em
            Diretoria › Metas e carteiras.
          </span>
        </div>
      ) : null}

      {linhas.length > 0 && (
        <>
          <p className="text-xs text-muted-foreground">
            Abaixo, quem assinou as notas no período, como veio do Forteplus — o histórico não é reescrito.
            {temNotaSemVendedor && ' Os marcados não são pessoas: são etapas do processo, e é por isso que a carteira decide.'}
          </p>
          <div className="space-y-1.5">
            {linhas.map((v) => (
              <div key={v.vendedor_codigo} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                <span className="min-w-0 truncate">
                  {v.vendedor_nome}
                  <span className="text-muted-foreground text-xs"> · {v.vendedor_codigo}</span>
                  {!v.e_vendedor && (
                    <Badge variant="outline" className="ml-1.5 text-[10px] align-middle">não é vendedor</Badge>
                  )}
                </span>
                <span className="flex items-baseline gap-3 shrink-0 text-[13px]">
                  <span className="font-mono">{formatBRL(Number(v.valor))}</span>
                  <span className="text-muted-foreground">
                    {v.notas} {v.notas === 1 ? 'nota' : 'notas'}
                    {v.ultima_venda && ` · última em ${formatDateBR(v.ultima_venda)}`}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * Os chamados de SAC deste cliente, casados pelo documento.
 *
 * As duas frases são diferentes de propósito: **sem documento** a tela diz que
 * falta o documento (e o que fazer), e **com documento e sem chamado** ela diz
 * que não há chamado. Trocar uma pela outra é o padrão que a L8 registrou —
 * lista vazia por falta de dado é indistinguível de lista vazia por não existir.
 */
function SacsDoCliente({ documento }: { documento: string | null }) {
  const { data: chamados = [], isLoading } = useSacsDoCliente(documento);

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Headset className="w-4 h-4 text-primary" aria-hidden="true" />
        <h3 className="text-sm font-semibold">Chamados no SAC</h3>
      </div>

      {!documento ? (
        <p className="text-sm text-muted-foreground">
          Preencha o CNPJ no cadastro para ver aqui os chamados que este cliente abriu no SAC. Sem ele não há
          como casar os dois lados.
        </p>
      ) : isLoading ? (
        <Skeleton className="h-12 w-full" />
      ) : chamados.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum chamado no SAC com este CNPJ.</p>
      ) : (
        <div className="space-y-1.5">
          {chamados.map((c) => (
            <div key={c.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
              <span className="min-w-0 truncate">
                {c.ticket_number != null && <span className="text-muted-foreground">#{c.ticket_number} </span>}
                {c.subject ?? 'sem assunto'}
              </span>
              <span className="flex items-baseline gap-3 shrink-0 text-[13px] text-muted-foreground">
                <Badge variant="outline" className="text-[11px]">{c.status}</Badge>
                {formatDateBR(c.created_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
