// ==UserScript==
// @name         RTO MediaInfo analyser
// @namespace    http://tampermonkey.net/
// @version      0.2.13
// @description  MediaInfo analyser!
// @author       Horo
// @updateURL    https://raw.githubusercontent.com/horo-rto/RtoUserscripts/refs/heads/main/MediaInfoAnalyser.user.js
// @match        https://rutracker.org/forum/viewtopic.php?t=*
// @match        https://rutracker.net/forum/viewtopic.php?t=*
// @match        https://rutracker.nl/forum/viewtopic.php?t=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=rutracker.org
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

var post;
var video_size;
var video_bitrate;
var is_displayed;
var isRussian = true;
var isJapanese = false;

class General {
    constructor() { }

    size = -1;
    bitrate = -1;

    toString() {
        return "&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Overall bit rate: " + this.bitrate;
    }
}
class Video {
    constructor() { }

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
            if (this.percentage < 50)
                line += "<span style=\"color: red; font-weight: bold;\">[" + this.percentage + "%]</span>";
            else
                line += "[" + this.percentage + "%]";
        }

        line += " " + this.codec + "@" + this.bit + "bit";

        if (this.crf >= 22)
            line += " <span style=\"color: red; font-weight: bold;\">crf=" + Number(this.crf).toFixed(1) + "</span>";

        line += ", "+ this.width + "x" + this.height + " " + this.fps + "fps ";

        if (this.vfr == 1) line += "(VFR) ";

        if (this.bitrate == -1)
            line += "<span style=\"color: #ee7600; font-weight: bold;\">???kbps</span> ";
        else
            line += this.bitrate + " ";

        if (this.hdr != "") line += "<br>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;" + this.hdr;
        return line;
    }
}
class Audio {
    constructor() { }

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

    toString() {
        var line = "";
        if (this.default == 1 && this.isfirst != 1){
            line += (this.default == 1 ? "<span style=\"color: red; font-weight: bold;\">[x]</span>" : "[ ]" );
        }else{
            line += (this.default == 1 ? "[x]" : "[ ]" );
        }
        line += (this.forced == 1 ? "<span style=\"color: red; font-weight: bold;\">[x]</span>" : "[ ]" );

        if (video_size < this.size*3)
            var sizeError = true;

        if (this.percentage < 0){
            line += "<span style=\"color: #ee7600; font-weight: bold;\">[xx%]</span>";
        }else{
            if (sizeError){
                if (this.percentage < 10)
                    line += "<span style=\"color: red; font-weight: bold;\">[0" + this.percentage + "%]</span> ";
                else
                    line += "<span style=\"color: red; font-weight: bold;\">[" + this.percentage + "%]</span> ";
            }else{
                if (this.percentage < 10)
                    line += "[0" + this.percentage + "%] ";
                else
                    line += "[" + this.percentage + "%] ";
            }
        }

        line += " " + this.codec;

        if (this.lfe == 1)
            line += " " + (this.channels - 1) + ".1, ";
        else
            line += " " + this.channels + ".0, ";

        if (this.bitrate == -1){
            line += "<span style=\"color: #ee7600; font-weight: bold;\">???kbps</span> ";
        }else{
            if (sizeError)
                line += "<span style=\"color: red; font-weight: bold;\">" + this.bitrate + "</span> ";
            else
                line += this.bitrate + " ";
        }

        line += this.samplingrate + "kHz, ";

        if (this.delay != "")
            line += "<span style=\"color: red; font-weight: bold;\">" + this.delay + "</span> ";

        if (this.languageError == 1)
            line += "<span style=\"color: red; font-weight: bold;\">" + this.language + "</span>";
        else
            line += this.language;

        if (this.title != "")
            line += ", " +this.title;
        return line;
    }
}
class Text {
    constructor() { }

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

        if (this.languageError == 1)
            line += "<span style=\"color: red; font-weight: bold;\">" + this.language + "</span>";
        else
            line += this.language;

        if (this.title != "")
            line += ", " +this.title;
        return line;
    }
}

