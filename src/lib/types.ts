export interface TechStack {
  name: string;
  category: string;
  website?: string;
  icon?: string;
}

export interface SocialLink {
  platform: string;
  url: string;
}

export interface DNSRecord {
  type: string;
  value: string;
}

export interface SSLCertificate {
  issuer: string;
  validFrom: string;
  validTo: string;
  protocol: string;
  subject: string;
  isExpired: boolean;
  sans: string[];
}

export interface SecurityHeader {
  name: string;
  value: string;
  status: 'secure' | 'warning' | 'missing';
}

export interface CSPReport {
  hasCSP: boolean;
  defaultSrc: string[];
  scriptSrc: string[];
  styleSrc: string[];
  imgSrc: string[];
  connectSrc: string[];
  fontSrc: string[];
  frameSrc: string[];
  unsafeInline: boolean;
  unsafeEval: boolean;
  strictDynamic: boolean;
  issues: string[];
}

export interface PerformanceMetrics {
  pageSize: number; // in KB
  domNodes: number;
  compression?: string;
  loadTime?: number;
}

export interface AccessibilityMetrics {
  score: number;
  missingAltTags: number;
  hasAriaLabels: boolean;
}

export interface Subdomain {
  name: string;
  url: string;
  status: 'active' | 'unknown';
}

export interface RedFlag {
  type: 'security' | 'warning' | 'info';
  message: string;
}

export interface AssetNode {
  name: string;
  type: 'file' | 'folder';
  url?: string;
  children?: AssetNode[];
  fileType?: 'image' | 'script' | 'style' | 'document';
}

export interface SiteReport {
  name: string;
  domain: string;
  favicon: string;
  logo?: string;
  brandColors: string[];
  fonts: string[];
  title: string;
  description: string;
  ogImage?: string;
  techStack: TechStack[];
  socialLinks: SocialLink[];
  dns: DNSRecord[];
  subdomains: Subdomain[];
  redFlags: RedFlag[];
  ip?: string;
  provider?: string;
  location?: string;
  latitude?: number;
  longitude?: number;
  ssl?: SSLCertificate;
  security: SecurityHeader[];
  securityScore: string;
  emailSecurity: {
    spf: boolean;
    dmarc: boolean;
  };
  crawling: {
    sitemap?: string;
    robots?: string;
  };
  performance?: PerformanceMetrics;
  accessibility?: AccessibilityMetrics;
  assets?: AssetNode[];
  language?: string;
  themeColor?: string;
  headings?: {
    h1: number;
    h2: number;
    h3: number;
  };
  waf?: string[];
  csp?: CSPReport;
  updatedAt: string;
}
