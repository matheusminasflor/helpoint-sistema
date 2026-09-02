import { cn } from '@/lib/utils';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

/**
 * Renders basic markdown as formatted HTML.
 * Supports: **bold**, *italic*, ## headers, - lists, line breaks.
 */
export function MarkdownRenderer({ content, className }: MarkdownRendererProps) {
  if (!content) return null;

  const html = renderMarkdown(content);

  return (
    <div
      className={cn(
        "prose prose-sm dark:prose-invert max-w-none",
        "[&_strong]:font-semibold [&_strong]:text-foreground",
        "[&_em]:italic [&_em]:text-foreground/90",
        "[&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5",
        "[&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5",
        "[&_li]:text-sm [&_li]:leading-relaxed",
        "[&_h1]:text-lg [&_h1]:font-bold [&_h1]:mt-3 [&_h1]:mb-1",
        "[&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-2 [&_h2]:mb-1",
        "[&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-0.5",
        "[&_p]:text-sm [&_p]:leading-relaxed [&_p]:mb-1.5",
        className
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderInline(text: string): string {
  return escapeHtml(text)
    // Bold **text**
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    // Italic *text*
    .replace(/\*([^*\s][^*]*[^*\s])\*/g, '<em>$1</em>')
    // Single word italic *word*
    .replace(/\*([^\s*]+)\*/g, '<em>$1</em>');
}

function renderMarkdown(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let inList = false;
  let listType: 'ul' | 'ol' = 'ul';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Headers
    if (line.startsWith('### ')) {
      if (inList) { result.push(`</${listType}>`); inList = false; }
      result.push(`<h3>${renderInline(line.slice(4))}</h3>`);
      continue;
    }
    if (line.startsWith('## ')) {
      if (inList) { result.push(`</${listType}>`); inList = false; }
      result.push(`<h2>${renderInline(line.slice(3))}</h2>`);
      continue;
    }
    if (line.startsWith('# ')) {
      if (inList) { result.push(`</${listType}>`); inList = false; }
      result.push(`<h1>${renderInline(line.slice(2))}</h1>`);
      continue;
    }

    // Unordered list
    if (line.match(/^[-•*]\s+/)) {
      if (!inList || listType !== 'ul') {
        if (inList) result.push(`</${listType}>`);
        result.push('<ul>');
        inList = true;
        listType = 'ul';
      }
      result.push(`<li>${renderInline(line.replace(/^[-•*]\s+/, ''))}</li>`);
      continue;
    }

    // Ordered list
    if (line.match(/^\d+\.\s+/)) {
      if (!inList || listType !== 'ol') {
        if (inList) result.push(`</${listType}>`);
        result.push('<ol>');
        inList = true;
        listType = 'ol';
      }
      result.push(`<li>${renderInline(line.replace(/^\d+\.\s+/, ''))}</li>`);
      continue;
    }

    // Close list if we're not in a list item
    if (inList) {
      result.push(`</${listType}>`);
      inList = false;
    }

    // Empty line
    if (line.trim() === '') {
      continue;
    }

    // Regular paragraph
    result.push(`<p>${renderInline(line)}</p>`);
  }

  if (inList) {
    result.push(`</${listType}>`);
  }

  return result.join('');
}
