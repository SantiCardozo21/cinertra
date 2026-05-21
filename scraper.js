// Vercel Edge Function - Scraper automático
// Se ejecuta cuando se llama a /api/scraper
// Configurar en Vercel como cron job: cada día a las 3am

export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://hrbzennsghftwjxtqeeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnplbm5zZ2hmdHdqeHRxZWVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg4OTY3MTYsImV4cCI6MjA5NDQ3MjcxNn0.Yn5iBBEPOvoZ7G5qSFHf7nyDwFa7RAYg93mbRUABGAM';
const SCRAPER_SECRET = 'cinetra-scraper-2024'; // clave para proteger el endpoint

async function supabaseUpsert(table, data, conflict) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Prefer': 'resolution=merge-duplicates'
    },
    body: JSON.stringify(Array.isArray(data) ? data : [data])
  });
  return res.ok;
}

async function fetchHTML(url) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html,application/xhtml+xml',
      'Accept-Language': 'es-AR,es;q=0.9',
    }
  });
  return res.text();
}

// Scraping de PoseidonHD
async function scrapePoseidon() {
  const results = { peliculas: 0, series: 0, errores: 0 };
  
  try {
    // Películas - página 1 y 2
    for (let page = 1; page <= 3; page++) {
      const html = await fetchHTML(`https://www.poseidonhd2.co/peliculas?page=${page}`);
      
      // Extraer películas con regex
      const pelRegex = /href="(\/pelicula\/\d+\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<h2[^>]*>([^<]+)<\/h2>[\s\S]*?(\d{4})/g;
      let match;
      const peliculas = [];
      
      while ((match = pelRegex.exec(html)) !== null) {
        const url = `https://www.poseidonhd2.co${match[1]}`;
        const poster = match[2].startsWith('http') ? match[2] : `https://www.poseidonhd2.co${match[2]}`;
        const titulo = match[3].trim();
        const anio = match[4];
        
        // Extraer género del HTML
        const generoMatch = html.substring(match.index, match.index + 500).match(/Género[:\s]*([^<\n]+)/);
        const genero = generoMatch ? generoMatch[1].trim().substring(0, 100) : '';
        
        peliculas.push({
          titulo,
          anio,
          genero,
          poster_url: poster,
          link_reproduccion: url,
          plataforma: 'PoseidonHD',
          sinopsis: '',
          duracion: ''
        });
      }
      
      if (peliculas.length > 0) {
        const ok = await supabaseUpsert('peliculas', peliculas, 'titulo');
        if (ok) results.peliculas += peliculas.length;
        else results.errores++;
      }
      
      // Esperar entre requests para no sobrecargar
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // Últimos episodios de series
    const epsHtml = await fetchHTML('https://www.poseidonhd2.co/episodios');
    const epRegex = /href="(\/serie\/(\d+)\/([^\/]+)\/temporada\/(\d+)\/episodio\/(\d+))"[^>]*>[\s\S]*?([^<\n]{3,50})\s*\d+x\d+/g;
    let epMatch;
    const seriesMap = {};
    
    while ((epMatch = epRegex.exec(epsHtml)) !== null) {
      const url = `https://www.poseidonhd2.co${epMatch[1]}`;
      const serieId = epMatch[2];
      const serieSlug = epMatch[3];
      const temp = parseInt(epMatch[4]);
      const ep = parseInt(epMatch[5]);
      const titulo = serieSlug.replace(/-/g,' ').replace(/\b\w/g, l => l.toUpperCase());
      
      if (!seriesMap[serieId]) {
        seriesMap[serieId] = {
          titulo,
          plataforma: 'PoseidonHD',
          episodios: {},
          temporadas: 0,
          ultimo_episodio: 0,
          genero: '',
          sinopsis: '',
          poster_url: '',
          anio: ''
        };
      }
      
      if (!seriesMap[serieId].episodios[temp]) seriesMap[serieId].episodios[temp] = [];
      seriesMap[serieId].episodios[temp].push({ ep, titulo: `Episodio ${ep}`, link: url });
      seriesMap[serieId].temporadas = Math.max(seriesMap[serieId].temporadas, temp);
      seriesMap[serieId].ultimo_episodio = Math.max(seriesMap[serieId].ultimo_episodio, ep);
    }
    
    const seriesList = Object.values(seriesMap);
    if (seriesList.length > 0) {
      const ok = await supabaseUpsert('series', seriesList, 'titulo');
      if (ok) results.series += seriesList.length;
    }
    
  } catch (e) {
    results.errores++;
    console.error('Error scraping PoseidonHD:', e);
  }
  
  return results;
}

// Scraping de AnimeFLV
async function scrapeAnimeFLV() {
  const results = { anime: 0, errores: 0 };
  
  try {
    const html = await fetchHTML('https://www3.animeflv.net/browse?order=updated');
    
    const animeRegex = /href="(\/anime\/[^"]+)"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g;
    let match;
    const animes = [];
    
    while ((match = animeRegex.exec(html)) !== null) {
      const url = `https://www3.animeflv.net${match[1]}`;
      const poster = match[2].startsWith('http') ? match[2] : `https://www3.animeflv.net${match[2]}`;
      const titulo = match[3].trim();
      
      animes.push({
        titulo,
        plataforma: 'AnimeFLV',
        poster_url: poster,
        episodios: {},
        temporadas: 1,
        ultimo_episodio: 0,
        genero: 'Anime',
        sinopsis: '',
        anio: ''
      });
    }
    
    if (animes.length > 0) {
      const ok = await supabaseUpsert('anime', animes, 'titulo');
      if (ok) results.anime += animes.length;
    }
    
  } catch (e) {
    results.errores++;
    console.error('Error scraping AnimeFLV:', e);
  }
  
  return results;
}

export default async function handler(req) {
  // Verificar secret para evitar accesos no autorizados
  const url = new URL(req.url);
  const secret = url.searchParams.get('secret');
  
  if (secret !== SCRAPER_SECRET) {
    return new Response(JSON.stringify({ error: 'No autorizado' }), { status: 401 });
  }

  const source = url.searchParams.get('source') || 'all';
  const resultados = {};

  if (source === 'all' || source === 'poseidon') {
    resultados.poseidon = await scrapePoseidon();
  }
  if (source === 'all' || source === 'animeflv') {
    resultados.animeflv = await scrapeAnimeFLV();
  }

  return new Response(JSON.stringify({ 
    ok: true, 
    timestamp: new Date().toISOString(),
    resultados 
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
