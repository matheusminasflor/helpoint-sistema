import { Sparkles } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { LyraConfigTab } from '@/components/ti/LyraConfigTab';
import { AIProviderTab } from '@/components/ti/AIProviderTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAssistantName } from '@/hooks/useAssistantName';

export default function LyraSettings() {
  const assistantName = useAssistantName();

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        className="bg-transparent border-0 px-0 py-0"
        icon={Sparkles}
        title={`Configurações da IA / ${assistantName}`}
        description="Personalize o comportamento da assistente e o provedor de IA da empresa"
      />

      <Tabs defaultValue="comportamento">
        <TabsList>
          <TabsTrigger value="comportamento">Comportamento</TabsTrigger>
          <TabsTrigger value="provedor">Provedor de IA</TabsTrigger>
        </TabsList>
        <TabsContent value="comportamento" className="mt-4">
          <LyraConfigTab />
        </TabsContent>
        <TabsContent value="provedor" className="mt-4">
          <AIProviderTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
