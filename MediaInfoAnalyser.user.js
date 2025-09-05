// ==UserScript==
// @name         RTO MediaInfo analyser
// @namespace    http://tampermonkey.net/
// @version      0.3.1
// @description  MediaInfo analyser!
// @author       Horo
// @updateURL    https://raw.githubusercontent.com/horo-rto/RtoUserscripts/refs/heads/main/MediaInfoAnalyser.user.js
// @match        https://rutracker.org/forum/viewtopic.php?t=*
// @match        https://rutracker.net/forum/viewtopic.php?t=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=rutracker.org
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

var post;

var media_info;

var settings;

// todo:
// setting with ui
// clean cashe

class Settings{
    constructor(){
        var cached_settings = GM_getValue("release_assistance_settings") ?? null;
        console.log(cached_settings);

        try {
            var parsed = JSON.parse(cached_settings);

            this.display = parsed.display ?? this.#default.display;
            this.parce_files = parsed.parce_files ?? this.#default.parce_files;
            this.parce_shiki = parsed.parce_shiki ?? this.#default.parce_shiki;
            this.show_shiki_synonyms = parsed.show_shiki_synonyms ?? this.#default.show_shiki_synonyms;
            this.show_anydb_synonyms = parsed.show_anydb_synonyms ?? this.#default.show_anydb_synonyms;
        } catch (e) {
            console.warn("Settings reading error: " + e.message + "; settings are set to default.");
            Object.assign(this, this.#default);
        }
    }

    save(){
        GM_setValue("release_assistance_settings", JSON.stringify(this));
    }

    #default = {
        display : true,
        parce_files : true,
        parce_shiki : true,
        show_shiki_synonyms: true,
        show_anydb_synonyms: true
    }
}

class MediaInfo{
    genrl = null;
    video = null;
    audio = [];
    subtl = [];
    extra = [];

    constructor() {
        this.isRussian = true;
        this.isJapanese = false;
    }

    parse(){
        var spoilers = post.innerHTML.match(/<div class="sp-wrap">.*?<div class="sp-body">.*?<\/div>\n<\/div>/gms);
        for (const spoiler of spoilers){
            if (spoiler.includes("Frame rate") || spoiler.includes("Частота кадров")){
                var mi_spoiler = spoiler;
            }
        }

        if(mi_spoiler.includes("Общее")){
            var reports = mi_spoiler.split("Общее<br>");
        }else{
            reports = mi_spoiler.split("General<br>");
        }

        var main = reports[reports.length > 1 ? 1 : 0];

        var chunks = main.split("<span class=\"post-br\"><br></span>");

        for (const chunk of chunks) {
            if (chunk.includes("File size") || chunk.includes("Размер файла")){
                this.genrl = new General(chunk);
            } else if (chunk.includes("Text") || chunk.includes("Текст")){
                this.subtl.push(new Text(chunk));
            } else if (chunk.includes("Audio") || chunk.includes("Аудио")){
                this.audio.push(new Audio(chunk));
            } else if (chunk.includes("Video") || chunk.includes("Видео")){
                this.video = new Video(chunk);
            }
        }

        if (reports.length > 2){
            for (var i = 2; i < reports.length; i++){
                var chunks_extra = reports[i].split("<span class=\"post-br\"><br></span>");
                for (const chunk_extra of chunks_extra) {
                    if (chunk_extra.includes("Audio") || chunk_extra.includes("Аудио")){
                        this.extra.push(new Audio(chunk_extra, true));
                    }
                }
            }
        }
    }

    dump(){
        return [ this.genrl, this.video, ...this.audio, ...this.subtl, ...this.extra ];
    }

    toString() {
        var out = [];

        if (this.video.bitrate == -1 && this.genrl != null) {
            out.push(this.genrl.toString());
        }
        out.push("<hr>");
        out.push(this.video.toString());
        out.push("<hr>");
        out.push(Array.from(this.audio, x => x.toString()).join("<\/br>"));
        if (this.subtl.length > 0){
            out.push("<hr>");
            out.push(Array.from(this.subtl, x => x.toString()).join("<\/br>"));
        }
        if (this.extra.length > 0){
            out.push("<hr>");
            out.push(Array.from(this.extra, x => x.toString()).join("<\/br>"));
        }

        return out.join("");
    }
}
class General {
    constructor(chunk) {
        var lines = chunk.replaceAll('&nbsp;', ' ').replaceAll('\n', '').split("<br>");
        for (const line of lines) {
            if (line.includes("File size") || line.includes("Размер файла")){
                this.size = line.split(" : ")[1];
            }else if (line.includes("Overall bit rate") || line.includes("Общий битрейт")){
                this.bitrate = line.split(" : ")[1].replaceAll(/ /g, '').replaceAll("Кбит/сек","kbps").replaceAll("kb/s","kbps").replaceAll("Мбит/сек","Mbps").replaceAll("Mb/s","Mbps");
            }
        }
    }

