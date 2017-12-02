'use strict';

// Helper to upload lua scripts to SD card during development.

const fs = require('fs');
const request = require('request');
const chokidar = require('chokidar');

let jobs = {};

chokidar.watch('src/*.lua').on('all', (event, path) => {
    if (!jobs[path]) {
        jobs[path] = "running";
        console.log("Starting upload of " + path);
        request.post({
                url: 'http://flashair/upload.cgi', formData: {'file': fs.createReadStream(path)}
            },
            (err, resp, body) => {
                delete jobs[path];
                if (err) {
                    console.log(err);
                } else {
                    console.log("Uploaded " + path);
                }
            });
    }
});
