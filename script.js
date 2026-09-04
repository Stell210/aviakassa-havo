
const CITY_COUNTRIES={"Душанбе, Таджикистан": "Душанбе, Таджикистан", "Москва, Россия": "Москва, Россия", "Казань, Россия": "Казань, Россия", "Санкт-Петербург, Россия": "Санкт-Петербург, Россия", "Екатеринбург, Россия": "Екатеринбург, Россия", "Новосибирск, Россия": "Новосибирск, Россия", "Самара, Россия": "Самара, Россия", "Уфа, Россия": "Уфа, Россия", "Красноярск, Россия": "Красноярск, Россия", "Ростов-на-Дону, Россия": "Ростов-на-Дону, Россия", "Тюмень, Россия": "Тюмень, Россия", "Сургут, Россия": "Сургут, Россия", "Минеральные Воды, Россия": "Минеральные Воды, Россия", "Дубай, ОАЭ": "Дубай, ОАЭ", "Стамбул, Турция": "Стамбул, Турция", "Пекин, Китай": "Пекин, Китай", "Алматы, Казахстан": "Алматы, Казахстан", "Астана, Казахстан": "Астана, Казахстан", "Ташкент, Узбекистан": "Ташкент, Узбекистан", "Самарканд, Узбекистан": "Самарканд, Узбекистан", "Бишкек, Кыргызстан": "Бишкек, Кыргызстан", "Баку, Азербайджан": "Баку, Азербайджан", "Тегеран, Иран": "Тегеран, Иран", "Дели, Индия": "Дели, Индия", "Абу-Даби, ОАЭ": "Абу-Даби, ОАЭ", "Доха, Катар": "Доха, Катар", "Анталья, Турция": "Анталья, Турция", "Тбилиси, Грузия": "Тбилиси, Грузия"};
function normalizeCity(id){
  const el=document.getElementById(id); if(!el) return;
  const raw=el.value.trim();
  if(!raw) return;
  const key=Object.keys(CITY_COUNTRIES).find(k=>k.toLowerCase()===raw.toLowerCase() || k.split(",")[0].trim().toLowerCase()===raw.toLowerCase());
  if(key) el.value=key;
}
["from","to"].forEach(id=>{
  const el=document.getElementById(id);
  if(el){
    el.addEventListener("change",()=>normalizeCity(id));
    el.addEventListener("blur",()=>normalizeCity(id));
    el.addEventListener("input",()=>{const raw=el.value.trim().toLowerCase();const key=Object.keys(CITY_COUNTRIES).find(k=>k.toLowerCase()===raw);if(key)el.value=key;});
  }
});

