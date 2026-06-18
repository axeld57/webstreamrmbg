import * as cheerio from 'cheerio';
import { TmdbId } from '../utils';
import { Source } from './Source';

export class Pelisplus extends Source {
  override id = 'pelisplus';
  override label = 'PelisplusHD';
  override baseUrl = 'https://pelisplushd.club';
  
  override contentTypes: ('movie' | 'series')[] = ['movie', 'series'];
  override countryCodes = ['MX', 'ES'];

  constructor(private fetcher: any) {
    super();
  }

  override async handleInternal(ctx: any, type: 'movie' | 'series', id: TmdbId): Promise<any[]> {
    if (ctx.config?.mx !== 'on') return [];

    try {
      const meta = type === 'movie' ? await ctx.tmdb.getMovie(id.id) : await ctx.tmdb.getShow(id.id);
      const title = meta?.title || meta?.name;
      if (!title) return [];

      // CORRECCIÓN: Convertir el título en un slug válido para la URL de búsqueda limpia
      const cleanSlug = this.convertToSlug(title);
      const searchUrl = `${this.baseUrl}/search/${cleanSlug}`;
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

  /**
   * Transforma títulos normales en slugs para la ruta de búsqueda
   * Ejemplo: "Spider-Man: No Way Home" -> "spider-man-no-way-home"
   */
  private convertToSlug(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD') // Elimina acentos
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, '') // Elimina caracteres especiales
      .trim()
      .replace(/\s+/g, '-'); // Cambia espacios por guiones
  }

  private findCorrectMatch(html: string, targetTitle: string, type: 'movie' | 'series'): string | null {
    const $ = cheerio.load(html);
    let matchedUrl: string | null = null;
    const cleanTarget = targetTitle.toLowerCase().trim();

    $('.post-movie, article, .item').each((_, element) => {
      const titleText = $(element).find('.title, h3, h2').text().toLowerCase().trim();
      const href = $(element).find('a').attr('href');

      if (!href) return true;

      const isSeriePage = href.includes('/serie/');
      if (type === 'series' && !isSeriePage) return true;
      if (type === 'movie' && isSeriePage) return true;

      if (titleText.includes(cleanTarget) || cleanTarget.includes(titleText)) {
        matchedUrl = href.startsWith('http') ? href : `${this.baseUrl}${href}`;
        return false;
      }
      return true;
    });

    return matchedUrl;
  }

  private extractStreams(html: string): any[] {
    const $ = cheerio.load(html);
    const streams: any[] = [];

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
