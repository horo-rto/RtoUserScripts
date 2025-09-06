// ==UserScript==
// @name         RTO Release Assistant
// @namespace    http://tampermonkey.net/
// @version      0.4.0
// @description  It was just a MediaInfo analyser!
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

var errors = [];
var warnings = [];

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

    $("#input_parce_shiki").prop( "disabled", true );
    $("#input_show_shiki_synonyms").prop( "disabled", true );
    $("#input_show_anydb_synonyms").prop( "disabled", true );
    $("#input_parce_files_on_completed").prop( "disabled", true );

    $("#input_parce_shiki").prop( "checked", false );
    $("#input_show_shiki_synonyms").prop( "checked", false );
    $("#input_show_anydb_synonyms").prop( "checked", false );
    $("#input_parce_files_on_completed").prop( "checked", false );

    process_mi();
    init_files_processing();
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

// files processing

function init_files_processing(){
    try{
        if (settings.parce_files){
            var topic_id = window.location.href.match(/\d+/)[0];
            get_ajax("https://rutracker.org/forum/viewtorrent.php", 'POST',
                     'application/x-www-form-urlencoded; charset=UTF-8', "t="+topic_id, files_processing);
        }else{
            update_errors();
        }
    } catch (e) {
        console.error("Files processing error:", e);
    }
}
function files_processing(){
    if (this.status >= 400) {
        console.log('Returned ' + this.status + ': ' + this.responseText);
        return
    }

    var filelist = this.responseText;
    var lines = filelist.match(/<b>.*?<\/b>/gm);
    lines = Array.from(lines, (x) => x.replace("<b>", "").replace("<\/b>", ""));

    var video_files = Array.from(lines.filter(x => x.includes(".mkv") || x.includes(".mp4") || x.includes(".avi")), x => x.replace(".mkv", "").replace(".mp4", "").replace(".avi", ""));
    var sound_files = lines.filter(x => x.includes(".mka"));
    var subtl_files = lines.filter(x => x.includes(".ass") || x.includes(".srt"));

    var parser = new DOMParser();
    var doc = parser.parseFromString(this.responseText, "text/html");
    var treeObj = htmlListToObj(doc.getElementsByClassName("ftree")[0].firstElementChild);
    var rootFiles = Array.from(treeObj.nodes.filter((x) => x.type != "dir"), x => x.name.replace(".mkv", "").replace(".mp4", "").replace(".avi", ""));

    var indexStart = 0;
    var indexEnd = 0;

    if (rootFiles.length > 1) {
        var is_same = true;
        for (let i = 0; i < rootFiles[0].length; i++){
            if (rootFiles[0].charAt(i) == rootFiles[1].charAt(i)){
                if (is_same){
                    indexStart = i;
                }else{
                    if (indexEnd == 0){
                        indexEnd = i;
                    }
                }
            }else{
                is_same = false;
            }
        }
    }

    for (let trnsl of [...sound_files, ...subtl_files]) {
        let met = false;
        for (let vid of video_files) {
            if (trnsl.startsWith(vid)){
                met = true;
            }
        }
        if (met == false){
            errors.push("У перевода нет видео: " + trnsl);
        }
    }

    for (let rt of rootFiles) {
        if(rt.match(/[^A-Za-zА-Яа-я0-9 !#$%&'(),;=@^_~\-\[\]\+\.]/gm) != null) {
            errors.push("Запрещенные символы: " + rt);
        }
    }

    if (sound_files.length > 0 || subtl_files.length > 0) {
        for (let rt of rootFiles) {
            if(!sound_files.join("|||").replace("&#039;", "'").includes(rt.replace("&amp;", "&")) &&
               !subtl_files.join("|||").replace("&#039;", "'").includes(rt.replace("&amp;", "&"))) {
                //console.log(subtl_files);
                //console.log(rt);
                errors.push("Нет перевода на эпизод " + (indexStart < indexEnd ? rt.slice(indexStart, indexEnd) : rt));
            }
        }
    }

    var folders = [];
    recurcive_folder(treeObj);
    function recurcive_folder(parent){
        for (var folder of Array.from(parent.nodes.filter(x => x.type == "dir"))) {
            if (folder.nodes.filter(x => x.type != "dir").length > 0){
                if (folder.nodes.filter(x => x.name.endsWith(".mka") || x.name.endsWith(".ass") || x.name.endsWith(".srt")).length > 0){
                    folders.push(folder);
                }
            }
            recurcive_folder(folder);
        }
    }

    console.log(folders);

    for (let folder of folders) {
        if (folder.name.includes("Extra")){
            continue;
        }

        var files_in_folder = folder.nodes.filter(x => x.type != "dir");
        for (let vid of rootFiles) {
            var has_trnsl = false;
            for (let trnsl of files_in_folder) {
                if (trnsl.name.startsWith(vid)){
                    has_trnsl = true;
                }
            }
            if (has_trnsl == false){
                warnings.push("В папке " + folder.name + " нет перевода на эпизод " + (indexStart < indexEnd ? vid.slice(indexStart, indexEnd) : vid));
            }
        }

        for (let i = 0; i < files_in_folder.length; i++) {
            for (let j = 0; j < i; j++) {
                if (files_in_folder[i].size == files_in_folder[j].size){
                warnings.push("В папке " + folder.name + " у эпизодов " +
                              (indexStart < indexEnd ? files_in_folder[j].name.slice(indexStart, indexEnd) : files_in_folder[j].name) + " и " +
                              (indexStart < indexEnd ? files_in_folder[i].name.slice(indexStart, indexEnd) : files_in_folder[i].name) + " одинаковый размер файлов.");
                }
            }
        }
    }

    update_errors();
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
        $('<div>', {id: 'shiki_data', style: "margin-top: 10px; margin-bottom: 10px;", html: "Данные [не] загружаются..."}),
        $('<div>', {id: 'errors_data', style: "padding-top: 10px; margin-bottom: 10px; border-top: 1px solid #80808080;", html: "Данные загружаются..."}),
        $('<div>', {id: 'warnings_data', style: "padding-top: 10px; margin-bottom: 10px; border-top: 1px solid #80808080;", html: "Данные загружаются..."}),
        $('<div>', {id: 'mi_data', style: "padding-top: 10px; margin-bottom: 10px;  border-top: 1px solid #80808080;"}),
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
                $( '<label>', { html: 'Запрашивать информацию из API Shikimori (требует дополнительный запрос к API)', style: 'margin-left: 2px;',  for: 'input_parce_shiki' }),
                $('<br>'),
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px;', click: update_settings, id: 'input_show_shiki_synonyms' }),
                $( '<label>', { html: 'Отображать синонимы с Shikimori', style: 'margin-left: 2px;',  for: 'input_show_shiki_synonyms' }),
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px; margin-left: 20px;', click: update_settings, id: 'input_show_anydb_synonyms' }),
                $( '<label>', { html: 'Отображать синонимы с AniDB', style: 'margin-left: 2px;',  for: 'input_show_anydb_synonyms' }),
                $('<br>'),
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px;', click: update_settings, id: 'input_parce_files' }),
                $( '<label>', { html: 'Анализировать файлы в раздаче (требует дополнительный запрос к трекеру)', style: 'margin-left: 2px;',  for: 'input_parce_files' }),
                $('<br>'),
                $( '<input>', { type: 'checkbox', style: 'margin-top: -1px;', click: update_settings, id: 'input_parce_files_on_completed' }),
                $( '<label>', { html: 'Анализировать файлы в проверенных раздачах', style: 'margin-left: 2px;',  for: 'input_parce_files_on_completed' }),
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
    $("#input_show_anydb_synonyms").prop( "checked", settings.show_anydb_synonyms );
    $("#input_parce_files").prop( "checked", settings.parce_files );
    $("#input_parce_files_on_completed").prop( "checked", settings.parce_files_on_completed );
    $("#input_parce_files_on_completed").prop( "disabled", !settings.parce_files );
}
function update_settings(){
    settings.parce_shiki = $('#input_parce_shiki').is(":checked");
    settings.show_shiki_synonyms = $('#input_show_shiki_synonyms').is(":checked");
    settings.show_anydb_synonyms = $('#input_show_anydb_synonyms').is(":checked");
    settings.parce_files = $('#input_parce_files').is(":checked");
    settings.parce_files_on_completed = $('#input_parce_files_on_completed').is(":checked");
    //$("#input_parce_files_on_completed").prop( "disabled", !settings.parce_files );
    settings.save();
}
function update_errors(){
    if (errors.length > 0){
        $('#errors_data').show();
        $('#errors_data').css("color", "red");
        $('#errors_data').css("font-weight", "bold");
        $('#errors_data').html(errors.join("<\/br>"));
    }else{
        $('#errors_data').hide();
    }

    if (warnings.length > 0){
        $('#warnings_data').show();
        $('#warnings_data').css("color", "darkorange");
        $('#warnings_data').css("font-weight", "bold");
        $('#warnings_data').html(warnings.join("<\/br>"));
    }else{
        $('#warnings_data').hide();
    }
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
    o.size = element.firstElementChild.innerHTML.replace(/.*?<\/b><s><\/s><i>/, "").replace(/<\/i>/,"");
    o.type = element.className;
    o.nodes = [];
    [].slice.call(element.children).filter(function(e) {
        return e.tagName.toLowerCase() === 'ul';
    }).forEach(function(ul) {
        [].slice.call(ul.children).forEach(function(li) {
           o.nodes.push(htmlListToObj(li));
        });
    });
    return o;
}

