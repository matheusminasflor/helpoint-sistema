import { Link } from 'react-router-dom';
import { Eye, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';
import type { POP } from '@/hooks/usePOPs';

interface CategorySectionProps {
  name: string;
  icon: LucideIcon;
  articles: POP[];
  onViewAll: () => void;
  maxVisible?: number;
  searchTerm?: string;
}

function HighlightText({ text, highlight }: { text: string; highlight?: string }) {
  if (!highlight?.trim()) return <>{text}</>;

  const parts = text.split(new RegExp(`(${highlight})`, 'gi'));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === highlight.toLowerCase() ? (
          <mark key={i} className="bg-primary/20 text-primary rounded px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

export function CategorySection({
  name,
  icon: Icon,
  articles,
  onViewAll,
  maxVisible = 5,
  searchTerm,
}: CategorySectionProps) {
  const visibleArticles = articles.slice(0, maxVisible);
  const hasMore = articles.length > maxVisible;

  if (articles.length === 0) return null;

  return (
    <section className="mb-8">
      {/* Category Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-primary/10">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-foreground">{name}</h2>
        <span className="text-sm text-muted-foreground">
          {articles.length} {articles.length === 1 ? 'artigo' : 'artigos'}
        </span>
      </div>

      {/* Articles List */}
      <div className="ml-10 space-y-0.5">
        {visibleArticles.map((article) => (
          <Link
            key={article.id}
            to={`/portal/${article.id}`}
            className={cn(
              'flex items-center justify-between py-2.5 px-3 -mx-3',
              'rounded-lg hover:bg-muted/60 transition-colors group'
            )}
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm text-foreground group-hover:text-primary transition-colors">
                <HighlightText text={article.title} highlight={searchTerm} />
              </span>
              {article.subcategory && (
                <span className="text-xs text-muted-foreground ml-2">
                  • {article.subcategory}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 shrink-0 ml-4">
              <span className="text-xs text-muted-foreground flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {article.views_count || 0}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground/50 group-hover:text-primary transition-colors" />
            </div>
          </Link>
        ))}
      </div>

      {/* View All Button */}
      {hasMore && (
        <button
          onClick={onViewAll}
          className="ml-10 mt-2 text-sm text-primary hover:underline flex items-center gap-1"
        >
          Ver todos os {articles.length} artigos
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      )}
    </section>
  );
}
