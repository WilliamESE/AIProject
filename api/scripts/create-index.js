import 'dotenv/config';
import { Pinecone } from '@pinecone-database/pinecone';

const name = "ai-project";
const pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY });

(async () => {
    // text-embedding-3-small = 1536 dims (OpenAI)
    const dimension = 1536;

    // Create if missing
    const indexes = await pc.listIndexes();
    const exists = indexes.indexes?.some(i => i.name === name);
    if (!exists) {
        await pc.createIndex({
            name,
            dimension,
            metric: 'cosine',
            spec: { serverless: { cloud: 'aws', region: 'us-east-1' } } // adjust if needed
        });
        console.log(`Created index '${name}'.`);
    } else {
        console.log(`Index '${name}' already exists.`);
    }
})();
