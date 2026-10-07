import { parseBlocks, type Inline } from '@/lib/changelog-shared';

function InlineContent({ content }: { content: Inline[] }) {
  return content.map((part, index) => {
    switch (part.type) {
      case 'strong':
        return (
          <strong className="font-semibold text-foreground" key={index}>
            {part.text}
          </strong>
        );
      case 'code':
        return (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.88em]" key={index}>
            {part.text}
          </code>
        );
      case 'link': {
        const external = /^https?:/.test(part.href);
        return (
          <a
            className="text-primary-text underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
            href={part.href}
            key={index}
            {...(external ? { rel: 'noreferrer', target: '_blank' } : {})}
          >
            {part.text}
          </a>
        );
      }
      default:
        return part.text;
    }
  });
}

/** Renders a changelog body as React elements; the Markdown is never injected as HTML. */
export function ChangelogBody({ body }: { body: string }) {
  return parseBlocks(body).map((block, index) => {
    if (block.type === 'heading') {
      return (
        <h2 className="mt-10 text-lg font-semibold text-foreground" key={index}>
          <InlineContent content={block.content} />
        </h2>
      );
    }
    if (block.type === 'list') {
      return (
        <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-primary" key={index}>
          {block.items.map((item, itemIndex) => (
            <li className="pl-1" key={itemIndex}>
              <InlineContent content={item} />
            </li>
          ))}
        </ul>
      );
    }
    return (
      <p className="mt-4" key={index}>
        <InlineContent content={block.content} />
      </p>
    );
  });
}
