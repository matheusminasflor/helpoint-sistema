import { useState } from 'react';
import { Target, Plus, Pencil, Trash2, LineChart, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PageHeader } from '@/components/layout/PageHeader';
import { MetaDialog } from '@/components/metas/MetaDialog';
import { MedicaoDialog } from '@/components/metas/MedicaoDialog';
import { useAuth } from '@/contexts/AuthContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useMetas, useModoMetas, useApagarMeta, useSalvarModoMetas,
  farolDe, formatarValor, rotuloPeriodo, type Meta,
} from '@/hooks/useMetas';

/**
 * Metas (OKR-1). Objetivo em cima, o que se mede embaixo, e o quanto já andou.
 *
 * A empresa escolhe o jeito em Configurações: **OKR** mostra barra de 0 a 100%
 * e chama os filhos de "resultados-chave"; **indicadores** mostra farol e os
 * chama de "indicadores". O que está gravado é o mesmo nos dois.
 */
export default function Metas() {
  const { role, user } = useAuth();
  const { data: metas = [], isLoading } = useMetas();
  const { data: modo = 'indicadores' } = useModoMetas();
  const apagar = useApagarMeta();
  const salvarModo = useSalvarModoMetas();

  const podeEditar = role === 'owner' || role === 'admin' || role === 'manager';
  const podeTrocarModo = role === 'owner' || role === 'admin';
  const rotuloFilho = modo === 'okr' ? 'Resultado-chave' : 'Indicador';
  const rotuloFilhos = modo === 'okr' ? 'Resultados-chave' : 'Indicadores';

  const [dialogo, setDialogo] = useState<{ pai?: Meta | null; edicao?: Meta | null } | null>(null);
  const [apagando, setApagando] = useState<Meta | null>(null);

  // Guarda o id, não a linha: lançar um número recarrega a lista, e um diálogo
  // segurando a cópia de quando abriu continuaria dizendo "ainda sem número".
  const [medindoId, setMedindoId] = useState<string | null>(null);
  const medindo = medindoId
    ? metas.flatMap(o => [o, ...o.filhos]).find(m => m.id === medindoId) ?? null
    : null;

  return (
    <div className="flex flex-col h-full">
      <PageHeader
        icon={Target}
        title="Metas"
        description={modo === 'okr'
          ? 'Objetivos e resultados-chave da empresa. Todo mundo vê para onde estamos remando.'
          : 'Objetivos e indicadores da empresa, medidos período a período.'}
        actions={(
          <>
            {/* O jeito de acompanhar é escolha da empresa, e o banco só deixa
                dono ou administrador gravar. Fica aqui, e não numa tela de
                configuração distante, porque é aqui que a dúvida aparece. */}
            {podeTrocarModo && (
              <Select value={modo} onValueChange={(v) => salvarModo.mutate(v as 'okr' | 'indicadores')}>
                <SelectTrigger className="w-[190px]" aria-label="Jeito de acompanhar as metas">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="indicadores">Indicadores com farol</SelectItem>
                  <SelectItem value="okr">OKR com progresso</SelectItem>
                </SelectContent>
              </Select>
            )}
            {podeEditar && (
              <Button onClick={() => setDialogo({})}>
                <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
                Novo objetivo
              </Button>
            )}
          </>
        )}
      />

      <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-4">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
        ) : metas.length === 0 ? (
          <EmptyState
            icon={Target}
            title="Nenhum objetivo ainda"
            description={podeEditar
              ? 'Comece pelo que a empresa quer alcançar. Depois pendure embaixo dele o que dá para medir.'
              : 'Assim que a gestão cadastrar os objetivos da empresa, eles aparecem aqui.'}
            actionLabel={podeEditar ? 'Novo objetivo' : undefined}
            actionIcon={Plus}
            onAction={podeEditar ? () => setDialogo({}) : undefined}
          />
        ) : (
          metas.map(objetivo => (
            <ObjetivoCard
              key={objetivo.id}
              objetivo={objetivo}
              modo={modo}
              rotuloFilho={rotuloFilho}
              rotuloFilhos={rotuloFilhos}
              podeEditar={podeEditar}
              userId={user?.id}
              onNovoFilho={() => setDialogo({ pai: objetivo })}
              onEditar={(m) => setDialogo({ edicao: m })}
              onMedir={(m) => setMedindoId(m.id)}
              onApagar={setApagando}
            />
          ))
        )}
      </div>

      <MetaDialog
        open={dialogo !== null}
        onOpenChange={(v) => !v && setDialogo(null)}
        modo={modo}
        objetivoPai={dialogo?.pai}
        edicao={dialogo?.edicao}
      />
      <MedicaoDialog
        open={medindo !== null}
        onOpenChange={(v) => !v && setMedindoId(null)}
        meta={medindo}
      />

      <AlertDialog open={apagando !== null} onOpenChange={(v) => !v && setApagando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover “{apagando?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              {apagando && !apagando.parent_goal_id
                ? `Some junto tudo que está pendurado neste objetivo — ${apagando.filhos.length} ${apagando.filhos.length === 1 ? 'item' : 'itens'} e todo o histórico de números. Não dá para desfazer.`
                : 'Some junto todo o histórico de números lançados. Não dá para desfazer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (apagando) apagar.mutate(apagando.id);
                setApagando(null);
              }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function ObjetivoCard({
  objetivo, modo, rotuloFilho, rotuloFilhos, podeEditar, userId,
  onNovoFilho, onEditar, onMedir, onApagar,
}: {
  objetivo: Meta;
  modo: 'okr' | 'indicadores';
  rotuloFilho: string;
  rotuloFilhos: string;
  podeEditar: boolean;
  userId: string | undefined;
  onNovoFilho: () => void;
  onEditar: (m: Meta) => void;
  onMedir: (m: Meta) => void;
  onApagar: (m: Meta) => void;
}) {
  // O objetivo não tem número próprio: o quanto ele andou é a média do que está
  // embaixo dele. Objetivo sem nada embaixo ainda não é mensurável, e mostrar 0%
  // seria dizer que fracassou.
  const medidos = objetivo.filhos.filter(f => f.progress !== null);
  const media = medidos.length
    ? medidos.reduce((s, f) => s + Math.min(Number(f.progress), 1), 0) / medidos.length
    : null;

  return (
    <section className="rounded-lg border border-border bg-card">
      <header className="flex items-start justify-between gap-3 p-4 border-b border-border">
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-foreground">{objetivo.title}</h2>
          {objetivo.description && (
            <p className="text-[13px] text-muted-foreground mt-0.5">{objetivo.description}</p>
          )}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <Badge variant="secondary" className="text-[11px]">
              {rotuloPeriodo(objetivo.start_date, objetivo.frequency)} a{' '}
              {rotuloPeriodo(objetivo.end_date, objetivo.frequency)}
            </Badge>
            {objetivo.responsavel && (
              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <User className="w-3 h-3" aria-hidden="true" />
                {objetivo.responsavel}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="text-right">
            <p className="text-lg font-semibold text-foreground tabular-nums">
              {media === null ? '—' : `${Math.round(media * 100)}%`}
            </p>
            <p className="text-[11px] text-muted-foreground">do objetivo</p>
          </div>
          {podeEditar && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                aria-label={`Editar o objetivo ${objetivo.title}`}
                onClick={() => onEditar(objetivo)}>
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                aria-label={`Remover o objetivo ${objetivo.title}`}
                onClick={() => onApagar(objetivo)}>
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </header>

      <div className="p-4 space-y-3">
        {objetivo.filhos.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            Nada medido ainda neste objetivo.{' '}
            {podeEditar && `Pendure um ${rotuloFilho.toLowerCase()} para ele sair do papel.`}
          </p>
        ) : (
          <>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {rotuloFilhos}
            </p>
            <ul className="space-y-3">
              {objetivo.filhos.map(filho => (
                <FilhoLinha
                  key={filho.id}
                  filho={filho}
                  modo={modo}
                  podeEditar={podeEditar}
                  userId={userId}
                  onEditar={onEditar}
                  onMedir={onMedir}
                  onApagar={onApagar}
                />
              ))}
            </ul>
          </>
        )}

        {podeEditar && (
          <Button variant="outline" size="sm" onClick={onNovoFilho}>
            <Plus className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
            Novo {rotuloFilho.toLowerCase()}
          </Button>
        )}
      </div>
    </section>
  );
}

function FilhoLinha({ filho, modo, podeEditar, userId, onEditar, onMedir, onApagar }: {
  filho: Meta;
  modo: 'okr' | 'indicadores';
  podeEditar: boolean;
  userId: string | undefined;
  onEditar: (m: Meta) => void;
  onMedir: (m: Meta) => void;
  onApagar: (m: Meta) => void;
}) {
  const podeLancar = podeEditar || filho.assigned_to === userId;
  const progresso = filho.progress === null ? null : Number(filho.progress);
  const farol = farolDe(progresso);
  const pct = progresso === null ? 0 : Math.max(0, Math.min(progresso, 1)) * 100;

  return (
    <li className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            {modo === 'indicadores' && <FarolPonto farol={farol} />}
            <p className="text-sm font-medium text-foreground">{filho.title}</p>
          </div>
          {filho.description && (
            <p className="text-[12px] text-muted-foreground mt-0.5">{filho.description}</p>
          )}
          <p className="text-[12px] text-muted-foreground mt-1">
            {filho.current_value === null
              ? 'Nenhum número lançado ainda'
              : formatarValor(Number(filho.current_value), filho.unit)}
            {' · meta '}
            {filho.direction === 'down' ? 'cair até ' : ''}
            {formatarValor(Number(filho.target_value), filho.unit)}
            {filho.responsavel && ` · ${filho.responsavel}`}
          </p>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          <span className="text-sm font-semibold text-foreground tabular-nums mr-1">
            {progresso === null ? '—' : `${Math.round(progresso * 100)}%`}
          </span>
          {/* O banco só deixa gestor ou o responsável daquele indicador lançar.
              Sem este gate a tela convidava qualquer um a digitar um número que
              só seria recusado no salvar. */}
          {podeLancar && (
            <Button variant="ghost" size="icon" className="h-8 w-8"
              aria-label={`Lançar número de ${filho.title}`}
              onClick={() => onMedir(filho)}>
              <LineChart className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          )}
          {podeEditar && (
            <>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                aria-label={`Editar ${filho.title}`}
                onClick={() => onEditar(filho)}>
                <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                aria-label={`Remover ${filho.title}`}
                onClick={() => onApagar(filho)}>
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              </Button>
            </>
          )}
        </div>
      </div>

      <Progress value={pct} className="mt-2 h-1.5" />
    </li>
  );
}

/**
 * O farol. As cores vêm dos tokens de prioridade que o sistema já define em
 * `index.css` — paleta fixa não muda com o tema (L0b).
 */
function FarolPonto({ farol }: { farol: 'verde' | 'amarelo' | 'vermelho' | null }) {
  if (farol === null) {
    return (
      <span className="w-2 h-2 rounded-full bg-muted-foreground/40 flex-shrink-0"
        title="Sem número lançado ainda" aria-label="Sem número lançado ainda" />
    );
  }
  const cor = farol === 'verde'
    ? 'bg-priority-low'
    : farol === 'amarelo'
      ? 'bg-priority-medium'
      : 'bg-priority-critical';
  const texto = farol === 'verde' ? 'Meta batida'
    : farol === 'amarelo' ? 'Perto da meta' : 'Longe da meta';
  return (
    <span className={`w-2 h-2 rounded-full flex-shrink-0 ${cor}`} title={texto} aria-label={texto} />
  );
}
