'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  FileText,
  Upload,
  Sparkles,
  TrendingUp,
  BookOpen,
  HelpCircle,
  Folder,
  Key,
  Download,
  Search,
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  Clock
} from 'lucide-react';

import { getPdfTextAndPages, renderPageToCanvas } from '../utils/pdfProcessor';
import { ocrCanvas } from '../utils/ocrProcessor';
import { getEmbeddingModel, generateEmbedding, calculateCosineSimilarity } from '../utils/semanticSearch';
import { exportSummaryPDF } from '../utils/pdfExporter';

// Simple count up component for statistics cards
function CountUp({ end, duration = 1000 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let start = 0;
    if (end === 0) {
      setCount(0);
      return;
    }
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easeOutQuad = progress * (2 - progress);
      const currentCount = Math.floor(easeOutQuad * end);

      setCount(currentCount);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(end);
      }
    };

    requestAnimationFrame(animate);
  }, [end, duration]);

  return <span>{count}</span>;
}

interface ReferenceChunk {
  index: number;
  score: number;
  text: string;
}

interface ProcessedData {
  text: string;
  totalPages: number;
  cleanSentences: string[];
  keywordList: string[];
  uniqueKeywordsCount: number;
  cleanChunks: string[];
  chunkEmbeddings: number[][];
}

