import { Pinecone } from "@pinecone-database/pinecone";
import { clampInt, chunk, withRetry } from "../utilities.js";

/* ---------- env & client ---------- */

const {
  PINECONE_API_KEY,
  PINECONE_INDEX,
  PINECONE_NAMESPACE, // optional
} = process.env;

if (!PINECONE_API_KEY) {
  throw new Error("Missing PINECONE_API_KEY.");
}
if (!PINECONE_INDEX) {
  throw new Error("Missing PINECONE_INDEX.");
}

const pc = new Pinecone({ apiKey: PINECONE_API_KEY });
const baseIndex = pc.index(PINECONE_INDEX);

/* ---------- functions ---------- */

function getIndexForNamespace(ns) {
  const namespace = (ns ?? PINECONE_NAMESPACE) || undefined;
  return namespace ? baseIndex.namespace(namespace) : baseIndex;
}

/* ---------- public functions ---------- */

/**
 * Upsert vectors in batches with basic retries.
 * @param {Array<{id:string, values:number[], metadata?:object}>} vectors
 * @param {{ namespace?: string }} options
 * @returns {{ upsertedCount:number }}
 */
export async function upsertVectors(vectors = [], options = {}) {
  if (!Array.isArray(vectors) || vectors.length === 0) {
    return { upsertedCount: 0 };
  }

  //Light validation to catch common mistakes early
  for (const [i, v] of vectors.entries()) {
    if (!v?.id || !Array.isArray(v.values) || v.values.length === 0) {
      throw new Error(`Invalid vector at index ${i}`);
    }
  }

  const index = getIndexForNamespace(options.namespace);
  const batches = chunk(vectors, 100); //Pinecone recommends small batches

  let total = 0;
  for (const batch of batches) {
    await withRetry(() => index.upsert(batch), { tries: 3, baseDelayMs: 300 });
    total += batch.length;
  }
  return { upsertedCount: total };
}

/**
 * Query nearest neighbours for a vector.
 * @param {number[]} vector
 * @param {number} topK
 * @param {{ namespace?: string, filter?: object }} options
 * @returns {Array<{score:number, id:string, metadata?:object}>}
 */
export async function queryVector(vector, topK = 8, options = {}) {
  if (!Array.isArray(vector) || vector.length === 0) {
    throw new Error("queryVector: vector must be a number array");
  }

  const k = clampInt(topK, { min: 1, max: 200, fallback: 8 });
  const index = getIndexForNamespace(options.namespace);

  const res = await withRetry(
    () =>
      index.query({
        vector,
        topK: k,
        includeMetadata: true,
        includeValues: false,
        filter: options.filter,
      }),
    { tries: 3, baseDelayMs: 300 }
  );

  return res?.matches || [];
}
