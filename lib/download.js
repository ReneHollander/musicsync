'use strict';

const {promisify} = require('util');
const os = require('os');
const path = require('path');
const execFile = promisify(require('child_process').execFile);
const child_process = require('child_process');
const glob = require('glob-promise');
const fs = require('fs-extra');
const replaceExt = require('replace-ext');
const _ = require('lodash');
const ID3v2 = require('jamp3').ID3v2;
const simplifyTag = require('jamp3').simplifyTag;
const id3v2 = new ID3v2();

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

function downloadTracks(playlist_url, data_path) {
    return new Promise((resolve, reject) => {
        let p = child_process.spawn(youtubeDlPath, [
            // Put as much metadata into the mp3 as possible.
            '--metadata-from-title', '%(artist)s - %(title)s', '--add-metadata',
            // Make sure the track is always a mp3 file. If it gets converted, it will have 256K bitrate.
            '--audio-quality', '192K', '--extract-audio', '--audio-format', 'mp3',
            // Create a download archive.
            '--download-archive', 'downloaded.txt',
            // Remove all non ASCII characters from song name, also removes spaces.
            '--restrict-filenames',
            // Force IPv4 connection.
            '-4',
            // Skip invalid videos.
            '-i',
            playlist_url,
        ], {cwd: data_path});
        p.stdout.setEncoding('utf8');
        p.stdout.on('data', function(data) {
            process.stdout.write(data);
        });
        p.stderr.setEncoding('utf8');
        p.stderr.on('data', function(data) {
            process.stderr.write(data);
        });
        p.on('close', (code) => {
            if (code == 0) resolve();
            else reject(code);
        });
    });
}

module.exports.fetchPlaylist = async function (data_path, name, playlist_url) {
    // Update youtube-dl to latest version.
    console.log("Updating youtube-dl");
    await execFile(youtubeDlPath, ['-U'], {cwd: path.resolve('bin')});

    data_path = path.join(data_path, name);

    // Create the playlist directory.
    await fs.mkdirp(data_path);

    // Get all track ids from the playlist.
    console.log("Getting tracks from playlist");
    let {stdout} = await execFile(youtubeDlPath, ['-j', '--flat-playlist', playlist_url, '-4', '-i'], {
        cwd: data_path,
        maxBuffer: 50 * 1024 * 1024
    });
    let ids = splitAndClean(stdout, '\n').map(JSON.parse).map((i) => i.id);

    let downloaded_path = path.join(data_path, 'downloaded.txt');
    if (await fs.pathExists(downloaded_path)) {
        // Remove tracks that are no longer on the playlist from the download cache file.
        let oldDownloaded = splitAndClean(await fs.readFile(downloaded_path, 'utf8'), '\n');
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
        await fs.writeFile(downloaded_path, newDownloaded.join('\n') + '\n');
    }

    // Download all tracks from the playlist with info files. If a track already exists, it won't be fetched again.
    // If a track got removed from the playlist, no info file will be created.
    console.log("Downloading missing tracks");
    await downloadTracks(playlist_url, data_path);

    let tracks = [];

    let audio_files = await glob(path.join(data_path, '*.mp3'));
    for (let audio_path of audio_files) {
        // Read the mp3 to extract info and add track to the playlist in the correct place.
        let id = audio_path.substring(audio_path.length - 15, audio_path.length - 4);
        let metadata = simplifyTag(await id3v2.read(audio_path));
        let stats = await fs.stat(audio_path);
        let index = ids.indexOf(id);
        tracks[index] = new Track(metadata.ARTIST + " - " + metadata.TITLE, path.basename(audio_path), audio_path, stats.size);
    }
    console.log("Finished writing new playlist " + name);
    return new Playlist(name, playlist_url, tracks, data_path);
};
