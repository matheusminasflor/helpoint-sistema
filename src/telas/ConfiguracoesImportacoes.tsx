// Configurações → Importações (Frente 6, .scratch/plano-frente6-
// importacoes.md). A dor que originou esta tela: "No painel diretoria não
// consigo importar os dados, somente no comercial" (o dono, 2026-09-24) —
// o importador de metas morava DENTRO da tela de Metas da Diretoria, que
// ficava vazia por falta dele. Ele não achou sozinho; foi preciso dizer
// onde estava.
//
// Os três diálogos NÃO se reescrevem (plano §2) — `ImportarVendasDialog`,
// `ImportarClientesDialog` e `ImportarMetasDialog` são montados aqui como
// já existem, só a PORTA para abri-los mudou de lugar. Cada cartão mostra
// o que já existe ANTES de abrir o diálogo (plano §1) — hoje essa
// informação só aparecia depois de abrir.
import { useState } from 'react';
import { FileSpreadsheet, Target, Upload, Users } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import { resolverAcessoImportacoes } from '@/lib/importacoes-acesso';
import { useHistoricoImportacoes, usePeriodoImportado, useResumoClientes } from '@/hooks/useComercialPainel';
import { useMetasAnosDisponiveis } from '@/hooks/useComercialCarteirasMetas';
import { ImportarVendasDialog } from '@/components/comercial/ImportarVendasDialog';
import { ImportarClientesDialog } from '@/components/comercial/ImportarClientesDialog';
import { ImportarMetasDialog } from '@/components/comercial/ImportarMetasDialog';
import { competenceLabel, formatDateBR } from '@/types/financeiro';
import type { PeriodoImportado } from '@/types/comercial';

const TIPO_LABEL: Record<'vendas' | 'clientes' | 'metas', string> = {
  vendas: 'Vendas',
  clientes: 'Clientes',
  metas: 'Metas',
};

/** Mesmo texto de `ImportarVendasDialog.tsx` (`textoPeriodoImportado`), para o cartão dizer a mesma verdade que o diálogo. */
function textoPeriodo(periodo: PeriodoImportado | undefined): string {
  if (!periodo || !periodo.competencia_de || !periodo.competencia_ate || periodo.competencias === 0) {
    return 'Nenhuma venda importada ainda.';
  }
  return `${competenceLabel(periodo.competencia_de)} a ${competenceLabel(periodo.competencia_ate)} (${periodo.competencias} ${periodo.competencias === 1 ? 'mês' : 'meses'})`;
}

