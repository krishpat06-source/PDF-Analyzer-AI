import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/react";
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
        <Analytics />
      </body>
    </html>
  );
}
