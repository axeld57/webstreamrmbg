import * as cheerio from 'cheerio';
import { TmdbId } from '../utils';
import { Source } from './Source';

export class Pelisplus extends Source {
  // 1. Corregido: Se añade 'override' a los elementos heredados de Source
  override id = 'pelisplus';
  override label = 'PelisplusHD';
  override baseUrl = 'https://pelisplushd.club';
  
  // 2. Corregido: Agregamos las propiedades abstractas obligatorias que faltaban
  override contentTypes: ('movie' | 'series')[] = ['movie', 'series'];
  override countryCodes = ['MX', 'ES'];

  // 3. Corregido: Constructor explícito de 1 argumento para evitar el error en index.ts
  constructor(private fetcher: any) {
    super();
  }

  /**
   * 4. Corregido: Se cambia 'handle' por 'handleInternal' que es la función 
   * que la clase abstracta Source obliga a implementar.
   */
  override async handleInternal(ctx: any, type: 'movie' | 'series', id: TmdbId): Promise<any[]> {
    // Validar si el usuario activó la opción de contenido Latino
    if (ctx.config?.mx !== 'on') return [];

    try {
      // Resolver el nombre del contenido usando TMDB
      const meta = type === 'movie' ? await ctx.tmdb.getMovie(id.id) : await ctx.tmdb.getShow(id.id);
      const title = meta?.title || meta?.name;
      if (!title) return [];

      // Petición de búsqueda
      const searchUrl = `${this.baseUrl}/?s=${encodeURIComponent(title)}`;
      const searchHtml = await this.fetcher.get(searchUrl);
      
      const pageUrl = this.findCorrectMatch(searchHtml, title, type);
      if (!pageUrl) return [];

      let targetUrl = pageUrl;
      if (type === 'series') {
        const slug = pageUrl.replace(`${this.baseUrl}/serie/`, '').replace(/\/$/, '');
        targetUrl = `${this.baseUrl}/episodio/${slug}-temporada-${id.season}-capitulo-${id.episode}`;
      }

      const videoPageHtml = await this.fetcher.get(targetUrl);
      return this.extractStreams(videoPageHtml);

    } catch (error) {
      console.error(`[Pelisplus] Error al procesar contenido:`, error);
      return [];
    }
  }

  private findCorrectMatch(html: string, targetTitle: string, type: 'movie' | 'series'): string | null {
    const $ = cheerio.load(html);
    let matchedUrl: string | null = null;
    const cleanTarget = targetTitle.toLowerCase().trim();

    $('.post-movie, article, .item').each((_, element) => {
      const titleText = $(element).find('.title, h3, h2').text().toLowerCase().trim();
      const href = $(element).find('a').attr('href');

      if (!href) return true; // Equivalente a 'continue' en el loop de cheerio

      const isSeriePage = href.includes('/serie/');
      if (type === 'series' && !isSeriePage) return true;
      if (type === 'movie' && isSeriePage) return true;

      if (titleText.includes(cleanTarget) || cleanTarget.includes(titleText)) {
        matchedUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        return false; // Equivalente a 'break' en el loop de cheerio
      }
      return true;
    });

    return matchedUrl;
  }

  private extractStreams(html: string): any[] {
    const $ = cheerio.load(html);
    const streams: any[] = [];

    // 5. Corregido: Se cambia 'index' por '_' para evitar el error de variable declarada no usada
    $('iframe, .video-player iframe, [data-video]').each((_, element) => {
      let videoUrl = $(element).attr('src') || $(element).attr('data-video');

      if (!videoUrl) return true;

      if (videoUrl.startsWith('//')) {
        videoUrl = `https:${videoUrl}`;
      }

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
      return true;
    });

    return streams;
  }
}
