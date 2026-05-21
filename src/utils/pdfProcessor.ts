import * as pdfjsLib from 'pdfjs-dist';

// Configure the worker source using a CDN for Next.js client-side execution safety
if (typeof window !== 'undefined') {
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
}

export interface PDFPageInfo {
  pageNum: number;
  text: string;
  hasImages: boolean;
  pageRef: any;
}

export async function getPdfTextAndPages(pdfBytes: Uint8Array): Promise<{
  text: string;
  totalPages: number;
  pages: PDFPageInfo[];
}> {
  // Use getDocument from pdfjsLib
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes });
  const doc = await loadingTask.promise;
  const totalPages = doc.numPages;
  let fullText = "";
  const pages: PDFPageInfo[] = [];

  for (let i = 1; i <= totalPages; i++) {
    const page = await doc.getPage(i);
    const textContent = await page.getTextContent();
    let pageText = textContent.items
      .map((item: any) => ('str' in item ? item.str : ''))
      .join(" ")
      .replace(/\s+/g, ' ')
      .trim();

    // Detect image operators to check for diagram/image presence
    let hasImages = false;
    try {
      const ops = await page.getOperatorList();
      const imageOps = ops.fnArray.filter(
        (fn) =>
          fn === pdfjsLib.OPS.paintImageXObject ||
          fn === pdfjsLib.OPS.paintInlineImageXObject ||
          fn === pdfjsLib.OPS.paintInlineImageXObjectGroup ||
          fn === pdfjsLib.OPS.paintImageMaskXObject ||
          fn === pdfjsLib.OPS.paintImageMaskXObjectGroup
      );
      hasImages = imageOps.length > 0;
    } catch (e) {
      console.warn("Failed to retrieve operator list for page", i, e);
    }

    pages.push({
      pageNum: i,
      text: pageText,
      hasImages,
      pageRef: page,
    });

    fullText += pageText + "\n";
  }

  return { text: fullText, totalPages, pages };
}

export async function renderPageToCanvas(page: any, scale = 1.5): Promise<HTMLCanvasElement> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Could not get canvas 2D context");

  canvas.width = viewport.width;
  canvas.height = viewport.height;

  const renderContext = {
    canvasContext: context,
    viewport: viewport,
  };

  await page.render(renderContext).promise;
  return canvas;
}
