import type { PageServerLoad } from './$types';
import { scanUrl, getNetworkOnlyReport } from '$lib/server/scanner';

export const load: PageServerLoad = ({ params }) => {
  const url = decodeURIComponent(params.url);

  // Basic URL validation to prevent 500 errors on typos like "fmhy..net"
  let domain = url;
  try {
    const tempUrl = url.startsWith('http') ? url : `https://${url}`;
    const urlObj = new URL(tempUrl);
    domain = urlObj.hostname;
    // Check for double dots or other common typos in the domain
    if (domain.includes('..') || !domain.includes('.')) {
      throw new Error("Invalid domain name format.");
    }
  } catch (e) {
    return {
      streamed: {
        report: Promise.reject(new Error(`"${url}" is not a valid website URL. Please check for typos like double dots.`))
      },
      url
    };
  }

  const skeletonReport = (domain: string, data: any = {}): any => ({
    name: domain,
    domain: domain,
    favicon: `https://www.google.com/s2/favicons?domain=${domain}&sz=128`,
    brandColors: ['#000000', '#ffffff'],
    fonts: [],
    title: domain,
    description: 'Technical profile for ' + domain,
    techStack: [],
    socialLinks: [],
    dns: [],
    subdomains: [],
    redFlags: [],
    security: [],
    securityScore: 'B',
    emailSecurity: { spf: false, dmarc: false },
    crawling: {},
    updatedAt: new Date().toISOString(),
    ...data
  });

  // We don't await the scan here. We return a promise so SvelteKit streams it.
  const fetchReport = async () => {
    try {
      console.log(`[page.server.ts] Starting background scan for URL: ${url}`);
      
      const isIp = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(domain);

      if (isIp) {
        try {
          // Try to scan it as a website first
          return await scanUrl(url);
        } catch (e) {
          // If website scan fails, provide network-only info
          const networkData = await getNetworkOnlyReport(domain);
          return skeletonReport(domain, {
            ...networkData,
            name: domain,
            needsClientFetch: false
          });
        }
      }

      const report = await scanUrl(url);
      console.log(`[page.server.ts] Background scan successful for URL: ${url}`);
      return report;
    } catch (err: any) {
      console.error('[page.server.ts] Background scan failed:', err.message);

      // If it's a 403, 503 or SSL error, try to provide network info as fallback
      const isBlockedOrSsl = err.message && (
        err.message.includes('403') || 
        err.message.includes('503') || 
        err.message.includes('Forbidden') ||
        err.message.includes('fetch failed') ||
        err.message.includes('certificate') ||
        err.message.includes('unable to verify')
      );

      if (isBlockedOrSsl) {
        try {
          const networkData = await getNetworkOnlyReport(domain);
          return skeletonReport(domain, {
            ...networkData,
            needsClientFetch: true, // Browser might have better luck with some sites
            error: null
          });
        } catch (networkErr) {
          console.error('[page.server.ts] Network-only fallback failed:', networkErr);
        }
      }

      throw err;
    }
  };

  return {
    streamed: {
      report: fetchReport()
    },
    url
  };
};
