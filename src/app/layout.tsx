import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Analyzer AI - Extract Insights, Summaries & Q&A",
  description: "Unlock deep insights, instant summaries, and auto-generated exam questions from any PDF document. Powered by advanced client-side artificial intelligence.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <div className="main-wrapper">
          {/* Custom Navbar (Header) */}
          <header className="custom-navbar">
            <a href="#" className="nav-logo">PDF Analyzer AI</a>
            <nav className="nav-links">
              <a href="#about-section">About</a>
              <a 
                href="https://github.com/krishpat06-source/AI-PDF-Analyzer" 
                target="_blank" 
                rel="noreferrer"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: "middle" }}>
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path>
                </svg>
                GitHub
              </a>
            </nav>
          </header>

          {/* Page Content */}
          <main style={{ flex: 1 }}>
            {children}
          </main>

          {/* Global Footer */}
          <footer className="custom-footer">
            <div className="footer-logo">PDF Analyzer AI</div>
            <div className="footer-links">
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
              <a href="#">Contact Us</a>
              <a href="#">Twitter</a>
              <a href="#">LinkedIn</a>
            </div>
            <div className="footer-copyright">© 2026 PDF Analyzer AI. All rights reserved.</div>
          </footer>
        </div>
      </body>
    </html>
  );
}