function saveLocalRequest(data){try{const k="aviakassa_requests_v1";const a=JSON.parse(localStorage.getItem(k)||"[]");a.unshift(data);localStorage.setItem(k,JSON.stringify(a.slice(0,100)));return true}catch(e){return false}}
const translations={
ru:{oneWay:"В одну сторону",roundTrip:"Туда и обратно",returnDateLabel:"Дата возвращения",baggageLabel:"Багаж",bag23:"23 кг + 10 кг ручной клади",bagOnlyHand:"Только ручная кладь",bagAsk:"Уточнить условия",hotEyebrow:"ПОПУЛЯРНЫЕ ЗАПРОСЫ",hotTitle:"Куда часто летают",hotIntro:"Выберите направление — заявка откроется в WhatsApp.",bagEyebrow:"БАГАЖ",bagTitle:"Что взять с собой?",bagText:"Условия багажа зависят от выбранного тарифа. Мы поможем уточнить условия перед оформлением.",checkedBag:"багаж",handBag:"ручная кладь",
navSearch:"Найти билет",navRoutes:"Направления",navHow:"Как это работает",navFaq:"FAQ",navOffers:"Популярные",badge:"🌍 Душанбе → весь мир",
heroTitle:"Летите туда,<br><span>куда мечтаете.</span>",heroText:"Подберём удобный авиарейс, объясним условия и поможем оформить билет.",
findTicket:"Найти билет ✈️",writeWhatsApp:"Написать в WhatsApp",quickRequest:"БЫСТРЫЙ ЗАПРОС",where:"Куда летим?",
formIntro:"Заполните несколько полей — готовый запрос откроется в WhatsApp.",fromLabel:"Откуда",toLabel:"Куда",nameLabel:"Ваше имя",phoneLabel:"Телефон / WhatsApp",cityHint:"Выберите город — страна добавится автоматически",dateLabel:"Дата",passengerLabel:"Пассажиры",getOptions:"Получить варианты",
priceNote:"💙 Цена и наличие мест уточняются индивидуально перед оформлением.",popular:"ПОПУЛЯРНЫЕ НАПРАВЛЕНИЯ",chooseCity:"Выберите город",routeIntro:"Нажмите на направление — и отправьте запрос менеджеру.",
whyUs:"ПОЧЕМУ МЫ",simple:"Всё проще, чем кажется",b1t:"Подбор билета",b1p:"Поможем найти подходящий вариант по вашему маршруту и дате.",b2t:"Быстрая связь",b2p:"Задайте вопрос в WhatsApp или Direct и получите консультацию.",b3t:"Условия поездки",b3p:"Поможем разобраться с багажом, ручной кладью и условиями рейса.",
threeSteps:"3 ПРОСТЫХ ШАГА",fromMsg:"От сообщения до путешествия",s1t:"Отправьте маршрут",s1p:"Город вылета, город прилёта и дату.",s2t:"Выберите вариант",s2p:"Мы поможем сравнить подходящие рейсы.",s3t:"Путешествуйте",s3p:"Получите оформленный билет и готовьтесь к поездке.",
ready:"Готовы к следующему путешествию?",location:"Душанбе, Таджикистан · Direct / WhatsApp",phone:"📲 +992753582002",motto:"💙 Ваше путешествие — наша ответственность.",footerLoc:"Душанбе · Таджикистан",socialEyebrow:"МЫ В INSTAGRAM",socialTitle:"Следите за новыми рейсами",socialText:"Актуальные направления, полезные советы и предложения для путешествий.",socialButton:"Открыть Instagram",miniEyebrow:"ВСЁ ПРОСТО",miniTitle:"Как получить билет",mini1Title:"Заполните запрос",mini1Text:"Укажите маршрут, дату и пассажиров.",mini2Title:"Получите варианты",mini2Text:"Нажмите кнопку и отправьте заявку в WhatsApp.",mini3Title:"Выберите рейс",mini3Text:"Менеджер поможет сравнить подходящие варианты.",faqEyebrow:"ЧАСТЫЕ ВОПРОСЫ",faqTitle:"Есть вопросы?",faqIntro:"Здесь собрали самые частые вопросы клиентов.",
faq1q:"Как заказать авиабилет?",faq1a:"Заполните маршрут и дату на сайте и нажмите «Получить варианты». Заявка откроется в WhatsApp.",
faq2q:"Можно ли подобрать билет с багажом?",faq2a:"Да. Напишите менеджеру, какой багаж вам нужен, и мы подберём подходящие варианты.",
faq3q:"Можно ли купить билет для другого человека?",faq3a:"Да. Менеджер подскажет, какие данные пассажира нужны для оформления.",
faq4q:"Почему лучше покупать заранее?",faq4a:"Стоимость и наличие мест могут меняться. Поэтому лучше подобрать билет заранее.",
earlyEyebrow:"СОВЕТ ПУТЕШЕСТВЕННИКУ",earlyTitle:"Покупайте билеты заранее",earlyText:"Чем раньше вы начнёте искать подходящий рейс, тем больше вариантов можно сравнить. Не откладывайте поездку на последний момент.",earlyButton:"Подобрать билет",
cities:["Москва","Санкт-Петербург","Дубай","Стамбул"],routes:["Душанбе → Москва","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Стамбул"]
},
tj:{oneWay:"Ба як тараф",roundTrip:"Рафту баргашт",returnDateLabel:"Санаи бозгашт",baggageLabel:"Бағоҷ",bag23:"23 кг + 10 кг бағоҷи дастӣ",bagOnlyHand:"Танҳо бағоҷи дастӣ",bagAsk:"Шартҳоро пурсидан",hotEyebrow:"САФАРҲОИ МАШҲУР",hotTitle:"Ба куҷо бисёр парвоз мекунанд",hotIntro:"Самтро интихоб кунед — дархост дар WhatsApp кушода мешавад.",bagEyebrow:"БАҒОҶ",bagTitle:"Чиро бо худ гирифтан?",bagText:"Шартҳои бағоҷ аз тарифи интихобшуда вобастаанд. Пеш аз расмӣ кардан мо шартҳоро мефаҳмонем.",checkedBag:"бағоҷ",handBag:"бағоҷи дастӣ",
navSearch:"Чипта ёфтан",navRoutes:"Самтҳо",navHow:"Чӣ тавр кор мекунад",badge:"🌍 Душанбе → тамоми ҷаҳон",
heroTitle:"Ба он ҷое парвоз кунед,<br><span>ки орзу доред.</span>",heroText:"Мо барои шумо парвози мувофиқро меёбем, шартҳоро мефаҳмонем ва дар гирифтани чипта кӯмак мекунем.",
findTicket:"Чипта ёфтан ✈️",writeWhatsApp:"Ба WhatsApp нависед",quickRequest:"ДАРХОСТИ ЗУД",where:"Ба куҷо парвоз мекунем?",
formIntro:"Чанд майдонро пур кунед — дархости омода дар WhatsApp кушода мешавад.",fromLabel:"Аз куҷо",toLabel:"Ба куҷо",nameLabel:"Номи шумо",phoneLabel:"Телефон / WhatsApp",cityHint:"Шаҳрро интихоб кунед — кишвар худкор илова мешавад",dateLabel:"Сана",passengerLabel:"Мусофирон",getOptions:"Гирифтани вариантҳо",
priceNote:"💙 Нарх ва ҷойҳои дастрас пеш аз расмӣ кардани чипта алоҳида тасдиқ карда мешаванд.",popular:"САМТҲОИ МАШҲУР",chooseCity:"Шаҳрро интихоб кунед",routeIntro:"Ба самт пахш кунед ва дархостро ба менеҷер фиристед.",
whyUs:"ЧАРО МО",simple:"Ҳама чиз осонтар аз он аст",b1t:"Интихоби чипта",b1p:"Мо барои масир ва санаи шумо варианти мувофиқро меёбем.",b2t:"Алоқаи зуд",b2p:"Ба WhatsApp ё Direct савол диҳед ва машварат гиред.",b3t:"Шартҳои сафар",b3p:"Мо дар масъалаи бағоҷ, борҳои дастӣ ва шартҳои парвоз кӯмак мекунем.",
threeSteps:"3 ҚАДАМИ ОСОН",fromMsg:"Аз паём то сафар",s1t:"Масирро фиристед",s1p:"Шаҳри парвоз, шаҳри расидан ва санаро нависед.",s2t:"Вариантро интихоб кунед",s2p:"Мо барои муқоиса кардани парвозҳои мувофиқ кӯмак мекунем.",s3t:"Сафар кунед",s3p:"Чиптаи худро гиред ва ба сафар омода шавед.",
ready:"Ба сафари навбатӣ омодаед?",location:"Душанбе, Тоҷикистон · Direct / WhatsApp",phone:"📲 +992753582002",motto:"💙 Сафари шумо — масъулияти мост.",footerLoc:"Душанбе · Тоҷикистон",socialEyebrow:"МО ДАР INSTAGRAM",socialTitle:"Аз парвозҳои нав бохабар бошед",socialText:"Самтҳои нав, маслиҳатҳои муфид ва пешниҳодҳо барои сафар.",socialButton:"Instagram-ро кушоед",miniEyebrow:"ХЕЛЕ ОСОН",miniTitle:"Чӣ тавр чипта гирифтан",mini1Title:"Дархостро пур кунед",mini1Text:"Масир, сана ва шумораи мусофиронро нишон диҳед.",mini2Title:"Вариантҳоро гиред",mini2Text:"Тугмаро пахш карда дархостро ба WhatsApp фиристед.",mini3Title:"Парвозро интихоб кунед",mini3Text:"Менеҷер барои муқоисаи вариантҳо кӯмак мекунад.",faqEyebrow:"САВОЛҲОИ МАШҲУР",faqTitle:"Савол доред?",faqIntro:"Дар ин ҷо саволҳои маъмултарини муштариёнро ҷамъ кардем.",
faq1q:"Чӣ тавр чипта фармоиш додан мумкин аст?",faq1a:"Масир ва санаро пур кунед ва «Гирифтани вариантҳо»-ро пахш кунед. Дархост дар WhatsApp кушода мешавад.",
faq2q:"Оё чипта бо бағоҷ интихоб кардан мумкин аст?",faq2a:"Бале. Ба менеҷер нависед, ки чӣ гуна бағоҷ лозим аст ва мо вариантҳои мувофиқро меёбем.",
faq3q:"Оё барои шахси дигар чипта харидан мумкин аст?",faq3a:"Бале. Менеҷер маълумоти заруриро барои расмӣ кардани чипта мегӯяд.",
faq4q:"Чаро чиптаро пешакӣ харидан беҳтар аст?",faq4a:"Нарх ва ҷойҳои дастрас метавонанд тағйир ёбанд. Беҳтар аст чиптаро пешакӣ интихоб кунед.",
earlyEyebrow:"МАСЛИҲАТИ САФАР",earlyTitle:"Чиптаро пешакӣ харед",earlyText:"Ҳар қадар барвақт ҷустуҷӯ кунед, ҳамон қадар вариантҳои бештарро муқоиса карда метавонед.",earlyButton:"Интихоби чипта",
cities:["Москва","Санкт-Петербург","Дубай","Истанбул"],routes:["Душанбе → Москва","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Истанбул"]
},
en:{oneWay:"One way",roundTrip:"Round trip",returnDateLabel:"Return date",baggageLabel:"Baggage",bag23:"23 kg + 10 kg hand luggage",bagOnlyHand:"Hand luggage only",bagAsk:"Ask about baggage",hotEyebrow:"POPULAR REQUESTS",hotTitle:"Popular destinations",hotIntro:"Choose a destination — the request will open in WhatsApp.",bagEyebrow:"BAGGAGE",bagTitle:"What can I take?",bagText:"Baggage conditions depend on the selected fare. We will help confirm the conditions before booking.",checkedBag:"checked baggage",handBag:"hand luggage",
navSearch:"Find a ticket",navRoutes:"Destinations",navHow:"How it works",badge:"🌍 Dushanbe → the world",
heroTitle:"Fly where<br><span>you dream of going.</span>",heroText:"We help you find a convenient flight, explain the conditions, and arrange your ticket.",
findTicket:"Find a ticket ✈️",writeWhatsApp:"Message on WhatsApp",quickRequest:"QUICK REQUEST",where:"Where are you flying?",
formIntro:"Fill in a few fields — your request will open in WhatsApp.",fromLabel:"From",toLabel:"To",nameLabel:"Your name",phoneLabel:"Phone / WhatsApp",cityHint:"Choose a city — the country will be added automatically",dateLabel:"Date",passengerLabel:"Passengers",getOptions:"Get options",
priceNote:"💙 Price and seat availability are confirmed individually before booking.",popular:"POPULAR DESTINATIONS",chooseCity:"Choose a city",routeIntro:"Tap a destination to send a request to our manager.",
whyUs:"WHY US",simple:"Travel made simple",b1t:"Ticket selection",b1p:"We help find a suitable option for your route and date.",b2t:"Fast support",b2p:"Ask a question on WhatsApp or Direct and get assistance.",b3t:"Travel conditions",b3p:"We help you understand baggage, carry-on and flight conditions.",
threeSteps:"3 SIMPLE STEPS",fromMsg:"From message to journey",s1t:"Send your route",s1p:"Tell us your departure city, destination and date.",s2t:"Choose an option",s2p:"We help you compare suitable flights.",s3t:"Travel",s3p:"Receive your ticket and get ready for your trip.",
ready:"Ready for your next journey?",location:"Dushanbe, Tajikistan · Direct / WhatsApp",phone:"📲 +992753582002",motto:"💙 Your journey is our responsibility.",footerLoc:"Dushanbe · Tajikistan",socialEyebrow:"WE ARE ON INSTAGRAM",socialTitle:"Follow new flight updates",socialText:"New destinations, useful travel tips and offers.",socialButton:"Open Instagram",miniEyebrow:"IT'S EASY",miniTitle:"How to get a ticket",mini1Title:"Fill in your request",mini1Text:"Enter your route, date and passengers.",mini2Title:"Get options",mini2Text:"Press the button and send your request in WhatsApp.",mini3Title:"Choose a flight",mini3Text:"Our manager will help compare suitable options.",faqEyebrow:"FREQUENTLY ASKED QUESTIONS",faqTitle:"Have questions?",faqIntro:"Here are answers to common customer questions.",
faq1q:"How do I book a flight?",faq1a:"Fill in your route and date and click “Get options”. Your request will open in WhatsApp.",
faq2q:"Can I choose a ticket with baggage?",faq2a:"Yes. Tell our manager what baggage you need and we will help find suitable options.",
faq3q:"Can I buy a ticket for someone else?",faq3a:"Yes. Our manager will tell you which passenger details are needed.",
faq4q:"Why is it better to buy in advance?",faq4a:"Prices and seat availability can change. It is better to choose your ticket in advance.",
earlyEyebrow:"TRAVEL TIP",earlyTitle:"Buy your ticket in advance",earlyText:"The earlier you search, the more options you can compare. Don’t leave your trip until the last minute.",earlyButton:"Find a ticket",
cities:["Moscow","Saint Petersburg","Dubai","Istanbul"],routes:["Dushanbe → Moscow","Dushanbe → Saint Petersburg","Dushanbe → Dubai","Dushanbe → Istanbul"]
}};
let lang=localStorage.getItem("aviakassa_lang")||"ru";
const extraTranslations={
ru:{namePlaceholder:"Имя",phonePlaceholder:"+992...",toPlaceholder:"Москва",requestSaving:"Сохраняем заявку…",requestAccepted:"Заявка принята. Открываем WhatsApp…",whatsAppGreeting:"Здравствуйте! Хочу подобрать авиабилет.",offerAction:"Узнать варианты →",flightAction:"Узнать / оформить в WhatsApp",until:"До",noFlights:"Сейчас нет опубликованных рейсов. Следите за обновлениями.",noOffers:"Сейчас нет активных акций.",noDirections:"Сейчас нет опубликованных направлений.",citiesAll:["Душанбе, Таджикистан","Москва, Россия","Казань, Россия","Санкт-Петербург, Россия","Дубай, ОАЭ","Стамбул, Турция"],cityNames:["Москва","Санкт-Петербург","Дубай","Стамбул"],routeNames:["Душанбе → Москва","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Стамбул"]},
tj:{namePlaceholder:"Ном",phonePlaceholder:"+992...",toPlaceholder:"Москва",requestSaving:"Дархостро нигоҳ медорем…",requestAccepted:"Дархост қабул шуд. WhatsApp кушода мешавад…",whatsAppGreeting:"Салом! Ман мехоҳам чиптаи ҳавопаймо интихоб кунам.",offerAction:"Вариантҳоро дидан →",flightAction:"Пурсидан / фармоиш дар WhatsApp",until:"То",noFlights:"Ҳоло парвози нашршуда нест. Навсозиҳоро пайгирӣ кунед.",noOffers:"Ҳоло аксияи фаъол нест.",noDirections:"Ҳоло самти нашршуда нест.",citiesAll:["Душанбе, Тоҷикистон","Москва, Россия","Қазон, Россия","Санкт-Петербург, Россия","Дубай, АМА","Истанбул, Туркия"],cityNames:["Москва","Санкт-Петербург","Дубай","Истанбул"],routeNames:["Душанбе → Москва","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Истанбул"]},
en:{namePlaceholder:"Name",phonePlaceholder:"+992...",toPlaceholder:"Moscow",requestSaving:"Saving your request…",requestAccepted:"Request received. Opening WhatsApp…",whatsAppGreeting:"Hello! I would like to find a flight.",offerAction:"See options →",flightAction:"Ask / book via WhatsApp",until:"Until",noFlights:"There are no published flights yet. Follow updates.",noOffers:"There are no active offers.",noDirections:"There are no published destinations.",citiesAll:["Dushanbe, Tajikistan","Moscow, Russia","Kazan, Russia","Saint Petersburg, Russia","Dubai, UAE","Istanbul, Turkey"],cityNames:["Moscow","Saint Petersburg","Dubai","Istanbul"],routeNames:["Dushanbe → Moscow","Dushanbe → Saint Petersburg","Dushanbe → Dubai","Dushanbe → Istanbul"]}
};