    size = -1;
    bitrate = -1;

    toString() {
        return "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Overall bit rate: " + this.bitrate;
    }
}
class Video {
    constructor(chunk) {
        var lines = chunk.replaceAll('&nbsp;', ' ').replaceAll('\n', '').split("<br>");
        for (const line of lines) {
            if ((line.startsWith("Format ") && !line.includes("Format profile") && !line.includes("Format settings")) || line.startsWith("Формат ")){
                switch(line.split(" : ")[1]){
                    case "MPEG-4 Visual":
                        this.codec = "XviD";
                        break;
                    case "HEVC":
                        this.codec = "HEVC";
                        var crf = chunk.match(/crf=[\d\.]*/gm);
                        if (crf != null){
                            this.crf = crf[0].split("=")[1];
                        }
                        break;
                    default:
                        this.codec = line.split(" : ")[1];
                        break;
                }
            }else if (line.includes("HDR")){
                this.hdr = line.split(" : ")[1];
            }else if (line.includes("Height") || line.includes("Высота")){
                this.height = line.split(" : ")[1].replaceAll(/\D/g, '');
            }else if (line.includes("Width") || line.includes("Ширина")){
                this.width = line.split(" : ")[1].replaceAll(/\D/g, '');
            }else if (line.includes("Frame rate mode") || line.includes("Режим частоты кадров")){
                if (line.includes("Variable") || line.includes("Переменный")){
                    this.vfr = 1;
                }
            }else if (line.includes("Frame rate") || (line.includes("Частота кадров") && !line.includes("Частота кадров в оригинале"))){
                this.fps = line.split(" : ")[1].split(" ")[0].replace(",", ".");
            }else if (line.includes("Bit rate") || line.includes("Битрейт")){
                this.bitrate = line.split(" : ")[1].toLowerCase().replaceAll(/ /g, '')
                    .replaceAll("кбит/сек","kbps").replaceAll("кбит/с","kbps").replaceAll("кбит/c","kbps").replaceAll("kb/s","kbps")
                    .replaceAll("мбит/сек","Mbps").replaceAll("мбит/с","kbps").replaceAll("мбит/c","kbps").replaceAll("mb/s","Mbps");
                this.bitrate = this.bitrate.replace(",0", "").replace(".0", "");
            }else if (line.includes("Bit depth") || line.includes("Битовая глубина")){
                this.bit = line.split(" : ")[1].replaceAll(/\D/g, '');
            }else if (line.includes("Stream size") || line.includes("Размер потока")){
                var newline = line.split(" : ")[1].split("(");
                var size = newline[0].replaceAll(/[a-zA-Zа-яА-Я ]/g, '');
                var value = newline[0].replaceAll(/[0-9,\. ]/g, '');
                if (value == "Гбайт" || value == "Гигабайт" || value == "GiB" || value == "ГиБ" ){
                    this.size = size.replace(",", ".")*1024;
                }else{
                    this.size = size;
                }
                this.percentage = newline[1].slice(0,-2);
            }else if (line.includes("Language") || line.includes("Язык")){
                this.language = line.split(" : ")[1];
            }else if (line.includes("Default") || line.includes("По умолчанию")){
                if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes"){
                    this.default = 1;
                }else{
                    this.default = 0;
                }
            }else if (line.includes("Forced") || line.includes("Принудительно")){
                if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes"){
                    this.forced = 1;
                }else{
                    this.forced = 0;
                }
            }
        }
    }

    codec = "";
    crf = "";
    hdr = "";
    height = -1;
    width = -1;
    fps = -1;
    vfr = 0;
    bitrate = -1;
    bit = -1;
    size = -1;
    percentage = -1;
    language = "";
    default = 0;
    forced = 0;

    toString() {
        var line = "";
        line += (this.default == 1 ? "[x]" : "<span style=\"color: red; font-weight: bold;\">[?]</span>" );
        line += (this.forced == 1 ? "<span style=\"color: red; font-weight: bold;\">[x]</span>" : "[ ]" );

        if (this.percentage < 0){
            line += "<span style=\"color: #ee7600; font-weight: bold;\">[xx%]</span>";
        }else{
            if (this.percentage < 50){
                line += "<span style=\"color: red; font-weight: bold;\">[" + this.percentage + "%]</span>";
            }else{
                line += "[" + this.percentage + "%]";
            }
        }

        line += " " + this.codec + "@" + this.bit + "bit";

        if (this.crf >= 22){
            line += " <span style=\"color: red; font-weight: bold;\">crf=" + Number(this.crf).toFixed(1) + "</span>";
        }

        line += ", "+ this.width + "x" + this.height + " " + this.fps + "fps ";

        if (this.vfr == 1) line += "(VFR) ";

        if (this.bitrate == -1){
            line += "<span style=\"color: #ee7600; font-weight: bold;\">???kbps</span> ";
        }else{
            line += this.bitrate + " ";
        }

        if (this.hdr != "") line += "<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" + this.hdr;
        return line;
    }
}
class Audio {
    isExt = false;
    title = "";
    codec = "";
    channels = "";
    lfe = 0;
    bitrate = -1;
    samplingrate = -1;
    size = -1;
    percentage = -1;
    delay = "";
    language = "";
    languageError = 0;
    default = 0;
    forced = 0;
    isfirst = 0;

