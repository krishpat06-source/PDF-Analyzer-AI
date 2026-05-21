let transformersModule: any = null;
let extractor: any = null;

async function loadTransformers() {
  if (transformersModule) return transformersModule;
  
  // Dynamically import transformers to prevent import-time network/WASM initialisation errors
  transformersModule = await import('@huggingface/transformers');
  
  if (typeof window !== 'undefined') {
    transformersModule.env.allowLocalModels = false;
    const onnx = transformersModule.env.backends?.onnx;
    if (onnx && 'wasm' in onnx && onnx.wasm) {
      (onnx.wasm as any).wasmPaths = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers/dist/';
    }
  }
  return transformersModule;
}

export async function getEmbeddingModel(progressCallback?: (message: string) => void) {
  if (extractor) return extractor;

  if (progressCallback) {
    progressCallback("Initializing embedding pipeline...");
  }

  const { pipeline } = await loadTransformers();

  extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
    progress_callback: (data: any) => {
      if (data.status === 'progress' && progressCallback) {
        const pct = Math.round((data.loaded / data.total) * 100);
        progressCallback(`Downloading model files: ${pct}%`);
      } else if (data.status === 'ready' && progressCallback) {
        progressCallback("Embedding model loaded successfully.");
      }
    }
  });

  return extractor;
}

export async function generateEmbedding(text: string, model: any): Promise<number[]> {
  // Generate embeddings with mean pooling and normalization
  const output = await model(text, { pooling: 'mean', normalize: true });
  // The output is a tensor, we convert it to a standard JS array
  return Array.from(output.data) as number[];
}

export function calculateCosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  
  if (vecA.length !== vecB.length) {
    return 0;
  }
  
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
