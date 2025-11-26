"use client";
import { useState } from "react";
import styles from "./page.module.css";

export default function Home() {

  const [webName, setWebName] = useState("");
  const [webUrl, setWebUrl] = useState("");
  
  const [textName, setTextName] = useState("");
  const [textContent, setTextContent] = useState("");

  const [loading, setLoading] = useState(false);

  const downloadSinglePdf = async (mode, type, content, filename) => {
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, type, content }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(`Error generating ${filename}: ${err.error}`);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      return true;
    } catch (error) {
      console.error(error);
      alert(error.message);
      return false;
    }
  };

  const handleGenerate = async (mode) => {
    if (!webUrl && !textContent) {
      alert("Please provide at least a URL or Text content.");
      return;
    }

    setLoading(true);

    try {
      const promises = [];

      if (webUrl) {
        if (!webUrl.startsWith("http")) {
          alert("Web Version: URL must start with http:// or https://");
          setLoading(false); 
          return;
        }
        // Determine filename
        let finalWebName = webName.trim() || "web-version";
        if (mode === "mobile") finalWebName += "_mobile";
        if (!finalWebName.endsWith(".pdf")) finalWebName += ".pdf";
        promises.push(downloadSinglePdf(mode, "url", webUrl, finalWebName));
      }

      if (textContent) {
        let finalTextName = textName.trim() || "text-version";
        if (mode === "mobile") finalTextName += "_mobile";
        if (!finalTextName.endsWith(".pdf")) finalTextName += ".pdf";
        promises.push(downloadSinglePdf(mode, "text", textContent, finalTextName));
      }

      await Promise.all(promises);

    } catch (err) {
      console.error(err);
      alert("An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <h1 className={styles.title}>SFMC PDF Generator</h1>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>1. Web Version</h3>
          
          <label className={styles.label}>PDF Filename:</label>
          <input
            type="text"
            placeholder="e.g., MyCampaign_Web"
            value={webName}
            onChange={(e) => setWebName(e.target.value)}
            className={styles.input}
          />

          <label className={styles.label}>URL to capture:</label>
          <input
            type="text"
            placeholder="https://view.email.com/..."
            value={webUrl}
            onChange={(e) => setWebUrl(e.target.value)}
            className={styles.input}
          />
        </div>

        <div className={styles.section}>
          <h3 className={styles.sectionTitle}>2. Text Version</h3>
          
          <label className={styles.label}>PDF Filename:</label>
          <input
            type="text"
            placeholder="e.g., MyCampaign_Text"
            value={textName}
            onChange={(e) => setTextName(e.target.value)}
            className={styles.input}
          />

          <label className={styles.label}>Paste Text Content:</label>
          <textarea
            rows={6}
            placeholder="Paste the plain text version here..."
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            className={styles.textarea}
          />
        </div>

        <div className={styles.buttonGroup}>
          <button
            onClick={() => handleGenerate("desktop")}
            disabled={loading}
            className={`${styles.button} ${styles.btnDesktop}`}
          >
            {loading ? "Processing..." : "Download DESKTOP PDFs"}
          </button>
          
          <button
            onClick={() => handleGenerate("mobile")}
            disabled={loading}
            className={`${styles.button} ${styles.btnMobile}`}
          >
            {loading ? "Processing..." : "Download MOBILE PDFs"}
          </button>
        </div>
        
        {loading && <p className={styles.loadingText}>Please wait, generating files...</p>}

      </div>
    </div>
  );
}