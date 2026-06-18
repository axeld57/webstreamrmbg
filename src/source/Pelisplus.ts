import * as cheerio from 'cheerio';
import { Context, Stream, TmdbId } from '../utils';
import { Source } from './Source';

export class Pelisplus extends Source {
  // El ID debe coincidir con el que pusiste en el filtro de index.ts
  id = 'pelisplus';
  name = 'PelisplusHD';
  private baseUrl = 'https://pelisplushd.club';

  /**
   * Método principal que invoca el addon para buscar los enlaces de video
   */
  async handle(ctx: Context, type: 'movie' | 'series', id: TmdbId): Promise<Stream[]> {
    // 1. Validar que el usuario tenga activado el contenido en español latino
    if (ctx.config?.mx !== 'on') return [];

    try {
      // 2. Resolver el nombre de la película/serie usando la API de TMDB integrada en el addon
      // Pelisplus no entiende IDs numéricos, necesita el título en texto (ej: "Deadpool")
      const meta = type === 'movie' ? await ctx.tmdb.getMovie(id.id) : await ctx.tmdb.getShow(id.id);
      const title = meta?.title || meta?.name;
      if (!title) return [];

      // 3. Realizar la petición de búsqueda al sitio web
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(title)}`;
      const searchHtml = await this.fetcher.get(searchUrl);
      
      // 4. Buscar el enlace correcto dentro de los resultados de búsqueda
      const pageUrl = this.findCorrectMatch(searchHtml, title, type);
      if (!pageUrl) return [];

      // 5. Si es una serie, estructurar la URL para ir directo al episodio correcto
      let targetUrl = pageUrl;
      if (type === 'series') {
        // Estructura típica de PelisplusHD para capítulos: /episodio/nombre-serie-temporada-X-capitulo-X
        const slug = pageUrl.replace(`${this.baseUrl}/serie/`, '').replace(/\/$/, '');
        targetUrl = `${this.baseUrl}/episodio/${slug}-temporada-${id.season}-capitulo-${id.episode}`;
      }

      // 6. Entrar a la página del video y extraer los servidores
      const videoPageHtml = await this.fetcher.get(targetUrl);
      return this.extractStreams(videoPageHtml);

    } catch (error) {
      console.error(`[Pelisplus] Error al procesar el contenido:`, error);
      return [];
    }
  }

  /**
   * Analiza el HTML de la búsqueda y encuentra el enlace que mejor coincida
   */
  private findCorrectMatch(html: string, targetTitle: string, type: 'movie' | 'series'): string | null {
    const $ = cheerio.load(html);
    let matchedUrl: string | null = null;
    const cleanTarget = targetTitle.toLowerCase().trim();

    // PelisplusHD organiza sus resultados en elementos 'article' o '.post-movie'
    $('.post-movie, article, .item').each((_, element) => {
      const titleText = $(element).find('.title, h3, h2').text().toLowerCase().trim();
      const href = $(element).find('a').attr('href');

      if (!href) return;

      // Filtrar por tipo para no meter una serie si buscas una película
      const isSeriePage = href.includes('/serie/');
      if (type === 'series' && !isSeriePage) return;
      if (type === 'movie' && isSeriePage) return;

      // Si el título coincide o contiene el nombre buscado, lo seleccionamos
      if (titleText.includes(cleanTarget) || cleanTarget.includes(titleText)) {
        matchedUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        return false; // Rompe el bucle .each de cheerio
      }
    });

    return matchedUrl;
  }

  /**
   * Raspa la página final para capturar los iframes o enlaces de reproducción
   */
  private extractStreams(html: string): Stream[] {
    const $ = cheerio.load(html);
    const streams: Stream[] = [];

    // PelisplusHD suele colocar las opciones de video en pestañas independientes (tab-content)
    // o dentro de scripts con arreglos de reproductores.
    $('iframe, .video-player iframe, [data-video]').each((index, element) => {
      let videoUrl = $(element).attr('src') || $(element).attr('data-video');

      if (!videoUrl) return;

      // Normalizar la URL del reproductor
      if (videoUrl.startsWith('//')) {
        videoUrl = `https:${videoUrl}`;
      }

      // Identificar el nombre del servidor (Streamtape, Fembed, Vidhide, etc.)
      let serverName = 'Pelisplus';
      if (videoUrl.includes('streamtape')) serverName = 'Streamtape';
      else if (videoUrl.includes('fembed') || videoUrl.includes('feurl')) serverName = 'Fembed';
      else if (videoUrl.includes('vidhide')) serverName = 'Vidhide';
      else if (videoUrl.includes('voe')) serverName = 'Voe.sx';

      streams.push({
        name: `PelisplusHD\n🇲🇽 Latino (${serverName})`,
        type: 'url',
        url: videoUrl,
      });
    });

    return streams;
  }
}
