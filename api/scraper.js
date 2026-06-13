export const config = { runtime: 'edge' };

const SUPABASE_URL = 'https://hrbzennsghftwjxtqeeg.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhyYnplbm5zZ2hmdHdqeHRxZWVnIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3ODg5NjcxNiwiZXhwIjoyMDk0NDcyNzE2fQ.FUBJ-ZVeRWq9QTfN5V-xOIdU_tjMEWIPgV_hvndXiiM';
const SECRET = 'cinetra-scraper-2024';
const JUANITA_BASE = 'https://pelisjuanita.com';
const POSEIDON_BASE = 'https://www.poseidonhd2.co';
const JKANIME_BASE = 'https://jkanime.net';

async function dbUpsert(table, data, conflict) {
  if (!data?.length) return true;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?on_conflict=${conflict}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify(data)
  });
  return res.ok;
}

async function dbUpdate(table, match, data) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${match}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data)
  });
  return res.ok;
}

async function dbDelete(table, column, value) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${column}=eq.${encodeURIComponent(value)}`, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' }
  });
  return res.ok;
}

async function dbInsert(table, data) {
  if (!data?.length) return true;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' },
    body: JSON.stringify(data)
  });
  return res.ok;
}

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/json',
        'Accept-Language': 'es-AR,es;q=0.9',
        'Referer': JUANITA_BASE
      }
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (_e) { return null; }
}

function decodeHtmlEntities(str) {
  return str
    .replace(/&aacute;/g,'á').replace(/&eacute;/g,'é').replace(/&iacute;/g,'í')
    .replace(/&oacute;/g,'ó').replace(/&uacute;/g,'ú').replace(/&ntilde;/g,'ñ')
    .replace(/&Aacute;/g,'Á').replace(/&Eacute;/g,'É').replace(/&Iacute;/g,'Í')
    .replace(/&Oacute;/g,'Ó').replace(/&Uacute;/g,'Ú').replace(/&Ntilde;/g,'Ñ')
    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>')
    .replace(/&quot;/g,'"').replace(/&#39;/g,"'")
    .replace(/\s+/g,' ').trim();
}

// -- PoseidonHD2 ---------------------------------------------------------------
async function getPoseidonBuildId() {
  const html = await fetchPage(POSEIDON_BASE);
  if (!html) return null;
  const match = html.match(/"buildId"\s*:\s*"([^"]+)"/);
  return match?.[1] || null;
}

async function fetchWithTimeout(url, ms = 5000) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' }
    });
    clearTimeout(t);
    if (!res.ok) return null;
    return await res.text();
  } catch (_e) { return null; }
}

function formatRuntime(mins) {
  if (!mins || mins <= 0) return '';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}min` : `${m}min`;
}

function isHD(videos) {
  const all = [
    ...(videos?.latino || []),
    ...(videos?.spanish || []),
    ...(videos?.english || [])
  ];
  if (!all.length) return false;
  return all.some(v => v.quality && !v.quality.toUpperCase().includes('CAM'));
}

function extractNextData(html) {
  if (!html) return null;
  const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!match) return null;
  try { return JSON.parse(match[1]); } catch (_e) { return null; }
}

function poseidonMovieToDb(m) {
  const slugParts = m.url?.slug?.split('/') || [];
  const id = slugParts[1] || m.TMDbId || '';
  const slugName = slugParts[2] || '';
  const year = m.releaseDate ? m.releaseDate.substring(0, 4) : '';
  return {
    titulo: m.titles?.name || '',
    anio: year,
    genero: m.genres?.map(g => g.name).join(', ') || '',
    duracion: formatRuntime(m.runtime),
    sinopsis: m.overview || '',
    poster_url: m.images?.poster || '',
    link_reproduccion: id ? `${POSEIDON_BASE}/pelicula/${id}/${slugName}` : '',
    plataforma: 'PoseidonHD'
  };
}

function poseidonSerieToDb(s, slugSrc) {
  // s = datos ricos (thisTvshow o serie); slugSrc = fuente de URL (serie del listado)
  const src = slugSrc || s;
  const slugParts = src.url?.slug?.split('/') || [];
  const id = slugParts[1] || src.TMDbId || s.TMDbId || '';
  const slugName = slugParts[2] || '';
  const year = (s.releaseDate || src.releaseDate || '').substring(0, 4);
  return {
    titulo: s.titles?.name || src.titles?.name || '',
    anio: year,
    genero: s.genres?.map(g => g.name).join(', ') || src.genres?.map(g => g.name).join(', ') || '',
    sinopsis: s.overview || src.overview || '',
    poster_url: s.images?.poster || src.images?.poster || '',
    plataforma: 'PoseidonHD',
    episodios: {},
    temporadas: 1,
    ultimo_episodio: 0,
    link: id ? `${POSEIDON_BASE}/serie/${id}/${slugName}` : ''
  };
}

