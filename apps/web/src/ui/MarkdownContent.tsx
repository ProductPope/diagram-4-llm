import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders model output as Markdown. Model output is untrusted, so:
 * - raw HTML is dropped, and rendering produces React elements, never
 *   `innerHTML`;
 * - link targets go through react-markdown's URL sanitiser, which removes
 *   schemes such as `javascript:`;
 * - images become links. An image loads by itself, so a crafted answer could
 *   use one to send conversation data to another server; a link only
 *   loads when the user chooses to follow it.
 */
const components: Components = {
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  ),
  img: ({ src, alt }) => (
    <a
      href={typeof src === "string" ? src : undefined}
      target="_blank"
      rel="noopener noreferrer"
    >
      {alt !== undefined && alt !== "" ? `Image: ${alt}` : "Image"}
    </a>
  ),
};

export function MarkdownContent({ text }: { readonly text: string }) {
  return (
    <div className="markdown">
      <Markdown remarkPlugins={[remarkGfm]} skipHtml components={components}>
        {text}
      </Markdown>
    </div>
  );
}