function updateCityList(l){
 const x=extraTranslations[l]||extraTranslations.ru;
 const dl=document.getElementById("cities");
 if(dl) dl.innerHTML=x.citiesAll.map(v=>`<option value="${v}">`).join("\n");
}

function setLang(l){
 lang=l; localStorage.setItem("aviakassa_lang",l); document.documentElement.lang=l;
 const t=translations[l]||translations.ru, x=extraTranslations[l]||extraTranslations.ru;
 document.querySelectorAll("[data-i18n]").forEach(el=>{const k=el.dataset.i18n;if(t[k]!==undefined)el.textContent=t[k]});
 document.querySelectorAll("[data-i18n-html]").forEach(el=>{const k=el.dataset.i18nHtml;if(t[k]!==undefined)el.innerHTML=t[k]});
 document.querySelectorAll("[data-i18n-placeholder]").forEach(el=>{const k=el.dataset.i18nPlaceholder;if(x[k]!==undefined)el.placeholder=x[k]});
 document.querySelectorAll("[data-lang]").forEach(b=>b.classList.toggle("active",b.dataset.lang===l));
 updateCityList(l);
 const from=document.getElementById("from"); if(from) from.value=l==="ru"?"Душанбе, Таджикистан":l==="tj"?"Душанбе, Тоҷикистон":"Dushanbe, Tajikistan";
 const to=document.getElementById("to"); if(to) to.placeholder=x.toPlaceholder;
 const hint=document.getElementById("cityHint"); if(hint) hint.textContent=t.cityHint||"";
 document.querySelectorAll(".route").forEach((r,i)=>{if(r.querySelector(".city"))r.querySelector(".city").textContent=(t.cities||x.cityNames)[i];if(r.querySelector(".routeText"))r.querySelector(".routeText").textContent=(t.routes||x.routeNames)[i];});
 const offerCities=l==="en"?["Dushanbe → Moscow","Dushanbe → Kazan","Dushanbe → Saint Petersburg","Dushanbe → Dubai","Dushanbe → Istanbul"]:l==="tj"?["Душанбе → Москва","Душанбе → Қазон","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Истанбул"]:["Душанбе → Москва","Душанбе → Казань","Душанбе → Санкт-Петербург","Душанбе → Дубай","Душанбе → Стамбул"];
 document.querySelectorAll("[data-offer-city]").forEach((el,i)=>el.textContent=offerCities[i]||"");
 document.querySelectorAll("[data-offer-action]").forEach(el=>el.textContent=x.offerAction);
 const base=l==="en"?"Hello! I’m interested in a flight from Dushanbe to ":l==="tj"?"Салом! Ман ба парвоз аз Душанбе ба ":"Здравствуйте! Интересует рейс Душанбе → ";
 const offerCitiesForMsg=l==="en"?["Moscow","Kazan","Saint Petersburg","Dubai","Istanbul"]:l==="tj"?["Москва","Қазон","Санкт-Петербург","Дубай","Истанбул"]:["Москва","Казань","Санкт-Петербург","Дубай","Стамбул"];
 document.querySelectorAll(".offer").forEach((a,i)=>a.href="https://wa.me/992753582002?text="+encodeURIComponent((x.whatsAppGreeting)+"\n"+base.replace(/: $/,"")+offerCitiesForMsg[i]+"."));
 document.querySelectorAll(".route").forEach((r,i)=>r.href="https://wa.me/992753582002?text="+encodeURIComponent(base+(t.cities||x.cityNames)[i]+"."));
 const write=document.querySelector('[data-i18n="writeWhatsApp"]'); if(write) write.href="https://wa.me/992753582002?text="+encodeURIComponent(x.whatsAppGreeting);
 const floating=document.querySelector(".floating-wa"); if(floating) floating.href="https://wa.me/992753582002?text="+encodeURIComponent(x.whatsAppGreeting);
}



