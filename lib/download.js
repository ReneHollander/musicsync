'use strict';

const {promisify} = require('util');
const os = require('os');
const path = require('path');
const execFile = promisify(require('child_process').execFile);
const glob = require('glob-promise');
const fs = require('fs-extra');
const replaceExt = require('replace-ext');
const _ = require('lodash');

const Track = require('./track');
const Playlist = require('./playlist');

const isWin = /^win/.test(process.platform);
const youtubeDlPath = path.resolve('bin', 'youtube-dl' + (isWin ? '.exe' : ''));

function contains(arr, element) {
    return arr.indexOf(element) > -1;
}

function splitAndClean(str, delim) {
    return str.split(delim).map((s) => s.trim()).filter((s) => s)
}

function extractId(str) {
    return str.split(' ')[1];
}

module.exports.fetchPlaylist = async function (data_path, name, playlist_url) {
    data_path = path.join(data_path, name);

    // Create the playlist directory.
    await fs.mkdirp(data_path);

    // Get all track ids from the playlist.
    let {stdout} = await execFile(youtubeDlPath, ['-j', '--flat-playlist', playlist_url], {cwd: data_path});
    let ids = splitAndClean(stdout, '\n').map(JSON.parse).map((i) => i.id);

    let downloaded_path = path.join(data_path, 'downloaded.txt');
    if (await fs.pathExists(downloaded_path)) {
        // Remove tracks that are no longer on the playlist from the download cache file.
        let oldDownloaded = splitAndClean(await fs.readFile(downloaded_path, 'utf8'), os.EOL);
        let [newDownloaded, toDelete] = _.partition(oldDownloaded, id => contains(ids, extractId(id)));
        toDelete = toDelete.map(extractId);
        for (let id of toDelete) {
            // Remove all files that belong to the track with the given id.
            let files = await glob(path.join(data_path, `*${id}*`));
            for (let file of files) {
                await fs.unlink(file);
            }
        }
        // Write the new download cache file.
        await fs.writeFile(downloaded_path, newDownloaded.join(os.EOL) + os.EOL);
    }

    // Download all tracks from the playlist with info files. If a track already exists, it won't be fetched again.
    // If a track got removed from the playlist, no info file will be created.
    await execFile(youtubeDlPath, [
        // Put as much metadata into the mp3 as possible.
        '--metadata-from-title', '%(artist)s - %(title)s', '--add-metadata',
        // Make sure the track is always a mp3 file. If it gets converted, it will have 256K bitrate.
        '--audio-quality', '192K', '--extract-audio', '--audio-format', 'mp3',
        // Create a download archive and write the info files.
        '--write-info-json', '--download-archive', 'downloaded.txt',
        playlist_url
    ], {cwd: data_path});

    let tracks = [];

    let info_files = await glob(path.join(data_path, '*.info.json'));
    for (let info_file of info_files) {
        let audio_path = replaceExt(replaceExt(info_file, ''), '.mp3');
        // Read the info json and add the track to the playlist in the correct place.
        let info = JSON.parse(await fs.readFile(info_file, 'utf8'));
        let index = ids.indexOf(info.id);
        tracks[index] = new Track(audio_path, info);
    }

    return new Playlist(name, playlist_url, tracks, data_path);
};
