/**
 * Simple Markdown to HTML converter optimized for product descriptions
 * Converts Markdown to TiptapRenderer-compatible HTML
 */

export function markdownToHtml(markdown: string): string {
  let html = markdown.trim();

  // Escape HTML special characters first (but preserve markdown syntax)
  // (skipping for now since we control the input)

  // Convert bold: **text** -> <strong>text</strong>
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Convert italic: *text* -> <em>text</em>
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Convert headings: # Title -> <p><strong>Title</strong></p>
  html = html.replace(/^### (.+)$/gm, "<p><strong>$1</strong></p>");
  html = html.replace(/^## (.+)$/gm, "<p><strong>$1</strong></p>");
  html = html.replace(/^# (.+)$/gm, "<p><strong>$1</strong></p>");

  // Convert bullet lists: - item -> <ul><li>item</li></ul>
  const bulletListRegex = /(\n|^)(\s*[-•] .+(?:\n\s*[-•] .+)*)/gm;
  html = html.replace(bulletListRegex, (match) => {
    const items = match
      .trim()
      .split("\n")
      .map((line) => {
        const item = line.replace(/^\s*[-•]\s+/, "").trim();
        return `<li>${item}</li>`;
      });
    return `\n<ul>\n${items.join("\n")}\n</ul>\n`;
  });

  // Convert numbered lists: 1. item -> <ol><li>item</li></ol>
  const numberedListRegex = /^(\s*\d+\. .+(?:\n\s*\d+\. .+)*)/gm;
  html = html.replace(numberedListRegex, (match) => {
    const items = match
      .trim()
      .split("\n")
      .map((line) => {
        const item = line.replace(/^\s*\d+\.\s+/, "").trim();
        return `<li>${item}</li>`;
      });
    return `<ol>\n${items.join("\n")}\n</ol>`;
  });

  // Convert paragraphs: double newline separates paragraphs
  // First, preserve existing HTML tags
  const parts: string[] = [];
  const lines = html.split("\n");
  let currentParagraph = "";

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip if already HTML tag or list
    if (
      trimmed.startsWith("<") ||
      trimmed === ""
    ) {
      if (currentParagraph.trim()) {
        parts.push(`<p>${currentParagraph.trim()}</p>`);
        currentParagraph = "";
      }
      if (trimmed) {
        parts.push(trimmed);
      }
    } else {
      if (currentParagraph) {
        currentParagraph += " ";
      }
      currentParagraph += trimmed;
    }
  }

  if (currentParagraph.trim()) {
    parts.push(`<p>${currentParagraph.trim()}</p>`);
  }

  html = parts.join("");

  // Clean up extra whitespace
  html = html.replace(/\n\s*\n/g, "");
  html = html.replace(/>\s+</g, "><");

  // Add newlines for readability (optional, can be removed for minification)
  html = html
    .replace(/><ul>/g, ">\n<ul>")
    .replace(/><ol>/g, ">\n<ol>")
    .replace(/<\/ul><p>/g, "</ul>\n<p>")
    .replace(/<\/ol><p>/g, "</ol>\n<p>");

  return html.trim();
}

/**
 * Validate HTML structure (basic check)
 */
export function isValidHtml(html: string): boolean {
  // Count opening and closing tags
  const openTags = (html.match(/<[^/>]+>/g) || []).length;
  const closeTags = (html.match(/<\/[^>]+>/g) || []).length;

  return openTags === closeTags && html.trim().length > 0;
}

/**
 * Get character count for HTML (useful for validation)
 */
export function getHtmlCharCount(html: string): number {
  return html.length;
}