export default function ConfiguracoesImportacoes() {
  const [abrirVendas, setAbrirVendas] = useState(false);
  const [abrirClientes, setAbrirClientes] = useState(false);
  const [abrirMetas, setAbrirMetas] = useState(false);

  // Regra 3 do plano: botão que a pessoa não pode usar não aparece
  // habilitado — nunca um botão que responde com erro depois do clique.
  // `vendas.importar` gatea Vendas E Clientes (mesma permissão que já
  // gateava os dois botões no Painel Comercial); `metas.definir` gatea
  // Metas. `resolverAcessoImportacoes` é a MESMA função que decide o item
  // de menu, em `AppSidebar.tsx` — uma regra só, provada em
  // `src/lib/importacoes-acesso.test.ts`.
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const acesso = resolverAcessoImportacoes({
    podeImportarVendas: canComoOBanco('vendas', 'importar'),
    podeDefinirMetas: canComoOBanco('metas', 'definir'),
  });

  // "O que já existe", por cartão (plano §1) — período de vendas é POR
  // FILIAL, nunca a soma das duas (é assim que `ImportarVendasDialog`
  // também mostra, por filial escolhida).
  const qInbras = usePeriodoImportado('INBRAS');
  const qMf = usePeriodoImportado('MF');
  const qClientes = useResumoClientes();
  const qAnos = useMetasAnosDisponiveis();
  const qHistorico = useHistoricoImportacoes();

  const periodoInbras = qInbras.data;
  const periodoMf = qMf.data;
  const resumoClientes = qClientes.data;
  const anosMetas = qAnos.data ?? [];
  const historico = qHistorico.data ?? [];

  // Consulta que FALHA não pode parecer "nada importado" — esta tela existe
  // justamente para dizer o que já existe, e um zero mentiroso aqui manda a
  // pessoa reimportar o que já está lá. É a mesma família do defeito que
  // deixou o RH quebrado por meses (falha de RLS virando lista vazia, regra
  // 1 das cinco); `unwrap` já lança nos hooks, mas quem olha a tela só vê o
  // resultado. Achado da auditoria de 2026-09-25.
  const falhou = [qInbras, qMf, qClientes, qAnos, qHistorico].some((q) => q.isError);

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <PageHeader
        icon={Upload}
        title="Importações"
        description="Vendas, clientes e metas — importe aqui e o Comercial e a Diretoria atualizam juntos."
      />

      {falhou && (
        <div className="rounded-lg border border-border badge-danger p-3 text-[13px]">
          <strong>Não consegui ler o que já foi importado.</strong> Os números abaixo podem
          estar incompletos — recarregue a página antes de importar de novo, para não
          repetir uma carga que já existe.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileSpreadsheet className="w-4 h-4 text-primary" aria-hidden="true" /> Vendas
            </CardTitle>
            <CardDescription>Relatório do Forteplus, por filial.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="text-[13px] text-muted-foreground space-y-1">
              <li><strong className="text-foreground">INBRAS:</strong> {textoPeriodo(periodoInbras)}</li>
              <li><strong className="text-foreground">MF:</strong> {textoPeriodo(periodoMf)}</li>
            </ul>
            <Button className="w-full" disabled={!acesso.vendas} onClick={() => setAbrirVendas(true)}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" /> Importar vendas
            </Button>
            {!acesso.vendas && (
              <p className="text-[11px] text-muted-foreground">Depende da permissão "vendas.importar" no seu perfil de acesso.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4 text-primary" aria-hidden="true" /> Clientes
            </CardTitle>
            <CardDescription>Cadastro × tabela de preço.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ul className="text-[13px] text-muted-foreground space-y-1">
              <li><strong className="text-foreground">{resumoClientes?.total ?? 0}</strong> clientes cadastrados</li>
              <li><strong className="text-foreground">{resumoClientes?.comTabela ?? 0}</strong> com tabela de preço</li>
            </ul>
            <Button className="w-full" disabled={!acesso.clientes} onClick={() => setAbrirClientes(true)}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" /> Importar clientes
            </Button>
            {!acesso.clientes && (
              <p className="text-[11px] text-muted-foreground">Depende da permissão "vendas.importar" no seu perfil de acesso.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="w-4 h-4 text-primary" aria-hidden="true" /> Metas
            </CardTitle>
            <CardDescription>Carga histórica do diretor (JSON).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[13px] text-muted-foreground">
              {anosMetas.length > 0 ? `Anos com dado: ${anosMetas.join(', ')}.` : 'Nenhum ano importado ainda.'}
            </p>
            <Button className="w-full" disabled={!acesso.metas} onClick={() => setAbrirMetas(true)}>
              <Upload className="w-4 h-4 mr-2" aria-hidden="true" /> Importar metas
            </Button>
            {!acesso.metas && (
              <p className="text-[11px] text-muted-foreground">Depende da permissão "metas.definir" no seu perfil de acesso.</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Abaixo, o histórico (plano §1): de `com_vendas_importacoes`, que já
          grava tudo isso e antes só aparecia num rodapé do Painel Comercial. */}
      <div className="rounded-lg border border-border overflow-x-auto">
        <div className="px-4 py-2 border-b border-border text-[13px] font-semibold">Histórico de importações</div>
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold">Quando</th>
              <th className="px-3 py-1.5 font-semibold">Tipo</th>
              <th className="px-3 py-1.5 font-semibold">Filial</th>
              <th className="px-3 py-1.5 font-semibold">Arquivo</th>
              <th className="px-3 py-1.5 font-semibold">Período</th>
              <th className="px-3 py-1.5 font-semibold">Quem importou</th>
            </tr>
          </thead>
          <tbody>
            {historico.map((h) => (
              <tr key={h.id} className="border-t border-border">
                <td className="px-3 py-1.5">{formatDateBR(h.created_at)}</td>
                <td className="px-3 py-1.5">{TIPO_LABEL[h.tipo]}</td>
                <td className="px-3 py-1.5">{h.filial ?? '—'}</td>
                <td className="px-3 py-1.5">{h.file_name}</td>
                <td className="px-3 py-1.5">
                  {h.competencia_de && h.competencia_ate
                    ? `${competenceLabel(h.competencia_de)} a ${competenceLabel(h.competencia_ate)}`
                    : '—'}
                </td>
                <td className="px-3 py-1.5">{h.importado_por ?? '—'}</td>
              </tr>
            ))}
            {historico.length === 0 && (
              <tr><td colSpan={6} className="px-3 py-4 text-center text-muted-foreground">Nenhuma importação ainda.</td></tr>
            )}
          </tbody>
        </table>
        {/* Item da lista de pendências que entra por estar no mesmo arquivo
            (plano §4, "C6"): não há conferência possível pelo CONTEÚDO — os
            dois relatórios do Forteplus trazem o mesmo CNPJ (o da INBRAS)
            mesmo para a MF. O arquivo e a filial escolhida ficam
            registrados no histórico acima; este rodapé é o registro
            honesto de que a conferência de verdade é pelo NOME do arquivo
            e pela filial confirmada na hora, nunca pelo conteúdo. */}
        <p className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground">
          A conferência de qual empresa é qual arquivo é pelo nome do arquivo e pela filial escolhida na hora —
          o conteúdo não identifica a empresa (os dois relatórios do Forteplus trazem o mesmo CNPJ).
        </p>
      </div>

      <ImportarVendasDialog open={abrirVendas} onOpenChange={setAbrirVendas} />
      <ImportarClientesDialog open={abrirClientes} onOpenChange={setAbrirClientes} />
      <ImportarMetasDialog open={abrirMetas} onOpenChange={setAbrirMetas} />
    </div>
  );
}
