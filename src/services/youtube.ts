import youtubedl from 'youtube-dl-exec';
import { FormatType, VideoData } from "../types/youtube";
import NodeCache from "node-cache";
import * as fs from 'fs';
import * as path from 'path';

export class YouTube {
    private static cache = new NodeCache({ 
        stdTTL: 3600, // 1 hour cache
        checkperiod: 600 // Check for expired keys every 10 minutes
    });

    private static readonly COOKIES_URL = 'https://v0-mongo-db-api-setup.vercel.app/api/cookies.txt';
    private static readonly COOKIES_FILE = path.join(process.cwd(), 'temp_cookies.txt');

    /**
     * Pool of rotating user agents to avoid detection
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

    /**
     * Downloads cookies from remote URL and saves to temp file
     */
    private static async downloadCookies(): Promise<string | null> {
        try {
            console.log('Downloading fresh cookies from remote URL...');
            
            const response = await fetch(this.COOKIES_URL, {
                headers: {
                    'User-Agent': this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)]
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const cookieContent = await response.text();
            
            // Validate Netscape format
            if (!cookieContent.includes('# Netscape HTTP Cookie File') && 
                !cookieContent.includes('# HTTP Cookie File')) {
                throw new Error('Invalid cookie format - missing Netscape header');
            }

            // Save to temporary file
            fs.writeFileSync(this.COOKIES_FILE, cookieContent, 'utf8');
            console.log('Cookies downloaded and saved successfully');
            
            return this.COOKIES_FILE;

        } catch (error) {
            console.error('Failed to download cookies:', error.message);
            return null;
        }
    }

    /**
     * Gets available cookies file path (local or downloaded)
     */
    private static async getCookiesFile(): Promise<string | null> {
        // Check for local cookies.txt first
        const localCookiesPath = path.join(process.cwd(), 'cookies.txt');
        
        if (fs.existsSync(localCookiesPath)) {
            try {
                const content = fs.readFileSync(localCookiesPath, 'utf8');
                if (content.includes('# Netscape HTTP Cookie File') || 
                    content.includes('# HTTP Cookie File')) {
                    console.log('Using local cookies.txt file');
                    return localCookiesPath;
                }
            } catch (error) {
                console.warn('Local cookies.txt exists but is not readable:', error.message);
            }
        }

        // Fallback to remote cookies
        console.log('No local cookies found, attempting to download...');
        return await this.downloadCookies();
    }

    /**
     * Generates random headers to avoid detection
     */
    private static getRandomHeaders(): string[] {
        const randomUserAgent = this.USER_AGENTS[Math.floor(Math.random() * this.USER_AGENTS.length)];
        
        return [
            `user-agent:${randomUserAgent}`,
            'accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'accept-language:en-US,en;q=0.9',
            'accept-encoding:gzip, deflate, br',
            'dnt:1',
            'upgrade-insecure-requests:1',
            'sec-fetch-dest:document',
            'sec-fetch-mode:navigate',
            'sec-fetch-site:none'
        ];
    }

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
     * Attempts to fetch video info with cookies and retry strategies
     */
    private static async fetchWithRetry(url: string, maxRetries = 3): Promise<any | null> {
        let lastError: Error | null = null;
        let cookiesFile: string | null = null;

        // Get cookies file once before retries
        try {
            cookiesFile = await this.getCookiesFile();
        } catch (error) {
            console.warn('Failed to get cookies file:', error.message);
        }

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`Attempt ${attempt}/${maxRetries} for video info fetch`);
                
                const headers = this.getRandomHeaders();
                console.log('Using User-Agent:', headers[0].substring(11, 61) + '...');

                const options: any = {
                    dumpSingleJson: true,
                    noCheckCertificates: true,
                    noWarnings: true,
                    preferFreeFormats: true,
                    addHeader: headers
                };

                // Add cookies if available
                if (cookiesFile) {
                    options.cookies = cookiesFile;
                    console.log('Using cookies file for authentication');
                } else {
                    console.warn('No cookies available - proceeding without authentication');
                }

                const video = await Promise.race([
                    youtubedl(url, options),
                    new Promise<never>((_, reject) => 
                        setTimeout(() => reject(new Error('Request timeout after 15 seconds')), 15000)
                    )
                ]);

                // Clean up temp cookies file after successful request
                if (cookiesFile === this.COOKIES_FILE && fs.existsSync(this.COOKIES_FILE)) {
                    try {
                        fs.unlinkSync(this.COOKIES_FILE);
                        console.log('Temporary cookies file cleaned up');
                    } catch (cleanupError) {
                        console.warn('Failed to cleanup temp cookies:', cleanupError.message);
                    }
                }

                return video;

            } catch (error) {
                lastError = error;
                console.error(`Attempt ${attempt} failed:`, {
                    message: error.message,
                    stderr: error.stderr ? error.stderr.substring(0, 200) + '...' : 'No stderr'
                });

                // If authentication error and no cookies were used, try to get fresh cookies
                if (error.message?.includes('Sign in to confirm') && !cookiesFile && attempt === 1) {
                    console.log('Authentication required - attempting to download fresh cookies...');
                    cookiesFile = await this.downloadCookies();
                }

                if (attempt < maxRetries) {
                    const delay = Math.random() * 3000 + 2000; // Random delay 2-5 seconds
                    console.log(`Waiting ${Math.round(delay)}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }

        // Clean up temp cookies file even if all attempts failed
        if (cookiesFile === this.COOKIES_FILE && fs.existsSync(this.COOKIES_FILE)) {
            try {
                fs.unlinkSync(this.COOKIES_FILE);
            } catch (cleanupError) {
                console.warn('Failed to cleanup temp cookies after failure:', cleanupError.message);
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

            // Check cache first
            const cacheKey = `video_${videoId}`;
            if (this.cache.has(cacheKey)) {
                console.log('Returning cached data for video:', videoId);
                return this.cache.get(cacheKey) as VideoData;
            }

            console.log('Fetching video info for:', videoId);

            // Attempt to fetch with retries, cookies, and rotating headers
            const video = await this.fetchWithRetry(urlString);
            
            if (!video) {
                console.error('No video information found for:', videoId);
                return null;
            }

            // Process video data
            const videoData = this.processVideoInfo(video);
            
            // Cache the result
            this.cache.set(cacheKey, videoData);
            console.log('Video info cached successfully for:', videoId);

            return videoData;

        } catch (error) {
            console.error('Error fetching video info:', {
                message: error.message,
                stderr: error.stderr ? error.stderr.substring(0, 300) + '...' : 'No stderr',
                url: url?.toString()
            });

            // Handle specific YouTube errors with helpful messages
            if (error.message?.includes('Sign in to confirm')) {
                console.error('🔐 YouTube authentication required. Ensure cookies are valid and recent.');
            } else if (error.message?.includes('403')) {
                console.error('🚫 Access forbidden - may need fresh cookies or different IP.');
            } else if (error.message?.includes('429')) {
                console.error('⏳ Rate limited - too many requests. Wait before trying again.');
            }

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

    /**
     * Manually refresh cookies from remote URL
     */
    static async refreshCookies(): Promise<boolean> {
        try {
            const result = await this.downloadCookies();
            return result !== null;
        } catch (error) {
            console.error('Failed to refresh cookies:', error.message);
            return false;
        }
    }
}