    constructor(chunk, is_ext) {
        if (is_ext == true){
            this.isExt = true;
        }

        var lines = chunk.replaceAll('&nbsp;', ' ').replaceAll('\n', '').split("<br>");
        for (const line of lines) {
            if (line.includes("Audio #1") || line.includes("Аудио #1") || line.includes("Audio") || line.includes("Аудио")){
                this.isfirst = 1;
                media_info.isRussian = true;
                media_info.isJapanese = false;
            }else if (line.startsWith("Title") || line.startsWith("Заголовок")){
                this.title = line.split(" : ")[1];
            }else if ((line.startsWith("Format ") &&
                       !line.startsWith("Format version") &&
                       !line.startsWith("Format profile") &&
                       !line.startsWith("Format settings"))
                      || line.startsWith("Формат ")){
                switch(line.split(" : ")[1]){
                    case "MPEG Audio":
                        this.codec = "MP";
                        break;
                    case "AC-3":
                        this.codec = "AC3";
                        break;
                    case "E-AC-3":
                        this.codec = "EAC3";
                        break;
                    case "AAC LC":
                        this.codec = "AAC";
                        break;
                    case "MLP FBA":
                        this.codec = "TrueHD";
                        break;
                    case "DTS XLL":
                        this.codec = "DHS-HD MA";
                        break;
                    default:
                        this.codec = line.split(" : ")[1];
                        break;
                }
            }else if (line.includes("Format profile") || line.includes("Профиль формата")){
                if (line.split(" : ")[1].startsWith("Layer ")){
                    this.codec += line.split(" : ")[1].replace("Layer ", "");
                }else{
                    this.codec += " " + line.split(" : ")[1];
                }
            }else if (line.includes("Channel(s)") || line.includes("Канал(-ы)") || line.includes("Каналы")){
                this.channels = line.split(" : ")[1].split(" ")[0];
            }else if (line.includes("Channel layout") || line.includes("Channel positions") || line.includes("Расположение каналов")){
                if (line.includes("LFE")) this.lfe = 1;
            }else if (line.includes("Bit rate") || line.includes("Битрейт")){
                this.bitrate = line.split(" : ")[1].toLowerCase().replaceAll(/ /g, '')
                    .replaceAll("кбит/сек","kbps").replaceAll("кбит/с","kbps").replaceAll("кбит/c","kbps").replaceAll("kb/s","kbps")
                    .replaceAll("мбит/сек","Mbps").replaceAll("мбит/с","kbps").replaceAll("мбит/c","kbps").replaceAll("mb/s","Mbps");
                this.bitrate = this.bitrate.replace(",0", "").replace(".0", "");
            }else if (line.includes("Sampling rate") || line.includes("Частота дискретизации") || (line.includes("Частота") && !line.includes("Частота кадров"))){
                this.samplingrate = line.split(" : ")[1].split(" ")[0].replace(",", ".");
            }else if (line.includes("Stream size") || line.includes("Размер потока")){
                var newline = line.split(" : ")[1].split("(");
                var size = newline[0].replaceAll(/[a-zA-Zа-яА-Я ]/g, '');
                var value = newline[0].replaceAll(/[0-9,\. ]/g, '');
                if (value == "Гбайт" || value == "Гигабайт" || value == "GiB" || value == "ГиБ" ){
                    this.size = size.replace(",", ".")*1024;
                }else{
                    this.size = size;
                }
                this.percentage = newline[1].slice(0,-2);
            }else if (line.includes("Delay relative to video") || line.includes("Задержка видео")){
                this.delay = line.split(" : ")[1];
            }else if (line.includes("Language") || line.includes("Язык")){
                this.language = line.split(" : ")[1];

                if (!this.isExt){
                    switch (this.language)
                    {
                        case "Русский":
                        case "Russian":
                            if (!media_info.isRussian) this.languageError = 1;
                            break;
                        case "Японский":
                        case "Japanese":
                            media_info.isRussian = false;
                            media_info.isJapanese = true;
                            break;
                        default:
                            media_info.isRussian = false;
                            if (media_info.isJapanese) this.languageError = 1;
                            break;
                    }
                }
            }else if (line.includes("Default") || line.includes("По умолчанию")){
                if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes"){
                    this.default = 1;
                }else{
                    this.default = 0;
                }
            }else if (line.includes("Forced") || line.includes("Принудительно")){
                if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes"){
                    this.forced = 1;
                }else{
                    this.forced = 0;
                }
            }
        }
    }

    toString() {
        var line = "";
        if (this.default == 1 && this.isfirst != 1){
            line += (this.default == 1 ? "<span style=\"color: red; font-weight: bold;\">[x]</span>" : "[ ]" );
        }else{
            line += (this.default == 1 ? "[x]" : "[ ]" );
        }
        line += (this.forced == 1 ? "<span style=\"color: red; font-weight: bold;\">[x]</span>" : "[ ]" );

        if (media_info.video.size < this.size*3){
            var sizeError = true;
        }

        if (this.percentage < 0){
            line += "<span style=\"color: #ee7600; font-weight: bold;\">[xx%]</span>";
        }else{
            if (sizeError){
                if (this.percentage < 10){
                    line += "<span style=\"color: red; font-weight: bold;\">[0" + this.percentage + "%]</span> ";
                }else{
                    line += "<span style=\"color: red; font-weight: bold;\">[" + this.percentage + "%]</span> ";
                }
            }else{
                if (this.percentage < 10){
                    line += "[0" + this.percentage + "%] ";
                }else{
                    line += "[" + this.percentage + "%] ";
                }
            }
        }

        line += " " + this.codec;

        if (this.lfe == 1){
            line += " " + (this.channels - 1) + ".1, ";
        }else{
            line += " " + this.channels + ".0, ";
        }

        if (this.bitrate == -1){
            line += "<span style=\"color: #ee7600; font-weight: bold;\">???kbps</span> ";
        }else{
            if (sizeError){
                line += "<span style=\"color: red; font-weight: bold;\">" + this.bitrate + "</span> ";
            }else{
                line += this.bitrate + " ";
            }
        }

        line += this.samplingrate + "kHz, ";

        if (this.delay != ""){
            line += "<span style=\"color: red; font-weight: bold;\">" + this.delay + "</span> ";
        }

        if (this.languageError == 1){
            line += "<span style=\"color: red; font-weight: bold;\">" + this.language + "</span>";
        }else{
            line += this.language;
        }

        if (this.title != "") line += ", " +this.title;

        return line;
    }
}
class Text {
    constructor(chunk) {
        var lines = chunk.replaceAll('&nbsp;', ' ').replaceAll('\n', '').split("<br>");
        for (const line of lines) {
            if (line.includes("Text #1") || line.includes("Текст #1") || line.includes("Text") || line.includes("Текст")){
                this.isfirst = 1;
                media_info.isRussian = true;
                media_info.isJapanese = false;
            }else if (line.startsWith("Title") || line.startsWith("Заголовок")){
                this.title = line.split(" : ")[1];
            }else if (line.startsWith("Format ") || line.startsWith("Формат ")){
                this.codec = line.split(" : ")[1];
            }else if (line.includes("Count of elements") || line.includes("Число элементов")){
                this.count = line.split(" : ")[1];
            }else if (line.includes("Language") || line.includes("Язык")){
                this.language = line.split(" : ")[1];

                switch (this.language)
                {
                    case "Русский":
                    case "Russian":
                        if (!media_info.isRussian) this.languageError = 1;
                        break;
                    case "Японский":
                    case "Japanese":
                        media_info.isRussian = false;
                        media_info.isJapanese = true;
                        break;
                    default:
                        media_info.isRussian = false;
                        if (media_info.isJapanese) this.languageError = 1;
                        break;
                }
            }else if (line.includes("Default") || line.includes("По умолчанию")){
                if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes"){
                    this.default = 1;
                }else{
                    this.default = 0;
                }
            }else if (line.includes("Forced") || line.includes("Принудительно")){
                if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes"){
                    this.forced = 1;
                }else{
                    this.forced = 0;
                }
            }
        }
    }

    title = "";
    codec = "";
    count = -1;
    language = "";
    languageError = 0;
    default = 0;
    forced = 0;
    isfirst = 0;

    toString() {
        var line = "";
        if (this.default == 1 && this.isfirst != 1){
            line += (this.default == 1 ? "<span style=\"color: red; font-weight: bold;\">[x]</span>" : "[ ]" );
        }else{
            line += (this.default == 1 ? "[x]" : "[ ]" );
        }
        line += (this.forced == 1 ? "<span style=\"color: red; font-weight: bold;\">[x]</span>" : "[ ]" );

        line += " " + this.codec + ", ";
        if (this.count > -1) line += this.count + " lines, ";

        if (this.languageError == 1){
            line += "<span style=\"color: red; font-weight: bold;\">" + this.language + "</span>";
        }else{
            line += this.language;
        }

        if (this.title != "") line += ", " +this.title;

        return line;
    }
}

