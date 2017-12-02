'use strict';

const TelegramBot = require('node-telegram-bot-api');
const Koa = require('koa');
const auth = require('koa-basic-auth');
const Router = require('koa-router');
const logger = require('koa-logger');
const bodyparser = require('koa-bodyparser');
const path = require('path');
const fs = require('fs-extra');
const download = require('./lib/download');

const app = new Koa();
app.use(logger());

const router = new Router();

async function main() {
    let config = JSON.parse(await fs.readFile(path.resolve('config.json')));

    const bot = new TelegramBot(config.telegram.token, {polling: true});

    bot.onText(/\/start/, async (msg) => {
        let chatId = msg.chat.id;
        if (msg.chat.type === 'private' && msg.chat.username === config.telegram.allowed_user) {
            config.telegram.chat_id = chatId;
            await fs.writeFile(path.resolve('config.json'), JSON.stringify(config, null, 2));
            bot.sendMessage(chatId, "MusicSync configured!");
        } else {
            bot.sendMessage(chatId, "You are not on the list of allowed users!");
        }
    });

    let data_path = path.resolve(config.data_path);

    let playlists = {};
    for (let playlist of config.playlists) {
        let pl = {
            name: playlist.name,
            url: playlist.url,
            status: 'not started'
        };
        playlists[pl.name] = pl;
    }

    router
        .get('/playlist/', (ctx) => {
            let resp = [];
            for (let key in playlists) {
                let playlist = playlists[key];
                resp.push({name: playlist.name});
            }
            ctx.body = resp;
        })
        .param('playlist_name', (playlist_name, ctx, next) => {
            let playlist = playlists[playlist_name];
            if (!playlist) {
                return ctx.status = 404;
            }
            ctx.playlist = playlist;
            return next();
        })
        .post('/playlist/:playlist_name/update', (ctx) => {
            let playlist = ctx.playlist;

            if (playlist.status !== 'processing') {
                delete playlist.playlist;
                playlist.status = 'processing';
                download.fetchPlaylist(data_path, playlist.name, playlist.url)
                    .then(res => {
                        playlist.playlist = res;
                        playlist.status = 'done';
                    }).catch(console.log);
            }
            ctx.body = {name: playlist.name, status: playlist.status};
        })
        .get('/playlist/:playlist_name/status', (ctx) => {
            let playlist = ctx.playlist;

            let resp = {name: playlist.name, status: playlist.status};
            if (playlist.status === 'done') {
                resp.playlist = playlist.playlist;
            }
            ctx.body = resp;
        })
        .param('track_name', (track_name, ctx, next) => {
            let playlist = ctx.playlist;
            if (playlist.status !== 'done') {
                return ctx.status = 409;
            }

            let track = playlist.playlist.tracks.find(t => t.file_name === track_name);
            if (!track) {
                return ctx.status = 404;
            }
            ctx.track = track;
            return next();
        })
        .get('/playlist/:playlist_name/track/:track_name/', async (ctx) => {
            let playlist = ctx.playlist;
            let track = ctx.track;

            ctx.type = path.extname(track.audio_path);
            ctx.body = fs.createReadStream(track.audio_path);
        });

    router
        .post("/notify", async (ctx) => {
            if (config.telegram.chat_id) {
                bot.sendMessage(config.telegram.chat_id, ctx.request.body).catch(err => console.log(err));
            }
            ctx.status = 200;
        });

    app
        .use(auth({name: config.api.user, pass: config.api.password}))
        .use(bodyparser({enableTypes: ['json', 'form', 'text']}))
        .use(router.routes())
        .use(router.allowedMethods());

    app.listen(config.port);
}

main().catch(err => console.log(err));
