import {
  isOllamaEnabled,
  ollamaGenerate,
} from '../ai/ollama-client.js';

export async function extractTextFromImage(
  imageBase64: string,
): Promise<string> {
  if (!isOllamaEnabled()) {
    throw new Error('Ollama AI features are not enabled');
  }

  const result = await ollamaGenerate(
    'Extract all text from this document image. Return the raw text content.',
    {
      model: 'llama3.2-vision',
      temperature: 0.1,
      images: [imageBase64],
    },
  );

  return result.trim();
}

export async function extractTextFromPdf(
  _pdfBuffer: Buffer,
): Promise<string> {
  // PDF text extraction stub - requires pdf-parse or similar library
  // For now, return a message indicating PDF OCR is not yet supported
  return 'PDF text extraction not yet supported. Please convert to image format for OCR.';
}
