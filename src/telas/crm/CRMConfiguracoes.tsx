import { PageHeader } from '@/components/layout/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Zap, Kanban, ListPlus, Layers, BadgePercent, CreditCard, FileText, KanbanSquare, MessageCircle, Megaphone } from 'lucide-react';
import { AutomationsTab } from '@/components/automations/AutomationsTab';
import { PipelineStagesEditor } from '@/components/crm/PipelineStagesEditor';
import { CustomFieldsManager } from '@/components/crm/CustomFieldsManager';
import { SegmentsManager } from '@/components/crm/SegmentsManager';
import { PriceTablesManager } from '@/components/crm/PriceTablesManager';
import { PaymentProvidersTab } from '@/components/crm/PaymentProvidersTab';
import { NotaFiscalTab } from '@/components/crm/NotaFiscalTab';
import { WhatsAppTab } from '@/components/crm/WhatsAppTab';
import { LeadAdsTab } from '@/components/crm/LeadAdsTab';

/**
 * Configurações do CRM (ADR-009): tudo o que é de venda — segmentos, funil,
 * tabelas de preço, campos, pagamento, nota fiscal e os fluxos de venda. Os
 * chamados do Comercial têm a própria tela (`ModuloConfiguracoes`).
 */
export default function CRMConfiguracoes() {
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <PageHeader
          className="bg-transparent border-0 px-0 py-0"
          icon={KanbanSquare}
          title="Configurações do CRM"
          description="Segmentos, funil, preços, campos, cobrança, nota fiscal e fluxos de venda."
        />
      </div>

      <Tabs defaultValue="segmentos">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="segmentos"><Layers className="w-3.5 h-3.5 mr-1.5" />Segmentos</TabsTrigger>
          <TabsTrigger value="funil"><Kanban className="w-3.5 h-3.5 mr-1.5" />Funil</TabsTrigger>
          <TabsTrigger value="precos"><BadgePercent className="w-3.5 h-3.5 mr-1.5" />Tabelas de preço</TabsTrigger>
          <TabsTrigger value="campos"><ListPlus className="w-3.5 h-3.5 mr-1.5" />Campos</TabsTrigger>
          <TabsTrigger value="pagamento"><CreditCard className="w-3.5 h-3.5 mr-1.5" />Pagamento</TabsTrigger>
          <TabsTrigger value="nota"><FileText className="w-3.5 h-3.5 mr-1.5" />Nota fiscal</TabsTrigger>
          <TabsTrigger value="whatsapp"><MessageCircle className="w-3.5 h-3.5 mr-1.5" />WhatsApp</TabsTrigger>
          <TabsTrigger value="leadads"><Megaphone className="w-3.5 h-3.5 mr-1.5" />Lead Ads</TabsTrigger>
            <TabsTrigger value="automacoes"><Zap className="w-3.5 h-3.5 mr-1.5" />Fluxos</TabsTrigger>
        </TabsList>

        <TabsContent value="segmentos"><SegmentsManager /></TabsContent>
        <TabsContent value="funil"><PipelineStagesEditor /></TabsContent>
        <TabsContent value="precos"><PriceTablesManager /></TabsContent>
        <TabsContent value="campos"><CustomFieldsManager /></TabsContent>
        <TabsContent value="pagamento"><PaymentProvidersTab /></TabsContent>
        <TabsContent value="nota"><NotaFiscalTab /></TabsContent>
        <TabsContent value="whatsapp"><WhatsAppTab /></TabsContent>
        <TabsContent value="leadads"><LeadAdsTab /></TabsContent>
          <TabsContent value="automacoes"><AutomationsTab module="crm" /></TabsContent>
      </Tabs>
    </div>
  );
}
