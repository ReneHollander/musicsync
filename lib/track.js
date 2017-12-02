'use strict';

class Track {
    constructor(audio_path, info) {
        this.title = info.title;
        this.duration = info.duration;
        this.playlist_index = info.playlist_index;
        this.info = info;
        this.audio_path = audio_path;
    }
}

module.exports = Track;
