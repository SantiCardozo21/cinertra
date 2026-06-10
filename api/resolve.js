export const config = { runtime: 'edge' };

const PELISJUANITA_BASE = 'https://pelisjuanita.com';

async function fetchMovieInfo(slug) {
  const res = await fetch(`${PELISJUANITA_BASE}/movies/movieInfo.php?title=${slug}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Referer': `${PELISJUANITA_BASE}/movies/pelicula/${slug}`,
      'Accept': 'text/html,application/xhtml+xml',
    }
  });
  if (!res.ok) return { error: res.status, text: await res.text() };
  return { ok: true, text: await res.text() };
}

function extractPlayerUrls(html) {
  const urls = [];
  const regex = /data-url='(https?:\/\/[^']+)'/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    const url = match[1];
    if (!url.includes('youtube') && !url.includes('1fichier')) {
      urls.push(url);
    }
  }
  return [...new Set(urls)];
}

async function resolveStreamwish(embedUrl) {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': PELISJUANITA_BASE,
      }
    });
    const html = await res.text();
    const regexes = [
      /"hls"\s*:\s*"([^"]+\.m3u8[^"]*?)"/,
      /"file":\s*"([^"]+\.m3u8[^"]*)"/,
      /"url_hls"\s*:\s*"([^"]+\.m3u8[^"]*?)"/,
      /"source"\s*:\s*"([^"]+\.m3u8[^"]*?)"/,
      /file:\s*["']([^"']+\.m3u8[^"']*?)["']/,
      /https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/,
    ];
    for (const regex of regexes) {
      const match = html.match(regex);
      if (match) {
        const url = (match[1] || match[0]).replace(/\\/g, '');
        if (url.includes('.m3u8')) return url;
      }
    }
    return null;
  } catch (_e) { return null; }
}

async function resolveVoe(embedUrl) {
  try {
    const res = await fetch(embedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Referer': PELISJUANITA_BASE,
      }
    });
    const html = await res.text();
    const match = html.match(/'hls'\s*:\s*'([^']+\.m3u8[^']*)'/) ||
                  html.match(/"hls"\s*:\s*"([^"]+\.m3u8[^"]*)"/) ||
                  html.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/);
    if (match) return (match[1] || match[0]).replace(/\\/g, '');
    return null;
  } catch (_e) { return null; }
}

export default async function handler(req) {
  const url = new URL(req.url);
  const pageUrl = url.searchParams.get('url');

  if (!pageUrl) {
    return new Response(JSON.stringify({ error: 'URL requerida' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  try {
    const slug = pageUrl.split('/').pop();

    const movieResult = await fetchMovieInfo(slug);
    if (!movieResult.ok) {
      return new Response(JSON.stringify({
        error: 'No se pudo obtener info de la pelicula',
        slug,
        status: movieResult.error,
        detail: movieResult.text?.substring(0, 300)
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const playerUrls = extractPlayerUrls(movieResult.text);

    if (!playerUrls.length) {
      return new Response(JSON.stringify({
        error: 'No se encontraron servidores',
        slug,
        htmlPreview: movieResult.text.substring(0, 500)
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const debugServer = url.searchParams.get('debug');
    if (debugServer) {
      const res = await fetch(playerUrls[2], {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
          'Referer': PELISJUANITA_BASE,
        }
      });
      const html = await res.text();
      return new Response(JSON.stringify({
        server: playerUrls[0],
        status: res.status,
        htmlPreview: html.substring(0, 2000)
      }), {
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    for (const playerUrl of playerUrls) {
      let m3u8 = null;
      if (playerUrl.includes('streamwish') || playerUrl.includes('bysesukior') || playerUrl.includes('playnixes')) {
        m3u8 = await resolveStreamwish(playerUrl);
      } else if (playerUrl.includes('voe.sx')) {
        m3u8 = await resolveVoe(playerUrl);
      } else {
        m3u8 = await resolveStreamwish(playerUrl);
      }
      if (m3u8) {
        return new Response(JSON.stringify({
          ok: true, m3u8, server: playerUrl, allServers: playerUrls
        }), {
          headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
        });
      }
    }

    return new Response(JSON.stringify({
      error: 'No se pudo resolver el m3u8', servers: playerUrls
    }), {
      status: 404,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