// ===== Functional controls / language / request form =====
(function(){
  function $(id){ return document.getElementById(id); }

  function wireLanguageButtons(){
    document.querySelectorAll("[data-lang]").forEach(function(btn){
      btn.addEventListener("click",function(e){
        e.preventDefault();
        e.stopPropagation();
        setLang(btn.dataset.lang);
      });
    });
  }

  function wireTripButtons(){
    const wrap=$("returnDateWrap");
    const ret=$("returnDate");
    document.querySelectorAll(".trip-btn").forEach(function(btn){
      btn.addEventListener("click",function(e){
        e.preventDefault();
        document.querySelectorAll(".trip-btn").forEach(b=>b.classList.remove("active"));
        btn.classList.add("active");
        const isRound=btn.dataset.trip==="round";
        if(wrap) wrap.classList.toggle("hidden-field",!isRound);
        if(ret) ret.required=isRound;
        if(isRound && $("date") && ret && $("date").value) ret.min=$("date").value;
      });
    });
  }

  function wireDates(){
    const d=$("date"), r=$("returnDate");
    if(!d) return;
    const today=new Date();
    const iso=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
    d.min=iso;
    d.addEventListener("change",function(){
      if(r) {
        r.min=d.value||iso;
        if(r.value && d.value && r.value<d.value) r.value="";
      }
    });
    if(r) r.addEventListener("change",function(){
      if(d.value && r.value && r.value<d.value) r.value="";
    });
  }

  function wireCities(){
    ["from","to"].forEach(function(id){
      const el=$(id); if(!el)return;
      ["change","blur"].forEach(ev=>el.addEventListener(ev,()=>normalizeCity(id)));
    });
  }

  function escHtml(v){return String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[m]));}
  function money(v,currency){
    const raw=String(v??"").trim();
    if(!raw) return "—";
    const n=Number(raw.replace(/\s/g,""));
    if(!Number.isFinite(n)) return escHtml(raw);
    return new Intl.NumberFormat("ru-RU",{maximumFractionDigits:0}).format(n)+(currency?" "+escHtml(currency):"");
  }
  function publicEmpty(text){return `<div class="public-empty">${escHtml(text)}</div>`;}
  function waUrl(text){return "https://wa.me/992753582002?text="+encodeURIComponent(text);}
  function flagForCountry(country){
    const map={"Россия":"🇷🇺","Таджикистан":"🇹🇯","ОАЭ":"🇦🇪","Турция":"🇹🇷","Китай":"🇨🇳","Казахстан":"🇰🇿","Узбекистан":"🇺🇿","Кыргызстан":"🇰🇬","Азербайджан":"🇦🇿","Катар":"🇶🇦","Грузия":"🇬🇪","Иран":"🇮🇷","Индия":"🇮🇳","Саудовская Аравия":"🇸🇦","Оман":"🇴🇲","Бахрейн":"🇧🇭","Кувейт":"🇰🇼","Малайзия":"🇲🇾","Сингапур":"🇸🇬","Индонезия":"🇮🇩","Южная Корея":"🇰🇷","Япония":"🇯🇵","Филиппины":"🇵🇭","Вьетнам":"🇻🇳","Израиль":"🇮🇱","Египет":"🇪🇬","Марокко":"🇲🇦","Кения":"🇰🇪","ЮАР":"🇿🇦","Великобритания":"🇬🇧","Франция":"🇫🇷","Германия":"🇩🇪","Италия":"🇮🇹","Испания":"🇪🇸","Нидерланды":"🇳🇱","Австрия":"🇦🇹","Чехия":"🇨🇿","Польша":"🇵🇱","Греция":"🇬🇷","США":"🇺🇸","Канада":"🇨🇦","Мексика":"🇲🇽","Бразилия":"🇧🇷","Аргентина":"🇦🇷","Австралия":"🇦🇺","Новая Зеландия":"🇳🇿","Молдова":"🇲🇩","Армения":"🇦🇲"};
    return map[country]||"🌍";
  }
  function formatDate(v){
    if(!v)return "";
    const d=new Date(String(v).slice(0,10)+"T00:00:00");
    if(Number.isNaN(d.getTime()))return escHtml(v);
    return d.toLocaleDateString(lang==="en"?"en-GB":lang==="tj"?"tg-TJ":"ru-RU",{day:"2-digit",month:"long",year:"numeric"});
  }
  async function loadPublicContent(){
    try{
      const [fr,or,dr]=await Promise.all([fetch("/api/flights"),fetch("/api/offers"),fetch("/api/directions")]);
      if(fr.ok){const data=await fr.json(); renderPublicFlights(data.flights||[]);}
      if(or.ok){const data=await or.json(); renderPublicOffers(data.offers||[]);}
      if(dr.ok){const data=await dr.json(); renderPublicDirections(data.directions||[]);}
    }catch(e){console.warn("Public content load failed",e);}
  }
  function renderPublicFlights(items){
    const box=$("publicFlights"); if(!box)return;
    if(!items.length){box.innerHTML=publicEmpty((extraTranslations[lang]||extraTranslations.ru).noFlights);return;}
    box.innerHTML=items.map(x=>{
      const msg=`Здравствуйте! Хочу узнать подробнее о рейсе ${x.from_city} → ${x.to_city}, ${x.flight_date}, ${x.flight_time}.`;
      return `<article class="flight-card"><div class="flight-route"><span>${flagForCountry(x.from_country)} ${escHtml(x.from_city)}${x.from_airport?", "+escHtml(x.from_airport):""}${x.from_airport_code?" ("+escHtml(x.from_airport_code)+")":""}</span><span>→</span><span>${flagForCountry(x.to_country)} ${escHtml(x.to_city)}${x.to_airport?", "+escHtml(x.to_airport):""}${x.to_airport_code?" ("+escHtml(x.to_airport_code)+")":""}</span></div><div class="flight-meta"><span>📅 ${formatDate(x.flight_date)}</span><span>🕐 ${escHtml(x.flight_time)}</span><span>✈️ ${escHtml(x.airline)}</span><span>🧳 ${escHtml(x.baggage)}</span></div><div class="flight-price">${money(x.price,x.currency)}</div><div class="flight-actions"><a class="primary" href="${waUrl(msg)}" target="_blank" rel="noopener">${escHtml((extraTranslations[lang]||extraTranslations.ru).flightAction)}</a><button class="secondary" data-flight-detail="${x.id}">Подробнее</button></div></article>`;
    }).join("");
  }
  function renderPublicOffers(items){
    const box=$("publicOffers"); if(!box)return;
    if(!items.length){box.innerHTML=publicEmpty((extraTranslations[lang]||extraTranslations.ru).noOffers);return;}
    box.innerHTML=items.map(x=>{const msg=`Здравствуйте! Хочу узнать подробнее об акции: ${x.title}.`;return `<article class="offer public-offer"><span>🔥</span><b>${escHtml(x.title)}</b>${x.discount?`<span class="offer-discount">${escHtml(x.discount)}</span>`:""}${x.description?`<div class="offer-description">${escHtml(x.description)}</div>`:""}${x.valid_until?`<small>${escHtml((extraTranslations[lang]||extraTranslations.ru).until)} ${formatDate(x.valid_until)}</small>`:""}<a class="primary" href="${waUrl(msg)}" target="_blank" rel="noopener">${escHtml((extraTranslations[lang]||extraTranslations.ru).offerAction)}</a></article>`}).join("");
  }
  function renderPublicDirections(items){
    const box=$("publicDirections"); if(!box)return;
    if(!items.length){box.innerHTML=publicEmpty((extraTranslations[lang]||extraTranslations.ru).noDirections);return;}
    box.innerHTML=items.map(x=>{const msg=`Здравствуйте! Хочу узнать о билетах Душанбе → ${x.city}.`;return `<a class="route" href="${waUrl(msg)}" target="_blank" rel="noopener"><b>${flagForCountry(x.country)} <span class="city">${escHtml(x.city)}</span></b><span class="routeText">Душанбе → ${escHtml(x.city)}</span>${x.code?`<span class="route-code">${escHtml(x.code)} · ${escHtml(x.country)}</span>`:`<span class="route-code">${escHtml(x.country)}</span>`}<i>→</i></a>`}).join("");
  }

  async function submitRequest(e){
    e.preventDefault();
    const name=$("clientName")?.value.trim(), phone=$("clientPhone")?.value.trim();
    const from=$("from")?.value.trim(), to=$("to")?.value.trim(), date=$("date")?.value;
    const ret=$("returnDate")?.value||"", passengers=$("passengers")?.value||"1";
    const baggage=$("baggage")?.value||"";
    const round=document.querySelector(".trip-btn.active")?.dataset.trip==="round";
    if(!name||!phone||!from||!to||!date||(round&&!ret)) {
      $("ticketForm")?.reportValidity(); return;
    }
    normalizeCity("from"); normalizeCity("to");
    const payload={name,phone,from:$("from").value.trim(),to:$("to").value.trim(),date,returnDate:round?ret:"",passengers,baggage};
    const status=$("requestStatus"), t=translations[lang]||translations.ru, x=extraTranslations[lang]||extraTranslations.ru;
    if(status) status.textContent=x.requestSaving||"Saving…";
    let code="REQ-"+Date.now().toString(36).toUpperCase();
    try{
      const r=await fetch("/api/bookings",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const data=await r.json();
      if(!r.ok||!data.ok) throw new Error(data.error||"API_ERROR");
      code=data.requestCode||code;
    }catch(err){
      saveLocalRequest({...payload,id:code,createdAt:new Date().toISOString(),status:"new"});
    }
    if(status) status.textContent=x.requestAccepted||"Request received.";
    const greeting=x.whatsAppGreeting||"Hello!";
    let msg=greeting+"\n\n"+"Имя: "+name+"\n"+"Телефон: "+phone+"\n"+"Откуда: "+from+"\n"+"Куда: "+to+"\n"+"Дата вылета: "+date+"\n";
    if(round) msg+="Дата возвращения: "+ret+"\n";
    msg+="Пассажиры: "+passengers+"\n"+"Багаж: "+baggage+"\n"+"Номер заявки: "+code;
    window.open("https://wa.me/992753582002?text="+encodeURIComponent(msg),"_blank","noopener");
  }

  function init(){
    wireLanguageButtons();
    wireTripButtons();
    wireDates();
    wireCities();
    const form=$("ticketForm");
    if(form) form.addEventListener("submit",submitRequest);
    const y=$("year"); if(y)y.textContent=new Date().getFullYear();
    // Apply the saved language after all handlers are installed.
    setLang(lang);
    loadPublicContent();
    // Keep the current language active visually.
    document.querySelectorAll("[data-lang]").forEach(b=>b.classList.toggle("active",b.dataset.lang===lang));
  }
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",init);
  else init();

(function(){
 const ss=document.getElementById("smartSearch"); if(!ss)return;
 const box=document.getElementById("searchResults"), section=document.getElementById("flightSearchResults");
 const money2=v=>{const n=Number(v);return Number.isFinite(n)?new Intl.NumberFormat("ru-RU").format(n):String(v||"")};
 const fmtTime=v=>{try{return new Intl.DateTimeFormat("ru-RU",{hour:"2-digit",minute:"2-digit"}).format(new Date(v))}catch{return ""}};
 const fmtDate=v=>{try{return new Intl.DateTimeFormat("ru-RU",{day:"2-digit",month:"2-digit",year:"numeric"}).format(new Date(v))}catch{return String(v||"")}};
 const fmtDuration=m=>{m=Number(m||0);if(!m)return "";const h=Math.floor(m/60),mm=m%60;return h?`${h}ч ${mm}м`:`${mm}м`};
 async function run(){
   const from=document.getElementById("sfFrom")?.value.trim(), to=document.getElementById("sfTo")?.value.trim(), date=document.getElementById("sfDate")?.value;
   if(!from||!to||!date){box.innerHTML=publicEmpty("Укажите город вылета, город прилёта и дату");section.hidden=false;return;}
   const p=new URLSearchParams({from,to,date,direct:"true",currency:"rub"});
   section.hidden=false;box.innerHTML=publicEmpty("Ищем актуальные предложения…");
   try{
     const r=await fetch("/api/live-search-flights?"+p.toString());
     const d=await r.json();
     if(!r.ok||!d.ok) throw new Error(d.message||d.error||"API_ERROR");
     let a=d.flights||[];
     const sort=document.getElementById("sfSort")?.value||"price";
     if(sort==="time")a.sort((x,y)=>String(x.departure_at).localeCompare(String(y.departure_at)));
     else a.sort((x,y)=>Number(x.price)-Number(y.price));
     box.innerHTML=a.length?a.map(x=>{
       const direct=Number(x.transfers||0)===0;
       const fromCode=x.from_airport_code||x.from_iata||"";
       const toCode=x.to_airport_code||x.to_iata||"";
       return `<article class="flight-card">
         <div class="flight-route"><span>${escHtml(fromCode)}</span><span>→</span><span>${escHtml(toCode)}</span></div>
         <div class="flight-meta">
           <span>📅 ${escHtml(fmtDate(x.departure_at))}</span>
           <span>🕐 ${escHtml(fmtTime(x.departure_at))}</span>
           <span>✈️ ${escHtml(x.airline||"")}${x.flight_number?" "+escHtml(x.flight_number):""}</span>
           <span>${direct?"Прямой":"С пересадкой"}${x.duration_to?" · "+escHtml(fmtDuration(x.duration_to)):""}</span>
           <span>🎒 Ручная кладь: ${escHtml(x.hand_baggage||"Уточняется")}</span>
           <span>🧳 Багаж: ${escHtml(x.baggage||"Уточняется")}</span>
         </div>
         <div class="flight-price">${money2(x.price)} ₽</div>
         <div class="flight-source">Цена источника: ${money2(x.source_price)} ₽ · Aviakassa_havo: +500 ₽</div>
       </article>`;
     }).join(""):publicEmpty("На эту дату актуальных предложений не найдено");
   }catch(e){box.innerHTML=publicEmpty("Не удалось получить актуальные предложения. Проверьте настройки Aviasales Data API.");}
 }
 ss.addEventListener("submit",e=>{e.preventDefault();run()});
})();
})();
