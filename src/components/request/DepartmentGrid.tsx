import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronRight, Monitor, Users, Banknote, ShoppingCart, Megaphone, CheckSquare, Handshake, GraduationCap, PackageCheck, Factory,
  type LucideIcon,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { ChipDoSetor } from '@/components/ui/ChipDoSetor';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { unwrap } from '@/lib/supabase-result';
import { MODULO_DO_SETOR, sugerirSetores, type CategoriaDoPedido, type SetorDoPedido } from '@/lib/sugerir-setor';
import { corDoSetor } from '@/lib/setores';

// Passo 1 do "Novo" (rodada 3, etapa B; desenho aprovado em docs/proposta-rodada-3-visual.html): uma porta só — some a
// escolha "Chamado ou Pedido". A pessoa escreve ou escolhe o setor; a busca sugere já o ASSUNTO (Lei de Postel). Os
// setores dela vêm primeiro (posição serial), cada setor com a sua cor (a cor diz de quem é, nunca como está).

interface Department {
  id: SetorDoPedido;
  name: string;
  icon: LucideIcon;
  description: string;
}

// A grade (rodada 3): Compras entra como mais um setor; o RH deixa de mandar ao Meu RH (o Meu RH vira consulta).
const departments: Department[] = [
  { id: 'ti', name: 'TI', icon: Monitor, description: 'Computador, sistema, acesso, internet' },
  { id: 'rh', name: 'RH', icon: Users, description: 'Férias, atestado, documento, benefícios' },
  { id: 'financeiro', name: 'Financeiro', icon: Banknote, description: 'Reembolso, boleto, pagamento' },
  { id: 'compras', name: 'Compras', icon: ShoppingCart, description: 'Produto ou serviço' },
  { id: 'marketing', name: 'Marketing', icon: Megaphone, description: 'Arte, evento, redes sociais' },
  { id: 'qualidade', name: 'Qualidade', icon: CheckSquare, description: 'SAC e controle de qualidade' },
  { id: 'comercial', name: 'Comercial', icon: Handshake, description: 'Pedidos de cliente e pós-venda' },
  { id: 'educacional', name: 'Educacional', icon: GraduationCap, description: 'Treinamentos e certificados' },
  { id: 'expedicao', name: 'Expedição', icon: PackageCheck, description: 'Envio, rastreio, entrega e avarias' },
  { id: 'producao', name: 'Produção', icon: Factory, description: 'Ordens de produção, matéria-prima e lotes' },
];
const NOME = Object.fromEntries(departments.map((d) => [d.id, d.name])) as Record<SetorDoPedido, string>;
const SETOR_DO_MODULO = Object.fromEntries(Object.entries(MODULO_DO_SETOR).map(([s, m]) => [m, s])) as Record<string, SetorDoPedido>;

interface DepartmentGridProps {
  /** O setor escolhido; com o assunto quando a sugestão o achou, e o texto que a pessoa já escreveu. */
  onSelectDepartment: (departmentId: SetorDoPedido, extra?: { categoriaId?: string; texto?: string }) => void;
}

export function DepartmentGrid({ onSelectDepartment }: DepartmentGridProps) {
  const { user, tenantId } = useAuth();
  const [texto, setTexto] = useState('');

  // As categorias ativas de todos os setores, para achar o assunto pelo que a pessoa escreveu.
  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias-para-sugerir', tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => ((unwrap(await supabase.from('ti_categories').select('id, name, module').eq('is_active', true))) ?? [])
      .map((c) => ({ id: c.id, nome: c.name, modulo: c.module ?? 'tickets' })) as CategoriaDoPedido[],
  });
  // Os setores dos meus últimos chamados e pedidos (os três mais recentes, sem repetir).
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
    <div className="p-4 sm:p-6 lg:p-8 w-full max-w-5xl">
      <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight text-foreground mb-4">Do que você precisa?</h1>
      <Input
        // Só com mouse: no celular o teclado subia sozinho e cobria os setores (rodada 3, correção 6).
        autoFocus={typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Escreva com as suas palavras ou escolha o setor"
        aria-label="Do que você precisa"
        className="h-12 text-[16px] rounded-xl"
      />
      {sugestoes.length > 0 && (
        <ul className="mt-3 rounded-xl border border-border bg-card overflow-hidden divide-y divide-border" aria-live="polite">
          {sugestoes.map((s, i) => (
            <li key={`${s.setor}-${s.categoria?.id ?? 'setor'}`}>
              <button type="button" onClick={() => escolher(s.setor, s.categoria?.id)}
                className={`w-full min-h-12 flex items-center gap-3 px-4 py-2.5 text-left ${i === 0 ? 'bg-primary-soft' : 'bg-card hover:bg-muted'}`}>
                <ChipDoSetor setor={MODULO_DO_SETOR[s.setor]} />
                <span className="flex-1 min-w-0 text-[14px] font-semibold text-foreground truncate">
                  {s.categoria?.nome ?? NOME[s.setor]}
                </span>
                <ChevronRight className="w-4 h-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {ultimos.length > 0 && (
        <div className="mt-6">
          <p className="text-[13px] font-semibold text-muted-foreground mb-2">Seus setores</p>
          <div className="flex flex-wrap gap-2">
            {ultimos.map((s) => (
              <button key={s} type="button" onClick={() => escolher(s)}
                className={`min-h-10 px-3.5 rounded-lg text-[14px] font-semibold ${corDoSetor(s)}`}>{NOME[s]}</button>
            ))}
          </div>
        </div>
      )}

      {/* O mural volta (dono, 2026-10-28: "antes era bonito, tinha um mural com cada setor"): cartão em pé com o ícone
          na cor do setor, dois por linha no celular — dez setores cabem em duas telas, e não em quatro de lista. */}
      <p className="text-[13px] font-semibold text-muted-foreground mt-8 mb-2">Todos os setores</p>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
        {departments.map((dept) => (
          <button key={dept.id} type="button" onClick={() => escolher(dept.id)}
            className="group p-3 sm:p-4 rounded-xl border border-border bg-card flex flex-col items-center text-center gap-2 hover:border-primary/50 hover:shadow-sm transition-[border-color,box-shadow]">
            <span aria-hidden="true" className={`w-12 h-12 sm:w-14 sm:h-14 grid place-items-center rounded-xl ${corDoSetor(dept.id)}`}>
              <dept.icon className="w-6 h-6 sm:w-7 sm:h-7" strokeWidth={1.75} />
            </span>
            <span className="text-[15px] font-semibold text-foreground">{dept.name}</span>
            <span className="text-[12px] sm:text-[13px] leading-snug text-muted-foreground line-clamp-2">{dept.description}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
