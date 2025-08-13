import youtubedl from 'youtube-dl-exec';
import { FormatType, VideoData } from "../types/youtube";
import NodeCache from "node-cache";

export class YouTube {
    private static cache = new NodeCache({ 
        stdTTL: 3600, // 1 hour cache
        checkperiod: 600 // Check for expired keys every 10 minutes
    });

    /**
     * Validates if the provided URL is a valid YouTube URL
     */
    private static isValidYouTubeURL(url: string): boolean {
        const youtubeRegex = /^(https?:\/\/)?(www\.)?(youtube\.com\/(watch\?v=|embed\/|v\/)|youtu\.be\/)[\w-]+/;
        return youtubeRegex.test(url);
    }

    /**
     * Extracts video ID from YouTube URL
     */
    private static getVideoId(url: string): string | null {
        const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    /**
     * Fetches video information using yt-dlp
     */
    static async getVideoInfo(url: string | any): Promise<VideoData | null> {
        try {
            // Input validation
            if (!url) {
                console.warn('No URL provided to getVideoInfo');
                return null;
            }

            const urlString = url.toString().trim();
            
            if (!this.isValidYouTubeURL(urlString)) {
                console.warn('Invalid YouTube URL provided:', urlString);
                return null;
            }

            const videoId = this.getVideoId(urlString);
            if (!videoId) {
                console.warn('Could not extract video ID from URL:', urlString);
                return null;
            }

            // Check cache first
            const cacheKey = `video_${videoId}`;
            if (this.cache.has(cacheKey)) {
                console.log('Returning cached data for video:', videoId);
                return this.cache.get(cacheKey) as VideoData;
            }

            console.log('Fetching video info for:', videoId);

            // Fetch video information using yt-dlp
            const videoInfo = await youtubedl(urlString, {
                dumpSingleJson: true,
                noCheckCertificates: true,
                noWarnings: true,
                preferFreeFormats: true,
                addHeader: [
                    'referer:youtube.com',
                    'user-agent:Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                ]
            });

            if (!videoInfo) {
                console.error('No video information found for:', videoId);
                return null;
            }

            // Process video data
            const videoData = this.processVideoInfo(videoInfo);
            
            // Cache the result
            this.cache.set(cacheKey, videoData);
            console.log('Video info cached successfully for:', videoId);

            return videoData;

        } catch (error) {
            console.error('Error fetching video info:', {
                message: error.message,
                stderr: error.stderr || 'No stderr output',
                url: url?.toString()
            });

            return null;
        }
    }

    /**
     * Processes yt-dlp video data into our VideoData format
     */
    private static processVideoInfo(info: any): VideoData {
        const videoData: VideoData = {
            id: info.id || 'unknown',
            url: info.webpage_url || info.original_url || '',
            title: info.title || 'Unknown Title',
            author: info.uploader || info.channel || 'Unknown Author',
            thumbnails: [],
            formats: []
        };

        // Process thumbnails
        if (info.thumbnails && Array.isArray(info.thumbnails)) {
            videoData.thumbnails = info.thumbnails
                .filter(t => t.url && t.width && t.height)
                .map(t => ({
                    url: t.url,
                    size: `${t.width}x${t.height}`
                }))
                .sort((a, b) => {
                    const [aW] = a.size.split('x').map(Number);
                    const [bW] = b.size.split('x').map(Number);
                    return bW - aW; // Sort by width descending
                });
        }

        // Process formats
        if (info.formats && Array.isArray(info.formats)) {
            videoData.formats = info.formats
                .filter(f => f.url)
                .map(f => {
                    let type = FormatType.video;
                    
                    if (f.acodec !== 'none' && f.vcodec !== 'none') {
                        type = FormatType.main; // Has both audio and video
                    } else if (f.acodec !== 'none' && f.vcodec === 'none') {
                        type = FormatType.audio; // Audio only
                    } else {
                        type = FormatType.video; // Video only
                    }

                    return {
                        type,
                        quality: f.format_note || f.height ? `${f.height}p` : f.quality || 'unknown',
                        container: f.ext || 'unknown',
                        codecs: f.acodec && f.vcodec ? `${f.vcodec}, ${f.acodec}` : f.acodec || f.vcodec || 'unknown',
                        url: f.url,
                        bitrate: f.abr || f.vbr || f.tbr ? `${Math.round(f.abr || f.vbr || f.tbr)} kbps` : 'unknown'
                    };
                })
                .sort((a, b) => {
                    // Sort by type priority: main > video > audio
                    if (a.type !== b.type) {
                        return a.type - b.type;
                    }
                    // Then by quality
                    return this.compareQuality(b.quality, a.quality);
                });
        }

        return videoData;
    }

    /**
     * Compares video quality strings for sorting
     */
    private static compareQuality(a: string, b: string): number {
        const getQualityValue = (quality: string): number => {
            if (!quality || quality === 'unknown') return 0;
            const match = quality.match(/(\d+)/);
            return match ? parseInt(match[1]) : 0;
        };

        return getQualityValue(a) - getQualityValue(b);
    }

    /**
     * Clears the cache
     */
    static clearCache(): void {
        this.cache.flushAll();
        console.log('YouTube cache cleared');
    }

    /**
     * Gets cache statistics
     */
    static getCacheStats(): { keys: number; hits: number; misses: number } {
        return {
            keys: this.cache.keys().length,
            hits: this.cache.getStats().hits,
            misses: this.cache.getStats().misses
        };
    }
}
