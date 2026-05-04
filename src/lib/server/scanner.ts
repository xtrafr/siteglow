import * as cheerio from 'cheerio';
import type { SiteReport, TechStack, SocialLink, RedFlag, Subdomain, AssetNode } from '../types';
import { fetchDNS, fetchSSL, analyzeHeaders, fetchIPInfo, analyzeCSP } from './scanner/network';
import { analyzeHtml } from '../scanner/analysis';
import { techRules, wafRules } from '../scanner/rules';
import { env } from '$env/dynamic/private';

// Helper for fetch with timeout to prevent serverless function hangs
async function fetchWithTimeout(url: string, options: any = {}, timeout = 10000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

export async function getNetworkOnlyReport(domain: string): Promise<Partial<SiteReport>> {
  const [dnsRecords, sslCert] = await Promise.all([
    fetchDNS(domain).catch(() => []),
    fetchSSL(domain).catch(() => undefined),
  ]);

  // Resolve IP Info from the first A record
  let firstA = dnsRecords.find(r => r.type === 'A')?.value;

  // If no A record found for the subdomain (e.g. www), try the root domain
  if (!firstA && domain.split('.').length > 2) {
    const rootDomain = domain.split('.').slice(-2).join('.');
    const rootDns = await fetchDNS(rootDomain).catch(() => []);
    firstA = rootDns.find(r => r.type === 'A')?.value;
  }

  const ipInfo = firstA ? await fetchIPInfo(firstA) : { provider: 'Unknown Provider', location: 'Unknown Location' };

  return {
    dns: dnsRecords,
    ssl: sslCert,
    ip: firstA,
    provider: ipInfo.provider,
    location: ipInfo.location,
    latitude: ipInfo.latitude,
    longitude: ipInfo.longitude,
    emailSecurity: {
      spf: dnsRecords.some(r => r.type === 'TXT' && r.value.includes('v=spf1')),
      dmarc: dnsRecords.some(r => r.type === 'TXT' && r.value.includes('v=DMARC1'))
    },
  };
}

export async function scanUrl(targetUrl: string): Promise<SiteReport> {
  // Ensure protocol
  if (!targetUrl.startsWith('http')) {
    targetUrl = 'https://' + targetUrl;
  }

  const headersMap = {
    'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'X-Forwarded-For': '66.249.66.1', // Googlebot IP range hint
    'Cache-Control': 'no-cache'
  };

  let response;
  try {
    console.log(`[scanner.ts] Attempting initial fetch to ${targetUrl}`);
    response = await fetchWithTimeout(targetUrl, { headers: headersMap, redirect: 'follow' }, 8000);
    console.log(`[scanner.ts] Initial fetch completed. Status: ${response.status}`);
  } catch (err: any) {
    console.error(`[scanner.ts] Initial fetch threw an error:`, err);
    throw new Error(`Connection timed out or failed: ${err.message}`);
  }

  let html = '';
  let finalUrl = targetUrl;

  if (!response.ok) {
    console.log(`[scanner.ts] Response not ok: ${response.status} ${response.statusText}`);
    if (response.status === 403 || response.status === 503) {
      console.log(`[scanner.ts] Cloudflare/WAF block detected for ${targetUrl}. Attempting fallback via ScrapingAnt...`);
      try {
        const apiKey = env.SCRAPINGANT_API_KEY;
        if (!apiKey) {
          console.error("[scanner.ts] SCRAPINGANT_API_KEY is missing!");
          throw new Error("SCRAPINGANT_API_KEY environment variable is not set. Cannot bypass Cloudflare.");
        }

        // Added browser=false to make the fetch 10x faster (bypasses headless Chrome, just uses proxy network)
        const proxyUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(targetUrl)}&x-api-key=${apiKey}&browser=false`;
        console.log(`[scanner.ts] Fetching from ScrapingAnt...`);
        let proxyResponse = await fetchWithTimeout(proxyUrl, {}, 15000);
        console.log(`[scanner.ts] ScrapingAnt responded with status: ${proxyResponse.status}`);

        let proxyText = await proxyResponse.text();

        // Handle 409 Concurrency Limit (Free tier only allows 1 request at a time)
        if (proxyResponse.status === 409) {
          console.log(`[scanner.ts] Hit ScrapingAnt concurrency limit (409). Waiting 2.5s and retrying...`);
          await new Promise(resolve => setTimeout(resolve, 2500));
          proxyResponse = await fetchWithTimeout(proxyUrl, {}, 15000);
          proxyText = await proxyResponse.text();
          console.log(`[scanner.ts] ScrapingAnt retry status: ${proxyResponse.status}`);
        }

        if (!proxyResponse.ok) {
          console.error(`[scanner.ts] ScrapingAnt API error response:`, proxyText);
          throw new Error(`ScrapingAnt API failed: ${proxyResponse.status} ${proxyText}`);
        }

        html = proxyText;
        if (!html) throw new Error("Empty response from ScrapingAnt");

        // Try to extract the final URL if ScrapingAnt followed redirects
        // Note: ScrapingAnt doesn't easily return the final URL in the 'general' endpoint 
        // without extra metadata, so we'll stick to targetUrl for now but ensured it's set.
        finalUrl = targetUrl;
      } catch (proxyErr: any) {
        console.error(`[scanner.ts] ScrapingAnt fallback failed:`, proxyErr);
        throw new Error(`The target website blocked our crawler, and the ScrapingAnt fallback failed. (${proxyErr.message})`);
      }
    } else {
      throw new Error(`Site returned ${response.status}: ${response.statusText}`);
    }
  } else {
    html = await response.text();
    finalUrl = response.url;
  }

  console.log(`[scanner.ts] HTML fetched successfully. Length: ${html.length}`);
  let $ = cheerio.load(html);

  // Detect Meta Refresh redirect
  const metaRefresh = $('meta[http-equiv="refresh"]').attr('content');
  if (metaRefresh) {
    const match = metaRefresh.match(/url=(.+)$/i);
    if (match && match[1]) {
      const redirectUrl = new URL(match[1].trim(), finalUrl).href;
      try {
        response = await fetchWithTimeout(redirectUrl, { headers: headersMap, redirect: 'follow' }, 5000);
        if (response.ok) {
          finalUrl = response.url;
          html = await response.text();
          $ = cheerio.load(html);
        }
      } catch (err) {
        console.error('Meta refresh fetch failed:', err);
      }
    }
  }

  const urlObj = new URL(finalUrl);
  const domain = urlObj.hostname;

  // Run network checks concurrently
  const [dnsRecords, sslCert, securityHeaders] = await Promise.all([
    fetchDNS(domain).catch(() => []),
    fetchSSL(domain).catch(() => undefined),
    analyzeHeaders(response.headers)
  ]);

  const cspHeader = response.headers.get('content-security-policy');
  const cspReport = analyzeCSP(cspHeader);

  // Resolve IP Info from the first A record
  let firstA = dnsRecords.find(r => r.type === 'A')?.value;

  // If no A record found for the subdomain (e.g. www), try the root domain
  if (!firstA && domain.split('.').length > 2) {
    const rootDomain = domain.split('.').slice(-2).join('.');
    console.log(`[scanner.ts] No A record for ${domain}, trying root domain: ${rootDomain}`);
    const rootDns = await fetchDNS(rootDomain).catch(() => []);
    firstA = rootDns.find(r => r.type === 'A')?.value;
  }

  console.log(`[scanner.ts] Final Resolved IP: ${firstA || 'None'} for domain: ${domain}`);
  const ipInfo = firstA ? await fetchIPInfo(firstA) : { provider: 'Unknown Provider', location: 'Unknown Location' };

  // 1. Basic Info
  const title = $('title').text() || $('meta[property="og:title"]').attr('content') || $('meta[name="twitter:title"]').attr('content') || '';
  const description = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';

  // Advanced Favicon Detection
  let favicon = '';
  const iconLinks = $('link[rel*="icon"]');
  let bestIcon = '';

  iconLinks.each((_, el) => {
    const href = $(el).attr('href');
    if (href) {
      const fullHref = new URL(href, finalUrl).href;
      // Prioritize SVG or high-res PNG
      if (fullHref.includes('.svg') || fullHref.includes('.png')) {
        bestIcon = fullHref;
      } else if (!bestIcon) {
        bestIcon = fullHref;
      }
    }
  });

  const appleTouchIcon = $('link[rel="apple-touch-icon"]').attr('href');
  if (appleTouchIcon) {
    favicon = new URL(appleTouchIcon, finalUrl).href;
  } else if (bestIcon) {
    favicon = bestIcon;
  } else {
    // Fallback to Google's favicon service for maximum reliability
    favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;
  }

  // 2. Logo Detection
  const ogImage = $('meta[property="og:image"]').attr('content');
  let logo = ogImage || $('meta[property="og:logo"]').attr('content') || $('img[src*="logo"]').first().attr('src');
  if (logo) logo = new URL(logo, finalUrl).href;
  else logo = favicon;

  // 3. Brand Colors
  const brandColors: string[] = [];
  const themeColor = $('meta[name="theme-color"]').attr('content');
  if (themeColor) brandColors.push(themeColor);

  const hexMatch = html.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g);
  if (hexMatch) {
    const uniqueHex = Array.from(new Set(hexMatch))
      .filter(c => {
        const lower = c.toLowerCase();
        return !['#ffffff', '#000000', '#fff', '#000', '#f3f4f6', '#111827', '#1f2937', '#374151', '#4b5563', '#6b7280', '#9ca3af', '#d1d5db', '#e5e7eb', '#f9fafb'].includes(lower);
      })
      .slice(0, 4);
    brandColors.push(...uniqueHex);
  }
  const finalColors = Array.from(new Set(brandColors)).slice(0, 5);

  // 4. Tech Stack Detection
  const techStack: TechStack[] = [];
  const bodyText = $('body').html() || '';
  const headText = $('head').html() || '';
  const scripts = $('script').map((_, el) => $(el).attr('src')).get().join(' ');

  const serverHeader = response.headers.get('Server') || '';
  const poweredByHeader = response.headers.get('X-Powered-By') || '';

  for (const rule of techRules) {
    let detected = false;
    if (rule.pattern.test(headText) || rule.pattern.test(bodyText) || rule.pattern.test(scripts) || rule.pattern.test(html)) {
      detected = true;
    } else if (rule.header === 'Server' && rule.pattern.test(serverHeader)) {
      detected = true;
    } else if (rule.header === 'X-Powered-By' && rule.pattern.test(poweredByHeader)) {
      detected = true;
    }

    if (detected) {
      techStack.push({
        name: rule.name,
        category: rule.category,
        website: rule.website || `https://www.google.com/search?q=${encodeURIComponent(rule.name)}`
      });
    }
  }

  // 5. Social Links
  const socialLinks: SocialLink[] = [];
  const socialPatterns = [
    { platform: 'Twitter', pattern: /twitter\.com\/([\w]+)/ },
    { platform: 'GitHub', pattern: /github\.com\/([\w]+)/ },
    { platform: 'LinkedIn', pattern: /linkedin\.com\/company\/([\w-]+)/ },
    { platform: 'Instagram', pattern: /instagram\.com\/([\w]+)/ }
  ];

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    for (const sp of socialPatterns) {
      if (sp.pattern.test(href) && !socialLinks.find(l => l.platform === sp.platform)) {
        socialLinks.push({ platform: sp.platform, url: href });
      }
    }
  });

  // 5b. WAF Detection
  const detectedWAFs = new Set<string>();
  const cookies = response.headers.get('set-cookie') || '';
  
  response.headers.forEach((value, key) => {
    for (const rule of wafRules) {
      if (rule.type === 'header' && rule.pattern.test(`${key}: ${value}`)) {
        detectedWAFs.add(rule.name);
      }
    }
  });
  
  for (const rule of wafRules) {
    if (rule.type === 'cookie' && rule.pattern.test(cookies)) {
      detectedWAFs.add(rule.name);
    }
    if (rule.type === 'body' && rule.pattern.test(html)) {
      detectedWAFs.add(rule.name);
    }
  }

  // 6. Fonts (Extreme Precision Detection)
  const foundFonts = new Set<string>();

  const commonSystem = [
    'inherit', 'sans-serif', 'serif', 'monospace', 'cursive', 'fantasy', 'system-ui',
    '-apple-system', 'blinkmacsystemfont', 'Segoe UI', 'Roboto', 'Helvetica Neue',
    'Arial', 'Helvetica', 'Verdana', 'Georgia', 'Times New Roman', 'Trebuchet MS', 'Impact',
    'var(', '--font', 'ui-sans-serif', 'ui-serif', 'ui-monospace'
  ];

  const isTechnicalName = (name: string) => {
    // Detect hashes (e.g., 051df43942b70a0f183e)
    if (/^[a-f0-9]{12,}$/i.test(name.replace(/[-_]/g, ''))) return true;
    // Detect long random-looking strings
    if (name.length > 15 && !name.includes(' ') && !/[aeiouy]{1,}/i.test(name)) return true;
    // Detect CSS variables
    if (name.startsWith('var(') || name.startsWith('--')) return true;
    return false;
  };

  // A. Check Google Fonts (Highest Confidence)
  $('link[href*="fonts.googleapis.com"], link[href*="fonts.gstatic.com"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const fontNames = href.match(/family=([\w\+]+)/g);
    if (fontNames) {
      fontNames.forEach(f => {
        const name = f.replace('family=', '').replace(/\+/g, ' ').split(':')[0].split(',')[0];
        if (name && name.length > 1 && !commonSystem.some(sys => name.toLowerCase().includes(sys.toLowerCase()))) {
          foundFonts.add(name);
        }
      });
    }
  });

  // B. CSS Deep Scan for @font-face & Variables
  const cssBlocks: string[] = [];
  $('style').each((_, el) => { cssBlocks.push($(el).html()); });

  cssBlocks.forEach(styleContent => {
    // 1. Resolve @font-face names (The most accurate source for custom fonts)
    const fontFaceMatches = styleContent.match(/font-family:\s*["']?([^;,"'}]+)["']?/gi);
    if (fontFaceMatches) {
      fontFaceMatches.forEach(match => {
        const name = match.replace(/font-family:\s*/i, '').replace(/["']/g, '').split(',')[0].trim();
        if (name && name.length > 1 && !isTechnicalName(name) && !commonSystem.some(sys => name.toLowerCase().includes(sys.toLowerCase()))) {
          foundFonts.add(name);
        }
      });
    }

    // 2. Try to resolve CSS variables used for fonts (e.g., --font-sans: "Inter")
    const varMatches = styleContent.match(/--[\w-]+:\s*["']?([^;,"'{}!]+)["']?/gi);
    if (varMatches) {
      varMatches.forEach(match => {
        if (match.toLowerCase().includes('font')) {
          const val = match.split(':')[1].replace(/["']/g, '').split(',')[0].trim();
          if (val && val.length > 2 && !isTechnicalName(val) && !commonSystem.some(sys => val.toLowerCase().includes(sys.toLowerCase()))) {
            foundFonts.add(val);
          }
        }
      });
    }
  });

  // C. Check Linked Font Files (Lower confidence, strictly filtered)
  $('[src], link[href]').each((_, el) => {
    const url = $(el).attr('src') || $(el).attr('href') || '';
    const fileMatch = url.match(/\/([^\/\s]+)\.(woff2|woff|ttf|otf)(\?.*)?$/i);
    if (fileMatch) {
      const fileName = fileMatch[1].replace(/[-_]/g, ' ');
      // Clean up common suffixes
      const cleanName = fileName.replace(/(regular|bold|italic|medium|light|thin|variable|subset|webfont|latin)/gi, '').trim();

      if (cleanName && cleanName.length > 2 && !isTechnicalName(cleanName)) {
        // Capitalize words
        const capitalized = cleanName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        if (!commonSystem.some(sys => capitalized.toLowerCase().includes(sys.toLowerCase()))) {
          foundFonts.add(capitalized);
        }
      }
    }
  });

  // D. Filter and Sort
  const finalFonts = Array.from(foundFonts)
    .filter(f => f.length > 2 && f.length < 35)
    .slice(0, 5);



  // 7. Performance, Accessibility & SEO Audit
  const pageSize = Math.round(new TextEncoder().encode(html).length / 1024);
  const domNodes = $('*').length;
  const compression = response.headers.get('content-encoding') || 'None';

  // Accessibility Checks
  const totalImgs = $('img').length;
  const missingAlt = $('img:not([alt])').length + $('img[alt=""]').length;
  const hasLang = $('html[lang]').length > 0;
  const hasMain = $('main').length > 0;
  const h1Count = $('h1').length;
  const hasH1 = h1Count === 1;
  const landmarks = $('header, nav, footer, main, aside').length;

  // 8. Red Flags Audit
  const redFlags: RedFlag[] = [];
  const mixedContent = $('img[src^="http://"], script[src^="http://"], link[href^="http://"]').length;
  if (mixedContent > 0 && finalUrl.startsWith('https')) {
    redFlags.push({ type: 'security', message: `Found ${mixedContent} insecure (HTTP) assets on HTTPS page.` });
  }

  if (!hasLang) redFlags.push({ type: 'info', message: 'HTML lang attribute is missing.' });

  // 9. Subdomain Discovery (via Link Analysis)
  const baseDomain = domain.replace(/^www\./, '');
  const foundSubdomains = new Set<string>();

  $('[href], [src]').each((_, el) => {
    const attr = $(el).attr('href') || $(el).attr('src');
    if (attr && attr.includes(baseDomain)) {
      try {
        const url = new URL(attr, finalUrl);
        const sub = url.hostname.split(`.${baseDomain}`)[0];
        if (sub && sub !== url.hostname && sub !== 'www') {
          foundSubdomains.add(sub);
        }
      } catch { /* ignore invalid urls */ }
    }
  });

  const subdomains: Subdomain[] = Array.from(foundSubdomains).map(sub => ({
    name: sub,
    url: `https://${sub}.${baseDomain}`,
    status: 'active'
  }));

  if (domain.startsWith('www.')) {
    subdomains.unshift({ name: 'www', url: `https://${domain}`, status: 'active' });
  }

  // Scoring logic (closer to Lighthouse)
  let a11yScore = 100;
  if (!hasLang) a11yScore -= 10;
  if (!hasMain) a11yScore -= 5;
  if (h1Count === 0) a11yScore -= 10;
  if (h1Count > 1) a11yScore -= 5;
  if (totalImgs > 0) a11yScore -= (missingAlt / totalImgs) * 30;
  if (landmarks < 3) a11yScore -= 10;

  const finalA11yScore = Math.max(0, Math.min(100, Math.round(a11yScore)));

  const cleanName = domain.replace(/^www\./, '').split('.')[0];
  const siteName = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);

  return {
    name: siteName,
    domain,
    favicon,
    logo,
    brandColors: finalColors.length > 0 ? finalColors : ['#000000', '#ffffff'],
    fonts: finalFonts,
    title,
    description,
    ogImage,
    techStack,
    socialLinks,
    dns: dnsRecords,
    subdomains,
    redFlags,
    ip: firstA,
    provider: ipInfo.provider,
    location: ipInfo.location,
    latitude: ipInfo.latitude,
    longitude: ipInfo.longitude,
    ssl: sslCert,
    security: securityHeaders,
    securityScore: calculateSecurityScore(sslCert, securityHeaders, mixedContent, dnsRecords),
    emailSecurity: {
      spf: dnsRecords.some(r => r.type === 'TXT' && r.value.includes('v=spf1')),
      dmarc: dnsRecords.some(r => r.type === 'TXT' && r.value.includes('v=DMARC1'))
    },
    crawling: await discoverCrawling(domain, finalUrl),
    performance: {
      pageSize,
      domNodes,
      compression
    },
    accessibility: {
      score: finalA11yScore,
      missingAltTags: missingAlt,
      hasAriaLabels: $('[aria-label], [role]').length > 0
    },
    language: $('html').attr('lang') || 'en',
    themeColor: $('meta[name="theme-color"]').attr('content'),
    headings: {
      h1: h1Count,
      h2: $('h2').length,
      h3: $('h3').length
    },
    waf: Array.from(detectedWAFs),
    csp: cspReport,
    assets: buildAssetTree($, finalUrl),
    updatedAt: new Date().toISOString()
  };
}

function buildAssetTree($: cheerio.CheerioAPI, baseUrl: string): any[] {
  const assets: { url: string, type: any }[] = [];
  const domain = new URL(baseUrl).hostname;

  $('[src], link[rel="stylesheet"], link[rel*="icon"]').each((_, el) => {
    const urlAttr = $(el).attr('src') || $(el).attr('href');
    if (!urlAttr) return;

    try {
      const fullUrl = new URL(urlAttr, baseUrl).href;
      const isInternal = fullUrl.includes(domain);

      let type: 'image' | 'script' | 'style' | 'document' = 'document';
      if (urlAttr.match(/\.(png|jpg|jpeg|gif|svg|webp|ico)/i)) type = 'image';
      else if (urlAttr.match(/\.js/i)) type = 'script';
      else if (urlAttr.match(/\.css/i)) type = 'style';

      if (!assets.find(a => a.url === fullUrl)) {
        assets.push({ url: fullUrl, type });
      }
    } catch { /* ignore */ }
  });

  const root: any[] = [];

  assets.forEach(asset => {
    const urlObj = new URL(asset.url);
    const parts = urlObj.pathname.split('/').filter(p => p);
    let currentLevel = root;

    parts.forEach((part, index) => {
      const isLast = index === parts.length - 1;
      let existing = currentLevel.find(n => n.name === part);

      if (!existing) {
        existing = {
          name: part,
          type: isLast ? 'file' : 'folder',
          url: isLast ? asset.url : undefined,
          fileType: isLast ? asset.type : undefined,
          children: isLast ? undefined : []
        };
        currentLevel.push(existing);
      }
      if (!isLast) {
        if (!existing.children) {
          existing.children = [];
          existing.type = 'folder';
        }
        currentLevel = existing.children;
      }
    });
  });

  return root;
}

function calculateSecurityScore(ssl: any, headers: any[], mixedContent: number, dns: any[]): string {
  let score = 100;

  if (!ssl || ssl.isExpired) score -= 40;
  if (mixedContent > 0) score -= 20;

  const hsts = headers.find(h => h.name === 'Strict-Transport-Security' && h.status === 'secure');
  const csp = headers.find(h => h.name === 'Content-Security-Policy' && h.status === 'secure');

  if (!hsts) score -= 15;
  if (!csp) score -= 15;

  const hasSpf = dns.some(r => r.type === 'TXT' && r.value.includes('v=spf1'));
  if (!hasSpf) score -= 5;

  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

async function discoverCrawling(domain: string, baseUrl: string): Promise<{ sitemap?: string, robots?: string }> {
  const results: { sitemap?: string, robots?: string } = {};

  try {
    const robotsUrl = `https://${domain}/robots.txt`;
    const res = await fetchWithTimeout(robotsUrl, {}, 3000);
    if (res.ok) {
      results.robots = robotsUrl;
      const text = await res.text();
      const sitemapMatch = text.match(/Sitemap:\s*(.+)/i);
      if (sitemapMatch) results.sitemap = sitemapMatch[1].trim();
    }

    if (!results.sitemap) {
      const sitemapUrl = `https://${domain}/sitemap.xml`;
      const sRes = await fetchWithTimeout(sitemapUrl, {}, 3000);
      if (sRes.ok) results.sitemap = sitemapUrl;
    }
  } catch { /* ignore */ }

  return results;
}
