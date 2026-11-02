// A linha pequena dos últimos períodos dentro de um cartão de número (Indicadores da TI, rodada 2, 2026-11-02). Sem
// eixo: mostra a forma (subiu, caiu, estável) e destaca o ponto de agora. Período sem dado fica de fora da linha.
import { cn } from '@/lib/utils';

export function Sparkline({ valores, rotulo, className }: { valores: (number | null)[]; rotulo: string; className?: string }) {
  const pontos = valores.map((v, i) => ({ v, i })).filter((p): p is { v: number; i: number } => p.v !== null);
  if (pontos.length < 2) return null;
  const min = Math.min(...pontos.map((p) => p.v));
  const max = Math.max(...pontos.map((p) => p.v));
  const L = 100, A = 28, M = 3;
  const x = (i: number) => M + (i / Math.max(1, valores.length - 1)) * (L - 2 * M);
  const y = (v: number) => (max === min ? A / 2 : A - M - ((v - min) / (max - min)) * (A - 2 * M));
  const ultimo = pontos[pontos.length - 1];
  return (
    <svg viewBox={`0 0 ${L} ${A}`} preserveAspectRatio="none" role="img" aria-label={rotulo}
      className={cn('w-full h-7 text-primary overflow-visible', className)}>
      <polyline points={pontos.map((p) => `${x(p.i)},${y(p.v)}`).join(' ')} fill="none" stroke="currentColor" strokeWidth={2}
        vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(ultimo.i)} cy={y(ultimo.v)} r={2.6} fill="currentColor" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
