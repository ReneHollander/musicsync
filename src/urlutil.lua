local urlutil = {}

function urlutil.decode(str)
    str = string.gsub(str, "+", " ")
    str = string.gsub(str, "%%(%x%x)",
        function(h) return string.char(tonumber(h, 16)) end)
    str = string.gsub(str, "\r\n", "\n")
    return str
end

function urlutil.encode(str)
    if str then
        str = string.gsub(str, "\n", "\r\n")
        str = string.gsub(str, "([^A-Za-z0-9 %-%_%.])", function(c)
            local n = string.byte(c)
            if n < 128 then
                return string.format("%%%02X", n)
            else
                return
                string.format("%%%02X", 192 + bit32.band(bit32.arshift(n, 6), 31)) ..
                        string.format("%%%02X", 128 + bit32.band(n, 63))
            end
        end)
        str = string.gsub(str, " ", "%%20")
    end
    return str
end

return urlutil
