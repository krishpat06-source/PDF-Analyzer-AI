import Tesseract from 'tesseract.js';

/**
 * Runs OCR on a canvas element using Tesseract.js.
 * @param canvas - The HTMLCanvasElement to perform OCR on.
 * @returns A promise that resolves to the recognized text.
 */
export async function ocrCanvas(canvas: HTMLCanvasElement): Promise<string> {
  try {
    const result = await Tesseract.recognize(canvas, 'eng', {
      logger: (m) => console.log('OCR progress:', m.status, Math.round(m.progress * 100) + '%'),
    });
    return result.data.text.trim();
  } catch (error) {
    console.error("Tesseract OCR error:", error);
    return "";
  }
}
