export interface TechRule {
  name: string;
  category: string;
  pattern: RegExp;
  website?: string;
  header?: string;
}

export const techRules: TechRule[] = [
  // Cloud & Infrastructure
  { name: 'Firebase', category: 'PaaS', pattern: /firebase|gstatic\.com\/firebasejs/, website: 'https://firebase.google.com' },
  { name: 'Amazon S3', category: 'Storage', pattern: /s3\.amazonaws\.com|s3-/, website: 'https://aws.amazon.com/s3' },
  { name: 'Amazon CloudFront', category: 'CDN', pattern: /cloudfront\.net/, website: 'https://aws.amazon.com/cloudfront' },
  { name: 'Azure Edge', category: 'CDN', pattern: /azureedge\.net|windows\.net/, website: 'https://azure.microsoft.com' },
  { name: 'Cloudflare', category: 'Infrastructure', pattern: /cloudflare|_cf_container/, website: 'https://cloudflare.com' },
  { name: 'Vercel', category: 'Hosting', pattern: /vercel\.app|__vercel/, website: 'https://vercel.com' },
  { name: 'Netlify', category: 'Hosting', pattern: /netlify/, website: 'https://netlify.com' },
  { name: 'Genially', category: 'LMS', pattern: /genial\.ly/, website: 'https://genial.ly' },

  // Frameworks & Libraries
  { name: 'Next.js', category: 'Framework', pattern: /__NEXT_DATA__|static\/chunks|next\/image/, website: 'https://nextjs.org' },
  { name: 'React', category: 'Library', pattern: /react-dom|react\.development|react-root/, website: 'https://react.dev' },
  { name: 'Svelte', category: 'Framework', pattern: /svelte-|__svelte/, website: 'https://svelte.dev' },
  { name: 'Vue.js', category: 'Framework', pattern: /v-if|data-v-|__vue__/, website: 'https://vuejs.org' },
  { name: 'Nuxt.js', category: 'Framework', pattern: /__NUXT__/, website: 'https://nuxt.com' },
  { name: 'Astro', category: 'Framework', pattern: /astro-/, website: 'https://astro.build' },
  { name: 'Angular', category: 'Framework', pattern: /ng-version|ng-root/, website: 'https://angular.io' },
  { name: 'jQuery', category: 'Library', pattern: /jquery\.min\.js|jquery-/, website: 'https://jquery.com' },

  // UI & Styling
  { name: 'Tailwind CSS', category: 'Styling', pattern: /tailwind\.config|tw-|text-neutral/, website: 'https://tailwindcss.com' },
  { name: 'Bootstrap', category: 'Styling', pattern: /bootstrap\.min\.css|bootstrap-/, website: 'https://getbootstrap.com' },
  { name: 'Framer Motion', category: 'Animation', pattern: /framer-motion/, website: 'https://framer.com/motion' },
  { name: 'GSAP', category: 'Animation', pattern: /gsap|ScrollTrigger/, website: 'https://greensock.com/gsap' },
  { name: 'Three.js', category: 'Graphics', pattern: /three\.js|THREE\./, website: 'https://threejs.org' },

  // Analytics & Marketing
  { name: 'Google Analytics', category: 'Analytics', pattern: /googletagmanager\.com|google-analytics\.com|UA-[0-9]+-[0-9]+/, website: 'https://analytics.google.com' },
  { name: 'Umami', category: 'Analytics', pattern: /umami\.js|data-website-id/, website: 'https://umami.is' },
  { name: 'Mixpanel', category: 'Analytics', pattern: /mixpanel\.com/, website: 'https://mixpanel.com' },
  { name: 'Hotjar', category: 'Analytics', pattern: /static\.hotjar\.com/, website: 'https://hotjar.com' },

  // Privacy-Focused Analytics
  { name: 'Plausible', category: 'Analytics', pattern: /plausible/i, website: 'https://plausible.io' },
  { name: 'Fathom', category: 'Analytics', pattern: /fathom/i, website: 'https://usefathom.com' },
  { name: 'Matomo', category: 'Analytics', pattern: /matomo|i18n_stats|pixel\.php/i, website: 'https://matomo.org' },
  { name: 'Pirsch', category: 'Analytics', pattern: /pirsch/i, website: 'https://pirsch.io' },
  { name: 'Ackee', category: 'Analytics', pattern: /ackee/i, website: 'https://ackee.electerious.com' },
  { name: 'Simple Analytics', category: 'Analytics', pattern: /simpleanalytics/i, website: 'https://simpleanalytics.com' },
  { name: 'Cabin', category: 'Analytics', pattern: /cabin/i, website: 'https://cabin.io' },

  // More Hosting Platforms
  { name: 'Railway', category: 'Hosting', pattern: /railway/i, website: 'https://railway.app' },
  { name: 'Render', category: 'Hosting', pattern: /onrender\.com/i, website: 'https://render.com' },
  { name: 'Fly.io', category: 'Hosting', pattern: /fly\.io/i, website: 'https://fly.io' },
  { name: 'Supabase', category: 'Hosting', pattern: /supabase/i, website: 'https://supabase.com' },
  { name: 'Heroku', category: 'Hosting', pattern: /herokuapp\.com/i, website: 'https://heroku.com' },

  // More CDNs
  { name: 'Bunny CDN', category: 'CDN', pattern: /bunnycdn/i, website: 'https://bunny.net' },
  { name: 'KeyCDN', category: 'CDN', pattern: /keycdn/i, website: 'https://keycdn.com' },
  { name: 'StackPath', category: 'CDN', pattern: /stackpath/i, website: 'https://stackpath.com' },

  // More CMS
  { name: 'Strapi', category: 'CMS', pattern: /strapi/i, website: 'https://strapi.io' },
  { name: 'Contentful', category: 'CMS', pattern: /contentful/i, website: 'https://contentful.com' },
  { name: 'Sanity', category: 'CMS', pattern: /sanity|i32v9/i, website: 'https://sanity.io' },

  // Database & ORM
  { name: 'Prisma', category: 'ORM', pattern: /prisma/i, website: 'https://prisma.io' },

  // Email Services
  { name: 'Mailgun', category: 'Email', pattern: /mailgun/i, website: 'https://mailgun.com' },
  { name: 'SendGrid', category: 'Email', pattern: /sendgrid/i, website: 'https://sendgrid.com' },
  { name: 'Postmark', category: 'Email', pattern: /postmark/i, website: 'https://postmarkapp.com' },
  { name: 'Resend', category: 'Email', pattern: /resend/i, website: 'https://resend.com' },

  // Live Chat
  { name: 'Tawk.to', category: 'Chat', pattern: /tawk\.to/i, website: 'https://tawk.to' },
  { name: 'LiveChat', category: 'Chat', pattern: /livechat/i, website: 'https://livechat.com' },

  // Push Notifications
  { name: 'OneSignal', category: 'Push', pattern: /onesignal/i, website: 'https://onesignal.com' },
  { name: 'Pusher', category: 'Push', pattern: /pusher/i, website: 'https://pusher.com' },

  // Maps
  { name: 'Mapbox', category: 'Maps', pattern: /mapbox/i, website: 'https://mapbox.com' },
  { name: 'Leaflet', category: 'Maps', pattern: /leaflet/i, website: 'https://leafletjs.com' },

  // Forms
  { name: 'Typeform', category: 'Forms', pattern: /typeform/i, website: 'https://typeform.com' },
  { name: 'Formspree', category: 'Forms', pattern: /formspree/i, website: 'https://formspree.io' },
  { name: 'JotForm', category: 'Forms', pattern: /jotform/i, website: 'https://jotform.com' },

  // CMS & E-commerce
  { name: 'WordPress', category: 'CMS', pattern: /wp-content|wp-includes|WordPress/, website: 'https://wordpress.org' },
  { name: 'Shopify', category: 'E-commerce', pattern: /shopify\.com|cdn\.shopify\.com/, website: 'https://shopify.com' },
  { name: 'Webflow', category: 'CMS', pattern: /webflow\.com|w-custom-css/, website: 'https://webflow.com' },
  { name: 'Magento', category: 'E-commerce', pattern: /magento/i, website: 'https://adobe.com/commerce' },

  // Servers & Backend
  { name: 'Nginx', category: 'Web Server', pattern: /nginx/i, header: 'Server' },
  { name: 'Apache', category: 'Web Server', pattern: /apache/i, header: 'Server' },
  { name: 'TypeScript', category: 'Language', pattern: /\.ts|typescript/i, header: 'X-Powered-By' },
  { name: 'PHP', category: 'Language', pattern: /php/i, header: 'X-Powered-By' },
  { name: 'Node.js', category: 'Runtime', pattern: /node\.js|express/i, header: 'X-Powered-By' },

  // Payments & Services
  { name: 'Stripe', category: 'Payments', pattern: /js\.stripe\.com/, website: 'https://stripe.com' },
  { name: 'Intercom', category: 'Support', pattern: /intercom\.io/, website: 'https://intercom.com' },
  { name: 'Sentry', category: 'Monitoring', pattern: /sentry\.io/, website: 'https://sentry.io' }
];

