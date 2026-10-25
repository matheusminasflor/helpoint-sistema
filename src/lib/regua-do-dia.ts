// A RÉGUA DO DIA do Início (proposta "Helpoint no dia a dia", nova cara, 2026-10-24): o expediente numa linha, o
// almoço em que o prazo pausa, o "agora" e cada prazo de hoje no lugar dele. Puro, para a tela e o teste.

export interface PrazoDoDia { id: string; rotulo: string; quando: Date }
export interface Regua {
  horas: { rotulo: string; pos: number }[];
  almoco: { de: number; ate: number } | null;
  agora: number | null;
  marcas: { id: string; rotulo: string; pos: number; hora: string; atrasado: boolean }[];
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
};
const doDia = (d: Date) => d.getHours() * 60 + d.getMinutes();
const mesmoDia = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const doisDigitos = (n: number) => String(n).padStart(2, '0');

export function montarRegua({ inicio, fim, almoco, agora, prazos }: {
  inicio: string;
  fim: string;
  almoco?: { inicio: string; fim: string } | null;
  agora: Date;
  prazos: PrazoDoDia[];
}): Regua {
  const ini = minutos(inicio);
  const tot = Math.max(60, minutos(fim) - ini);
  const pos = (m: number) => Math.min(100, Math.max(0, ((m - ini) / tot) * 100));

  const horas: Regua['horas'] = [];
  for (let h = Math.ceil(ini / 60); h * 60 <= ini + tot; h += 2) horas.push({ rotulo: `${h}h`, pos: pos(h * 60) });

  const agoraMin = doDia(agora);
  return {
    horas,
    almoco: almoco ? { de: pos(minutos(almoco.inicio)), ate: pos(minutos(almoco.fim)) } : null,
    agora: agoraMin >= ini && agoraMin <= ini + tot ? pos(agoraMin) : null,
    marcas: prazos
      .filter((p) => mesmoDia(p.quando, agora))
      .sort((a, b) => a.quando.getTime() - b.quando.getTime())
      .map((p) => ({
        id: p.id,
        rotulo: p.rotulo,
        pos: pos(doDia(p.quando)),
        hora: `${doisDigitos(p.quando.getHours())}:${doisDigitos(p.quando.getMinutes())}`,
        atrasado: p.quando.getTime() < agora.getTime(),
      })),
  };
}
