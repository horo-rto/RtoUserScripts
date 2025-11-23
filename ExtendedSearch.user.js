// ==UserScript==
// @name         RTO Extended Search
// @namespace    http://tampermonkey.net/
// @version      0.1.5
// @description  extended search settings
// @author       Horo
// @updateURL    https://raw.githubusercontent.com/horo-rto/RtoUserscripts/refs/heads/main/ExtendedSearch.user.js
// @match        https://rutracker.org/forum/tracker.php*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=rutracker.org
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

var loaded = 0;
var max_page = 1;
var tr_list = [];
var obj_list = [];
var authors = [];

class Topic{
    constructor(row){
        let title = row.getElementsByClassName('t-title')[0];

        this.id = row.getAttribute('data-topic_id');
        this.img = {
            'src' : row.children[0].children[0].getAttribute('src'),
            'src' : row.children[0]
        };
        this.status = {
            'title' : row.children[1].getAttribute('title'),
            'class' : row.children[1].children[0].getAttribute('class'),
            'symbl' : row.children[1].children[0].innerText,
            'src' : row.children[1]
        };
        this.forum = {
            'name' : row.children[2].children[0].children[0].innerText,
            'link' : row.children[2].children[0].children[0].getAttribute('href'),
            'src' : row.children[2]
        };
        this.title = {
            'name' : title.children[0].innerText,
            'link' : title.children[0].getAttribute('href'),
            'src' : row.children[3]
        };
        this.author = {
            'name' : row.children[4].children[0].children[0].innerText,
            'link' : row.children[4].children[0].children[0].getAttribute('href'),
            'id' : row.children[4].children[0].children[0].getAttribute('href').replace(/\D/g, ""),
            'src' : row.children[4]
        };
        this.size = {
            'value' : row.children[5].innerText,
            'link' : row.children[5].children[0]?.getAttribute('href'),
            'src' : row.children[5]
        };
        this.seed_count = {
            'value' : row.children[6].innerText,
            'src' : row.children[6]
        };
        this.leech_count = {
            'value' : row.children[7].innerText,
            'src' : row.children[7]
        };
        this.download_count = {
            'value' : row.children[8].innerText,
            'src' : row.children[8]
        };
        this.date = {
            'created' : row.children[9].children[0].innerText,
            'updated' : row.children[9].children[1]?.innerText,
            'precize' : row.children[9].getAttribute('data-ts_text'),
            'src' : row.children[9]
        };

        this.src = row;
    }

    draw(){
        let newDom = document.createElement("tr");

        newDom.setAttribute('id', 'trs-tr-'+this.id);
        newDom.className = "tCenter hl-tr";
        newDom.setAttribute('data-topic_id', this.id);
        newDom.setAttribute('role', 'row');

        newDom.append(this.img.src,
            this.status.src,
            this.forum.src,
            this.title.src,
            this.author.src,
            this.size.src,
            this.seed_count.src,
            this.leech_count.src,
            this.download_count.src,
            this.date.src);
        return newDom;
    }
}