export const socialPatterns = [
  { platform: 'Twitter', pattern: /twitter\.com\/([\w]+)/ },
  { platform: 'GitHub', pattern: /github\.com\/([\w]+)/ },
  { platform: 'LinkedIn', pattern: /linkedin\.com\/company\/([\w-]+)/ },
  { platform: 'Instagram', pattern: /instagram\.com\/([\w]+)/ }
];

export interface WAFRule {
  name: string;
  pattern: RegExp;
  type: 'header' | 'cookie' | 'body' | 'status';
}

export const wafRules: WAFRule[] = [
  { name: 'Cloudflare', type: 'header', pattern: /__cf|coudflare/i },
  { name: 'Cloudflare', type: 'cookie', pattern: /__cfduid/i },
  { name: 'Cloudflare', type: 'header', pattern: /server:\s*cloudflare/i },
  { name: 'AWS WAF', type: 'header', pattern: /aws-alb\/aws-waf/i },
  { name: 'AWS WAF', type: 'header', pattern: /x-amzn-requestid/i },
  { name: 'ModSecurity', type: 'header', pattern: /mod_security|modsecurity/i },
  { name: 'Sucuri', type: 'header', pattern: /X-Sucuri|X-SWR/i },
  { name: 'Wordfence', type: 'cookie', pattern: /wordfence_verified/i },
  { name: 'Wordfence', type: 'body', pattern: /wordfence/i },
  { name: 'Akamai', type: 'header', pattern: /X-Akamai|AkamaiGHost/i },
  { name: 'Fastly', type: 'header', pattern: /X-Served-By|X-Cache.*fastly/i },
  { name: 'Imperva', type: 'cookie', pattern: /incap_ses/i },
  { name: 'Imperva', type: 'header', pattern: /X-CDN|X-Iinfo/i },
  { name: 'StackPath', type: 'header', pattern: /X-Page-Speed|x-srv/i },
  { name: 'EdgeWall', type: 'header', pattern: /barracuda/i },
  { name: 'FortiWeb', type: 'header', pattern: /fortiweb/i },
  { name: 'F5 ASM', type: 'header', pattern: /X-F5-Auth/i },
  { name: 'F5 ASM', type: 'cookie', pattern: /F5_ST/i },
  { name: 'Azure WAF', type: 'header', pattern: /X-ASPNETCORE/i },
  { name: 'CloudFront', type: 'status', pattern: /403\s+Forbidden/i },
  { name: 'NinjaFirewall', type: 'cookie', pattern: /ninja/i },
  { name: 'Artillery', type: 'header', pattern: /artillery/i }
];
