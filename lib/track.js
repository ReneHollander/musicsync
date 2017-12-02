'use strict';

const path = require('path');

class Track {
    constructor(audio_path, info) {
        this.title = info.title;
        this.duration = info.duration;
        this.file_name = path.basename(audio_path);
        this.audio_path = audio_path;
    }
}

module.exports = Track;
