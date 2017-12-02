'use strict';

class Playlist {
    constructor(name, url, tracks, data_path) {
        this.name = name;
        this.url = url;
        this.tracks = tracks;
        this.data_path = data_path;
    }
}

module.exports = Playlist;
