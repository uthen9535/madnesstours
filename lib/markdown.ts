function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderMarkdown(markdown: string): string {
  const lines = markdown.split("\n");
  const htmlLines: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (!line.trim()) {
      htmlLines.push("<br />");
      continue;
    }

    if (line.startsWith("### ")) {
      htmlLines.push(`<h3>${escapeHtml(line.slice(4))}</h3>`);
      continue;
    }

    if (line.startsWith("## ")) {
      htmlLines.push(`<h2>${escapeHtml(line.slice(3))}</h2>`);
      continue;
    }

    if (line.startsWith("# ")) {
      htmlLines.push(`<h1>${escapeHtml(line.slice(2))}</h1>`);
      continue;
    }

    htmlLines.push(`<p>${escapeHtml(line)}</p>`);
  }

  return htmlLines.join("\n");
}
