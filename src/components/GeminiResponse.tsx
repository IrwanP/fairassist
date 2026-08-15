import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { TrustedSourceRegistry } from '../data/sourcesConfig';
import { ExternalLink } from 'lucide-react';

interface GeminiResponseProps {
  content: string;
  className?: string;
  compact?: boolean;
}

export const GeminiResponse: React.FC<GeminiResponseProps> = ({
  content,
  className = '',
  compact = false,
}) => {
  if (!content) return null;

  // Normalize string if escaped \n characters exist in string
  const normalizedText = content.replace(/\\n/g, '\n').trim();

  return (
    <div className={`gemini-response-markdown text-stone-800 leading-relaxed break-words [overflow-wrap:anywhere] max-w-full ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h3 className={`font-bold text-stone-900 tracking-tight mt-3 mb-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
              {children}
            </h3>
          ),
          h2: ({ children }) => (
            <h3 className={`font-bold text-stone-900 tracking-tight mt-3 mb-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
              {children}
            </h3>
          ),
          h3: ({ children }) => (
            <h4 className={`font-bold text-stone-900 tracking-tight mt-2.5 mb-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {children}
            </h4>
          ),
          h4: ({ children }) => (
            <h4 className={`font-semibold text-stone-900 mt-2 mb-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className={`mb-2 last:mb-0 leading-relaxed ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {children}
            </p>
          ),
          strong: ({ children }) => (
            <strong className="font-bold text-stone-900">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-stone-800">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className={`list-disc list-outside pl-4 space-y-1 my-2 text-stone-800 ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className={`list-decimal list-outside pl-4 space-y-1 my-2 text-stone-800 ${compact ? 'text-[11px]' : 'text-xs'}`}>
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="pl-3 border-l-2 border-stone-800 italic text-stone-700 my-2 bg-stone-50/80 py-1 pr-2 rounded-r">
              {children}
            </blockquote>
          ),
          code: ({ children }) => (
            <code className="bg-stone-200/70 text-stone-900 font-mono text-[11px] px-1.5 py-0.5 rounded border border-stone-300/50">
              {children}
            </code>
          ),
          a: ({ href, children }) => {
            const resolved = TrustedSourceRegistry.resolve(href || String(children));
            if (!resolved.isAvailable) {
              return (
                <span className="text-stone-500 italic text-[11px] inline-flex items-center gap-1 font-normal bg-stone-100 px-1.5 py-0.5 rounded border border-stone-200">
                  Official source temporarily unavailable
                </span>
              );
            }
            return (
              <a
                href={resolved.url}
                target="_blank"
                rel="noreferrer"
                className="text-indigo-600 hover:text-indigo-800 font-semibold underline underline-offset-2 transition-colors inline-flex items-center gap-0.5"
              >
                {children} <ExternalLink className="w-2.5 h-2.5" />
              </a>
            );
          },
        }}
      >
        {normalizedText}
      </Markdown>
    </div>
  );
};
