export function chunkText(text, maxChars = 1200, overlap = 150) {
  const chunks = [];
  for (let i = 0; i < text.length; i += (maxChars - overlap)) {
    const piece = text.slice(i, i + maxChars).trim();
    if (piece) chunks.push(piece);
  }
  return chunks;
}