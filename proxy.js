// Proxy para cargar páginas sin restricciones de CORS/iframe
export const config = { runtime: 'edge' };

const ALLOWED_DOMAINS = [
  'poseidonhd2.co',
  'pelisjuanita.com', 
  'www4.animeflv.net',
  'pelotalibretv.su',
  'pelisplushd.bz'
];

export default async function handler(req) {
  const url = new URL(req.url);
  const targetUrl = url.searchParams.get('url');
  
  if (!targetUrl) {
    return new Response('URL requerida', { status: 400 });
  }
  
  // Verificar que el dominio está permitido
  try {
    const targetDomain = new URL(targetUrl).hostname.replace('www.','');
    const isAllowed = ALLOWED_DOMAINS.some(d => targetDomain.includes(d));
    if (!isAllowed) {
      return new Response('Dominio no permitido', { status: 403 });
    }
  } catch {
    return new Response('URL inválida', { status: 400 });
  }
  
  // Hacer el fetch de la página
  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': targetUrl,
    }
  });
  
  let html = await res.text();
  
  // Reemplazar URLs relativas con absolutas
  const baseUrl = new URL(targetUrl).origin;
  html = html
    .replace(/src="\//g, `src="${baseUrl}/`)
    .replace(/href="\//g, `href="${baseUrl}/`)
    .replace(/action="\//g, `action="${baseUrl}/`)
    // Quitar headers que bloquean iframe
    .replace(/<meta[^>]*X-Frame-Options[^>]*>/gi, '')
    .replace(/<meta[^>]*Content-Security-Policy[^>]*>/gi, '');
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Frame-Options': 'ALLOWALL',
      'Access-Control-Allow-Origin': '*',
    }
  });
}
