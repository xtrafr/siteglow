import tls from 'tls';
import type { DNSRecord, SSLCertificate, SecurityHeader, CSPReport } from '../../types';

// Helper for fetch with timeout
async function fetchWithTimeout(url: string, options: any = {}, timeout = 8000) {
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

export async function fetchDNS(domain: string): Promise<DNSRecord[]> {
  const records: DNSRecord[] = [];
  
  // Use Cloudflare DNS-over-HTTPS API for better reliability in serverless environments
  // Node's native 'dns' module often fails or is restricted in serverless runtimes
  const fetchDNSRecords = async (type: string) => {
    try {
      const res = await fetchWithTimeout(`https://cloudflare-dns.com/dns-query?name=${domain}&type=${type}`, {
        headers: { 'Accept': 'application/dns-json' }
      }, 4000);
      
      if (!res.ok) return [];
      const data = await res.json();
      if (!data.Answer) return [];
      const typeMap: Record<number, string> = {
        1: 'A',
        2: 'NS',
        5: 'CNAME',
        15: 'MX',
        16: 'TXT',
        28: 'AAAA'
      };
      
      return data.Answer.map((ans: any) => ({
        type: typeMap[ans.type] || `TYPE${ans.type}`,
        value: ans.data.replace(/"/g, '') // Clean up TXT records
      }));
    } catch (err) {
      console.error(`DNS fetch error for ${type}:`, err);
      return [];
    }
  };

  const [a, mx, txt, ns] = await Promise.all([
    fetchDNSRecords('A'),
    fetchDNSRecords('MX'),
    fetchDNSRecords('TXT'),
    fetchDNSRecords('NS')
  ]);

  return [...a, ...mx, ...txt, ...ns];
}

export async function fetchSSL(domain: string): Promise<SSLCertificate | undefined> {
  return new Promise((resolve) => {
    try {
      // tls.connect is generally supported in Vercel Serverless (Node) functions
      // but might fail in Edge functions.
      const socket = tls.connect({
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: false
      }, () => {
        const cert = socket.getPeerCertificate();
        if (!cert || Object.keys(cert).length === 0) {
          resolve(undefined);
          return;
        }

        const validTo = new Date(cert.valid_to);
        const isExpired = new Date() > validTo;

        resolve({
          issuer: typeof cert.issuer === 'string' ? cert.issuer : cert.issuer.O || 'Unknown',
          validFrom: cert.valid_from,
          validTo: cert.valid_to,
          protocol: socket.getProtocol() || 'Unknown',
          subject: typeof cert.subject === 'string' ? cert.subject : cert.subject.CN || domain,
          isExpired,
          sans: cert.subjectaltname ? cert.subjectaltname.split(',').map(s => s.trim().replace('DNS:', '')) : []
        });
        socket.destroy();
      });

      socket.on('error', (err) => {
        console.error('SSL socket error:', err);
        resolve(undefined);
      });
      
      socket.setTimeout(4000, () => {
        socket.destroy();
        resolve(undefined);
      });
    } catch (err) {
      console.error('SSL connection error:', err);
      resolve(undefined);
    }
  });
}

export function analyzeHeaders(headers: Headers): SecurityHeader[] {
  const security: SecurityHeader[] = [];
  const checks = [
    { name: 'Strict-Transport-Security', key: 'strict-transport-security' },
    { name: 'Content-Security-Policy', key: 'content-security-policy' },
    { name: 'X-Frame-Options', key: 'x-frame-options' },
    { name: 'X-Content-Type-Options', key: 'x-content-type-options' },
    { name: 'Referrer-Policy', key: 'referrer-policy' }
  ];

  checks.forEach(check => {
    const value = headers.get(check.key);
    if (value) {
      security.push({ name: check.name, value, status: 'secure' });
    } else {
      security.push({ name: check.name, value: 'Not Detected', status: 'missing' });
    }
  });

  return security;
}

export function analyzeCSP(cspHeader: string | null): CSPReport {
  const report: CSPReport = {
    hasCSP: false,
    defaultSrc: [],
    scriptSrc: [],
    styleSrc: [],
    imgSrc: [],
    connectSrc: [],
    fontSrc: [],
    frameSrc: [],
    unsafeInline: false,
    unsafeEval: false,
    strictDynamic: false,
    issues: []
  };

  if (!cspHeader || cspHeader === 'Not Detected') {
    report.issues.push('No Content-Security-Policy header present');
    return report;
  }

  report.hasCSP = true;

  const directives = cspHeader.toLowerCase().split(';').map(d => d.trim());
  
  for (const directive of directives) {
    const parts = directive.split(/\s+/);
    const name = parts[0];
    const values = parts.slice(1);

    switch (name) {
      case 'default-src': report.defaultSrc = values; break;
      case 'script-src': report.scriptSrc = values; break;
      case 'style-src': report.styleSrc = values; break;
      case 'img-src': report.imgSrc = values; break;
      case 'connect-src': report.connectSrc = values; break;
      case 'font-src': report.fontSrc = values; break;
      case 'frame-src': report.frameSrc = values; break;
    }
  }

  const allDirectives = directives.join(' ');
  if (allDirectives.includes("'unsafe-inline'")) {
    report.unsafeInline = true;
    report.issues.push('Allows unsafe-inline (XSS risk)');
  }
  if (allDirectives.includes("'unsafe-eval'")) {
    report.unsafeEval = true;
    report.issues.push('Allows unsafe-eval (code injection risk)');
  }
  if (allDirectives.includes("'strict-dynamic'")) {
    report.strictDynamic = true;
  }

  if (report.defaultSrc.includes("'none'") && directives.every(d => !d.startsWith('default-src'))) {
    report.issues.push('default-src not set - falling back to allow all');
  }

  if (report.scriptSrc.length === 0 && report.defaultSrc.length === 0) {
    report.issues.push('No script restrictions defined');
  }

  return report;
}

export async function fetchIPInfo(ip: string): Promise<{ provider: string, location: string, latitude?: number, longitude?: number }> {
  try {
    // Using freeipapi.com because ipapi.co heavily rate limits Vercel datacenter IPs
    const res = await fetchWithTimeout(`https://freeipapi.com/api/json/${ip}`, {}, 4000);
    if (!res.ok) throw new Error('IP API returned error');
    const data = await res.json();
    return {
      provider: data.asnOrganization || 'Unknown Provider',
      location: data.cityName && data.countryName ? `${data.cityName}, ${data.countryName}` : (data.countryName || 'Unknown Location'),
      latitude: data.latitude,
      longitude: data.longitude
    };
  } catch (err) {
    console.error('IP Info fetch error:', err);
    return { provider: 'Unknown Provider', location: 'Unknown Location' };
  }
}