(function() {
    console.log("RTO mediainfo analyser")

    if(window.location.href.match(/start=\d+/) != null) return;

    is_displayed = GM_getValue("mi_box_displayed") ?? true;

    post = $('#topic_main > tbody > tr > .td2 > .post_wrap > .post_body')[0];

    var spoiler = "";
    var a = post.innerHTML.match(/<div class="sp-wrap">.*?<div class="sp-body">.*?<\/div>\n<\/div>/gms);
    for (const element of a)
        if (element.includes("Frame rate") || element.includes("Частота кадров"))
            spoiler = element;

    var reports;
    if(spoiler.includes("Общее")){
        reports = spoiler.split("Общее<br>");
    }else{
        reports = spoiler.split("General<br>");
    }
    var main = reports[reports.length > 1 ? 1 : 0];

    var genrl = null;
    var video = null;
    var audio = [];
    var subtl = [];
    var extra = [];

    var chunks = main.split("<span class=\"post-br\"><br></span>");

    console.log(chunks);

    for (const chunk of chunks) {
        if (chunk.includes("File size") || chunk.includes("Размер файла")){
            genrl = parce_general(chunk);
        } else if (chunk.includes("Text") || chunk.includes("Текст")){
            subtl.push(parce_text(chunk));
        } else if (chunk.includes("Audio") || chunk.includes("Аудио")){
            audio.push(parce_audio(chunk));
        } else if (chunk.includes("Video") || chunk.includes("Видео")){
            video = parce_video(chunk);
        }
    }

    if (reports.length > 2){
        isRussian = true;
        for (var i = 2; i < reports.length; i++){
            var chunks_extra = reports[i].split("<span class=\"post-br\"><br></span>");
            for (const chunk_extra of chunks_extra) {
                if (chunk_extra.includes("Audio") || chunk_extra.includes("Аудио")){
                    extra.push(parce_audio(chunk_extra));
                }
            }
        }
    }

    var union = [ genrl ].concat([video], audio, subtl, extra);
    console.log(union);

    ui(genrl, video, audio, subtl, extra);
})();

function ui(genrl, video, audio, subtl, extra){
    var box = $('<div>', {id: 'mi_box', style:
                          "position: fixed; bottom:20%; right: -5px; padding: 10px 10px 10px 15px; " +
                          "background-color: #dee3e7; border-radius: 5px; border: 1px solid #80808080;" +
                          "font-family: \"Lucida Console\", Consolas, monospace; font-size: 12px; line-height: 14px;"});
    $('body').append(box);
    var slider = $('<div>', {id: 'mi_box_slider', style:
                          "position: absolute; top:0px; left: 0px; width: 12px; height: 100%;" +
                          " border-right: 1px solid #80808080; cursor: pointer;"});
    $('#mi_box').append(slider);
    var arrow_right = $('<div>', {id: 'mi_box_arrow_right', style: "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: gray;"});
    var arrow_left = $('<div>', {id: 'mi_box_arrow_left', style: "position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: gray;"});
    $('#mi_box_slider').append(arrow_right);
    $('#mi_box_slider').append(arrow_left);
    $('#mi_box_slider')[0].addEventListener ("click", toggle , false);
    $('#mi_box_arrow_right').append("⯈");
    $('#mi_box_arrow_left').append("⯇");

    $('#mi_box_arrow_right')[0].style.display = is_displayed ? "block" : "none";
    $('#mi_box_arrow_left')[0].style.display = is_displayed ? "none" : "block";
    if (!is_displayed) $('#mi_box')[0].style.transform = "translate(calc(100% - 20px), 0)";

    var text = "";
    if (video.bitrate == -1) text = genrl != null ? (genrl.toString() + "<hr>") : "";
    text += video.toString() + "<hr>";
    audio.forEach((stream) => text += stream.toString() + "<br>");
    if (subtl.length > 0){
        text += "<hr>";
        subtl.forEach((stream) => text += stream.toString() + "<br>");
    }
    if (extra.length > 0){
        text += "<hr><hr>";
        extra.forEach((stream) => text += stream.toString() + "<br>");
    }

    $('#mi_box').append(text);
}
function toggle() {
    is_displayed = !is_displayed;
    GM_setValue("mi_box_displayed", is_displayed);

    if(is_displayed)
        $('#mi_box')[0].style.transform = "translate(0, 0)";
    else
        $('#mi_box')[0].style.transform = "translate(calc(100% - 20px), 0)";

    $('#mi_box_arrow_right')[0].style.display = is_displayed ? "block" : "none";
    $('#mi_box_arrow_left')[0].style.display = is_displayed ? "none" : "block";
}

