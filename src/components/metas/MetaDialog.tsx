import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSalvarMeta, type Meta, type MetaInput, type ModoMetas } from '@/hooks/useMetas';
import { useProfiles } from '@/hooks/useInventory';
import { todayISO } from '@/lib/dates';

/**
 * Cria e edita os dois tipos de linha: o objetivo (sem pai) e o que se mede
 * embaixo dele (com pai). O formulário muda conforme o caso — objetivo não tem
 * meta numérica nem sentido, porque quem carrega número é o que está embaixo.
 */
export function MetaDialog({ open, onOpenChange, modo, objetivoPai, edicao }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  modo: ModoMetas;
  /** Preenchido = está criando o que se mede embaixo deste objetivo. */
  objetivoPai?: Meta | null;
  /** Preenchido = está editando esta linha. */
  edicao?: Meta | null;
}) {
  const salvar = useSalvarMeta();
  const { profiles } = useProfiles();

  const ehFilho = !!objetivoPai || !!edicao?.parent_goal_id;
  const rotuloFilho = modo === 'okr' ? 'Resultado-chave' : 'Indicador';

  const [titulo, setTitulo] = useState('');
  const [descricao, setDescricao] = useState('');
  const [responsavel, setResponsavel] = useState('nenhum');
  const [unidade, setUnidade] = useState<'number' | 'percent' | 'currency'>('number');
  const [sentido, setSentido] = useState<'up' | 'down'>('up');
  const [partida, setPartida] = useState('');
  const [alvo, setAlvo] = useState('');
  const [ritmo, setRitmo] = useState<'monthly' | 'quarterly' | 'yearly'>('monthly');
  const [inicio, setInicio] = useState('');
  const [fim, setFim] = useState('');

  // O diálogo fica montado com a página: sem isto o segundo objetivo abriria com
  // o que foi digitado no primeiro.
  useEffect(() => {
    if (!open) return;
    setTitulo(edicao?.title ?? '');
    setDescricao(edicao?.description ?? '');
    setResponsavel(edicao?.assigned_to ?? 'nenhum');
    setUnidade((edicao?.unit as 'number' | 'percent' | 'currency') ?? 'number');
    setSentido((edicao?.direction as 'up' | 'down') ?? 'up');
    setPartida(edicao?.baseline != null ? String(edicao.baseline) : '');
    setAlvo(edicao ? String(edicao.target_value) : '');
    setRitmo((edicao?.frequency as 'monthly' | 'quarterly' | 'yearly')
      ?? (objetivoPai?.frequency as 'monthly' | 'quarterly' | 'yearly') ?? 'monthly');
    setInicio(edicao?.start_date ?? objetivoPai?.start_date ?? primeiroDiaDoAno());
    setFim(edicao?.end_date ?? objetivoPai?.end_date ?? ultimoDiaDoAno());
  }, [open, edicao, objetivoPai]);

  const alvoNumero = Number(alvo.replace(',', '.'));
  const partidaNumero = partida.trim() === '' ? null : Number(partida.replace(',', '.'));
  const alvoValido = !ehFilho || (alvo.trim() !== '' && Number.isFinite(alvoNumero));
  const partidaValida = partida.trim() === '' || Number.isFinite(partidaNumero);
  const podeSalvar = titulo.trim() !== '' && inicio !== '' && fim !== '' && fim >= inicio
    && alvoValido && partidaValida && !salvar.isPending;

  function enviar() {
    const input: MetaInput = {
      id: edicao?.id,
      parent_goal_id: objetivoPai?.id ?? edicao?.parent_goal_id ?? null,
      title: titulo,
      description: descricao,
      scope: (edicao?.scope as MetaInput['scope']) ?? 'company',
      assigned_to: responsavel === 'nenhum' ? null : responsavel,
      // Objetivo não carrega número: a meta de 1 é só o lugar onde o progresso
      // dos filhos aparece, e a tela nunca a mostra.
      unit: ehFilho ? unidade : 'number',
      direction: ehFilho ? sentido : 'up',
      baseline: ehFilho ? partidaNumero : null,
      target_value: ehFilho ? alvoNumero : 1,
      frequency: ritmo,
      start_date: inicio,
      end_date: fim,
    };
    salvar.mutate(input, { onSuccess: () => onOpenChange(false) });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {edicao ? 'Editar ' : 'Novo '}
            {ehFilho ? rotuloFilho.toLowerCase() : 'objetivo'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {objetivoPai && (
            <p className="text-[13px] text-muted-foreground">
              Embaixo do objetivo <strong className="text-foreground">{objetivoPai.title}</strong>.
            </p>
          )}

          <div className="space-y-1.5">
            <Label>{ehFilho ? 'O que se mede' : 'Objetivo'}</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={ehFilho
                ? 'Ex.: Chamados resolvidos dentro do prazo'
                : 'Ex.: Ser referência em atendimento'}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Explicação (opcional)</Label>
            <Textarea rows={2} value={descricao} onChange={(e) => setDescricao(e.target.value)}
              placeholder="Por que isso importa, como se mede, de onde vem o número…" />
          </div>

          {ehFilho && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Tipo de número</Label>
                  <Select value={unidade} onValueChange={(v) => setUnidade(v as typeof unidade)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="number">Quantidade</SelectItem>
                      <SelectItem value="percent">Porcentagem</SelectItem>
                      <SelectItem value="currency">Dinheiro (R$)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>A meta é</Label>
                  <Select value={sentido} onValueChange={(v) => setSentido(v as typeof sentido)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="up">Subir até o alvo</SelectItem>
                      <SelectItem value="down">Cair até o alvo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Está em quanto hoje?</Label>
                  <Input inputMode="decimal" value={partida} onChange={(e) => setPartida(e.target.value)}
                    placeholder="Opcional" />
                </div>
                <div className="space-y-1.5">
                  <Label>Quer chegar a quanto?</Label>
                  <Input inputMode="decimal" value={alvo} onChange={(e) => setAlvo(e.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground -mt-1">
                Dizer de onde partiu faz o progresso ser honesto: sair de 80% e chegar a 90% é
                metade do caminho, não 89%.
              </p>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Mede de quanto em quanto tempo</Label>
              <Select value={ritmo} onValueChange={(v) => setRitmo(v as typeof ritmo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">Todo mês</SelectItem>
                  <SelectItem value="quarterly">Todo trimestre</SelectItem>
                  <SelectItem value="yearly">Uma vez por ano</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <Select value={responsavel} onValueChange={setResponsavel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Ninguém em especial</SelectItem>
                  {profiles.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name || p.email}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Começa em</Label>
              <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Termina em</Label>
              <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
            </div>
          </div>
          {fim !== '' && inicio !== '' && fim < inicio && (
            <p className="text-[11px] text-destructive">A meta não pode terminar antes de começar.</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!podeSalvar} onClick={enviar}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function primeiroDiaDoAno(): string {
  return `${todayISO().slice(0, 4)}-01-01`;
}
function ultimoDiaDoAno(): string {
  return `${todayISO().slice(0, 4)}-12-31`;
}
