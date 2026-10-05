import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { MarkdownContent } from "./MarkdownContent";

function renderMarkdown(text: string): HTMLElement {
  return render(<MarkdownContent text={text} />).container;
}

describe("MarkdownContent", () => {
  it("renders headings, lists, tables and code", () => {
    const html = renderMarkdown(
      "# Title\n\n- one\n- two\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst x = 1;\n```",
    );
    expect(html.querySelector("h1")?.textContent).toBe("Title");
    expect(html.querySelectorAll("li")).toHaveLength(2);
    expect(html.querySelector("table td")?.textContent).toBe("1");
    expect(html.querySelector("pre code")?.textContent).toBe("const x = 1;\n");
  });

  it("drops raw HTML from model output", () => {
    const html = renderMarkdown(
      'Hello <script>alert(1)</script><b onclick="x()">bold</b>\n\n<iframe src="https://example.com"></iframe>',
    );
    expect(html.querySelector("script, b, iframe")).toBeNull();
    expect(html.innerHTML).not.toContain("onclick");
  });

  it("removes javascript: links and opens other links safely in a new tab", () => {
    const html = renderMarkdown(
      "[bad](javascript:alert(1)) [good](https://example.com)",
    );
    const [bad, good] = Array.from(html.querySelectorAll("a"));
    expect(bad?.getAttribute("href") ?? "").not.toContain("javascript");
    expect(good?.getAttribute("href")).toBe("https://example.com");
    expect(good?.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("shows images as links so they never load by themselves", () => {
    const html = renderMarkdown(
      "![chart](https://tracker.example/pixel.png?data=secret)",
    );
    expect(html.querySelector("img")).toBeNull();
    const link = html.querySelector("a");
    expect(link?.textContent).toBe("Image: chart");
    expect(link?.getAttribute("href")).toBe(
      "https://tracker.example/pixel.png?data=secret",
    );
  });
});
