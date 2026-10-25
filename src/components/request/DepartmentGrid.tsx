import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Monitor, Megaphone, CheckSquare, Users, Banknote, Handshake, GraduationCap, ShoppingCart, PackageCheck, Factory,
  ArrowRight, History,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { MODULO_DO_SETOR, sugerirSetores, type CategoriaDoPedido, type SetorDoPedido } from '@/lib/sugerir-setor';

interface Department {
  id: SetorDoPedido;
  name: string;
  icon: React.ReactNode;
  description: string;
}

const icone = (I: typeof Monitor) => <I strokeWidth={1.5} className="w-6 h-6" aria-hidden="true" />;

// A grade sem a numeração "01…10", o ponto verde e a legenda "Ativo/Em breve" (todos estão ativos): etapa 4 · Chamados,
// 2026-10-24. O RH continua aqui até o Meu RH ser ligado (decisão da 4b, 2026-10-25: liga depois do cadastro do RH).
const departments: Department[] = [
  { id: 'ti', name: 'TI', icon: icone(Monitor), description: 'Computador, sistema, acesso, internet' },
  { id: 'marketing', name: 'Marketing', icon: icone(Megaphone), description: 'Arte, eventos e redes sociais' },
  { id: 'qualidade', name: 'Qualidade', icon: icone(CheckSquare), description: 'SAC e controle de qualidade' },
  { id: 'rh', name: 'RH', icon: icone(Users), description: 'Pessoas, férias, benefícios e folha' },
  { id: 'financeiro', name: 'Financeiro', icon: icone(Banknote), description: 'Reembolsos e pagamentos' },
  // Compras é setor próprio desde a leva N; o pedido de compra nasce aqui, onde todo mundo pede (dono, 2026-09-28).
  { id: 'compras', name: 'Compras', icon: icone(ShoppingCart), description: 'Pedir a compra de um produto ou serviço' },
  { id: 'comercial', name: 'Comercial', icon: icone(Handshake), description: 'Orçamentos, pedidos e pós-venda' },
  { id: 'educacional', name: 'Educacional', icon: icone(GraduationCap), description: 'Treinamentos e certificados' },
  { id: 'expedicao', name: 'Expedição', icon: icone(PackageCheck), description: 'Envio, rastreio, entrega e avarias' },
  { id: 'producao', name: 'Produção', icon: icone(Factory), description: 'Ordens de produção, matéria-prima e lotes' },
];
const NOME = Object.fromEntries(departments.map((d) => [d.id, d.name])) as Record<SetorDoPedido, string>;
const SETOR_DO_MODULO = Object.fromEntries(Object.entries(MODULO_DO_SETOR).map(([s, m]) => [m, s])) as Record<string, SetorDoPedido>;

interface DepartmentGridProps {
  /** O setor escolhido; com a categoria quando a sugestão a achou, e o texto que a pessoa já escreveu. */
  onSelectDepartment: (departmentId: SetorDoPedido, extra?: { categoriaId?: string; texto?: string }) => void;
}

export function DepartmentGrid({ onSelectDepartment }: DepartmentGridProps) {
  const { user, tenantId } = useAuth();
  const [texto, setTexto] = useState('');

  // As categorias ativas de todos os setores, para achar a do pedido pelo nome.
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-para-sugerir', tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => ((unwrap(await supabase.from('ti_categories').select('id, name, module').eq('is_active', true))) ?? [])
      .map((c) => ({ id: c.id, nome: c.name, modulo: c.module ?? 'tickets' })) as CategoriaDoPedido[],
  });
  // Os setores dos meus últimos pedidos (os três mais recentes, sem repetir).
  const { data: ultimos = [] } = useQuery({
    queryKey: ['meus-ultimos-setores', tenantId, user?.id],
    enabled: !!tenantId && !!user?.id,
    queryFn: async () => {
      const linhas = unwrap(await supabase.from('tickets').select('module').eq('requester_id', user!.id)
        .order('created_at', { ascending: false }).limit(30)) ?? [];
      return [...new Set(linhas.map((l) => SETOR_DO_MODULO[l.module ?? 'tickets']).filter(Boolean))].slice(0, 3) as SetorDoPedido[];
    },
  });

  const sugestoes = useMemo(() => sugerirSetores(texto, categorias), [texto, categorias]);
  const escolher = (id: SetorDoPedido, categoriaId?: string) =>
    onSelectDepartment(id, { categoriaId, texto: texto.trim() || undefined });

  return (
    <div className="p-6 lg:p-8 max-w-5xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground mb-1">O que você precisa?</h1>
      <p className="text-sm text-muted-foreground mb-4">Escreva com as suas palavras; a gente sugere o setor. Ou escolha abaixo.</p>
      <Input
        autoFocus
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Ex.: a impressora do Comercial não imprime"
        aria-label="O que você precisa"
        className="h-11 text-[16px]"
      />
      {sugestoes.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2" aria-live="polite">
          {sugestoes.map((s) => (
            <button key={s.setor} type="button" onClick={() => escolher(s.setor, s.categoria?.id)}
              className="inline-flex items-center gap-2 min-h-11 px-3 rounded-md border border-foreground bg-card text-[14px] font-medium hover:bg-secondary">
              {NOME[s.setor]}{s.categoria && <span className="text-muted-foreground font-normal">› {s.categoria.nome}</span>}
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </button>
          ))}
        </div>
      )}

      {ultimos.length > 0 && (
        <div className="mt-6">
          <p className="text-[13px] text-muted-foreground flex items-center gap-1.5 mb-2">
            <History className="w-3.5 h-3.5" aria-hidden="true" /> Seus últimos setores
          </p>
          <div className="flex flex-wrap gap-2">
            {ultimos.map((s) => (
              <button key={s} type="button" onClick={() => escolher(s)}
                className="min-h-11 px-3 rounded-md border border-border bg-card text-[14px] hover:bg-secondary">{NOME[s]}</button>
            ))}
          </div>
        </div>
      )}

      <p className="text-[13px] text-muted-foreground mt-8 mb-2">Todos os setores</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {departments.map((dept) => (
          <button
            key={dept.id}
            type="button"
            onClick={() => escolher(dept.id)}
            className="group p-4 rounded-lg border border-border bg-card text-left flex items-center gap-3 hover:border-foreground transition-colors"
          >
            <span className="w-10 h-10 shrink-0 flex items-center justify-center rounded-md bg-secondary text-foreground">{dept.icon}</span>
            <span className="min-w-0">
              <span className="text-sm font-semibold block text-foreground">{dept.name}</span>
              <span className="text-xs text-muted-foreground block">{dept.description}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
