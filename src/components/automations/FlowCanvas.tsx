import { useMemo } from 'react';
import dagre from '@dagrejs/dagre';
import {
  Background, BaseEdge, EdgeLabelRenderer, Handle, Position, ReactFlow, getSmoothStepPath,
  type Edge, type EdgeProps, type Node, type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Plus, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { STEP_LABELS, TRIGGER_NODE_ID, flowToDiagram, type DescribeContext, type DiagramNode, type FlowStep, type FlowTrigger } from '@/lib/automation-flow';

interface FlowCanvasProps {
  trigger: FlowTrigger;
  steps: FlowStep[];
  ctx: DescribeContext;
  /** Estado por passo de um run (`automation_runs.context.steps`) — pinta os nós. */
  stepStatus?: Record<string, { status?: string } | undefined>;
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  /**
   * Inserir um passo entre dois (leva K). Quando não vem, o "+" não aparece — é
   * o que separa o canvas do EDITOR do canvas da EXECUÇÃO, que é retrato de algo
   * que já aconteceu e não se edita.
   */
  onInsert?: (origem: string, destino: string) => void;
  /** Tirar um passo. Mesma regra: sem isto, não há "×". */
  onRemove?: (id: string) => void;
  className?: string;
}

const NODE_W = 240;
const NODE_H = 68;

const STATUS_CLASS: Record<string, string> = {
  success: 'border-primary',
  failed: 'border-destructive',
  failed_safely: 'border-destructive border-dashed',
  skipped: 'opacity-50 border-dashed',
  stopped: 'border-muted-foreground border-dashed',
  pending: 'border-stage-amber',
  running: 'border-stage-amber',
};
const STATUS_LABEL: Record<string, string> = {
  success: 'ok', failed: 'falhou', failed_safely: 'falhou, seguiu', skipped: 'pulado', stopped: 'parou', pending: 'esperando', running: 'rodando',
};

// O `Node<T>` do xyflow exige índice de string em `data`.
type StepNodeData = DiagramNode & {
  selected?: boolean;
  onRemove?: (id: string) => void;
  [key: string]: unknown;
};

function StepNode({ id, data }: NodeProps<Node<StepNodeData>>) {
  const isTrigger = data.kind === 'trigger';
  return (
    <div
      className={cn(
        'group relative rounded-lg border-2 bg-card px-3 py-2 shadow-sm text-left',
        isTrigger ? 'border-primary bg-primary/5' : 'border-border',
        data.status ? STATUS_CLASS[data.status] : '',
        data.selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
      )}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      {!isTrigger && <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />}

      {/* Apagar NO DESENHO (leva K). Só aparece ao passar o mouse: um "×" fixo em
          cada passo transforma o diagrama num campo minado. O gatilho não tem —
          fluxo sem gatilho não existe. */}
      {!isTrigger && data.onRemove && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); data.onRemove?.(id); }}
          title="Tirar este passo do fluxo"
          aria-label="Tirar este passo do fluxo"
          className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:text-status-danger group-hover:flex"
        >
          <X className="h-3 w-3" aria-hidden="true" />
        </button>
      )}

      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {isTrigger ? <><Zap className="h-3 w-3" /> Quando</> : STEP_LABELS[data.kind as keyof typeof STEP_LABELS]}
        {data.status && <span className="ml-auto normal-case font-normal">{STATUS_LABEL[data.status] ?? data.status}</span>}
      </div>
      <p className="mt-0.5 text-xs leading-snug line-clamp-2">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

type PassoEdgeData = {
  rotulo?: string;
  onInsert?: (origem: string, destino: string) => void;
  [key: string]: unknown;
};

/**
 * A aresta com "+" no meio (leva K, 2026-09-26) — inserir um passo ONDE a pessoa
 * está olhando, que é o que faltava para o diagrama ser editor e não só retrato.
 *
 * `EdgeLabelRenderer` existe para isto: ele tira o conteúdo de dentro do `<svg>`
 * e o põe numa camada de HTML por cima, posicionada no ponto médio. Sem ele, um
 * `<button>` dentro do SVG não recebe clique de forma confiável.
 *
 * `pointer-events-auto` na etiqueta porque a camada inteira é `none` por padrão —
 * senão ela engoliria o arrastar do canvas.
 */
function PassoEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, source, target, data, style }: EdgeProps) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition,
  });
  const d = (data ?? {}) as PassoEdgeData;

  return (
    <>
      <BaseEdge id={id} path={path} style={style} />
      <EdgeLabelRenderer>
        <div
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          className="pointer-events-auto absolute flex items-center gap-1"
        >
          {d.rotulo && (
            <span className="rounded bg-card px-1 text-[11px] text-foreground">{d.rotulo}</span>
          )}
          {d.onInsert && (
            <button
              type="button"
              onClick={() => d.onInsert?.(source, target)}
              title="Inserir um passo aqui"
              aria-label="Inserir um passo aqui"
              className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-sm hover:border-primary hover:text-primary"
            >
              <Plus className="h-3 w-3" aria-hidden="true" />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

const nodeTypes = { step: StepNode };
const edgeTypes = { passo: PassoEdge };

/**
 * O fluxo como diagrama (E5-A3): posições calculadas pelo dagre (de cima para
 * baixo), sem arrastar livre — o mesmo canvas mostra o fluxo no editor e uma
 * execução colorida por status. Referência: `generateWorkflowDiagram` do Twenty.
 *
 * LEVA K (2026-09-26): o teto que o comentário anterior nomeava — "alguém pedir
 * para desenhar à mão" — foi pedido. O diagrama virou editor: **"+" na aresta**
 * insere um passo onde a pessoa aponta, e **"×" no nó** tira o passo. As duas
 * chamadas são opcionais, e é isso que mantém o mesmo componente servindo a tela
 * de execução, onde não há o que editar.
 *
 * ARRASTAR PARA REORDENAR FICOU DE FORA, e é decisão, não esquecimento: a posição
 * no canvas é calculada pelo dagre a partir do `next`, e com **ramificação** a
 * ordem visual não é a ordem de execução — cada passo diz para onde vai. Arrastar
 * um nó teria de significar "religar as setas", que é o que o "+" e o "vai para"
 * da lista já fazem, com a diferença de que ali está escrito o que aconteceu.
 * Arrastar sem ramificação e travar com, seria a mesma tela com duas regras.
 */
export function FlowCanvas({ trigger, steps, ctx, stepStatus, selectedId, onSelect, onInsert, onRemove, className }: FlowCanvasProps) {
  const { nodes, edges } = useMemo(() => {
    const d = flowToDiagram(trigger, steps, ctx, stepStatus);
    const g = new dagre.graphlib.Graph().setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 56 });
    for (const n of d.nodes) g.setNode(n.id, { width: NODE_W, height: NODE_H });
    for (const e of d.edges) g.setEdge(e.source, e.target);
    dagre.layout(g);
    const rfNodes: Node<StepNodeData>[] = d.nodes.map((n) => {
      const pos = g.node(n.id);
      return {
        id: n.id,
        type: 'step',
        position: { x: (pos?.x ?? 0) - NODE_W / 2, y: (pos?.y ?? 0) - NODE_H / 2 },
        data: { ...n, selected: selectedId === n.id, onRemove },
        draggable: false,
        selectable: n.id !== TRIGGER_NODE_ID,
      };
    });
    // A etiqueta do ramo ("grande", "senão") deixou de ser `label` do xyflow e
    // passou a viajar em `data`: ela e o "+" moram na MESMA camada de HTML, senão
    // um cobriria o outro no meio da seta.
    const rfEdges: Edge[] = d.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, type: 'passo',
      data: { rotulo: e.label, onInsert },
      style: { stroke: 'hsl(var(--muted-foreground))' },
    }));
    return { nodes: rfNodes, edges: rfEdges };
  }, [trigger, steps, ctx, stepStatus, selectedId, onInsert, onRemove]);

  return (
    <div className={cn('h-[28rem] rounded-lg border bg-muted/20', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_e, node) => onSelect?.(node.id === TRIGGER_NODE_ID ? null : node.id)}
        onPaneClick={() => onSelect?.(null)}
      >
        <Background gap={16} color="hsl(var(--border))" />
      </ReactFlow>
    </div>
  );
}
