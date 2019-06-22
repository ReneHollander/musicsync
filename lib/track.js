'use strict';

class Track {
    constructor(title, file_name, audio_path, size) {
        this.title = title;
        this.duration = 1;
        this.file_name = file_name;
        this.audio_path = audio_path;
        this.size = size;
    }
}

module.exports = Track;
