import OpenAI from "openai";
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function embedTexts(texts = []) {
  if (!texts.length) return [];
  const res = await openai.embeddings.create({
    model: "text-embedding-3-small",
    input: texts
  });
  return res.data.map(d => d.embedding);
}