async function checkPoseidonMovieHD(movie) {
  const slugParts = movie.url?.slug?.split('/') || [];
  const id = slugParts[1] || movie.TMDbId || '';
  const slugName = slugParts[2] || '';
  if (!id) return null;
  const html = await fetchWithTimeout(`${POSEIDON_BASE}/pelicula/${id}/${slugName}`, 5000);
  const nextData = extractNextData(html);
  if (!nextData) return null;
  const videos = nextData?.props?.pageProps?.thisMovie?.videos;
  if (!videos || !isHD(videos)) return null;
  return poseidonMovieToDb(movie);
}

async function checkPoseidonSerieHD(serie) {
  const slugParts = serie.url?.slug?.split('/') || [];
  const id = slugParts[1] || serie.TMDbId || '';
  const slugName = slugParts[2] || '';
  if (!id) return null;
  const html = await fetchWithTimeout(`${POSEIDON_BASE}/serie/${id}/${slugName}`, 5000);
  const nextData = extractNextData(html);
  if (!nextData) return null;
  const thisTvshow = nextData?.props?.pageProps?.thisTvshow;
  const videos = thisTvshow?.videos || nextData?.props?.pageProps?.thisMovie?.videos;
  if (!videos || !isHD(videos)) return null;
  // Usar thisTvshow (página individual) para datos ricos; serie para URL/slug
  return poseidonSerieToDb(thisTvshow || serie, serie);
}

async function scrapePoseidonMovies(page) {
  const buildId = await getPoseidonBuildId();
  if (!buildId) return 0;
  const raw = await fetchPage(`${POSEIDON_BASE}/_next/data/${buildId}/es/peliculas.json?page=${page}`);
  if (!raw) return 0;
  let data;
  try { data = JSON.parse(raw); } catch (_e) { return 0; }
  const movies = data?.pageProps?.movies || [];
  if (!movies.length) return 0;
  const CONCURRENCY = 4;
  const hdMovies = [];
  for (let i = 0; i < movies.length; i += CONCURRENCY) {
    const batch = movies.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(m => checkPoseidonMovieHD(m)));
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) hdMovies.push(r.value); });
  }
  if (hdMovies.length) await dbUpsert('peliculas', hdMovies, 'titulo');
  return hdMovies.length;
}

async function scrapePoseidonSeries(page) {
  const buildId = await getPoseidonBuildId();
  if (!buildId) return 0;
  const raw = await fetchPage(`${POSEIDON_BASE}/_next/data/${buildId}/es/series.json?page=${page}`);
  if (!raw) return 0;
  let data;
  try { data = JSON.parse(raw); } catch (_e) { return 0; }
  const series = data?.pageProps?.tvshows || data?.pageProps?.series || [];
  if (!series.length) return 0;
  const CONCURRENCY = 4;
  const hdSeries = [];
  for (let i = 0; i < series.length; i += CONCURRENCY) {
    const batch = series.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(batch.map(s => checkPoseidonSerieHD(s)));
    results.forEach(r => { if (r.status === 'fulfilled' && r.value) hdSeries.push(r.value); });
  }
  if (hdSeries.length) await dbUpsert('series', hdSeries, 'titulo');
  return hdSeries.length;
}

// -- JKAnime -------------------------------------------------------------------
async function scrapeJKAnimePage(page) {
  const url = `${JKANIME_BASE}/directorio?orden=titulo&page=1&p=${page}`;
  const html = await fetchWithTimeout(url, 8000);
  if (!html) return 0;
  const match = html.match(/var animes\s*=\s*(\{[\s\S]*?\});\s*\n/);
  if (!match) return 0;
  let data;
  try { data = JSON.parse(match[1]); } catch (_e) { return 0; }
  const items = data?.data || [];
  if (!items.length) return 0;
  const results = items.map(item => ({
    titulo:          item.title    || '',
    slug:            item.slug     || '',
    anio:            '',
    genero:          'Anime',
    sinopsis:        item.synopsis || '',
    poster_url:      item.image    || '',
    plataforma:      'JKAnime',
    temporadas:      1,
    ultimo_episodio: 0,
    episodios:       {}
  })).filter(r => r.titulo && r.slug);
  if (results.length) await dbUpsert('anime', results, 'titulo');
  return results.length;
}

