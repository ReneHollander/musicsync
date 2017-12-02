'use strict';

const path = require('path');
const download = require('./lib/download');

const DATA_PATH = path.join(__dirname, 'data');

async function main() {
    let playlist1 = await download.fetchPlaylist(DATA_PATH, 'Auto - Soundcloud', 'https://soundcloud.com/rene8888/sets/auto');
    let playlist2 = await download.fetchPlaylist(DATA_PATH, 'Auto - YouTube', 'https://www.youtube.com/playlist?list=PLOrnts9vXuINJg9OQ6421YvrBHUAAUtUF');
    console.log(playlist1);
    console.log(playlist2);
}

// process.on('unhandledRejection', (reason, p) => {
//     console.log('Unhandled Rejection at: Promise', p, 'reason:', reason, 'stack:', reason.stack);
// });

main().catch(err => console.log(err));
