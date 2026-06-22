import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import type { Options as SanitizeSchema } from "rehype-sanitize";
import type { Components } from "react-markdown";
import type { PluggableList } from "unified";
import { linkifyReactChildren } from "../utils/filePathLinkify";
import { MermaidDiagram } from "./MermaidDiagram";

/*
FNXC:Markdown 2026-06-23-03:15:
GitHub PR/issue bodies + comments (and mailbox/chat) embed raw HTML (`<details>`,
`<summary>`, `<kbd>`, `<sub>`, tables), HTML comments (`<!-- -->`), and ```mermaid
blocks. Previously raw HTML was escaped to literal text and mermaid showed as code.

Pipeline (ORDER MATTERS): remark-gfm -> rehype-raw -> rehype-sanitize.
- rehype-raw parses embedded HTML into the hast tree so it renders as real elements.
  It also DROPS HTML comments by default, so `<!-- ... -->` never appears in output.
- rehype-sanitize runs AFTER raw to strip XSS: <script>/<style>/<iframe>, event
  handlers (onClick etc.), and javascript: URLs. Because these bodies come from
  GitHub (untrusted), sanitize is mandatory — raw without sanitize would be an XSS
  hole. Running sanitize last guarantees nothing injected via raw survives.
*/

/*
FNXC:Markdown 2026-06-23-03:15:
Sanitize schema = rehype-sanitize defaultSchema (a conservative GitHub-like allow
list that already permits details/summary/kbd/sub/sup/b/i/em/strong/a/img/code/pre/
tables/br/hr/blockquote/lists/headings/span/div and strips script/style/event
handlers/javascript: URLs) EXTENDED to ensure the `className` attribute survives on
common elements (needed for our `language-*` code fences and styled wrappers). We do
NOT widen tagNames beyond defaults, so script/style/iframe stay stripped.
*/
const mailboxSanitizeSchema: SanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Preserve className on code/span/div/pre so language fences + wrapper styling work.
    code: [...(defaultSchema.attributes?.code ?? []), "className"],
    span: [...(defaultSchema.attributes?.span ?? []), "className"],
    div: [...(defaultSchema.attributes?.div ?? []), "className"],
    pre: [...(defaultSchema.attributes?.pre ?? []), "className"],
    // `<details open>` disclosure state should round-trip.
    details: [...(defaultSchema.attributes?.details ?? []), "open"],
  },
};

const mailboxMarkdownComponents: Components = {
  p: ({ children, ...props }) => <p {...props}>{linkifyReactChildren(children)}</p>,
  li: ({ children, ...props }) => <li {...props}>{linkifyReactChildren(children)}</li>,
  pre: ({ children, ...props }) => (
    <pre {...props} className="mailbox-markdown-pre">
      {children}
    </pre>
  ),
  table: ({ children, ...props }) => (
    <table {...props} className="mailbox-markdown-table">
      {children}
    </table>
  ),
  /*
  FNXC:Markdown 2026-06-23-03:15:
  Code-block override: a fenced ```mermaid block arrives as `<code class="language-mermaid">`.
  Render it via <MermaidDiagram>, which lazy-imports mermaid so the heavy library is
  only pulled in when a diagram is present. All other code (inline + other languages)
  keeps the default rendering.
  */
  code: ({ className, children, ...props }) => {
    if (className === "language-mermaid") {
      const chart = String(children ?? "").replace(/\n$/, "");
      return <MermaidDiagram chart={chart} testId="mailbox-mermaid-diagram" />;
    }
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  },
  // Open links in a new tab. Sanitize strips javascript: URLs and event handlers
  // before this runs, so href is safe.
  a: ({ children, ...props }) => (
    <a {...props} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
};

const remarkPlugins: PluggableList = [remarkGfm];
// Raw must run before sanitize: parse HTML, then strip anything unsafe.
const rehypePlugins: PluggableList = [rehypeRaw, [rehypeSanitize, mailboxSanitizeSchema]];

interface MailboxMessageContentProps {
  /** Raw message body. Rendered as GitHub-flavored markdown. */
  content: string;
  /** Optional extra class for the wrapper. */
  className?: string;
  /** Optional data-testid for test selectors. */
  testId?: string;
}

/**
 * Renders a mailbox message body as GitHub-flavored markdown.
 *
 * Supports embedded raw HTML (details/summary/kbd/sub/tables) via rehype-raw, with
 * rehype-sanitize stripping XSS (script/style/iframe/event-handlers/javascript:).
 * Fenced ```mermaid blocks render as diagrams via the lazy-loaded MermaidDiagram.
 * HTML comments (`<!-- -->`) are dropped and never rendered.
 *
 * Memoized because mailbox detail panes can re-render on selection / SSE
 * updates while the underlying message body is unchanged.
 */
export const MailboxMessageContent = memo(function MailboxMessageContent({
  content,
  className,
  testId,
}: MailboxMessageContentProps) {
  const wrapperClass = className
    ? `mailbox-markdown ${className}`
    : "mailbox-markdown";
  return (
    <div className={wrapperClass} data-testid={testId}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={mailboxMarkdownComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
});
