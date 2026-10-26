// O balão do gráfico (recharts) dos Indicadores: rótulo e uma linha por série. Saiu de dentro de `TIRelatorios` (R6)
// porque os Indicadores do Marketing usavam o `ChartTooltipContent` do shadcn, que exige um `<ChartContainer>` em volta
// e derrubava a tela inteira ("useChart must be used within a <ChartContainer />").
interface Props {
  active?: boolean;
  payload?: { color?: string; name?: string; value?: number | string }[];
  label?: string;
  labelFormatter?: (label: string) => string;
}

export function DicaDoGrafico({ active, payload, label, labelFormatter }: Props) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg p-3 text-sm">
      <p className="font-medium text-foreground mb-1.5">{labelFormatter && label != null ? labelFormatter(label) : label}</p>
      {payload.map((entry, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-muted-foreground">{entry.name}:</span>
          <span className="font-semibold font-mono">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}