// -- PelisJuanita parsers ------------------------------------------------------
function parseMoviePage(html) {
  if (!html) return null;
  const sinopsisMatch = html.match(/<p class="sinopsis">([^<]+)<\/p>/);
  const sinopsis = sinopsisMatch?.[1]?.trim() || '';
  const sGeneroMatch = html.match(/<p id=['"]sGenero['"]>([\s\S]*?)<\/p>/);
  const generos = [];
  if (sGeneroMatch) {
    const tagMatches = [...sGeneroMatch[1].matchAll(/class="badge-etiqueta"[^>]*>[\s\S]*?<\/i>\s*([^<\n\r]+)/g)];
    tagMatches.forEach(m => { const g = m[1].trim(); if (g) generos.push(g); });
  }
  const duracionMatch = html.match(/<span>(\d+ min\.)<\/span>/);
  return { sinopsis, genero: generos.join(', '), duracion: duracionMatch?.[1] || '' };
}

function parseSeriesInfoPage(html) {
  if (!html) return null;
  // Sinopsis
  const sinopsisMatch = html.match(/<p[^>]*class="sinopsis"[^>]*>([\s\S]*?)<\/p>/) ||
                        html.match(/<div[^>]*class="sinopsis"[^>]*>([\s\S]*?)<\/div>/) ||
                        html.match(/<meta name="description" content="([^"]+)"/) ;
  const sinopsis = (sinopsisMatch?.[1] || '').replace(/<[^>]+>/g, '').trim();
  // Generos
  const generos = [];
  const sGeneroMatch = html.match(/<p id="sGenero">([\s\S]*?)<\/p>/);
  if (sGeneroMatch) {
    const tagMatches = sGeneroMatch[1].matchAll(/class="badge[^"]*"[^>]*>([\s\S]*?)<\/[a-z]/g);
    for (const m of tagMatches) {
      const g = m[1].replace(/<[^>]+>/g, '').trim();
      if (g && g.length > 1) generos.push(g);
    }
  }
  if (!generos.length) {
    const genreLinks = html.matchAll(/class="genre"[^>]*>([^<]+)<\/a>/g);
    for (const m of genreLinks) {
      const g = m[1].trim();
      if (g) generos.push(g);
    }
  }
  if (!generos.length) {
    const badgeLinks = html.matchAll(/class="badge[^"]*"[^>]*>([^<]+)<\//g);
    for (const m of badgeLinks) {
      const g = m[1].trim();
      if (g && g.length > 1 && g.length < 30) generos.push(g);
    }
  }
  return { sinopsis, genero: generos.join(', ') };
}

async function enrichPeliculas(batch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/peliculas?or=(genero.eq.,genero.is.null)&plataforma=eq.PelisJuanita&select=titulo,link_reproduccion,link&limit=${batch}&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const movies = await res.json();
  if (!Array.isArray(movies) || !movies.length) return 0;
  let enriched = 0;
  for (const movie of movies) {
    const slug = movie.link_reproduccion?.split('/').pop();
    if (!slug) continue;
    const html = await fetchPage(`${JUANITA_BASE}/movies/movieInfo.php?title=${slug}`);
    if (!html) { await dbUpdate('peliculas', `titulo=eq.${encodeURIComponent(movie.titulo)}`, { genero: '-' }); continue; }
    const info = parseMoviePage(html);
    if (!info) continue;
    await dbUpdate('peliculas', `titulo=eq.${encodeURIComponent(movie.titulo)}`, { genero: info.genero || '-', sinopsis: info.sinopsis, duracion: info.duracion });
    enriched++;
  }
  return enriched;
}

async function populateJuanitaSerieEpisodes(batch) {
  // Series PelisJuanita con solo 1 episodio placeholder (ultimo_episodio=1) o sin episodios (=0)
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/series?plataforma=eq.PelisJuanita&or=(ultimo_episodio.eq.0,ultimo_episodio.eq.1)&select=titulo&limit=${batch}&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const series = await res.json();
  if (!Array.isArray(series) || !series.length) return 0;
  let count = 0;
  for (const s of series) {
    const info = await scrapeJuanitaSerieInfo(s.titulo);
    if (!info || !Object.keys(info.episodios).length) {
      // Marcar como procesada para no re-intentar
      await dbUpdate('series', `titulo=eq.${encodeURIComponent(s.titulo)}`, { ultimo_episodio: -1 });
      continue;
    }
    await dbUpdate('series', `titulo=eq.${encodeURIComponent(s.titulo)}`, {
      episodios:       info.episodios,
      temporadas:      info.temporadas,
      ultimo_episodio: info.ultimo_episodio,
      poster_url:      info.poster_url || undefined,
      anio:            info.anio || undefined
    });
    count++;
  }
  return count;
}

async function populatePoseidonSerieEpisodes(batch) {
  const buildId = await getPoseidonBuildId();
  if (!buildId) return 0;

  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/series?plataforma=eq.PoseidonHD&ultimo_episodio=eq.0&select=titulo,link&limit=${batch}&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const series = await res.json();
  if (!Array.isArray(series) || !series.length) return 0;

  let count = 0;
  for (const s of series) {
    if (!s.link) {
      await dbUpdate('series', `titulo=eq.${encodeURIComponent(s.titulo)}`, { ultimo_episodio: -1 });
      continue;
    }

    // Extraer id y slug del link: /serie/{id}/{slug}
    const parts = s.link.replace(/\/$/, '').split('/');
    const id = parts[parts.length - 2];
    const slug = parts[parts.length - 1];

    if (!id || !slug) {
      await dbUpdate('series', `titulo=eq.${encodeURIComponent(s.titulo)}`, { ultimo_episodio: -1 });
      continue;
    }

    // Usar _next/data para obtener datos completos de la serie
    const nextUrl = `${POSEIDON_BASE}/_next/data/${buildId}/es/serie/${id}/${slug}.json`;
    const raw = await fetchPage(nextUrl);
    if (!raw) {
      await dbUpdate('series', `titulo=eq.${encodeURIComponent(s.titulo)}`, { ultimo_episodio: -1 });
      continue;
    }

    let pageData;
    try { pageData = JSON.parse(raw); } catch (_) {
      await dbUpdate('series', `titulo=eq.${encodeURIComponent(s.titulo)}`, { ultimo_episodio: -1 });
      continue;
    }

    const tvshow = pageData?.pageProps?.thisTvshow;
    if (!tvshow) {
      await dbUpdate('series', `titulo=eq.${encodeURIComponent(s.titulo)}`, { ultimo_episodio: -1 });
      continue;
    }

    // Intentar extraer temporadas del objeto thisTvshow
    const numSeasons = tvshow.numSeasons || tvshow.seasons?.length || tvshow.number_of_seasons || 1;
    const episodios = {};
    let maxTemp = 0, maxEp = 0;

    // Si hay información de episodios en el JSON
    if (tvshow.seasons && Array.isArray(tvshow.seasons)) {
      for (const season of tvshow.seasons) {
        const t = season.season_number || season.number || season.seasonNumber;
        const epCount = season.episode_count || season.episodesCount || season.episodeCount || 0;
        if (!t || !epCount) continue;
        episodios[t] = [];
        for (let ep = 1; ep <= epCount; ep++) {
          episodios[t].push({
            ep,
            titulo: `Episodio ${ep}`,
            link: `${POSEIDON_BASE}/serie/${id}/${slug}/${t}x${String(ep).padStart(2,'0')}`
          });
          maxEp = Math.max(maxEp, ep);
        }
        maxTemp = Math.max(maxTemp, t);
      }
    }

    // Fallback: construir episodios desde el HTML si no hay info de temporadas en JSON
    if (!maxTemp) {
      const html = await fetchWithTimeout(s.link, 6000);
      if (html) {
        const epRegex = new RegExp(`/serie/${id}/${slug}/(\\d+)x(\\d+)`, 'g');
        let m;
        while ((m = epRegex.exec(html)) !== null) {
          const t = parseInt(m[1]), ep = parseInt(m[2]);
          if (!episodios[t]) episodios[t] = [];
          if (!episodios[t].find(e => e.ep === ep)) {
            episodios[t].push({ ep, titulo: `Episodio ${ep}`, link: `${POSEIDON_BASE}/serie/${id}/${slug}/${t}x${String(ep).padStart(2,'0')}` });
            maxTemp = Math.max(maxTemp, t);
            maxEp = Math.max(maxEp, ep);
          }
        }
      }
    }

    // Si sigue sin episodios, al menos crear la T1E1 con el link disponible
    if (!maxTemp) {
      episodios[1] = [{ ep: 1, titulo: 'Episodio 1', link: `${POSEIDON_BASE}/serie/${id}/${slug}/1x01` }];
      maxTemp = 1; maxEp = 1;
    }

    Object.keys(episodios).forEach(t => { episodios[t].sort((a, b) => a.ep - b.ep); });

    await dbUpdate('series', `titulo=eq.${encodeURIComponent(s.titulo)}`, {
      episodios, temporadas: maxTemp, ultimo_episodio: maxEp
    });
    count++;
  }
  return count;
}

async function enrichSeries(batch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/series?or=(genero.eq.,genero.is.null)&plataforma=eq.PelisJuanita&select=titulo,link&limit=${batch}&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const series = await res.json();
  if (!Array.isArray(series) || !series.length) return 0;
  let enriched = 0;
  for (const serie of series) {
    const html = await fetchPage(`${JUANITA_BASE}/series/serieInfo.php?nombreSerie=${encodeURIComponent(serie.titulo)}`);
    if (!html) { await dbUpdate('series', `titulo=eq.${encodeURIComponent(serie.titulo)}`, { genero: '-' }); continue; }
    const info = parseSeriesInfoPage(html);
    if (!info) continue;
    await dbUpdate('series', `titulo=eq.${encodeURIComponent(serie.titulo)}`, { genero: info.genero || '-', sinopsis: info.sinopsis });
    enriched++;
  }
  return enriched;
}

async function enrichPoseidonSeries(batch) {
  // Busca series PoseidonHD sin sinopsis o genero
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/series?or=(genero.eq.,genero.is.null)&plataforma=eq.PoseidonHD&select=titulo,link&limit=${batch}&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const series = await res.json();
  if (!Array.isArray(series) || !series.length) return 0;
  let enriched = 0;
  for (const serie of series) {
    if (!serie.link) { await dbUpdate('series', `titulo=eq.${encodeURIComponent(serie.titulo)}`, { genero: '-' }); continue; }
    const html = await fetchWithTimeout(serie.link, 6000);
    const nextData = extractNextData(html);
    if (!nextData) { await dbUpdate('series', `titulo=eq.${encodeURIComponent(serie.titulo)}`, { genero: '-' }); continue; }
    const tvshow = nextData?.props?.pageProps?.thisTvshow;
    if (!tvshow) { await dbUpdate('series', `titulo=eq.${encodeURIComponent(serie.titulo)}`, { genero: '-' }); continue; }
    const genero = tvshow.genres?.map(g => g.name).join(', ') || '-';
    const sinopsis = tvshow.overview || '';
    const poster_url = tvshow.images?.poster || '';
    await dbUpdate('series', `titulo=eq.${encodeURIComponent(serie.titulo)}`, { genero, sinopsis, poster_url });
    enriched++;
  }
  return enriched;
}

async function enrichAnime(batch) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/anime?or=(sinopsis.eq.,sinopsis.is.null)&slug=neq.&select=titulo,slug&limit=${batch}&order=created_at.asc`,
    { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
  );
  const animes = await res.json();
  if (!Array.isArray(animes) || !animes.length) return 0;
  let enriched = 0;
  for (const anime of animes) {
    if (!anime.slug) continue;
    const html = await fetchPage(`https://www3.animeflv.net/anime/${anime.slug}`);
    if (!html || !html.includes('class="Nvgnrs"')) {
      await dbUpdate('anime', `titulo=eq.${encodeURIComponent(anime.titulo)}`, { sinopsis: '-' });
      continue;
    }
    const nvgnrsMatch = html.match(/<nav class="Nvgnrs">([\s\S]*?)<\/nav>/);
    const generos = [];
    if (nvgnrsMatch) {
      const genMatches = [...nvgnrsMatch[1].matchAll(/<a[^>]*>([^<]+)<\/a>/g)];
      genMatches.forEach(m => { const g = decodeHtmlEntities(m[1]); if (g && g.length > 1) generos.push(g); });
    }
    const descMatch = html.match(/<div class="Description">\s*<p>([\s\S]*?)<\/p>/);
    const sinopsis = descMatch ? decodeHtmlEntities(descMatch[1].replace(/<[^>]+>/g, ' ')) : '-';
    await dbUpdate('anime', `titulo=eq.${encodeURIComponent(anime.titulo)}`, {
      genero: generos.length ? generos.join(', ') : 'Anime',
      sinopsis: sinopsis || '-'
    });
    enriched++;
  }
  return enriched;
}

