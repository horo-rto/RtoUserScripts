// ==UserScript==
// @name         RTO Dubber status highlight
// @namespace    http://tampermonkey.net/
// @version      0.2.3
// @description  Hightlight dubbers with the color
// @author       Horo
// @updateURL    https://raw.githubusercontent.com/horo-rto/RtoUserscripts/refs/heads/main/DubberStatusHighlight.user.js
// @match        https://rutracker.org/forum/viewtopic.php?t=*
// @match        https://rutracker.net/forum/viewtopic.php?t=*
// @match        https://rutracker.nl/forum/viewtopic.php?t=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=rutracker.org
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

var post;
var regex = /<span style="border-radius: 3px; background-color: rgba\([\.,0-9]+\) !important; color: white !important; padding: 1px 3px 0px 3px;">([А-яЁё\-\w\s]*)<\/span>/g;

(function() {
    if(window.location.href.match(/t=\d+/)[0] == "t=3262773")
        return

    if(window.location.href.match(/t=\d+/)[0] == "t=4316777")
        return

    console.log("RTO Dubber status highlight")

    let posts = $('#topic_main > tbody > tr > .td2 > .post_wrap > .post_body');
    post = posts[0];

    var url = "https://rutracker.org/forum/ajax.php";

    var params_qc = "action=view_post&post_id=39845393&mode=text&form_token=" + BB.form_token;
    get_ajax(url, params_qc, qc_handler);

    var params_pro = "action=view_post&post_id=72978725&mode=text&form_token=" + BB.form_token;
    get_ajax(url, params_pro, pro_handler);
})();

function get_ajax(url, params, event_handler) {
    var handler_wrapper = function() {
        if(this.readyState == XMLHttpRequest.DONE && this.status == 200) {
            event_handler.call(this);
        }
    }
    var req = new XMLHttpRequest();
    req.onreadystatechange = handler_wrapper;
    req.open('POST', url, true);
    req.setRequestHeader('content-type', 'application/x-www-form-urlencoded;charset=UTF-8');
    req.send(params);
}

function qc_handler() {
    if (this.status >= 400) {
        console.log('Returned ' + this.status + ': ' + this.responseText);
        return
    }

    var reply = this.responseText;
    var data = JSON.parse(reply);
    var spoiler1 = data.post_text.match(/\[spoiler=\"Зеленый список\"\](.|\n)*?\[\/spoiler\]/gm);
    var spoiler2 = data.post_text.match(/\[spoiler=\"Красно-синий список\"\](.|\n)*?\[\/spoiler\]/gm);

    var green = spoiler1[0].match(/\[color=green\]([А-яЁё\-\w\s]*)\[\/color\]/gm);
    green = green.map(item => item.substring(13, item.length - 8)).sort((a, b) => b.length - a.length);
    handle_array(green, "rgba(0,100,0,0.6)", "Green");

    var blue = spoiler2[0].match(/\[color=blue\]([А-яЁё\-\w\s]*)\[\/color\]/gm);
    blue = blue.map(item => item.substring(12, item.length - 8)).sort((a, b) => b.length - a.length);
    handle_array(blue, "rgba(0,0,200,0.6)", "Blue");

    var red = spoiler2[0].match(/\[color=red\]([А-яЁё\-\w\s]*)\[\/color\]/gm);
    red = red.map(item => item.substring(11, item.length - 8)).sort((a, b) => b.length - a.length);
    handle_array(red, "rgba(200,0,0,0.6)", "Red");
}

function pro_handler() {
    if (this.status >= 400) {
        console.log('Returned ' + this.status + ': ' + this.responseText);
        return
    }

    var reply = this.responseText;
    var data = JSON.parse(reply);
    var spoiler3 = data.post_text.match(/\[spoiler=\"Профессиональные\"\](.|\n)*?\[\/spoiler\]/gm);
    var pro = spoiler3[0].replace(" / ", "[/b][b]").match(/\[b\]([,А-яЁё\-\w\s]*)\[\/b\]/gm);
    pro = pro.map(item => item.substring(3, item.length - 4)).sort((a, b) => b.length - a.length);
    handle_array(pro, "rgba(0,100,0,0.6)", "Pro");
}

function handle_array(arr, color, status) {
    var dump = [];
    arr.forEach(dubber => {
        if(post.innerHTML.toLowerCase().replaceAll(regex, "").match(new RegExp("[^А-яЁёA-z0-9]"+dubber.toLowerCase()+"[^А-яЁёA-z0-9]"))){
            dump.push(dubber);
            var searchMask = dubber.toLowerCase();
            var regEx = new RegExp(searchMask, "igm");
            var replaceMask = '<span style="border-radius: 3px; background-color: ' + color + ' !important; color: white !important; padding: 1px 3px 0px 3px;">' + dubber + '</span>';
            post.innerHTML = post.innerHTML.replaceAll(regEx, replaceMask);
        }
    });
    if (dump.length > 0) console.log(status + " dubbers found: " + dump.join(", "));
}
