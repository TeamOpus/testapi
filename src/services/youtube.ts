import ytdl, { videoInfo } from "ytdl-core";
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

            // Fetch video information with timeout
            const video: videoInfo = await Promise.race([
                ytdl.getInfo(urlString, {
                    requestOptions: {
                        headers: {
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                        }
                    }
                }),
                new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Request timeout')), 15000)
                )
            ]);

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
                stack: error.stack,
                url: url?.toString()
            });
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

        // Process formats with error handling
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
                        quality: f.qualityLabel || f.quality || 'unknown',
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