export default function Dashboard() {
  // File upload state
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const subFileInputRef = useRef<HTMLInputElement>(null);

  // Processing state
  const [processing, setProcessing] = useState(false);
  const [activeStep, setActiveStep] = useState(1); // 1 = PDF, 2 = AI Insights, 3 = Finalizing
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressMessage, setProgressMessage] = useState("Initializing PDF analysis...");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Processed data state
  const [data, setData] = useState<ProcessedData | null>(null);

  // Dashboard state
  const [activeTab, setActiveTab] = useState<'summary' | 'qna' | 'search'>('summary');

  // Q&A Tab state
  const [qaInput, setQaInput] = useState("");
  const [isAnswering, setIsAnswering] = useState(false);
  const [aiAnswer, setAiAnswer] = useState("");
  const [references, setReferences] = useState<ReferenceChunk[]>([]);
  const [model, setModel] = useState<any>(null);

  // Search Tab state
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<string[]>([]);

  // Auto mock file loading for automated E2E browser testing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('mock') === 'true') {
        setProgressPercent(5);
        setProgressMessage("Fetching test_notes.pdf...");
        fetch('/test_notes.pdf')
          .then((res) => {
            if (res.ok) return res.arrayBuffer();
            throw new Error("test_notes.pdf file not found in public folder");
          })
          .then((ab) => {
            const fileObj = new File([ab], "test_notes.pdf", { type: "application/pdf" });
            setFile(fileObj);
            processFile(fileObj);
          })
          .catch((err) => {
            console.warn("Could not retrieve mock file, fallback to simulated data:", err);
            simulateMockData();
          });
      }
    }
  }, []);

  // Utility to split text into chunks
  const chunkText = (text: string, chunkSize = 500, overlap = 100): string[] => {
    const cleanedText = text.replace(/\s+/g, ' ').trim();
    const sentences = cleanedText.split(/(?<=[.!?])\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const sentence of sentences) {
      const trimmed = sentence.trim();
      if (!trimmed) continue;
      if (trimmed.length < 10 && /^\d+$/.test(trimmed)) continue;

      currentChunk.push(trimmed);
      currentLength += trimmed.length + 1;

      if (currentLength >= chunkSize) {
        chunks.push(currentChunk.join(" "));
        if (currentChunk.length > 2) {
          currentChunk = currentChunk.slice(-2);
          currentLength = currentChunk.reduce((acc, s) => acc + s.length + 1, 0);
        } else if (currentChunk.length > 1) {
          currentChunk = currentChunk.slice(-1);
          currentLength = currentChunk[0].length + 1;
        } else {
          currentChunk = [];
          currentLength = 0;
        }
      }
    }

    if (currentChunk.length > 0) {
      const chunkContent = currentChunk.join(" ");
      if (chunkContent.length > 30) {
        chunks.push(chunkContent);
      }
    }

    if (chunks.length === 0 && cleanedText) {
      chunks.push(cleanedText.substring(0, 1000));
    }

    return chunks;
  };

  // Keyword extraction
  const extractKeywords = (text: string) => {
    const words = text.toLowerCase().match(/\b[a-z]{4,}\b/g) || [];
    const uniqueKeywordsCount = new Set(words).size;
    const stopWords = new Set([
      "with", "about", "their", "would", "could", "should", "there", "these",
      "those", "under", "which", "where", "while", "this", "that", "from",
      "each", "other", "them", "then", "than", "were", "been", "have", "here",
      "some", "only", "more", "very", "also", "your", "they", "will", "what"
    ]);

    const frequencyMap: Record<string, number> = {};
    words.forEach(word => {
      if (!stopWords.has(word)) {
        frequencyMap[word] = (frequencyMap[word] || 0) + 1;
      }
    });

    const sortedWords = Object.entries(frequencyMap)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(entry => entry[0]);

    return {
      keywordList: sortedWords,
      uniqueKeywordsCount
    };
  };

  // Simulation fallback for mock tests
  const simulateMockData = () => {
    setProcessing(true);
    setActiveStep(1);
    setProgressPercent(10);
    setProgressMessage("Reading PDF contents...");

    setTimeout(() => {
      setProgressPercent(40);
      setActiveStep(2);
      setProgressMessage("Generating AI Insights...");

      setTimeout(() => {
        setProgressPercent(75);
        setActiveStep(3);
        setProgressMessage("Finalizing embeddings...");

        setTimeout(() => {
          const mockText = "Computer Networks study notes. A computer network is a set of computers sharing resources located on or provided by network nodes. The computers use common communication protocols over digital interconnections to communicate with each other. These interconnections are made up of telecommunication network technologies, based on physically wired, optical, and wireless radio-frequency methods that may be arranged in a variety of network topologies. The transmission control protocol (TCP) is one of the main protocols of the Internet protocol suite. It originated in the initial network implementation in which it complemented the Internet Protocol. Therefore, the entire suite is commonly referred to as TCP/IP. TCP provides reliable, ordered, and error-checked delivery of a stream of octets (bytes) between applications running on hosts communicating via an IP network. Routing protocols direct network traffic. A routing protocol specifies how routers communicate with each other, disseminating information that enables them to select routes between any two nodes on a computer network. Routing algorithms determine the specific choice of route. Each router has a prior knowledge only of networks attached to it directly. Machine learning models run on network databases. Neural networks are models of biological neurons.";
          const chunks = chunkText(mockText);
          const { keywordList, uniqueKeywordsCount } = extractKeywords(mockText);

          const sentenceArray = mockText.split(/(?<=[.!?])\s+/);
          const cleanSentences = sentenceArray.filter(s => s.length > 20);

          // Simulated embeddings
          const chunkEmbeddings = chunks.map(() => Array.from({ length: 384 }, () => Math.random() - 0.5));

          setData({
            text: mockText,
            totalPages: 4,
            cleanSentences,
            keywordList,
            uniqueKeywordsCount,
            cleanChunks: chunks,
            chunkEmbeddings
          });

          setSuccessMsg("✨ Simulated PDF notes uploaded and analyzed successfully!");
          setProgressPercent(100);
          setProcessing(false);
        }, 1000);
      }, 1000);
    }, 1000);
  };

  // Process selected file
  const processFile = async (uploadedFile: File) => {
    setProcessing(true);
    setErrorMsg("");
    setSuccessMsg("");
    setActiveStep(1);
    setProgressPercent(5);
    setProgressMessage("Loading PDF parser...");

    try {
      const fileReader = new FileReader();

      fileReader.onload = async (e) => {
        try {
          if (!e.target?.result) {
            throw new Error("Failed to read file target content");
          }

          const arrayBuffer = e.target.result as ArrayBuffer;
          const bytes = new Uint8Array(arrayBuffer);

          setProgressPercent(15);
          setProgressMessage("Analyzing PDF pages and extracting text...");

          const { text: extractedText, totalPages, pages } = await getPdfTextAndPages(bytes);

          // OCR Handling for empty pages and diagrams
          let fullTextCombined = "";
          let ocrCount = 0;

          for (let i = 0; i < pages.length; i++) {
            const pageInfo = pages[i];
            let pageText = pageInfo.text;

            const percentage = Math.round(15 + (i / pages.length) * 25);
            setProgressPercent(percentage);
            setProgressMessage(`Parsing page ${i + 1}/${totalPages}...`);

            // Page is scanned or has very little text
            if (pageText.length < 50) {
              setProgressMessage(`Page ${i + 1} appears to be scanned. Running OCR...`);
              const canvas = await renderPageToCanvas(pageInfo.pageRef, 1.5);
              const ocrText = await ocrCanvas(canvas);
              if (ocrText) {
                pageText += " " + ocrText;
              }
            }
            // Page has text, but check for drawings/images
            else if (pageInfo.hasImages && ocrCount < 3) {
              ocrCount++;
              setProgressMessage(`Extracting text from embedded diagrams on page ${i + 1}...`);
              const canvas = await renderPageToCanvas(pageInfo.pageRef, 1.5);
              const ocrText = await ocrCanvas(canvas);
              if (ocrText) {
                pageText += "\n[Diagram/Image Content]: " + ocrText;
              }
            }

            fullTextCombined += pageText + "\n";
            // Allow thread yielding
            await new Promise(resolve => setTimeout(resolve, 50));
          }

          // Stage 2: AI Insights
          setProgressPercent(45);
          setActiveStep(2);
          setProgressMessage("Generating AI Insights, keywords, and text chunks...");

          const textCleaned = fullTextCombined.replace(/\s+/g, " ");
          const sentenceArray = textCleaned.split(/(?<=[.!?])\s+/);
          const cleanSentences = sentenceArray
            .map(s => s.trim())
            .filter(s => s.length > 30 && s.length < 400);

          const { keywordList, uniqueKeywordsCount } = extractKeywords(fullTextCombined);
          const chunks = chunkText(fullTextCombined);

          // Stage 3: Embedding generation
          setProgressPercent(60);
          setActiveStep(3);
          setProgressMessage("Loading client-side embedding model...");

          try {
            // Load Hugging Face embedding model
            const embeddingModel = await getEmbeddingModel((msg) => {
              setProgressMessage(msg);
            });
            setModel(embeddingModel);

            // Generate embeddings for each chunk
            const chunkEmbeddings: number[][] = [];
            for (let c = 0; c < chunks.length; c++) {
              const embedPercent = Math.round(65 + (c / chunks.length) * 30);
              setProgressPercent(embedPercent);
              setProgressMessage(`Generating embeddings for chunk ${c + 1}/${chunks.length}...`);

              const embedding = await generateEmbedding(chunks[c], embeddingModel);
              chunkEmbeddings.push(embedding);

              // Yield thread to keep UI interactive
              await new Promise(resolve => setTimeout(resolve, 10));
            }

            // Store results
            setData({
              text: fullTextCombined,
              totalPages,
              cleanSentences,
              keywordList,
              uniqueKeywordsCount,
              cleanChunks: chunks,
              chunkEmbeddings
            });

            setSuccessMsg("✨ PDF uploaded and analyzed successfully!");
          } catch (modelError) {
            console.warn("Could not load embedding model, falling back to local keyword indexing:", modelError);
            setData({
              text: fullTextCombined,
              totalPages,
              cleanSentences,
              keywordList,
              uniqueKeywordsCount,
              cleanChunks: chunks,
              chunkEmbeddings: [] // Empty embeddings indicates fallback mode
            });
            setSuccessMsg("✨ PDF loaded successfully (running in offline keyword-matching mode)!");
          }
          setProgressPercent(100);
          setProcessing(false);

        } catch (error: any) {
          console.error("Processing inner error:", error);
          setErrorMsg(error?.message || "Error reading or compiling PDF content.");
          setProcessing(false);
        }
      };

      fileReader.onerror = () => {
        setErrorMsg("Failed to read the file upload stream.");
        setProcessing(false);
      };

      fileReader.readAsArrayBuffer(uploadedFile);

    } catch (e: any) {
      console.error("Outer error:", e);
      setErrorMsg(e?.message || "An unexpected error occurred during analysis.");
      setProcessing(false);
    }
  };

  // File selection triggers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const selectedFile = e.target.files[0];
      if (selectedFile.type !== "application/pdf") {
        setErrorMsg("Invalid file type. Please select a PDF file.");
        return;
      }
      setFile(selectedFile);
      processFile(selectedFile);
    }
  };

  // Drag and Drop triggers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.type !== "application/pdf") {
        setErrorMsg("Invalid file type. Please upload a PDF file.");
        return;
      }
      setFile(droppedFile);
      processFile(droppedFile);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const triggerSubFileInput = () => {
    subFileInputRef.current?.click();
  };

  // Handle Q&A submissions
  const handleQASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qaInput.trim() || !data) return;

    setIsAnswering(true);
    setAiAnswer("");
    setReferences([]);

    // Check if we should use fallback keyword search (either because embeddings are empty, or model failed to load)
    if (!data.chunkEmbeddings || data.chunkEmbeddings.length === 0) {
      try {
        // Fallback Q&A search using simple term-frequency matching
        const queryTerms = qaInput.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        const stopWords = new Set(["the", "and", "for", "with", "about", "this", "that", "from", "each", "other", "them", "then", "than", "were", "have", "here"]);
        const filteredTerms = queryTerms.filter(t => !stopWords.has(t));

        if (filteredTerms.length === 0) {
          setAiAnswer("Please ask a more specific question with more keywords.");
          setIsAnswering(false);
          return;
        }

        const matches = data.cleanChunks.map((chunk, idx) => {
          let score = 0;
          const chunkLower = chunk.toLowerCase();
          filteredTerms.forEach(term => {
            if (chunkLower.includes(term)) {
              // Add score proportional to keyword presence
              score += 1.0;
              // Bonus for exact boundary matching
              const reg = new RegExp(`\\b${term}\\b`, 'g');
              const count = (chunkLower.match(reg) || []).length;
              score += count * 0.5;
            }
          });
          // Normalize score by log of chunk length to not favor extremely long chunks excessively
          score = score / Math.log(chunk.length + 1);
          return { chunk, score, index: idx };
        });

        // Filter and sort matches
        const validMatches = matches
          .filter(item => item.score > 0.05)
          .sort((a, b) => b.score - a.score);

        if (validMatches.length === 0) {
          setAiAnswer("I could not find any sections matching your question keywords.");
          setIsAnswering(false);
          return;
        }

        // Take top 5
        const topMatches = validMatches.slice(0, 5);
        const chronological = [...topMatches].sort((a, b) => a.index - b.index);
        const combined = chronological.map(item => item.chunk).join(" ... ");

        setAiAnswer(combined);
        setReferences(topMatches.map(item => ({
          index: item.index,
          score: Math.min(1.0, item.score), // normalize visual score
          text: item.chunk
        })));
      } catch (err) {
        console.error("Fallback Q&A error:", err);
        setAiAnswer("An error occurred during local search indexing.");
      } finally {
        setIsAnswering(false);
      }
      return;
    }

    try {
      let activeModel = model;
      if (!activeModel) {
        setProgressMessage("Re-initializing AI model...");
        activeModel = await getEmbeddingModel();
        setModel(activeModel);
      }

      // Generate question embedding
      const questionEmb = await generateEmbedding(qaInput, activeModel);

      // Compare question with chunk embeddings
      const matches = data.cleanChunks.map((chunk, idx) => {
        const score = calculateCosineSimilarity(questionEmb, data.chunkEmbeddings[idx]);
        return { chunk, score, index: idx };
      });

      // Filter matches with similarity > 0.3
      const validMatches = matches
        .filter(item => item.score > 0.30)
        .sort((a, b) => b.score - a.score);

      if (validMatches.length === 0) {
        setAiAnswer("I could not find a confident answer in the uploaded document.");
        setIsAnswering(false);
        return;
      }

      // Take top 5
      const topMatches = validMatches.slice(0, 5);

      // Re-order top matches chronologically (by their original index)
      const chronological = [...topMatches].sort((a, b) => a.index - b.index);
      const combined = chronological.map(item => item.chunk).join(" ... ");

      setAiAnswer(combined);
      setReferences(topMatches.map(item => ({
        index: item.index,
        score: item.score,
        text: item.chunk
      })));

    } catch (err) {
      console.error("Q&A answer extraction error:", err);
      // Try falling back to keyword search on query error
      try {
        const queryTerms = qaInput.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];
        const stopWords = new Set(["the", "and", "for", "with", "about", "this", "that", "from", "each", "other", "them", "then", "than", "were", "have", "here"]);
        const filteredTerms = queryTerms.filter(t => !stopWords.has(t));
        if (filteredTerms.length > 0) {
          const matches = data.cleanChunks.map((chunk, idx) => {
            let score = 0;
            const chunkLower = chunk.toLowerCase();
            filteredTerms.forEach(term => {
              if (chunkLower.includes(term)) {
                score += 1.0;
                const reg = new RegExp(`\\b${term}\\b`, 'g');
                const count = (chunkLower.match(reg) || []).length;
                score += count * 0.5;
              }
            });
            score = score / Math.log(chunk.length + 1);
            return { chunk, score, index: idx };
          });
          const validMatches = matches
            .filter(item => item.score > 0.05)
            .sort((a, b) => b.score - a.score);
          if (validMatches.length > 0) {
            const topMatches = validMatches.slice(0, 5);
            const chronological = [...topMatches].sort((a, b) => a.index - b.index);
            const combined = chronological.map(item => item.chunk).join(" ... ");
            setAiAnswer(combined);
            setReferences(topMatches.map(item => ({
              index: item.index,
              score: Math.min(1.0, item.score),
              text: item.chunk
            })));
            return;
          }
        }
      } catch (innerErr) {
        console.error("Nested fallback Q&A error:", innerErr);
      }
      setAiAnswer("An error occurred during AI search indexing.");
    } finally {
      setIsAnswering(false);
    }
  };

  // Handle Keyword Search change
  useEffect(() => {
    if (!searchInput.trim() || !data) {
      setSearchResults([]);
      return;
    }

    const keyword = searchInput.toLowerCase();
    const matches = data.cleanSentences.filter(s =>
      s.toLowerCase().includes(keyword)
    );
    setSearchResults(matches);
  }, [searchInput, data]);

  // Utility to highlight keyword in search results
  const highlightMatchText = (sentence: string, highlight: string) => {
    if (!highlight.trim()) return sentence;

    const escaped = highlight.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    const parts = sentence.split(regex);

    return (
      <>
        {parts.map((part, index) =>
          part.toLowerCase() === highlight.toLowerCase() ? (
            <mark key={index} style={{ backgroundColor: '#F59E0B', color: '#000000', borderRadius: '2px', padding: '0 2px' }}>
              {part}
            </mark>
          ) : (
            part
          )
        )}
      </>
    );
  };

  // Download PDF summary handler
  const handleDownloadPDF = () => {
    if (!data) return;
    const docSummarySentences = data.cleanSentences.slice(0, 8);
    exportSummaryPDF(docSummarySentences, `${file?.name.replace('.pdf', '') || 'notes'}_summary.pdf`);
  };

  // Exam generation triggers
  const questionStarters = ["Explain", "Define", "Discuss", "Write short note on", "Describe"];

  return (
    <div>
      {/* 1. LANDING PAGE STATE */}
      {!file && !processing && (
        <>
          {/* Hero Section */}
          <section className="hero-section">
            <h1 className="hero-title">Analyze Your PDF with AI</h1>
            <p className="hero-subtitle">
              Unlock deep insights, instant summaries, and auto-generated exam questions from any document.
              Powered by advanced intelligence for unparalleled precision.
            </p>
          </section>

          {/* Uploader Box */}
          <div
            className="custom-uploader-container"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input
              type="file"
              accept="application/pdf"
              className="hidden-file-input"
              onChange={handleFileChange}
              ref={fileInputRef}
            />
            <div className="custom-uploader-placeholder">
              <div className="upload-icon-circle">
                <Upload size={24} color="#818CF8" />
              </div>
              <div className="upload-text">Drag & Drop your PDF here</div>
              <div className="upload-subtext">or click to browse from your computer</div>
              <div className="upload-badges">
                <span className="badge">Max size: 50MB</span>
                <span className="badge">Formats: .pdf</span>
              </div>
            </div>
          </div>

          {/* Features Section */}
          <section className="features-section" id="features">
            <div className="feature-card">
              <div className="card-icon-wrapper purple-glow">
                <Sparkles size={20} />
              </div>
              <h3 className="card-title">Instant Summaries</h3>
              <p className="card-description">Distill hundreds of pages into concise, actionable briefs in seconds.</p>
            </div>

            <div className="feature-card">
              <div className="card-icon-wrapper blue-glow">
                <TrendingUp size={20} />
              </div>
              <h3 className="card-title">Deep Insights</h3>
              <p className="card-description">Extract critical data points, keywords, and hidden semantic relationships.</p>
            </div>

            <div className="feature-card">
              <div className="card-icon-wrapper pink-glow">
                <BookOpen size={20} />
              </div>
              <h3 className="card-title">Exam Generation</h3>
              <p className="card-description">Automatically create quizzes and study materials from academic texts.</p>
            </div>
          </section>

          {/* About Section */}
          <section className="about-section" id="about-section">
            <div className="about-line"></div>
            <h2 className="about-title">About PDF Analyzer AI</h2>
            <p className="about-text">
              PDF Analyzer AI is an intelligent document analysis platform that helps users upload PDFs and instantly
              generate summaries, extract important keywords, create possible exam questions, and ask AI-powered questions
              directly from the document. Designed to make studying and document understanding faster, smarter, and more efficient.
            </p>
          </section>
        </>
      )}

      {/* 2. LOADING STATE */}
      {processing && (
        <div className="loader-container">
          <div className="loader-title">
            <svg
              className="spin-loader"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#818CF8"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"></path>
            </svg>
            <span>Analyzing Document with AI</span>
          </div>

          <div className="loader-steps">
            <div className={`loader-step ${activeStep > 1 ? 'step-done' : activeStep === 1 ? 'step-active' : 'step-pending'}`}>
              <div className="step-dot">
                {activeStep > 1 ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <span style={{ fontFamily: 'Outfit', fontSize: '0.75rem' }}>1</span>
                )}
              </div>
              <div>Analyzing PDF...</div>
            </div>

            <div className={`loader-step ${activeStep > 2 ? 'step-done' : activeStep === 2 ? 'step-active' : 'step-pending'}`}>
              <div className="step-dot">
                {activeStep > 2 ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <span style={{ fontFamily: 'Outfit', fontSize: '0.75rem' }}>2</span>
                )}
              </div>
              <div>Generating AI Insights...</div>
            </div>

            <div className={`loader-step ${activeStep > 3 ? 'step-done' : activeStep === 3 ? 'step-active' : 'step-pending'}`}>
              <div className="step-dot">
                {activeStep > 3 ? (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                ) : (
                  <span style={{ fontFamily: 'Outfit', fontSize: '0.75rem' }}>3</span>
                )}
              </div>
              <div>Finalizing Results...</div>
            </div>
          </div>

          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }}></div>
          </div>
          <div style={{ marginTop: '1rem', color: '#94A3B8', fontSize: '0.85rem', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={14} />
            <span>{progressMessage}</span>
          </div>
        </div>
      )}

      {/* 3. ACTIVE DASHBOARD STATE */}
      {data && !processing && (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>

          {/* Notifications */}
          {successMsg && (
            <div className="success-alert">
              <CheckCircle2 size={20} />
              <span>{successMsg}</span>
            </div>
          )}
          {errorMsg && (
            <div className="error-alert">
              <AlertCircle size={20} />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Stats Bar */}
          <div className="stats-container">
            <div className="stat-card">
              <div className="stat-card-icon-wrapper stat-card-pages">
                <FileText size={20} />
              </div>
              <div>
                <div className="stat-value"><CountUp end={data.totalPages} /></div>
                <div className="stat-label">Pages Analyzed</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon-wrapper stat-card-keywords">
                <Key size={20} />
              </div>
              <div>
                <div className="stat-value"><CountUp end={data.uniqueKeywordsCount} /></div>
                <div className="stat-label">Keywords Found</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon-wrapper stat-card-summary">
                <CheckCircle2 size={20} />
              </div>
              <div>
                <div className="stat-value"><CountUp end={Math.min(8, data.cleanSentences.length)} /></div>
                <div className="stat-label">Summary Points</div>
              </div>
            </div>

            <div className="stat-card">
              <div className="stat-card-icon-wrapper stat-card-exam">
                <HelpCircle size={20} />
              </div>
              <div>
                <div className="stat-value"><CountUp end={Math.min(5, data.keywordList.length)} /></div>
                <div className="stat-label">Exam Questions</div>
              </div>
            </div>
          </div>

          {/* Grid Layout */}
          <div className="dashboard-grid">

            {/* Left Sidebar column */}
            <div>

              {/* Card 1: Current Document */}
              <div className="dashboard-card">
                <h3 className="dashboard-card-title" style={{ color: '#818CF8', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Folder size={18} />
                  <span>Current Document</span>
                </h3>
                <p style={{ color: '#94A3B8', fontSize: '0.85rem', marginBottom: '1.25rem', wordBreak: 'break-all', fontWeight: 500 }}>
                  Active: <strong>{file?.name || 'test_notes.pdf'}</strong>
                </p>
                <div className="sub-uploader" onClick={triggerSubFileInput}>
                  <Upload size={18} color="#94A3B8" style={{ marginBottom: '0.5rem' }} />
                  <div className="sub-uploader-text">Upload a different PDF</div>
                  <input
                    type="file"
                    accept="application/pdf"
                    style={{ display: 'none' }}
                    ref={subFileInputRef}
                    onChange={handleFileChange}
                  />
                </div>
              </div>

              {/* Card 2: Core Keywords */}
              <div className="dashboard-card">
                <h3 className="dashboard-card-title" style={{ color: '#A78BFA', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Key size={18} />
                  <span>Core Keywords</span>
                </h3>
                <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '1rem' }}>
                  Top keywords extracted from notes:
                </p>
                <div className="keyword-tags-container">
                  {data.keywordList.map((word, idx) => (
                    <div key={idx} className="keyword-tag">
                      <span className="keyword-tag-hash">#</span>
                      <span>{word.charAt(0).toUpperCase() + word.slice(1)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Card 3: Export PDF */}
              <div className="dashboard-card">
                <h3 className="dashboard-card-title" style={{ color: '#10B981', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Download size={18} />
                  <span>Export Summary</span>
                </h3>
                <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                  Download a professionally formatted PDF summary of your notes:
                </p>
                <button className="btn-secondary" onClick={handleDownloadPDF}>
                  <Download size={16} />
                  <span>Download Summary as PDF</span>
                </button>
              </div>

            </div>

            {/* Right main column */}
            <div>
              <div className="tabs-header">
                <button
                  className={`tab-button ${activeTab === 'summary' ? 'active' : ''}`}
                  onClick={() => setActiveTab('summary')}
                >
                  📝 Executive Summary
                </button>
                <button
                  className={`tab-button ${activeTab === 'qna' ? 'active' : ''}`}
                  onClick={() => setActiveTab('qna')}
                >
                  💬 Semantic AI Q&A
                </button>
                <button
                  className={`tab-button ${activeTab === 'search' ? 'active' : ''}`}
                  onClick={() => setActiveTab('search')}
                >
                  🔍 Keyword Search
                </button>
              </div>

              {/* TAB 1: Executive Summary */}
              {activeTab === 'summary' && (
                <div>
                  <div className="dashboard-card">
                    <h3 className="dashboard-card-title" style={{ color: '#A78BFA', marginBottom: '1.5rem' }}>Summary Points</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      {data.cleanSentences.slice(0, 8).map((sentence, idx) => (
                        <div key={idx} style={{ lineHeight: 1.6, display: 'flex', gap: '0.75rem' }}>
                          <span style={{ color: '#A78BFA', fontWeight: 'bold', fontSize: '1.1rem' }}>•</span>
                          <div>{sentence}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="dashboard-card">
                    <h3 className="dashboard-card-title" style={{ color: '#F472B6', marginBottom: '1.5rem' }}>Possible Exam Questions</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {data.keywordList.slice(0, 5).map((word, idx) => {
                        const question = `${questionStarters[idx % questionStarters.length]} ${word}`;
                        return (
                          <div
                            key={idx}
                            style={{
                              background: 'rgba(244, 114, 182, 0.03)',
                              border: '1px solid rgba(244, 114, 182, 0.1)',
                              padding: '1rem',
                              borderRadius: '8px',
                              display: 'flex',
                              gap: '0.75rem'
                            }}
                          >
                            <span style={{ color: '#F472B6', fontWeight: 'bold' }}>Q{idx + 1}:</span>
                            <div>{question}?</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: Q&A Tab */}
              {activeTab === 'qna' && (
                <div className="dashboard-card">
                  <h3 className="dashboard-card-title" style={{ color: '#60A5FA' }}>Semantic Q&A Assistant</h3>
                  <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Ask any question about your document, and our AI will retrieve the most relevant sections using vector embeddings:
                  </p>

                  <form onSubmit={handleQASubmit} className="input-group">
                    <label htmlFor="qa_input" className="input-label">Ask anything from your notes</label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <input
                        id="qa_input"
                        type="text"
                        className="text-input"
                        placeholder="e.g. What are the key findings or main definitions?"
                        value={qaInput}
                        onChange={(e) => setQaInput(e.target.value)}
                        disabled={isAnswering}
                      />
                      <button
                        type="submit"
                        className="btn-primary"
                        style={{ width: 'auto', whiteSpace: 'nowrap' }}
                        disabled={isAnswering || !qaInput.trim()}
                      >
                        {isAnswering ? (
                          <>
                            <svg className="spin-loader" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="2" x2="12" y2="6"></line>
                              <line x1="12" y1="18" x2="12" y2="22"></line>
                              <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                              <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                              <line x1="2" y1="12" x2="6" y2="12"></line>
                              <line x1="18" y1="12" x2="22" y2="12"></line>
                              <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                              <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                            </svg>
                            <span>Searching...</span>
                          </>
                        ) : (
                          <>
                            <MessageSquare size={16} />
                            <span>Ask AI</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>

                  {/* AI Response Card */}
                  {aiAnswer && (
                    <div className="ai-answer-card">
                      <div className="ai-answer-header">
                        <div className="ai-answer-glow-bar"></div>
                        <h4 className="ai-answer-title">AI Answer</h4>
                      </div>
                      <p className="ai-answer-text">{aiAnswer}</p>

                      <hr className="ai-answer-divider" />

                      <h5 className="ai-references-title">Retrieved Reference Chunks:</h5>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {references.map((ref, idx) => (
                          <div key={idx} className="reference-chunk-card">
                            <div className="reference-chunk-header">
                              <span className="reference-chunk-index">Source Chunk #{ref.index + 1}</span>
                              <span className="reference-chunk-score">Match: {Math.round(ref.score * 100)}%</span>
                            </div>
                            <p className="reference-chunk-text">&ldquo;{ref.text.substring(0, 250)}...&rdquo;</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: Keyword Search */}
              {activeTab === 'search' && (
                <div className="dashboard-card">
                  <h3 className="dashboard-card-title" style={{ color: '#38BDF8' }}>Keyword Search</h3>
                  <p style={{ color: '#64748B', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
                    Find occurrences of specific words or phrases in the document:
                  </p>

                  <div className="input-group">
                    <label htmlFor="search_input" className="input-label">Type keyword to search</label>
                    <div style={{ position: 'relative' }}>
                      <input
                        id="search_input"
                        type="text"
                        className="text-input"
                        placeholder="e.g. machine learning, database, protocol"
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        style={{ paddingLeft: '2.5rem' }}
                      />
                      <Search size={16} color="#64748B" style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)' }} />
                    </div>
                  </div>

                  {searchInput && (
                    <div>
                      {searchResults.length > 0 ? (
                        <>
                          <div style={{ color: '#34D399', fontSize: '0.9rem', fontWeight: 600, marginBottom: '1rem' }}>
                            {searchResults.length} result(s) found
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {searchResults.slice(0, 5).map((match, idx) => (
                              <div
                                key={idx}
                                style={{
                                  background: 'rgba(255, 255, 255, 0.02)',
                                  border: '1px solid rgba(255, 255, 255, 0.04)',
                                  padding: '1rem',
                                  borderRadius: '8px',
                                  fontSize: '0.95rem',
                                  lineHeight: 1.5
                                }}
                              >
                                {idx + 1}. {highlightMatchText(match, searchInput)}
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div style={{ color: '#EF4444', fontSize: '0.9rem', fontWeight: 600 }}>
                          No matching result found. Try another keyword.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

            </div>
          </div>

        </div>
      )}
    </div>
  );
}
