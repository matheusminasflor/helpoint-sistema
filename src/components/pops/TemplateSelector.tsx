import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TUTORIAL_TEMPLATES, TutorialTemplate } from './tutorialTemplates';
import { cn } from '@/lib/utils';

interface TemplateSelectorProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: TutorialTemplate) => void;
}

export function TemplateSelector({ open, onOpenChange, onSelect }: TemplateSelectorProps) {
  const handleSelect = (template: TutorialTemplate) => {
    onSelect(template);
    onOpenChange(false);
  };

  // Group templates by category
  const groupedTemplates = TUTORIAL_TEMPLATES.reduce((acc, template) => {
    const category = template.category || 'Outros';
    if (!acc[category]) {
      acc[category] = [];
    }
    acc[category].push(template);
    return acc;
  }, {} as Record<string, TutorialTemplate[]>);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="text-xl">Escolha um template para começar</DialogTitle>
          <DialogDescription>
            Selecione um modelo pré-definido ou comece do zero com o template em branco
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="h-[500px] pr-4">
          <div className="space-y-6">
            {Object.entries(groupedTemplates).map(([category, templates]) => (
              <div key={category}>
                <h3 className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                  {category}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  {templates.map((template) => {
                    const Icon = template.icon;
                    const isBlank = template.id === 'blank';
                    
                    return (
                      <Card
                        key={template.id}
                        className={cn(
                          "cursor-pointer transition-all hover:border-primary hover:shadow-md group",
                          isBlank && "border-dashed"
                        )}
                        onClick={() => handleSelect(template)}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <div className={cn(
                              "p-2.5 rounded-lg transition-colors",
                              isBlank 
                                ? "bg-muted group-hover:bg-muted/80" 
                                : "bg-primary/10 group-hover:bg-primary/20"
                            )}>
                              <Icon className={cn(
                                "h-5 w-5",
                                isBlank ? "text-muted-foreground" : "text-primary"
                              )} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm mb-0.5 group-hover:text-primary transition-colors">
                                {template.name}
                              </h4>
                              <p className="text-xs text-muted-foreground line-clamp-2">
                                {template.description}
                              </p>
                              {template.keywords.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {template.keywords.slice(0, 3).map((kw) => (
                                    <Badge key={kw} variant="secondary" className="text-[10px] px-1.5 py-0">
                                      {kw}
                                    </Badge>
                                  ))}
                                  {template.keywords.length > 3 && (
                                    <span className="text-[10px] text-muted-foreground">
                                      +{template.keywords.length - 3}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
