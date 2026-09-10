import { useEffect, useState } from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCRMContacts, useCRMPipelines, useCRMStages, useSaveDeal } from '@/hooks/useCRM';
import { useTechnicians } from '@/hooks/useTechnicians';
import { SOURCE_LABELS } from '@/lib/crm';
import { ContactDialog } from './ContactDialog';
import { CustomFieldsForm } from './CustomFieldsForm';
import { useCustomFields } from '@/hooks/useCustomFields';
import { validateCustomValues, type CustomValues } from '@/lib/custom-fields';

const EMPTY: never[] = [];

interface DealDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Funil aberto na tela — o negócio nasce nele. */
  defaultPipelineId?: string;
  /** Etapa em que o negócio nasce — normalmente a coluna onde "Novo negócio" foi clicado. */
  defaultStageId?: string;
}

/** "Novo negócio" do Funil: título, contato (com busca e opção de criar), funil e etapa, valor, origem, previsão e dono. */
export function DealDialog({ open, onOpenChange, defaultPipelineId, defaultStageId }: DealDialogProps) {
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [pipelineId, setPipelineId] = useState<string | undefined>();
  const [stageId, setStageId] = useState<string | undefined>();
  const [custom, setCustom] = useState<CustomValues>({});
  const [customErrors, setCustomErrors] = useState<Record<string, string>>({});
  const [contactId, setContactId] = useState<string | undefined>();
  const [contactLabel, setContactLabel] = useState('');
  const [value, setValue] = useState('');
  const [source, setSource] = useState('manual');
  const [expectedCloseDate, setExpectedCloseDate] = useState('');
  const [ownerId, setOwnerId] = useState<string | undefined>();
  const [contactPickerOpen, setContactPickerOpen] = useState(false);
  const [contactSearch, setContactSearch] = useState('');
  const [newContactOpen, setNewContactOpen] = useState(false);

  const { data: contacts = [] } = useCRMContacts(contactSearch);
  const { data: technicians = [] } = useTechnicians();
  // Referência estável enquanto carrega: `= []` inline entra no useEffect abaixo e
  // vira laço infinito (lista nova a cada render → efeito → setState → render…).
  const { data: pipelines = EMPTY } = useCRMPipelines();
  const { data: allStages = EMPTY } = useCRMStages();
  const { data: customFields = [] } = useCustomFields('deal');
  const saveDeal = useSaveDeal();

  const stages = allStages.filter((s) => s.pipeline_id === pipelineId && s.kind === 'open');

  useEffect(() => {
    if (open) {
      const fromStage = allStages.find((s) => s.id === defaultStageId)?.pipeline_id;
      setPipelineId(defaultPipelineId ?? fromStage ?? pipelines.find((p) => p.is_default)?.id ?? pipelines[0]?.id);
      setStageId(defaultStageId);
      setCustom({});
      setCustomErrors({});
      setTitle('');
      setContactId(undefined);
      setContactLabel('');
      setContactSearch('');
      setValue('');
      setSource('manual');
      setExpectedCloseDate('');
      setOwnerId(user?.id);
    }
  }, [open, user?.id, defaultPipelineId, defaultStageId, allStages, pipelines]);

  // Trocou de funil, ou a etapa padrão não é dele: cai na primeira etapa aberta.
  useEffect(() => {
    if (stages.length > 0 && !stages.some((s) => s.id === stageId)) setStageId(stages[0].id);
  }, [stages, stageId]);

  const canSave = title.trim().length > 0 && !!contactId;

  const handleSave = () => {
    if (!canSave || !contactId) return;
    const errors = validateCustomValues(customFields, custom);
    setCustomErrors(errors);
    if (Object.keys(errors).length > 0) return;
    saveDeal.mutate(
      {
        contact_id: contactId,
        stage_id: stageId ?? defaultStageId,
        title: title.trim(),
        value: Number(value) || 0,
        owner_id: ownerId ?? null,
        source,
        expected_close_date: expectedCloseDate || null,
        custom,
      },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo negócio</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Título *</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex.: Fornecimento mensal — Empresa X"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Contato *</Label>
              <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                    <span className={cn(!contactLabel && 'text-muted-foreground')}>
                      {contactLabel || 'Buscar contato...'}
                    </span>
                    <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Nome, e-mail ou empresa..."
                      value={contactSearch}
                      onValueChange={setContactSearch}
                    />
                    <CommandList>
                      <CommandEmpty>Nenhum contato encontrado.</CommandEmpty>
                      <CommandGroup>
                        {contacts.map((c) => (
                          <CommandItem
                            key={c.id}
                            value={c.id}
                            onSelect={() => {
                              setContactId(c.id);
                              setContactLabel(c.company ? `${c.name} — ${c.company}` : c.name);
                              setContactPickerOpen(false);
                            }}
                          >
                            <Check className={cn('mr-2 h-4 w-4', contactId === c.id ? 'opacity-100' : 'opacity-0')} />
                            {c.name}
                            {c.company ? ` — ${c.company}` : ''}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                    <div className="border-t border-border p-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="w-full justify-start"
                        onClick={() => {
                          setContactPickerOpen(false);
                          setNewContactOpen(true);
                        }}
                      >
                        <Plus className="h-3.5 w-3.5 mr-1.5" /> Novo contato
                      </Button>
                    </div>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Funil</Label>
                <Select value={pipelineId ?? ''} onValueChange={setPipelineId}>
                  <SelectTrigger><SelectValue placeholder="Funil" /></SelectTrigger>
                  <SelectContent>
                    {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Etapa</Label>
                <Select value={stageId ?? ''} onValueChange={setStageId}>
                  <SelectTrigger><SelectValue placeholder="Etapa" /></SelectTrigger>
                  <SelectContent>
                    {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor (R$)</Label>
                <Input type="number" min="0" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Origem</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(SOURCE_LABELS).map(([sourceValue, label]) => (
                      <SelectItem key={sourceValue} value={sourceValue}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Previsão de fechamento</Label>
                <Input type="date" value={expectedCloseDate} onChange={(e) => setExpectedCloseDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Dono</Label>
                <Select value={ownerId ?? '__none__'} onValueChange={(v) => setOwnerId(v === '__none__' ? undefined : v)}>
                  <SelectTrigger><SelectValue placeholder="Sem dono" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sem dono</SelectItem>
                    {technicians.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.full_name || t.email}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <CustomFieldsForm entity="deal" values={custom} onChange={setCustom} errors={customErrors} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={!canSave || saveDeal.isPending}>Salvar negócio</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ContactDialog
        open={newContactOpen}
        onOpenChange={setNewContactOpen}
        onSaved={(contact) => {
          setContactId(contact.id);
          setContactLabel(contact.company ? `${contact.name} — ${contact.company}` : contact.name);
        }}
      />
    </>
  );
}
