import { useMemo, useState } from 'react';
import { Users, Plus } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTechnicians } from '@/hooks/useTechnicians';
import { useCRMContacts, useCRMDeals, useContactDeals, type CRMContact } from '@/hooks/useCRM';
import { SOURCE_LABELS, formatBRL } from '@/lib/crm';
import { ContactDialog } from '@/components/crm/ContactDialog';

function ContactDealsDialog({ contact, onClose }: { contact: CRMContact; onClose: () => void }) {
  const { data: deals = [], isLoading } = useContactDeals(contact.id);
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Negócios de {contact.name}</DialogTitle></DialogHeader>
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : deals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum negócio ainda.</p>
        ) : (
          <div className="space-y-2">
            {deals.map((deal) => (
              <div key={deal.id} className="flex items-center justify-between rounded-lg border p-2 text-sm">
                <div className="min-w-0">
                  <p className="font-medium truncate">{deal.title}</p>
                  <p className="text-xs text-muted-foreground">{deal.stage?.name ?? '—'}</p>
                </div>
                <span className="font-medium shrink-0 ml-2">{formatBRL(deal.value)}</span>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function ComercialContatos() {
  const [search, setSearch] = useState('');
  const { data: contacts = [], isLoading } = useCRMContacts(search);
  const { data: openDeals = [] } = useCRMDeals();
  const { data: technicians = [] } = useTechnicians();

  const [newOpen, setNewOpen] = useState(false);
  const [editing, setEditing] = useState<CRMContact | null>(null);
  const [viewingDeals, setViewingDeals] = useState<CRMContact | null>(null);

  const openDealsByContact = useMemo(() => {
    const map = new Map<string, number>();
    for (const deal of openDeals) map.set(deal.contact_id, (map.get(deal.contact_id) ?? 0) + 1);
    return map;
  }, [openDeals]);

  const technicianName = (ownerId: string | null) =>
    ownerId ? technicians.find((t) => t.id === ownerId)?.full_name || technicians.find((t) => t.id === ownerId)?.email || '—' : '—';

  return (
    <div className="flex flex-col min-h-full">
      <PageHeader
        title="Contatos"
        description="Leads e clientes do Comercial."
        icon={Users}
        actions={<Button onClick={() => setNewOpen(true)}><Plus className="w-4 h-4 mr-1.5" /> Novo contato</Button>}
      >
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, e-mail ou empresa"
          className="max-w-sm"
        />
      </PageHeader>

      <div className="p-4 lg:p-6">
        <Card className="overflow-hidden">
          {isLoading ? (
            <div className="p-4 space-y-1">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : contacts.length === 0 ? (
            <EmptyState
              icon={Users}
              title="Nenhum contato ainda"
              description="Cadastre o primeiro contato para começar a montar negócios."
              actionLabel="Novo contato"
              actionIcon={Plus}
              onAction={() => setNewOpen(true)}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="border-b border-border bg-secondary/60 text-left text-muted-foreground">
                    <th className="px-3 py-2 font-semibold border-r border-border">Nome</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Empresa</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">E-mail</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Telefone</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Dono</th>
                    <th className="px-3 py-2 font-semibold border-r border-border">Origem</th>
                    <th className="px-3 py-2 font-semibold text-right">Negócios abertos</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((contact) => (
                    <tr
                      key={contact.id}
                      className="border-b border-border hover:bg-secondary/50 cursor-pointer"
                      onClick={() => setEditing(contact)}
                    >
                      <td className="px-3 py-2 font-medium">{contact.name}</td>
                      <td className="px-3 py-2 text-muted-foreground">{contact.company || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{contact.email || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{contact.phone || '—'}</td>
                      <td className="px-3 py-2">{technicianName(contact.owner_id)}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{SOURCE_LABELS[contact.source] ?? contact.source}</Badge></td>
                      <td className="px-3 py-2 text-right">
                        <button
                          className="hover:underline"
                          onClick={(e) => { e.stopPropagation(); setViewingDeals(contact); }}
                        >
                          {openDealsByContact.get(contact.id) ?? 0}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ContactDialog open={newOpen} onOpenChange={setNewOpen} />
      {editing && (
        <ContactDialog open onOpenChange={(v) => !v && setEditing(null)} contact={editing} />
      )}
      {viewingDeals && <ContactDealsDialog contact={viewingDeals} onClose={() => setViewingDeals(null)} />}
    </div>
  );
}
