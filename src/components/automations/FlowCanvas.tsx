import { useMemo } from 'react';
import dagre from '@dagrejs/dagre';
import { Background, Handle, Position, ReactFlow, type Edge, type Node, type NodeProps } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Zap } from 'lucide-react';
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
type StepNodeData = DiagramNode & { selected?: boolean; [key: string]: unknown };

function StepNode({ data }: NodeProps<Node<StepNodeData>>) {
  const isTrigger = data.kind === 'trigger';
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-card px-3 py-2 shadow-sm text-left',
        isTrigger ? 'border-primary bg-primary/5' : 'border-border',
        data.status ? STATUS_CLASS[data.status] : '',
        data.selected && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
      )}
      style={{ width: NODE_W, minHeight: NODE_H }}
    >
      {!isTrigger && <Handle type="target" position={Position.Top} className="!bg-muted-foreground" />}
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {isTrigger ? <><Zap className="h-3 w-3" /> Quando</> : STEP_LABELS[data.kind as keyof typeof STEP_LABELS]}
        {data.status && <span className="ml-auto normal-case font-normal">{STATUS_LABEL[data.status] ?? data.status}</span>}
      </div>
      <p className="mt-0.5 text-xs leading-snug line-clamp-2">{data.label}</p>
      <Handle type="source" position={Position.Bottom} className="!bg-muted-foreground" />
    </div>
  );
}

const nodeTypes = { step: StepNode };

/**
 * O fluxo como diagrama (E5-A3): posições calculadas pelo dagre (de cima para
 * baixo), sem arrastar livre — o mesmo canvas mostra o fluxo no editor e uma
 * execução colorida por status. Referência: `generateWorkflowDiagram` do Twenty.
 * ponytail: nada de arrastar nem de "+" na aresta nesta versão; edita-se na
 * lista e vê-se aqui. O teto é "alguém pedir para desenhar à mão".
 */
export function FlowCanvas({ trigger, steps, ctx, stepStatus, selectedId, onSelect, className }: FlowCanvasProps) {
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
        data: { ...n, selected: selectedId === n.id },
        draggable: false,
        selectable: n.id !== TRIGGER_NODE_ID,
      };
    });
    const rfEdges: Edge[] = d.edges.map((e) => ({
      id: e.id, source: e.source, target: e.target, label: e.label, type: 'smoothstep',
      style: { stroke: 'hsl(var(--muted-foreground))' },
      labelStyle: { fill: 'hsl(var(--foreground))', fontSize: 11 },
      labelBgStyle: { fill: 'hsl(var(--card))' },
    }));
    return { nodes: rfNodes, edges: rfEdges };
  }, [trigger, steps, ctx, stepStatus, selectedId]);

  return (
    <div className={cn('h-[28rem] rounded-lg border bg-muted/20', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
