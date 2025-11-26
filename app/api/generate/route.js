import puppeteer from "puppeteer";
import { NextResponse } from "next/server";

// --- Constants & Configuration ---
const PX_PER_IN = 96;
const MAX_PAGE_IN = 199;
const MAX_PAGE_PX = MAX_PAGE_IN * PX_PER_IN;

// iPhone 13 Emulation
const iPhone13 = {
  name: "iPhone 13",
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) " +
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
  viewport: {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    isLandscape: false,
  },
};

// --- Helpers ---
function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function linkify(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, (url) => {
    return `<a href="${url}" style="color: blue; text-decoration: underline; word-break: break-all;">${url}</a>`;
  });
}

async function getPageHeight(page) {
  return await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    const height = Math.max(
      body.scrollHeight,
      body.offsetHeight,
      html.clientHeight,
      html.scrollHeight,
      html.offsetHeight
    );
    return Math.ceil(height) + 1;
  });
}

async function preparePageForPrint(page) {
  await page.addStyleTag({
    content: `
      html, body { margin: 0 !important; padding: 0 !important; overflow: hidden !important; min-height: 100vh !important; }
      ::-webkit-scrollbar { display: none; }
    `,
  });
}

async function waitForRenderSettled(page) {
  // Simple wait to ensure fonts and layout settle
  try { await page.waitForFunction('document.readyState === "complete"', { timeout: 3000 }); } catch {}
  await new Promise((r) => setTimeout(r, 500));
}

async function loadContent(page, target, isHtml) {
  if (isHtml) {
    const safeText = escapeHtml(target);
    const linkedText = linkify(safeText);

    await page.setContent(`
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          #txt-container {
            white-space: pre-wrap; word-wrap: break-word; font-family: "Consolas", monospace; 
            font-size: 12px; line-height: 16px; color: #333; padding: 40px; width: 100%; box-sizing: border-box;
          }
          a { color: blue !important; text-decoration: underline !important; }
        </style>
      </head>
      <body><pre id="txt-container"></pre></body>
      </html>
    `);
    
    await page.evaluate((html) => {
      document.getElementById("txt-container").innerHTML = html;
    }, linkedText);
  } else {
    // 60s timeout for heavier webpages
    await page.goto(target, { waitUntil: "networkidle0", timeout: 60000 });
  }
}

// --- PDF Generators ---

async function generateDesktopPDF(browser, content, isHtml) {
  const page = await browser.newPage();
  await page.setViewport({ width: 640, height: 800 });
  
  await loadContent(page, content, isHtml);
  await preparePageForPrint(page);
  await waitForRenderSettled(page);
  
  const fullHeight = await getPageHeight(page);

  const pdfBuffer = await page.pdf({
    printBackground: true,
    width: "640px",
    height: `${fullHeight}px`,
    preferCSSPageSize: false,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
  });
  
  await page.close();
  return pdfBuffer;
}

async function generateMobilePDF(browser, content, isHtml) {
  const page = await browser.newPage();
  await page.emulate(iPhone13);
  
  await loadContent(page, content, isHtml);
  await preparePageForPrint(page);
  await waitForRenderSettled(page);

  const fullHeight = await getPageHeight(page);
  const cssWidth = page.viewport().width;
  
  // Logic to split pages if they are absurdly long (approx 200 inches)
  const needsScale = fullHeight > MAX_PAGE_PX;
  const scale = needsScale ? MAX_PAGE_PX / fullHeight : 1;
  const outHeight = needsScale ? MAX_PAGE_PX : fullHeight;

  const pdfBuffer = await page.pdf({
    printBackground: true,
    width: `${cssWidth}px`,
    height: `${outHeight}px`,
    scale: scale / 1.05, // Slight shrink to prevent cutoff
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: false,
  });

  await page.close();
  return pdfBuffer;
}

// --- API Handler ---

export async function POST(req) {
  let browser;
  try {
    const body = await req.json();
    const { mode, type, content } = body; 

    if (!content) return NextResponse.json({ error: "Content missing" }, { status: 400 });

    // Launch settings (Must include args for Docker compatibility)
    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    let pdfBuffer;
    const isHtml = type === "text"; // If type is 'text', we treat content as HTML/String

    if (mode === "mobile") {
      pdfBuffer = await generateMobilePDF(browser, content, isHtml);
    } else {
      pdfBuffer = await generateDesktopPDF(browser, content, isHtml);
    }

    // Return the Buffer
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        // The frontend handles naming, but this is a good fallback
        "Content-Disposition": `attachment; filename="generated.pdf"`,
      },
    });

  } catch (error) {
    console.error("Puppeteer Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}