(function() {
    console.log("RTO mediainfo analyser");
    if(window.location.href.match(/start=\d+/) != null) return;

    settings = new Settings();
    post = $('#topic_main > tbody > tr > .td2 > .post_wrap > .post_body')[0];

    create_ui();

    process_mi();
})();

function process_mi(){
    try{
        media_info = new MediaInfo();
        media_info.parse();
        console.log( media_info.dump() );
        $('#mi_data').append(media_info.toString());
    } catch (e) {
        console.error("Media info parcing error:", e);
    }
}

/// common ui code

function create_ui(){
    // https://api.jquery.com/jQuery/#jQuery2

    let box = $('<div>',
                {id: 'assist_box',
                 style: "position: fixed; top:60%; right: -5px; padding: 10px 10px 10px 15px; " +
                 "background-color: #dee3e7; border-radius: 5px; border: 1px solid #80808080;" +
                 "font-family: \"Lucida Console\", Consolas, monospace; font-size: 12px; line-height: 14px;"
                }).appendTo(jQuery('body'));

    box.append([
        $('<div>', {style: "position: absolute; top:0px; left: 0px; width: 12px; height: 100%; border-right: 1px solid #80808080; cursor: pointer;", click: toggle}).append([
            $('<div>', {id: 'assist_box_arrow_right', style: "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: gray;", html: "⯈"}),
            $('<div>', {id: 'assist_box_arrow_left', style: "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: gray;", html: "⯇"})
        ]),
        $('<div>', {id: 'shiki_data', style: ""}),
        $('<hr>'),
        $('<div>', {id: 'errors_data', style: ""}),
        $('<hr>'),
        $('<div>', {id: 'warnings_data', style: ""}),
        $('<hr>'),
        $('<div>', {id: 'mi_data', style: ""})
    ]);

    update_ui_state();
}
function toggle() {
    settings.display = !settings.display;
    settings.save();
    update_ui_state();
}
function update_ui_state() {
    if(settings.display){
        $('#assist_box')[0].style.transform = "translate(0, 0)";
    }else{
        $('#assist_box')[0].style.transform = "translate(calc(100% - 20px), 0)";
    }

    $('#assist_box_arrow_right')[0].style.display = settings.display ? "block" : "none";
    $('#assist_box_arrow_left')[0].style.display = settings.display ? "none" : "block";
}
