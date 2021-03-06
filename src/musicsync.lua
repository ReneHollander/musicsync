local cjson = require "cjson"
local urlutil = require "urlutil"
local settings = require "settings"
local base64 = require "base64"
local inspect = require "inspect"

local baseUrl = settings.url
local authString = "Basic " .. base64.enc(settings.user .. ":" .. settings.passwd)

local logFile = io.open("log.txt", "a")

function log(str)
    local res = inspect(inspect(str))
    print(res)
    logFile:write(res, "\n")
    res = nil
    collectgarbage()
end

log("Starting")

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

    local playlistFile = nil
    local fileCount = 0
    local trackCount = 0

    local function checkNextFile()
        if playlistFile == nil or trackCount >= 100 then
            trackCount = 0
            fileCount = fileCount + 1
            playlistFile = io.open(playlist.name .. " " .. fileCount .. ".m3u", "w")
            playlistFile:write("#EXTM3U\n")
            playlistFile:write("\n")
        end
    end

    local function writeTrack(track)
        checkNextFile()
        trackCount = trackCount + 1
        playlistFile:write("#EXTINF:" .. track.duration .. ", " .. track.title .. "\n")
        playlistFile:write(playlist.name .. "/" .. track.file_name .. "\n")
        playlistFile:write("\n")
    end

    for _, track in pairs(playlist.tracks) do
        local status = 0
        local url = baseUrl .. "/playlist/" .. urlutil.encode(playlist.name) .. "/track/" .. urlutil.encode(track.file_name)
        for i = 1, 3 do
            local attr = lfs.attributes(playlist.name .. "/" .. track.file_name)
            if attr == nil or attr.size ~= track.size then
                fa.remove(playlist.name .. "/" .. track.file_name)
                log("Getting new track " .. track.file_name)
                local res = fa.HTTPGetFile(url, playlist.name .. "/" .. track.file_name, settings.user, settings.passwd)
                local attr = lfs.attributes(playlist.name .. "/" .. track.file_name)
                if res ~= nil and attr ~= nil and attr.size == track.size then
                    status = 2
                    break
                end
            else
                status = 1
                break
            end
        end

        if status > 0 then
            writeTrack(track)
            if status == 2 then
                log("Got track " .. track.file_name .. "(" .. url .. ")")
                sendMessage("Got track " .. track.file_name)
            end
        else
            log("Error getting track " .. track.file_name .. "(" .. url .. ")")
            sendMessage("Error getting track " .. track.file_name)
        end
    end
    playlistFile:close()
end

function update()
    local playlists

    while true do
        local body, status, _ = fa.request {
            url = baseUrl .. "/playlist/",
            method = "GET",
            headers = { ["Authorization"] = authString }
        }
        if status > 0 then
            playlists = cjson.decode(body)
            break
        else
            log(baseUrl .. " is not available. body=" .. body .. ", status=" .. status .. ". Waiting...")
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
        table.insert(processing, playlist.name)
        n_processing = n_processing + 1
        log("Updating playlist " .. playlist.name)
    end

    while n_processing ~= 0 do
        n_processing = 0
        local newprocessing = {}
        for _, playlist in pairs(processing) do
            local url = baseUrl .. "/playlist/" .. urlutil.encode(playlist) .. "/status"
            local res = fa.HTTPGetFile(url, "playlist.json", settings.user, settings.passwd)
            if res == nil then
                log("Error getting playlist " .. playlist .. "(" .. url .. ")")
                sendMessage("Error getting playlist: " .. playlist)
            else
                collectgarbage()
                local f = io.open("playlist.json", "rb")
                local content = f:read("*all")
                f:close()
                fa.remove("playlist.json")
                local decode_status, res = pcall(cjson.decode, content)
                if decode_status == false then
                    log("Error parsing json for play list " .. playlist .. ": " .. res)
                    log(content)
                    sendMessage("Error parsing json for play list " .. playlist)
                else
                    content = nil
                    collectgarbage()
                    if res.status == "done" then
                        log("Playlist " .. playlist .. " is ready for updating")
                        fetchPlaylist(res.playlist)
                        log("Updated playlist " .. playlist)
                    else
                        log("Playlist " .. playlist .. " still processing...")
                        n_processing = n_processing + 1
                        table.insert(newprocessing, playlist)
                    end
                end
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

        local dont_update = io.open("DONT_UPDATE", "w")
        dont_update:write("DONT_UPDATE")
        dont_update:close()
        log("Done updating!")
        sendMessage("Done updating!")
    else
        log("No update will be made, because DONT_UPDATE was present!")
        sendMessage("Finished Update!")

        fa.request("http://127.0.0.1/upload.cgi?WRITEPROTECT=OFF")

        fa.remove("DONT_UPDATE")
    end
end

fa.control("fioset", 1)

-- wait for wifi to connect
while fa.WlanLink() ~= 1 do
    log("Wifi not connected. Waiting...")
    sleep(1000)
end

ip, mask, gw = fa.ip()
log("connected with ip=" .. ip .. ", mask=" .. mask .. ", gw=" .. gw)

local status, err = pcall(main)
if status == false then
    log(err)
    sendMessage("An error occured!\n" .. err)
else
    log("Finished")
end

logFile:close()

fa.control("fioset", 0)