function parce_general(chunk){
    var parced = new General();

    var lines = chunk.replaceAll('&nbsp;', ' ').replaceAll('\n', '').split("<br>");
    for (const line of lines) {
        if (line.includes("File size") || line.includes("Размер файла")){
            parced.size = line.split(" : ")[1];
        }else if (line.includes("Overall bit rate") || line.includes("Общий битрейт")){
            parced.bitrate = line.split(" : ")[1].replaceAll(/ /g, '').replaceAll("Кбит/сек","kbps").replaceAll("kb/s","kbps").replaceAll("Мбит/сек","Mbps").replaceAll("Mb/s","Mbps");
        }
    }
    return parced;
}
function parce_video(chunk){
    var parced = new Video();

    var lines = chunk.replaceAll('&nbsp;', ' ').replaceAll('\n', '').split("<br>");
    for (const line of lines) {
        if ((line.startsWith("Format ") && !line.includes("Format profile") && !line.includes("Format settings")) || line.startsWith("Формат ")){
            switch(line.split(" : ")[1]){
                case "MPEG-4 Visual":
                    parced.codec = "XviD";
                    break;
                case "HEVC":
                    parced.codec = "HEVC";
                    var crf = chunk.match(/crf=[\d\.]*/gm);
                    if (crf != null)
                        parced.crf = crf[0].split("=")[1];

                    break;
                default:
                    parced.codec = line.split(" : ")[1];
                    break;
            }
        }else if (line.includes("HDR")){
            parced.hdr = line.split(" : ")[1];
        }else if (line.includes("Height") || line.includes("Высота")){
            parced.height = line.split(" : ")[1].replaceAll(/\D/g, '');
        }else if (line.includes("Width") || line.includes("Ширина")){
            parced.width = line.split(" : ")[1].replaceAll(/\D/g, '');
        }else if (line.includes("Frame rate mode") || line.includes("Режим частоты кадров")){
            if (line.includes("Variable") || line.includes("Переменный"))
                parced.vfr = 1;
        }else if (line.includes("Frame rate") || (line.includes("Частота кадров") && !line.includes("Частота кадров в оригинале"))){
            parced.fps = line.split(" : ")[1].split(" ")[0].replace(",", ".");
        }else if (line.includes("Bit rate") || line.includes("Битрейт")){
            parced.bitrate = line.split(" : ")[1].toLowerCase().replaceAll(/ /g, '')
                .replaceAll("кбит/сек","kbps").replaceAll("кбит/с","kbps").replaceAll("кбит/c","kbps").replaceAll("kb/s","kbps")
                .replaceAll("мбит/сек","Mbps").replaceAll("мбит/с","kbps").replaceAll("мбит/c","kbps").replaceAll("mb/s","Mbps");
            video_bitrate = parced.bitrate;
        }else if (line.includes("Bit depth") || line.includes("Битовая глубина")){
            parced.bit = line.split(" : ")[1].replaceAll(/\D/g, '');
        }else if (line.includes("Stream size") || line.includes("Размер потока")){
            var newline = line.split(" : ")[1].split("(");
            var size = newline[0].replaceAll(/[a-zA-Zа-яА-Я ]/g, '');
            var value = newline[0].replaceAll(/[0-9,\. ]/g, '');
            if (value == "Гбайт" || value == "Гигабайт" || value == "GiB" )
                parced.size = size.replace(",", ".")*1024;
            else
                parced.size = size;
            parced.percentage = newline[1].slice(0,-2);
            video_size = parced.size;
        }else if (line.includes("Language") || line.includes("Язык")){
            parced.language = line.split(" : ")[1];
        }else if (line.includes("Default") || line.includes("По умолчанию")){
            if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes")
                parced.default = 1;
            else
                parced.default = 0;
        }else if (line.includes("Forced") || line.includes("Принудительно")){
            if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes")
                parced.forced = 1;
            else
                parced.forced = 0;
        }
    }
    return parced;
}
function parce_audio(chunk){
    var parced = new Audio();

    var lines = chunk.replaceAll('&nbsp;', ' ').replaceAll('\n', '').split("<br>");
    for (const line of lines) {
        if (line == "Audio #1" || line == "Аудио #1" || line == "Audio" || line == "Аудио"){
            parced.isfirst = 1;
        }else if (line.startsWith("Title") || line.startsWith("Заголовок")){
            parced.title = line.split(" : ")[1];
        }else if ((line.startsWith("Format ") &&
                  !line.startsWith("Format version") &&
                  !line.startsWith("Format profile") &&
                  !line.startsWith("Format settings"))
                  || line.startsWith("Формат ")){
            switch(line.split(" : ")[1]){
                case "MPEG Audio":
                    parced.codec = "MP";
                    break;
                case "AC-3":
                    parced.codec = "AC3";
                    break;
                case "E-AC-3":
                    parced.codec = "EAC3";
                    break;
                case "AAC LC":
                    parced.codec = "AAC";
                    break;
                case "MLP FBA":
                    parced.codec = "TrueHD";
                    break;
                case "DTS XLL":
                    parced.codec = "DHS-HD MA";
                    break;
                default:
                    parced.codec = line.split(" : ")[1];
                    break;
            }
        }else if (line.includes("Format profile") || line.includes("Профиль формата")){
            if (line.split(" : ")[1].startsWith("Layer "))
                parced.codec += line.split(" : ")[1].replace("Layer ", "");
            else
                parced.codec += " " + line.split(" : ")[1];
        }else if (line.includes("Channel(s)") || line.includes("Канал(-ы)") || line.includes("Каналы")){
            parced.channels = line.split(" : ")[1].split(" ")[0];
        }else if (line.includes("Channel layout") || line.includes("Channel positions") || line.includes("Расположение каналов")){
            if (line.includes("LFE")) parced.lfe = 1;
        }else if (line.includes("Bit rate") || line.includes("Битрейт")){
            parced.bitrate = line.split(" : ")[1].toLowerCase().replaceAll(/ /g, '')
                .replaceAll("кбит/сек","kbps").replaceAll("кбит/с","kbps").replaceAll("кбит/c","kbps").replaceAll("kb/s","kbps")
                .replaceAll("мбит/сек","Mbps").replaceAll("мбит/с","kbps").replaceAll("мбит/c","kbps").replaceAll("mb/s","Mbps");
        }else if (line.includes("Sampling rate") || line.includes("Частота дискретизации") || (line.includes("Частота") && !line.includes("Частота кадров"))){
            parced.samplingrate = line.split(" : ")[1].split(" ")[0].replace(",", ".");
        }else if (line.includes("Stream size") || line.includes("Размер потока")){
            var newline = line.split(" : ")[1].split("(");
            var size = newline[0].replaceAll(/[a-zA-Zа-яА-Я ]/g, '');
            var value = newline[0].replaceAll(/[0-9,\. ]/g, '');
            if (value == "Гбайт" || value == "Гигабайт" || value == "GiB" )
                parced.size = size.replace(",", ".")*1024;
            else
                parced.size = size;
            parced.percentage = newline[1].slice(0,-2);
        }else if (line.includes("Delay relative to video") || line.includes("Задержка видео")){
            parced.delay = line.split(" : ")[1];
        }else if (line.includes("Language") || line.includes("Язык")){
            parced.language = line.split(" : ")[1];

            switch (parced.language)
            {
                case "Русский":
                case "Russian":
                    if (!isRussian)
                        parced.languageError = 1;
                    break;
                case "Японский":
                case "Japanese":
                    isRussian = false;
                    isJapanese = true;
                    break;
                default:
                    isRussian = false;
                    if (isJapanese)
                        parced.languageError = 1;
                    break;
            }
        }else if (line.includes("Default") || line.includes("По умолчанию")){
            if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes")
                parced.default = 1;
            else
                parced.default = 0;
        }else if (line.includes("Forced") || line.includes("Принудительно")){
            if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes")
                parced.forced = 1;
            else
                parced.forced = 0;
        }
    }
    return parced;
}
function parce_text(chunk){
    var parced = new Text();

    var lines = chunk.replaceAll('&nbsp;', ' ').replaceAll('\n', '').split("<br>");
    for (const line of lines) {
        if (line == "Text #1" || line == "Текст #1" || line == "Text" || line == "Текст"){
            parced.isfirst = 1;
            isRussian = true;
            isJapanese = false;
        }else if (line.startsWith("Title") || line.startsWith("Заголовок")){
            parced.title = line.split(" : ")[1];
        }else if (line.startsWith("Format ") || line.startsWith("Формат ")){
            parced.codec = line.split(" : ")[1];
        }else if (line.includes("Count of elements") || line.includes("Число элементов")){
            parced.count = line.split(" : ")[1];
        }else if (line.includes("Language") || line.includes("Язык")){
            parced.language = line.split(" : ")[1];

            switch (parced.language)
            {
                case "Русский":
                case "Russian":
                    if (!isRussian)
                        parced.languageError = 1;
                    break;
                case "Японский":
                case "Japanese":
                    isRussian = false;
                    isJapanese = true;
                    break;
                default:
                    isRussian = false;
                    if (isJapanese)
                        parced.languageError = 1;
                    break;
            }
        }else if (line.includes("Default") || line.includes("По умолчанию")){
            if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes")
                parced.default = 1;
            else
                parced.default = 0;
        }else if (line.includes("Forced") || line.includes("Принудительно")){
            if (line.split(" : ")[1] == "Да" || line.split(" : ")[1] == "Yes")
                parced.forced = 1;
            else
                parced.forced = 0;
        }
    }
    return parced;
}

