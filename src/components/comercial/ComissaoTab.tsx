// Configurações do Comercial › Comissão (dono, 2026-11-12): conferir e mudar as porcentagens do Atendimento do CRM (por
// segmento) e das carteiras (tudo ou nada na meta do mês), e conferir a meta de cada carteira. Cada % vale de um mês em
// diante — mudar não reescreve os meses que já passaram. Quem altera: a aba "Comissão" do perfil de acesso (o banco
// confere na policy). A conta da comissão é `com_comissao`; esta tela só mostra e grava as porcentagens.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmarExclusao } from '@/components/ui/ConfirmarExclusao';
import { useConfiguracaoDosSetores } from '@/hooks/useAccessProfiles';
import { useCarteiras, useMetasDoAno } from '@/hooks/useComercialCarteirasMetas';
import {
  useApagarPercentualDaComissao, usePercentuaisDaComissao, useSalvarPercentualDaComissao, type PercentualDaComissao,
} from '@/hooks/useComissao';
import { useTenantPath } from '@/hooks/useTenantPath';
import { competenciaAtual, competenciaPorExtenso } from '@/lib/competencia-comercial';
import { SEGMENTOS_DO_CRM, percentualVigente } from '@/lib/comissao';
import { formatBRL } from '@/types/financeiro';

const pct = (n: number) => `${n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })}%`;

export function ComissaoTab() {
  const pode = useConfiguracaoDosSetores().alteraAba('comercial', 'comissao');
  const { data: lista = [], isLoading } = usePercentuaisDaComissao();
  const { data: carteiras = [] } = useCarteiras();
  const mes = competenciaAtual();
  const { data: metas = [] } = useMetasDoAno(Number(mes.slice(0, 4)));
  const tenantPath = useTenantPath();

  const metaDoMes = (carteira: string) =>
    metas.find((m) => m.carteira?.toUpperCase() === carteira.toUpperCase() && m.mes === Number(mes.slice(5, 7)))?.valor ?? null;

  if (isLoading) return null;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Atendimento do CRM</CardTitle>
          <CardDescription>
            Sem meta: cada venda ganha no Kommo gera comissão. No Painel, o número grande é a comissão possível (todas as
            vendas) e embaixo a real (só o que já tem nota). Consumidor final e salão só viram reais quando a nota da loja
            chegar ao sistema (Bling).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {SEGMENTOS_DO_CRM.map((s) => (
            <LinhaDoPercentual key={s.origem} tipo="crm" origem={s.origem} rotulo={s.rotulo} lista={lista} mes={mes} pode={pode} />
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Carteiras</CardTitle>
          <CardDescription>
            Tudo ou nada: o % sobre toda a venda do mês, só se a carteira bater a meta do mês. Sem % configurado, a carteira
            não tem comissão. A meta é a da Diretoria —{' '}
            <Link to={tenantPath('/diretoria?visao=metas')} className="text-primary underline">editar as metas</Link>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {carteiras.map((c) => (
            <LinhaDoPercentual key={c} tipo="carteira" origem={c} rotulo={c} lista={lista} mes={mes} pode={pode}
              detalhe={(() => {
                const meta = metaDoMes(c);
                return meta ? `Meta de ${competenciaPorExtenso(mes)}: ${formatBRL(meta)}` : `Sem meta em ${competenciaPorExtenso(mes)}`;
              })()} />
          ))}
        </CardContent>
      </Card>
      {!pode && <p className="text-[13px] text-muted-foreground">Para mudar uma porcentagem, peça a liberação da aba "Comissão" no seu perfil de acesso.</p>}
    </div>
  );
}

function LinhaDoPercentual({ tipo, origem, rotulo, lista, mes, pode, detalhe }: {
  tipo: PercentualDaComissao['tipo']; origem: string; rotulo: string; lista: PercentualDaComissao[]; mes: string;
  pode: boolean; detalhe?: string;
}) {
  const salvar = useSalvarPercentualDaComissao();
  const apagar = useApagarPercentualDaComissao();
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState('');
  const [valeDe, setValeDe] = useState(mes.slice(0, 7));
  const [apagando, setApagando] = useState<PercentualDaComissao | null>(null);
  const vigente = percentualVigente(lista, tipo, origem, mes);
  const historico = lista.filter((p) => p.tipo === tipo && p.origem === origem);
  const futuras = historico.filter((p) => p.vale_de > mes);

  const gravar = () => {
    const n = Number(valor.replace(',', '.'));
    if (!Number.isFinite(n) || n < 0 || n > 100 || !valeDe) return;
    salvar.mutate({ tipo, origem, percentual: n, vale_de: `${valeDe}-01` }, { onSuccess: () => setEditando(false) });
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-semibold min-w-48">{rotulo}</span>
        <span className="font-mono text-[15px]">{vigente && vigente.percentual > 0 ? pct(vigente.percentual) : 'Sem comissão'}</span>
        {vigente && <span className="text-[12px] text-muted-foreground">desde {competenciaPorExtenso(vigente.vale_de)}</span>}
        {detalhe && <span className="text-[12px] text-muted-foreground">{detalhe}</span>}
        {pode && !editando && (
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => { setValor(String(vigente?.percentual ?? '')); setEditando(true); }}>
            Alterar
          </Button>
        )}
      </div>
      {futuras.map((f) => (
        <p key={f.id} className="text-[12px]">
          Muda para <strong>{pct(f.percentual)}</strong> a partir de {competenciaPorExtenso(f.vale_de)}
          {pode && <Button variant="ghost" size="icon" className="h-6 w-6 ml-1" aria-label="Apagar esta mudança" onClick={() => setApagando(f)}><Trash2 className="w-3.5 h-3.5" /></Button>}
        </p>
      ))}
      {editando && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px] space-y-1">
            <span className="block">Porcentagem (%)</span>
            <Input className="h-8 w-28" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} aria-label={`Porcentagem de ${rotulo}`} />
          </label>
          <label className="text-[12px] space-y-1">
            <span className="block">Vale a partir de</span>
            <Input className="h-8 w-44" type="month" value={valeDe} onChange={(e) => setValeDe(e.target.value)} />
          </label>
          <Button size="sm" onClick={gravar} disabled={salvar.isPending}>Salvar</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditando(false)}>Cancelar</Button>
          <p className="basis-full text-[12px] text-muted-foreground">Os meses antes de {valeDe ? competenciaPorExtenso(`${valeDe}-01`) : 'o mês escolhido'} continuam com a porcentagem antiga. Para tirar a comissão, salve 0.</p>
        </div>
      )}
      <ConfirmarExclusao
        aberto={!!apagando}
        onCancelar={() => setApagando(null)}
        enviando={apagar.isPending}
        titulo="Apagar esta mudança de porcentagem?"
        descricao={apagando ? `${rotulo}: ${pct(apagando.percentual)} a partir de ${competenciaPorExtenso(apagando.vale_de)}.` : ''}
        onConfirmar={() => { if (apagando) apagar.mutate(apagando.id, { onSuccess: () => setApagando(null) }); }}
      />
    </div>
  );
}
