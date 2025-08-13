import ytdl, { videoInfo } from "ytdl-core";
import { FormatType, VideoData } from "../types/youtube";
import NodeCache from "node-cache";

export class YouTube {
    private static cache = new NodeCache({ 
        stdTTL: 3600, // 1 hour cache
        checkperiod: 600 // Check for expired keys every 10 minutes
    });

    /**
     * Pool of rotating user agents and headers to avoid detection
     */
    private static readonly USER_AGENTS = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0 Safari/537.36'
    ];

    private static readonly ACCEPT_LANGUAGES = [
        'en-US,en;q=0.9',
        'en-GB,en;q=0.9',
        'en-US,en;q=0.8,es;q=0.7',
        'en-US,en;q=0.9,fr;q=0.8',
        'en-US,en;q=0.9,de;q=0.8',
        'en-US,en;q=0.9,ja;q=0.8'
    ];

    /**
     * Generates random headers to avoid detection
     */
    private static getRandomHeaders(): Record<string, string> {
        const randomUserAgent = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
        const randomAcceptLanguage = this.ACCEPT_LANGUAGES[Math.floor(Math.random() * this.ACCEPT_LANGUAGES.length)];
        
        return {
            'User-Agent': randomUserAgent,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': randomAcceptLanguage,
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Cache-Control': 'max-age=0'
        };
    }

    /**
     * Validates if the provided URL is a valid YouTube URL
     */
    private static isValidYouTubeURL(url: string): boolean {
        try {
            return ytdl.validateURL(url);
        } catch (error) {
            console.error('URL validation failed:', error.message);
            return false;
        }
    }

    /**
     * Extracts video ID from YouTube URL for caching purposes
     */
    private static getVideoId(url: string): string | null {
        try {
            return ytdl.getVideoID(url);
        } catch (error) {
            console.error('Failed to extract video ID:', error.message);
            return null;
        }
    }

    /**
     * Attempts to fetch video info with multiple retry strategies
     */
    private static async fetchWithRetry(url: string, maxRetries = 3): Promise<videoInfo | null> {
        let lastError: Error | null = null;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Attempt ${attempt}/${maxRetries} for video info fetch`);
                
                const headers = this.getRandomHeaders();
                console.log('Using User-Agent:', headers['User-Agent'].substring(0, 50) + '...');

                const video = await Promise.race([
                    ytdl.getInfo(url, {
                        requestOptions: {
                            headers: headers,
                            timeout: 10000
                        }
                    }),
                    new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error('Request timeout after 10 seconds')), 10000)
                    )
                ]);

                return video;

            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt} failed:`, {
                    message: error.message,
                    status: error.statusCode || 'unknown'
                });

                if (attempt < maxRetries) {
                    const delay = Math.random() * 2000 + 1000; // Random delay 1-3 seconds
                    console.log(`Waiting ${Math.round(delay)}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        throw lastError;
    }

    /**
     * Fetches video information with comprehensive error handling
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

            // Check cache first using video ID for consistency
            const cacheKey = `video_${videoId}`;
            if (this.cache.has(cacheKey)) {
                console.log('Returning cached data for video:', videoId);
                return this.cache.get(cacheKey) as VideoData;
            }

            console.log('Fetching video info for:', videoId);

            // Attempt to fetch with retries and rotating headers
            const video = await this.fetchWithRetry(urlString);
            
            if (!video || !video.videoDetails) {
                console.error('No video details found for:', videoId);
                return null;
            }

            // Process video data
            const videoData = this.processVideoData(video);
            
            // Cache the result
            this.cache.set(cacheKey, videoData);
            console.log('Video info cached successfully for:', videoId);

            return videoData;

        } catch (error) {
            console.error('Error fetching video info:', {
                message: error.message,
                statusCode: error.statusCode || 'unknown',
                stack: error.stack?.split('\n').slice(0, 3).join('\n'), // Truncated stack
                url: url?.toString()
            });

            // Handle specific YouTube errors
            if (error.message.includes('410')) {
                console.error('YouTube returned 410 Gone - video may be unavailable or region-blocked');
            } else if (error.message.includes('403')) {
                console.error('YouTube returned 403 Forbidden - IP may be temporarily blocked');
            }

            return null;
        }
    }

    /**
     * Processes raw video data into our VideoData format
     */
    private static processVideoData(video: videoInfo): VideoData {
        const videoData: VideoData = {
            id: video.videoDetails.videoId || 'unknown',
            url: video.videoDetails.video_url || '',
            title: video.videoDetails.title || 'Unknown Title',
            author: video.videoDetails.author?.name || 'Unknown Author',
            thumbnails: [],
            formats: []
        };

        // Process thumbnails with error handling
        if (video.videoDetails.thumbnails && Array.isArray(video.videoDetails.thumbnails)) {
            videoData.thumbnails = video.videoDetails.thumbnails
                .filter(t => t.url && t.width && t.height)
                .map(t => ({
                    url: t.url,
                    size: `${t.width}x${t.height}`
                }))
                .sort((a, b) => {
                    // Sort by resolution (descending)
                    const [aW] = a.size.split('x').map(Number);
                    const [bW] = b.size.split('x').map(Number);
                    return bW - aW;
                });
        }

        // Process formats with error handling and proper type conversion
        if (video.formats && Array.isArray(video.formats)) {
            videoData.formats = video.formats
                .filter(f => f.url) // Only include formats with valid URLs
                .map(f => {
                    let type = FormatType.video;
                    if (f.hasVideo && f.hasAudio) {
                        type = FormatType.main;
                    } else if (f.hasAudio && !f.hasVideo) {
                        type = FormatType.audio;
                    }

                    return {
                        type,
                        quality: (f.qualityLabel || f.quality || 'unknown').toString(),
                        container: f.container || 'unknown',
                        codecs: f.codecs || 'unknown',
                        url: f.url,
                        bitrate: f.bitrate ? 
                            f.bitrate.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ") : 
                            'unknown'
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
     * Clears the cache (useful for development/testing)
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
