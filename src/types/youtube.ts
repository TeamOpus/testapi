export interface VideoData {
    id: string;
    title: string;
    author: string;
    url: string;
    thumbnails: Thumbnail[];
    formats: Format[];
}

export interface Thumbnail {
    url: string;
    size: string; // Format: "widthxheight" e.g., "1280x720"
}

export interface Format {
    type: FormatType;
    quality: string; // e.g., "720p", "480p", "audio_only"
    container: string; // e.g., "mp4", "webm"
    codecs: string; // e.g., "avc1.64001F, mp4a.40.2"
    url: string;
    bitrate: string; // Formatted with spaces, e.g., "1 234 567"
}

export enum FormatType {
    main = 0,   // Video + Audio
    video = 1,  // Video only
    audio = 2   // Audio only
}

export interface CacheStats {
    keys: number;
    hits: number;
    misses: number;
}

// Error types for better error handling
export class YouTubeError extends Error {
    constructor(message: string, public code?: string) {
        super(message);
        this.name = 'YouTubeError';
    }
}

export class ValidationError extends YouTubeError {
    constructor(message: string) {
        super(message, 'VALIDATION_ERROR');
        this.name = 'ValidationError';
    }
}

export class NetworkError extends YouTubeError {
    constructor(message: string) {
        super(message, 'NETWORK_ERROR');
        this.name = 'NetworkError';
    }
}
