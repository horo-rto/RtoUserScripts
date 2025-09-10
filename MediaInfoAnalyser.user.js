// ==UserScript==
// @name         RTO Release Assistant
// @namespace    http://tampermonkey.net/
// @version      0.5.8
// @description  It was just a MediaInfo analyser!
// @author       Horo
// @updateURL    https://raw.githubusercontent.com/horo-rto/RtoUserscripts/refs/heads/main/MediaInfoAnalyser.user.js
// @match        https://rutracker.org/forum/viewtopic.php?t=*
// @match        https://rutracker.net/forum/viewtopic.php?t=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=rutracker.org
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

var anime;
var media_info;

var settings;

var errors = [];
var warnings = [];
var size_warnings = [];

// todo:
// clean cashe
// icons for links
// перенос ссылок если их много
// выделять русские лосслесс дороги
//
// files bugs:
// https://rutracker.org/forum/viewtopic.php?t=6220551
//
// no mi:
// https://rutracker.org/forum/viewtopic.php?t=6679139
// https://rutracker.org/forum/viewtopic.php?t=6428442
//
// неправильно парсит mi
// https://rutracker.org/forum/viewtopic.php?t=6732149
// https://rutracker.org/forum/viewtopic.php?t=4387912

class Settings{
    constructor(){
        var cached_settings = GM_getValue("release_assistance_settings") ?? null;

        try {
            var parsed = JSON.parse(cached_settings);

            this.display = parsed.display ?? this.#default.display;
            this.parce_files = parsed.parce_files ?? this.#default.parce_files;
            this.show_same_size_files = parsed.show_same_size_files ?? this.#default.show_same_size_files;
            this.parce_files_on_completed = parsed.parce_files_on_completed ?? this.#default.parce_files_on_completed;
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
        show_same_size_files: true,
        parce_files_on_completed: true,
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
        this.isOriginal = false;
    }

    parse(post){
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

        var err = this.audio.filter(x => x.bitrate == -1);
        if ((err.length > 0 || this.video.bitrate == -1) && this.genrl != null) {
            out.push(this.genrl.toString());
            out.push("<hr>");
        }
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

    recalculate_language_errors(country){
        let lng1 = "", lng2 = "";
        switch(country){
            case "Япония":
                lng1 = "Японский";
                lng2 = "Japanese";
                break;
            case "Китай":
                lng1 = "Китайский";
                lng2 = "Chinese";
                break;
            case "Корея":
                lng1 = "Корейский";
                lng2 = "Korean";
                break;
        }

        this.isRussian = true;
        this.isOriginal = false;

        for (let audio of this.audio) {
            audio.languageError = 0;

            if (!audio.isExt){
                switch (audio.language)
                {
                    case "Русский":
                    case "Russian":
                        if (!media_info.isRussian) audio.languageError = 1;
                        break;
                    case lng1:
                    case lng2:
                        media_info.isRussian = false;
                        media_info.isOriginal = true;
                        break;
                    default:
                        media_info.isRussian = false;
                        if (media_info.isOriginal) audio.languageError = 1;
                        break;
                }
            }
        }

        console.log(this.audio);

        this.isRussian = true;
        this.isOriginal = false;

        for (let subtl of this.subtl) {
            subtl.languageError = 0;

            switch (subtl.language)
            {
                case "Русский":
                case "Russian":
                    if (!media_info.isRussian) subtl.languageError = 1;
                    break;
                    case lng1:
                    case lng2:
                    media_info.isRussian = false;
                    media_info.isOriginal = true;
                    break;
                default:
                    media_info.isRussian = false;
                    if (media_info.isOriginal) subtl.languageError = 1;
                    break;
            }
        }
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
            }else if (line.includes("Nominal bit rate") || line.includes("Номинальный битрейт")){
                if (this.bitrate == -1){
                    this.bitrate = line.split(" : ")[1].toLowerCase().replaceAll(/ /g, '')
                        .replaceAll("кбит/сек","kbps").replaceAll("кбит/с","kbps").replaceAll("кбит/c","kbps").replaceAll("kb/s","kbps")
                        .replaceAll("мбит/сек","Mbps").replaceAll("мбит/с","kbps").replaceAll("мбит/c","kbps").replaceAll("mb/s","Mbps");
                    this.bitrate = this.bitrate.replace(",0", "").replace(".0", "");
                }
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
            }else if (line.includes("Default") || line.includes("По умолчанию") || line.includes("Дорожка по умолчанию")){
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
            if (line.replaceAll(/<.*?>/g, "") == "Audio #1" ||
                line.replaceAll(/<.*?>/g, "") == "Аудио #1" ||
                line.replaceAll(/<.*?>/g, "") == "Audio" ||
                line.replaceAll(/<.*?>/g, "") == "Аудио"){
                this.isfirst = 1;
                media_info.isRussian = true;
                media_info.isOriginal = false;
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
                            media_info.isOriginal = true;
                            break;
                        default:
                            media_info.isRussian = false;
                            if (media_info.isOriginal) this.languageError = 1;
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
            line += "<span style=\"color: red; font-weight: bold;\">[x]</span>";
        }else if (this.default != 1 && this.isfirst == 1){
            line += "<span style=\"color: red; font-weight: bold;\">[?]</span>";
        }else{
            line += (this.default == 1 ? "[x]" : "[ ]" );
        }
        line += (this.forced == 1 ? "<span style=\"color: red; font-weight: bold;\">[x]</span>" : "[ ]" );

        if (media_info.video.size != -1 && media_info.video.size < this.size*3){
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
            if (line.replaceAll(/<.*?>/g, "") == "Text #1" ||
                line.replaceAll(/<.*?>/g, "") == "Текст #1" ||
                line.replaceAll(/<.*?>/g, "") == "Text" ||
                line.replaceAll(/<.*?>/g, "") == "Текст"){
                this.isfirst = 1;
                media_info.isRussian = true;
                media_info.isOriginal = false;
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
                        media_info.isOriginal = true;
                        break;
                    default:
                        media_info.isRussian = false;
                        if (media_info.isOriginal) this.languageError = 1;
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

class Anime {
    constructor(data, anidb_titles) {
        this.#src = data;

        this.id = data.id;
        this.year = data.airedOn.year;
        this.type = data.kind;
        this.episodes = data.episodes;
        this.duration = data.duration;
        this.genres = Array.from(data.genres, (x) => x.russian.toLowerCase());
        this.rating = data.rating;

        this.licenseNameRu = data.licenseNameRu;
        this.russian = data.russian;

        this.directors = Array.from(data.personRoles.filter(x => x.rolesEn.includes("Director")), x => x.person.russian);
        this.studios = Array.from(data.studios, x => x.name);

        this.links = data.externalLinks;
        this.links.push({kind : "shikimori", url : "https://shikimori.one/animes/"+ this.id});

        if (this.links.filter(x => x.kind=="anime_db").length > 0){
            var anime_db_id = this.links.filter(x => x.kind=="anime_db")[0].url.match(/\d+/gm)[0];

            if (anidb_titles != null && anidb_titles[anime_db_id] != null ){
                this.altr_anidb = anidb_titles[anime_db_id];
                if (this.altr_anidb.filter(x => x.type == "main").length > 0){
                    let main = this.altr_anidb.filter(x => x.type == "main")[0]
                    this.name = main["#text"];
                    switch(main["xml:lang"]){
                        case "x-jat":
                            this.country = "Япония";
                            break;
                        case "x-zht":
                            this.country = "Китай";
                            break;
                        case "x-kot":
                            this.country = "Корея";
                            break;
                        default:
                            this.country = main["xml:lang"];
                            break;
                    }
                }else{
                    this.error = "Не найден главный заголовок, возможно, язык не поддерживается.";
                }
            }else{
                this.error = "Произведение не найдено в кеше заголовков. Обновите .xml файл:";
            }
        }

        this.configue_altr();
    }

    #src = {};

    toString() {
        this.configue_altr();

        var out = [];

        if (this.licenseNameRu){
            out.push("<b>" + this.licenseNameRu + "</b>");
        }else{
            out.push(this.russian);
        }
        out.push("<b>" + this.name + "</b>");
        out.push("");
        if (this.altr.length > 0){
            out.push(this.altr.join("<\/br>"));
            out.push("");
        }
        out.push(this.year + ", " + this.country);
        out.push(this.type + ", " + (this.episodes == 0 ? "?" : this.episodes) + " по " + this.duration + " мин");
        out.push(this.genres.join(", "));
        out.push(this.directors.join(", "));
        out.push(this.studios.join(", "));

        out.push("");

        out.push(this.getLinks());

        return out.join("</br>");
    }

    getLinks(){
        return Array.from(this.links, link => "<a href =\""+ link.url +"\" target=\"_blank\" >" + this.getLogo(link) + "</a>").join(" ");
    }

    getLogo(link){
        switch(link.kind){
            case "shikimori":
                return "Shiki";
            case "official_site":
                return "Site";
            case "wikipedia":
                return "Wiki."+link.url.slice(8, 10).toUpperCase();
            case "anime_news_network":
                return "ANN";
            case "myanimelist":
                return "MAL";
            case "anime_db":
                return "AniDB";
            case "world_art":
                return "WA";
            case "twitter":
                return "X";
            case "kinopoisk_hd":
                return "KP_HD";
            case "kinopoisk":
                return "KP";
            case "okko":
                return "okko";
            case "wink":
                return "wink";
            case "amediateka":
                return "amtk";
            case "kage_project":
                return "kage";
            default:
                return link.kind;
        }
    }

    configue_altr(){
        this.altr = [];

        if (settings.show_shiki_synonyms){
            this.altr = [(this.#src.licenseNameRu ? this.#src.russian : null), this.#src.name, this.#src.english, this.#src.japanese, ...this.#src.synonyms];
        }
        if (settings.show_anydb_synonyms) {
            this.altr = [...this.altr, ...(this.altr_anidb ? Array.from(this.altr_anidb, x => x["#text"]) : [])];
        }

        this.altr = this.altr
            .filter(n => n)
            .filter(n => n != (this.licenseNameRu ?? this.russian))
            .filter(n => n != this.name);
        this.altr = [...new Set(this.altr)].sort();
    }
}

(function() {
    console.log("RTO Release Assistant");
    if (window.location.href.match(/start=\d+/) != null) return;
    if (check_torrent_status() == null) return;

    settings = new Settings();;

    var post = $('#topic_main > tbody > tr > .td2 > .post_wrap > .post_body')[0];

    create_ui();

    image_processing(post);
    process_mi(post);

    init_files_processing();

    load_shiki(find_shiki_id(post));
})();

// topic html parsing

function check_torrent_status(){
    var status = $('#tor-status-resp > .tor-icon')[0];
    if (status == null) return null;
    return status.innerHTML == "√" || status.innerHTML == "#" || status.innerHTML == "T";
}
function find_shiki_id(post){
    var link = post.innerHTML.match(/myanimelist.net.anime.\d+/gm);
    if (link != null){
        return link[0].match(/\d+/gm)[0];
    }else{
        link = post.innerHTML.match(/shikimori.one.animes.\d+/gm);
        if (link != null){
            return link[0].match(/\d+/gm)[0];
        }
    }

    return null;
}
function process_mi(post){
    try{
        media_info = new MediaInfo();
        media_info.parse(post);

        if (media_info.video != null){
            console.log( media_info.dump() );
            $('#mi_data').html(media_info.toString());
        }
    } catch (e) {
        console.error("Media info parcing error:", e);
    }
}
function image_processing(post){
    try{
        var images = post.innerHTML.match(/<img .*?>/gm).filter(x => x.includes("postImg"));
        var regex = /class=\".*?\" /g;
        images = Array.from(images, (x) => x.replace("<img ","").replace(regex,"").replace("alt=\"pic\" ","").replace("src=\"","").replace("\">",""));
        for(var i = 0; i < images.length; i++){
            var theImage = new Image();
            theImage.src = images[i];
            var longer = theImage.height > theImage.width ? theImage.height : theImage.width;
            var shorter = theImage.height <= theImage.width ? theImage.height : theImage.width;
            if (longer > 700 || shorter > 500){
                $('#image_data').html("Некорректный размер изображения");
                $('#image_data').show();
            }
        }
    }catch(e){
        console.error("Image processing error:", e);
    }
}

// files processing

class Folder{
    constructor(folder, parentObj) {
        this.name = folder.name
            .replace("&amp;", "&");

        this.files = folder.nodes.filter(x => x.type != "dir");
        this.files = this.files.filter(x => x.type.includes("mkv") ||
                                            x.type.includes("mp4") ||
                                            x.type.includes("avi") ||
                                            x.type.includes("mka") ||
                                            x.type.includes("ass") ||
                                            x.type.includes("srt"));

        this.parent = parentObj;

        this.fullPath = this.parent ? (this.parent.fullPath + "/" + this.name) : this.name;

        if (this.fullPath.includes("Extra") ||
            this.fullPath.includes("NC") ||
            this.fullPath.includes("PV") ||
            this.fullPath.includes("CM") ||
            //this.fullPath.includes("Special") ||
            this.fullPath.includes("Bonus") ||
            this.files.length == 0){
            this.ignore = true;
        }

        this.calcOffset(parentObj);

        for (let file of this.files) {
            file.epNumber = this.cut(file.name);
        }
    }

    calcOffset(parentObj){
        this.cutFromStart = 0;
        this.cutFromEnd = 0;

        if (this.files.length > 1){// && this.files[0].name.length == this.files[this.files.length-1].name.length) {
            var is_same = true;
            for (let i = 0; i < this.files[0].name.length; i++){
                if (this.files[0].name.charAt(i) == this.files[this.files.length-1].name.charAt(i)){
                    if (is_same){
                        this.cutFromStart = i+1;
                    }
                }else{
                    is_same = false;
                }
            }

            is_same = true;
            for (let i = 0; i < this.files[0].name.length; i++){
                if (this.files[0].name.charAt(this.files[0].name.length - i) == this.files[this.files.length-1].name.charAt(this.files[this.files.length-1].name.length - i)){
                    if (is_same){
                        this.cutFromEnd = i;
                    }
                }else{
                    is_same = false;
                }
            }
        }else if(this.files.length == 1){
            this.cutFromStart = parentObj.cutFromStart;
            this.cutFromEnd = parentObj.cutFromEnd;
        }
    }

    cut(filename){
        return filename.slice(this.cutFromStart, filename.length-this.cutFromEnd);
    }

    getHtmlPath(){
        return "<span style=\"color: #FF4F00;\" title=\"" + this.fullPath + "\">" + this.name + "</span>";
    }
}
function init_files_processing(){
    try{
        var is_completed = check_torrent_status();
        if (settings.parce_files && (settings.parce_files_on_completed || !is_completed)){
            var topic_id = window.location.href.match(/\d+/)[0];
            get_ajax("https://rutracker.org/forum/viewtorrent.php", 'POST',
                     'application/x-www-form-urlencoded; charset=UTF-8', "t="+topic_id, files_processing);
        }else{
            update_ui_errors();
        }
    } catch (e) {
        console.error("Files processing error:", e);
    }
}
function files_processing(){
    if (this.status >= 400) {
        console.error('Returned ' + this.status + ': ' + this.responseText);
        return;
    }

    if (this.responseText.startsWith("Torrent not found")){
        update_ui_errors();
        return;
    }
    if (document.title.includes("DVD5") || document.title.includes("DVD9")){
        warnings.push("DVD разметка не анализируется");
        update_ui_errors();
        return;
    }

    // create data structure

    var parser = new DOMParser();
    var doc = parser.parseFromString(this.responseText, "text/html");
    var treeObj = htmlListToObj(doc.getElementsByClassName("ftree")[0].firstElementChild);

    if (treeObj.nodes == null) {
        update_ui_errors();
        return;
    }

    var folders = [];

    recurcive_folder(treeObj);
    function recurcive_folder(folder, parentObj){
        var folderObj = new Folder(folder, parentObj);

        folders.push(folderObj);

        for (var node of folder.nodes) {
            if (node.type == "dir"){
                recurcive_folder(node, folderObj);
            }
        }
    }
    console.log(folders);

    // analyse

    for (let folder of folders) {
        for (let file of folder.files) {
            if(file.name.match(/[^A-Za-zА-Яа-я0-9 !#$%&'(),;=@^_~\-\[\]\+\.]/gm) != null) {
                errors.push("Запрещенные символы: " + file.name);
            }
        }
    }

    folders = folders.filter(x => !x.ignore);

    var root = folders[0];
    var specials = folders.filter(x => x.fullPath.includes("Special"))[0];
    var video_files = [...root.files, ...(specials?.files ?? [])];

    if (folders.length > 1){
        for (let episode of video_files) {
            let noTranslation = true;
            for (let folder of folders.filter(x => x.parent)) {
                for (let trnsl of folder.files) {
                    if (trnsl.name.startsWith(episode.name)){
                        noTranslation = false;
                    }
                }
            }
            if (noTranslation){
                errors.push("Нет перевода на эпизод " + episode.epNumber);
            }
        }
    }

    for (let folder of folders.filter(x => !x.fullPath.includes("Special"))) {
        for (let trnsl of folder.files) {
            if (trnsl.type != "mkv" && trnsl.type != "mp4" && trnsl.type != "avi"){
                let has_video = false;
                for (let episode of video_files) {
                    if (trnsl.name.startsWith(episode.name)){
                        has_video = true;
                    }
                }
                if (!has_video){
                    errors.push("В папке " + folder.getHtmlPath() + " у перевода нет видео: " + trnsl.name);
                }
            }
        }

        for (let episode of root.files) {
            var has_trnsl = false;
            for (let trnsl of folder.files) {
                if (trnsl.name.startsWith(episode.name)){
                    has_trnsl = true;
                }
            }
            if (!has_trnsl){
                warnings.push("В папке " + folder.getHtmlPath() + " нет перевода на эпизод " + episode.epNumber);
            }
        }
    }

    for (let folder of folders) {
        for (let i = 0; i < folder.files.length; i++) {
            for (let j = 0; j < i; j++) {
                if (folder.files[i].size == folder.files[j].size){
                    size_warnings.push("В папке " + folder.getHtmlPath() + " у эпизодов " +
                                       folder.files[j].epNumber + " и " +
                                       folder.files[i].epNumber + " одинаковый размер файлов.");
                }
            }
        }
    }

    update_ui_errors();
}

// shiki

function load_shiki(id){
    if (settings.parce_shiki){
        if (id){
            send_ajax_shiki(id);
        }else{
            $('#shiki_data').html("Идентификатор не найден, пробуем поиск...");
            $('#shiki_untrusted').show();
            var names = document.title.match(/.*?\[/)[0].slice(0, -1).split("/");
            var romadji = names[1].trim();
            var graphqlQuery = "{ \"query\": \"  { animes(search: \\\"" + romadji + "\\\", limit: 20, censored: false) { id  malId name airedOn { year } kind } } \"}";
            get_ajax("https://shikimori.one/api/graphql", 'POST', 'application/json', graphqlQuery, search_handler);
        }
    }else{
        update_ui_shiki();
    }
}
function search_handler() {
    if (this.status >= 400) {
        console.error('Returned ' + this.status + ': ' + this.responseText);
        return
    }

    try{
        var animes = JSON.parse(this.responseText).data.animes;
        let tags = document.title.match(/\[.*?\]/g);

        let lastTag = tags[tags.length-1];
        if (lastTag == "[HD]"){
            var year = tags[tags.length-3].slice(1, -1).split(",")[0];
        }else if (lastTag == "[720p]" || lastTag == "[960p]" || lastTag == "[1080p]" || lastTag == "[2160p]" || lastTag == "[HWP]"){
            year = tags[tags.length-2].slice(1, -1).split(",")[0];
        }else{
            year = tags[tags.length-1].slice(1, -1).split(",")[0];
        }

        let type = tags[0].slice(1, -1).toLowerCase();
        if(type.includes("+")){
            type = type.split("+")[0];
        }

        for(let an of animes){
            if (an.kind == type && an.airedOn.year == year){
                load_shiki(an.id)
                return;
            }
        }
    } catch (e) {
        console.error("Search processing error:", e);
    }
}
function send_ajax_shiki(id){
    // https://shikimori.one/api/doc/graphql

    var graphqlQuery = "{ \"query\": \"{ animes(ids: \\\"" + id + "\\\", limit: 1, censored: false) { " +
        "id malId airedOn { year } rating score kind episodes episodesAired duration status " +
        "licenseNameRu name russian japanese english synonyms " +
        "genres { russian kind } " +
        "studios { name } " +
        "personRoles {roles: rolesRu rolesEn person { name russian } } " +
        "externalLinks { kind url } " +
        "licensors fansubbers fandubbers " +
        "} }\"}";

    get_ajax("https://shikimori.one/api/graphql", 'POST', 'application/json', graphqlQuery, shiki_handler);
}
function shiki_handler() {
    if (this.status >= 400) {
        console.error('Returned ' + this.status + ': ' + this.responseText);
        return
    }

    var data = JSON.parse(this.responseText).data.animes[0];
    try{
        var anidb_titles = JSON.parse(GM_getValue("anidb_titles")) ?? null;
    }catch{
        anidb_titles = [];
    }

    anime = new Anime(data, anidb_titles);
    console.log(anime);
    update_ui_shiki();
    update_ui_mi();
}

// anidb

function import_titles(event) {

    console.log("file selected");
    const file = event.target.files[0];

    var reader = new FileReader();
    reader.readAsText(file, "UTF-8");
    reader.onload = function (evt) {
        var tmp_ob = parseXml(evt.target.result);

        var anidb_titles = [];
        for (let i = 0; i < tmp_ob.animetitles.anime.length; i++) {
            if (tmp_ob.animetitles.anime[i].title != null){
                if (Array.isArray(tmp_ob.animetitles.anime[i].title)){
                    anidb_titles[tmp_ob.animetitles.anime[i].aid] =
                        tmp_ob.animetitles.anime[i].title.filter(x => x["xml:lang"] == "ru" || x["xml:lang"] == "en" ||
                                                                 x["xml:lang"] == "x-jat" || x["xml:lang"] == "ja" ||
                                                                 x["xml:lang"] == "x-zht" || x["xml:lang"] == "zh-Hans" || x["xml:lang"] == "zh-Hant" ||
                                                                 x["xml:lang"] == "x-kot" || x["xml:lang"] == "ko");
                }
            }
        }

        GM_setValue("anidb_titles", JSON.stringify(anidb_titles));
        console.log("save completed");
        location.reload();
    }
    reader.onerror = function (evt) {
        console.error("error reading file");
    }
}

/// common ui code

function create_ui(){
    // https://api.jquery.com/jQuery/#jQuery2

    let box = $('<div>',
                {id: 'assist_box',
                 style: "position: fixed; bottom:10%; right: -5px; padding: 0px 10px 0px 15px; " +
                 "background-color: #dee3e7; border-radius: 5px; border: 1px solid #80808080;" +
                 "font-family: \"Lucida Console\", Consolas, monospace; font-size: 12px; line-height: 14px; " +
                 "transition: 0.6s ease;"
                }).appendTo(jQuery('body'));

    box.append([
        $('<div>', {style: "position: absolute; top:0px; left: 0px; width: 12px; height: 100%; border-right: 1px solid #80808080; cursor: pointer;", click: toggle}).append([
            $('<div>', {id: 'assist_box_arrow_right', style: "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: gray;", html: "⯈"}),
            $('<div>', {id: 'assist_box_arrow_left', style: "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: gray;", html: "⯇"})
        ]),
        $('<div>', {id: 'shiki_untrusted', style: "position: absolute; right: 11px; top: 7px; width: 20px; height: 20px;",
                    title: "Данные получены через поиск и могут быть ошибочными!",
                    html: "<?xml version=\"1.0\" encoding=\"utf-8\"?>"+
                    "<svg fill=\"#404040\" viewBox=\"0 0 20 20\" xmlns=\"http://www.w3.org/2000/svg\">"+
                    "<g><path d=\"M19.79,16.72,11.06,1.61A1.19,1.19,0,0,0,9,1.61L.2,16.81C-.27,17.64.12,19,1.05,19H19C19.92,19,20.26,17.55,19.79,16.72ZM11,17H9V15h2Zm0-4H9L8.76,5h2.45Z\"/></g></svg>"}),
        $('<div>', {id: 'shiki_data', style: "margin-top: 10px; margin-bottom: 10px;", html: "Данные загружаются..."}),
        $('<div>', {id: 'image_data', style: "padding-top: 10px; margin-bottom: 10px; border-top: 1px solid #80808080; color: red; font-weight: bold; display: none;", html: ""}),
        $('<div>', {id: 'errors_data', style: "padding-top: 10px; margin-bottom: 10px; border-top: 1px solid #80808080; max-height: 400px; overflow-y: auto;", html: "Данные загружаются..."}),
        $('<div>', {id: 'warnings_data', style: "padding-top: 10px; margin-bottom: 10px; border-top: 1px solid #80808080; max-height: 400px; overflow-y: auto;", html: "Данные загружаются..."}),
        $('<div>', {id: 'mi_data', style: "padding-top: 10px; margin-bottom: 10px; border-top: 1px solid #80808080;"}),
        $('<div>', {style: "position: absolute; right: 6px; bottom: 3px; width: 15px; height: 15px; cursor: pointer;",
                    html: "<?xml version=\"1.0\" standalone=\"no\"?><!DOCTYPE svg PUBLIC \"-//W3C//DTD SVG 20010904//EN\" \"http://www.w3.org/TR/2001/REC-SVG-20010904/DTD/svg10.dtd\">"+
                    "<svg version=\"1.0\" xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 1280.000000 1280.000000\" preserveAspectRatio=\"xMidYMid meet\">"+
                    "<g transform=\"translate(0.000000,1280.000000) scale(0.100000,-0.100000)\" fill=\"#808080\" stroke=\"none\">"+
                    "<path d=\"M5309 12413 c-6 -16 -109 -302 -229 -638 -773 -2158 -675 -1895 -705 -1895 -21 0 -563 97 -2080 374 -520 95 -571 102 -583 87 -11 -14 -1031 -1782 -1060 -1837 "+
                    "-12 -23 -26 -6 1611 -1942 105 -124 128 -157 121 -172 -5 -10 -191 -233 -414 -497 -1374 -1625 -1331 -1573 -1319 -1594 6 -12 241 -420 521 -907 281 -488 518 -900 527 "+
                    "-915 15 -27 19 -28 66 -22 28 3 592 105 1255 225 1329 241 1374 249 1378 245 1 -1 147 -405 323 -896 176 -492 382 -1067 458 -1279 l139 -385 1080 -3 1081 -2 21 57 c21 "+
                    "57 142 393 480 1338 93 259 221 616 285 795 65 179 122 337 127 352 8 22 14 26 36 22 258 -46 1610 -291 2043 -369 317 -58 585 -105 595 -105 15 0 138 206 524 877 278 "+
                    "482 520 902 538 934 l32 58 -662 783 c-364 431 -754 892 -867 1026 -113 134 -210 252 -215 262 -7 16 5 35 61 102 1506 1778 1682 1990 1671 2012 -6 11 -190 332 -408 711 "+
                    "-723 1254 -655 1140 -681 1137 -26 -4 -776 -139 -1894 -342 -396 -72 -731 -129 -744 -128 -23 3 -45 60 -338 878 -172 481 -378 1055 -457 1275 l-144 400 -1081 3 -1081 2 -11 "+
                    "-27z m1261 -4064 c606 -56 1140 -380 1474 -896 487 -753 381 -1776 -250 -2418 -310 -314 -684 -505 -1119 -570 -144 -21 -405 -21 -550 0 -417 61 -800 251 -1095 545 -167 166 "+
                    "-280 326 -385 543 -143 295 -204 586 -192 917 15 386 124 721 338 1035 396 581 1086 908 1779 844z\"/></g></svg>",
                    click: function( event ) { $('#assist_box_settings').animate({ height: 'toggle' }); }}),
        $('<div>', {id: 'assist_box_settings', style: "bottom:0px; left: 0px; width: 100%; border-top: 1px solid #80808080; display: none;"}).append([
            $('<div>', {style: "margin-top: 10px; margin-bottom: 10px;"}).append([
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px;', click: update_settings, id: 'input_parce_shiki' }),
                $( '<label>', { html: 'Запрашивать информацию из API Shikimori (требует дополнительный запрос к API)', style: 'margin-left: 2px;', for: 'input_parce_shiki' }),
                $('<br>'),
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px;', click: update_settings, id: 'input_show_shiki_synonyms' }),
                $( '<label>', { html: 'Отображать синонимы с Shikimori', style: 'margin-left: 2px;', for: 'input_show_shiki_synonyms' }),
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px; margin-left: 20px;', click: update_settings, id: 'input_show_anydb_synonyms' }),
                $( '<label>', { html: 'Отображать синонимы с AniDB', style: 'margin-left: 2px;', for: 'input_show_anydb_synonyms' }),
                $('<br>'),
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px;', click: update_settings, id: 'input_parce_files' }),
                $( '<label>', { html: 'Анализировать файлы в раздаче (требует дополнительный запрос к трекеру)', style: 'margin-left: 2px;',  for: 'input_parce_files' }),
                $('<br>'),
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px;', click: update_settings, id: 'input_parce_files_on_completed' }),
                $( '<label>', { html: 'Анализировать файлы в проверенных раздачах', style: 'margin-left: 2px;', for: 'input_parce_files_on_completed' }),
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px; margin-left: 20px;', click: update_settings, id: 'input_show_same_size_files' }),
                $( '<label>', { html: 'Сравнивать размер файлов', style: 'margin-left: 2px;', for: 'input_show_same_size_files' }),
            ])
        ])
    ]);

    update_ui_state();
}
function toggle() {
    settings.display = !settings.display;
    settings.save();
    update_ui_state();
}
function update_settings(){
    settings.parce_shiki = $('#input_parce_shiki').is(":checked");
    settings.show_shiki_synonyms = $('#input_show_shiki_synonyms').is(":checked");
    $("#input_show_shiki_synonyms").prop( "disabled", !settings.parce_shiki );
    settings.show_anydb_synonyms = $('#input_show_anydb_synonyms').is(":checked");
    $("#input_show_anydb_synonyms").prop( "disabled", !settings.parce_shiki );

    settings.parce_files = $('#input_parce_files').is(":checked");
    settings.show_same_size_files = $('#input_show_same_size_files').is(":checked");
    $("#input_show_same_size_files").prop( "disabled", !settings.parce_files );
    settings.parce_files_on_completed = $('#input_parce_files_on_completed').is(":checked");
    $("#input_parce_files_on_completed").prop( "disabled", !settings.parce_files );

    settings.save();
    update_ui_errors();
    update_ui_shiki();
}
function update_ui_state() {
    if(settings.display){
        $('#assist_box')[0].style.transform = "translate(0, 0)";
    }else{
        $('#assist_box')[0].style.transform = "translate(calc(100% - 20px), 0)";
    }

    $('#assist_box_arrow_right')[0].style.display = settings.display ? "block" : "none";
    $('#assist_box_arrow_left')[0].style.display = settings.display ? "none" : "block";

    $("#input_parce_shiki").prop( "checked", settings.parce_shiki );
    $("#input_show_shiki_synonyms").prop( "checked", settings.show_shiki_synonyms );
    $("#input_show_shiki_synonyms").prop( "disabled", !settings.parce_shiki );
    $("#input_show_anydb_synonyms").prop( "checked", settings.show_anydb_synonyms );
    $("#input_show_anydb_synonyms").prop( "disabled", !settings.parce_shiki );

    $("#input_parce_files").prop( "checked", settings.parce_files );
    $("#input_show_same_size_files").prop( "checked", settings.show_same_size_files );
    $("#input_show_same_size_files").prop( "disabled", !settings.parce_files );
    $("#input_parce_files_on_completed").prop( "checked", settings.parce_files_on_completed );
    $("#input_parce_files_on_completed").prop( "disabled", !settings.parce_files );
}
function update_ui_errors(){
    var is_completed = check_torrent_status();
    if (settings.parce_files && (settings.parce_files_on_completed || !is_completed)){
        if (errors.length > 0){
            $('#errors_data').show();
            $('#errors_data').css("color", "red");
            $('#errors_data').css("font-weight", "bold");
            $('#errors_data').html(errors.join("<\/br>"));
        }else{
            $('#errors_data').hide();
        }

        if ((warnings.length > 0) || (size_warnings.length > 0 && settings.show_same_size_files)){
            $('#warnings_data').show();
            $('#warnings_data').css("color", "#FF7900");
            $('#warnings_data').css("font-weight", "bold");
            if (settings.show_same_size_files){
                $('#warnings_data').html([...warnings, ...size_warnings].join("<\/br>"));
            }else{
                $('#warnings_data').html(warnings.join("<\/br>"));
            }
        }else{
            $('#warnings_data').hide();
        }
    }else{
        $('#errors_data').hide();
        $('#warnings_data').hide();
    }
}
function update_ui_shiki(){
    if (settings.parce_shiki){
        var text = anime.toString();

        if (anime.error){
            text += "<\/br><\/br><span style=\"color:red;font-weight:bold;\">" + anime.error + "</span><\/br>"+
                "<a href=\"http://anidb.net/api/anime-titles.xml.gz\" target=\"_blank\">http://anidb.net/api/anime-titles.xml.gz</a><\/br>" +
                "<form id=\"import_titles_form\" onsubmit=\"event.preventDefault();\"><input type=\"file\" id=\"import_title\" accept=\".xml\" ></form>";
        }

        $('#shiki_data').html(text);
        $('#import_title').on('change', import_titles);
        $('#shiki_data').show();
    }else{
        $('#shiki_data').hide();
    }
}
function update_ui_mi(){
    media_info.recalculate_language_errors(anime.country);
    $('#mi_data').html(media_info.toString());
}

// core web & data

function get_ajax(url, type, content_type, args, event_handler) {
    var handler_wrapper = function() {
        if(this.readyState == XMLHttpRequest.DONE && this.status == 200) {
            event_handler.call(this);
        }
    }
    var req = new XMLHttpRequest();
    req.onreadystatechange = handler_wrapper;
    req.open(type, url, true);
    req.setRequestHeader('content-type', content_type);
    req.send(args);
}

function htmlListToObj(element) {
    var o = {};
    o.name = element.firstElementChild.innerHTML.replace("<b>", "").replace("<\/b><s><\/s>","").replace(/<i>\d*?<\/i>/,"");
    o.type = element.className;

    if (o.type != "dir"){
        o.size = element.firstElementChild.innerHTML.replace(/.*?<\/b><s><\/s><i>/, "").replace(/<\/i>/,"");
        o.type = o.name.match(/\w+$/)[0];
        o.name = o.name.replace("."+o.type, "");
    }else{
        o.size = null;
        o.nodes = [];
        [].slice.call(element.children).filter(function(e) {
            return e.tagName.toLowerCase() === 'ul';
        }).forEach(function(ul) {
            [].slice.call(ul.children).forEach(function(li) {
                o.nodes.push(htmlListToObj(li));
            });
        });
    }

    return o;
}

// https://stackoverflow.com/a/19448718
function parseXml(xml, arrayTags) {
    let dom = null;
    if (window.DOMParser) dom = (new DOMParser()).parseFromString(xml, "text/xml");
    else if (window.ActiveXObject) {
        dom = new ActiveXObject('Microsoft.XMLDOM');
        dom.async = false;
        if (!dom.loadXML(xml)) throw dom.parseError.reason + " " + dom.parseError.srcText;
    }
    else throw new Error("cannot parse xml string!");

    function parseNode(xmlNode, result) {
        if (xmlNode.nodeName == "#text") {
            let v = xmlNode.nodeValue;
            if (v.trim()) result['#text'] = v;
            return;
        }

        let jsonNode = {},
            existing = result[xmlNode.nodeName];
        if (existing) {
            if (!Array.isArray(existing)) result[xmlNode.nodeName] = [existing, jsonNode];
            else result[xmlNode.nodeName].push(jsonNode);
        }
        else {
            if (arrayTags && arrayTags.indexOf(xmlNode.nodeName) != -1) result[xmlNode.nodeName] = [jsonNode];
            else result[xmlNode.nodeName] = jsonNode;
        }

        if (xmlNode.attributes) for (let attribute of xmlNode.attributes) jsonNode[attribute.nodeName] = attribute.nodeValue;

        for (let node of xmlNode.childNodes) parseNode(node, jsonNode);
    }

    let result = {};
    for (let node of dom.childNodes) parseNode(node, result);

    return result;
}

