import { jsPDF } from 'jspdf';

/**
 * Compiles a list of summary sentences and exports them as a formatted PDF.
 * @param sentences - The list of summary sentences.
 * @param fileName - The output filename.
 */
export function exportSummaryPDF(sentences: string[], fileName = "summary.pdf"): void {
  const doc = new jsPDF();
  
  // Title section
  doc.setFont("Helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(79, 70, 229); // #4F46E5 Indigo
  doc.text("AI Notes Summary", 20, 25);
  
  // Date subtitle
  doc.setFont("Helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139); // Slate-500
  doc.text(`Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}`, 20, 32);
  
  // Thin decorative separator
  doc.setDrawColor(241, 245, 249); // slate-100
  doc.setLineWidth(0.5);
  doc.line(20, 36, 190, 36);
  
  // Bullet points styling
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42); // slate-900
  
  let yPosition = 45;
  const pageHeight = doc.internal.pageSize.height;
  const marginX = 20;
  const textWidth = 170; // 210 - 20 - 20
  
  sentences.forEach((sentence, index) => {
    const cleanSentence = sentence.trim();
    if (!cleanSentence) return;

    const bulletPrefix = "•   ";
    const fullText = bulletPrefix + cleanSentence;
    
    // Split text into multiple lines for page wrapping
    const lines = doc.splitTextToSize(fullText, textWidth);
    const lineHeight = 7;
    const itemHeight = lines.length * lineHeight;
    
    // Check if we need to wrap to a new page
    if (yPosition + itemHeight > pageHeight - 20) {
      doc.addPage();
      yPosition = 25; // Reset y position for new page
      
      // Header for secondary pages
      doc.setFont("Helvetica", "bold");
      doc.setFontSize(10);
      doc.setTextColor(148, 163, 184); // slate-400
      doc.text("AI Notes Summary (continued)", 20, 15);
      doc.line(20, 18, 190, 18);
      yPosition = 26;
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(11);
      doc.setTextColor(15, 23, 42); // Reset to slate-900
    }
    
    // Render lines. First line is indented with bullet, subsequent lines line up.
    lines.forEach((line: string, lineIndex: number) => {
      if (lineIndex === 0) {
        doc.text(line, marginX, yPosition);
      } else {
        // Indent wrapped lines slightly to align with the bullet text
        doc.text(line, marginX + 6, yPosition);
      }
      yPosition += lineHeight;
    });
    
    yPosition += 3; // spacing between paragraphs
  });
  
  // Trigger file download
  doc.save(fileName);
}
