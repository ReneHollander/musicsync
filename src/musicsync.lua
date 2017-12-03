local cjson = require "cjson"
local urlutil = require "urlutil"
local settings = require "settings"
local base64 = require "base64"

local baseUrl = settings.url
local authString = "Basic " .. base64.enc(settings.user .. ":" .. settings.passwd)

local logFile = io.open("log.txt", "w")

function log(str)
    print(str)
    io.output(logFile)
    io.write(str, "\n")
end

function fetchPlaylist(playlist)
    if lfs.attributes(playlist.name) == nil then
        lfs.mkdir(playlist.name)
    end

    local tracks = {}
    for _, track in pairs(playlist.tracks) do
        tracks[track.file_name] = true
    end

    for file in lfs.dir(playlist.name) do
        if not tracks[file] then
            log("Deleting old track " .. file)
            fa.remove(playlist.name .. "/" .. file)
        end
    end

    local playlistFile = io.open(playlist.name .. ".m3u", "w")
    io.output(playlistFile)

    io.write("#EXTM3U\n")
    io.write("\n")

    local function writeTrack(track)
        io.write("#EXTINF:" .. track.duration .. ", " .. track.title .. "\n")
        io.write(playlist.name .. "/" .. track.file_name .. "\n")
        io.write("\n")
    end

    for _, track in pairs(playlist.tracks) do
        if lfs.attributes(playlist.name .. "/" .. track.file_name) == nil then
            log("Getting new track " .. track.file_name)
            local url = baseUrl .. "/playlist/" .. urlutil.encode(playlist.name) .. "/track/" .. urlutil.encode(track.file_name)
            local res = fa.HTTPGetFile(url, playlist.name .. "/" .. track.file_name, settings.user, settings.passwd)
            if res == nil then
                log("Error getting track " .. track.file_name .. "(" .. url .. ")")
            else
                writeTrack(track)
            end
        else
            writeTrack(track)
        end
    end

    io.close(playlistFile)
end

function update()
    local playlists

    while true do
        local body, status, _ = fa.request {
            url = baseUrl .. "/playlist/",
            method = "GET",
            headers = { ["Authorization"] = authString }
        }

        if status ~= -1 then
            playlists = cjson.decode(body)
            break
        else
            log(baseUrl .. " is not available. Waiting...")
            sleep(1000)
        end
    end

    sendMessage("Starting update!")

    local n_processing = 0
    local processing = {}

    for _, playlist in pairs(playlists) do
        fa.request {
            url = baseUrl .. "/playlist/" .. urlutil.encode(playlist.name) .. "/update",
            method = "POST",
            headers = { ["Authorization"] = authString }
        }
        table.insert(processing, playlist.name);
        n_processing = n_processing + 1
        log("Updating playlist " .. playlist.name)
    end

    while n_processing ~= 0 do
        n_processing = 0
        local newprocessing = {}
        for _, playlist in pairs(processing) do
            local body, _, _ = fa.request {
                url = baseUrl .. "/playlist/" .. urlutil.encode(playlist) .. "/status",
                method = "GET",
                headers = { ["Authorization"] = authString }
            }
            local resp = cjson.decode(body)
            if resp.status == "done" then
                log("Playlist " .. playlist .. " is ready for updating")
                fetchPlaylist(resp.playlist)
                log("Updated playlist " .. playlist)
            else
                n_processing = n_processing + 1
                table.insert(newprocessing, playlist)
            end
        end
        processing = newprocessing
        sleep(1000)
    end
end

function sendMessage(msg)
    fa.request {
        url = baseUrl .. "/notify",
        method = "POST",
        body = msg,
        headers = {
            ["Authorization"] = authString,
            ["Content-Length"] = string.len(msg),
            ["Content-Type"] = "text/plain"
        }
    }
end

function main()
    if lfs.attributes("DONT_UPDATE") == nil then
        log("Starting update!")

        fa.request("http://127.0.0.1/upload.cgi?WRITEPROTECT=ON")

        update()

        local file = io.open("DONT_UPDATE", "w")
        io.output(file)
        io.close(file)
        sendMessage("Done updating!")
    else
        log("No update will be made, because DONT_UPDATE was present!")

        fa.request("http://127.0.0.1/upload.cgi?WRITEPROTECT=OFF")

        fa.remove("DONT_UPDATE")
    end
end

-- wait for wifi to connect
while string.sub(fa.ReadStatusReg(), 13, 13) ~= "a" do
    log("Wifi not connected. Waiting...")
    sleep(1000)
end

local status, err = pcall(main)
if status == false then
    log(err)
    sendMessage("An error occured!\n" .. err)
end

io.close(logFile)