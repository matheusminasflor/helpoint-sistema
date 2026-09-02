import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { WIDGET_REGISTRY, WidgetId, DEFAULT_WIDGETS } from '@/hooks/useDashboardPreferences';
import { GripVertical, RotateCcw } from 'lucide-react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  visibleWidgets: WidgetId[];
  widgetOrder: WidgetId[];
  defaultPeriod: string;
  onSave: (prefs: { visible_widgets: WidgetId[]; widget_order: WidgetId[]; default_period: string }) => Promise<void>;
  isSaving: boolean;
}

function SortableWidget({ id, checked, onCheckedChange }: { id: WidgetId; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id });
  const widget = WIDGET_REGISTRY.find(w => w.id === id);
  
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 p-3 rounded-lg border border-border/50 bg-card hover:bg-accent/30 transition-colors"
    >
      <button {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground">
        <GripVertical className="h-4 w-4" />
      </button>
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(val) => onCheckedChange(!!val)}
      />
      <label htmlFor={id} className="flex-1 cursor-pointer">
        <span className="text-sm font-medium">{widget?.label}</span>
        <span className="text-xs text-muted-foreground block">{widget?.description}</span>
      </label>
    </div>
  );
}

export function DashboardCustomizer({ open, onOpenChange, visibleWidgets, widgetOrder, defaultPeriod, onSave, isSaving }: Props) {
  const [localVisible, setLocalVisible] = useState<Set<WidgetId>>(new Set(visibleWidgets));
  const [localOrder, setLocalOrder] = useState<WidgetId[]>(widgetOrder);

  useEffect(() => {
    if (open) {
      const visible = visibleWidgets.length > 0 ? visibleWidgets : DEFAULT_WIDGETS;
      setLocalVisible(new Set(visible));
      
      // Build order: start with saved order, add missing widgets
      const allIds = WIDGET_REGISTRY.map(w => w.id);
      const savedOrder = widgetOrder.length > 0 ? widgetOrder : visible;
      const missing = allIds.filter(id => !savedOrder.includes(id));
      setLocalOrder([...savedOrder, ...missing] as WidgetId[]);
    }
  }, [open, visibleWidgets, widgetOrder]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setLocalOrder(prev => {
        const oldIndex = prev.indexOf(active.id as WidgetId);
        const newIndex = prev.indexOf(over.id as WidgetId);
        return arrayMove(prev, oldIndex, newIndex);
      });
    }
  };

  const handleSave = async () => {
    const visibleArray = localOrder.filter(id => localVisible.has(id));
    await onSave({
      visible_widgets: visibleArray,
      widget_order: localOrder,
      default_period: defaultPeriod,
    });
    onOpenChange(false);
  };

  const handleReset = () => {
    setLocalVisible(new Set(DEFAULT_WIDGETS));
    const allIds = WIDGET_REGISTRY.map(w => w.id);
    setLocalOrder(allIds as unknown as WidgetId[]);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Personalizar Dashboard</SheetTitle>
          <SheetDescription>Escolha e ordene os widgets que deseja visualizar.</SheetDescription>
        </SheetHeader>

        <div className="py-4 space-y-2">
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={localOrder} strategy={verticalListSortingStrategy}>
              {localOrder.map(id => (
                <SortableWidget
                  key={id}
                  id={id}
                  checked={localVisible.has(id)}
                  onCheckedChange={(checked) => {
                    setLocalVisible(prev => {
                      const next = new Set(prev);
                      if (checked) next.add(id);
                      else next.delete(id);
                      return next;
                    });
                  }}
                />
              ))}
            </SortableContext>
          </DndContext>
        </div>

        <SheetFooter className="flex-row gap-2 pt-4">
          <Button variant="ghost" size="sm" onClick={handleReset}>
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
            Padrão
          </Button>
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Salvando...' : 'Salvar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
