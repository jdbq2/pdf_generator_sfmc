import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { NextResponse } from "next/server";


const PX_PER_IN = 96;
const MAX_PAGE_IN = 199;
const MAX_PAGE_PX = MAX_PAGE_IN * PX_PER_IN;

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
    await page.goto(target, { waitUntil: "networkidle0", timeout: 60000 });
  }
}

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
  
  const needsScale = fullHeight > MAX_PAGE_PX;
  const scale = needsScale ? MAX_PAGE_PX / fullHeight : 1;
  const outHeight = needsScale ? MAX_PAGE_PX : fullHeight;

  const pdfBuffer = await page.pdf({
    printBackground: true,
    width: `${cssWidth}px`,
    height: `${outHeight}px`,
    scale: scale / 1.05,
    margin: { top: 0, right: 0, bottom: 0, left: 0 },
    preferCSSPageSize: false,
  });

  await page.close();
  return pdfBuffer;
}


export async function POST(req) {
  const startTime = Date.now(); 
  let browser;
  let fileSizeBytes = 0;
  
  let body = {};
  try {
    body = await req.json();
  } catch (e) {}
  
  const { mode, type, content } = body; 

  const logUsageToConsole = (status, error = null) => {
    const duration = Date.now() - startTime;
    const logData = {
      timestamp: new Date().toISOString(),
      status: status,
      mode: mode || 'unknown',
      type: type || 'unknown',
      duration_ms: duration, // CRÍTICO para el cálculo de costos
      file_size_kb: fileSizeBytes > 0 ? Math.round(fileSizeBytes / 1024) : 0,
      target_url_prefix: type === 'url' ? content?.substring(0, 50) : 'raw_text', 
      error: error,
    };
    console.log("USAGE_LOG:", JSON.stringify(logData));
  };


  try {
    if (!content) throw new Error("Contenido faltante");

    const isVercel = process.env.VERCEL_ENV === 'production' || process.env.VERCEL_ENV === 'preview';

    let execPath;
    if (isVercel) {
      execPath = await chromium.executablePath();
    } else {
      execPath = process.env.PUPPETEER_EXECUTABLE_PATH;
    }

    const launchOptions = {
      executablePath: execPath, 
      channel: (!isVercel && !execPath) ? 'chrome' : undefined,

      args: isVercel
        ? [...chromium.args, "--hide-scrollbars", "--disable-web-security"]
        : ["--no-sandbox", "--disable-setuid-sandbox"], 
      
      headless: isVercel ? chromium.headless : "new",
      ignoreDefaultArgs: ['--disable-extensions'],
      defaultViewport: chromium.defaultViewport,
    };

    browser = await puppeteer.launch(launchOptions);

    let pdfBuffer;
    const isHtml = type === "text";

    if (mode === "mobile") {
      pdfBuffer = await generateMobilePDF(browser, content, isHtml);
    } else {
      pdfBuffer = await generateDesktopPDF(browser, content, isHtml);
    }

    fileSizeBytes = pdfBuffer.length; 

    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="generated.pdf"`,
      },
    });

  } catch (error) {
    console.error("Error de Puppeteer:", error);
    
    logUsageToConsole('ERROR', error.message);

    return NextResponse.json({ error: error.message }, { status: 500 });

  } finally {
    if (browser) await browser.close();

    if (fileSizeBytes > 0) {
      logUsageToConsole('SUCCESS');
    }
  }
}