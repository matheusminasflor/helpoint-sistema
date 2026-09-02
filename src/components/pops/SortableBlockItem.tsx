import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { POPBlock } from '@/types/pop-blocks';
import { BlockItem } from './BlockItem';
import { cn } from '@/lib/utils';

interface SortableBlockItemProps {
  block: POPBlock;
  index: number;
  stepNumber?: number;
  onUpdate: (updates: Partial<POPBlock>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

export function SortableBlockItem({
  block,
  index,
  stepNumber,
  onUpdate,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: SortableBlockItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: block.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "transition-opacity",
        isDragging && "opacity-50 z-50"
      )}
    >
      <BlockItem
        block={block}
        index={index}
        stepNumber={stepNumber}
        onUpdate={onUpdate}
        onRemove={onRemove}
        onMoveUp={onMoveUp}
        onMoveDown={onMoveDown}
        isFirst={isFirst}
        isLast={isLast}
        dragHandleProps={{ ...attributes, ...listeners }}
      />
    </div>
  );
}