// -- PelisJuanita movies/series ------------------------------------------------
function parseMoviesPage(html) {
  if (!html) return [];
  const movies = [];
  const seen = new Set();
  const allLinks = [...html.matchAll(/href=['"][\s]*\/movies\/pelicula\/([^'"\/\s]+)[\s]*['"]/g)];
  for (const linkMatch of allLinks) {
    const slug = linkMatch[1].trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const linkPos = html.indexOf(linkMatch[0]);
    const block = html.substring(linkPos, Math.min(html.length, linkPos + 600));
    const posterMatch = block.match(/src=['"]\s*(https:\/\/image\.tmdb\.org[^'"]+\.(?:jpg|png|webp))\s*['"]/);
    const altMatch = block.match(/alt=['"]([^'"]+)['"]/);
    const yearMatch = block.match(/class=['"][\s]*right[\s]*['"]>\s*(\d{4})/);
    const h2Match = block.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const titulo = (altMatch?.[1] || h2Match?.[1] || slug.replace(/-/g, ' ')).trim();
    if (!titulo) continue;
    movies.push({ titulo, anio: yearMatch?.[1] || '', genero: '', duracion: '', sinopsis: '', poster_url: posterMatch?.[1]?.trim() || '', link_reproduccion: `${JUANITA_BASE}/movies/pelicula/${slug}`, plataforma: 'PelisJuanita' });
  }
  return movies;
}

async function scrapeJuanitaMovies(page) {
  return parseMoviesPage(await fetchPage(`${JUANITA_BASE}/movies/movies.php?populares=1&page=${page}`));
}

function parseSeriesPage(html) {
  if (!html) return [];
  const series = [];
  const seen = new Set();
  const allLinks = [...html.matchAll(/href=['"][\s]*ver-serie\/([^'"\/\s\-][^'"\/\s]*)[\s]*['"]/g)];
  for (const linkMatch of allLinks) {
    const slug = linkMatch[1].trim();
    if (!slug || slug.startsWith('-') || /^\d+$/.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    const linkPos = html.indexOf(linkMatch[0]);
    const block = html.substring(linkPos, Math.min(html.length, linkPos + 600));
    const posterMatch = block.match(/src=['"]\s*(https:\/\/image\.tmdb\.org[^'"]+\.(?:jpg|png|webp))\s*['"]/);
    const altMatch = block.match(/alt=['"]([^'"]+)['"]/);
    const yearMatch = block.match(/class=['"][\s]*right[\s]*['"]>\s*(\d{4})/);
    const h2Match = block.match(/<h2[^>]*>([^<]+)<\/h2>/);
    const titulo = (altMatch?.[1] || h2Match?.[1] || slug.replace(/-/g, ' ')).trim();
    if (!titulo || titulo.length < 2) continue;
    series.push({ titulo, anio: yearMatch?.[1] || '', genero: '', sinopsis: '', poster_url: posterMatch?.[1]?.trim() || '', plataforma: 'PelisJuanita', episodios: { 1: [{ ep: 1, titulo: 'Episodio 1', link: `${JUANITA_BASE}/series/ver-serie/${slug}/01x01` }] }, temporadas: 1, ultimo_episodio: 1 });
  }
  return series;
}

async function scrapeJuanitaSerieInfo(nombreSerie) {
  const html = await fetchPage(`${JUANITA_BASE}/series/serieInfo.php?nombreSerie=${encodeURIComponent(nombreSerie)}`);
  if (!html) return null;
  const episodios = {};
  let maxTemp = 1, maxEp = 1;
  const epRegex = /href=['"]\/series\/ver-serie\/([^'"]+)\/(\d+)x(\d+)['"]/g;
  let match;
  while ((match = epRegex.exec(html)) !== null) {
    const temp = parseInt(match[2]), ep = parseInt(match[3]);
    if (!episodios[temp]) episodios[temp] = [];
    const epUrl = `${JUANITA_BASE}/series/ver-serie/${match[1]}/${match[2]}x${match[3]}`;
    const pos = html.indexOf(match[0]);
    const block = html.substring(Math.max(0, pos - 50), Math.min(html.length, pos + 200));
    const titleMatch = block.match(/alt=['"]([^'"]+)['"]|<span[^>]*>([^<]+)<\/span>/);
    const epTitulo = titleMatch?.[1] || titleMatch?.[2] || `Episodio ${ep}`;
    if (!episodios[temp].find(e => e.ep === ep)) {
      episodios[temp].push({ ep, titulo: epTitulo.trim(), link: epUrl });
      maxTemp = Math.max(maxTemp, temp); maxEp = Math.max(maxEp, ep);
    }
  }
  Object.keys(episodios).forEach(t => { episodios[t].sort((a, b) => a.ep - b.ep); });
  if (!Object.keys(episodios).length) return null;
  const posterMatch = html.match(/src=['"]\s*(https:\/\/image\.tmdb\.org[^'"]+\.(?:jpg|png|webp))\s*['"]/);
  const yearMatch = html.match(/\b(19|20)\d{2}\b/);
  return { episodios, temporadas: maxTemp, ultimo_episodio: maxEp, poster_url: posterMatch?.[1]?.trim() || '', anio: yearMatch?.[0] || '' };
}

async function scrapeJuanitaSeries(page) {
  const url = page === 1 ? `${JUANITA_BASE}/series/apiSeries.php` : `${JUANITA_BASE}/series/apiSeries.php?page=${page}`;
  return parseSeriesPage(await fetchPage(url));
}
async function scrapeJuanitaSeriesPopulares(page) {
  const url = page === 1 ? `${JUANITA_BASE}/series/apiSeries.php?populares=` : `${JUANITA_BASE}/series/apiSeries.php?populares=&page=${page}`;
  return parseSeriesPage(await fetchPage(url));
}
async function scrapeJuanitaSeriesEstrenos(page) {
  const url = page === 1 ? `${JUANITA_BASE}/series/apiSeries.php?estrenos=` : `${JUANITA_BASE}/series/apiSeries.php?estrenos=&page=${page}`;
  return parseSeriesPage(await fetchPage(url));
}

// -- AnimeFLV ------------------------------------------------------------------
async function scrapeAnimeFLVPage(page) {
  const animes = [];
  const seen = new Set();
  const html = await fetchPage(`https://www3.animeflv.net/browse?order=title&page=${page}`);
  if (!html) return 0;
  const allLinks = [...html.matchAll(/href="\/anime\/([a-zA-Z0-9\-]+)"/g)];
  for (const linkMatch of allLinks) {
    const slug = linkMatch[1].trim();
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);
    const linkPos = html.indexOf(linkMatch[0]);
    const block = html.substring(linkPos, Math.min(html.length, linkPos + 600));
    const posterMatch = block.match(/src="(https:\/\/animeflv\.net\/uploads\/animes\/covers\/[^"]+)"/);
    const altMatch = block.match(/alt="([^"]+)"/);
    const h3Match = block.match(/<h3[^>]*>([^<]+)<\/h3>/);
    const titulo = (altMatch?.[1] || h3Match?.[1] || slug).trim();
    if (!titulo || titulo === 'AnimeFLV') continue;
    animes.push({ titulo, slug, plataforma: 'AnimeFLV', poster_url: posterMatch?.[1] || '', episodios: {}, temporadas: 1, ultimo_episodio: 0, genero: 'Anime', sinopsis: '', anio: '' });
  }
  if (animes.length) await dbUpsert('anime', animes, 'titulo');
  return animes.length;
}

// -- Pelota Libre --------------------------------------------------------------
async function scrapeJJFutbol() {
  const delRes = await fetch(`${SUPABASE_URL}/rest/v1/partidos?equipo_local=not.is.null`, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' }
  });

  // Token estático hardcodeado en el JS de la página
  const JJTOKEN = 'TU_TOKEN_SECRETO_AQUI_32_CHARS__';
  const res = await fetch('https://jjfutbol2.lat/agenda.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Origin': 'https://jjfutbol2.lat',
      'Referer': 'https://jjfutbol2.lat/index.php'
    },
    body: 'token=' + encodeURIComponent(JJTOKEN)
  });
  if (!res.ok) return [`JJFutbol: error ${res.status}`];

  const data = await res.json().catch(_e => null);
  if (!Array.isArray(data)) return ['JJFutbol: respuesta invalida'];

  // Argentina = UTC-3
  const nowMs = Date.now();
  const nowAR = new Date(nowMs - 3 * 3600000);
  const arY = nowAR.getUTCFullYear(), arM = nowAR.getUTCMonth(), arD = nowAR.getUTCDate();

  const partidos = [];
  const seen = new Set();

  for (const item of data) {
    const titulo = (item.titulo || '').replace(/\n/g,' ').replace(/\s+/g,' ').trim();
    // Extraer equipos: "Categoria: Local vs Visitante" o "Local vs Visitante"
    const vsMatch = titulo.match(/^(?:.+?[:\-\u2013]\s*)?(.+?)\s+vs\s+(.+)$/i);
    if (!vsMatch) continue;
    const local = vsMatch[1].trim(), visit = vsMatch[2].trim();
    if (local.length < 2 || visit.length < 2) continue;
    const key = local.toLowerCase() + '-' + visit.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    // Convertir hora AR a UTC
    const parts = (item.hora || '00:00').split(':');
    const mH = parseInt(parts[0]) || 0, mMin = parseInt(parts[1]) || 0;
    let matchUTC = new Date(Date.UTC(arY, arM, arD, mH + 3, mMin));
    if (nowMs - matchUTC.getTime() > 4 * 3600000) {
      matchUTC = new Date(matchUTC.getTime() + 24 * 3600000);
    }

    // Canales con links completos (igual que el sitio original)
    const tituloClean = titulo.replace(/\s+/g,' ').trim();
    const canales = (item.canales || []).map(c => ({
      nombre: c.canal,
      link: `https://jjfutbol2.lat/evento.php?id=${encodeURIComponent(c.canal_id)}&t=${encodeURIComponent(tituloClean)}&c=${encodeURIComponent(c.canal)}`
    }));

    partidos.push({
      equipo_local: local, equipo_visit: visit,
      sigla_local: local.substring(0,3).toUpperCase(),
      sigla_visit: visit.substring(0,3).toUpperCase(),
      color_local: '#1565c0', color_visit: '#c62828',
      fecha: matchUTC.toISOString(),
      en_vivo: false,
      liga: item.categoria || '',
      canales,
      proveedores: canales.map(c => c.nombre),
      link_tyc: canales[0] ? canales[0].link : ''
    });
  }

  if (partidos.length) {
    const ins = await fetch(`${SUPABASE_URL}/rest/v1/partidos`, {
      method: 'POST',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
      body: JSON.stringify(partidos)
    });
    const insText = ins.ok ? 'ok' : await ins.text();
    return [`JJFutbol: ${partidos.length} armados, insert=${ins.status} ${insText}`];
  }
  return [`JJFutbol: 0 partidos parseados`];
}


// -- Enriquecimiento de partidos (ya incluido en JJFutbol, se mantiene para compatibilidad) --
async function enrichPartidos() {
  return ['Enriquecimiento no necesario: JJFutbol ya incluye canales en el scrape inicial'];
}

// ── HANDLER ──────────────────────────────────────────────────────────────────
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS' };

export default async function handler(req) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  const secret = url.searchParams.get('secret');
  if (secret !== 'cinetra-scraper-2024') return new Response('Unauthorized', { status: 401, headers: CORS });
  const source = url.searchParams.get('source') || '';
  const logs = [];
  const t = Date.now();

  try {
    if (source === 'delete-poseidon') {
      logs.push(`Borradas: pelis=${await dbDelete('peliculas','plataforma','PoseidonHD')} series=${await dbDelete('series','plataforma','PoseidonHD')}`);
    }
    if (source === 'peliculas') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const peliculas = await scrapeJuanitaMovies(page);
      if (peliculas.length) { await dbUpsert('peliculas', peliculas, 'titulo'); logs.push(`Películas Juanita pág ${page}: ${peliculas.length} guardadas`); }
      else logs.push(`Películas Juanita pág ${page}: 0 encontradas`);
    }
    if (source === 'series') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const series = await scrapeJuanitaSeries(page);
      if (series.length) { await dbUpsert('series', series, 'titulo'); logs.push(`Series Juanita pág ${page}: ${series.length} guardadas`); }
      else logs.push(`Series Juanita pág ${page}: 0 encontradas`);
    }
    if (source === 'serie-info') {
      const nombre = url.searchParams.get('nombre') || '';
      if (!nombre) logs.push('Falta ?nombre=');
      else {
        const info = await scrapeJuanitaSerieInfo(nombre);
        if (info) { await dbUpsert('series', [{ titulo: nombre, ...info, plataforma: 'PelisJuanita' }], 'titulo'); logs.push(`Serie "${nombre}": OK`); }
        else logs.push(`Serie "${nombre}": no encontrada`);
      }
    }
    if (source === 'series-populares') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const series = await scrapeJuanitaSeriesPopulares(page);
      if (series.length) { await dbUpsert('series', series, 'titulo'); logs.push(`Series Populares pág ${page}: ${series.length}`); }
      else logs.push(`Series Populares pág ${page}: 0`);
    }
    if (source === 'series-estrenos') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const series = await scrapeJuanitaSeriesEstrenos(page);
      if (series.length) { await dbUpsert('series', series, 'titulo'); logs.push(`Series Estrenos pág ${page}: ${series.length}`); }
      else logs.push(`Series Estrenos pág ${page}: 0`);
    }
    if (source === 'poseidon-peliculas') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const count = await scrapePoseidonMovies(page);
      logs.push(`PoseidonHD Películas pág ${page}: ${count} guardadas`);
    }
    if (source === 'poseidon-series') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const count = await scrapePoseidonSeries(page);
      logs.push(`PoseidonHD Series pág ${page}: ${count} guardadas`);
    }
    if (source === 'anime') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const count = await scrapeAnimeFLVPage(page);
      logs.push(`AnimeFLV pág ${page}: ${count} animes guardados`);
    }
    if (source === 'jkanime') {
      const page = parseInt(url.searchParams.get('page') || '1');
      const count = await scrapeJKAnimePage(page);
      logs.push(`JKAnime pág ${page}: ${count} animes guardados`);
    }
    if (source === 'enrich-peliculas') {
      const batch = parseInt(url.searchParams.get('batch') || '5');
      const count = await enrichPeliculas(batch);
      logs.push(`Enrich películas: ${count} enriquecidas`);
    }
    if (source === 'enrich-series') {
      const batch = parseInt(url.searchParams.get('batch') || '5');
      const count = await enrichSeries(batch);
      logs.push(`Enrich series Juanita: ${count} enriquecidas`);
    }
    if (source === 'populate-episodes-juanita') {
      const batch = parseInt(url.searchParams.get('batch') || '5');
      const count = await populateJuanitaSerieEpisodes(batch);
      logs.push(`Episodios Juanita: ${count} series actualizadas`);
    }
    if (source === 'populate-episodes-poseidon') {
      const batch = parseInt(url.searchParams.get('batch') || '3');
      const count = await populatePoseidonSerieEpisodes(batch);
      logs.push(`Episodios PoseidonHD: ${count} series actualizadas`);
    }
    if (source === 'enrich-series-poseidon') {
      const batch = parseInt(url.searchParams.get('batch') || '5');
      const count = await enrichPoseidonSeries(batch);
      logs.push(`Enrich series PoseidonHD: ${count} enriquecidas`);
    }
    if (source === 'enrich-anime') {
      const batch = parseInt(url.searchParams.get('batch') || '5');
      const count = await enrichAnime(batch);
      logs.push(`Enrich anime: ${count} enriquecidos`);
    }

    if (source === 'debug-jj-disabled') {
      // Buscar endpoint de API en el JS de la pagina
      const html = await fetchPage('https://jjfutbol2.lat/index.php');
      if (!html) { logs.push('No se pudo cargar'); }
      else {
        // Extraer todas las URLs de fetch/XHR en el JS
        const fetches = html.match(/fetch\(['"`][^'"`]+['"`]/g) || [];
        logs.push('Fetch calls: ' + fetches.join(' | '));
        const xhrs = html.match(/\.open\(['"](GET|POST)['"],[^)]+\)/g) || [];
        logs.push('XHR calls: ' + xhrs.join(' | '));
        // Buscar .php y .json URLs
        const phpUrls = html.match(/['"](\/?[a-z0-9_-]+\.php[^'"]*)['"]/g) || [];
        logs.push('PHP URLs: ' + [...new Set(phpUrls)].slice(0,15).join(' | '));
        const jsonUrls = html.match(/['"](\/?[a-z0-9_/-]+\.json[^'"]*)['"]/g) || [];
        logs.push('JSON URLs: ' + jsonUrls.join(' | '));
        // Ultimo bloque del HTML (contenido real)
        const tail = html.slice(-2000).replace(/\s+/g,' ');
        logs.push('Tail: ' + tail);
      }
      // Probar endpoints comunes directamente
      for (const ep of ['api.php','get_partidos.php','partidos.php','agenda.php','events.php','data.php','matches.php']) {
        const r = await fetch('https://jjfutbol2.lat/'+ep);
        if (r.ok) {
          const txt = await r.text();
          logs.push('ENCONTRADO '+ep+': ' + txt.substring(0,300));
        }
      }
    }

    if (source === 'delete-partidos') {
      const del = await fetch(`${SUPABASE_URL}/rest/v1/partidos?equipo_local=not.is.null`, {
        method: 'DELETE',
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' }
      });
      logs.push(`Partidos borrados (status: ${del.status})`);
    }
    if (source === 'futbol') {
      logs.push(...await scrapeJJFutbol());
    }
    if (source === 'enrich-partidos') {
      logs.push(...await enrichPartidos());
    }
  } catch (e) {
    logs.push(`Error: ${e.message}`);
  }

  return new Response(JSON.stringify({
    ok: true, timestamp: new Date().toISOString(),
    duration: `${((Date.now() - t) / 1000).toFixed(1)}s`, logs
  }), { headers: { 'Content-Type': 'application/json', ...CORS } });
}
