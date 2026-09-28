// Comercial › Configurações › Indicadores — o que a vendedora marca Sim/Não.
//
// Decisão do dono (2026-09-28): a lista nasce igual à planilha — 14 indicadores e 12 ações — e
// o gestor edita pela tela: liga, desliga, renomeia, reordena, cria. Mesma regra que ele já
// tinha mandado para carteira e para funil.
//
// NÃO SE APAGA INDICADOR USADO — se desliga. Apagar sumiria com o histórico dos meses em que
// ele contou (o banco recusa: `on delete restrict`). Desligado, some do formulário e do painel
// daqui para a frente, e os lançamentos antigos continuam mostrando a marca.
import { useState } from 'react';
import { Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDepartmentPermissions } from '@/hooks/useAccessProfiles';
import {
  useIndicadoresCatalogo, useSalvarIndicador,
  type IndicadorCatalogo, type TipoIndicador,
} from '@/hooks/useComercialLancamentos';

export function IndicadoresCatalogoTab() {
  const { canComoOBanco } = useDepartmentPermissions('comercial');
  const podeEditar = canComoOBanco('metas', 'definir');
  const { data: catalogo = [], isLoading } = useIndicadoresCatalogo();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Indicadores e ações</CardTitle>
        <CardDescription>
          O que a vendedora marca em cada lançamento. <strong>Indicador</strong> exige cliente e vira uma linha do Painel
          do Gestor com meta e farol. <strong>Ação</strong> conta no FAROL, com ou sem cliente. "Na semana" conta de
          segunda a domingo; "no mês", a competência inteira.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (
          (['indicador', 'acao'] as TipoIndicador[]).map((tipo) => (
            <Grupo key={tipo} tipo={tipo} itens={catalogo.filter((c) => c.tipo === tipo)} podeEditar={podeEditar} />
          ))
        )}
        {!podeEditar && (
          <p className="text-xs text-muted-foreground">Mudar a lista exige a permissão "Metas" no perfil de acesso do Comercial.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Grupo({ tipo, itens, podeEditar }: { tipo: TipoIndicador; itens: IndicadorCatalogo[]; podeEditar: boolean }) {
  const salvar = useSalvarIndicador();
  const [novo, setNovo] = useState('');
  const proximaOrdem = itens.reduce((m, i) => Math.max(m, i.ordem), 0) + 1;

  return (
    <section className="space-y-2">
      <h3 className="text-[13px] font-semibold">{tipo === 'indicador' ? 'Indicadores comerciais' : 'Ações do FAROL'}</h3>
      <div className="rounded-lg border overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="bg-secondary/60 text-left text-muted-foreground">
              <th className="px-3 py-1.5 font-semibold w-16">Ordem</th>
              <th className="px-3 py-1.5 font-semibold">O que a vendedora marca</th>
              {tipo === 'indicador' && <th className="px-3 py-1.5 font-semibold">Como aparece no painel</th>}
              {tipo === 'indicador' && <th className="px-3 py-1.5 font-semibold w-32">Conta</th>}
              <th className="px-3 py-1.5 font-semibold w-20 text-center">Ativo</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => <LinhaIndicador key={i.id} item={i} podeEditar={podeEditar} />)}
          </tbody>
        </table>
      </div>
      {podeEditar && (
        <div className="flex gap-2">
          <Input className="h-8 max-w-sm" placeholder={tipo === 'indicador' ? 'Novo indicador' : 'Nova ação'}
            value={novo} onChange={(e) => setNovo(e.target.value)} />
          <Button size="sm" className="h-8" disabled={!novo.trim() || salvar.isPending}
            onClick={() => salvar.mutate({ tipo, nome: novo, ordem: proximaOrdem }, { onSuccess: () => setNovo('') })}>
            <Plus className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> Acrescentar
          </Button>
        </div>
      )}
    </section>
  );
}

/** Cada campo grava ao sair dele — como a planilha, sem botão de salvar por linha. */
function LinhaIndicador({ item, podeEditar }: { item: IndicadorCatalogo; podeEditar: boolean }) {
  const salvar = useSalvarIndicador();
  const [nome, setNome] = useState(item.nome);
  const [rotulo, setRotulo] = useState(item.rotulo_painel ?? '');
  const [ordem, setOrdem] = useState(String(item.ordem));

  const gravar = (mudanca: Partial<IndicadorCatalogo>) => salvar.mutate({ ...item, ...mudanca });

  if (!podeEditar) {
    return (
      <tr className={`border-t ${item.ativo ? '' : 'opacity-50'}`}>
        <td className="px-3 py-1.5 font-mono">{item.ordem}</td>
        <td className="px-3 py-1.5">{item.nome}</td>
        {item.tipo === 'indicador' && <td className="px-3 py-1.5">{item.rotulo_painel ?? item.nome}</td>}
        {item.tipo === 'indicador' && <td className="px-3 py-1.5">{item.periodo === 'semana' ? 'Na semana' : 'No mês'}</td>}
        <td className="px-3 py-1.5 text-center">{item.ativo ? 'Sim' : 'Não'}</td>
      </tr>
    );
  }

  return (
    <tr className={`border-t ${item.ativo ? '' : 'opacity-60'}`}>
      <td className="px-3 py-1">
        <Input className="h-7 w-14 font-mono text-[12px]" inputMode="numeric" value={ordem} aria-label={`Ordem de ${item.nome}`}
          onChange={(e) => setOrdem(e.target.value)}
          onBlur={() => { const n = Number(ordem); if (Number.isInteger(n) && n !== item.ordem) gravar({ ordem: n }); else setOrdem(String(item.ordem)); }} />
      </td>
      <td className="px-3 py-1">
        <Input className="h-7 text-[12px]" value={nome} aria-label="O que a vendedora marca"
          onChange={(e) => setNome(e.target.value)}
          onBlur={() => { if (nome.trim() && nome.trim() !== item.nome) gravar({ nome: nome.trim() }); else setNome(item.nome); }} />
      </td>
      {item.tipo === 'indicador' && (
        <td className="px-3 py-1">
          <Input className="h-7 text-[12px]" value={rotulo} placeholder={item.nome} aria-label="Como aparece no painel"
            onChange={(e) => setRotulo(e.target.value)}
            onBlur={() => { if (rotulo.trim() !== (item.rotulo_painel ?? '')) gravar({ rotulo_painel: rotulo.trim() || null }); }} />
        </td>
      )}
      {item.tipo === 'indicador' && (
        <td className="px-3 py-1">
          <Select value={item.periodo} onValueChange={(v) => gravar({ periodo: v as 'mes' | 'semana' })}>
            <SelectTrigger className="h-7 text-[12px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mes">No mês</SelectItem>
              <SelectItem value="semana">Na semana</SelectItem>
            </SelectContent>
          </Select>
        </td>
      )}
      <td className="px-3 py-1 text-center">
        <Switch checked={item.ativo} aria-label={`${item.nome} ativo`} onCheckedChange={(v) => gravar({ ativo: v })} />
      </td>
    </tr>
  );
}
