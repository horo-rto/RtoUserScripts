// ==UserScript==
// @name         RTO mod extended search
// @namespace    http://tampermonkey.net/
// @version      0.1.1
// @description  extended anime mod links!
// @author       Horo
// @updateURL    https://raw.githubusercontent.com/horo-rto/RtoUserscripts/refs/heads/main/ModExtendedSearch.user.js
// @match        https://rutracker.org/forum/viewtopic.php?t=*
// @match        https://rutracker.net/forum/viewtopic.php?t=*
// @match        https://rutracker.nl/forum/viewtopic.php?t=*
// @match        https://rutracker.org/forum/viewtopic.php?p=*
// @match        https://rutracker.net/forum/viewtopic.php?p=*
// @match        https://rutracker.nl/forum/viewtopic.php?p=*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=rutracker.org
// @grant        none
// ==/UserScript==

(function() {

console.log("RTO mod extended search")

var tags = $('#searchTagItems > ul > li');

function create_button(name, url, text) {
    var button = $("<li>").append(name);
    var replacedUrl = url.replace('%s', text);
    button.wrapInner("<a href='"+replacedUrl+"'>");
    return button[0];
}

for (var i = 0; i < tags.length; i++) {
    var text = tags[i].innerText.slice(0, -2);
    var ul = tags[i].lastChild;

    ul.appendChild(create_button("<hr>", "", text));
    ul.appendChild(create_button("По разделу", "https://rutracker.org/forum/tracker.php?f=1105,1106,1386,1387,1389,1390,1391,1642,2484,2491,2544,404,599,809,893&nm=%s", text));
    ul.appendChild(create_button("world-art", "http://www.world-art.ru/search.php?name=%s&global_sector=animation", text));
    ul.appendChild(create_button("shikimori", "https://shikimori.one/animes?search=%s", text));
    ul.appendChild(create_button("aniDB", "https://anidb.net/search/anime/?adb.search=%s", text));
}

})();