(function() {
    console.log("RTO Extended Search");

    if (!(window.location.href.includes("?f=") || window.location.href.includes("&f=")))
        return;

    let count = $('#main_content_wrap > table > tbody > tr > td > .med.bold')[0].innerText.split(' ')[2];
    max_page = Math.ceil(count/50);

    $('#main_content_wrap > table > tbody > tr > td > .small.bold').remove();
    $('#main_content_wrap > .bottom_info').remove();

    for (let i = 1; i < max_page && i < 10; i++){
        let addr = `https://rutracker.org/forum/${BB.PG_BASE_URL}&start=${i*50}`;
        console.log(addr);
        get_ajax(addr, 'GET', 'text/html; charset=Windows-1251', null, page_handler);
    }

    // перенести блок "Показывать только"
    $('.fieldsets')[0].children[0].children[0].children[1].append($('.fieldsets')[0].children[0].children[0].children[2].children[0]);

    // удалить "Будущие закачки"
    $('.fieldsets')[0].children[0].children[0].children[1].children[2].children[1].children[3].remove();

    // изменить длину строки поиска
    $('#title-search')[0].size = 30;

    // перенести блок поиска
    $('.fieldsets')[0].children[0].children[0].children[1].append($('.fieldsets')[0].children[0].children[1].children[0].children[0].children[1]);

    // удалить подзапросы поиска
    $('.fieldsets')[0].children[0].children[0].children[1].children[3].children[1].children[1].children[0].children[5].remove();
    $('.fieldsets')[0].children[0].children[0].children[1].children[3].children[1].children[1].children[0].children[4].remove();
    $('.fieldsets')[0].children[0].children[0].children[1].children[3].children[1].children[1].children[0].children[2].remove();

    // удалить блоки ссылок и автора
    $('.fieldsets')[0].children[0].children[1].children[0].children[0].remove();

    let fieldset = $('<fieldset>', {id: 'author_fieldset', style: 'min-width: 200px; width: 200px; height: 317.8px; scrollbar-color: #888 transparent;'}).appendTo($('.fieldsets')[0].children[0].children[0].children[2]);
    fieldset.append([
        $('<legend>', { html: "Фильтр по автору:" }),
        $('<div>', { class: 'gen', id: 'authors-div', style: 'overflow-y: auto; height: 267px;' }),
        $('<div>', { class: 'gen', }).append([
            $('<input>', { class: 'bold', type: 'submit', style: 'width: 89px;', value: 'Все', click: select_all }),
            $('<input>', { class: 'bold', type: 'submit', style: 'width: 90px;', value: 'Никто', click: select_none }),
        ])
    ]);

    parse_table($('.tablesorter')[0]);
})();

function select_all(){
    event.preventDefault()
    for (const [key, value] of Object.entries(authors)) {
        authors[key].checked = true;
        $('#author'+key).prop( "checked", true );
    }
    GM_setValue("extended_search_settings", JSON.stringify(authors));
    redraw();
}

function select_none(){
    event.preventDefault()
    for (const [key, value] of Object.entries(authors)) {
        authors[key].checked = false;
        $('#author'+key).prop( "checked", false );
    }
    GM_setValue("extended_search_settings", JSON.stringify(authors));
    redraw();
}

function update_authors(){
    for (const [key, value] of Object.entries(authors)) {
        authors[key].checked = $('#author'+key).is(":checked");
    }
    GM_setValue("extended_search_settings", JSON.stringify(authors));
    redraw();
}

function draw_authors() {
    authors = obj_list.map(x => x.author).reduce((acc, { id, name }) => {
        if (!acc[id]) acc[id] = { id, name, checked: true, count: 0 };
        acc[id].count++;
        return acc;
    }, {});

    var cached_settings = GM_getValue("extended_search_settings") ?? null;

    try {
        console.log(cached_settings);
        var parsed = JSON.parse(cached_settings);
        for (const [key, value] of Object.entries(parsed)) {
            if (key in authors){
                authors[key].checked = value.checked;
            }
        }
    } catch (e) {
        console.error(e);
    }

    GM_setValue("extended_search_settings", JSON.stringify(authors));

    for (const author of Object.values(authors).sort((a,b) => b.count - a.count)) {
        $('#authors-div').append(
            $('<p>', { class: "chbox" }).append([
                $('<label>').append([
                    $('<input>', { type: 'checkbox', id: 'author'+author.id, click: update_authors }),
                    author.name + " (" + author.count + ")"
                ])
            ])
        );
        $("#author"+author.id).prop( "checked", author.checked );
    }
}

function redraw() {
    let tablesorter = $('.tablesorter')[0];

    const tB = document.createElement("tbody");
    tablesorter.tBodies[0].remove();
    tablesorter.append(tB);
    for (const element of obj_list){
        if (authors[element.author.id].checked){
            tB.append(element.draw());
        }
    }
}

function parse_table(tablesorter){
    for (const element of tablesorter.children[1].children) {
        tr_list.push(element);
        obj_list.push(new Topic(element));
    }

    loaded++;

    if (loaded == max_page || loaded == 10){
        obj_list = obj_list.sort((a, b) => b.date.precize - a.date.precize);

        draw_authors();
        redraw();
    }
}

function page_handler() {
    if (this.status >= 400) {
        console.error('Returned ' + this.status + ': ' + this.responseText);
        return
    }

    var doc = new DOMParser().parseFromString(this.responseText, "text/html");
    parse_table(doc.getElementsByClassName('tablesorter')[0]);
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
